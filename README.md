# ⚽ FingerGol AR — futbolito 3D con los dedos

Un **futbolito 3D en realidad aumentada**: pones un marcador sobre la mesa, la cámara del celular lo ve y aparece encima una cancha de madera con arcos, red y balón. **Tu mano es el jugador**: el dedo **índice** y el **medio** son sus dos piernas, y en la punta de cada dedo aparece un guayo. Caminas con los dedos sobre la mesa y pateas el balón al arco rival.

Hecho con **HTML, CSS y JavaScript**, sin instalar librerías:

- **AR.js + A-Frame** → siguen el marcador Hiro para anclar el futbolito a la mesa.
- **MediaPipe Hand Landmarker** → encuentra los 21 puntos de cada mano.
- **Hand tracker** (`cliente/js/entrada/hand-tracker.js`) → convierte las puntas del índice y del medio en los dos pies del jugador.
- **Motor 3D propio** (`render-3d.js`) → dibuja el futbolito en perspectiva con Canvas, igual en cualquier celular.
- **Multijugador**: 2 jugadores en la misma mesa, contra la máquina, o **en línea** con código de sala.

Autor: **SantiSarm**

---

## ⭐ Modo principal: 📺 Pantalla + celulares

1. En el **computador** abre el juego y pulsa **📺 Jugar: Pantalla + celulares**. Aparece la cancha y un **código QR**.
2. Cada jugador **escanea el QR** con la cámara de su celular (o abre el link y escribe el código de 4 letras).
3. En el celular pulsa **📷 Encender cámara** y apóyalo en la mesa mirando tu mano.
4. Tu **índice** y tu **medio** son los pies de tu jugador. Todo lo que ve la cámara es **tu mitad** de la cancha.
5. ¿Solo hay un celular? Pulsa **🤖 Poner bot** en el otro lado (Fácil / Normal / Difícil).
6. Pulsa **⚽ ¡A jugar!** en el computador.

Funciona desde **GitHub Pages** (no necesita `npm start`): los celulares se conectan directo a la pantalla con **PeerJS** (WebRTC); su servidor gratis solo ayuda a que se encuentren. Archivos: `cliente/pantalla.html`, `cliente/control.html` y `cliente/js/fiesta/`.

---

## 1. Cómo ejecutarlo (2 minutos)

