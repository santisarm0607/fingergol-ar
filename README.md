# ⚽ FingerGol AR — fútbol con los dedos

Juego web de fútbol en **realidad aumentada**: la cámara ve tu mano, tu **dedo índice** mueve tu ficha y empujas el balón hasta el arco rival. Hecho con **HTML, CSS y JavaScript**, sin instalar librerías.

- **MediaPipe Hand Landmarker** → detecta los 21 puntos de cada mano.
- **Hand tracker** (`cliente/js/entrada/hand-tracker.js`) → convierte esos puntos en jugadores.
- **Multijugador**: 2 jugadores en la misma cámara, contra la máquina, o **en línea** con código de sala.

Autor: **SantiSarm** · Versión **1.3**

### Novedades 1.3: mesa de air hockey neón
- Todo el juego es una **máquina de air hockey**: mesa índigo con los huequitos del aire, líneas de neón azul celeste (equipo 1) y fucsia (equipo 2), y un **disco** amarillo limón.
- Los jugadores son **mazos de air hockey**; con la cámara, un anillo de neón marca tu mazo en la punta del dedo índice.
- Menú nuevo encima de la mesa encendida: letrero de neón que se prende al abrir y botones de máquina de salón.
- Sin emojis: los íconos (pausa, sonido, pantalla completa, copa) están dibujados.
- Letras: *Monoton* (letrero) y *Rajdhani* (textos).

### Novedades 1.1
- **Se siente mejor:** pausa cortita al pegar fuerte, temblor, estela de color en los tiros fuertes, cámara lenta en el gol y pitazo final.
- **Aviso de poca luz** cuando la cámara no ve bien tu mano.
- Se quitó el Modo Mesa (marcador Hiro). En GitHub Pages el modo En línea aparece desactivado (necesita el servidor).

---

## 1. Cómo ejecutarlo (2 minutos)

