/* ============================================================
   Motor del partido: balón, jugadores, paredes, postes y goles.
   Todo se mide en "unidades de cancha" (160 x 100), no en píxeles,
   así la misma lógica sirve para la pantalla, la mesa AR y la red.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const { clamp } = FG.util;

  const PASO = 1 / 120;          // la física corre a 120 Hz fijos
  const R_BALON = 3.4;
  const R_JUGADOR = 7;
  const R_POSTE = 1.3;
  const FRICCION = 0.55;         // cuánto frena el balón por segundo
  const V_MAX_BALON = 270;
  const V_MAX_JUGADOR = 520;
  const REBOTE_PARED = 0.8;
  const REBOTE_JUGADOR = 0.85;
  const SEGUIR = 32;             // qué tan rápido la ficha sigue a tu dedo
  const T_CUENTA = 0.75;         // segundos por número en el 3-2-1
  const T_GOL = 2.3;             // duración del festejo

  class Partido {
    constructor(opciones = {}) {
      const c = FG.config.CANCHA;
      this.W = c.ancho;
      this.H = c.alto;
      this.arco = c.arco;
      this.fondoArco = c.fondoArco;
      this.y1 = (this.H - this.arco) / 2;
      this.y2 = this.y1 + this.arco;
      this.golesParaGanar = opciones.golesParaGanar || FG.config.GOLES_POR_DEFECTO;

      this.balon = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0, r: R_BALON, giro: 0 };
      this.jugadores = [0, 1].map((lado) => ({
        lado,
        x: lado ? this.W * 0.78 : this.W * 0.22,
        y: this.H / 2,
        vx: 0,
        vy: 0,
        r: R_JUGADOR,
        objX: null,
        objY: null,
        activo: false
      }));
      this.postes = [
        [0, this.y1], [0, this.y2],
        [this.W, this.y1], [this.W, this.y2]
      ];
      this.marcador = [0, 0];
      this.estado = 'espera'; // espera | cuenta | jugando | gol | fin
      this.t = 0;
      this.cuenta = 0;
      this.ultimoGol = -1;
      this.ganador = -1;
      this.eventos = [];
      this.acumulado = 0;
      this.red = null; // datos recibidos por red (solo el invitado)
    }

    /* ---------- eventos para sonidos y efectos ---------- */
    emitir(tipo, datos) {
      this.eventos.push(Object.assign({ tipo }, datos || {}));
    }
    sacarEventos() {
      const e = this.eventos;
      this.eventos = [];
      return e;
    }

    /* ---------- flujo del partido ---------- */
    iniciar() {
      this.marcador = [0, 0];
      this.ganador = -1;
      this.ultimoGol = -1;
      this.colocarSaque();
      this.cambiarEstado('cuenta');
    }
    colocarSaque() {
      const b = this.balon;
      b.x = this.W / 2;
      b.y = this.H / 2;
      b.vx = b.vy = 0;
    }
    cambiarEstado(e) {
      this.estado = e;
      this.t = 0;
      if (e === 'cuenta') this.cuenta = 4;
    }

    /** Dónde quiere estar el jugador (posición del dedo). null = no hay mano. */
    fijarObjetivo(i, x, y) {
      const j = this.jugadores[i];
      if (x == null) {
        j.activo = false;
        j.objX = j.objY = null;
        return;
      }
      j.activo = true;
      j.objX = x;
      j.objY = y;
    }

    /** Cada jugador solo puede moverse en su mitad de la cancha. */
    limitar(j, x, y) {
      const xMin = j.lado === 0 ? j.r : this.W / 2;
      const xMax = j.lado === 0 ? this.W / 2 : this.W - j.r;
      return [clamp(x, xMin, xMax), clamp(y, j.r, this.H - j.r)];
    }

    actualizar(dt) {
      this.acumulado += Math.min(dt, 0.1);
      while (this.acumulado >= PASO) {
        this.paso(PASO);
        this.acumulado -= PASO;
      }
    }

    paso(dt) {
      this.t += dt;
      if (this.estado === 'cuenta') {
        const n = 3 - Math.floor(this.t / T_CUENTA);
        if (n !== this.cuenta) {
          this.cuenta = n;
          if (n > 0) this.emitir('cuenta', { n });
        }
        if (this.t >= T_CUENTA * 3) {
          this.cambiarEstado('jugando');
          this.emitir('pitazo');
        }
      } else if (this.estado === 'gol' && this.t >= T_GOL) {
        if (this.marcador[this.ultimoGol] >= this.golesParaGanar) {
          this.ganador = this.ultimoGol;
          this.cambiarEstado('fin');
          this.emitir('fin', { ganador: this.ganador });
        } else {
          this.colocarSaque();
          this.cambiarEstado('cuenta');
        }
      }

      for (const j of this.jugadores) this.moverJugador(j, dt);
      if (this.estado === 'jugando' || this.estado === 'gol') this.moverBalon(dt);
    }

    moverJugador(j, dt) {
      if (j.objX == null) {
        j.vx = j.vy = 0;
        return;
      }
      const [tx, ty] = this.limitar(j, j.objX, j.objY);
      const k = 1 - Math.exp(-SEGUIR * dt);
      let dx = (tx - j.x) * k;
      let dy = (ty - j.y) * k;
      const d = Math.hypot(dx, dy);
      const maxD = V_MAX_JUGADOR * dt;
      if (d > maxD) {
        dx *= maxD / d;
        dy *= maxD / d;
      }
      j.vx = dx / dt;
      j.vy = dy / dt;
      j.x += dx;
      j.y += dy;
    }

    moverBalon(dt) {
      const b = this.balon;
      const friccion = this.estado === 'gol' ? 4 : FRICCION;
      const f = Math.exp(-friccion * dt);
      b.vx *= f;
      b.vy *= f;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.giro += (Math.hypot(b.vx, b.vy) * dt) / b.r;

      if (this.estado === 'jugando') {
        for (const j of this.jugadores) this.chocarJugador(b, j);
      }
      for (const p of this.postes) this.chocarPoste(b, p);
      this.paredes(b);

      const v = Math.hypot(b.vx, b.vy);
      if (v > V_MAX_BALON) {
        b.vx *= V_MAX_BALON / v;
        b.vy *= V_MAX_BALON / v;
      }
      if (this.estado === 'jugando') this.revisarGol(b);
    }

    chocarJugador(b, j) {
      let dx = b.x - j.x;
      let dy = b.y - j.y;
      let d = Math.hypot(dx, dy);
      const minD = b.r + j.r;
      if (d >= minD) return;
      if (d < 1e-6) {
        dx = j.lado === 0 ? 1 : -1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      b.x = j.x + nx * minD;
      b.y = j.y + ny * minD;
      const rvx = b.vx - j.vx;
      const rvy = b.vy - j.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        b.vx -= (1 + REBOTE_JUGADOR) * vn * nx;
        b.vy -= (1 + REBOTE_JUGADOR) * vn * ny;
        this.emitir('patada', { lado: j.lado, fuerza: -vn, x: b.x, y: b.y });
      }
    }

    chocarPoste(b, p) {
      const dx = b.x - p[0];
      const dy = b.y - p[1];
      const d = Math.hypot(dx, dy);
      const minD = b.r + R_POSTE;
      if (d >= minD || d < 1e-6) return;
      const nx = dx / d;
      const ny = dy / d;
      b.x = p[0] + nx * minD;
      b.y = p[1] + ny * minD;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + REBOTE_PARED) * vn * nx;
        b.vy -= (1 + REBOTE_PARED) * vn * ny;
        if (-vn > 40) this.emitir('poste', { fuerza: -vn, x: b.x, y: b.y });
      }
    }

    paredes(b) {
      const r = b.r;
      const W = this.W;
      const H = this.H;
      const enBoca = b.y > this.y1 && b.y < this.y2;

      // bandas de arriba y abajo
      if (b.y < r) {
        b.y = r;
        if (b.vy < 0) this.rebotar(b, 'vy');
      } else if (b.y > H - r) {
        b.y = H - r;
        if (b.vy > 0) this.rebotar(b, 'vy');
      }

      // líneas de fondo (izquierda / derecha)
      if (b.x < r && !enBoca) {
        b.x = r;
        if (b.vx < 0) this.rebotar(b, 'vx');
      } else if (b.x > W - r && !enBoca) {
        b.x = W - r;
        if (b.vx > 0) this.rebotar(b, 'vx');
      }

      // dentro de la red
      if (b.x < 0 || b.x > W) {
        const fondo = b.x < 0 ? -this.fondoArco + r : W + this.fondoArco - r;
        if ((b.x < 0 && b.x < fondo) || (b.x > W && b.x > fondo)) {
          b.x = fondo;
          b.vx *= -0.25;
        }
        if (b.y < this.y1 + r) {
          b.y = this.y1 + r;
          b.vy = Math.abs(b.vy) * 0.3;
        } else if (b.y > this.y2 - r) {
          b.y = this.y2 - r;
          b.vy = -Math.abs(b.vy) * 0.3;
        }
      }
    }

    rebotar(b, eje) {
      const fuerza = Math.abs(b[eje]);
      b[eje] = -b[eje] * REBOTE_PARED;
      if (fuerza > 35) this.emitir('rebote', { fuerza });
    }

    revisarGol(b) {
      if (b.y <= this.y1 || b.y >= this.y2) return;
      if (b.x < -b.r * 0.4) this.gol(1);
      else if (b.x > this.W + b.r * 0.4) this.gol(0);
    }

    gol(equipo) {
      this.marcador[equipo]++;
      this.ultimoGol = equipo;
      this.cambiarEstado('gol');
      this.emitir('gol', { equipo, marcador: this.marcador.slice() });
    }

    /* ---------- Red: el anfitrión envía, el invitado recibe ---------- */
    estadoRed() {
      const r = (v) => Math.round(v * 10) / 10;
      const b = this.balon;
      return {
        b: [r(b.x), r(b.y), r(b.vx), r(b.vy)],
        p: this.jugadores.map((j) => [r(j.x), r(j.y), j.activo ? 1 : 0]),
        m: this.marcador,
        e: this.estado,
        c: this.cuenta,
        g: this.ultimoGol,
        w: this.ganador,
        gp: this.golesParaGanar
      };
    }

    aplicarRed(s) {
      if (!this.red) {
        // primer paquete: colocar todo directo
        this.balon.x = s.b[0];
        this.balon.y = s.b[1];
      }
      this.red = { b: s.b, p: s.p, t: performance.now() };
      this.balon.vx = s.b[2];
      this.balon.vy = s.b[3];
      this.marcador = s.m;
      this.estado = s.e;
      this.cuenta = s.c;
      this.ultimoGol = s.g;
      this.ganador = s.w;
      this.golesParaGanar = s.gp;
    }

    /** El invitado no simula: predice y se acerca suave a lo que manda el anfitrión. */
    interpolarRed(dt, ladoPropio) {
      const b = this.balon;
      const k = 1 - Math.exp(-14 * dt);
      if (this.red) {
        const edad = Math.min(0.15, (performance.now() - this.red.t) / 1000);
        const objX = this.red.b[0] + this.red.b[2] * edad;
        const objY = this.red.b[1] + this.red.b[3] * edad;
        b.x += (objX - b.x) * k;
        b.y += (objY - b.y) * k;
        b.giro += (Math.hypot(b.vx, b.vy) * dt) / b.r;
        this.jugadores.forEach((j, i) => {
          if (i === ladoPropio) return;
          const p = this.red.p[i];
          j.x += (p[0] - j.x) * k;
          j.y += (p[1] - j.y) * k;
          j.activo = !!p[2];
        });
      }
      this.moverJugador(this.jugadores[ladoPropio], dt);
    }
  }

  Partido.R_BALON = R_BALON;
  Partido.R_JUGADOR = R_JUGADOR;
  FG.Partido = Partido;
})();
