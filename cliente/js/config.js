/* ============================================================
   FingerGol AR — configuración general
   Aquí cambias versiones de librerías, tamaño de la cancha,
   colores y la dirección del servidor en línea.
   ============================================================ */
window.FG = window.FG || {};

FG.config = {
  // --- MediaPipe (detector de manos de Google) ---------------
  // Se prueban en orden: si la primera falla se usa la siguiente.
  MEDIAPIPE_FUENTES: [
    {
      modulo: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
      wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    },
    {
      modulo: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
      wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    }
  ],
  MODELO_MANO:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

  // --- AR.js + A-Frame (seguimiento del marcador sobre la mesa) ---
  AFRAME_URLS: [
    'https://aframe.io/releases/1.6.0/aframe.min.js',
    'https://cdn.jsdelivr.net/gh/aframevr/aframe@1.6.0/dist/aframe-master.min.js'
  ],
  ARJS_URLS: [
    'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js',
    'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@master/aframe/build/aframe-ar.js'
  ],
  // Imagen del marcador Hiro para imprimir (dos copias por si una falla)
  MARCADOR_HIRO: [
    'https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png',
    'https://upload.wikimedia.org/wikipedia/commons/4/48/Hiro_marker_ARjs.png'
  ],

  // --- Servidor en línea ------------------------------------
  // null = usa el mismo servidor que entrega la página (lo normal).
  // Si subes el cliente a otro hosting, pon aquí la URL, ej:
  // 'wss://mi-fingergol.onrender.com/ws'
  SERVIDOR_URL: null,

  // --- Modo "Pantalla + celulares" (PeerJS) ----------------
  // null = usa el servidor gratis de PeerJS (0.peerjs.com).
  // Para usar uno propio: { host: 'mi-servidor.com', port: 443, path: '/', secure: true }
  PEER_OPCIONES: null,

  // --- Futbolito (unidades del juego: 1 unidad ≈ 2 mm con marcador de 10 cm) ---
  CANCHA: {
    ancho: 160,      // largo (de arco a arco)
    alto: 100,       // ancho
    arco: 34,        // boca del arco
    fondoArco: 8,    // profundidad de la red
    alturaArco: 12,  // altura del travesaño
    banda: 3         // altura de las paredes de madera
  },
  // Tamaño de la cancha respecto al marcador (1 = lado del marcador).
  // 0.02 → la cancha mide 3.2 x 2 marcadores.
  ESCALA_AR: 0.02,

  EQUIPOS: [
    { color: '#2ec5ff', oscuro: '#0b6e9c', nombre: 'AZUL' },
    { color: '#ff4d6d', oscuro: '#a3183a', nombre: 'ROJO' }
  ],

  GOLES_POR_DEFECTO: 5,

  // true solo en la vista previa dentro de Claude (sin cámara ni servidor)
  MODO_DEMO: false
};
