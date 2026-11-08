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

  // --- Mesa 3D en realidad aumentada (A-Frame + AR.js, marcador Hiro) ---
  AFRAME_URLS: [
    'https://aframe.io/releases/1.6.0/aframe.min.js',
    'https://cdn.jsdelivr.net/gh/aframevr/aframe@1.6.0/dist/aframe-master.min.js'
  ],
  ARJS_URLS: [
    'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js',
    'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@master/aframe/build/aframe-ar.js'
  ],
  // Imagen del marcador Hiro para imprimir o mostrar en otra pantalla (si una falla, la otra)
  MARCADOR_HIRO: [
    'https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png',
    'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@master/data/images/hiro.png'
  ],
  // Tamaño de la mesa respecto al marcador: 0.02 → la mesa mide 3.2 x 2 marcadores
  // (con un marcador de 10 cm, la mesa virtual mide 32 x 20 cm).
  ESCALA_AR: 0.02,

  // --- Servidor en línea ------------------------------------
  // null = usa el mismo servidor que entrega la página (lo normal).
  // Si subes el cliente a otro hosting, pon aquí la URL, ej:
  // 'wss://mi-fingergol.onrender.com/ws'
  SERVIDOR_URL: null,

  // --- Cancha (unidades del juego, no píxeles) ---------------
  CANCHA: {
    ancho: 160,     // largo de la cancha (de arco a arco)
    alto: 100,      // ancho de la cancha
    arco: 34,       // tamaño de la boca del arco
    fondoArco: 7    // profundidad de la red
  },

  EQUIPOS: [
    { color: '#22e4ff', oscuro: '#075e74', nombre: 'AZUL' },
    { color: '#ff2e93', oscuro: '#7d0b47', nombre: 'ROJO' }
  ],

  GOLES_POR_DEFECTO: 5,

  // Qué tanto tapa la mesa a la cámara (0 = invisible, 1 = tapa todo).
  // Más bajo = te ves mejor a ti mismo y se siente más "realidad aumentada".
  OPACIDAD_MESA_CAMARA: 0.3,

  // Zona cómoda para la mano: qué parte de la cámara cubre toda la mesa.
  // 0.75 = con el 75% del centro de la cámara llegas a las esquinas, sin que
  // la mano se salga del cuadro. 1 = toda la cámara (hay que mover más el brazo).
  ZONA_MANO: 0.75,

  // Modo ahorro: si el juego baja de estos cuadros por segundo durante
  // unos segundos, se apagan brillos y se busca la mano un cuadro sí y otro no.
  FPS_MINIMO: 28,

  // Gestos con la mano (segundos que hay que sostenerlos)
  GESTO_PAUSA_SEG: 1.2,      // mano abierta → pausa
  GESTO_PULGAR_SEG: 0.9,     // pulgar arriba → continuar / revancha

  // En línea: segundos que se espera a un jugador que perdió la conexión
  ESPERA_RECONEXION: 15,

  // true solo en la vista previa dentro de Claude (sin cámara ni servidor)
  MODO_DEMO: false
};
