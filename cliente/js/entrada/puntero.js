/* ============================================================
   Controles del modo práctica (sin cámara):
   - Táctil: arrastra tu muñeco; cada toque nuevo es una patada
   - Mouse: mueve el muñeco con el mouse, clic = patada
   - Teclado: J1 = W A S D + Espacio · J2 = flechas + Enter
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  const TECLAS = [
    { arriba: 'KeyW', abajo: 'KeyS', izq: 'KeyA', der: 'KeyD', patada: ['Space'] },
    { arriba: 'ArrowUp', abajo: 'ArrowDown', izq: 'ArrowLeft', der: 'ArrowRight', patada: ['Enter', 'NumpadEnter', 'ShiftRight'] }
  ];
  const VEL_TECLADO = 120; // unidades de cancha por segundo

  class Puntero {
    constructor(elemento) {
      this.el = elemento;
      this.punteros = new Map();
      this.teclas = new Set();
      this.virtual = [null, null];
      this.patadaTeclado = [false, false];
      this.rotado = () => false;

      const registrar = (e, patear) => {
        const previo = this.punteros.get(e.pointerId);
        this.punteros.set(e.pointerId, {
          sx: e.clientX,
          sy: e.clientY,
          tipo: e.pointerType,
          patear: patear || (previo && previo.patear) || false
        });
      };
      const quitar = (e) => {
        if (e.pointerType !== 'mouse') this.punteros.delete(e.pointerId);
      };
      elemento.addEventListener('pointerdown', (e) => {
        registrar(e, true);
        try { elemento.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      });
      elemento.addEventListener('pointermove', (e) => registrar(e, false));
      elemento.addEventListener('pointerup', quitar);
      elemento.addEventListener('pointercancel', quitar);

      window.addEventListener('keydown', (e) => {
        TECLAS.forEach((t, lado) => {
          if (t.patada.includes(e.code) && !e.repeat) this.patadaTeclado[lado] = true;
        });
        const usada = TECLAS.some((t) => [t.arriba, t.abajo, t.izq, t.der, ...t.patada].includes(e.code));
        if (usada) {
          this.teclas.add(e.code);
          if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
      window.addEventListener('blur', () => this.teclas.clear());
    }

    /** Punteros activos en coordenadas de pantalla. "patear" se consume al leer. */
    lista() {
      const salida = [];
      for (const p of this.punteros.values()) {
        salida.push({ sx: p.sx, sy: p.sy, tipo: p.tipo, patear: p.patear });
        p.patear = false;
      }
      return salida;
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
        const patear = this.patadaTeclado[lado];
        this.patadaTeclado[lado] = false;
        if (!dx && !dy && !patear && !this.virtual[lado]) return;
        const j = partido.jugadores[lado];
        if (!this.virtual[lado]) this.virtual[lado] = { x: j.x, y: j.y };
        const v = this.virtual[lado];
        const n = Math.hypot(dx, dy) || 1;
        v.x += (dx / n) * VEL_TECLADO * dt;
        v.y += (dy / n) * VEL_TECLADO * dt;
        const [cx, cy] = partido.limitar(j, v.x, v.y);
        v.x = cx;
        v.y = cy;
        salida.push({ x: v.x, y: v.y, lado, tipo: 'teclado', patear });
      });
      return salida;
    }

    reiniciar() {
      this.virtual = [null, null];
      this.patadaTeclado = [false, false];
      this.teclas.clear();
      for (const [id, p] of this.punteros) if (p.tipo !== 'mouse') this.punteros.delete(id);
    }
  }

  FG.Puntero = Puntero;
})();
