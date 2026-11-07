/* ============================================================
   Rival controlado por la máquina (para jugar solo).
   Idea simple, como en el air hockey:
   1. Si el balón está en la otra mitad → defender su arco,
      calculando por dónde va a llegar el tiro.
   2. Si el balón está en su mitad y la máquina está DETRÁS del balón
      (mirando al arco rival) → alinearse y empujarlo hacia el arco.
   3. Si está DELANTE del balón (lado equivocado) → rodearlo por un
      costado, sin tocarlo, para no meterse autogoles.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const { clamp } = FG.util;

  const NIVELES = {
    facil: { vel: 85, reaccion: 0.28, error: 8, empuje: 3 },
    normal: { vel: 150, reaccion: 0.12, error: 3, empuje: 7 },
    dificil: { vel: 190, reaccion: 0.08, error: 1.2, empuje: 10 }
  };

  class CPU {
    constructor(partido, lado = 1, nivel = 'normal') {
      this.p = partido;
      this.lado = lado;
      this.n = NIVELES[nivel] || NIVELES.normal;
      const j = partido.jugadores[lado];
      this.x = j.x;
      this.y = j.y;
      this.deseo = { x: j.x, y: j.y };
      this.tPensar = 0;
    }

    actualizar(dt) {
      this.tPensar -= dt;
      const j = this.p.jugadores[this.lado];
      if (this.tPensar <= 0) {
        this.tPensar = this.n.reaccion;
        const d = this.pensar();
        const [x, y] = this.p.limitar(j, d.x, d.y); // nunca apuntar fuera de su mitad
        this.deseo = { x, y };
      }
      const dx = this.deseo.x - this.x;
      const dy = this.deseo.y - this.y;
      const d = Math.hypot(dx, dy);
      const paso = this.n.vel * dt;
      if (d <= paso) {
        this.x = this.deseo.x;
        this.y = this.deseo.y;
      } else {
        this.x += (dx / d) * paso;
        this.y += (dy / d) * paso;
      }
      return { x: this.x, y: this.y };
    }

    pensar() {
      const P = this.p;
      const b = P.balon;
      const j = P.jugadores[this.lado];
      const W = P.W;
      const H = P.H;
      const dir = this.lado === 1 ? -1 : 1; // hacia dónde ataca (en x)
      const miArcoX = this.lado === 1 ? W : 0;
      const err = () => (Math.random() * 2 - 1) * this.n.error;

      if (P.estado !== 'jugando') return { x: miArcoX + dir * 24, y: H / 2 };

      const tPred = 0.15;
      const bx = clamp(b.x + b.vx * tPred, b.r, W - b.r);
      const by = clamp(b.y + b.vy * tPred, b.r, H - b.r);

      /** Por dónde cruzará el balón la línea x (con rebotes en las bandas). */
      const cruce = (x) => {
        const t = (x - b.x) / b.vx;
        const periodo = 2 * H;
        const y = (((b.y + b.vy * t) % periodo) + periodo) % periodo;
        return y > H ? periodo - y : y;
      };

      // 1) balón lejos → defender
      const enMiCampo = this.lado === 1 ? bx > W / 2 - 4 : bx < W / 2 + 4;
      if (!enMiCampo) {
        const xDef = miArcoX + dir * 20;
        const yDef = b.vx * dir < -20 ? cruce(xDef) : by;
        return { x: xDef, y: clamp(yDef + err(), P.y1 - 4, P.y2 + 4) };
      }

      // 1b) tiro rápido hacia mi arco y yo estoy entre el balón y el arco → tapar, no salir a buscarlo
      const balonDelante = (b.x - j.x) * dir > 0;
      if (balonDelante && b.vx * dir < -60) {
        const xTapar = (j.x - miArcoX) * dir > 30 ? miArcoX + dir * 30 : j.x;
        return { x: xTapar, y: clamp(cruce(xTapar) + err() * 0.5, P.y1 - 6, P.y2 + 6) };
      }

      // dirección "u": del balón al arco rival
      const gx = this.lado === 1 ? 0 : W;
      const gy = H / 2 + err() * 2;
      let ux = gx - bx;
      let uy = gy - by;
      const ud = Math.hypot(ux, uy) || 1;
      ux /= ud;
      uy /= ud;
      const contacto = b.r + j.r;
      const rx = j.x - bx;
      const ry = j.y - by;
      const adelante = rx * ux + ry * uy; // > 0: la máquina está entre el balón y el arco rival
      const lateral = -rx * uy + ry * ux; // distancia de costado

      // 2) detrás del balón → alinearse y empujar
      if (adelante < -contacto * 0.3) {
        if (Math.abs(lateral) < contacto * 0.7) {
          return { x: bx + ux * this.n.empuje, y: by + uy * this.n.empuje };
        }
        return { x: bx - ux * (contacto + 3), y: by - uy * (contacto + 3) };
      }

      // 3) lado equivocado → rodear por el costado donde ya está
      let s = lateral >= 0 ? 1 : -1;
      const rodeo = contacto + 7;
      const px = -uy;
      const py = ux;
      const yLado = by + py * s * rodeo;
      if (yLado < j.r || yLado > H - j.r) {
        // por ese costado está la banda: cruzar por delante con espacio
        s = -s;
        return { x: bx + px * s * rodeo + ux * (contacto + 6), y: by + py * s * rodeo + uy * (contacto + 6) };
      }
      if (Math.abs(lateral) < contacto + 2) {
        // muy de frente: primero apartarse hacia el costado sin acercarse
        const frente = Math.max(adelante, contacto + 3);
        return { x: bx + ux * frente + px * s * rodeo, y: by + uy * frente + py * s * rodeo };
      }
      return { x: bx + px * s * rodeo - ux * rodeo * 0.6, y: by + py * s * rodeo - uy * rodeo * 0.6 };
    }
  }

  FG.CPU = CPU;
})();
