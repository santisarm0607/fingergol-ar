# FingerGol AR — fútbol con los dedos

Juego web de air hockey en **realidad aumentada**: la cámara ve tu mano, tu **dedo índice** mueve tu mazo y empujas el disco hasta el arco rival. Hecho con **HTML, CSS y JavaScript**, sin instalar librerías.

- **MediaPipe Hand Landmarker** → detecta los 21 puntos de cada mano.
- **Hand tracker** (`cliente/js/entrada/hand-tracker.js`) → convierte esos puntos en jugadores.
- **Multijugador**: 2 jugadores en la misma cámara, contra la máquina, o **en línea** con código de sala.

Es **solo una página web**: no hay nada que instalar ni descargar, y funciona igual en iPhone, Android y computador.

Autor: **SantiSarm** · Versión **1.5.2**

### Novedades 1.5.2

- **Apodos:** en Ajustes puedes escribir un apodo para el jugador 1 y el jugador 2 (máximo 10 letras). Salen en el marcador, el lobby, los goles y la pantalla final. El apodo del jugador 1 también se usa contra la máquina y en línea (tu rival ve tu apodo).

### Novedades 1.5.1
- Se quitó la mesa 3D con AR.js (marcador Hiro).
- El botón **En línea** solo aparece cuando el servidor del juego está corriendo (`npm start` o Render). En GitHub Pages o Live Server ya no sale un botón gris que no funciona.

### Novedades 1.5
- **Zona cómoda para la mano:** con el centro de la cámara llegas a toda la mesa, sin estirar el brazo hasta que la mano se salga del cuadro. El mazo sigue justo debajo de tu dedo.
- **Gestos:** abre toda la mano y déjala quieta un segundo para **pausar**; pulgar arriba para **continuar** o pedir la **revancha**. Mientras mueves la mano jugando, no se activa.
- **Reconexión en línea:** si a alguien se le cae el internet, el partido se congela y tiene 15 segundos para volver solo, con el mismo marcador.
- **Funciona sin internet** después de la primera visita (la página y MediaPipe quedan guardados en el navegador).
- **Récords contra la máquina:** victorias y mejor racha en cada dificultad (en el inicio y al terminar el partido).
- **Movimiento reducido** en *Ajustes*: sin temblor, destellos ni animaciones. Si tu sistema ya lo pide, viene activado.
- **Modo ahorro automático:** si el celular no da, se quitan los brillos y el juego sigue fluido.
- **Menú con el celular acostado:** dos columnas, todo cabe sin bajar.
- **Pruebas automáticas:** `npm test` revisa la física, la máquina, los gestos y el servidor.

### Novedades 1.4
- **Video tutorial de 20 segundos** la primera vez que juegas (con manos o táctil). También en **Mira cómo se juega** (inicio) y **Cómo se juega** (pausa).
- **Se ve más la cámara:** la mesa es más transparente cuando juegas con las manos (`OPACIDAD_MESA_CAMARA`).
- **Mismas palabras en todo el juego:** mazo, disco y mesa.

### Novedades 1.3: mesa de air hockey neón
- Todo el juego es una **máquina de air hockey**: mesa índigo, neón azul celeste (equipo 1) y fucsia (equipo 2), y un **disco** amarillo limón.
- Sin emojis: los íconos están dibujados. Letras: *Monoton* (letrero) y *Rajdhani* (textos).

### Novedades 1.1
- Pausa cortita al pegar fuerte, temblor, estela de color, cámara lenta en el gol y pitazo final.
- Aviso de poca luz.

---

## 1. Cómo ejecutarlo (2 minutos)

