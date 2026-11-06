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
  FG.util = U;
})();
