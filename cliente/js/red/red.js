/* ============================================================
   Cliente de red (WebSocket) para el modo en línea.
   Mensajes en JSON con un campo "t" (tipo). El servidor solo
   arma las salas y reenvía los mensajes entre los dos jugadores.
   - El ANFITRIÓN (crea la sala) calcula la física y manda el estado.
   - El INVITADO manda solo la posición de su dedo.

   Reconexión: si se corta la conexión (wifi que falla, túnel,
   celular que cambia de red), se reintenta sola durante unos
   segundos con el código de la sala y una "llave" secreta que
   dio el servidor. Si vuelve a tiempo, el partido sigue igual.
   Eventos extra: 'caida' (se cortó, reintentando),
   'reconectado' (volvió) y 'desconectado' (no se pudo volver).
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  const PING_MS = 2000;   // cada cuánto preguntamos "¿sigues ahí?" al servidor
  const PINGS_PERDIDOS = 3; // 3 pings seguidos sin respuesta = conexión muerta

  class Red {
    constructor() {
      this.ws = null;
      this.oyentes = {};
      this.abierta = false;
      this.sala = null;         // { codigo, llave } cuando ya estamos en una sala
      this.reconectando = false;
      this.cerrada = false;     // true cuando salimos a propósito
    }

    url() {
      if (FG.config.SERVIDOR_URL) return FG.config.SERVIDOR_URL;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    }

    /** Abre la conexión. Se resuelve cuando está lista. */
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
        let abierto = false;
        const limite = setTimeout(() => {
          try { ws.close(); } catch (e) { /* nada */ }
          rechazar(Object.assign(new Error('tiempo'), { codigo: 'sin-servidor' }));
        }, 7000);
        ws.onopen = () => {
          clearTimeout(limite);
          abierto = true;
          this.abierta = true;
          this.ws = ws;
          this.pendientes = 0;
          this.empezarLatido();
          resolver();
        };
        ws.onerror = () => {
          clearTimeout(limite);
          if (!abierto) rechazar(Object.assign(new Error('sin-servidor'), { codigo: 'sin-servidor' }));
        };
        ws.onclose = () => {
          if (this.ws !== ws) return; // una conexión vieja que ya reemplazamos
          this.abierta = false;
          if (abierto) this.seCorto();
        };
        ws.onmessage = (ev) => {
          if (this.ws !== ws) return;
          this.pendientes = 0; // cualquier mensaje prueba que la conexión sigue viva
          let m;
          try {
            m = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          if (!m || !m.t) return;
          if (m.t === 'pong') return;
          // el servidor nos da la llave para poder volver a la sala si se corta
          if ((m.t === 'sala' || m.t === 'unido') && m.llave) this.sala = { codigo: m.codigo, llave: m.llave };
          this.emitir(m.t, m);
        };
      });
    }

    /** Ping al servidor: si deja de contestar, damos la conexión por muerta y reintentamos. */
    empezarLatido() {
      clearInterval(this._latido);
      this._latido = setInterval(() => {
        if (!this.abierta || !this.ws) return;
        // (contamos pings sin respuesta y no segundos: si la pestaña se va al fondo
        //  el navegador frena los temporizadores y no queremos falsas alarmas)
        if (this.pendientes >= PINGS_PERDIDOS) {
          const ws = this.ws;
          this.abierta = false;
          try { ws.close(); } catch (e) { /* nada */ }
          this.seCorto();
          return;
        }
        this.pendientes++;
        this.enviar({ t: 'ping' });
      }, PING_MS);
    }

    /** La conexión se cayó sin que saliéramos: intentar volver a la sala. */
    async seCorto() {
      if (this.cerrada || this.reconectando) return;
      clearInterval(this._latido);
      if (!this.sala) {
        this.emitir('desconectado', {});
        return;
      }
      this.reconectando = true;
      const limite = Date.now() + (FG.config.ESPERA_RECONEXION || 15) * 1000;
      this.emitir('caida', { hasta: limite });
      while (!this.cerrada && Date.now() < limite) {
        try {
          await this.conectar();
          const respuesta = await this.esperarRespuesta(['vuelto', 'error'], 4000);
          if (respuesta && respuesta.t === 'vuelto') {
            this.reconectando = false;
            this.emitir('reconectado', respuesta);
            return;
          }
          if (respuesta && respuesta.t === 'error') break; // la sala ya no existe
        } catch (e) { /* sin red todavía: reintentar */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      this.reconectando = false;
      if (!this.cerrada) this.emitir('desconectado', {});
    }

    /** Pide volver a la sala y espera la respuesta del servidor. */
    esperarRespuesta(tipos, ms) {
      return new Promise((resolver) => {
        const fin = (m) => {
          clearTimeout(t);
          tipos.forEach((tipo) => this.quitar(tipo, fin));
          resolver(m);
        };
        const t = setTimeout(() => fin(null), ms);
        tipos.forEach((tipo) => this.on(tipo, fin));
        this.enviar({ t: 'volver', codigo: this.sala.codigo, llave: this.sala.llave });
      });
    }

    on(tipo, fn) {
      (this.oyentes[tipo] = this.oyentes[tipo] || []).push(fn);
    }

    quitar(tipo, fn) {
      this.oyentes[tipo] = (this.oyentes[tipo] || []).filter((f) => f !== fn);
    }

    emitir(tipo, m) {
      (this.oyentes[tipo] || []).slice().forEach((fn) => fn(m));
    }

    enviar(obj) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    }

    /** Salir a propósito: el servidor cierra la sala de inmediato (sin esperar reconexión). */
    cerrar() {
      this.cerrada = true;
      clearInterval(this._latido);
      this.enviar({ t: 'salir' });
      this.oyentes = {};
      this.abierta = false;
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        try { ws.close(); } catch (e) { /* nada */ }
      }
    }

    /** Solo para pruebas: corta la conexión como si se cayera el wifi. */
    simularCaida() {
      if (this.ws) {
        try { this.ws.close(); } catch (e) { /* nada */ }
      }
    }
  }

  FG.Red = Red;
})();
