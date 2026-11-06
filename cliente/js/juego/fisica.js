/* ============================================================
   Motor del futbolito.
   Cada jugador tiene DOS PIES (tus dedos índice y medio).
   Los pies siguen a la punta de tus dedos y empujan el balón
   con la velocidad que lleven: un dedo rápido = un zapatazo.
   Regla: tus pies solo tocan el balón en tu mitad de la cancha
   (si cruzas la mitad, tus guayos se ven transparentes).
   Todo se mide en "unidades de cancha" (160 x 100).
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const { clamp } = FG.util;

  const PASO = 1 / 120;          // la física corre a 120 Hz fijos
  const R_BALON = 4.2;
  const R_PIE = 3.6;
  const ALCANCE = 9;             // "radio" del cuerpo, para limitarlo a su mitad
  const MARGEN_MITAD = 6;        // tus pies pueden pasar un poquito la mitad
  const R_POSTE = 1.2;
  const FRICCION = 0.6;
  const V_MAX_BALON = 300;
  const V_MAX_PIE = 650;
  const REBOTE_PARED = 0.78;
  const REBOTE_PIE = 0.85;
  const SEGUIR = 40;             // qué tan rápido el pie sigue a tu dedo
  const T_CUENTA = 0.75;
  const T_GOL = 2.3;

  function crearPie(x, y, ang) {
    return { x, y, vx: 0, vy: 0, r: R_PIE, objX: null, objY: null, ang, enJuego: true };
  }

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
      this.jugadores = [0, 1].map((lado) => {
        const x = lado ? this.W * 0.78 : this.W * 0.22;
        const ang = lado ? Math.PI : 0;
        return {
          lado,
          x,
          y: this.H / 2,
          r: ALCANCE,
          ang,
          activo: false,
          cuerpoObj: null,
          pies: [crearPie(x, this.H / 2 - 3.6, ang), crearPie(x, this.H / 2 + 3.6, ang)]
        };
      });
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
      this.red = null;
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

    /**
     * Dónde quieren estar los pies del jugador i.
     * pies = [{x, y, ang}, {x, y, ang}]  o  null si no se ve la mano.
     * cuerpo = {x, y, ang} opcional (muñecos de la máquina o del modo práctica).
     */
    fijarPies(i, pies, cuerpo) {
      const j = this.jugadores[i];
      if (!pies) {
        j.activo = false;
        j.pies.forEach((p) => (p.objX = p.objY = null));
        return;
      }
      j.activo = true;
      j.cuerpoObj = cuerpo || null;
      pies.forEach((q, k) => {
        const p = j.pies[k];
        p.objX = q.x;
        p.objY = q.y;
        if (q.ang != null) p.ang = q.ang;
      });
    }

    /** El cuerpo de cada jugador se queda en su mitad (lo usan la máquina y los controles sin cámara). */
    limitar(j, x, y) {
      const xMin = j.lado === 0 ? j.r : this.W / 2;
      const xMax = j.lado === 0 ? this.W / 2 : this.W - j.r;
      return [clamp(x, xMin, xMax), clamp(y, j.r * 0.6, this.H - j.r * 0.6)];
    }

    /** ¿Puede este pie tocar el balón? Solo en su mitad (+ un margen). */
    pieEnJuego(lado, x) {
      return lado === 0 ? x <= this.W / 2 + MARGEN_MITAD : x >= this.W / 2 - MARGEN_MITAD;
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
      for (const p of j.pies) this.moverPie(j, p, dt);
      if (j.cuerpoObj) {
        j.x = j.cuerpoObj.x;
        j.y = j.cuerpoObj.y;
        if (j.cuerpoObj.ang != null) j.ang = j.cuerpoObj.ang;
      } else {
        j.x = (j.pies[0].x + j.pies[1].x) / 2;
        j.y = (j.pies[0].y + j.pies[1].y) / 2;
        j.ang = Math.atan2(
          Math.sin(j.pies[0].ang) + Math.sin(j.pies[1].ang),
          Math.cos(j.pies[0].ang) + Math.cos(j.pies[1].ang)
        );
      }
    }

    moverPie(j, p, dt) {
      if (p.objX == null) {
        p.vx = p.vy = 0;
        return;
      }
      const tx = clamp(p.objX, p.r, this.W - p.r);
      const ty = clamp(p.objY, p.r, this.H - p.r);
      const k = 1 - Math.exp(-SEGUIR * dt);
      let dx = (tx - p.x) * k;
      let dy = (ty - p.y) * k;
      const d = Math.hypot(dx, dy);
      const maxD = V_MAX_PIE * dt;
      if (d > maxD) {
        dx *= maxD / d;
        dy *= maxD / d;
      }
      p.vx = dx / dt;
      p.vy = dy / dt;
      p.x += dx;
      p.y += dy;
      p.enJuego = this.pieEnJuego(j.lado, p.x);
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
        for (const j of this.jugadores) {
          if (!j.activo) continue;
          for (const p of j.pies) if (p.enJuego && p.objX != null) this.chocarPie(b, p, j.lado);
        }
      }
      for (const poste of this.postes) this.chocarPoste(b, poste);
      this.paredes(b);

      const v = Math.hypot(b.vx, b.vy);
      if (v > V_MAX_BALON) {
        b.vx *= V_MAX_BALON / v;
        b.vy *= V_MAX_BALON / v;
      }
      if (this.estado === 'jugando') this.revisarGol(b);
    }

    chocarPie(b, p, lado) {
      let dx = b.x - p.x;
      let dy = b.y - p.y;
      let d = Math.hypot(dx, dy);
      const minD = b.r + p.r;
      if (d >= minD) return;
      if (d < 1e-6) {
        dx = lado === 0 ? 1 : -1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      b.x = p.x + nx * minD;
      b.y = p.y + ny * minD;
      const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (vn < 0) {
        b.vx -= (1 + REBOTE_PIE) * vn * nx;
        b.vy -= (1 + REBOTE_PIE) * vn * ny;
        this.emitir('patada', { lado, fuerza: -vn, x: b.x, y: b.y });
      }
    }

    chocarPoste(b, poste) {
      const dx = b.x - poste[0];
      const dy = b.y - poste[1];
      const d = Math.hypot(dx, dy);
      const minD = b.r + R_POSTE;
      if (d >= minD || d < 1e-6) return;
      const nx = dx / d;
      const ny = dy / d;
      b.x = poste[0] + nx * minD;
      b.y = poste[1] + ny * minD;
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

      if (b.y < r) {
        b.y = r;
        if (b.vy < 0) this.rebotar(b, 'vy');
      } else if (b.y > H - r) {
        b.y = H - r;
        if (b.vy > 0) this.rebotar(b, 'vy');
      }
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
      const a = (v) => Math.round(v * 100) / 100;
      const b = this.balon;
      return {
        b: [r(b.x), r(b.y), r(b.vx), r(b.vy)],
        p: this.jugadores.map((j) => [
          r(j.x), r(j.y), a(j.ang), j.activo ? 1 : 0,
          r(j.pies[0].x), r(j.pies[0].y), a(j.pies[0].ang),
          r(j.pies[1].x), r(j.pies[1].y), a(j.pies[1].ang)
        ]),
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
        b.x += (this.red.b[0] + this.red.b[2] * edad - b.x) * k;
        b.y += (this.red.b[1] + this.red.b[3] * edad - b.y) * k;
        b.giro += (Math.hypot(b.vx, b.vy) * dt) / b.r;
        this.jugadores.forEach((j, i) => {
          if (i === ladoPropio) return;
          const q = this.red.p[i];
          j.x += (q[0] - j.x) * k;
          j.y += (q[1] - j.y) * k;
          j.ang = q[2];
          j.activo = !!q[3];
          j.pies.forEach((p, n) => {
            p.x += (q[4 + n * 3] - p.x) * k;
            p.y += (q[5 + n * 3] - p.y) * k;
            p.ang = q[6 + n * 3];
            p.enJuego = this.pieEnJuego(j.lado, p.x);
          });
        });
      }
      this.moverJugador(this.jugadores[ladoPropio], dt);
    }
  }

  Partido.R_BALON = R_BALON;
  Partido.R_PIE = R_PIE;
  FG.Partido = Partido;
})();
