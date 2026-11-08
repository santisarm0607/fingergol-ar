/* ============================================================
   Tutorial animado ("mini video") de cómo se juega.
   Se dibuja con el MISMO render de la mesa neón del juego, así
   lo que ve el jugador es igual a lo que va a jugar.

   Dos versiones, según el control elegido:
   - 'manos'  → con cámara: dedo índice = mazo, seguir, golpear, 2 jugadores
   - 'tactil' → mouse o táctil: mover, golpear, defender

   Cada paso dura unos segundos y pasa solo al siguiente (como un
   video). Tocar la animación la pausa.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const W = F.ancho;
  const H = F.alto;
  const { $ } = FG.util;

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const tramo = (t, a, b) => clamp01((t - a) / (b - a)); // avance de t dentro de [a, b]
  const suave = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  const PASOS = {
    manos: [
      {
        escena: 'dedo', dur: 4.8,
        titulo: 'Muestra tu dedo índice',
        texto: 'Ponte frente a la cámara y levanta el dedo índice. En la punta aparece un anillo de neón: ese es tu mazo.'
      },
      {
        escena: 'seguir', dur: 5.2,
        titulo: 'Tu mazo sigue tu dedo',
        texto: 'Mueve la mano y el mazo va contigo. Solo te mueves en tu mitad de la mesa.'
      },
      {
        escena: 'golpe', dur: 5.4,
        titulo: 'Golpe rápido = disparo fuerte',
        texto: 'Choca el disco con un movimiento rápido del dedo y mételo en el arco rival.'
      },
      {
        escena: 'dos', dur: 5,
        titulo: 'Dos jugadores, una mano cada uno',
        texto: 'Cada uno juega en su lado de la cámara. La mano es de quien tenga la muñeca en ese lado.'
      }
    ],
    tactil: [
      {
        escena: 'mover', dur: 4.6,
        titulo: 'Mueve tu mazo',
        texto: 'Mueve el mouse o arrastra el dedo por la pantalla: tu mazo te sigue.'
      },
      {
        escena: 'golpear', dur: 5.4,
        titulo: 'Golpea el disco',
        texto: 'Pásale por encima rápido para disparar. ¡Mételo en el arco rival!'
      },
      {
        escena: 'defender', dur: 5.6,
        titulo: 'Defiende tu arco',
        texto: 'La máquina también dispara: ponte delante del disco para tapar.',
        extra: 'Teclado: jugador 1 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · jugador 2 <kbd>flechas</kbd>'
      }
    ]
  };

  const ICONO_PAUSA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  const ICONO_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';

  class Tutorial {
    constructor(app) {
      this.app = app;
      this.lienzo = $('#tut-lienzo');
      this.caja = $('#tut-video');
      this.render = new FG.RenderPantalla(this.lienzo, null, { fijo: true });
      this.abierto = false;
      this._bucle = (t) => this.bucle(t);

      $('#tut-sig').addEventListener('click', () => {
        this.manual = true;
        this.siguiente();
      });
      $('#tut-atras').addEventListener('click', () => {
        this.manual = true;
        this.ir(this.i - 1);
      });
      $('#tut-saltar').addEventListener('click', () => this.cerrar(true));
      const pausa = () => {
        this.manual = true;
        this.ponerPausa(!this.pausado);
      };
      $('#tut-play').addEventListener('click', pausa);
      this.lienzo.addEventListener('click', pausa);
      window.addEventListener('resize', () => {
        if (this.abierto) this.render.ajustar();
      });
    }

    /**
     * Abre el tutorial. Devuelve una promesa: true si lo terminó o lo saltó,
     * false si se cerró desde fuera (por ejemplo, volver al menú).
     */
    abrir(variante, opciones = {}) {
      this.cerrar(false);
      this.variante = PASOS[variante] ? variante : 'tactil';
      this.pasos = PASOS[this.variante];
      this.textoFinal = opciones.final || '¡A jugar!';
      this.abierto = true;
      this.manual = false;
      this.caja.classList.toggle('con-camara', this.variante === 'manos');
      this.render.conCamara = this.variante === 'manos';
      this.app.mostrar('p-tutorial');
      this.render.ajustar();
      this.ir(0);
      this.tPrev = performance.now();
      requestAnimationFrame(this._bucle);
      return new Promise((resolver) => (this.resolver = resolver));
    }

    cerrar(completo) {
      if (!this.abierto) return;
      this.abierto = false;
      const r = this.resolver;
      this.resolver = null;
      if (r) r(completo);
    }

    ponerPausa(pausado) {
      this.pausado = pausado;
      $('#tut-play').innerHTML = pausado ? ICONO_PLAY : ICONO_PAUSA;
      $('#tut-play').setAttribute('aria-label', pausado ? 'Reproducir' : 'Pausar');
    }

    ir(i) {
      this.i = Math.max(0, Math.min(this.pasos.length - 1, i));
      this.t = 0;
      this.ponerPausa(false);
      const paso = this.pasos[this.i];
      const n = this.pasos.length;
      $('#tut-paso').textContent = `Paso ${this.i + 1} de ${n}`;
      $('#tut-titulo').textContent = paso.titulo;
      $('#tut-desc').textContent = paso.texto;
      const extra = $('#tut-extra');
      extra.innerHTML = paso.extra || '';
      extra.classList.toggle('oculto', !paso.extra);
      $('#tut-puntos').innerHTML = this.pasos
        .map((_, k) => `<i class="${k === this.i ? 'activo' : k < this.i ? 'visto' : ''}"></i>`)
        .join('');
      $('#tut-atras').disabled = this.i === 0;
      const ultimo = this.i === n - 1;
      $('#tut-sig').textContent = ultimo ? this.textoFinal : 'Siguiente';
      $('#tut-sig').classList.toggle('final', ultimo);
      this.preparar();
    }

    siguiente() {
      if (this.i < this.pasos.length - 1) this.ir(this.i + 1);
      else this.cerrar(true);
    }

    /** Un partido "de mentira" para cada escena. */
    preparar() {
      this.p = new FG.Partido({ golesParaGanar: 99 });
      this.p.estado = 'jugando';
      this.p.jugadores.forEach((j) => (j.activo = true));
      const R = this.render;
      R.particulas = [];
      R.textos = [];
      R.estela = [];
      R.destello = null;
      R.fuego = null;
      R.temblor = 0;
      this.camino = null;
      this.hecho = {};
      this.foco = null;
    }

    bucle(ahora) {
      if (!this.abierto) return;
      requestAnimationFrame(this._bucle);
      const dt = Math.min(0.05, Math.max(0, (ahora - this.tPrev) / 1000));
      this.tPrev = ahora;
      if (this.render.w < 10) this.render.ajustar();
      const paso = this.pasos[this.i];
      if (!this.pausado) {
        this.t += dt;
        if (this.t >= paso.dur) {
          if (!this.manual && this.i < this.pasos.length - 1) {
            this.ir(this.i + 1); // pasa solo al siguiente, como un video
            return;
          }
          this.t = 0;
          this.preparar();
        }
      }
      $('#tut-progreso').style.width = (100 * Math.min(1, this.t / paso.dur)).toFixed(1) + '%';
      this.dibujar(paso.escena, this.pausado ? 0 : dt);
    }

    /* ====================== AYUDAS ====================== */
    /** El disco sigue un camino fijo (para que el gol salga siempre). */
    lanzar(desde, hasta, t0, dur, alLlegar) {
      this.camino = { desde, hasta, t0, dur, alLlegar, listo: false };
      this.p.balon.x = desde[0];
      this.p.balon.y = desde[1];
    }
    moverDisco(dt) {
      const b = this.p.balon;
      const c = this.camino;
      if (!c || this.t < c.t0) {
        b.vx = b.vy = 0;
        return;
      }
      const u = suave(tramo(this.t, c.t0, c.t0 + c.dur));
      const nx = lerp(c.desde[0], c.hasta[0], u);
      const ny = lerp(c.desde[1], c.hasta[1], u);
      if (dt > 0) {
        b.vx = (nx - b.x) / dt;
        b.vy = (ny - b.y) / dt;
        b.giro += Math.hypot(nx - b.x, ny - b.y) / b.r;
      }
      b.x = nx;
      b.y = ny;
      if (u >= 1 && !c.listo) {
        c.listo = true;
        b.vx = b.vy = 0;
        if (c.alLlegar) c.alLlegar();
      }
    }
    una(clave, fn) {
      if (!this.hecho[clave]) {
        this.hecho[clave] = true;
        fn();
      }
    }
    /** Pone un mazo donde se le diga, sin salir de su mitad (igual que en el juego). */
    mazo(lado, x, y) {
      const j = this.p.jugadores[lado];
      const [cx, cy] = this.p.limitar(j, x, y);
      j.x = cx;
      j.y = cy;
      j.activo = true;
      return [cx, cy];
    }
    /** Mazo que persigue suave un punto (para la máquina). */
    perseguir(lado, x, y, dt, vel = 90) {
      const j = this.p.jugadores[lado];
      const [tx, ty] = this.p.limitar(j, x, y);
      const d = Math.hypot(tx - j.x, ty - j.y);
      const paso = vel * dt;
      if (d > paso) {
        j.x += ((tx - j.x) / d) * paso;
        j.y += ((ty - j.y) / d) * paso;
      } else {
        j.x = tx;
        j.y = ty;
      }
    }
    gol(lado) {
      this.render.efectoGol(lado);
      this.render.textoFlotante('¡GOOOL!', lado === 0 ? W - 22 : 22, H / 2, '#f4ff5a');
      this.app.sonidos.gol();
    }

    /* ====================== DIBUJO ====================== */
    dibujar(nombre, dt) {
      const R = this.render;
      const op = { etiquetas: ['TÚ', 'CPU'], avisos: false };
      const escena = this['escena_' + nombre].call(this, this.t, dt, op) || {};
      // "cámara" del video: se acerca y se aleja con suavidad
      // (con "Movimiento: Reducido" salta directo, sin paneos)
      const meta = escena.foco || { x: W / 2, y: H / 2, zoom: 1 };
      if (!this.foco) this.foco = Object.assign({}, meta);
      R.menosMovimiento = !!(this.app && this.app.ajustes.movimiento === 'reducido');
      const k = R.menosMovimiento ? 1 : dt > 0 ? 1 - Math.exp(-3.5 * dt) : 0;
      this.foco.x += (meta.x - this.foco.x) * k;
      this.foco.y += (meta.y - this.foco.y) * k;
      this.foco.zoom += (meta.zoom - this.foco.zoom) * k;
      R.enfocar(this.foco.x, this.foco.y, this.foco.zoom);

      this.moverDisco(dt);
      R.actualizarEfectos(dt);
      R.dibujar(this.p, op);
      const ctx = R.ctx;
      R.transformPantalla();
      if (escena.resaltarMitad != null) this.resaltarMitad(escena.resaltarMitad);
      if (escena.encima) escena.encima(ctx);
    }

    P(x, y) {
      return this.render.canchaAPantalla(x, y);
    }

    resaltarMitad(lado) {
      const ctx = this.render.ctx;
      const [x0, y0] = this.P(lado === 0 ? 0 : W / 2, 0);
      const [x1, y1] = this.P(lado === 0 ? W / 2 : W, H);
      const pulso = 0.1 + 0.08 * Math.sin(performance.now() / 220);
      ctx.fillStyle = FG.util.rgba(C.EQUIPOS[lado].color, pulso);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const [mx] = this.P(W / 2, 0);
      ctx.strokeStyle = '#f4ff5a';
      ctx.shadowColor = '#f4ff5a';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx, y0);
      ctx.lineTo(mx, y1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /** Letrerito con fondo oscuro y borde de neón. */
    etiqueta(texto, x, y, color = '#ffffff') {
      const ctx = this.render.ctx;
      ctx.font = '700 15px "Rajdhani", system-ui, sans-serif';
      const ancho = ctx.measureText(texto).width + 18;
      ctx.fillStyle = 'rgba(13,10,51,0.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - ancho / 2, y - 13, ancho, 26, 6);
      else ctx.rect(x - ancho / 2, y - 13, ancho, 26);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, x, y + 1);
    }

    /**
     * Mano con el índice levantado, vista desde la cámara.
     * (x, y) = punta del dedo en pantalla. El brazo sale desde abajo.
     */
    mano(x, y, color, encendido = 1, giro = 0) {
      const ctx = this.render.ctx;
      const T = Math.max(26, this.render.campo.s * 9); // largo del dedo
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(giro);
      ctx.globalAlpha = 0.93;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const piel = '#f0c4a0';
      const borde = '#a8714c';
      const forma = (fn) => {
        ctx.beginPath();
        fn();
        ctx.fillStyle = piel;
        ctx.fill();
        ctx.strokeStyle = borde;
        ctx.lineWidth = Math.max(1.5, T * 0.06);
        ctx.stroke();
      };
      const caja = (x0, y0, w, h, r) => () => {
        if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r);
        else ctx.rect(x0, y0, w, h);
      };
      forma(caja(-0.42 * T, 1.7 * T, 0.8 * T, 2.4 * T, 0.2 * T));      // antebrazo
      forma(caja(-0.62 * T, 0.78 * T, 1.18 * T, 1.15 * T, 0.38 * T));  // puño
      // nudillos de los dedos doblados
      for (let k = 0; k < 3; k++) {
        forma(caja(-0.05 * T + k * 0.18 * T, 0.7 * T, 0.2 * T, 0.42 * T, 0.1 * T));
      }
      forma(caja(-0.72 * T, 1.05 * T, 0.62 * T, 0.32 * T, 0.16 * T));  // pulgar
      forma(caja(-0.2 * T, -0.02 * T, 0.38 * T, 1.15 * T, 0.19 * T));  // índice levantado
      ctx.globalAlpha = 1;
      ctx.restore();
      // anillo de neón en la punta: ahí está tu mazo
      if (encendido > 0) {
        ctx.save();
        ctx.globalAlpha = encendido;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y + T * 0.08, Math.max(12, T * 0.42), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    cursor(x, y, clic) {
      const ctx = this.render.ctx;
      if (clic > 0) {
        ctx.strokeStyle = `rgba(244,255,90,${1 - clic})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 8 + clic * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(6, 17);
      ctx.lineTo(10, 26);
      ctx.lineTo(14, 24);
      ctx.lineTo(10, 15.5);
      ctx.lineTo(17, 15.5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0d0a33';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    /* ====================== ESCENAS CON CÁMARA ====================== */
    escena_dedo(t, dt, op) {
      // la mano sube desde abajo y en la punta se "prende" el mazo
      const sube = suave(tramo(t, 0.2, 1.4));
      const x = 42;
      const y = lerp(H + 40, 52, sube);
      const prendido = t > 1.5 ? 1 : 0;
      if (prendido) this.mazo(0, x, 52);
      else Object.assign(this.p.jugadores[0], { x: -500, y: -500 }); // antes de prender, el mazo no está
      this.perseguir(1, 128, 50, dt);
      if (t > 1.5) this.una('prender', () => this.app.sonidos.boton());
      return {
        foco: { x: 52, y: 52, zoom: 1.55 },
        encima: () => {
          const [sx, sy] = this.P(x, y);
          const parpadeo = t < 1.5 ? 0 : t < 1.62 ? 1 : t < 1.72 ? 0.25 : 1;
          this.mano(sx, sy, C.EQUIPOS[0].color, parpadeo);
          if (t > 1.9) {
            const T = this.render.campo.s * 9;
            this.etiqueta('Este es tu mazo', sx + T * 1.9, sy - T * 0.4, C.EQUIPOS[0].color);
          }
        }
      };
    }

    escena_seguir(t, dt, op) {
      // el dedo pasea por su mitad; al final intenta cruzar y el mazo se queda en la raya
      const cruzar = tramo(t, 3.2, 4.3);
      const fx = cruzar > 0 ? lerp(52, 104, suave(cruzar)) : 44 + Math.sin(t * 1.7) * 22;
      const fy = cruzar > 0 ? 46 : 50 + Math.sin(t * 2.6) * 28;
      const [mx, my] = this.mazo(0, fx, fy);
      this.perseguir(1, 128, 50 + Math.sin(t) * 10, dt);
      this.p.balon.x = 112;
      this.p.balon.y = 80;
      return {
        foco: { x: 76, y: 50, zoom: 1.1 },
        resaltarMitad: t > 3 ? 0 : null,
        encima: () => {
          const [sx, sy] = this.P(fx, fy);
          this.mano(sx, sy, C.EQUIPOS[0].color, 1);
          if (cruzar > 0.6) {
            const [ex, ey] = this.P(mx, my);
            this.etiqueta('El mazo no pasa la mitad', ex, ey - this.render.campo.s * 14, '#f4ff5a');
          }
        }
      };
    }

    escena_golpe(t, dt, op) {
      // el dedo se acerca al disco y le pega rápido: gol
      if (!this.camino) this.lanzar([66, 50], [W + 4, 46], 0.9, 0.7, () => this.gol(0));
      let fx;
      if (t < 0.85) fx = lerp(36, 52, suave(tramo(t, 0, 0.85)));
      else if (t < 1.05) fx = lerp(52, 72, tramo(t, 0.85, 1.05));
      else fx = lerp(72, 50, tramo(t, 1.3, 2.4));
      const fy = 51;
      this.mazo(0, fx, fy);
      if (t > 0.9) this.una('golpe', () => {
        this.render.golpear(0, 260);
        this.render.efectoPatada(66, 50, 260, C.EQUIPOS[0].color);
        this.render.temblor = 6;
        this.app.sonidos.patada(260);
      });
      const portero = t < 1.25 ? 40 : lerp(40, 56, tramo(t, 1.25, 2.2));
      this.perseguir(1, 146, portero, dt, 70);
      return {
        foco: t < 1 ? { x: 62, y: 50, zoom: 1.6 } : { x: W / 2, y: H / 2, zoom: 1 },
        encima: () => {
          const [sx, sy] = this.P(fx, fy);
          this.mano(sx, sy, C.EQUIPOS[0].color, 1, t > 0.85 && t < 1.1 ? 0.18 : 0);
          if (t > 0.8 && t < 1.7) this.etiqueta('¡Rápido!', sx, sy - this.render.campo.s * 13, '#f4ff5a');
        }
      };
    }

    escena_dos(t, dt, op) {
      op.etiquetas = ['1', '2'];
      const a = [40 + Math.sin(t * 1.6) * 16, 50 + Math.sin(t * 2.2) * 24];
      const b = [120 + Math.sin(t * 1.3 + 1) * 16, 50 + Math.cos(t * 1.9) * 24];
      this.mazo(0, a[0], a[1]);
      this.mazo(1, b[0], b[1]);
      this.p.balon.x = W / 2;
      this.p.balon.y = H / 2;
      return {
        encima: () => {
          const pa = this.P(a[0], a[1]);
          const pb = this.P(b[0], b[1]);
          this.mano(pa[0], pa[1], C.EQUIPOS[0].color, 1);
          this.mano(pb[0], pb[1], C.EQUIPOS[1].color, 1);
          const [x0, y0] = this.P(W * 0.25, 8);
          const [x1, y1] = this.P(W * 0.75, 8);
          this.etiqueta('Jugador 1', x0, y0, C.EQUIPOS[0].color);
          this.etiqueta('Jugador 2', x1, y1, C.EQUIPOS[1].color);
        }
      };
    }

    /* ====================== ESCENAS SIN CÁMARA ====================== */
    escena_mover(t, dt) {
      const fx = 44 + Math.sin(t * 1.4) * 24;
      const fy = 50 + Math.sin(t * 2.3) * 28;
      this.mazo(0, fx, fy);
      this.perseguir(1, 128, 50 + Math.sin(t * 1.2) * 12, dt);
      this.p.balon.x = 112;
      this.p.balon.y = 80;
      return {
        foco: { x: 70, y: 50, zoom: 1.15 },
        encima: () => {
          const [sx, sy] = this.P(fx, fy);
          this.cursor(sx + 6, sy + 6, 0);
        }
      };
    }

    escena_golpear(t, dt) {
      if (!this.camino) this.lanzar([70, 48], [W + 4, 44], 1.38, 0.75, () => this.gol(0));
      let fx;
      let fy;
      if (t < 1.35) {
        fx = lerp(30, 58, suave(tramo(t, 0, 1.35)));
        fy = lerp(66, 49, suave(tramo(t, 0, 1.35)));
      } else if (t < 1.55) {
        fx = lerp(58, 78, tramo(t, 1.35, 1.55));
        fy = 48.5;
      } else {
        fx = lerp(78, 56, tramo(t, 1.8, 2.8));
        fy = 48.5;
      }
      this.mazo(0, fx, fy);
      if (t > 1.37) this.una('golpe', () => {
        this.render.golpear(0, 240);
        this.render.efectoPatada(70, 48, 240, C.EQUIPOS[0].color);
        this.app.sonidos.patada(240);
      });
      this.perseguir(1, 146, t < 1.7 ? 60 : 50, dt, 60);
      const barrido = t > 1.3 && t < 1.7 ? tramo(t, 1.3, 1.7) : 0;
      return {
        foco: t < 1.5 ? { x: 62, y: 52, zoom: 1.5 } : { x: W / 2, y: H / 2, zoom: 1 },
        encima: () => {
          const [sx, sy] = this.P(fx, fy);
          this.cursor(sx + 6, sy + 6, barrido);
          if (barrido > 0) this.etiqueta('¡Pasa rápido!', sx, sy - this.render.campo.s * 12, '#f4ff5a');
        }
      };
    }

    escena_defender(t, dt) {
      // la máquina dispara hacia tu arco y tú lo tapas
      if (!this.camino) {
        this.lanzar([100, 40], [24, 55], 1.0, 0.75, () => {
          this.render.textoFlotante('¡Atajada!', 24, 55, C.EQUIPOS[0].color);
          this.render.golpear(0, 120);
          this.app.sonidos.patada(180);
          this.lanzar([24, 55], [70, 20], this.t, 0.9, null);
        });
      }
      const fx = t < 0.8 ? 30 : 17;
      const fy = t < 0.8 ? 30 : lerp(30, 56, suave(tramo(t, 0.8, 1.5)));
      this.mazo(0, fx, fy);
      const [rx, ry] = t < 0.95 ? [112, 38] : [118, 42];
      this.perseguir(1, rx, ry, dt, 120);
      if (t > 0.95) this.una('disparo', () => this.render.golpear(1, 200));
      return {
        foco: { x: 60, y: 48, zoom: 1.2 },
        resaltarMitad: 0,
        encima: () => {
          const [sx, sy] = this.P(fx, fy);
          this.cursor(sx + 6, sy + 6, 0);
          const [ex, ey] = this.P(W * 0.25, 7);
          this.etiqueta('Tu mitad', ex, ey, C.EQUIPOS[0].color);
        }
      };
    }
  }

  FG.Tutorial = Tutorial;
})();
