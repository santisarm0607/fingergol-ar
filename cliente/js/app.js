/* ============================================================
   App principal: une todo.
   menú → guía del marcador → AR.js + detector de manos →
   "pon tu mano como piernas" → partido → fin
   Cada cuadro: leer dedos/toques → asignar a jugadores →
   física (o red) → sonidos/efectos → dibujar el futbolito 3D.
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const U = FG.util;
  const { $, $$ } = U;
  const W = C.CANCHA.ancho;
  const LISTO_SEG = 0.8; // segundos con la mano puesta para estar "listo"

  const MENSAJES_ERROR = {
    inseguro:
      'La cámara solo funciona si abres el juego desde <b>https://</b> o desde <b>localhost</b>. Ejecuta <code>npm start</code> y entra a <b>http://localhost:3000</b>.',
    'sin-soporte': 'Este navegador no deja usar la cámara. Prueba con Chrome, Edge o Safari actualizados.',
    permiso:
      'No tenemos permiso para usar la cámara. Toca el candado 🔒 junto a la dirección, permite la cámara y pulsa <b>Reintentar</b>.',
    'sin-camara': 'No encontramos ninguna cámara conectada a este dispositivo.',
    ocupada: 'Otra app está usando la cámara (Zoom, Meet, otra pestaña…). Ciérrala y pulsa <b>Reintentar</b>.',
    mediapipe: 'No se pudo descargar el detector de manos (MediaPipe). Revisa tu conexión a internet.',
    modelo: 'No se pudo iniciar el detector de manos en este dispositivo.',
    arjs: 'No se pudo cargar AR.js. Revisa tu conexión a internet.',
    desconocido: 'Algo falló al encender la cámara.'
  };

  const App = {
    ajustes: {
      control: U.leer('control', 'manos'),
      goles: U.leer('goles', C.GOLES_POR_DEFECTO),
      dificultad: U.leer('dificultad', 'normal')
    },
    fase: 'menu', // menu | guia | carga | lobby | juego | pausa | fin | alerta
    modo: null,   // local | cpu | online
    rol: null,    // anfitrion | invitado (solo en línea)
    partido: null,
    cpu: null,
    red: null,
    humanos: [],
    tokenPrep: 0,
    tPrev: 0,
    tRed: 0,
    eventosRed: [],
    eventosRecibidos: [],
    manosDibujo: [],

    /* ====================== ARRANQUE ====================== */
    iniciar() {
      this.lienzo = $('#lienzo');
      this.renderer = new FG.Render3D(this.lienzo);
      this.puntero = new FG.Puntero(this.lienzo);
      this.puntero.rotado = () => this.renderer.rotado;
      this.sonidos = new FG.Sonidos();
      this.tracker = new FG.HandTracker();

      if (C.MODO_DEMO) {
        this.ajustes.control = 'tactil';
        $('#banner-demo').classList.remove('oculto');
        document.body.classList.add('demo');
        $('#sub-online').textContent = 'Necesita el servidor del juego (README)';
        $('[data-modo="online"]').classList.add('deshabilitado');
        $('[data-ajuste="control"] [data-valor="manos"]').disabled = true;
      }

      this.conectarUI();
      this.refrescarAjustes();

      // En un celular, lo primero es unirse a una pantalla (modo Pantalla + celulares)
      const esCelular = window.matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 600;
      if (esCelular) this.mostrar('p-celular');
      this._bucle = (t) => this.bucle(t);
      requestAnimationFrame(this._bucle);
    },

    conectarUI() {
      $$('.modo').forEach((b) => b.addEventListener('click', () => this.elegirModo(b.dataset.modo)));

      $$('.segmentos').forEach((seg) => {
        seg.addEventListener('click', (ev) => {
          const b = ev.target.closest('button');
          if (!b || b.disabled) return;
          const clave = seg.dataset.ajuste;
          const valor = clave === 'goles' ? Number(b.dataset.valor) : b.dataset.valor;
          this.ajustes[clave] = valor;
          U.guardar(clave, valor);
          this.sonidos.activar();
          this.sonidos.boton();
          this.refrescarAjustes();
        });
      });

      $('#btn-ver-menu').addEventListener('click', () => this.mostrar('p-inicio'));
      $$('[data-menu]').forEach((b) => b.addEventListener('click', () => this.irAlMenu()));
      $$('[data-ver-marcador]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.preventDefault();
          this.verMarcador();
        })
      );
      $('#btn-cerrar-marcador').addEventListener('click', () => this.mostrar(this.pantallaAntesMarcador || 'p-inicio'));
      $('#img-hiro').addEventListener('error', () => {
        const img = $('#img-hiro');
        const siguiente = C.MARCADOR_HIRO[Number(img.dataset.i || 0) + 1];
        if (siguiente) {
          img.dataset.i = Number(img.dataset.i || 0) + 1;
          img.src = siguiente;
        }
      });

      // guía
      $('#btn-guia-ok').addEventListener('click', () => {
        if ($('#chk-guia').checked) U.guardar('guiaVista', true);
        this.sonidos.activar();
        if (this._continuarGuia) this._continuarGuia();
      });

      // carga
      $('#btn-reintentar').addEventListener('click', () => this.reintentar());
      $('#btn-sin-camara').addEventListener('click', () => {
        this.ajustes.control = 'tactil';
        U.guardar('control', 'tactil');
        this.refrescarAjustes();
        this.reintentar();
      });

      // lobby
      $('#btn-empezar-ya').addEventListener('click', () => this.empezarYa());

      // hud
      $('#btn-pausa').addEventListener('click', () => this.pausar());
      $('#btn-sonido').addEventListener('click', () => {
        this.sonidos.activar();
        const mudo = this.sonidos.alternar();
        $('#btn-sonido').textContent = mudo ? '🔇' : '🔊';
      });
      $('#btn-sonido').textContent = this.sonidos.silencio ? '🔇' : '🔊';
      const btnPantalla = $('#btn-pantalla');
      if (!document.fullscreenEnabled) btnPantalla.classList.add('oculto');
      btnPantalla.addEventListener('click', () => {
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().catch(() => {});
        } catch (e) { /* no soportado */ }
      });

      // pausa / salir / fin
      $('#btn-continuar').addEventListener('click', () => this.continuar());
      $('#btn-reiniciar').addEventListener('click', () => {
        this.mostrar(null);
        this.reiniciarPartido();
      });
      $('#btn-seguir').addEventListener('click', () => {
        this.mostrar(null);
        this.fase = this.faseAntes || 'juego';
      });
      $('#btn-revancha').addEventListener('click', () => this.pedirRevancha());

      // en línea
      $('#btn-crear').addEventListener('click', () => this.crearSala());
      $('#form-unir').addEventListener('submit', (e) => {
        e.preventDefault();
        this.unirse($('#input-codigo').value);
      });
      $('#input-codigo').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
      });
      $('#btn-copiar').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText($('#codigo-sala').textContent);
          this.aviso('Código copiado 📋');
        } catch (e) {
          this.aviso('Copia el código a mano: ' + $('#codigo-sala').textContent);
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (this.fase === 'juego' || this.fase === 'lobby')) this.pausar();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.fase === 'juego' && this.modo !== 'online') this.pausar();
      });
    },

    refrescarAjustes() {
      $$('.segmentos').forEach((seg) => {
        const clave = seg.dataset.ajuste;
        seg.querySelectorAll('button').forEach((b) =>
          b.classList.toggle('activo', String(this.ajustes[clave]) === b.dataset.valor)
        );
      });
      const conManos = this.ajustes.control === 'manos';
      $('#nota-mesa').classList.toggle('oculto', !conManos);
      $('#resumen-ajustes').textContent =
        (conManos ? '✌️ Manos en la mesa' : '👆 Práctica sin cámara') + ' · ' + this.ajustes.goles + ' goles';
    },

    verMarcador() {
      const img = $('#img-hiro');
      img.dataset.i = 0;
      img.src = C.MARCADOR_HIRO[0];
      $('#link-hiro').href = C.MARCADOR_HIRO[0];
      const actual = $$('.pantalla').find((p) => p.classList.contains('activa'));
      this.pantallaAntesMarcador = actual && actual.id !== 'p-marcador' ? actual.id : 'p-inicio';
      this.mostrar('p-marcador');
    },

    /* ====================== PANTALLAS ====================== */
    mostrar(id) {
      $$('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
    },

    aviso(texto, ms = 2600) {
      const el = $('#aviso');
      el.innerHTML = texto;
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

    alerta(titulo, texto) {
      this.fase = 'alerta';
      $('#alerta-titulo').textContent = titulo;
      $('#alerta-texto').innerHTML = texto;
      this.ocultarLobby();
      this.mostrar('p-alerta');
    },

    /* ====================== FLUJO ====================== */
    elegirModo(modo) {
      this.sonidos.activar();
      this.sonidos.boton();
      // Modo "Pantalla + celulares": tiene su propia página
      if (modo === 'pantalla') {
        location.href = 'pantalla.html';
        return;
      }
      // Práctica: contra la máquina con mouse / táctil / teclado (sin cámara)
      this.forzarTactil = modo === 'practica';
      if (modo === 'practica') modo = 'cpu';
      if (modo === 'online') {
        if (C.MODO_DEMO) {
          this.aviso('El modo en línea necesita el servidor del juego. Mira el README del proyecto.', 4000);
          return;
        }
        this.mostrarOnline();
        return;
      }
      this.prepararPartida(modo);
    },

    async prepararPartida(modo, rol = null) {
      this.ultimaPrep = { modo, rol };
      const token = ++this.tokenPrep;
      this.modo = modo;
      this.rol = rol;
      this.humanos = modo === 'local' ? [0, 1] : modo === 'cpu' ? [0] : rol === 'anfitrion' ? [0] : [1];
      this.partido = new FG.Partido({ golesParaGanar: this.ajustes.goles });
      this.andadores = [new FG.Andador(this.partido, 0), new FG.Andador(this.partido, 1)];
      this.cpu = modo === 'cpu' ? new FG.CPU(this.partido, 1, this.ajustes.dificultad) : null;
      this.filtros = [0, 1].map(() => [new U.FiltroEuro2D(1.6, 0.03), new U.FiltroEuro2D(1.6, 0.03)]);
      this.ultimaPos = [null, null];
      this.tSinEntrada = [9, 9];
      this.listo = [0, 0];
      this.rivalListo = false;
      this.listoEnviado = false;
      this.entradaRival = null;
      this.eventosRed = [];
      this.eventosRecibidos = [];
      this.controlActual = C.MODO_DEMO || this.forzarTactil ? 'tactil' : this.ajustes.control;
      this.vistaAR = this.controlActual === 'manos';
      this.puntero.reiniciar();

      if (this.vistaAR) {
        if (!U.leer('guiaVista', false)) {
          this.fase = 'guia';
          this.mostrar('p-guia');
          await new Promise((resolver) => (this._continuarGuia = resolver));
          this._continuarGuia = null;
          if (token !== this.tokenPrep) return;
        }
        this.fase = 'carga';
        const ok = await this.prepararAR(token);
        if (!ok || token !== this.tokenPrep) return;
      }
      this.entrarEscenario();
    },

    reintentar() {
      if (!this.ultimaPrep) return this.irAlMenu();
      this.prepararPartida(this.ultimaPrep.modo, this.ultimaPrep.rol);
    },

    async prepararAR(token) {
      this.mostrar('p-carga');
      const pasos = { ar: $('#paso-ar'), camara: $('#paso-camara'), modelo: $('#paso-modelo') };
      Object.values(pasos).forEach((p) => (p.dataset.estado = ''));
      $('#carga-error').classList.add('oculto');
      $('#carga-spinner').classList.remove('oculto');
      $('#carga-titulo').textContent = 'Preparando el futbolito…';
      let paso = null;
      const marcar = (p, estado) => {
        p.dataset.estado = estado;
        if (estado === 'activo') paso = p;
      };
      try {
        marcar(pasos.camara, 'activo');
        if (!this.ar || !this.ar.video) await FG.Camara.verificar();
        marcar(pasos.camara, 'hecho');
        if (token !== this.tokenPrep) return false;

        marcar(pasos.ar, 'activo');
        if (!this.ar) this.ar = new FG.RenderAR($('#contenedor-ar'));
        try {
          await this.ar.cargarLibrerias();
        } catch (e) {
          e.codigo = 'arjs';
          throw e;
        }
        document.body.classList.add('modo-ar');
        if (!this.ar.video) await this.ar.crearEscena();
        this.camAR = FG.CamaraAR.desdeAR(this.ar);
        marcar(pasos.ar, 'hecho');
        if (token !== this.tokenPrep) return false;

        marcar(pasos.modelo, 'activo');
        await this.tracker.cargar(2);
        if (token !== this.tokenPrep) return false;
        marcar(pasos.modelo, 'hecho');
        return true;
      } catch (e) {
        console.error('[FingerGol] error al preparar la realidad aumentada', e);
        if (token !== this.tokenPrep) return false;
        if (paso) paso.dataset.estado = 'fallo';
        $('#carga-spinner').classList.add('oculto');
        $('#carga-titulo').textContent = 'No pudimos empezar 😕';
        $('#carga-error-texto').innerHTML = MENSAJES_ERROR[e.codigo] || MENSAJES_ERROR.desconocido;
        $('#carga-error').classList.remove('oculto');
        return false;
      }
    },

    entrarEscenario() {
      this.mostrar(null);
      document.body.classList.add('en-juego');
      if (this.vistaAR) this.renderer.usarCamara(this.camAR, true);
      else this.renderer.usarCamara(this.renderer.virtual, false);
      $('#hud').classList.remove('oculto');
      $('#btn-pausa').textContent = this.modo === 'online' ? '✕' : '⏸';
      this.actualizarNombres();
      this.actualizarMarcador();
      this.pedirWakeLock();

      if (this.vistaAR || this.modo === 'online') this.abrirLobby();
      else this.empezarPartido();
    },

    abrirLobby() {
      this.fase = 'lobby';
      const lobby = $('#p-lobby');
      lobby.classList.add('activa');
      lobby.classList.toggle('sin-lados', !this.vistaAR);
      const nombres = this.nombresLargos();
      [0, 1].forEach((lado) => {
        $(`#lado${lado}-nombre`).textContent = nombres[lado];
        $(`#lado${lado}`).classList.toggle('remoto', !this.humanos.includes(lado));
      });
      this.textosLobby();
      $('#btn-empezar-ya').classList.toggle('oculto', this.modo === 'online' && this.rol === 'invitado');
    },

    textosLobby(esperandoMarcador) {
      if (!this.vistaAR) {
        $('#lobby-titulo').textContent = 'Esperando a tu rival…';
        $('#lobby-sub').textContent = 'El partido empieza cuando los dos estén listos.';
        return;
      }
      if (esperandoMarcador) {
        $('#lobby-titulo').textContent = '🧾 Apunta la cámara al marcador';
        $('#lobby-sub').textContent = 'Cuando aparezca el futbolito, deja el celular quieto.';
        return;
      }
      $('#lobby-titulo').textContent = '¡Pon tu mano como piernas! ✌️';
      $('#lobby-sub').textContent =
        this.humanos.length === 2
          ? 'Cada jugador apoya el índice y el medio en su lado de la cancha.'
          : 'Apoya el índice y el medio en tu lado de la cancha.';
    },

    ocultarLobby() {
      $('#p-lobby').classList.remove('activa');
      document.body.classList.remove('lobby-marcador');
    },

    actualizarLobby(asig, dt) {
      const esperandoMarcador = this.vistaAR && !(this.camAR && this.camAR.visible());
      document.body.classList.toggle('lobby-marcador', esperandoMarcador);
      if (esperandoMarcador !== this._esperandoMarcador) {
        this._esperandoMarcador = esperandoMarcador;
        this.textosLobby(esperandoMarcador);
      }
      for (const lado of this.humanos) {
        if (!this.vistaAR) this.listo[lado] = LISTO_SEG;
        else if (asig[lado] && !esperandoMarcador) this.listo[lado] = Math.min(LISTO_SEG, this.listo[lado] + dt);
        else this.listo[lado] = Math.max(0, this.listo[lado] - dt * 0.6);
      }

      [0, 1].forEach((lado) => {
        const panel = $(`#lado${lado}`);
        const estado = $(`#lado${lado}-estado`);
        const barra = $(`#lado${lado}-barra`);
        if (this.humanos.includes(lado)) {
          const pct = this.listo[lado] / LISTO_SEG;
          barra.style.width = Math.round(pct * 100) + '%';
          panel.classList.toggle('detectado', !!asig[lado]);
          panel.classList.toggle('listo', pct >= 1);
          estado.textContent = esperandoMarcador
            ? 'Primero el marcador 🧾'
            : pct >= 1
              ? '¡Listo! ✓'
              : asig[lado]
                ? 'Mantén los dedos en la mesa…'
                : 'Pon tus dedos de este lado';
        } else {
          const listoOtro = this.modo === 'cpu' || this.rivalListo;
          barra.style.width = listoOtro ? '100%' : '0%';
          panel.classList.toggle('listo', listoOtro);
          estado.textContent =
            this.modo === 'cpu' ? '🤖 Lista para jugar' : this.rivalListo ? 'Rival listo ✓' : 'Esperando al rival…';
        }
      });

      if (esperandoMarcador) return;
      const localesListos = this.humanos.every((l) => this.listo[l] >= LISTO_SEG);
      if (!localesListos) return;
      if (this.modo === 'online') {
        if (!this.listoEnviado && this.red) {
          this.red.enviar({ t: 'listo' });
          this.listoEnviado = true;
        }
        if (this.rol === 'anfitrion' && this.rivalListo) this.empezarPartido();
        else
          $('#lobby-sub').textContent =
            this.rol === 'anfitrion' ? 'Esperando a que tu rival esté listo…' : 'Esperando al anfitrión…';
      } else {
        this.empezarPartido();
      }
    },

    empezarYa() {
      this.sonidos.activar();
      if (this.modo === 'online') {
        if (this.rol === 'anfitrion') {
          if (this.red) this.red.enviar({ t: 'listo' });
          this.empezarPartido();
        }
        return;
      }
      this.empezarPartido();
    },

    empezarPartido() {
      this.ocultarLobby();
      this.fase = 'juego';
      if (this.modo !== 'online' || this.rol === 'anfitrion') this.partido.iniciar();
      this.actualizarMarcador();
    },

    reiniciarPartido() {
      if (this.cpu) this.cpu = new FG.CPU(this.partido, 1, this.ajustes.dificultad);
      this.partido.iniciar();
      this.fase = 'juego';
      this.actualizarMarcador();
    },

    pausar() {
      if (this.fase !== 'juego' && this.fase !== 'lobby') return;
      this.faseAntes = this.fase;
      if (this.modo === 'online') {
        this.mostrar('p-salir');
        return;
      }
      this.fase = 'pausa';
      this.mostrar('p-pausa');
    },

    continuar() {
      this.mostrar(null);
      this.fase = this.faseAntes || 'juego';
    },

    mostrarFin(ganador) {
      if (this.fase === 'menu' || this.fase === 'alerta') return;
      this.fase = 'fin';
      const m = this.partido.marcador;
      $('#fin-g0').textContent = m[0];
      $('#fin-g1').textContent = m[1];
      const mio = this.humanos.includes(ganador);
      let icono = '🏆';
      let titulo;
      let sub;
      if (this.modo === 'local') {
        titulo = `¡Ganó ${this.nombresLargos()[ganador]}!`;
        sub = '¡Qué partidazo! ¿Otra?';
      } else if (this.modo === 'cpu') {
        titulo = mio ? '¡Le ganaste a la máquina!' : 'Ganó la máquina';
        icono = mio ? '🏆' : '🤖';
        sub = mio ? 'Prueba la dificultad “Difícil” en Ajustes.' : '¿La revancha?';
      } else {
        titulo = mio ? '¡Ganaste!' : 'Ganó tu rival';
        icono = mio ? '🏆' : '😅';
        sub = this.rol === 'invitado' ? 'La revancha la inicia quien creó la sala.' : '';
      }
      $('#fin-icono').textContent = icono;
      $('#fin-titulo').textContent = titulo;
      $('#fin-sub').textContent = sub;
      $('#fin-titulo').style.color = C.EQUIPOS[ganador].color;
      this.mostrar('p-fin');
    },

    pedirRevancha() {
      this.sonidos.activar();
      if (this.modo === 'online' && this.rol === 'invitado') {
        if (this.red) this.red.enviar({ t: 'revancha' });
        this.aviso('Le pedimos la revancha a tu rival…');
        return;
      }
      this.mostrar(null);
      this.reiniciarPartido();
    },

    irAlMenu() {
      this.tokenPrep++;
      if (this._continuarGuia) {
        const c = this._continuarGuia;
        this._continuarGuia = null;
        c();
      }
      if (this.red) {
        this.red.cerrar();
        this.red = null;
      }
      if (document.body.classList.contains('modo-ar')) {
        location.reload(); // AR.js deja su cámara abierta: recargar es lo más limpio
        return;
      }
      this.partido = null;
      this.cpu = null;
      this.modo = null;
      this.rol = null;
      this.fase = 'menu';
      this.ocultarLobby();
      $('#hud').classList.add('oculto');
      $('#mensaje-central').classList.add('oculto');
      document.body.classList.remove('en-juego');
      this.renderer.usarCamara(this.renderer.virtual, false);
      this.soltarWakeLock();
      this.mostrar('p-inicio');
    },

    /* ====================== MARCADOR / NOMBRES ====================== */
    nombresCortos() {
      if (this.modo === 'local') return ['JUGADOR 1', 'JUGADOR 2'];
      if (this.modo === 'cpu') return ['TÚ', 'MÁQUINA'];
      return this.rol === 'anfitrion' ? ['TÚ', 'RIVAL'] : ['RIVAL', 'TÚ'];
    },
    nombresLargos() {
      if (this.modo === 'local') return ['Jugador 1', 'Jugador 2'];
      if (this.modo === 'cpu') return ['Tú', 'Máquina'];
      return this.rol === 'anfitrion' ? ['Tú', 'Rival'] : ['Rival', 'Tú'];
    },
    etiquetas() {
      if (this.modo === 'local') return ['1', '2'];
      if (this.modo === 'cpu') return ['TÚ', 'CPU'];
      return this.rol === 'anfitrion' ? ['TÚ', '2'] : ['1', 'TÚ'];
    },
    actualizarNombres() {
      const n = this.nombresCortos();
      $('#nombre0').textContent = n[0];
      $('#nombre1').textContent = n[1];
      this._etiquetas = this.etiquetas();
    },
    actualizarMarcador(equipoQueAnoto = -1) {
      if (!this.partido) return;
      [0, 1].forEach((i) => {
        const el = $('#goles' + i);
        el.textContent = this.partido.marcador[i];
        if (i === equipoQueAnoto) {
          el.classList.remove('salto');
          void el.offsetWidth;
          el.classList.add('salto');
        }
      });
      $('#meta-goles').textContent = 'a ' + this.partido.golesParaGanar;
    },

    /* ====================== ENTRADAS ====================== */
    /**
     * Devuelve una lista de entradas en coordenadas de cancha:
     *  - mano: { mano:true, pies:[{x,y,ang},{x,y,ang}], x, y, xLado, dib }
     *  - puntero/teclado: { x, y, xLado, patear, lado? }
     */
    leerEntradas(ahora, dt) {
      const lista = [];
      this.manosDibujo = [];
      if (this.vistaAR && this.tracker.listo && this.ar && this.ar.video) {
        const manos = this.tracker.detectar(this.ar.video, ahora);
        const cam = this.camAR;
        for (const m of manos) {
          const puntos = m.puntos.map((p) => this.ar.videoAPantalla(p.x, p.y));
          const dib = { puntos, color: '#dfe6ff', lado: null };
          this.manosDibujo.push(dib);
          if (!cam.visible()) continue;
          const aPlano = (i) => cam.pantallaAPlano(puntos[i][0], puntos[i][1]);
          const p8 = aPlano(8);
          const p12 = aPlano(12);
          if (!p8 || !p12) continue;
          const p6 = aPlano(6) || p8;
          const p10 = aPlano(10) || p12;
          const muneca = aPlano(0) || [(p8[0] + p12[0]) / 2, 0];
          const pies = [
            { x: p8[0], y: p8[1], ang: Math.atan2(p8[1] - p6[1], p8[0] - p6[0]) },
            { x: p12[0], y: p12[1], ang: Math.atan2(p12[1] - p10[1], p12[0] - p10[0]) }
          ];
          lista.push({ mano: true, pies, x: (p8[0] + p12[0]) / 2, y: (p8[1] + p12[1]) / 2, xLado: muneca[0], dib });
        }
      }
      if (!this.vistaAR) {
        for (const p of this.puntero.lista()) {
          const f = this.renderer.virtual.pantallaAPlano(p.sx, p.sy);
          if (!f) continue;
          lista.push({ x: f[0], y: f[1], xLado: f[0], patear: p.patear });
        }
      }
      if (this.partido) for (const k of this.puntero.teclado(dt, this.partido)) lista.push(Object.assign({ xLado: k.x }, k));
      return lista;
    },

    /** Decide qué mano/dedo controla a cada jugador local. */
    asignar(entradas) {
      const res = [null, null];
      const libres = [];
      for (const e of entradas) {
        if (e.lado != null) {
          if (this.humanos.includes(e.lado) && !res[e.lado]) res[e.lado] = e;
        } else libres.push(e);
      }
      const masCercana = (lista, ref) => {
        if (!lista.length) return null;
        if (!ref) return lista[0];
        let mejor = null;
        let dMin = Infinity;
        for (const e of lista) {
          const d = (e.x - ref.x) ** 2 + (e.y - ref.y) ** 2;
          if (d < dMin) {
            dMin = d;
            mejor = e;
          }
        }
        return mejor;
      };
      if (this.humanos.length === 2) {
        // dos jugadores: tu mano es tuya si tu muñeca está en tu mitad
        for (const lado of [0, 1]) {
          if (res[lado]) continue;
          res[lado] = masCercana(libres.filter((e) => (e.xLado < W / 2) === (lado === 0)), this.ultimaPos[lado]);
        }
      } else if (this.humanos.length === 1) {
        const lado = this.humanos[0];
        if (!res[lado]) res[lado] = masCercana(libres, this.ultimaPos[lado]);
      }
      return res;
    },

    /** Convierte la entrada asignada en la posición de los dos pies del jugador. */
    controlarJugador(lado, e, t, dt) {
      const P = this.partido;
      if (e && e.mano) {
        if (this.tSinEntrada[lado] > 0.4) this.filtros[lado].forEach((f) => f.reiniciar());
        this.tSinEntrada[lado] = 0;
        const pies = e.pies.map((p, k) => Object.assign(this.filtros[lado][k].filtrar(p.x, p.y, t), { ang: p.ang }));
        if (e.dib) {
          e.dib.color = C.EQUIPOS[lado].color;
          e.dib.lado = lado;
          e.dib.numero = this._etiquetas[lado];
        }
        this.ultimaPos[lado] = { x: e.x, y: e.y };
        this.ultimosPies = this.ultimosPies || [null, null];
        this.ultimosPies[lado] = pies;
        P.fijarPies(lado, pies);
        return { pies, cuerpo: null };
      }
      if (this.vistaAR) {
        // con cámara: toleramos huecos cortos del detector, luego "¿Y tu mano?"
        this.tSinEntrada[lado] += dt;
        const ultimos = this.ultimosPies && this.ultimosPies[lado];
        if (this.tSinEntrada[lado] < 0.25 && ultimos) {
          P.fijarPies(lado, ultimos);
          return { pies: ultimos, cuerpo: null };
        }
        P.fijarPies(lado, null);
        return null;
      }
      // modo práctica: un muñeco que camina hacia el puntero
      if (e) this.ultimaPos[lado] = { x: e.x, y: e.y };
      const r = this.andadores[lado].actualizar(dt, e ? { x: e.x, y: e.y } : null, e && e.patear);
      P.fijarPies(lado, r.pies, r.cuerpo);
      return r;
    },

    /* ====================== BUCLE ====================== */
    bucle(ahora) {
      requestAnimationFrame(this._bucle);
      const dt = Math.min(0.05, Math.max(0, (ahora - (this.tPrev || ahora)) / 1000));
      this.tPrev = ahora;

      if (this.ar && this.ar.ancla) {
        this.ar.actualizar(dt);
        if (this.camAR) this.camAR.preparar();
      }

      if (!this.partido || this.fase === 'menu' || this.fase === 'carga' || this.fase === 'guia') {
        this.bucleFondo(dt);
        return;
      }

      const t = ahora / 1000;
      const corre = this.fase === 'juego' || this.fase === 'lobby' || this.fase === 'fin';
      const pasoDt = corre ? dt : 0;
      const entradas = this.leerEntradas(ahora, dt);
      const asig = this.asignar(entradas);
      if (this.fase === 'lobby') this.actualizarLobby(asig, dt);

      const propios = {};
      for (const lado of this.humanos) propios[lado] = this.controlarJugador(lado, asig[lado], t, pasoDt);

      const simulaAqui = this.modo !== 'online' || this.rol === 'anfitrion';
      if (simulaAqui) {
        if (this.cpu) {
          const o = this.cpu.actualizar(pasoDt);
          const r = this.andadores[1].actualizar(pasoDt, o, o.patear);
          this.partido.fijarPies(1, r.pies, r.cuerpo);
        }
        if (this.modo === 'online') {
          const viejo = performance.now() - (this.tEntradaRival || 0) > 1500;
          const r = viejo ? null : this.entradaRival;
          this.partido.fijarPies(1, r && r.pies, r && r.cuerpo);
        }
        if (corre) this.partido.actualizar(dt);
      } else if (corre) {
        this.partido.interpolarRed(dt, 1);
      }

      const eventos = this.partido.sacarEventos();
      if (this.modo === 'online' && simulaAqui) {
        this.eventosRed.push(...eventos);
        this.enviarEstado(ahora);
      } else if (this.modo === 'online') {
        this.enviarEntrada(ahora, propios[1]);
      }
      this.procesarEventos(eventos.concat(this.eventosRecibidos.splice(0)));

      this.renderer.actualizarEfectos(dt);
      this.renderer.dibujar(this.partido, {
        figuras: [0, 1].map((l) => !(this.vistaAR && this.humanos.includes(l))),
        etiquetas: this._etiquetas,
        locales: this.humanos,
        avisos: this.vistaAR && (this.fase === 'juego' || this.fase === 'lobby'),
        manos: this.manosDibujo,
        esqueleto: this.fase === 'lobby',
        rotulos: this.fase === 'lobby' && this.vistaAR ? this.nombresLargos() : null
      });
    },

    /** En el menú se ve un partido de fondo entre dos muñecos de la máquina. */
    bucleFondo(dt) {
      if (document.body.classList.contains('modo-ar')) {
        this.renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.renderer.ctx.clearRect(0, 0, this.renderer.c.width, this.renderer.c.height);
        return;
      }
      if (!this.fondo) {
        const p = new FG.Partido({ golesParaGanar: 999 });
        p.iniciar();
        this.fondo = {
          p,
          cpus: [new FG.CPU(p, 0, 'normal'), new FG.CPU(p, 1, 'normal')],
          andadores: [new FG.Andador(p, 0), new FG.Andador(p, 1)]
        };
      }
      const { p, cpus, andadores } = this.fondo;
      cpus.forEach((c, i) => {
        const o = c.actualizar(dt);
        const r = andadores[i].actualizar(dt, o, o.patear);
        p.fijarPies(i, r.pies, r.cuerpo);
      });
      p.actualizar(dt);
      p.sacarEventos();
      this.renderer.usarCamara(this.renderer.virtual, false);
      this.renderer.actualizarEfectos(dt);
      this.renderer.dibujar(p, { figuras: [true, true], etiquetas: ['1', '2'] });
    },

    procesarEventos(eventos) {
      const ahora = performance.now();
      for (const e of eventos) {
        switch (e.tipo) {
          case 'patada':
            this.sonidos.patada(e.fuerza);
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
            this.sonidos.rebote(e.fuerza);
            break;
          case 'poste':
            this.sonidos.poste();
            this.renderer.textoFlotante('¡Al palo!', e.x, e.y, '#ffffff');
            break;
          case 'cuenta':
            this.sonidos.cuenta(e.n);
            this.mensaje(String(e.n), 'cuenta', 700);
            break;
          case 'pitazo':
            this.sonidos.pitazo();
            this.mensaje('¡YA!', 'ya', 800);
            break;
          case 'gol':
            this.sonidos.gol();
            this.renderer.efectoGol(e.equipo);
            this.mensaje(this.textoGol(e.equipo), 'gol', 2100);
            this.actualizarMarcador(e.equipo);
            try { if (navigator.vibrate) navigator.vibrate([60, 40, 120]); } catch (err) { /* nada */ }
            break;
          case 'fin':
            this.sonidos.fin();
            this.fase = 'fin';
            setTimeout(() => this.mostrarFin(e.ganador), 500);
            break;
        }
      }
    },

    textoGol(equipo) {
      const color = C.EQUIPOS[equipo].color;
      let quien;
      if (this.modo === 'local') quien = 'de ' + this.nombresLargos()[equipo];
      else if (this.humanos.includes(equipo)) quien = '¡Golazo tuyo!';
      else quien = this.modo === 'cpu' ? 'de la máquina' : 'de tu rival';
      return `<span class="gol-txt">¡GOOOL!</span><span class="gol-quien" style="color:${color}">${quien}</span>`;
    },

    /* ====================== EN LÍNEA ====================== */
    mostrarOnline() {
      $('#online-opciones').classList.remove('oculto');
      $('#online-espera').classList.add('oculto');
      $('#online-error').classList.add('oculto');
      $('#btn-crear').disabled = false;
      this.mostrar('p-online');
    },

    errorOnline(texto) {
      const el = $('#online-error');
      el.innerHTML = texto;
      el.classList.remove('oculto');
      $('#btn-crear').disabled = false;
    },

    async conectarRed() {
      if (this.red) this.red.cerrar();
      this.red = new FG.Red();
      await this.red.conectar();
      const red = this.red;
      red.on('error', (m) => {
        if (this.fase === 'menu') {
          $('#online-espera').classList.add('oculto');
          $('#online-opciones').classList.remove('oculto');
          this.errorOnline(m.msg || 'Error en la sala');
        }
      });
      red.on('rival-salio', () => this.rivalSalio('Tu rival salió del partido.'));
      red.on('desconectado', () => this.rivalSalio('Se perdió la conexión con el servidor.'));
      red.on('in', (m) => {
        const pies = m.p ? m.p.map((q) => ({ x: q[0], y: q[1], ang: q[2] })) : null;
        const cuerpo = m.c ? { x: m.c[0], y: m.c[1], ang: m.c[2] } : null;
        this.entradaRival = pies ? { pies, cuerpo } : null;
        this.tEntradaRival = performance.now();
      });
      red.on('listo', () => {
        this.rivalListo = true;
      });
      red.on('revancha', () => {
        if (this.rol === 'anfitrion' && this.fase === 'fin') {
          this.aviso('Tu rival pidió la revancha 🔁');
          this.mostrar(null);
          this.reiniciarPartido();
        }
      });
      red.on('st', (m) => this.recibirEstado(m));
    },

    async crearSala() {
      $('#online-error').classList.add('oculto');
      $('#btn-crear').disabled = true;
      try {
        await this.conectarRed();
      } catch (e) {
        this.errorOnline(
          'No se pudo conectar al servidor del juego. Para jugar en línea ejecuta <code>npm start</code> y abre la página desde ese servidor (mira el README).'
        );
        return;
      }
      this.red.on('sala', (m) => {
        $('#codigo-sala').textContent = m.codigo;
        $('#online-opciones').classList.add('oculto');
        $('#online-espera').classList.remove('oculto');
      });
      this.red.on('rival-entro', () => {
        this.sonidos.boton();
        this.prepararPartida('online', 'anfitrion');
      });
      this.red.enviar({ t: 'crear' });
    },

    async unirse(codigo) {
      codigo = (codigo || '').trim().toUpperCase();
      $('#online-error').classList.add('oculto');
      if (codigo.length !== 4) {
        this.errorOnline('El código tiene 4 letras.');
        return;
      }
      try {
        await this.conectarRed();
      } catch (e) {
        this.errorOnline('No se pudo conectar al servidor del juego. Asegúrate de abrir la misma dirección que tu amigo.');
        return;
      }
      this.red.on('unido', () => this.prepararPartida('online', 'invitado'));
      this.red.enviar({ t: 'unir', codigo });
    },

    rivalSalio(texto) {
      if (this.fase === 'menu' || !this.modo) return;
      if (this.red) {
        this.red.cerrar();
        this.red = null;
      }
      this.alerta('Fin de la partida 😕', texto);
    },

    enviarEstado(ahora) {
      if (!this.red || ahora - this.tRed < 33) return; // ~30 veces por segundo
      this.tRed = ahora;
      const s = this.partido.estadoRed();
      s.t = 'st';
      s.ev = this.eventosRed.splice(0).map((e) => {
        const c = Object.assign({}, e);
        if (c.fuerza != null) c.fuerza = Math.round(c.fuerza);
        if (c.x != null) c.x = Math.round(c.x * 10) / 10;
        if (c.y != null) c.y = Math.round(c.y * 10) / 10;
        return c;
      });
      this.red.enviar(s);
    },

    enviarEntrada(ahora, control) {
      if (!this.red || ahora - this.tRed < 33) return;
      this.tRed = ahora;
      const r = (v) => Math.round(v * 10) / 10;
      const a = (v) => Math.round(v * 100) / 100;
      if (!control) {
        this.red.enviar({ t: 'in', p: null });
        return;
      }
      this.red.enviar({
        t: 'in',
        p: control.pies.map((q) => [r(q.x), r(q.y), a(q.ang)]),
        c: control.cuerpo ? [r(control.cuerpo.x), r(control.cuerpo.y), a(control.cuerpo.ang)] : null
      });
    },

    recibirEstado(m) {
      if (!this.partido || this.rol !== 'invitado') return;
      this.partido.aplicarRed(m);
      if (m.ev && m.ev.length) this.eventosRecibidos.push(...m.ev);
      if (this.fase === 'lobby' && m.e !== 'espera') {
        this.ocultarLobby();
        this.fase = 'juego';
      }
      if (this.fase === 'fin' && m.e === 'cuenta') {
        this.mostrar(null);
        this.fase = 'juego';
      }
      $('#meta-goles').textContent = 'a ' + m.gp;
    },

    /* ====================== EXTRAS ====================== */
    async pedirWakeLock() {
      try {
        if ('wakeLock' in navigator && !this.wakeLock) this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) { /* no disponible */ }
    },
    soltarWakeLock() {
      try {
        if (this.wakeLock) this.wakeLock.release();
      } catch (e) { /* nada */ }
      this.wakeLock = null;
    }
  };

  FG.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.iniciar());
  else App.iniciar();
})();
