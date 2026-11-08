/* ============================================================
   Gestos con la mano (para no tener que tocar la pantalla):
   - Mano abierta (los 5 dedos estirados)  → pausa
   - Pulgar arriba (puño cerrado)          → continuar / revancha
   Hay que sostener el gesto un momento CON LA MANO QUIETA: así no
   se activa solo mientras mueves el mazo (aunque juegues con la
   mano abierta). Usa los 21 puntos de MediaPipe (0 a 1).
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  const PUNTAS = [8, 12, 16, 20];       // índice, medio, anular, meñique
  const NUDILLOS_MEDIOS = [6, 10, 14, 18];

  /**
   * Dice qué gesto hace una mano.
   * @param puntos  21 puntos {x, y} normalizados (0..1)
   * @param aspecto ancho / alto del video (para medir distancias reales)
   * @returns 'palma' | 'pulgar' | 'indice' | null
   */
  function clasificar(puntos, aspecto = 16 / 9) {
    if (!puntos || puntos.length < 21) return null;
    const d = (a, b) => Math.hypot((puntos[a].x - puntos[b].x) * aspecto, puntos[a].y - puntos[b].y);
    const palma = d(0, 9); // de la muñeca al nudillo del dedo medio
    if (palma < 1e-4) return null;

    const estirado = PUNTAS.map((p, i) => d(0, p) > d(0, NUDILLOS_MEDIOS[i]) + 0.22 * palma);
    const doblado = PUNTAS.map((p, i) => d(0, p) < d(0, NUDILLOS_MEDIOS[i]) + 0.04 * palma);
    const pulgarAfuera = d(4, 5) > 0.5 * palma && d(4, 9) > d(3, 9);

    if (estirado.every(Boolean) && pulgarAfuera) return 'palma';

    if (doblado.every(Boolean) && pulgarAfuera) {
      // la punta del pulgar es lo más alto de la mano y apunta hacia arriba
      let masAlto = true;
      for (let i = 0; i < 21; i++) {
        if (i === 4 || i === 3) continue;
        if (puntos[i].y < puntos[4].y + 0.08 * palma) {
          masAlto = false;
          break;
        }
      }
      if (masAlto && puntos[4].y < puntos[2].y - 0.35 * palma) return 'pulgar';
    }

    if (estirado[0] && doblado[1] && doblado[2] && doblado[3]) return 'indice';
    return null;
  }

  /** Centro de la palma y su tamaño (para saber si la mano está quieta). */
  function centroPalma(puntos, aspecto) {
    const ids = [0, 5, 9, 13, 17];
    let x = 0;
    let y = 0;
    for (const i of ids) {
      x += (puntos[i].x * aspecto) / ids.length;
      y += puntos[i].y / ids.length;
    }
    const palma = Math.hypot((puntos[0].x - puntos[9].x) * aspecto, puntos[0].y - puntos[9].y);
    return { x, y, palma };
  }

  /**
   * Cuenta cuánto tiempo se sostiene cada gesto y avisa una sola vez
   * cuando se completa (hay que soltarlo para volver a activarlo).
   */
  class DetectorGestos {
    constructor(tiempos) {
      this.tiempos = tiempos; // { palma: seg, pulgar: seg }
      this.reiniciar();
    }

    reiniciar() {
      this.actual = null;   // gesto que se está sosteniendo
      this.t = 0;           // segundos sostenido
      this.hueco = 0;       // segundos sin verlo (se perdonan huecos cortos)
      this.mano = null;     // puntos de la mano que hace el gesto
      this.bloqueado = 0;   // tras activarse, espera a que se suelte ese mismo gesto
    }

    /**
     * @param manos  [{ puntos }] del detector
     * @param buscar lista de gestos que valen ahora, ej. ['palma']
     * @returns { gesto, progreso (0..1), mano, listo (true el cuadro en que se completa) }
     */
    actualizar(manos, dt, buscar, aspecto) {
      let visto = null;
      let manoVista = null;
      for (const m of manos || []) {
        const g = clasificar(m.puntos, aspecto);
        if (g && buscar.includes(g)) {
          visto = g;
          manoVista = m;
          break;
        }
      }

      if (this.bloqueado > 0) {
        if (visto && visto === this.ultimo) {
          // sigue con el mismo gesto que ya se activó: hay que soltarlo primero
          this.bloqueado = 0.5;
          return { gesto: null, progreso: 0, mano: null, listo: false };
        }
        this.bloqueado = visto ? 0 : this.bloqueado - dt;
        if (this.bloqueado > 0) return { gesto: null, progreso: 0, mano: null, listo: false };
      }

      const c = visto ? centroPalma(manoVista.puntos, aspecto || 16 / 9) : null;
      if (visto && visto === this.actual) {
        // si la mano se mueve (estás jugando), el conteo vuelve a empezar
        const movio = Math.hypot(c.x - this.ancla.x, c.y - this.ancla.y) > 0.6 * c.palma;
        if (movio) {
          this.t = dt;
          this.ancla = c;
        } else this.t += dt;
        this.hueco = 0;
        this.mano = manoVista;
      } else if (visto) {
        this.actual = visto;
        this.t = dt;
        this.ancla = c;
        this.hueco = 0;
        this.mano = manoVista;
      } else if (this.actual) {
        this.hueco += dt;
        if (this.hueco > 0.25) this.actual = null;
      }

      if (!this.actual) return { gesto: null, progreso: 0, mano: null, listo: false };
      const necesario = this.tiempos[this.actual] || 1;
      const progreso = Math.min(1, this.t / necesario);
      if (progreso >= 1) {
        const gesto = this.actual;
        const mano = this.mano;
        this.reiniciar();
        this.bloqueado = 0.5;
        this.ultimo = gesto;
        return { gesto, progreso: 1, mano, listo: true };
      }
      return { gesto: this.actual, progreso, mano: this.mano, listo: false };
    }
  }

  FG.Gestos = { clasificar, centroPalma, DetectorGestos };
})();
