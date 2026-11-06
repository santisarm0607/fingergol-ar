/* ============================================================
   Realidad aumentada con AR.js (marcador Hiro sobre la mesa).
   - RenderAR: carga A-Frame + AR.js, abre la cámara y sigue el
     marcador. Si tapas el marcador con la mano, el futbolito se
     queda en su último lugar (por eso el celular va quieto).
   - CamaraAR: usa la posición del marcador y la cámara de AR.js
     para proyectar el futbolito 3D (render-3d.js) sobre la mesa,
     y para saber en qué punto de la cancha tocan tus dedos
     (un "rayo" desde la cámara hasta el plano de la mesa).
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const M4 = FG.util.M4;

  class RenderAR {
    constructor(contenedor) {
      this.contenedor = contenedor;
      this.escena = null;
      this.video = null;
      this.visto = false;
      this.tPerdido = 0;
    }

    async cargarLibrerias() {
      if (!window.AFRAME) await FG.util.cargarScript(C.AFRAME_URLS);
      const tieneARjs = () =>
        window.AFRAME && ((AFRAME.systems && AFRAME.systems.arjs) || (AFRAME.components && AFRAME.components.arjs));
      if (!tieneARjs()) await FG.util.cargarScript(C.ARJS_URLS);
      if (!tieneARjs()) throw Object.assign(new Error('arjs'), { codigo: 'arjs' });
    }

    /** Crea la escena de AR.js y espera a que su video de cámara esté listo. */
    async crearEscena() {
      const escena = document.createElement('a-scene');
      escena.setAttribute('embedded', '');
      escena.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono; trackingMethod: best;');
      escena.setAttribute('vr-mode-ui', 'enabled: false');
      escena.setAttribute('renderer', 'antialias: false; alpha: true;');
      escena.setAttribute('loading-screen', 'enabled: false');
      escena.setAttribute('device-orientation-permission-ui', 'enabled: false');
      const marcador = document.createElement('a-marker');
      marcador.setAttribute('preset', 'hiro');
      marcador.setAttribute('smooth', 'true');
      marcador.setAttribute('smoothCount', '5');
      marcador.setAttribute('smoothTolerance', '0.01');
      marcador.setAttribute('smoothThreshold', '2');
      const camara = document.createElement('a-entity');
      camara.setAttribute('camera', '');
      escena.appendChild(marcador);
      escena.appendChild(camara);
      this.contenedor.appendChild(escena);
      this.escena = escena;
      this.marcador = marcador;

      await new Promise((resolver) => {
        if (escena.hasLoaded) resolver();
        else escena.addEventListener('loaded', resolver, { once: true });
      });
      const THREE = AFRAME.THREE;
      this.ancla = new THREE.Object3D(); // copia suavizada de la posición del marcador
      this._p = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this._s = new THREE.Vector3();

      const inicio = performance.now();
      while (performance.now() - inicio < 20000) {
        const v = document.getElementById('arjs-video'); // AR.js crea su propio <video>
        if (v && v.readyState >= 2 && v.videoWidth) {
          this.video = v;
          return v;
        }
        await FG.util.esperar(150);
      }
      throw Object.assign(new Error('arjs-video'), { codigo: 'permiso' });
    }

    /** Llamar cada cuadro: sigue al marcador con suavizado. */
    actualizar(dt) {
      if (!this.ancla || !this.marcador) return;
      const m = this.marcador.object3D;
      if (m.visible) {
        m.updateMatrixWorld(true);
        m.matrixWorld.decompose(this._p, this._q, this._s);
        const a = this.ancla;
        if (!this.visto) {
          a.position.copy(this._p);
          a.quaternion.copy(this._q);
          a.scale.copy(this._s);
        } else {
          a.position.lerp(this._p, 0.35);
          a.quaternion.slerp(this._q, 0.35);
          a.scale.lerp(this._s, 0.35);
        }
        a.updateMatrixWorld(true);
        this.visto = true;
        this.tPerdido = 0;
      } else {
        this.tPerdido += dt;
      }
    }

    /** Punto normalizado del video de AR.js -> píxel de pantalla (sin espejo). */
    videoAPantalla(nx, ny) {
      const r = this.video.getBoundingClientRect();
      return [r.left + nx * r.width, r.top + ny * r.height];
    }
  }

  /**
   * Cámara que proyecta el futbolito sobre el marcador.
   * fuente = { matrizAncla(), matrizCamara(), proyeccion(), rect() } (arreglos de 16 números,
   * orden por columnas). Con AR.js la fuente es RenderAR; en las pruebas puede ser falsa.
   */
  class CamaraAR {
    constructor(fuente) {
      this.fuente = fuente;
      this.K = C.ESCALA_AR;
      this.listo = false;
    }

    static desdeAR(ar) {
      return new CamaraAR({
        lista: () => ar.visto && ar.escena && ar.escena.camera,
        matrizAncla: () => ar.ancla.matrixWorld.elements,
        matrizCamara: () => {
          ar.escena.camera.updateMatrixWorld();
          return ar.escena.camera.matrixWorld.elements;
        },
        proyeccion: () => ar.escena.camera.projectionMatrix.elements,
        rect: () => ar.escena.canvas.getBoundingClientRect()
      });
    }

    /** Recalcula las matrices (una vez por cuadro). */
    preparar() {
      const f = this.fuente;
      if (!f.lista()) {
        this.listo = false;
        return;
      }
      const M = Array.from(f.matrizAncla());
      const camM = Array.from(f.matrizCamara());
      const P = Array.from(f.proyeccion());
      const V = M4.invertir(camM);
      if (!V) {
        this.listo = false;
        return;
      }
      this.PVM = M4.multiplicar(P, M4.multiplicar(V, M));
      this.inv = M4.invertir(this.PVM);
      const Minv = M4.invertir(M);
      if (!this.inv || !Minv) {
        this.listo = false;
        return;
      }
      this.rect = f.rect();
      this.escala = Math.hypot(M[0], M[1], M[2]) || 1;
      this.focal = (P[5] * this.rect.height) / 2;
      const l = M4.aplicar(Minv, [camM[12], camM[13], camM[14], 1]);
      this.ojoCancha = [l[0] / this.K + F.ancho / 2, l[1] / this.K, l[2] / this.K + F.alto / 2];
      this.listo = true;
    }

    visible() {
      return this.listo;
    }

    ojo() {
      return this.ojoCancha;
    }

    proyectar(x, h, z) {
      if (!this.listo) return null;
      const K = this.K;
      const c = M4.aplicar(this.PVM, [(x - F.ancho / 2) * K, h * K, (z - F.alto / 2) * K, 1]);
      if (c[3] <= 1e-6) return null;
      const r = this.rect;
      return {
        x: r.left + ((c[0] / c[3] + 1) / 2) * r.width,
        y: r.top + ((1 - c[1] / c[3]) / 2) * r.height,
        p: c[3],
        e: (this.focal * K * this.escala) / c[3]
      };
    }

    /** Píxel de pantalla -> punto [x, z] sobre la cancha (plano de la mesa). */
    pantallaAPlano(sx, sy) {
      if (!this.listo) return null;
      const r = this.rect;
      const nx = ((sx - r.left) / r.width) * 2 - 1;
      const ny = 1 - ((sy - r.top) / r.height) * 2;
      const a = M4.aplicar(this.inv, [nx, ny, -1, 1]);
      const b = M4.aplicar(this.inv, [nx, ny, 1, 1]);
      if (!a[3] || !b[3]) return null;
      const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
      const p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
      const dy = p1[1] - p0[1];
      if (Math.abs(dy) < 1e-9) return null;
      const t = -p0[1] / dy;
      if (t < 0) return null;
      const px = p0[0] + (p1[0] - p0[0]) * t;
      const pz = p0[2] + (p1[2] - p0[2]) * t;
      return [px / this.K + F.ancho / 2, pz / this.K + F.alto / 2];
    }
  }

  FG.RenderAR = RenderAR;
  FG.CamaraAR = CamaraAR;
})();
