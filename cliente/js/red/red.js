/* ============================================================
   Cliente de red (WebSocket) para el modo en línea.
   Mensajes en JSON con un campo "t" (tipo). El servidor solo
   arma las salas y reenvía los mensajes entre los dos jugadores.
   - El ANFITRIÓN (crea la sala) calcula la física y manda el estado.
   - El INVITADO manda solo la posición de su dedo.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  class Red {
    constructor() {
      this.ws = null;
      this.oyentes = {};
      this.abierta = false;
    }

    url() {
      if (FG.config.SERVIDOR_URL) return FG.config.SERVIDOR_URL;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    }

    conectar() {
      return new Promise((resolver, rechazar) => {
        const url = this.url();
        if (!url) return rechazar(Object.assign(new Error('sin-servidor'), { codigo: 'sin-servidor' }));
        let ws;
        try {
          ws = new WebSocket(url);
        } catch (e) {
          return rechazar(Object.assign(new Error('sin-servidor'), { codigo: 'sin-servidor' }));
        }
        const limite = setTimeout(() => {
          try { ws.close(); } catch (e) { /* nada */ }
          rechazar(Object.assign(new Error('tiempo'), { codigo: 'sin-servidor' }));
        }, 7000);
        ws.onopen = () => {
          clearTimeout(limite);
          this.abierta = true;
          resolver();
        };
        ws.onerror = () => {
          clearTimeout(limite);
          if (!this.abierta) rechazar(Object.assign(new Error('sin-servidor'), { codigo: 'sin-servidor' }));
        };
        ws.onclose = () => {
          const estabaAbierta = this.abierta;
          this.abierta = false;
          if (estabaAbierta) this.emitir('desconectado', {});
        };
        ws.onmessage = (ev) => {
          let m;
          try {
            m = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          if (m && m.t) this.emitir(m.t, m);
        };
        this.ws = ws;
      });
    }

    on(tipo, fn) {
      (this.oyentes[tipo] = this.oyentes[tipo] || []).push(fn);
    }

    emitir(tipo, m) {
      (this.oyentes[tipo] || []).forEach((fn) => fn(m));
    }

    enviar(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }

    cerrar() {
      this.oyentes = {};
      this.abierta = false;
      if (this.ws) {
        try { this.ws.close(); } catch (e) { /* nada */ }
      }
      this.ws = null;
    }
  }

  FG.Red = Red;
})();