Necesitas **Node.js 18 o más nuevo** ([nodejs.org](https://nodejs.org)) y **Chrome o Edge**.

1. Abre la carpeta `fingergol-ar` en **VS Code**.
2. Abre la terminal (`Ctrl + ñ` o *Terminal → New Terminal*) y escribe:

   ```bash
   npm start
   ```

3. Entra a **http://localhost:3000** en el navegador.
4. Elige un modo y pulsa **Permitir** cuando el navegador pida la cámara.

> No hace falta `npm install`: el servidor usa solo módulos que ya trae Node.
> MediaPipe se descarga solas desde internet la primera vez, así que necesitas conexión.

**Sin Node (solo modos locales):** instala la extensión **Live Server** en VS Code, clic derecho en `cliente/index.html` → *Open with Live Server*. Funcionan "2 jugadores" y "Contra la máquina"; el modo **En línea** necesita `npm start`.

> ⚠️ No abras el `index.html` con doble clic: la cámara solo funciona en `http://localhost` o en `https://`.

---

## 2. Cómo se juega

| Paso | Qué hacer |
|---|---|
| ☝️ | Muestra tu **dedo índice** a la cámara. Tu ficha sigue a la punta del dedo. |
| ⚽ | Choca el balón con tu ficha. **Más rápido mueves el dedo, más fuerte el tiro.** |
| 🥅 | Mete gol en el arco del rival. Gana quien llegue primero a 3, 5 o 7 goles. |

Cada jugador solo puede moverse en **su mitad** de la cancha (azul a la izquierda, rojo a la derecha).

### Modos

- **👥 2 jugadores** — dos personas frente a la misma cámara, una mano cada una. La mano pertenece al jugador del lado donde está la **muñeca**.
- **🤖 Contra la máquina** — para jugar solo. Dificultad Fácil / Normal / Difícil en *Ajustes*.
- **🌐 En línea** — uno pulsa **Crear sala** y le pasa el código de 4 letras al otro, que pulsa **Unirme**.

### Antes de empezar: "Muestra tu mano"

El juego espera a que cada jugador ponga la mano en su lado (la barra se llena en menos de un segundo). Si alguien pierde la mano durante el partido, su ficha se queda quieta y aparece **"✋ ¿Y tu mano?"**.

### Sin cámara

En *Ajustes → Control → Táctil / mouse*:
- **Celular/tablet:** cada jugador toca la pantalla en su mitad.
- **Computador:** mueve el mouse, o usa el teclado: **J1 = W A S D**, **J2 = flechas**.
- Si la cámara falla, el juego te ofrece el botón **"Jugar sin cámara"**.

---

## 3. Jugar en línea entre dos dispositivos

**Para probar en un solo computador:** abre dos pestañas en `http://localhost:3000`, crea la sala en una y únete desde la otra.

**Solo para verlo en el celular o compartir el link (sin modo en línea): GitHub Pages**

1. Sube todo el contenido de `fingergol-ar` a un repositorio **público** de GitHub.
2. *Settings → Pages → Source: Deploy from a branch → main → / (root)* → Save.
3. En 1–2 minutos abre `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` (el `index.html` de la raíz te lleva solo al juego).

Ahí funcionan la cámara, las manos, "2 jugadores" y "Contra la máquina". El modo **En línea** no, porque GitHub Pages no corre el servidor de Node.

**Entre dos dispositivos en línea** hay un detalle: los navegadores **solo dan la cámara en `https://`** (o en `localhost`). Por eso `http://192.168.x.x:3000` sirve para jugar con táctil/mouse, pero no con las manos. Dos soluciones:

### Opción A — Publicarlo gratis en Render (link permanente con https)

1. Sube la carpeta `fingergol-ar` a un repositorio de **GitHub**.
2. En [render.com](https://render.com) → **New → Web Service** → conecta el repositorio.
3. Configura:
   - **Build Command:** `npm install` *(no instala nada, pero Render lo pide)*
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Render te da un link `https://tu-juego.onrender.com`. Compártelo y listo.

> En el plan gratis, si nadie entra por un rato el servidor se duerme y la primera carga tarda ~1 minuto.

### Opción B — Túnel temporal (para una prueba rápida)

Con el servidor corriendo (`npm start`), en otra terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Te da un link `https://algo.trycloudflare.com` que funciona mientras la terminal esté abierta. (Hay que instalar [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) primero.)

### ¿Cómo funciona la red?

- Quien **crea la sala** (anfitrión) calcula la física y envía el estado del partido 30 veces por segundo.
- El **invitado** solo envía la posición de su dedo.
- El servidor (`servidor/servidor.js`) arma las salas y reenvía mensajes por **WebSocket**.

---

## 5. Estructura de carpetas

```
fingergol-ar/
├── package.json              ← "npm start" arranca el servidor
├── README.md
├── servidor/
│   └── servidor.js           ← entrega la página + salas en línea (WebSocket)
└── cliente/                  ← todo lo que corre en el navegador
    ├── index.html            ← pantallas: inicio, carga, lobby, HUD, pausa, fin
    ├── assets/
    │   └── icono.svg
    ├── css/
    │   └── estilos.css
    └── js/
        ├── config.js         ← versiones de librerías, cancha, colores, servidor
        ├── utilidades.js     ← matemáticas, guardado, filtro de suavizado
        ├── app.js            ← flujo del juego y bucle principal
        ├── juego/
        │   ├── fisica.js     ← balón, jugadores, rebotes, postes, goles
        │   └── cpu.js        ← rival de la máquina
        ├── entrada/
        │   ├── camara.js     ← permiso y video de la cámara
        │   ├── hand-tracker.js ← MediaPipe: puntos de la mano
        │   └── puntero.js    ← táctil, mouse y teclado
        ├── render/
        │   └── render-pantalla.js ← cancha 2D sobre la cámara (Canvas)
        ├── red/
        │   └── red.js        ← cliente WebSocket del modo en línea
        └── audio/
            └── sonidos.js    ← sonidos generados con Web Audio
```

Los scripts se cargan en orden desde `index.html` y comparten un objeto global `FG`, así puedes abrir cualquier archivo y entenderlo solo.

---

## 6. Cómo funciona por dentro

1. **Cámara → MediaPipe:** cada cuadro del video entra a `HandLandmarker.detectForVideo()` y devuelve hasta 2 manos con 21 puntos (0 a 1).
2. **Punto → pantalla → cancha:** la punta del índice (punto 8) se pasa a píxeles (el video está en espejo) y luego a "unidades de cancha" (160 × 100).
3. **Suavizado:** un filtro *One Euro* quita el temblor de la mano sin agregar retraso.
4. **Física a 120 Hz:** la ficha sigue al dedo; el balón rebota con la velocidad de tu dedo, en las bandas y en los postes.
5. **Dibujo:** Canvas 2D encima del video de la cámara.

---

## 7. Personalizar

En `cliente/js/config.js` puedes cambiar:

- `CANCHA` → tamaño de la cancha y del arco.
- `EQUIPOS` → colores de cada equipo.
- `GOLES_POR_DEFECTO`.
- `SERVIDOR_URL` → si subes la página y el servidor a sitios distintos.
- Versión de MediaPipe.

Los sonidos se generan en código (`audio/sonidos.js`). Para usar archivos `.mp3`, ponlos en `cliente/assets/` y reemplaza la función correspondiente.

---

## 8. Problemas comunes

| Problema | Solución |
|---|---|
| "No tenemos permiso para usar la cámara" | Toca el candado 🔒 de la barra de direcciones → Cámara → Permitir → **Reintentar**. |
| "La cámara solo funciona desde https o localhost" | Abre `http://localhost:3000` (con `npm start`), no el archivo con doble clic. |
| "Otra app está usando la cámara" | Cierra Zoom/Meet/otras pestañas con cámara. |
| No detecta la mano | Más luz, mano a 40–70 cm, palma hacia la cámara, fondo sin mucho desorden. |
| Va lento | Cierra otras pestañas; usa Chrome o Edge. |
| "No se pudo conectar al servidor del juego" | El modo en línea necesita `npm start` (no Live Server). |
| "El puerto 3000 ya está en uso" | `PORT=3001 npm start` (en PowerShell: `$env:PORT=3001; npm start`). |

---

## 9. Librerías usadas (por CDN)

| Librería | Uso | Versión |
|---|---|---|
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) | Detección de manos (Hand Landmarker) | 0.10.14 |

Si quieres usar archivos locales en vez de CDN (para jugar sin internet), descárgalos y cambia las rutas en `config.js`.
