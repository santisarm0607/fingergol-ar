/* ============================================================
   App principal: une todo.
   menú → (cámara + detector) → "muestra tu mano" → partido → fin
   Cada cuadro: leer manos/toques → asignar a jugadores →
   física (o red) → sonidos/efectos → dibujar.
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
    modelo: 'No se pudo iniciar el detector de manos en este dispositivo.',
    desconocido: 'Algo falló al encender la cámara.'
  };

  // Íconos dibujados con SVG (trazo neón, sin emojis)
  const svg = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
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
      dificultad: U.leer('dificultad', 'normal')
    },
    fase: 'menu', // menu | carga | lobby | juego | pausa | fin | alerta
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
      this.video = $('#video');
      this.lienzo = $('#lienzo');
      this.renderer = new FG.RenderPantalla(this.lienzo, this.video);
      this.puntero = new FG.Puntero(this.lienzo);
      this.puntero.rotado = () => this.renderer.rotado;
      this.sonidos = new FG.Sonidos();
      this.tracker = new FG.HandTracker();
      this.videoActivo = this.video;

      if (C.MODO_DEMO) {
        this.ajustes.control = 'tactil';
        $('#banner-demo').classList.remove('oculto');
        document.body.classList.add('demo');
        $('[data-ajuste="control"] [data-valor="manos"]').disabled = true;
      }
      // En GitHub Pages (o en la vista previa) no corre el servidor de Node: sin modo en línea
      this.sinServidor = C.MODO_DEMO || /github\.io$/.test(location.hostname) || location.protocol === 'file:';
      if (this.sinServidor) {
        $('#sub-online').textContent = 'Necesita el servidor del juego (npm start o Render)';
        $('[data-modo="online"]').classList.add('deshabilitado');
      }


      this.conectarUI();
      this.refrescarAjustes();
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

      $$('[data-menu]').forEach((b) => b.addEventListener('click', () => this.irAlMenu()));
      $$('[data-volver]').forEach((b) => b.addEventListener('click', () => this.irAlMenu()));


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

    async prepararPartida(modo, rol = null) {
      this.ultimaPrep = { modo, rol };
      const token = ++this.tokenPrep;
      this.modo = modo;
      this.rol = rol;
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
      this.controlActual = C.MODO_DEMO ? 'tactil' : this.ajustes.control;
      this.puntero.reiniciar();
      this.fase = 'carga';

      if (this.controlActual === 'manos') {
        const ok = await this.prepararCamara(token);
        if (!ok || token !== this.tokenPrep) return;
      }
      this.entrarEscenario();
    },

    reintentar() {
      if (!this.ultimaPrep) return this.irAlMenu();
      this.prepararPartida(this.ultimaPrep.modo, this.ultimaPrep.rol);
    },

    async prepararCamara(token) {
      this.mostrar('p-carga');
      const pasos = { camara: $('#paso-camara'), modelo: $('#paso-modelo') };
      Object.values(pasos).forEach((p) => (p.dataset.estado = ''));
      $('#carga-error').classList.add('oculto');
      $('#carga-spinner').classList.remove('oculto');
      $('#carga-titulo').textContent = 'Preparando el juego…';
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
        if (paso) paso.dataset.estado = 'fallo';
        $('#carga-spinner').classList.add('oculto');
        $('#carga-titulo').textContent = 'No pudimos empezar';
        $('#carga-error-texto').innerHTML = MENSAJES_ERROR[e.codigo] || MENSAJES_ERROR.desconocido;
        $('#carga-error').classList.remove('oculto');
        return false;
      }
    },

    entrarEscenario() {
      this.mostrar(null);
      const conCamaraPantalla = this.controlActual === 'manos';
      document.body.classList.add('en-juego');
      document.body.classList.toggle('con-camara', conCamaraPantalla);
      this.renderer.conCamara = conCamaraPantalla;
      $('#hud').classList.remove('oculto');
      $('#btn-pausa').innerHTML = this.modo === 'online' ? ICONOS.cerrar : ICONOS.pausa;
      this.actualizarNombres();
      this.actualizarMarcador();
      this.pedirWakeLock();

      if (this.controlActual === 'manos' || this.modo === 'online') this.abrirLobby();
      else this.empezarPartido();
    },

    abrirLobby() {
      this.fase = 'lobby';
      const lobby = $('#p-lobby');
      lobby.classList.add('activa');
      lobby.classList.toggle('sin-lados', this.controlActual !== 'manos');
      const nombres = this.nombresLargos();
      [0, 1].forEach((lado) => {
        $(`#lado${lado}-nombre`).textContent = nombres[lado];
        $(`#lado${lado}`).classList.toggle('remoto', !this.humanos.includes(lado));
      });
      $('#lobby-titulo').textContent = this.controlActual === 'manos' ? 'Muestra tu mano' : 'Esperando a tu rival…';
      $('#lobby-sub').textContent =
        this.controlActual === 'manos'
          ? this.humanos.length === 2
            ? 'Cada jugador apunta con el dedo índice en su lado.'
            : 'Apunta con el dedo índice. Tu ficha seguirá a tu dedo.'
          : 'El partido empieza cuando los dos estén listos.';
      $('#btn-empezar-ya').classList.toggle('oculto', this.modo === 'online' && this.rol === 'invitado');
    },

    ocultarLobby() {
      $('#p-lobby').classList.remove('activa');
    },

    actualizarLobby(asig, dt) {
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
      } else {
        titulo = mio ? '¡Ganaste!' : 'Ganó tu rival';
        sub = this.rol === 'invitado' ? 'La revancha la inicia quien creó la sala.' : '';
      }
      $('#fin-icono').innerHTML = this.modo === 'local' || mio ? ICONOS.copa : '';
      $('#fin-titulo').textContent = titulo;
      $('#fin-sub').textContent = sub;
      $('#fin-titulo').style.color = C.EQUIPOS[ganador].color;
      this.mostrar('p-fin');
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
      if (this.red) {
        this.red.cerrar();
        this.red = null;
      }
      FG.Camara.detener();
      this.video.srcObject = null;
      this.partido = null;
      this.cpu = null;
      this.modo = null;
      this.rol = null;
      this.fase = 'menu';
      this.ocultarLobby();
      $('#hud').classList.add('oculto');
      $('#mensaje-central').classList.add('oculto');
      document.body.classList.remove('en-juego', 'con-camara');
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
      if (this.controlActual === 'manos' && this.tracker.listo) {
        const mapa = this.renderer;
        const manos = this.tracker.detectar(this.videoActivo, ahora);
        for (const m of manos) {
          const puntos = m.puntos.map((p) => mapa.videoAPantalla(p.x, p.y));
          const dib = { puntos, color: '#dfe6ff' };
          this.manosDibujo.push(dib);
          const f = mapa.pantallaACancha(puntos[8][0], puntos[8][1]);
          if (!f) continue;
          const fm = mapa.pantallaACancha(puntos[0][0], puntos[0][1]) || f;
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
        for (const lado of [0, 1]) {
          if (res[lado]) continue;
          const cand = libres.filter((e) => (e.xLado < W / 2) === (lado === 0));
          res[lado] = masCercana(cand, this.ultimaPos[lado]);
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
      const dt = Math.min(0.05, Math.max(0, (ahora - (this.tPrev || ahora)) / 1000));
      this.tPrev = ahora;

      if (!this.partido || this.fase === 'menu' || this.fase === 'carga') {
        this.bucleFondo(dt);
        return;
      }

      const entradas = this.leerEntradas(ahora, dt);
      const asig = this.asignar(entradas, ahora / 1000, dt);
      if (this.fase === 'lobby') this.actualizarLobby(asig, dt);

      for (const lado of this.humanos) {
        const a = asig[lado];
        this.partido.fijarObjetivo(lado, a ? a.x : null, a ? a.y : null);
      }

      const corre = this.fase === 'juego' || this.fase === 'lobby' || this.fase === 'fin';
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
        avisos: this.controlActual === 'manos' && (this.fase === 'juego' || this.fase === 'lobby')
      });
    },

    /** En el menú se ve un partido de fondo entre dos máquinas. */
    bucleFondo(dt) {
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
      red.on('rival-salio', () => this.rivalSalio('Tu rival salió del partido.'));
      red.on('desconectado', () => this.rivalSalio('Se perdió la conexión con el servidor.'));
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

    rivalSalio(texto) {
      if (this.fase === 'menu' || !this.modo) return;
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
