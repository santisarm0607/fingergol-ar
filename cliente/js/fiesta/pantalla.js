/* ============================================================
   PANTALLA (computador o TV) del modo "Pantalla + celulares".
   - Muestra el QR y recibe a los celulares (Azul / Rojo).
   - Cada lado puede ser un CELULAR (tus dedos) o un BOT (máquina).
   - Calcula el partido (física) y lo dibuja en grande.
   - Los celulares mandan dónde están tus dedos; aquí se
     convierten en los dos pies de tu jugador.
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const U = FG.util;
  const { $, $$ } = U;
  const W = C.CANCHA.ancho;
  const H = C.CANCHA.alto;

  const LATIDO_MS = 1000;    // cada cuánto se manda "ping"
  const PERDIDO_MS = 6000;   // sin respuesta este tiempo = celular desconectado
  const DEDOS_VIEJOS = 0.35; // seg sin dedos = "¿Y tu mano?"
  const MARGEN = 6;          // tus pies pueden pasar un poco la mitad

  const Pantalla = {
    peer: null,
    codigo: null,
    fase: 'sala', // sala | juego | fin
    // un puesto por lado: { tipo: 'cel'|'bot'|'demo', conn, token, visto, dedos, tDedos }
    puestos: [null, null],
    nivel: U.leer('dificultad', 'normal'),

    iniciar() {
      this.renderer = new FG.Render3D($('#lienzo'));
      this.sonidos = FG.Sonidos ? new FG.Sonidos() : null;
      this.crearFondo();
      this.conectarUI();
      setInterval(() => this.latido(), LATIDO_MS);
      this.abrirSala();
      this.pintarPuestos();
      let antes = performance.now();
      const bucle = (ahora) => {
        const dt = Math.min(0.05, (ahora - antes) / 1000);
        antes = ahora;
        if (this.fase === 'sala') this.bucleFondo(dt);
        else this.bucleJuego(dt, ahora);
        requestAnimationFrame(bucle);
      };
      requestAnimationFrame(bucle);
    },

    conectarUI() {
      $('#btn-reintentar').addEventListener('click', () => this.abrirSala());
      $('#btn-pantalla').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      });
      [0, 1].forEach((l) => $('#bot' + l).addEventListener('click', () => this.alternarBot(l)));
      $$('#nivel button').forEach((b) =>
        b.addEventListener('click', () => {
          this.nivel = b.dataset.valor;
          U.guardar('dificultad', this.nivel);
          this.pintarPuestos();
        })
      );
      $('#btn-jugar').addEventListener('click', () => this.empezar());
      $('#btn-revancha').addEventListener('click', () => this.empezar());
      $('#btn-sala').addEventListener('click', () => this.volverASala());
      $('#btn-terminar').addEventListener('click', () => this.volverASala());
      $('#btn-sonido').addEventListener('click', () => {
        if (!this.sonidos) return;
        this.sonidos.activar();
        const silencio = this.sonidos.alternar();
        $('#btn-sonido').textContent = silencio ? '🔇' : '🔊';
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.fase !== 'sala') this.volverASala();
      });
    },

    /* =================== SALA (conexión) =================== */
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
        this.mostrarQR();
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
        if (err.type === 'peer-unavailable') return;
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type) && !peer.open)
          return this.error('No se pudo conectar con el servidor de conexiones. Revisa tu internet.');
        if (err.type === 'browser-incompatible') return this.error('Este navegador no permite la conexión. Usa Chrome o Edge.');
      });
    },

    mostrarQR() {
      const url = FG.fiesta.urlControl(this.codigo);
      $('#codigo-sala').textContent = this.codigo;
      $('#url-sala').textContent = url.replace(/^https?:\/\//, '');
      FG.fiesta.dibujarQR($('#qr'), url, 300);
      $('#qr-caja').classList.remove('cargando');
    },

    /** Vista previa en Claude: no hay conexión real, los "celulares" se simulan con botones. */
    salaDemo() {
      this.mostrarQR();
      this.estado('Vista previa: simula los celulares con los botones');
      $('#demo-sim').classList.remove('oculto');
      [0, 1].forEach((l) => {
        const b = $('#demo-cel' + l);
        if (b.dataset.listo) return;
        b.dataset.listo = '1';
        b.addEventListener('click', () => {
          const p = this.puestos[l];
          this.puestos[l] = p && p.tipo === 'demo' ? null : { tipo: 'demo', visto: Date.now() };
          this.alCambiarPuestos(l);
        });
      });
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

      if (msg.t === 'd' && lado >= 0) {
        // dedos: p = [[x6,y6],[x8,y8],[x10,y10],[x12,y12]] de 0 a 1, o null si no ve la mano
        const p = this.puestos[lado];
        p.dedos = Array.isArray(msg.p) && msg.p.length === 4 ? msg.p : null;
        if (p.dedos) p.tDedos = performance.now();
        if (!p.camara) {
          p.camara = true;
          this.pintarPuestos();
        }
        return;
      }

      if (msg.t === 'hola') {
        // 1) ¿ya estaba? (mismo token = se reconectó)  2) primer puesto libre  3) un puesto con bot
        let l = this.puestos.findIndex((p) => p && p.tipo === 'cel' && p.token === msg.token);
        if (l < 0) l = this.puestos.findIndex((p) => !p);
        if (l < 0) l = this.puestos.findIndex((p) => p && p.tipo !== 'cel');
        if (l < 0) {
          conn.send({ t: 'llena' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const viejo = this.puestos[l];
        if (viejo && viejo.conn && viejo.conn !== conn) {
          try { viejo.conn.close(); } catch (e) { /* nada */ }
        }
        this.puestos[l] = { tipo: 'cel', conn, token: msg.token, visto: Date.now(), dedos: null, tDedos: 0 };
        conn.send({ t: 'bienvenido', lado: l, sala: this.codigo });
        if (this.fase !== 'sala') this.enviarMarcador(l);
        this.alCambiarPuestos(l);
      }
    },

    soltar(conn) {
      const l = this.puestos.findIndex((p) => p && p.conn === conn);
      if (l < 0) return;
      this.puestos[l] = null;
      if (this.fase !== 'sala') this.aviso(`📱 ${C.EQUIPOS[l].nombre} se desconectó. Puede volver a escanear el QR.`);
      this.alCambiarPuestos();
    },

    /** Manda "ping" y saca a los celulares que dejaron de responder. */
    latido() {
      const ahora = Date.now();
      this.puestos.forEach((p) => {
        if (!p || p.tipo !== 'cel') return;
        if (ahora - p.visto > PERDIDO_MS) {
          try { p.conn.close(); } catch (e) { /* nada */ }
          this.soltar(p.conn);
          return;
        }
        this.enviar(p, { t: 'ping' });
      });
    },

    enviar(p, msg) {
      if (!p || !p.conn) return;
      try { p.conn.send(msg); } catch (e) { /* nada */ }
    },

    alternarBot(l) {
      const p = this.puestos[l];
      if (p && p.tipo === 'cel') return;
      this.puestos[l] = p && p.tipo === 'bot' ? null : { tipo: 'bot' };
      if (this.sonidos) {
        this.sonidos.activar();
        this.sonidos.boton();
      }
      this.alCambiarPuestos(l);
    },

    alCambiarPuestos(lado) {
      this.pintarPuestos();
      if (lado != null && this.puestos[lado]) this.destello(lado);
      if (this.fase !== 'sala') this.crearControladores();
    },

    /* =================== PARTIDO =================== */
    puedeEmpezar() {
      const humanos = this.puestos.filter((p) => p && p.tipo !== 'bot').length;
      return this.puestos.every(Boolean) && humanos >= 1;
    },

    empezar() {
      if (!this.puedeEmpezar()) return;
      if (this.sonidos) this.sonidos.activar();
      this.partido = new FG.Partido({ golesParaGanar: Number(U.leer('goles', C.GOLES_POR_DEFECTO)) || C.GOLES_POR_DEFECTO });
      this.filtros = [0, 1].map(() => [new U.FiltroEuro2D(1.6, 0.03), new U.FiltroEuro2D(1.6, 0.03)]);
      this.ultimosPies = [null, null];
      this.crearControladores();
      this.partido.iniciar();
      this.fase = 'juego';
      document.body.classList.add('jugando');
      document.body.classList.remove('terminado');
      $('#p-fin').classList.add('oculto');
      this.pintarMarcador();
      this.enviarMarcador();
    },

    /** Bots (y celulares simulados de la vista previa) usan la CPU + un muñeco que camina. */
    crearControladores() {
      if (!this.partido) return;
      this.cpus = [0, 1].map((l) => {
        const p = this.puestos[l];
        if (!p || p.tipo === 'cel') return null;
        const viejo = this.cpus && this.cpus[l];
        if (viejo) return viejo;
        return { cpu: new FG.CPU(this.partido, l, p.tipo === 'demo' ? 'facil' : this.nivel), andador: new FG.Andador(this.partido, l) };
      });
    },

    volverASala() {
      this.fase = 'sala';
      this.partido = null;
      this.cpus = null;
      document.body.classList.remove('jugando', 'terminado');
      $('#p-fin').classList.add('oculto');
      $('#mensaje-central').className = 'oculto';
      this.puestos.forEach((p) => this.enviar(p, { t: 'sala' }));
      this.pintarPuestos();
    },

    /** Dedos del celular (0..1 en su imagen) → pies en SU mitad de la cancha. */
    piesDesdeDedos(lado, d, t) {
      const x0 = lado === 0 ? 2 : W / 2 - MARGEN;
      const x1 = lado === 0 ? W / 2 + MARGEN : W - 2;
      const aCancha = (q) => [x0 + U.clamp(q[0], 0, 1) * (x1 - x0), 2 + U.clamp(q[1], 0, 1) * (H - 4)];
      const mirar = lado === 0 ? 0 : Math.PI; // los pies miran al arco rival
      return [1, 3].map((i, k) => {
        const [x, y] = aCancha(d[i]);
        const f = this.filtros[lado][k].filtrar(x, y, t);
        return { x: f.x, y: f.y, ang: mirar };
      });
    },

    controlar(lado, dt, t) {
      const P = this.partido;
      const p = this.puestos[lado];
      const c = this.cpus && this.cpus[lado];
      if (c) {
        const o = c.cpu.actualizar(dt);
        const r = c.andador.actualizar(dt, o, o.patear);
        P.fijarPies(lado, r.pies, r.cuerpo);
        return;
      }
      if (!p || p.tipo !== 'cel') return P.fijarPies(lado, null);
      const fresco = p.dedos && performance.now() - p.tDedos < DEDOS_VIEJOS * 1000;
      if (fresco) {
        if (p.huecoLargo) this.filtros[lado].forEach((f) => f.reiniciar());
        p.huecoLargo = false;
        this.ultimosPies[lado] = this.piesDesdeDedos(lado, p.dedos, t);
        P.fijarPies(lado, this.ultimosPies[lado]);
      } else {
        p.huecoLargo = true;
        P.fijarPies(lado, null);
      }
    },

    bucleJuego(dt, ahora) {
      const P = this.partido;
      if (!P) return;
      const t = ahora / 1000;
      [0, 1].forEach((l) => this.controlar(l, dt, t));
      P.actualizar(dt);
      this.procesarEventos(P.sacarEventos());
      this.renderer.actualizarEfectos(dt);
      const celulares = [0, 1].filter((l) => this.puestos[l] && this.puestos[l].tipo === 'cel');
      this.renderer.dibujar(P, {
        figuras: [true, true],
        etiquetas: [0, 1].map((l) => (this.puestos[l] && this.puestos[l].tipo === 'bot' ? 'CPU' : String(l + 1))),
        locales: celulares,
        avisos: this.fase === 'juego'
      });
    },

    procesarEventos(eventos) {
      const s = this.sonidos;
      const ahora = performance.now();
      for (const e of eventos) {
        switch (e.tipo) {
          case 'patada':
            if (s) s.patada(e.fuerza);
            if (e.fuerza > 30 && ahora - (this.tChispa || 0) > 70) {
              this.renderer.efectoPatada(e.x, e.y, e.fuerza, C.EQUIPOS[e.lado].color);
              this.tChispa = ahora;
            }
            if (e.fuerza > 200 && ahora - (this.tFrase || 0) > 1500) {
              const frases = ['¡Zapatazo!', '¡Bombazo!', '¡Cañonazo!', '¡Qué fuerza!'];
              this.renderer.textoFlotante(frases[(Math.random() * frases.length) | 0], e.x, e.y, C.EQUIPOS[e.lado].color);
              this.tFrase = ahora;
            }
            break;
          case 'rebote':
            if (s) s.rebote(e.fuerza);
            break;
          case 'poste':
            if (s) s.poste();
            this.renderer.textoFlotante('¡Al palo!', e.x, e.y, '#ffffff');
            break;
          case 'cuenta':
            if (s) s.cuenta(e.n);
            this.mensaje(String(e.n), 'cuenta', 700);
            this.enviarMarcador();
            break;
          case 'pitazo':
            if (s) s.pitazo();
            this.mensaje('¡YA!', 'ya', 800);
            this.enviarMarcador();
            break;
          case 'gol': {
            if (s) s.gol();
            this.renderer.efectoGol(e.equipo);
            const eq = C.EQUIPOS[e.equipo];
            this.mensaje(`<span class="gol-txt">¡GOOOL!</span><span class="gol-quien" style="color:${eq.color}">de ${eq.nombre}</span>`, 'gol', 2100);
            this.pintarMarcador();
            this.enviarMarcador(null, { gol: e.equipo });
            break;
          }
          case 'fin':
            if (s) s.fin();
            this.fase = 'fin';
            this.enviarMarcador();
            setTimeout(() => this.mostrarFin(e.ganador), 600);
            break;
        }
      }
    },

    /** Le cuenta a los celulares cómo va el partido (para su marcador y vibración). */
    enviarMarcador(soloLado, extra) {
      const P = this.partido;
      const msg = Object.assign({ t: 'marcador', m: P ? P.marcador.slice() : [0, 0], e: P ? P.estado : 'espera', w: P ? P.ganador : -1 }, extra || {});
      [0, 1].forEach((l) => {
        if (soloLado != null && l !== soloLado) return;
        this.enviar(this.puestos[l], msg);
      });
    },

    mostrarFin(ganador) {
      if (this.fase !== 'fin') return;
      const eq = C.EQUIPOS[ganador];
      const p = this.puestos[ganador];
      $('#fin-titulo').textContent = `¡Ganó ${eq.nombre}!` + (p && p.tipo === 'bot' ? ' 🤖' : ' 🏆');
      $('#fin-titulo').style.color = eq.color;
      $('#fin-marcador').textContent = this.partido.marcador.join(' – ');
      document.body.classList.add('terminado');
      $('#p-fin').classList.remove('oculto');
    },

    /* =================== INTERFAZ =================== */
    estado(texto) {
      $('#estado-sala').textContent = texto;
    },

    error(texto) {
      $('#error-texto').textContent = texto;
      $('#error-sala').classList.remove('oculto');
      $('#qr-caja').classList.add('cargando');
      this.estado('Sin conexión');
    },

    aviso(texto, ms = 3500) {
      const el = $('#aviso');
      el.textContent = texto;
      el.classList.remove('oculto');
      clearTimeout(this._tAviso);
      this._tAviso = setTimeout(() => el.classList.add('oculto'), ms);
    },

    mensaje(html, clase, ms) {
      const el = $('#mensaje-central');
      el.className = '';
      void el.offsetWidth; // reinicia la animación
      el.innerHTML = html;
      el.className = 'mc-' + clase;
      clearTimeout(this._tMensaje);
      this._tMensaje = setTimeout(() => el.classList.add('oculto'), ms);
    },

    pintarMarcador() {
      const m = this.partido ? this.partido.marcador : [0, 0];
      $('#goles0').textContent = m[0];
      $('#goles1').textContent = m[1];
      $('#meta-goles').textContent = 'a ' + (this.partido ? this.partido.golesParaGanar : C.GOLES_POR_DEFECTO);
    },

    pintarPuestos() {
      const textoNivel = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };
      [0, 1].forEach((l) => {
        const p = this.puestos[l];
        const el = $('#puesto' + l);
        el.classList.toggle('conectado', !!p);
        el.classList.toggle('es-bot', !!p && p.tipo === 'bot');
        let txt = 'Esperando celular…';
        if (p && p.tipo === 'bot') txt = '🤖 Máquina · ' + textoNivel[this.nivel];
        else if (p && p.tipo === 'demo') txt = '📱 Celular simulado ✓';
        else if (p) txt = p.camara ? '📱 Conectado · 📷 cámara lista ✓' : '📱 Conectado · falta encender la cámara';
        el.querySelector('.estado').textContent = txt;
        el.querySelector('.puesto-ico').textContent = p && p.tipo === 'bot' ? '🤖' : '✌️';
        const b = $('#bot' + l);
        b.classList.toggle('oculto', !!p && p.tipo !== 'bot');
        b.textContent = p && p.tipo === 'bot' ? '✕ Quitar bot' : '🤖 Poner bot';
      });
      $$('#nivel button').forEach((b) => b.classList.toggle('activo', b.dataset.valor === this.nivel));
      const hayBot = this.puestos.some((p) => p && p.tipo === 'bot');
      $('#fila-nivel').classList.toggle('oculto', !hayBot);

      const listo = this.puedeEmpezar();
      $('#btn-jugar').disabled = !listo;
      const n = this.puestos.filter((p) => p && p.tipo !== 'bot').length;
      $('#listos').textContent = listo
        ? '¡Todo listo! Pulsa ¡A jugar! ⚽'
        : n === 0
          ? 'Conecta al menos un celular.'
          : 'Falta el rival: espera otro celular o pon un 🤖 bot.';
    },

    destello(lado) {
      const el = $('#puesto' + lado);
      el.classList.remove('pulso');
      void el.offsetWidth;
      el.classList.add('pulso');
    },

    /* =================== FONDO (sala) =================== */
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