Necesitas **Node.js 18 o más nuevo** ([nodejs.org](https://nodejs.org)) y **Chrome o Edge** (en iPhone, Safari).

1. Abre la carpeta `fingergol-ar` en **VS Code**.
2. Abre la terminal (`Ctrl + ñ` o *Terminal → New Terminal*) y escribe:

   ```bash
   npm start
   ```

3. Entra a **http://localhost:3000** en el navegador.
4. Elige un modo, mira el tutorial (o sáltalo) y pulsa **Permitir** cuando el navegador pida la cámara.

> No hace falta `npm install`: el servidor usa solo módulos que ya trae Node.
> MediaPipe se descarga sola desde internet la primera vez; después el juego abre aunque no haya internet.

**Sin Node (solo modos locales):** instala la extensión **Live Server** en VS Code, clic derecho en `cliente/index.html` → *Open with Live Server*. Funcionan "2 jugadores" y "Contra la máquina"; el botón **En línea** no aparece porque necesita `npm start`.

> **Ojo:** no abras el `index.html` con doble clic: la cámara solo funciona en `http://localhost` o en `https://`.

### Pruebas automáticas

```bash
npm test
```

Revisa en unos segundos que los rebotes, los goles, la máquina, los gestos y las salas en línea (incluida la reconexión) sigan funcionando. Córrelo después de cambiar algo del código.

---

## 2. Cómo se juega

| Paso | Qué hacer |
|---|---|
| 1 | Muestra tu **dedo índice** a la cámara. Tu mazo sigue a la punta del dedo. |
| 2 | Golpea el disco con tu mazo. **Más rápido mueves el dedo, más fuerte el disparo.** |
| 3 | Mete gol en el arco del rival. Gana quien llegue primero a 3, 5 o 7 goles. |

Cada jugador solo puede moverse en **su mitad** de la mesa (azul a la izquierda, fucsia a la derecha).

### Gestos (sin tocar la pantalla)

| Gesto | Qué hace |
|---|---|
| Mano abierta, quieta, 1 segundo | Pausa (aparece un anillo que se llena en tu palma) |
| Pulgar arriba (puño cerrado), 1 segundo | En la pausa: continuar. Al final: revancha |

Solo cuentan con la mano **quieta**: mientras mueves el mazo nunca se activan. En el modo en línea no hay pausa (el partido es de los dos).

### Tutorial

- Sale solo la **primera vez** que juegas con las manos, y otra vez la primera vez con táctil/mouse.
- Puedes verlo cuando quieras: **Mira cómo se juega** en el inicio, o **Cómo se juega** en la pausa.
- El código está en `cliente/js/tutorial/tutorial.js` y usa el mismo dibujo y la misma física del juego.

### Modos

- **Contra la máquina** — para jugar solo. Dificultad Fácil / Normal / Difícil en *Ajustes*. Se guardan tus victorias y tu mejor racha en cada dificultad.
- **2 jugadores** — dos personas frente a la misma cámara, una mano cada una. La mano pertenece al jugador del lado donde está la **muñeca**.
- **En línea** — uno pulsa **Crear sala** y le pasa el código de 4 letras al otro, que pulsa **Unirme**. Este botón solo aparece cuando el servidor del juego está corriendo.

### Antes de empezar: "Muestra tu mano"

El juego espera a que cada jugador ponga la mano en su lado (la barra se llena en menos de un segundo). Si alguien pierde la mano durante el partido, su mazo se queda quieto y aparece **"¿Y tu mano?"**.

### Sin cámara

En *Ajustes → Control → Mouse o táctil*:
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

Ahí funcionan la cámara, las manos, "2 jugadores" y "Contra la máquina". El modo **En línea** no aparece, porque GitHub Pages no corre el servidor de Node.

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
- **Reconexión:** al crear o unirse a una sala, el servidor le da a cada jugador una **llave** secreta. Si se cae la conexión, el juego reintenta solo con esa llave durante 15 segundos (`ESPERA_RECONEXION`). Mientras tanto el partido se congela y el otro ve una cuenta regresiva. Al volver hay un 3-2-1 y se sigue con el mismo marcador. Si alguien pulsa *Salir*, la sala se cierra de inmediato.

---

## 4. Estructura de carpetas

```
fingergol-ar/
├── package.json              ← "npm start" arranca el servidor, "npm test" corre las pruebas
├── README.md
├── servidor/
│   └── servidor.js           ← entrega la página + salas en línea (WebSocket) + reconexión
├── pruebas/                  ← pruebas automáticas (node:test, sin instalar nada)
│   ├── ayudante.js           ← carga el juego en Node y trae un cliente WebSocket
│   ├── fisica.test.js
│   ├── cpu.test.js
│   ├── gestos.test.js
│   └── servidor.test.js
└── cliente/                  ← todo lo que corre en el navegador
    ├── index.html            ← pantallas: inicio, tutorial, carga, lobby, HUD, pausa, fin
    ├── sw.js                 ← guarda la página para abrirla sin internet
    ├── assets/
    │   └── icono.svg
    ├── css/
    │   └── estilos.css
    └── js/
        ├── config.js         ← librerías, mesa, colores, gestos, zona cómoda, servidor
        ├── utilidades.js     ← matemáticas, guardado, filtro de suavizado
        ├── app.js            ← flujo del juego y bucle principal
        ├── juego/
        │   ├── fisica.js     ← disco, mazos, rebotes, postes, goles
        │   └── cpu.js        ← rival de la máquina
        ├── entrada/
        │   ├── camara.js     ← permiso y video de la cámara
        │   ├── hand-tracker.js ← MediaPipe: puntos de la mano
        │   ├── gestos.js     ← mano abierta = pausa, pulgar arriba = seguir
        │   └── puntero.js    ← táctil, mouse y teclado
        ├── render/
        │   └── render-pantalla.js ← mesa sobre la cámara (Canvas)
        ├── red/
        │   └── red.js        ← cliente WebSocket del modo en línea (con reconexión)
        ├── tutorial/
        │   └── tutorial.js   ← video tutorial animado (manos y táctil)
        └── audio/
            └── sonidos.js    ← sonidos generados con Web Audio
```

Los scripts se cargan en orden desde `index.html` y comparten un objeto global `FG`, así puedes abrir cualquier archivo y entenderlo solo.

---

## 5. Cómo funciona por dentro

1. **Cámara → MediaPipe:** cada cuadro del video entra a `HandLandmarker.detectForVideo()` y devuelve hasta 2 manos con 21 puntos (0 a 1).
2. **Punto → pantalla → mesa:** la punta del índice (punto 8) se pasa a píxeles (el video está en espejo y acercado por la zona cómoda) y luego a "unidades de mesa" (160 × 100).
3. **Suavizado:** un filtro *One Euro* quita el temblor de la mano sin agregar retraso.
4. **Gestos:** `gestos.js` mide qué dedos están estirados o doblados (comparando distancias a la muñeca) y si la mano está quieta.
5. **Física a 120 Hz:** el mazo sigue al dedo; el disco rebota con la velocidad de tu dedo, en las bandas y en los postes.
6. **Dibujo:** Canvas 2D. La mesa se dibuja una sola vez y se copia en cada cuadro (el neón es lo más pesado).

---

## 6. Personalizar

En `cliente/js/config.js` puedes cambiar:

- `CANCHA` → tamaño de la mesa y del arco.
- `EQUIPOS` → colores de cada equipo.
- `GOLES_POR_DEFECTO`.
- `OPACIDAD_MESA_CAMARA` → qué tan transparente es la mesa sobre la cámara (viene en 0.3).
- `ZONA_MANO` → qué parte de la cámara cubre toda la mesa (viene en 0.75; con 1 usas toda la cámara).
- `GESTO_PAUSA_SEG` y `GESTO_PULGAR_SEG` → cuánto hay que sostener cada gesto.
- `FPS_MINIMO` → desde cuántos cuadros por segundo se activa el modo ahorro.
- `ESPERA_RECONEXION` → segundos para volver si se cae la conexión (en el servidor es la variable de entorno del mismo nombre).
- `SERVIDOR_URL` → si subes la página y el servidor a sitios distintos.
- Versión de MediaPipe.

Los sonidos se generan en código (`audio/sonidos.js`). Para usar archivos `.mp3`, ponlos en `cliente/assets/` y reemplaza la función correspondiente.

Si cambias archivos del juego, sube el número `VERSION` de `cliente/sw.js` y los `?v=` de `index.html` para que los navegadores borren la copia vieja.

---

## 7. Problemas comunes

| Problema | Solución |
|---|---|
| "No tenemos permiso para usar la cámara" | Toca el candado de la barra de direcciones → Cámara → Permitir → **Reintentar**. |
| "La cámara solo funciona desde https o localhost" | Abre `http://localhost:3000` (con `npm start`), no el archivo con doble clic. |
| "Otra app está usando la cámara" | Cierra Zoom/Meet/otras pestañas con cámara. |
| No detecta la mano | Más luz, mano a 40–70 cm, palma hacia la cámara, fondo sin mucho desorden. |
| Se pausa solo | Estás dejando la mano abierta y quieta. Juega apuntando con el índice, o mueve la mano. |
| Va lento | El modo ahorro se activa solo. También: cierra otras pestañas y usa Chrome o Edge. |
| No aparece el botón "En línea" | Necesita el servidor del juego: abre con `npm start` (no Live Server ni GitHub Pages) o usa Render. |
| "No se pudo conectar al servidor del juego" | El servidor se cerró: vuelve a correr `npm start`. |
| "Tu rival perdió la conexión" | Espera la cuenta regresiva: si vuelve a tiempo, el partido sigue igual. |
| "El puerto 3000 ya está en uso" | `PORT=3001 npm start` (en PowerShell: `$env:PORT=3001; npm start`). |
| No veo mis cambios del código | Recarga con `Ctrl + Shift + R`. |
| El tutorial no vuelve a salir | Es normal: sale solo la primera vez. Ábrelo con **Mira cómo se juega** en el inicio. |

---

## 8. Librerías usadas (por CDN)

| Librería | Uso | Versión |
|---|---|---|
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js) | Detección de manos (Hand Landmarker) | 0.10.14 |

Si quieres usar archivos locales en vez de CDN, descárgalos y cambia las rutas en `config.js`.
