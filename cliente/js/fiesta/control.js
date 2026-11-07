/* ============================================================
   CELULAR del jugador (modo "Pantalla + celulares").
   1) Se conecta a la pantalla con el código del QR.
   2) Enciende la cámara y MediaPipe busca tu mano.
   3) Manda a la pantalla dónde están tus dedos índice y medio
      (unas 30 veces por segundo). La pantalla los convierte en
      los dos pies de tu jugador.
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const { $ } = FG.util;

  const ESPERA_MS = 12000; // tiempo máximo para conectar
  const ENVIO_MS = 33;     // ~30 envíos por segundo
  // puntos de MediaPipe: 6 = nudillo del índice, 8 = punta del índice,
  // 10 = nudillo del medio, 12 = punta del medio
  const PUNTOS = [6, 8, 10, 12];

  const Control = {
    peer: null,
    conn: null,
    codigo: null,
    lado: null,
    frontal: true,
    stream: null,
    tracker: null,
    marcador: [0, 0],

    iniciar() {
      $('#form-codigo').addEventListener('submit', (e) => {
        e.preventDefault();
        const c = FG.fiesta.limpiarCodigo($('#input-codigo').value);
        if (c.length === 4) this.conectar(c);
        else this.mostrarCodigo('El código tiene 4 letras.');
      });
      $('#input-codigo').addEventListener('input', (e) => {
        e.target.value = FG.fiesta.limpiarCodigo(e.target.value);
      });
      $('#btn-reconectar').addEventListener('click', () => this.conectar(this.codigo));
      $('#btn-otro-codigo').addEventListener('click', () => this.mostrarCodigo());
      $('#btn-camara').addEventListener('click', () => this.encenderCamara());
      $('#btn-reintentar-cam').addEventListener('click', () => this.encenderCamara());
      $('#btn-girar-cam').addEventListener('click', () => {
        this.frontal = !this.frontal;
        this.encenderCamara();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.stream) this.pedirPantallaEncendida();
      });

      const c = FG.fiesta.limpiarCodigo(new URLSearchParams(location.search).get('sala'));
      if (c.length === 4) this.conectar(c);
      else if (C.MODO_DEMO) this.conectar('DEMO');
      else this.mostrarCodigo();
    },

    /* =================== VISTAS =================== */
    ver(id) {
      ['v-codigo', 'v-conectando', 'v-listo', 'v-camara', 'v-error'].forEach((v) =>
        $('#' + v).classList.toggle('activa', v === id)
      );
      document.body.classList.toggle('con-camara', id === 'v-camara');
    },

    mostrarCodigo(aviso) {
      this.cerrar();
      $('#aviso-codigo').textContent = aviso || '';
      if (this.codigo) $('#input-codigo').value = this.codigo;
      this.ver('v-codigo');
    },

    mostrarError(titulo, texto) {
      this.cerrar();
      $('#error-titulo').textContent = titulo;
      $('#error-texto').textContent = texto;
      document.body.removeAttribute('data-lado');
      this.ver('v-error');
    },

    /* =================== CONEXIÓN =================== */
    cerrar() {
      clearTimeout(this.limite);
      this.apagarCamara();
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) { /* nada */ }
      }
      this.peer = null;
      this.conn = null;
    },

    conectar(codigo) {
      this.cerrar();
      this.codigo = codigo;
      $('#txt-conectando').textContent = 'Conectando a la sala ' + codigo + '…';
      this.ver('v-conectando');

      // Vista previa en Claude: no hay conexión real, se simula la bienvenida
      if (C.MODO_DEMO) {
        $('#demo-volver').classList.remove('oculto');
        this.limite = setTimeout(() => this.recibir({ t: 'bienvenido', lado: location.hash === '#rojo' ? 1 : 0 }), 1200);
        return;
      }

      let peer;
      try {
        peer = FG.fiesta.crearPeer(null);
      } catch (e) {
        return this.mostrarError('Falta una librería', 'No se pudo cargar PeerJS. Recarga la página.');
      }
      this.peer = peer;
      this.limite = setTimeout(
        () => this.mostrarError('No pudimos conectar ⏱️', 'La pantalla no respondió. Revisa que siga abierta y que los dos tengan internet.'),
        ESPERA_MS
      );

      peer.on('open', () => {
        const conn = peer.connect(FG.fiesta.PREFIJO + codigo, { reliable: true });
        this.conn = conn;
        conn.on('open', () => conn.send({ t: 'hola', token: FG.fiesta.token() }));
        conn.on('data', (msg) => this.recibir(msg));
        conn.on('close', () => {
          if (this.conn === conn)
            this.mostrarError('Se perdió la conexión 📡', 'Revisa que la pantalla siga abierta y pulsa Reconectar.');
        });
      });

      peer.on('error', (err) => {
        console.warn('[FingerGol] PeerJS:', err.type, err);
        if (err.type === 'peer-unavailable')
          return this.mostrarError('No encontramos la sala ' + codigo + ' 🔍', 'Revisa el código o vuelve a escanear el QR de la pantalla.');
        if (err.type === 'browser-incompatible')
          return this.mostrarError('Navegador no compatible', 'Abre este link en Chrome (Android) o Safari (iPhone).');
        if (this.lado == null)
          this.mostrarError('Sin conexión 📡', 'No se pudo conectar con el servidor de conexiones. Revisa tu internet.');
      });
    },

    enviar(msg) {
      if (!this.conn || !this.conn.open) return;
      try { this.conn.send(msg); } catch (e) { /* nada */ }
    },

    recibir(msg) {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.t) {
        case 'ping':
          this.enviar({ t: 'pong' });
          break;
        case 'llena':
          this.mostrarError('La sala está llena 🙅', 'Ya hay dos jugadores conectados en esa pantalla.');
          break;
        case 'bienvenido': {
          clearTimeout(this.limite);
          const yaJugaba = this.lado === msg.lado && this.stream;
          this.lado = msg.lado;
          const eq = C.EQUIPOS[msg.lado];
          document.body.setAttribute('data-lado', msg.lado);
          $('#listo-equipo').textContent = eq.nombre;
          $('#cam-equipo').textContent = eq.nombre;
          $('#listo-sala').textContent = 'Sala ' + this.codigo;
          if (!yaJugaba) this.ver('v-listo');
          this.vibrar([60, 40, 60]);
          break;
        }
        case 'marcador':
          this.marcador = msg.m || [0, 0];
          $('#cam-marcador').textContent = this.marcador.join(' – ');
          if (msg.gol != null) this.vibrar(msg.gol === this.lado ? [80, 50, 80, 50, 200] : [150]);
          if (msg.e === 'fin' && msg.w >= 0)
            this.estadoCam(msg.w === this.lado ? '🏆 ¡Ganaste!' : '😅 Perdiste… ¡revancha!', msg.w === this.lado ? 'ok' : 'alerta', 6000);
          break;
        case 'sala':
          this.marcador = [0, 0];
          $('#cam-marcador').textContent = '0 – 0';
          break;
      }
    },

    vibrar(patron) {
      try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* nada */ }
    },

    /* =================== CÁMARA + DEDOS =================== */
    async encenderCamara() {
      this.apagarCamara();
      this.ver('v-camara');
      $('#btn-reintentar-cam').classList.add('oculto');
      this.estadoCam('Abriendo la cámara…');

      if (C.MODO_DEMO) return this.estadoCam('📷 En la vista previa de Claude no hay cámara. Pruébalo desde GitHub Pages.', 'alerta', 0, true);
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        return this.errorCamara('La cámara solo funciona desde un link https (GitHub Pages).');

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: this.frontal ? 'user' : 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      } catch (e) {
        const mensajes = {
          NotAllowedError: 'No diste permiso para la cámara. Toca el candado 🔒 de arriba → Cámara → Permitir.',
          SecurityError: 'No diste permiso para la cámara. Toca el candado 🔒 de arriba → Cámara → Permitir.',
          NotFoundError: 'No encontramos una cámara en este celular.',
          OverconstrainedError: 'Esta cámara no está disponible. Prueba con el botón 🔄.',
          NotReadableError: 'Otra app está usando la cámara. Ciérrala e intenta de nuevo.'
        };
        return this.errorCamara(mensajes[e.name] || 'No se pudo abrir la cámara.');
      }

      const video = $('#cam-video');
      video.srcObject = this.stream;
      try { await video.play(); } catch (e) { /* algunos navegadores ya la reproducen */ }
      this.pedirPantallaEncendida();

      if (!this.tracker) this.tracker = new FG.HandTracker();
      if (!this.tracker.listo) {
        this.estadoCam('Cargando el detector de manos… (la primera vez tarda un poco)');
        try {
          await this.tracker.cargar(1);
        } catch (e) {
          return this.errorCamara('No se pudo cargar el detector de manos. Revisa tu internet e intenta de nuevo.');
        }
      }
      if (!this.stream) return; // se apagó mientras cargaba
      this.estadoCam('Muestra tu mano ✌️', 'alerta');
      this.tEnvio = 0;
      this.tSinMano = 0;
      const bucle = (ahora) => {
        if (!this.stream) return;
        this.cuadro(ahora);
        this._raf = requestAnimationFrame(bucle);
      };
      this._raf = requestAnimationFrame(bucle);
    },

    apagarCamara() {
      cancelAnimationFrame(this._raf);
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      if (this.wakeLock) {
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }
    },

    errorCamara(texto) {
      this.apagarCamara();
      this.estadoCam('⚠️ ' + texto, 'alerta', 0, true);
      $('#btn-reintentar-cam').classList.remove('oculto');
    },

    /** Evita que el celular apague la pantalla mientras juegas. */
    pedirPantallaEncendida() {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then((w) => (this.wakeLock = w)).catch(() => {});
    },

    estadoCam(texto, clase = '', ms = 0, fijo = false) {
      const el = $('#cam-estado');
      el.textContent = texto;
      el.className = 'cam-estado ' + clase;
      this.estadoFijoHasta = fijo ? Infinity : ms ? performance.now() + ms : 0;
    },

    /** Cada cuadro: busca la mano, dibuja y manda los dedos a la pantalla. */
    cuadro(ahora) {
      const video = $('#cam-video');
      const manos = this.tracker.detectar(video, ahora);
      const mano = manos[0];
      // x en espejo con la cámara frontal: así mover la mano a la derecha = jugador a la derecha
      const puntos = mano
        ? PUNTOS.map((i) => {
            const q = mano.puntos[i];
            const x = this.frontal ? 1 - q.x : q.x;
            return [Math.round(x * 1000) / 1000, Math.round(q.y * 1000) / 1000];
          })
        : null;

      if (ahora - this.tEnvio >= (puntos ? ENVIO_MS : 150)) {
        this.tEnvio = ahora;
        this.enviar({ t: 'd', p: puntos });
      }

      if (performance.now() > (this.estadoFijoHasta || 0)) {
        if (puntos) this.estadoCam('✌️ ¡Te veo! Juega mirando la pantalla grande', 'ok');
        else this.estadoCam('Muestra tu mano ✌️ (índice y medio)', 'alerta');
      }
      this.dibujar(video, mano);
    },

    dibujar(video, mano) {
      const cv = $('#cam-lienzo');
      const caja = cv.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(caja.width * dpr);
      const h = Math.round(caja.height * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      // la imagen completa cabe en el recuadro (así ves toda tu mitad de la cancha)
      const k = Math.min(w / vw, h / vh);
      const dw = vw * k;
      const dh = vh * k;
      const ox = (w - dw) / 2;
      const oy = (h - dh) / 2;
      ctx.save();
      if (this.frontal) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, this.frontal ? w - ox - dw : ox, oy, dw, dh);
      ctx.restore();

      const eq = C.EQUIPOS[this.lado || 0];
      ctx.strokeStyle = eq.color;
      ctx.lineWidth = 4 * dpr;
      ctx.strokeRect(ox + 2, oy + 2, dw - 4, dh - 4);
      if (!mano) return;
      const P = (i) => {
        const q = mano.puntos[i];
        return [ox + (this.frontal ? 1 - q.x : q.x) * dw, oy + q.y * dh];
      };
      ctx.lineCap = 'round';
      [[5, 6, 7, 8], [9, 10, 11, 12]].forEach((dedo) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 6 * dpr;
        ctx.beginPath();
        dedo.forEach((i, n) => {
          const [x, y] = P(i);
          if (n) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        // guayo en la punta del dedo
        const [x, y] = P(dedo[3]);
        ctx.fillStyle = eq.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 14 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  };

  window.addEventListener('DOMContentLoaded', () => Control.iniciar());
  FG.Control = Control;
})();
