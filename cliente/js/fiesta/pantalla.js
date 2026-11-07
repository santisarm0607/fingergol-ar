/* ============================================================
   PANTALLA (computador o TV): muestra el QR, recibe a los dos
   celulares y les asigna un lado (Azul / Rojo).
   Parte 1: solo conexión. De fondo se ve un partido de muestra.
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const { $ } = FG.util;

  const LATIDO_MS = 1000;   // cada cuánto se manda "ping"
  const PERDIDO_MS = 6000;  // sin respuesta este tiempo = celular desconectado

  const Pantalla = {
    peer: null,
    codigo: null,
    // un puesto por lado: { conn, token, visto }
    puestos: [null, null],

    iniciar() {
      this.renderer = new FG.Render3D($('#lienzo'));
      this.crearFondo();
      $('#btn-reintentar').addEventListener('click', () => this.abrirSala());
      $('#btn-pantalla').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
      });
      setInterval(() => this.latido(), LATIDO_MS);
      this.abrirSala();
      this.pintarPuestos();
      let antes = performance.now();
      const bucle = (ahora) => {
        const dt = Math.min(0.05, (ahora - antes) / 1000);
        antes = ahora;
        this.bucleFondo(dt);
        requestAnimationFrame(bucle);
      };
      requestAnimationFrame(bucle);
    },

    /* ---------- sala ---------- */
    abrirSala(intentos = 0) {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) { /* nada */ }
      }
      this.estado('Creando la sala…');
      $('#error-sala').classList.add('oculto');
      this.codigo = FG.fiesta.nuevoCodigo();
      if (C.MODO_DEMO) return this.salaDemo();
      let peer;
      try {
        peer = FG.fiesta.crearPeer(FG.fiesta.PREFIJO + this.codigo);
      } catch (e) {
        return this.error('No se pudo cargar PeerJS (la librería de conexión).');
      }
      this.peer = peer;

      peer.on('open', () => {
        const url = FG.fiesta.urlControl(this.codigo);
        $('#codigo-sala').textContent = this.codigo;
        $('#url-sala').textContent = url.replace(/^https?:\/\//, '');
        FG.fiesta.dibujarQR($('#qr'), url, 300);
        $('#qr-caja').classList.remove('cargando');
        this.estado('Escanea el QR con la cámara de tu celular');
      });

      peer.on('connection', (conn) => this.nuevaConexion(conn));

      // si se cae el enlace con el servidor de PeerJS, reintenta sin perder la sala
      peer.on('disconnected', () => {
        if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
      });

      peer.on('error', (err) => {
        console.warn('[FingerGol] PeerJS:', err.type, err);
        if (err.type === 'unavailable-id' && intentos < 5) return this.abrirSala(intentos + 1); // código ocupado
        if (err.type === 'peer-unavailable') return; // no aplica a la pantalla
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && !peer.open)
          return this.error('No se pudo conectar con el servidor de conexiones. Revisa tu internet.');
        if (err.type === 'browser-incompatible')
          return this.error('Este navegador no permite la conexión. Usa Chrome o Edge.');
      });
    },

    /** Vista previa en Claude: no hay conexión real, se simulan los celulares con botones. */
    salaDemo() {
      const url = FG.fiesta.urlControl(this.codigo);
      $('#codigo-sala').textContent = this.codigo;
      $('#url-sala').textContent = url.replace(/^https?:\/\//, '');
      FG.fiesta.dibujarQR($('#qr'), url, 300);
      $('#qr-caja').classList.remove('cargando');
      this.estado('Vista previa: simula los celulares con los botones');
      $('#demo-sim').classList.remove('oculto');
      [0, 1].forEach((l) =>
        $('#demo-cel' + l).addEventListener('click', () => {
          this.puestos[l] = this.puestos[l] ? null : { demo: true, visto: Date.now() };
          this.pintarPuestos();
          if (this.puestos[l]) this.destello(l);
        })
      );
    },

    nuevaConexion(conn) {
      conn.on('data', (msg) => this.recibir(conn, msg));
      conn.on('close', () => this.soltar(conn));
      conn.on('error', () => this.soltar(conn));
    },

    recibir(conn, msg) {
      if (!msg || typeof msg !== 'object') return;
      const lado = this.puestos.findIndex((p) => p && p.conn === conn);
      if (lado >= 0) this.puestos[lado].visto = Date.now();

      if (msg.t === 'hola') {
        // 1) ¿ya estaba? (mismo token: el celular se reconectó) 2) si no, primer puesto libre
        let l = this.puestos.findIndex((p) => p && p.token === msg.token);
        if (l < 0) l = this.puestos.findIndex((p) => !p);
        if (l < 0) {
          conn.send({ t: 'llena' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const viejo = this.puestos[l];
        if (viejo && viejo.conn !== conn) {
          try { viejo.conn.close(); } catch (e) { /* nada */ }
        }
        this.puestos[l] = { conn, token: msg.token, visto: Date.now() };
        conn.send({ t: 'bienvenido', lado: l, sala: this.codigo });
        this.pintarPuestos();
        this.destello(l);
      }
    },

    soltar(conn) {
      const l = this.puestos.findIndex((p) => p && p.conn === conn);
      if (l < 0) return;
      this.puestos[l] = null;
      this.pintarPuestos();
    },

    /** Manda "ping" y saca a los celulares que dejaron de responder. */
    latido() {
      const ahora = Date.now();
      this.puestos.forEach((p) => {
        if (!p || p.demo) return;
        if (ahora - p.visto > PERDIDO_MS) {
          try { p.conn.close(); } catch (e) { /* nada */ }
          this.soltar(p.conn);
          return;
        }
        try { p.conn.send({ t: 'ping' }); } catch (e) { /* nada */ }
      });
    },

    /* ---------- interfaz ---------- */
    estado(texto) {
      $('#estado-sala').textContent = texto;
    },

    error(texto) {
      $('#error-texto').textContent = texto;
      $('#error-sala').classList.remove('oculto');
      $('#qr-caja').classList.add('cargando');
      this.estado('Sin conexión');
    },

    pintarPuestos() {
      [0, 1].forEach((l) => {
        const ok = !!this.puestos[l];
        const el = $('#puesto' + l);
        el.classList.toggle('conectado', ok);
        el.querySelector('.estado').textContent = ok ? '📱 Conectado ✓' : 'Esperando celular…';
      });
      const n = this.puestos.filter(Boolean).length;
      $('#listos').textContent =
        n === 2
          ? '¡Los dos están conectados! ⚽ (Parte 2: tus dedos moverán al jugador)'
          : n === 1
            ? 'Falta un jugador… (si nadie más entra, el otro lado lo jugará la máquina)'
            : '';
    },

    destello(lado) {
      const el = $('#puesto' + lado);
      el.classList.remove('pulso');
      void el.offsetWidth; // reinicia la animación
      el.classList.add('pulso');
    },

    /* ---------- partido de muestra de fondo ---------- */
    crearFondo() {
      const p = new FG.Partido({ golesParaGanar: 999 });
      p.iniciar();
      this.fondo = {
        p,
        cpus: [new FG.CPU(p, 0, 'normal'), new FG.CPU(p, 1, 'normal')],
        andadores: [new FG.Andador(p, 0), new FG.Andador(p, 1)]
      };
    },

    bucleFondo(dt) {
      const { p, cpus, andadores } = this.fondo;
      cpus.forEach((c, i) => {
        const o = c.actualizar(dt);
        const r = andadores[i].actualizar(dt, o, o.patear);
        p.fijarPies(i, r.pies, r.cuerpo);
      });
      p.actualizar(dt);
      p.sacarEventos();
      this.renderer.actualizarEfectos(dt);
      this.renderer.dibujar(p, { figuras: [true, true], etiquetas: ['1', '2'] });
    }
  };

  window.addEventListener('DOMContentLoaded', () => Pantalla.iniciar());
  FG.Pantalla = Pantalla;
})();
