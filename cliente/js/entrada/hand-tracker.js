/* ============================================================
   Hand Tracker: envuelve MediaPipe Hand Landmarker.
   MediaPipe encuentra 21 puntos por mano; usamos la punta del
   dedo índice (punto 8) como "pie" del jugador y la muñeca
   (punto 0) para saber de qué lado de la cancha está la mano.

        8   12  16  20      <- puntas
        |   |   |   |
        5---9---13--17
         \          /
          \   0    /        <- muñeca
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;

  // Pares de puntos que forman los "huesos" de la mano (para dibujarla)
  FG.CONEXIONES_MANO = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
  ];

  class HandTracker {
    constructor() {
      this.detector = null;
      this.listo = false;
      this.ultimoTiempoVideo = -1;
      this.ultimaMarca = 0;
      this.manos = [];
      this.fps = 0;
      this._cuadros = 0;
      this._tFps = performance.now();
    }

    /** Descarga MediaPipe y el modelo. Intenta GPU y, si falla, CPU. */
    async cargar(numManos = 2) {
      if (this.listo) return;
      let modulo = null;
      let archivos = null;
      let ultimoError = null;
      for (const fuente of C.MEDIAPIPE_FUENTES) {
        try {
          modulo = await import(fuente.modulo);
          archivos = await modulo.FilesetResolver.forVisionTasks(fuente.wasm);
          break;
        } catch (e) {
          ultimoError = e;
          console.warn('[HandTracker] falló', fuente.modulo, e);
        }
      }
      if (!archivos) {
        const e = new Error('mediapipe');
        e.codigo = 'mediapipe';
        e.original = ultimoError;
        throw e;
      }
      const opciones = (delegado) => ({
        baseOptions: { modelAssetPath: C.MODELO_MANO, delegate: delegado },
        runningMode: 'VIDEO',
        numHands: numManos,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      try {
        this.detector = await modulo.HandLandmarker.createFromOptions(archivos, opciones('GPU'));
      } catch (e) {
        console.warn('[HandTracker] GPU no disponible, uso CPU', e);
        try {
          this.detector = await modulo.HandLandmarker.createFromOptions(archivos, opciones('CPU'));
        } catch (e2) {
          const err = new Error('modelo');
          err.codigo = 'modelo';
          err.original = e2;
          throw err;
        }
      }
      this.listo = true;
    }

    /**
     * Devuelve las manos del cuadro actual del video:
     * [{ puntos: [21 x {x,y,z}], punta: {x,y}, muneca: {x,y}, lateralidad }]
     * x e y van de 0 a 1 respecto a la imagen original (sin espejo).
     */
    detectar(video, ahora) {
      if (!this.detector || !video || video.readyState < 2 || !video.videoWidth) return this.manos;
      if (video.currentTime === this.ultimoTiempoVideo) return this.manos;
      this.ultimoTiempoVideo = video.currentTime;
      const marca = Math.max(ahora, this.ultimaMarca + 1); // debe ir siempre en aumento
      this.ultimaMarca = marca;
      let r;
      try {
        r = this.detector.detectForVideo(video, marca);
      } catch (e) {
        console.warn('[HandTracker]', e);
        return this.manos;
      }
      const lista = (r && r.landmarks) || [];
      const lados = (r && (r.handednesses || r.handedness)) || [];
      this.manos = lista.map((lm, i) => ({
        puntos: lm,
        punta: lm[8],
        muneca: lm[0],
        lateralidad: (lados[i] && lados[i][0] && lados[i][0].categoryName) || ''
      }));
      this._cuadros++;
      if (ahora - this._tFps > 1000) {
        this.fps = this._cuadros;
        this._cuadros = 0;
        this._tFps = ahora;
      }
      return this.manos;
    }
  }

  FG.HandTracker = HandTracker;
})();
