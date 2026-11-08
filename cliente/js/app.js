/* ============================================================
   App principal: une todo.
   menú → (cámara + detector) → "muestra tu mano" → partido → fin
   Cada cuadro: leer manos/toques → gestos → asignar a jugadores →
   física (o red) → sonidos/efectos → dibujar.
   Dos formas de ver el juego:
   - Pantalla: la mesa 2D encima de tu cámara (render-pantalla.js)
   - Mesa 3D:  la mesa sobre un marcador en tu mesa real (ar.js + render-3d.js)
   ============================================================ */
(function () {
  const FG = window.FG;
  const C = FG.config;
  const U = FG.util;
  const { $, $$ } = U;
  const W = C.CANCHA.ancho;
  const LISTO_SEG = 0.8; // segundos con la mano visible para estar "listo"

  const MENSAJES_ERROR = {
    inseguro:
      'La cámara solo funciona si abres el juego desde <b>https://</b> o desde <b>localhost</b>. Ejecuta <code>npm start</code> y entra a <b>http://localhost:3000</b>.',
    'sin-soporte': 'Este navegador no deja usar la cámara. Prueba con Chrome, Edge o Safari actualizados.',
    permiso:
      'No tenemos permiso para usar la cámara. Toca el candado junto a la dirección, permite la cámara y pulsa <b>Reintentar</b>.',
    'sin-camara': 'No encontramos ninguna cámara conectada a este dispositivo.',
    ocupada: 'Otra app está usando la cámara (Zoom, Meet, otra pestaña…). Ciérrala y pulsa <b>Reintentar</b>.',
    mediapipe: 'No se pudo descargar el detector de manos (MediaPipe). Revisa tu conexión a internet.',
    arjs: 'No se pudo descargar la realidad aumentada (AR.js). Revisa tu conexión a internet y pulsa <b>Reintentar</b>.',
    modelo: 'No se pudo iniciar el detector de manos en este dispositivo.',
    desconocido: 'Algo falló al encender la cámara.'
  };

  // Íconos dibujados con SVG (trazo neón, sin emojis)
  const svg = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
  const NIVELES = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };

  const ICONOS = {
    pausa: svg('<path d="M8 5v14M16 5v14"/>'),
    cerrar: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    sonido: svg('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    mudo: svg('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/>'),
    copa: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>', ' class="copa"')
  };

  const App = {
    ajustes: {
      control: U.leer('control', 'manos'),
      goles: U.leer('goles', C.GOLES_POR_DEFECTO),
      dificultad: U.leer('dificultad', 'normal'),
      // por defecto, lo que pida el sistema (accesibilidad: "reducir movimiento")
      movimiento: U.leer('movimiento', U.sistemaPideMenosMovimiento() ? 'reducido' : 'normal')
    },
    fase: 'menu', // menu | tutorial | carga | lobby | juego | pausa | fin | alerta
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
    manosCrudas: [],
    vistaAR: false,   // true = mesa 3D sobre el marcador
    ahorro: false,    // modo ahorro (se activa solo si el juego va lento)
    pausaRed: null,   // en línea: { quien, hasta } mientras alguien reconecta

    /* ====================== ARRANQUE ====================== */
    iniciar() {
      this.video = $('#video');
      this.lienzo = $('#lienzo');
      this.render2D = new FG.RenderPantalla(this.lienzo, this.video);
      this.render3D = null; // se crea al entrar a la mesa 3D
      this.renderer = this.render2D;
      this.puntero = new FG.Puntero(this.lienzo);
      this.puntero.rotado = () => this.renderer.rotado;
      this.sonidos = new FG.Sonidos();
      this.tracker = new FG.HandTracker();
      this.tutorial = new FG.Tutorial(this);
      this.gestos = new FG.Gestos.DetectorGestos({ palma: C.GESTO_PAUSA_SEG, pulgar: C.GESTO_PULGAR_SEG });
      this.videoActivo = this.video;

      if (C.MODO_DEMO) {
        this.ajustes.control = 'tactil';
        $('#banner-demo').classList.remove('oculto');
        document.body.classList.add('demo');
        $('[data-ajuste="control"] [data-valor="manos"]').disabled = true;
        $('#btn-ar').classList.add('deshabilitado');
        $('#sub-ar').textContent = 'Necesita cámara: ejecuta el proyecto (mira el README)';
      }
      this.registrarServiceWorker();
      // En GitHub Pages (o en la vista previa) no corre el servidor de Node: sin modo en línea
      this.sinServidor = C.MODO_DEMO || /github\.io$/.test(location.hostname) || location.protocol === 'file:';
      if (this.sinServidor) {
        $('#sub-online').textContent = 'Necesita el servidor del juego (npm start o Render)';
        $('[data-modo="online"]').classList.add('deshabilitado');
      }


      this.conectarUI();
      this.refrescarAjustes();
      this.actualizarRecords();
      this._bucle = (t) => this.bucle(t);
      requestAnimationFrame(this._bucle);
    },

    conectarUI() {
      $$('.modo').forEach((b) => b.addEventListener('click', () => this.elegirModo(b.dataset.modo)));
      $('#btn-ar').addEventListener('click', () => this.abrirAR());
      $$('[data-ar-modo]').forEach((b) =>
        b.addEventListener('click', () => {
          this.sonidos.activar();
          this.sonidos.boton();
          this.prepararPartida(b.dataset.arModo, null, { ar: true });
        })
      );

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

      $$('[data-menu]').forEach((b) => b.addEventListener('click', () => this.irAlMenu()));
      $$('[data-volver]').forEach((b) => b.addEventListener('click', () => this.irAlMenu()));


      // carga
      $('#btn-reintentar').addEventListener('click', () => this.reintentar());
      $('#btn-sin-camara').addEventListener('click', () => {
        this.ajustes.control = 'tactil';
        U.guardar('control', 'tactil');
        this.refrescarAjustes();
        if (this.ultimaPrep) this.ultimaPrep.opciones = {}; // sin cámara no hay mesa 3D
        document.body.classList.remove('modo-ar');
        this.reintentar();
      });

      // tutorial animado: desde el inicio y desde la pausa
      $('#btn-ver-tutorial').addEventListener('click', async () => {
        this.sonidos.activar();
        this.sonidos.boton();
        this.fase = 'tutorial';
        // en la vista previa de Claude se muestra el video del juego real (con la cámara)
        await this.tutorial.abrir(C.MODO_DEMO ? 'manos' : this.varianteTutorial(), { final: 'Entendido' });
        if (this.fase === 'tutorial') {
          this.fase = 'menu';
          this.mostrar('p-inicio');
        }
      });
      $('#btn-pausa-tutorial').addEventListener('click', async () => {
        const completo = await this.tutorial.abrir(this.varianteTutorial(), { final: 'Volver al partido' });
        if (completo && this.fase === 'pausa') this.mostrar('p-pausa');
      });

      // lobby
      $('#btn-empezar-ya').addEventListener('click', () => this.empezarYa());

      // hud
      $('#btn-pausa').addEventListener('click', () => this.pausar());
      $('#btn-sonido').addEventListener('click', () => {
        this.sonidos.activar();
        const mudo = this.sonidos.alternar();
        $('#btn-sonido').innerHTML = mudo ? ICONOS.mudo : ICONOS.sonido;
      });
      $('#btn-sonido').innerHTML = this.sonidos.silencio ? ICONOS.mudo : ICONOS.sonido;
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
          this.aviso('Código copiado');
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
      $('#resumen-ajustes').textContent = (conManos ? 'Con la mano' : 'Con mouse') + ', a ' + this.ajustes.goles + ' goles';
      this.aplicarMovimiento();
      this.actualizarRecords();
    },

    /** "Movimiento: Reducido": sin temblor, destellos ni animaciones. */
    aplicarMovimiento() {
      const menos = this.ajustes.movimiento === 'reducido';
      document.body.classList.toggle('menos-movimiento', menos);
      this.render2D.menosMovimiento = menos;
      if (this.render3D) this.render3D.menosMovimiento = menos;
    },

    /** Guarda la página para abrirla sin internet (solo web: no instala nada). */
    registrarServiceWorker() {
      if (C.MODO_DEMO || !('serviceWorker' in navigator) || !window.isSecureContext) return;
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[FingerGol] sin modo offline', e));
      });
    },

    /** Tutorial con cámara ('manos') o con mouse/táctil ('tactil'), según cómo se va a jugar. */
    varianteTutorial() {
      const control = this.partido && this.controlActual ? this.controlActual : C.MODO_DEMO ? 'tactil' : this.ajustes.control;
      return control === 'manos' ? 'manos' : 'tactil';
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
      if (modo === 'online') {
        if (this.sinServidor) {
          this.aviso('El modo en línea necesita el servidor del juego (npm start o Render). Mira el README.', 4000);
          return;
        }
        this.mostrarOnline();
        return;
      }
      this.prepararPartida(modo);
    },

    /** Pantalla de la mesa 3D: marcador para imprimir y pasos. */
    abrirAR() {
      this.sonidos.activar();
      this.sonidos.boton();
      if (C.MODO_DEMO) {
        this.aviso('La mesa 3D necesita la cámara: ejecuta el proyecto con <b>npm start</b> (mira el README).', 4500);
        return;
      }
      const img = $('#img-marcador');
      if (!img.dataset.cargada) {
        img.dataset.cargada = '1';
        img.classList.remove('oculto');
        $('#marcador-falla').classList.add('oculto');
        $('#link-marcador').classList.remove('oculto');
        const urls = C.MARCADOR_HIRO;
        let i = 0;
        img.onerror = () => {
          i++;
          if (i < urls.length) {
            img.src = urls[i];
            $('#link-marcador').href = urls[i];
          } else {
            // sin internet: un aviso del mismo tamaño que la imagen
            img.classList.add('oculto');
            $('#marcador-falla').classList.remove('oculto');
            $('#link-marcador').classList.add('oculto');
            img.dataset.cargada = ''; // se vuelve a intentar la próxima vez
          }
        };
        img.src = urls[0];
        $('#link-marcador').href = urls[0];
      }
      this.mostrar('p-ar');
    },

    async prepararPartida(modo, rol = null, opciones = {}) {
      this.ultimaPrep = { modo, rol, opciones };
      const token = ++this.tokenPrep;
      this.modo = modo;
      this.rol = rol;
      this.vistaAR = !!opciones.ar;
      this.humanos = modo === 'local' ? [0, 1] : modo === 'cpu' ? [0] : rol === 'anfitrion' ? [0] : [1];
      this.partido = new FG.Partido({ golesParaGanar: this.ajustes.goles });
      this.cpu = modo === 'cpu' ? new FG.CPU(this.partido, 1, this.ajustes.dificultad) : null;
      this.filtros = [new U.FiltroEuro2D(1.6, 0.03), new U.FiltroEuro2D(1.6, 0.03)];
      this.ultimaPos = [null, null];
      this.tSinEntrada = [9, 9];
      this.listo = [0, 0];
      this.rivalListo = false;
      this.listoEnviado = false;
      this.entradaRival = null;
      this.eventosRed = [];
      this.eventosRecibidos = [];
      this.pausaGolpe = 0;
      this.camaraLenta = 0;
      this.pausaRed = null;
      this.controlActual = this.vistaAR ? 'manos' : C.MODO_DEMO ? 'tactil' : this.ajustes.control;
      this.puntero.reiniciar();
      this.gestos.reiniciar();

      // la primera vez: mini video de cómo se juega (con cámara o con mouse/táctil)
      // (la mesa 3D tiene su propia pantalla de pasos)
      const variante = this.controlActual === 'manos' ? 'manos' : 'tactil';
      const clave = variante === 'manos' ? 'tutorialManos' : 'tutorialTactil';
      if (!this.vistaAR && !U.leer(clave, false)) {
        this.fase = 'tutorial';
        const completo = await this.tutorial.abrir(variante, {
          final: variante === 'manos' ? 'Listo, encender la cámara' : '¡A jugar!'
        });
        if (!completo || token !== this.tokenPrep) return;
        U.guardar(clave, true);
      }
      this.fase = 'carga';

      if (this.vistaAR) {
        const ok = await this.prepararAR(token);
        if (!ok || token !== this.tokenPrep) return;
      } else if (this.controlActual === 'manos') {
        const ok = await this.prepararCamara(token);
        if (!ok || token !== this.tokenPrep) return;
      }
      this.entrarEscenario();
    },

    reintentar() {
      if (!this.ultimaPrep) return this.irAlMenu();
      this.prepararPartida(this.ultimaPrep.modo, this.ultimaPrep.rol, this.ultimaPrep.opciones);
    },

    /** Pantalla de carga: marca cada paso como activo, hecho o con error. */
    pantallaCarga(conAR) {
      this.mostrar('p-carga');
      const pasos = { camara: $('#paso-camara'), ar: $('#paso-ar'), modelo: $('#paso-modelo') };
      Object.values(pasos).forEach((p) => (p.dataset.estado = ''));
      pasos.ar.classList.toggle('oculto', !conAR);
      $('#carga-error').classList.add('oculto');
      $('#carga-spinner').classList.remove('oculto');
      $('#carga-titulo').textContent = conAR ? 'Preparando la mesa 3D…' : 'Preparando…';
      return pasos;
    },

    errorCarga(e, paso) {
      if (paso) paso.dataset.estado = 'fallo';
      $('#carga-spinner').classList.add('oculto');
      $('#carga-titulo').textContent = 'No pudimos empezar';
      $('#carga-error-texto').innerHTML = MENSAJES_ERROR[e.codigo] || MENSAJES_ERROR.desconocido;
      $('#carga-error').classList.remove('oculto');
    },

    /** Mesa 3D: AR.js abre la cámara y sigue el marcador; MediaPipe usa ese mismo video. */
    async prepararAR(token) {
      const pasos = this.pantallaCarga(true);
      let paso = null;
      const marcar = (p, estado) => {
        p.dataset.estado = estado;
        if (estado === 'activo') paso = p;
      };
      try {
        // si la cámara de la pantalla normal estaba abierta, se cierra: AR.js abre la suya
        FG.Camara.detener();
        this.video.srcObject = null;
        if (!this.ar) this.ar = new FG.RenderAR($('#contenedor-ar'));
        marcar(pasos.camara, 'activo');
        if (!this.ar.video) await this.ar.verificarCamara();
        marcar(pasos.camara, 'hecho');
        if (token !== this.tokenPrep) return false;

        marcar(pasos.ar, 'activo');
        await this.ar.cargarLibrerias();
        document.body.classList.add('modo-ar');
        if (!this.ar.video) await this.ar.crearEscena();
        this.camAR = FG.CamaraAR.desdeAR(this.ar);
        this.videoActivo = this.ar.video;
        marcar(pasos.ar, 'hecho');
        if (token !== this.tokenPrep) return false;

        marcar(pasos.modelo, 'activo');
        await this.tracker.cargar(2);
        if (token !== this.tokenPrep) return false;
        marcar(pasos.modelo, 'hecho');
        return true;
      } catch (e) {
        console.error('[FingerGol] error al preparar la mesa 3D', e);
        if (token !== this.tokenPrep) return false;
        this.errorCarga(e, paso);
        return false;
      }
    },

    async prepararCamara(token) {
      const pasos = this.pantallaCarga(false);
      let paso = null;
      const marcar = (p, estado) => {
        p.dataset.estado = estado;
        if (estado === 'activo') paso = p;
      };
      try {
        marcar(pasos.camara, 'activo');
        if (!FG.Camara.stream) await FG.Camara.iniciar(this.video);
        this.videoActivo = this.video;
        if (token !== this.tokenPrep) {
          FG.Camara.detener(); // el usuario volvió al menú mientras cargaba
          return false;
        }
        marcar(pasos.camara, 'hecho');
        marcar(pasos.modelo, 'activo');
        await this.tracker.cargar(2);
        if (token !== this.tokenPrep) return false;
        marcar(pasos.modelo, 'hecho');
        return true;
      } catch (e) {
        console.error('[FingerGol] error al preparar la cámara', e);
        if (token !== this.tokenPrep) return false;
        this.errorCarga(e, paso);
        return false;
      }
    },

    entrarEscenario() {
      this.mostrar(null);
      const conManos = this.controlActual === 'manos';
      const conCamaraPantalla = conManos && !this.vistaAR;
      document.body.classList.add('en-juego');
      document.body.classList.toggle('con-camara', conCamaraPantalla);
      document.body.classList.toggle('con-manos', conManos);

      if (this.vistaAR) {
        if (!this.render3D) this.render3D = new FG.Render3D(this.lienzo);
        this.render3D.ahorro = this.ahorro;
        this.render3D.usarCamara(this.camAR);
        this.renderer = this.render3D;
        this.aplicarMovimiento();
      } else {
        this.renderer = this.render2D;
        this.render2D.conCamara = conCamaraPantalla;
        // zona cómoda: el video se ve más grande, así el centro de la cámara cubre toda la mesa
        const zoom = conCamaraPantalla ? 1 / Math.min(1, Math.max(0.5, C.ZONA_MANO || 1)) : 1;
        this.render2D.zoomVideo = zoom;
        this.video.style.transform = zoom > 1 ? `scaleX(-1) scale(${zoom.toFixed(3)})` : '';
      }
      $('#hud').classList.remove('oculto');
      $('#btn-pausa').innerHTML = this.modo === 'online' ? ICONOS.cerrar : ICONOS.pausa;
      this.actualizarNombres();
      this.actualizarMarcador();
      this.pedirWakeLock();

      if (conManos || this.modo === 'online') this.abrirLobby();
      else this.empezarPartido();
    },

    abrirLobby() {
      this.fase = 'lobby';
      this._buscandoMarcador = undefined;
      const lobby = $('#p-lobby');
      lobby.classList.add('activa');
      lobby.classList.toggle('sin-lados', this.controlActual !== 'manos');
      const nombres = this.nombresLargos();
      [0, 1].forEach((lado) => {
        $(`#lado${lado}-nombre`).textContent = nombres[lado];
        $(`#lado${lado}`).classList.toggle('remoto', !this.humanos.includes(lado));
      });
      this.textosLobby();
      $('#lobby-tip').textContent = this.vistaAR
        ? 'El celular o el portátil quieto, viendo la mesa desde arriba.'
        : 'Con buena luz y la mano a 40–70 cm de la cámara.';
      $('#btn-empezar-ya').classList.toggle('oculto', this.modo === 'online' && this.rol === 'invitado');
      $('#lobby-gesto').classList.toggle('oculto', this.modo === 'online'); // en línea no hay pausa
    },

    /** Títulos del lobby (en la mesa 3D, primero hay que encontrar el marcador). */
    textosLobby() {
      const buscandoMarcador = this.vistaAR && !(this.camAR && this.camAR.visible());
      if (buscandoMarcador === this._buscandoMarcador) return;
      this._buscandoMarcador = buscandoMarcador;
      $('#p-lobby').classList.toggle('sin-lados', this.controlActual !== 'manos' || buscandoMarcador);
      if (buscandoMarcador) {
        $('#lobby-titulo').textContent = 'Apunta la cámara al marcador';
        $('#lobby-sub').textContent = 'Pon el marcador Hiro plano en el centro de tu mesa. La mesa 3D aparece encima.';
        return;
      }
      $('#lobby-titulo').textContent = this.controlActual === 'manos' ? 'Muestra tu mano' : 'Esperando a tu rival…';
      $('#lobby-sub').textContent =
        this.controlActual === 'manos'
          ? this.humanos.length === 2
            ? this.vistaAR
              ? 'Cada jugador toca la mesa con el dedo índice en su lado.'
              : 'Cada jugador apunta con el dedo índice en su lado.'
            : this.vistaAR
              ? 'Toca la mesa con el dedo índice. Tu mazo seguirá a tu dedo.'
              : 'Apunta con el dedo índice. Tu mazo seguirá a tu dedo.'
          : 'El partido empieza cuando los dos estén listos.';
    },

    ocultarLobby() {
      $('#p-lobby').classList.remove('activa');
      this._buscandoMarcador = undefined;
    },

    actualizarLobby(asig, dt) {
      this.textosLobby();
      const manos = this.controlActual === 'manos';
      for (const lado of this.humanos) {
        if (!manos) this.listo[lado] = LISTO_SEG;
        else if (asig[lado]) this.listo[lado] = Math.min(LISTO_SEG, this.listo[lado] + dt);
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
          estado.textContent = pct >= 1 ? '¡Listo! ✓' : asig[lado] ? 'Mantén la mano quieta…' : 'Pon tu mano de este lado';
        } else {
          const listoOtro = this.modo === 'cpu' || this.rivalListo;
          barra.style.width = listoOtro ? '100%' : '0%';
          panel.classList.toggle('listo', listoOtro);
          estado.textContent =
            this.modo === 'cpu' ? 'La máquina está lista' : this.rivalListo ? 'Rival listo ✓' : 'Esperando al rival…';
        }
      });

      const localesListos = this.humanos.every((l) => this.listo[l] >= LISTO_SEG);
      if (!localesListos) return;
      if (this.modo === 'online') {
        if (!this.listoEnviado) {
          this.red.enviar({ t: 'listo' });
          this.listoEnviado = true;
        }
        if (this.rol === 'anfitrion' && this.rivalListo) this.empezarPartido();
        else $('#lobby-sub').textContent = this.rol === 'anfitrion' ? 'Esperando a que tu rival muestre su mano…' : 'Esperando al anfitrión…';
      } else {
        this.empezarPartido();
      }
    },

    empezarYa() {
      this.sonidos.activar();
      if (this.modo === 'online') {
        if (this.rol === 'anfitrion') {
          this.red.enviar({ t: 'listo' });
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
      this.pausaGolpe = 0;
      this.camaraLenta = 0;
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
      let titulo;
      let sub;
      if (this.modo === 'local') {
        titulo = `¡Ganó ${this.nombresLargos()[ganador]}!`;
        sub = '¡Qué partidazo! ¿Otra?';
      } else if (this.modo === 'cpu') {
        titulo = mio ? '¡Le ganaste a la máquina!' : 'Ganó la máquina';
        sub = mio ? 'Prueba la dificultad “Difícil” en Ajustes.' : '¿La revancha?';
        this.mostrarRecord(this.registrarResultado(mio));
      } else {
        titulo = mio ? '¡Ganaste!' : 'Ganó tu rival';
        sub = this.rol === 'invitado' ? 'La revancha la inicia quien creó la sala.' : '';
      }
      if (this.modo !== 'cpu') $('#fin-record').classList.add('oculto');
      $('#fin-icono').innerHTML = this.modo === 'local' || mio ? ICONOS.copa : '';
      $('#fin-titulo').textContent = titulo;
      $('#fin-sub').textContent = sub;
      $('#fin-titulo').style.color = C.EQUIPOS[ganador].color;
      this.mostrar('p-fin');
    },

    /* ====================== RÉCORDS (contra la máquina) ====================== */
    leerRecords() {
      const r = U.leer('records', {});
      for (const n of Object.keys(NIVELES)) {
        r[n] = Object.assign({ victorias: 0, derrotas: 0, racha: 0, mejor: 0 }, r[n]);
      }
      return r;
    },

    /** Guarda el resultado de un partido terminado contra la máquina. */
    registrarResultado(gano) {
      const nivel = this.ajustes.dificultad;
      const todos = this.leerRecords();
      const r = todos[nivel];
      const mejorAntes = r.mejor;
      if (gano) {
        r.victorias++;
        r.racha++;
        r.mejor = Math.max(r.mejor, r.racha);
      } else {
        r.derrotas++;
        r.racha = 0;
      }
      U.guardar('records', todos);
      this.actualizarRecords();
      return { gano, nivel, racha: r.racha, mejor: r.mejor, nuevo: gano && r.mejor > mejorAntes && r.mejor > 1 };
    },

    mostrarRecord(res) {
      const el = $('#fin-record');
      const nivel = NIVELES[res.nivel];
      let texto = '';
      if (res.gano) {
        texto = `Racha en ${nivel}: ${res.racha} ${res.racha === 1 ? 'victoria' : 'victorias seguidas'}`;
        if (res.nuevo) texto += '. ¡Nuevo récord!';
      } else if (res.mejor > 0) {
        texto = `Tu mejor racha en ${nivel}: ${res.mejor} ${res.mejor === 1 ? 'victoria' : 'victorias seguidas'}`;
      }
      el.textContent = texto;
      el.classList.toggle('oculto', !texto);
    },

    /** Texto del botón "Contra la máquina" en el inicio. */
    actualizarRecords() {
      const nivel = this.ajustes.dificultad;
      const r = this.leerRecords()[nivel];
      let sub = 'Juegas solo';
      if (r.victorias > 0) {
        sub += ` · ${NIVELES[nivel]}: ${r.victorias} ${r.victorias === 1 ? 'victoria' : 'victorias'}, mejor racha ${r.mejor}`;
      }
      $('#sub-cpu').textContent = sub;
    },

    pedirRevancha() {
      this.sonidos.activar();
      if (this.modo === 'online' && this.rol === 'invitado') {
        this.red.enviar({ t: 'revancha' });
        this.aviso('Le pedimos la revancha a tu rival…');
        return;
      }
      this.mostrar(null);
      this.reiniciarPartido();
    },

    irAlMenu() {
      this.tokenPrep++;
      if (this.tutorial.abierto) this.tutorial.cerrar(false);
      if (this.red) {
        this.red.cerrar();
        this.red = null;
      }
      if (document.body.classList.contains('modo-ar')) {
        location.reload(); // AR.js deja su cámara y su escena abiertas: recargar es lo más limpio
        return;
      }
      this.ocultarAvisoRed(false);
      FG.Camara.detener();
      this.video.srcObject = null;
      this.video.style.transform = '';
      this.render2D.zoomVideo = 1;
      this.vistaAR = false;
      this.renderer = this.render2D;
      this.gestos.reiniciar();
      this.partido = null;
      this.cpu = null;
      this.modo = null;
      this.rol = null;
      this.fase = 'menu';
      this.ocultarLobby();
      $('#hud').classList.add('oculto');
      $('#mensaje-central').classList.add('oculto');
      document.body.classList.remove('en-juego', 'con-camara', 'con-manos');
      this.renderer.conCamara = false;
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
    leerEntradas(ahora, dt) {
      const lista = [];
      this.manosDibujo = [];
      this.manosCrudas = [];
      if (this.controlActual === 'manos' && this.tracker.listo) {
        // modo ahorro: se busca la mano un cuadro sí y otro no
        this._cuadro = (this._cuadro || 0) + 1;
        const manos = this.ahorro && this._cuadro % 2 ? this.tracker.manos : this.tracker.detectar(this.videoActivo, ahora);
        this.manosCrudas = manos;
        for (const m of manos) {
          const puntos = m.puntos.map((p) => this.videoAPantalla(p.x, p.y));
          const dib = { puntos, color: '#dfe6ff' };
          this.manosDibujo.push(dib);
          const f = this.pantallaAMesa(puntos[8][0], puntos[8][1]);
          if (!f) continue;
          const fm = this.pantallaAMesa(puntos[0][0], puntos[0][1]) || f;
          lista.push({ x: f[0], y: f[1], xLado: fm[0], mano: m, dib });
        }
      }
      if (this.controlActual === 'tactil') {
        for (const p of this.puntero.lista()) {
          const f = this.renderer.pantallaACancha(p.sx, p.sy);
          lista.push({ x: f[0], y: f[1], xLado: f[0] });
        }
      }
      for (const k of this.puntero.teclado(dt, this.partido)) lista.push(k);
      return lista;
    },

    /** Punto del video (0..1) -> píxel de pantalla (en la mesa 3D el video no va en espejo). */
    videoAPantalla(nx, ny) {
      return this.vistaAR ? this.ar.videoAPantalla(nx, ny) : this.render2D.videoAPantalla(nx, ny);
    },
    /** Píxel de pantalla -> punto de la mesa (en la mesa 3D: donde el dedo toca tu mesa). */
    pantallaAMesa(sx, sy) {
      if (!this.vistaAR) return this.render2D.pantallaACancha(sx, sy);
      return this.camAR && this.camAR.visible() ? this.camAR.pantallaAPlano(sx, sy) : null;
    },

    /* ====================== GESTOS ====================== */
    /**
     * Mano abierta (sostenida) = pausa · pulgar arriba = continuar o revancha.
     * Solo cuando se juega con la cámara.
     */
    revisarGestos(dt) {
      this.gestoVista = null;
      let buscar = [];
      if (this.controlActual === 'manos' && this.tracker.listo) {
        if (this.fase === 'juego' && this.modo !== 'online' && !this.tutorial.abierto) buscar = ['palma'];
        else if (this.fase === 'pausa' && $('#p-pausa').classList.contains('activa')) buscar = ['pulgar'];
        else if (this.fase === 'fin' && $('#p-fin').classList.contains('activa')) buscar = ['pulgar'];
      }
      if (!buscar.length) {
        this.gestos.reiniciar();
        this.pintarPistasGesto(0);
        return;
      }
      const v = this.videoActivo;
      const aspecto = v && v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
      const r = this.gestos.actualizar(this.manosCrudas, dt, buscar, aspecto);
      this.pintarPistasGesto(r.gesto === 'pulgar' ? r.progreso : 0);
      if (r.gesto === 'palma' && r.mano && !r.listo) {
        // anillo que se llena en el centro de la palma
        const centro = [0, 5, 9, 13, 17].reduce(
          (a, i) => [a[0] + r.mano.puntos[i].x / 5, a[1] + r.mano.puntos[i].y / 5],
          [0, 0]
        );
        this.gestoVista = { punto: this.videoAPantalla(centro[0], centro[1]), progreso: r.progreso, texto: 'Pausa' };
      }
      if (!r.listo) return;
      this.sonidos.boton();
      if (r.gesto === 'palma') this.pausar();
      else if (this.fase === 'pausa') this.continuar();
      else if (this.fase === 'fin') this.pedirRevancha();
    },

    pintarPistasGesto(progreso) {
      if (progreso === this._pistaGesto) return;
      this._pistaGesto = progreso;
      $$('.pista-gesto .gesto-barra i').forEach((i) => (i.style.width = Math.round(progreso * 100) + '%'));
    },

    /* ====================== MODO AHORRO ====================== */
    /** Si el juego va lento varios segundos seguidos, se apagan los brillos. */
    medirRendimiento(segundos) {
      if (this.ahorro || !(this.fase === 'juego' || this.fase === 'lobby') || document.hidden || segundos > 0.5) {
        this.rend = null;
        return;
      }
      const r = this.rend || (this.rend = { t: 0, n: 0, lentos: 0 });
      r.t += segundos;
      r.n++;
      if (r.t < 1) return;
      const fps = r.n / r.t;
      r.lentos = fps < C.FPS_MINIMO ? r.lentos + 1 : 0;
      r.t = 0;
      r.n = 0;
      if (r.lentos >= 3) this.activarAhorro();
    },

    activarAhorro() {
      if (this.ahorro) return;
      this.ahorro = true;
      this.render2D.ahorro = true;
      this.render2D.ajustar();
      if (this.render3D) {
        this.render3D.ahorro = true;
        this.render3D.ajustar();
      }
      document.body.classList.add('ahorro');
      this.aviso('Modo ahorro: quitamos brillos para que el juego vaya fluido.', 3500);
    },

    /** Decide qué mano/dedo controla a cada jugador. */
    asignar(entradas, t, dt) {
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
        const usadas = new Set();
        for (const lado of [0, 1]) {
          if (res[lado]) continue;
          const cand = libres.filter((e) => (e.xLado < W / 2) === (lado === 0));
          res[lado] = masCercana(cand, this.ultimaPos[lado]);
          if (res[lado]) usadas.add(res[lado]);
        }
        // si a un lado le falta mano y sobra una (ej. alguien se estiró hasta la mitad),
        // se decide por la punta del dedo
        for (const lado of [0, 1]) {
          if (res[lado]) continue;
          const cand = libres.filter((e) => !usadas.has(e) && (e.x < W / 2) === (lado === 0));
          res[lado] = masCercana(cand, this.ultimaPos[lado]);
          if (res[lado]) usadas.add(res[lado]);
        }
      } else if (this.humanos.length === 1) {
        const lado = this.humanos[0];
        if (!res[lado]) res[lado] = masCercana(libres, this.ultimaPos[lado]);
      }

      const salida = [null, null];
      for (const lado of [0, 1]) {
        const e = res[lado];
        if (e) {
          if (e.dib) e.dib.color = C.EQUIPOS[lado].color;
          if (this.tSinEntrada[lado] > 0.4) this.filtros[lado].reiniciar();
          this.tSinEntrada[lado] = 0;
          const p = e.mano ? this.filtros[lado].filtrar(e.x, e.y, t) : { x: e.x, y: e.y };
          this.ultimaPos[lado] = p;
          salida[lado] = p;
        } else {
          this.tSinEntrada[lado] += dt;
          // toleramos huecos cortos del detector
          if (this.tSinEntrada[lado] < 0.25 && this.ultimaPos[lado]) salida[lado] = this.ultimaPos[lado];
        }
      }
      return salida;
    },

    /* ====================== BUCLE ====================== */
    bucle(ahora) {
      requestAnimationFrame(this._bucle);
      const crudo = Math.max(0, (ahora - (this.tPrev || ahora)) / 1000);
      const dt = Math.min(0.05, crudo);
      this.tPrev = ahora;

      // mesa 3D: seguir el marcador y recalcular la cámara
      if (this.ar && this.ar.ancla) {
        this.ar.actualizar(dt);
        if (this.camAR) this.camAR.preparar();
      }

      if (!this.partido || this.fase === 'menu' || this.fase === 'carga' || this.fase === 'tutorial') {
        this.bucleFondo(dt);
        return;
      }
      this.medirRendimiento(crudo);

      const entradas = this.leerEntradas(ahora, dt);
      this.revisarGestos(dt);
      const asig = this.asignar(entradas, ahora / 1000, dt);
      if (this.fase === 'lobby') this.actualizarLobby(asig, dt);

      for (const lado of this.humanos) {
        const a = asig[lado];
        this.partido.fijarObjetivo(lado, a ? a.x : null, a ? a.y : null);
      }

      // en línea, mientras alguien reconecta el partido se congela
      const corre = (this.fase === 'juego' || this.fase === 'lobby' || this.fase === 'fin') && !this.pausaRed;
      if (this.pausaRed) this.actualizarAvisoRed();
      const simulaAqui = this.modo !== 'online' || this.rol === 'anfitrion';
      // "game feel": el juego se congela un instante al pegar fuerte y va en cámara lenta en el gol
      let dtFisica = dt;
      if (this.pausaGolpe > 0) {
        this.pausaGolpe -= dt;
        dtFisica = 0;
      } else if (this.camaraLenta > 0) {
        this.camaraLenta -= dt;
        dtFisica = dt * 0.3;
      }
      if (simulaAqui) {
        if (this.cpu) {
          const o = this.cpu.actualizar(corre ? dtFisica : 0);
          this.partido.fijarObjetivo(1, o.x, o.y);
        }
        if (this.modo === 'online') {
          const viejo = performance.now() - (this.tEntradaRival || 0) > 1500;
          const r = viejo ? null : this.entradaRival;
          this.partido.fijarObjetivo(1, r ? r.x : null, r ? r.y : null);
        }
        if (corre) this.partido.actualizar(dtFisica);
      } else if (corre) {
        this.partido.interpolarRed(dt, 1);
      }

      const eventos = this.partido.sacarEventos();
      if (this.modo === 'online' && simulaAqui) {
        this.eventosRed.push(...eventos);
        this.enviarEstado(ahora);
      } else if (this.modo === 'online') {
        this.enviarEntrada(ahora, asig[1]);
      }
      this.procesarEventos(eventos.concat(this.eventosRecibidos.splice(0)));
      this.revisarLuz(ahora);

      this.renderer.actualizarEfectos(dt);
      this.renderer.dibujar(this.partido, {
        manos: this.manosDibujo,
        etiquetas: this._etiquetas,
        locales: this.humanos,
        avisos: this.controlActual === 'manos' && (this.fase === 'juego' || this.fase === 'lobby'),
        rotulos: this.vistaAR && this.fase === 'lobby' ? this.nombresLargos() : null
      });
      if (this.gestoVista) this.renderer.dibujarGesto(this.gestoVista);
    },

    /** En el menú se ve un partido de fondo entre dos máquinas. */
    bucleFondo(dt) {
      if (document.body.classList.contains('modo-ar')) {
        // en la mesa 3D (cargando) no hay partido de fondo: se ve la cámara
        this.renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.renderer.ctx.clearRect(0, 0, this.lienzo.width, this.lienzo.height);
        return;
      }
      if (!this.fondo) {
        const p = new FG.Partido({ golesParaGanar: 999 });
        p.iniciar();
        this.fondo = { p, cpus: [new FG.CPU(p, 0, 'facil'), new FG.CPU(p, 1, 'facil')] };
      }
      const { p, cpus } = this.fondo;
      cpus.forEach((c, i) => {
        const o = c.actualizar(dt);
        p.fijarObjetivo(i, o.x, o.y);
      });
      p.actualizar(dt);
      p.sacarEventos();
      this.renderer.actualizarEfectos(dt);
      this.renderer.dibujar(p, { etiquetas: ['1', '2'], avisos: false });
    },

    procesarEventos(eventos) {
      const ahora = performance.now();
      for (const e of eventos) {
        switch (e.tipo) {
          case 'patada':
            this.sonidos.patada(e.fuerza);
            this.renderer.golpear(e.lado, e.fuerza);
            if (e.fuerza > 160 && ahora - (this.tGolpe || 0) > 250) {
              // golpe fuerte: pausa cortita + temblor (se siente el impacto)
              this.pausaGolpe = Math.min(0.09, 0.03 + e.fuerza / 5000);
              this.renderer.temblor = Math.max(this.renderer.temblor, 2 + e.fuerza / 70);
              this.tGolpe = ahora;
            }
            if (e.fuerza > 30 && ahora - (this.tChispa || 0) > 70) {
              this.renderer.efectoPatada(e.x, e.y, e.fuerza, C.EQUIPOS[e.lado].color);
              this.tChispa = ahora;
            }
            if (e.fuerza > 190 && ahora - (this.tFrase || 0) > 1500) {
              const frases = ['¡Cañonazo!', '¡Bombazo!', '¡Misil!', '¡Qué fuerza!'];
              this.renderer.textoFlotante(frases[(Math.random() * frases.length) | 0], e.x, e.y, C.EQUIPOS[e.lado].color);
              this.tFrase = ahora;
            }
            break;
          case 'rebote':
            this.sonidos.rebote(e.fuerza);
            break;
          case 'poste':
            this.sonidos.poste();
            this.renderer.textoFlotante('¡Rozó el arco!', e.x, e.y, '#ffffff');
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
            this.camaraLenta = 0.9;
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

    /** Cada 1.5 s mira qué tan oscura está la cámara; si no ve manos y hay poca luz, avisa. */
    revisarLuz(ahora) {
      if (this.controlActual !== 'manos' || !(this.fase === 'lobby' || this.fase === 'juego')) return;
      if (ahora - (this.tLuz || 0) < 1500) return;
      this.tLuz = ahora;
      const v = this.videoActivo;
      if (!v || v.readyState < 2) return;
      if (!this._luz) {
        this._luz = document.createElement('canvas');
        this._luz.width = 32;
        this._luz.height = 18;
      }
      const ctx = this._luz.getContext('2d', { willReadFrequently: true });
      let datos;
      try {
        ctx.drawImage(v, 0, 0, 32, 18);
        datos = ctx.getImageData(0, 0, 32, 18).data;
      } catch (e) {
        return;
      }
      let suma = 0;
      for (let i = 0; i < datos.length; i += 4) suma += 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
      const brillo = suma / (datos.length / 4);
      const sinManos = !this.manosDibujo.length;
      if (brillo < 60 && sinManos && ahora - (this.tAvisoLuz || 0) > 10000) {
        this.tAvisoLuz = ahora;
        this.aviso('Hay poca luz: acércate a una lámpara o ventana para que la cámara vea tu mano.', 4000);
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
      red.on('rival-salio', (m) =>
        this.rivalSalio(m && m.motivo === 'caida' ? 'Tu rival perdió la conexión y no volvió a tiempo.' : 'Tu rival salió del partido.')
      );
      red.on('desconectado', () => this.rivalSalio('Se perdió la conexión con el servidor y no se pudo volver.'));
      // reconexión: el partido se congela hasta que la conexión vuelva
      red.on('caida', (m) => this.mostrarAvisoRed('propia', m.hasta));
      red.on('reconectado', () => this.ocultarAvisoRed(true));
      red.on('rival-caido', (m) => this.mostrarAvisoRed('rival', Date.now() + (m.s || C.ESPERA_RECONEXION) * 1000));
      red.on('rival-volvio', () => this.ocultarAvisoRed(true));
      red.on('in', (m) => {
        this.entradaRival = m.x == null ? null : { x: m.x, y: m.y };
        this.tEntradaRival = performance.now();
      });
      red.on('listo', () => {
        this.rivalListo = true;
      });
      red.on('revancha', () => {
        if (this.rol === 'anfitrion' && this.fase === 'fin') {
          this.aviso('Tu rival pidió la revancha');
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
        this.errorOnline(
          'No se pudo conectar al servidor del juego. Asegúrate de abrir la misma dirección que tu amigo.'
        );
        return;
      }
      this.red.on('unido', () => this.prepararPartida('online', 'invitado'));
      this.red.enviar({ t: 'unir', codigo });
    },

    /** En línea: alguien perdió la conexión (quien = 'propia' | 'rival'). */
    mostrarAvisoRed(quien, hasta) {
      if (!this.modo) return;
      this.pausaRed = { quien, hasta };
      $('#aviso-red-titulo').textContent = quien === 'propia' ? 'Se cortó tu conexión' : 'Tu rival perdió la conexión';
      $('#aviso-red').classList.remove('oculto');
      this.actualizarAvisoRed();
    },

    actualizarAvisoRed() {
      if (!this.pausaRed) return;
      const seg = Math.max(0, Math.ceil((this.pausaRed.hasta - Date.now()) / 1000));
      const texto = (this.pausaRed.quien === 'propia' ? 'Reconectando… ' : 'Esperando a que vuelva… ') + seg + ' s';
      if (texto !== this._textoRed) {
        this._textoRed = texto;
        $('#aviso-red-texto').textContent = texto;
      }
    },

    /** Volvió la conexión: el partido sigue con el mismo marcador (con un 3-2-1). */
    ocultarAvisoRed(reanudar) {
      const estaba = !!this.pausaRed;
      this.pausaRed = null;
      this._textoRed = null;
      $('#aviso-red').classList.add('oculto');
      if (!reanudar || !estaba || !this.partido) return;
      if (this.modo === 'online' && this.rol === 'anfitrion') {
        if (this.partido.estado === 'jugando') this.partido.cambiarEstado('cuenta');
        this.tRed = 0; // mandar el estado de inmediato
      }
      this.aviso('Conexión recuperada');
    },

    rivalSalio(texto) {
      if (this.fase === 'menu' || !this.modo) return;
      this.ocultarAvisoRed(false);
      if (this.red) {
        this.red.cerrar();
        this.red = null;
      }
      this.alerta('Fin de la partida', texto);
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

    enviarEntrada(ahora, pos) {
      if (!this.red || ahora - this.tRed < 33) return;
      this.tRed = ahora;
      const r = (v) => Math.round(v * 10) / 10;
      this.red.enviar(pos ? { t: 'in', x: r(pos.x), y: r(pos.y) } : { t: 'in', x: null });
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
