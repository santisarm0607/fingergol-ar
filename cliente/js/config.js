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

  // true solo en la vista previa dentro de Claude (sin cámara ni servidor)
  MODO_DEMO: false
};
