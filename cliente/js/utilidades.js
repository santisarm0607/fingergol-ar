/* ============================================================
   Utilidades compartidas: matemáticas, carga de scripts,
   guardado de ajustes y filtro "One Euro" para suavizar la mano.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.$ = (sel) => document.querySelector(sel);
  U.$$ = (sel) => Array.from(document.querySelectorAll(sel));

  /** Carga un script probando varias URLs en orden. */
  U.cargarScript = function (urls) {
    const lista = Array.isArray(urls) ? urls : [urls];
    let intento = Promise.reject(new Error('sin url'));
    lista.forEach((url) => {
      intento = intento.catch(
        () =>
          new Promise((resolver, rechazar) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = false;
            s.onload = () => resolver(url);
            s.onerror = () => {
              s.remove();
              rechazar(new Error('No se pudo cargar ' + url));
            };
            document.head.appendChild(s);
          })
      );
    });
    return intento;
  };

  U.guardar = (clave, valor) => {
    try {
      localStorage.setItem('fingergol.' + clave, JSON.stringify(valor));
    } catch (e) { /* sin almacenamiento: no pasa nada */ }
  };
  U.leer = (clave, porDefecto) => {
    try {
      const v = localStorage.getItem('fingergol.' + clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) {
      return porDefecto;
    }
  };

  U.esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Filtro One Euro (suaviza sin agregar mucho retraso) ---------- */
  class FiltroEuro {
    constructor(minCorte = 1.6, beta = 0.03, corteDerivada = 1.0) {
      this.minCorte = minCorte;
      this.beta = beta;
      this.corteD = corteDerivada;
      this.reiniciar();
    }
    reiniciar() {
      this.xPrev = null;
      this.dxPrev = 0;
      this.tPrev = null;
    }
    alfa(corte, dt) {
      const tau = 1 / (2 * Math.PI * corte);
      return 1 / (1 + tau / dt);
    }
    filtrar(x, t) {
      if (this.tPrev == null) {
        this.xPrev = x;
        this.tPrev = t;
        return x;
      }
      const dt = Math.max(1e-3, t - this.tPrev);
      this.tPrev = t;
      const dx = (x - this.xPrev) / dt;
      const aD = this.alfa(this.corteD, dt);
      const dxSuave = aD * dx + (1 - aD) * this.dxPrev;
      const corte = this.minCorte + this.beta * Math.abs(dxSuave);
      const a = this.alfa(corte, dt);
      const xSuave = a * x + (1 - a) * this.xPrev;
      this.xPrev = xSuave;
      this.dxPrev = dxSuave;
      return xSuave;
    }
  }

  class FiltroEuro2D {
    constructor(minCorte, beta) {
      this.fx = new FiltroEuro(minCorte, beta);
      this.fy = new FiltroEuro(minCorte, beta);
    }
    reiniciar() {
      this.fx.reiniciar();
      this.fy.reiniciar();
    }
    filtrar(x, y, t) {
      return { x: this.fx.filtrar(x, t), y: this.fy.filtrar(y, t) };
    }
  }

  U.FiltroEuro = FiltroEuro;
  U.FiltroEuro2D = FiltroEuro2D;

  /* ---------- Matrices 4x4 (orden por columnas, igual que three.js) ---------- */
  const M4 = {
    multiplicar(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] =
            a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    /** Aplica la matriz a [x,y,z,w] y devuelve [x,y,z,w]. */
    aplicar(m, v) {
      const [x, y, z, w] = v;
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12] * w,
        m[1] * x + m[5] * y + m[9] * z + m[13] * w,
        m[2] * x + m[6] * y + m[10] * z + m[14] * w,
        m[3] * x + m[7] * y + m[11] * z + m[15] * w
      ];
    },
    invertir(m) {
      const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
      const b00 = a00 * a11 - a01 * a10;
      const b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11;
      const b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30;
      const b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31;
      const b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1 / det;
      return [
        (a11 * b11 - a12 * b10 + a13 * b09) * det,
        (a02 * b10 - a01 * b11 - a03 * b09) * det,
        (a31 * b05 - a32 * b04 + a33 * b03) * det,
        (a22 * b04 - a21 * b05 - a23 * b03) * det,
        (a12 * b08 - a10 * b11 - a13 * b07) * det,
        (a00 * b11 - a02 * b08 + a03 * b07) * det,
        (a32 * b02 - a30 * b05 - a33 * b01) * det,
        (a20 * b05 - a22 * b02 + a23 * b01) * det,
        (a10 * b10 - a11 * b08 + a13 * b06) * det,
        (a01 * b08 - a00 * b10 - a03 * b06) * det,
        (a30 * b04 - a31 * b02 + a33 * b00) * det,
        (a21 * b02 - a20 * b04 - a23 * b00) * det,
        (a11 * b07 - a10 * b09 - a12 * b06) * det,
        (a00 * b09 - a01 * b07 + a02 * b06) * det,
        (a31 * b01 - a30 * b03 - a32 * b00) * det,
        (a20 * b03 - a21 * b01 + a22 * b00) * det
      ];
    }
  };
  U.M4 = M4;

  /* ---------- Preferencias del sistema ---------- */
  /** true si el sistema pide "reducir movimiento" (accesibilidad). */
  U.sistemaPideMenosMovimiento = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };

  FG.util = U;
})();
