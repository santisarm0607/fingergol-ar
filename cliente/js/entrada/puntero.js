/* ============================================================
   Controles sin cámara:
   - Táctil: cada dedo en la pantalla es un jugador (2 en un celular/tablet)
   - Mouse: mueve el mouse sobre la cancha
   - Teclado: J1 = W A S D · J2 = flechas
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  const TECLAS = [
    { arriba: 'KeyW', abajo: 'KeyS', izq: 'KeyA', der: 'KeyD' },
    { arriba: 'ArrowUp', abajo: 'ArrowDown', izq: 'ArrowLeft', der: 'ArrowRight' }
  ];
  const VEL_TECLADO = 120; // unidades de cancha por segundo

  class Puntero {
    constructor(elemento) {
      this.el = elemento;
      this.punteros = new Map();
      this.teclas = new Set();
      this.virtual = [null, null];
      this.rotado = () => false;

      const registrar = (e) => {
        this.punteros.set(e.pointerId, { sx: e.clientX, sy: e.clientY, tipo: e.pointerType });
      };
      const quitar = (e) => {
        if (e.pointerType !== 'mouse') this.punteros.delete(e.pointerId);
      };
      elemento.addEventListener('pointerdown', (e) => {
        registrar(e);
        try { elemento.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      });
      elemento.addEventListener('pointermove', registrar);
      elemento.addEventListener('pointerup', quitar);
      elemento.addEventListener('pointercancel', quitar);

      window.addEventListener('keydown', (e) => {
        if (TECLAS.some((t) => Object.values(t).includes(e.code))) {
          this.teclas.add(e.code);
          if (e.code.startsWith('Arrow')) e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
      window.addEventListener('blur', () => this.teclas.clear());
    }

    /** Punteros activos en coordenadas de pantalla. */
    lista() {
      return Array.from(this.punteros.values());
    }

    /** Posiciones de los jugadores que se mueven con teclado (en coordenadas de cancha). */
    teclado(dt, partido) {
      const salida = [];
      TECLAS.forEach((t, lado) => {
        let dx = 0;
        let dy = 0;
        if (this.teclas.has(t.izq)) dx -= 1;
        if (this.teclas.has(t.der)) dx += 1;
        if (this.teclas.has(t.arriba)) dy -= 1;
        if (this.teclas.has(t.abajo)) dy += 1;
        if (this.rotado()) {
          // en vertical la cancha está girada: "arriba" avanza hacia el arco rival
          const tmp = dx;
          dx = -dy;
          dy = tmp;
        }
        if (!dx && !dy && !this.virtual[lado]) return;
        const j = partido.jugadores[lado];
        if (!this.virtual[lado]) this.virtual[lado] = { x: j.x, y: j.y };
        const v = this.virtual[lado];
        const n = Math.hypot(dx, dy) || 1;
        v.x += (dx / n) * VEL_TECLADO * dt;
        v.y += (dy / n) * VEL_TECLADO * dt;
        const [cx, cy] = partido.limitar(j, v.x, v.y);
        v.x = cx;
        v.y = cy;
        salida.push({ x: v.x, y: v.y, lado, tipo: 'teclado' });
      });
      return salida;
    }

    reiniciar() {
      this.virtual = [null, null];
      this.teclas.clear();
      for (const [id, p] of this.punteros) if (p.tipo !== 'mouse') this.punteros.delete(id);
    }
  }

  FG.Puntero = Puntero;
})();
