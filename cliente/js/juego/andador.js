/* ============================================================
   Andador: convierte "dónde quiero estar + ¿pateo?" en la
   posición de los DOS PIES de un muñeco que camina.
   Lo usan la máquina, el rival en línea sin cámara y el
   modo práctica (mouse / táctil / teclado).
   Con la cámara no hace falta: tus dedos ya son los pies.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const { girarHacia } = FG.util;

  const SEPARACION = 3.8;   // distancia de cada pie al centro del cuerpo
  const T_PATADA = 0.16;    // cuánto dura el movimiento de patada
  const ENFRIAR = 0.32;     // tiempo mínimo entre patadas
  const ALCANCE_PATADA = 22;

  class Andador {
    constructor(partido, lado) {
      const j = partido.jugadores[lado];
      this.p = partido;
      this.lado = lado;
      this.x = j.x;
      this.y = j.y;
      this.vx = 0;
      this.vy = 0;
      this.ang = lado === 0 ? 0 : Math.PI;
      this.fase = 0;
      this.tPatada = 0;
      this.enfriar = 0;
      this.piePatada = 0;
    }

    /**
     * @param objetivo {x,y} hacia dónde quiere ir el cuerpo (o null = quieto)
     * @param patear   true para lanzar una patada con el pie más cercano al balón
     * @returns { pies: [{x,y,ang},{x,y,ang}], cuerpo: {x,y,ang}, pateo: bool }
     */
    actualizar(dt, objetivo, patear) {
      const P = this.p;
      const b = P.balon;
      const j = P.jugadores[this.lado];
      if (objetivo) {
        const [tx, ty] = P.limitar(j, objetivo.x, objetivo.y);
        const k = 1 - Math.exp(-16 * dt);
        const nx = this.x + (tx - this.x) * k;
        const ny = this.y + (ty - this.y) * k;
        this.vx = dt > 0 ? (nx - this.x) / dt : 0;
        this.vy = dt > 0 ? (ny - this.y) / dt : 0;
        this.x = nx;
        this.y = ny;
      } else {
        this.vx = this.vy = 0;
      }

      // mirar hacia el balón si está cerca; si no, hacia el arco rival
      const dxB = b.x - this.x;
      const dyB = b.y - this.y;
      const dB = Math.hypot(dxB, dyB);
      const angObjetivo = dB < 50 ? Math.atan2(dyB, dxB) : this.lado === 0 ? 0 : Math.PI;
      this.ang = girarHacia(this.ang, angObjetivo, dt * 9);

      // caminar: los pies se adelantan y atrasan alternados
      const vel = Math.hypot(this.vx, this.vy);
      this.fase += dt * (3 + vel * 0.14);
      const zancada = Math.min(5, vel * 0.045);
      const fx = Math.cos(this.ang);
      const fy = Math.sin(this.ang);
      const lx = -fy;
      const ly = fx;
      const pies = [0, 1].map((n) => {
        const s = n === 0 ? -1 : 1;
        const adelante = Math.sin(this.fase + n * Math.PI) * zancada;
        return {
          x: this.x + lx * s * SEPARACION + fx * adelante,
          y: this.y + ly * s * SEPARACION + fy * adelante,
          ang: this.ang
        };
      });

      // patada: el pie más cercano barre a través del balón
      this.enfriar -= dt;
      let pateo = false;
      if (patear && this.enfriar <= 0) {
        this.tPatada = T_PATADA;
        this.enfriar = ENFRIAR;
        const d0 = Math.hypot(pies[0].x - b.x, pies[0].y - b.y);
        const d1 = Math.hypot(pies[1].x - b.x, pies[1].y - b.y);
        this.piePatada = d0 < d1 ? 0 : 1;
        pateo = true;
      }
      if (this.tPatada > 0) {
        this.tPatada -= dt;
        const pie = pies[this.piePatada];
        if (dB < ALCANCE_PATADA) {
          pie.x = b.x + fx * 6;
          pie.y = b.y + fy * 6;
        } else {
          pie.x += fx * 10;
          pie.y += fy * 10;
        }
      }
      return { pies, cuerpo: { x: this.x, y: this.y, ang: this.ang }, pateo };
    }

    colocar(x, y) {
      this.x = x;
      this.y = y;
      this.vx = this.vy = 0;
    }
  }

  FG.Andador = Andador;
})();
