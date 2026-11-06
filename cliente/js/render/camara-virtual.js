/* ============================================================
   Cámara virtual: mira el futbolito desde un lado, como en la
   TV. Se usa en el modo práctica (sin cámara) y en el fondo del
   menú. En modo AR la reemplaza CamaraAR (render-ar.js).

   Las dos cámaras tienen la misma "forma":
     proyectar(x, h, z) -> { x, y, p, e }  punto 3D -> pantalla
        x = largo de la cancha, z = ancho, h = altura
        p = profundidad, e = píxeles por unidad a esa distancia
     pantallaAPlano(sx, sy) -> [x, z]   píxel -> punto sobre la cancha
     visible() -> true si hay cancha que dibujar
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const F = FG.config.CANCHA;

  const restar = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unir = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  class CamaraVirtual {
    constructor() {
      this.k = 1;
      this.ox = 0;
      this.oy = 0;
    }

    /** Coloca la cámara según el tamaño de la pantalla y encuadra el futbolito. */
    ajustar(w, h, arriba = 70) {
      const W = F.ancho;
      const H = F.alto;
      this.vertical = h > w * 1.05;
      if (!this.vertical) {
        this.pos = [W / 2, 118, H + 108];
        this.mira = [W / 2, 0, H * 0.44];
      } else {
        // celular parado: detrás del arco azul, el azul abajo y el rojo arriba
        this.pos = [-112, 150, H / 2];
        this.mira = [W * 0.55, 0, H / 2];
      }
      this.adelante = unir(restar(this.mira, this.pos));
      this.derecha = unir(cruz(this.adelante, [0, 1, 0]));
      this.arribaV = cruz(this.derecha, this.adelante);

      // encuadre: proyectar las esquinas (con arcos y muñecos) y ajustar la escala
      const m = F.fondoArco + 4;
      const esquinas = [];
      for (const x of [-m, W + m]) for (const z of [-4, H + 4]) for (const y of [0, 30]) esquinas.push([x, y, z]);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const q of esquinas) {
        const r = this.crudo(q[0], q[1], q[2]);
        minX = Math.min(minX, r[0]);
        maxX = Math.max(maxX, r[0]);
        minY = Math.min(minY, r[1]);
        maxY = Math.max(maxY, r[1]);
      }
      const pad = 12;
      const anchoDisp = w - pad * 2;
      const altoDisp = h - arriba - pad;
      this.k = Math.min(anchoDisp / (maxX - minX), altoDisp / (maxY - minY));
      this.ox = (w - (maxX - minX) * this.k) / 2 - minX * this.k;
      this.oy = arriba + (altoDisp - (maxY - minY) * this.k) / 2 - minY * this.k;
    }

    crudo(x, y, z) {
      const d = restar([x, y, z], this.pos);
      const zc = punto(d, this.adelante);
      return [punto(d, this.derecha) / zc, -punto(d, this.arribaV) / zc, zc];
    }

    visible() {
      return true;
    }

    /** Posición de la cámara en coordenadas de cancha [x, h, z]. */
    ojo() {
      return this.pos;
    }

    proyectar(x, h, z) {
      const d = [x - this.pos[0], h - this.pos[1], z - this.pos[2]];
      const zc = punto(d, this.adelante);
      if (zc <= 1) return null;
      return {
        x: this.ox + (punto(d, this.derecha) / zc) * this.k,
        y: this.oy + (-punto(d, this.arribaV) / zc) * this.k,
        p: zc,
        e: this.k / zc
      };
    }

    pantallaAPlano(sx, sy) {
      const rx = (sx - this.ox) / this.k;
      const ry = (sy - this.oy) / this.k;
      const dir = [
        this.adelante[0] + this.derecha[0] * rx - this.arribaV[0] * ry,
        this.adelante[1] + this.derecha[1] * rx - this.arribaV[1] * ry,
        this.adelante[2] + this.derecha[2] * rx - this.arribaV[2] * ry
      ];
      if (dir[1] >= -1e-6) return null;
      const t = -this.pos[1] / dir[1];
      return [this.pos[0] + dir[0] * t, this.pos[2] + dir[2] * t];
    }
  }

  FG.CamaraVirtual = CamaraVirtual;
})();
