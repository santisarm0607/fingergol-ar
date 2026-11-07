/* ============================================================
   Render "Modo Mesa" con AR.js + A-Frame.
   1. AR.js abre la cámara y busca el marcador Hiro.
   2. La cancha 3D aparece encima del marcador.
   3. MediaPipe lee la mano en ese mismo video.
   4. Para saber dónde toca tu dedo la cancha, lanzamos un "rayo"
      desde la cámara por el píxel del dedo hasta el plano de la mesa.
   Si tapas el marcador con la mano, la cancha se queda en su
   último lugar (por eso conviene dejar el celular quieto).
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const K = 0.02; // 1 unidad de cancha = 0.02 del tamaño del marcador (cancha ≈ 3.2 x 2 marcadores)

  class RenderAR {
    constructor(contenedor) {
      this.contenedor = contenedor;
      this.escena = null;
      this.video = null;
      this.visto = false;
      this.tPerdido = 0;
      this.objetos = null;
    }

    async cargarLibrerias() {
      if (!window.AFRAME) await FG.util.cargarScript(C.AFRAME_URLS);
      const tieneARjs = () =>
        window.AFRAME && ((AFRAME.systems && AFRAME.systems.arjs) || (AFRAME.components && AFRAME.components.arjs));
      if (!tieneARjs()) await FG.util.cargarScript(C.ARJS_URLS);
      if (!tieneARjs()) throw Object.assign(new Error('arjs'), { codigo: 'arjs' });
    }

    /** Crea la escena y espera a que AR.js tenga el video de la cámara listo. */
    async crearEscena() {
      const escena = document.createElement('a-scene');
      escena.setAttribute('embedded', '');
      escena.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono; trackingMethod: best;');
      escena.setAttribute('vr-mode-ui', 'enabled: false');
      escena.setAttribute('renderer', 'antialias: true; alpha: true; logarithmicDepthBuffer: true;');
      escena.setAttribute('loading-screen', 'enabled: false');
      escena.setAttribute('device-orientation-permission-ui', 'enabled: false');

      const marcador = document.createElement('a-marker');
      marcador.setAttribute('preset', 'hiro');
      marcador.setAttribute('smooth', 'true');
      marcador.setAttribute('smoothCount', '5');
      marcador.setAttribute('smoothTolerance', '0.01');
      marcador.setAttribute('smoothThreshold', '2');
      const ancla = document.createElement('a-entity');
      const camara = document.createElement('a-entity');
      camara.setAttribute('camera', '');
      escena.appendChild(marcador);
      escena.appendChild(ancla);
      escena.appendChild(camara);
      this.contenedor.appendChild(escena);
      this.escena = escena;
      this.marcador = marcador;
      this.ancla = ancla;

      await new Promise((resolver) => {
        if (escena.hasLoaded) resolver();
        else escena.addEventListener('loaded', resolver, { once: true });
      });
      this.construirCancha();

      // AR.js crea su propio <video id="arjs-video">
      const inicio = performance.now();
      while (performance.now() - inicio < 20000) {
        const v = document.getElementById('arjs-video');
        if (v && v.readyState >= 2 && v.videoWidth) {
          this.video = v;
          return v;
        }
        await FG.util.esperar(150);
      }
      throw Object.assign(new Error('arjs-video'), { codigo: 'permiso' });
    }

    construirCancha() {
      const THREE = AFRAME.THREE;
      this.THREE = THREE;
      const raiz = new THREE.Group();
      this.ancla.object3D.add(raiz);
      this.ancla.object3D.visible = false;

      // luces
      const escena3 = this.escena.object3D;
      escena3.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sol = new THREE.DirectionalLight(0xffffff, 1.4);
      sol.position.set(1, 3, 2);
      escena3.add(sol);

      const srgb = (tex) => {
        if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
      };

      // césped: reutilizamos el mismo dibujo 2D como textura
      const largo = F.ancho + F.fondoArco * 2;
      const lienzo = document.createElement('canvas');
      const esc = 8;
      lienzo.width = Math.round(largo * esc);
      lienzo.height = Math.round(F.alto * esc);
      const ctx = lienzo.getContext('2d');
      ctx.setTransform(esc, 0, 0, esc, F.fondoArco * esc, 0);
      FG.dibujarCampo(ctx, { transparente: false });
      const texCampo = srgb(new THREE.CanvasTexture(lienzo));
      const plano = new THREE.Mesh(
        new THREE.PlaneGeometry(largo * K, F.alto * K),
        new THREE.MeshBasicMaterial({ map: texCampo, transparent: true, opacity: 0.92 })
      );
      plano.rotation.x = -Math.PI / 2;
      raiz.add(plano);

      // arcos (postes + travesaño)
      const matPoste = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const altoArco = 0.16;
      [0, 1].forEach((lado) => {
        const x = this.aLocalX(lado === 0 ? 0 : F.ancho);
        const z1 = this.aLocalZ((F.alto - F.arco) / 2);
        const z2 = this.aLocalZ((F.alto + F.arco) / 2);
        [z1, z2].forEach((z) => {
          const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, altoArco, 10), matPoste);
          poste.position.set(x, altoArco / 2, z);
          raiz.add(poste);
        });
        const trav = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, z2 - z1, 10), matPoste);
        trav.rotation.x = Math.PI / 2;
        trav.position.set(x, altoArco, (z1 + z2) / 2);
        raiz.add(trav);
        const red = new THREE.Mesh(
          new THREE.BoxGeometry(F.fondoArco * K, altoArco, z2 - z1),
          new THREE.MeshBasicMaterial({ color: C.EQUIPOS[lado].color, transparent: true, opacity: 0.18, depthWrite: false })
        );
        red.position.set(x + (lado === 0 ? -1 : 1) * (F.fondoArco * K) / 2, altoArco / 2, (z1 + z2) / 2);
        raiz.add(red);
      });

      // balón con textura de parches
      const texBalon = document.createElement('canvas');
      texBalon.width = 256;
      texBalon.height = 128;
      const cb = texBalon.getContext('2d');
      cb.fillStyle = '#ffffff';
      cb.fillRect(0, 0, 256, 128);
      cb.fillStyle = '#1b2233';
      for (let i = 0; i < 12; i++) {
        const x = (i % 6) * 43 + (i > 5 ? 21 : 0);
        const y = i > 5 ? 88 : 40;
        cb.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k * Math.PI * 2) / 5;
          cb.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
        }
        cb.fill();
      }
      const rB = FG.Partido.R_BALON * K;
      const balon = new THREE.Mesh(
        new THREE.SphereGeometry(rB, 24, 16),
        new THREE.MeshLambertMaterial({ map: srgb(new THREE.CanvasTexture(texBalon)) })
      );
      balon.position.y = rB;
      raiz.add(balon);

      // jugadores tipo "futbolito": base + cuerpo + cabeza
      const rJ = FG.Partido.R_JUGADOR * K;
      const jugadores = [0, 1].map((lado) => {
        const g = new THREE.Group();
        const color = new THREE.Color(C.EQUIPOS[lado].color);
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(rJ, rJ, 0.03, 32),
          new THREE.MeshLambertMaterial({ color })
        );
        base.position.y = 0.015;
        const aro = new THREE.Mesh(
          new THREE.TorusGeometry(rJ * 0.98, 0.006, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        aro.rotation.x = Math.PI / 2;
        aro.position.y = 0.031;
        const cuerpo = new THREE.Mesh(
          new THREE.CylinderGeometry(rJ * 0.35, rJ * 0.5, 0.16, 16),
          new THREE.MeshLambertMaterial({ color })
        );
        cuerpo.position.y = 0.11;
        const cabeza = new THREE.Mesh(
          new THREE.SphereGeometry(rJ * 0.32, 16, 12),
          new THREE.MeshLambertMaterial({ color: 0xf2d0b0 })
        );
        cabeza.position.y = 0.23;
        g.add(base, aro, cuerpo, cabeza);
        raiz.add(g);
        return g;
      });

      this.objetos = { raiz, balon, jugadores };
      this.ejeGiro = new THREE.Vector3();
      this.qTmp = new THREE.Quaternion();
      this._p = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this._s = new THREE.Vector3();
      this._inv = new THREE.Matrix4();
    }

    aLocalX(fx) { return (fx - F.ancho / 2) * K; }
    aLocalZ(fy) { return (fy - F.alto / 2) * K; }

    /** Sigue al marcador; si se pierde, la cancha se queda donde estaba. */
    actualizar(partido, dt) {
      if (!this.objetos) return;
      const m = this.marcador.object3D;
      const a = this.ancla.object3D;
      if (m.visible) {
        m.updateMatrixWorld(true);
        m.matrixWorld.decompose(this._p, this._q, this._s);
        if (!this.visto) {
          a.position.copy(this._p);
          a.quaternion.copy(this._q);
          a.scale.copy(this._s);
        } else {
          a.position.lerp(this._p, 0.35);
          a.quaternion.slerp(this._q, 0.35);
          a.scale.lerp(this._s, 0.35);
        }
        this.visto = true;
        this.tPerdido = 0;
      } else {
        this.tPerdido += dt;
      }
      a.visible = this.visto;

      const { balon, jugadores } = this.objetos;
      const b = partido.balon;
      const nx = this.aLocalX(b.x);
      const nz = this.aLocalZ(b.y);
      const dx = nx - balon.position.x;
      const dz = nz - balon.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5 && dist < 0.5) {
        this.ejeGiro.set(dz, 0, -dx).normalize();
        this.qTmp.setFromAxisAngle(this.ejeGiro, dist / (b.r * K));
        balon.quaternion.premultiply(this.qTmp);
      }
      balon.position.x = nx;
      balon.position.z = nz;
      partido.jugadores.forEach((j, i) => {
        const g = jugadores[i];
        g.position.x = this.aLocalX(j.x);
        g.position.z = this.aLocalZ(j.y);
        g.scale.setScalar(j.activo ? 1 : 0.85);
      });
    }

    /** Píxel normalizado del video de AR.js -> píxel de pantalla (sin espejo). */
    videoAPantalla(nx, ny) {
      const r = this.video.getBoundingClientRect();
      return [r.left + nx * r.width, r.top + ny * r.height];
    }

    /** Píxel de pantalla -> coordenadas de cancha (rayo contra el plano de la mesa). */
    pantallaACancha(sx, sy) {
      if (!this.visto || !this.escena || !this.escena.camera) return null;
      const THREE = this.THREE;
      const lienzo = this.escena.canvas;
      const r = lienzo.getBoundingClientRect();
      const ndcX = ((sx - r.left) / r.width) * 2 - 1;
      const ndcY = -((sy - r.top) / r.height) * 2 + 1;
      const cam = this.escena.camera;
      cam.updateMatrixWorld();
      this._inv.copy(cam.projectionMatrix).invert();
      const origen = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const dir = new THREE.Vector3(ndcX, ndcY, 0.5)
        .applyMatrix4(this._inv)
        .applyMatrix4(cam.matrixWorld)
        .sub(origen)
        .normalize();
      const a = this.ancla.object3D;
      a.updateMatrixWorld(true);
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
      const punto = a.getWorldPosition(new THREE.Vector3());
      const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, punto);
      const golpe = new THREE.Ray(origen, dir).intersectPlane(plano, new THREE.Vector3());
      if (!golpe) return null;
      a.worldToLocal(golpe);
      return [golpe.x / K + F.ancho / 2, golpe.z / K + F.alto / 2];
    }

    /** Coordenadas de cancha -> píxel de pantalla (para textos flotantes). */
    canchaAPantalla(fx, fy) {
      if (!this.visto || !this.escena || !this.escena.camera) return null;
      const THREE = this.THREE;
      const v = new THREE.Vector3(this.aLocalX(fx), 0.05, this.aLocalZ(fy));
      this.ancla.object3D.localToWorld(v);
      const cam = this.escena.camera;
      v.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
      const r = this.escena.canvas.getBoundingClientRect();
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    }
  }

  FG.RenderAR = RenderAR;
})();
