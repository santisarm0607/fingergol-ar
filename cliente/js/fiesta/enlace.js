/* ============================================================
   Modo "Pantalla + celulares": conexión entre la PANTALLA
   (cancha grande) y los CELULARES (jugadores) con PeerJS.

   - PeerJS conecta los navegadores directo entre sí (WebRTC).
     Su servidor gratis solo sirve para que se "encuentren".
     Por eso funciona desde GitHub Pages, sin servidor propio.
   - La pantalla se registra con el nombre "fingergol-ar-ABCD"
     (ABCD = código de sala). El celular se conecta a ese nombre.
   - Mensajes: objetos con un campo "t" (tipo):
       celular → pantalla: hola {token}, pong
       pantalla → celular: bienvenido {lado}, llena, ping
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  const PREFIJO = 'fingergol-ar-';
  // Letras fáciles de leer (sin I, O, 0, 1 que se confunden)
  const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  FG.fiesta = {
    PREFIJO,

    /** Código de sala de 4 letras, ej. "KQZM". */
    nuevoCodigo() {
      let c = '';
      for (let i = 0; i < 4; i++) c += LETRAS[(Math.random() * LETRAS.length) | 0];
      return c;
    },

    limpiarCodigo(texto) {
      return String(texto || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    },

    /** Crea un Peer. id = null para que PeerJS invente uno (lo usan los celulares). */
    crearPeer(id) {
      if (!window.Peer) throw Object.assign(new Error('sin-peerjs'), { codigo: 'sin-peerjs' });
      const op = Object.assign({ debug: 1 }, FG.config.PEER_OPCIONES || {});
      return id ? new Peer(id, op) : new Peer(op);
    },

    /** Dirección que abre el celular al escanear el QR. */
    urlControl(codigo) {
      const u = new URL('control.html', location.href);
      u.search = '?sala=' + codigo;
      u.hash = '';
      return u.href;
    },

    /** Token guardado en el celular para recuperar su lado si se desconecta. */
    token() {
      let t = null;
      try { t = localStorage.getItem('fingergol.token'); } catch (e) { /* sin almacenamiento */ }
      if (!t) {
        t = Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { localStorage.setItem('fingergol.token', t); } catch (e) { /* nada */ }
      }
      return t;
    },

    /** Dibuja un QR en un <canvas> (librería qrcode-generator). */
    dibujarQR(canvas, texto, tam = 260) {
      const qr = qrcode(0, 'M'); // 0 = tamaño automático, M = corrección media
      qr.addData(texto);
      qr.make();
      const n = qr.getModuleCount();
      const margen = 3; // cuadros blancos alrededor (los lectores lo necesitan)
      const celda = Math.max(2, Math.floor(tam / (n + margen * 2)));
      const lado = celda * (n + margen * 2);
      canvas.width = lado;
      canvas.height = lado;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lado, lado);
      ctx.fillStyle = '#070b1a';
      for (let f = 0; f < n; f++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(f, c)) ctx.fillRect((c + margen) * celda, (f + margen) * celda, celda, celda);
    }
  };
})();
