/* ============================================================
   CELULAR del jugador: se conecta a la pantalla con el código
   del QR y recibe su lado (Azul o Rojo).
   Parte 1: solo conexión. En la parte 2 aquí se enciende la
   cámara y tus dedos índice y medio serán las piernas.
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const { $ } = FG.util;

  const ESPERA_MS = 12000; // tiempo máximo para conectar

  const Control = {
    peer: null,
    conn: null,
    codigo: null,
    lado: null,

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

      const c = FG.fiesta.limpiarCodigo(new URLSearchParams(location.search).get('sala'));
      if (c.length === 4) this.conectar(c);
      else if (C.MODO_DEMO) this.conectar('DEMO');
      else this.mostrarCodigo();
    },

    /* ---------- pantallas del celular ---------- */
    ver(id) {
      ['v-codigo', 'v-conectando', 'v-listo', 'v-error'].forEach((v) => $('#' + v).classList.toggle('activa', v === id));
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

    /* ---------- conexión ---------- */
    cerrar() {
      clearTimeout(this.limite);
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
        if (!this.lado && this.lado !== 0)
          this.mostrarError('Sin conexión 📡', 'No se pudo conectar con el servidor de conexiones. Revisa tu internet.');
      });
    },

    recibir(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return this.conn && this.conn.send({ t: 'pong' });
      if (msg.t === 'llena') return this.mostrarError('La sala está llena 🙅', 'Ya hay dos jugadores conectados en esa pantalla.');
      if (msg.t === 'bienvenido') {
        clearTimeout(this.limite);
        this.lado = msg.lado;
        const eq = C.EQUIPOS[msg.lado];
        document.body.setAttribute('data-lado', msg.lado);
        $('#listo-equipo').textContent = eq.nombre;
        $('#listo-sala').textContent = 'Sala ' + this.codigo;
        this.ver('v-listo');
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
    }
  };

  window.addEventListener('DOMContentLoaded', () => Control.iniciar());
  FG.Control = Control;
})();