Necesitas **Node.js 18 o más nuevo** ([nodejs.org](https://nodejs.org)) y **Chrome o Edge**.

1. Abre la carpeta `fingergol-ar` en **VS Code**.
2. Abre la terminal (*Terminal → New Terminal*) y escribe:

   ```bash
   npm start
   ```

3. Entra a **http://localhost:3000**.
4. Elige un modo, sigue la guía "Arma tu futbolito" y pulsa **Permitir** cuando el navegador pida la cámara.

> No hace falta `npm install`: el servidor usa solo lo que ya trae Node.
> AR.js y MediaPipe se descargan solos desde internet la primera vez, así que necesitas conexión.
> No abras `index.html` con doble clic: la cámara solo funciona en `http://localhost` o en `https://`.

**¿Sin cámara a mano?** En *Ajustes → Cómo jugar → Práctica sin cámara* juegas el mismo futbolito 3D con mouse, táctil o teclado.

---

## 2. Arma tu futbolito (la mesa)

```
            📱  ← celular QUIETO (en un vaso o soporte), mirando la mesa
           ╱  ╲
          ╱    ╲
   ┌─────────────────────┐
   │ ✌️    [ Hiro ]    ✌️ │   ← marcador plano sobre la mesa
   └─────────────────────┘
   Jugador 1        Jugador 2
```

1. **Marcador Hiro:** imprímelo de unos **10 cm** con su borde blanco, o ábrelo en otra pantalla (botón *Ver marcador* en el juego).
2. Ponlo **plano sobre la mesa**, con buena luz y sin reflejos.
3. Deja el **celular quieto** mirando la mesa desde arriba (apoyado en un vaso, un libro o un soporte). Mejor en **horizontal**. Que se vea el marcador completo y espacio alrededor.
4. Cuando aparezca el futbolito, cada jugador apoya **el índice y el medio** en su lado de la cancha, como dos piernas.

Con un marcador de 10 cm, la cancha mide unos **32 × 20 cm**. Si tapas el marcador con la mano, el futbolito se queda donde estaba, por eso el celular no se debe mover.

**¿Laptop?** La cámara de un portátil mira de frente, no a la mesa. Inclina la pantalla hacia adelante o usa una cámara USB apuntando a la mesa.

---

## 3. Cómo se juega

| | |
|---|---|
| ✌️ | El **índice** y el **medio** son las piernas. En la punta de cada dedo aparece un guayo de tu color. |
| ⚽ | Toca el balón con un dedo. **Mientras más rápido muevas el dedo, más fuerte sale el tiro.** |
| 🥅 | Mete gol en el arco del rival. Gana quien llegue primero a 3, 5 o 7 goles. |
| ↔️ | Tus guayos solo tocan el balón **en tu mitad**. Si cruzas la mitad se ven transparentes. |

### Modos

- **👥 2 jugadores**: dos personas en la misma mesa, una mano cada una. La mano es del jugador en cuyo lado está la **muñeca**.
- **🤖 Contra la máquina**: la máquina es un muñequito 3D que camina y patea. Dificultad Fácil / Normal / Difícil en *Ajustes*.
- **🌐 En línea**: cada uno juega en **su propia mesa**. Uno pulsa **Crear sala** y pasa el código de 4 letras; el otro pulsa **Unirme**. Tu rival aparece en tu mesa como un muñequito cuyos pies son sus dedos.

### Antes de empezar

1. "Apunta la cámara al marcador" → espera a que aparezca el futbolito.
2. "Pon tu mano como piernas" → cada barra se llena en menos de un segundo con los dedos sobre la mesa.
3. Cuenta regresiva 3, 2, 1… ¡YA!

Si alguien saca la mano durante el partido, aparece **"✌️ ¿Y tu mano?"** en su lado.

### Modo práctica (sin cámara)

- **Mouse:** mueves tu muñeco y **clic = patada**.
- **Táctil:** arrastra tu muñeco; **cada toque nuevo = patada**. Con dos dedos juegan dos personas.
- **Teclado:** J1 = **W A S D + Espacio**, J2 = **flechas + Enter**.

---

## 4. Jugar en línea o en el celular

**En un solo computador (para probar):** abre dos pestañas en `http://localhost:3000`, crea la sala en una y únete desde la otra.

**Para usar la cámara del celular hace falta `https://`.** Opciones:

### GitHub Pages (gratis; todo menos el modo en línea)

1. Sube el contenido de `fingergol-ar` a un repositorio **público** de GitHub.
2. *Settings → Pages → Source: Deploy from a branch → main → / (root)* → Save.
3. Abre `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` en el celular.

### Render (gratis; incluye el modo en línea)

1. Sube la carpeta a GitHub.
2. En [render.com](https://render.com) → **New → Web Service** → conecta el repositorio.
3. **Build Command:** `npm install` · **Start Command:** `npm start` · **Plan:** Free.
4. Comparte el link `https://tu-juego.onrender.com`.

> En el plan gratis el servidor se duerme si nadie entra y la primera carga tarda ~1 minuto.

### Túnel temporal (prueba rápida)

Con `npm start` corriendo, en otra terminal: `cloudflared tunnel --url http://localhost:3000` (hay que instalar [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)). Te da un link `https://…trycloudflare.com`.

### ¿Cómo funciona la red?

- Quien **crea la sala** (anfitrión) calcula la física y envía el estado del partido 30 veces por segundo.
- El **invitado** envía la posición de sus dos dedos (sus dos pies).
- El servidor (`servidor/servidor.js`) arma las salas y reenvía los mensajes por **WebSocket**.

---

## 5. Estructura de carpetas

```
fingergol-ar/
├── index.html                ← redirige a cliente/ (útil en GitHub Pages)
├── package.json              ← "npm start" arranca el servidor
├── README.md
├── servidor/
│   └── servidor.js           ← entrega la página + salas en línea (WebSocket)
└── cliente/                  ← todo lo que corre en el navegador
    ├── index.html            ← pantallas: inicio, guía, carga, lobby, HUD, pausa, fin
    ├── assets/icono.svg
    ├── css/estilos.css
    └── js/
        ├── config.js         ← librerías, tamaño del futbolito, colores, servidor
        ├── utilidades.js     ← matemáticas, matrices 4x4, guardado, filtro de suavizado
        ├── app.js            ← flujo del juego y bucle principal
        ├── juego/
        │   ├── fisica.js     ← balón, 2 pies por jugador, bandas, postes, goles
        │   ├── andador.js    ← hace caminar y patear a los muñecos (máquina y práctica)
        │   └── cpu.js        ← cerebro de la máquina
        ├── entrada/
        │   ├── camara.js     ← permiso de la cámara con mensajes claros
        │   ├── hand-tracker.js ← MediaPipe: puntos de la mano
        │   └── puntero.js    ← mouse, táctil y teclado (modo práctica)
        ├── render/
        │   ├── render-ar.js      ← AR.js: sigue el marcador y proyecta sobre la mesa
        │   ├── camara-virtual.js ← cámara "de TV" para el modo práctica
        │   └── render-3d.js      ← dibuja el futbolito 3D (cancha, arcos, guayos, muñecos)
        ├── red/red.js        ← cliente WebSocket del modo en línea
        └── audio/sonidos.js  ← sonidos generados con Web Audio
```

Los scripts se cargan en orden desde `index.html` y comparten un objeto global `FG`.

---

## 6. Cómo funciona por dentro

1. **AR.js** encuentra el marcador Hiro en cada cuadro del video y da su posición 3D respecto a la cámara (una matriz 4×4).
2. **MediaPipe** encuentra la mano en ese mismo video: 21 puntos por mano.
3. **Del dedo a la mesa:** desde la cámara se lanza un "rayo" por el píxel de la punta del índice (punto 8) y del medio (punto 12) hasta el plano del marcador. Donde choca el rayo está tu pie, en coordenadas de cancha (160 × 100).
4. **Suavizado:** un filtro *One Euro* quita el temblor sin agregar retraso.
5. **Física a 120 Hz:** cada pie empuja el balón con la velocidad de tu dedo; el balón rebota en las bandas de madera y en los palos.
6. **Dibujo 3D:** cada punto del futbolito se proyecta con la misma matriz de AR.js y se dibuja de lo más lejano a lo más cercano. Así queda pegado a la mesa real.

---

## 7. Personalizar (`cliente/js/config.js`)

- `CANCHA` → largo, ancho, tamaño y altura del arco, altura de las bandas.
- `ESCALA_AR` → qué tan grande se ve el futbolito respecto al marcador (0.02 = 3.2 × 2 marcadores).
- `EQUIPOS` → colores.
- `GOLES_POR_DEFECTO`.
- `SERVIDOR_URL` → si la página y el servidor están en sitios distintos.
- Versiones y direcciones de MediaPipe, A-Frame y AR.js.

---

## 8. Problemas comunes

| Problema | Solución |
|---|---|
| "No tenemos permiso para usar la cámara" | Candado 🔒 de la barra de direcciones → Cámara → Permitir → **Reintentar**. |
| "La cámara solo funciona desde https o localhost" | Usa `http://localhost:3000` (con `npm start`) o un link `https://`. |
| No aparece el futbolito | Marcador completo en la imagen, plano, con luz y sin reflejos; borde blanco alrededor. |
| El futbolito tiembla | Celular quieto (apoyado), más luz, marcador más grande. |
| No detecta los dedos | Más luz; que se vea la mano completa desde la muñeca; fondo de mesa liso. |
| Los guayos no quedan justo en los dedos | Apoya bien las puntas en la mesa (si el dedo está en el aire, el punto se ve "detrás"). |
| Va lento | Cierra otras pestañas; usa Chrome; celulares recientes funcionan mejor. |
| "No se pudo conectar al servidor del juego" | El modo en línea necesita `npm start` o Render (no Live Server ni GitHub Pages). |
| "El puerto 3000 ya está en uso" | `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`). |

---

## 9. Librerías (por CDN)

| Librería | Uso | Versión |
|---|---|---|
| [AR.js](https://github.com/AR-js-org/AR.js) | Seguimiento del marcador Hiro | rama master |
| [A-Frame](https://aframe.io) | Base que necesita AR.js | 1.6.0 |
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) | Detección de manos (Hand Landmarker) | 0.10.14 |

Para jugar sin internet, descarga esos archivos y cambia las rutas en `config.js`.
