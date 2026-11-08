/* ============================================================
   Ayudante de las pruebas: carga los archivos del juego (que
   están hechos para el navegador) dentro de Node, con un
   "window" falso. Así se prueba la misma lógica que juega la
   gente, sin abrir el navegador.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const net = require('net');
const crypto = require('crypto');

const CLIENTE = path.resolve(__dirname, '..', 'cliente', 'js');

/** Números "al azar" que siempre salen iguales (para que las pruebas no cambien). */
function azarFijo(semilla = 12345) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Carga scripts del cliente y devuelve el objeto global FG. */
function cargarJuego(archivos, opciones = {}) {
  const MathFijo = Object.create(Math);
  MathFijo.random = azarFijo(opciones.semilla);
  let reloj = 0;
  const ctx = {
    console,
    Math: MathFijo,
    performance: { now: () => reloj },
    localStorage: { getItem: () => null, setItem: () => {} },
    matchMedia: () => ({ matches: false })
  };
  ctx.window = ctx;
  ctx.avanzarReloj = (ms) => (reloj += ms);
  vm.createContext(ctx);
  for (const f of archivos) {
    vm.runInContext(fs.readFileSync(path.join(CLIENTE, f), 'utf8'), ctx, { filename: f });
  }
  ctx.FG.avanzarReloj = ctx.avanzarReloj;
  return ctx.FG;
}

/** Simula el partido "segundos" segundos en pasos de 1/60. */
function simular(partido, segundos, alPaso) {
  const dt = 1 / 60;
  const eventos = [];
  for (let t = 0; t < segundos; t += dt) {
    if (alPaso) alPaso(dt);
    partido.actualizar(dt);
    eventos.push(...partido.sacarEventos());
  }
  return eventos;
}

/** Mano falsa con forma real: 'palma', 'pulgar' o 'indice' (puntos 0..1). */
function manoSintetica(tipo, cx = 0.5, cy = 0.6, aspecto = 16 / 9) {
  const P = [];
  P[0] = [0, 0];
  const mcp = { 5: [-0.03, -0.09], 9: [-0.005, -0.095], 13: [0.018, -0.09], 17: [0.038, -0.08] };
  const estirado = (b) => [[b[0], b[1] - 0.04], [b[0], b[1] - 0.065], [b[0], b[1] - 0.085]];
  const doblado = (b) => [[b[0], b[1] - 0.03], [b[0], b[1] - 0.01], [b[0], b[1] + 0.01]];
  const pulgares = {
    palma: [[-0.03, -0.02], [-0.06, -0.04], [-0.08, -0.06], [-0.1, -0.075]],
    pulgar: [[-0.03, -0.03], [-0.045, -0.07], [-0.05, -0.11], [-0.052, -0.15]],
    indice: [[-0.03, -0.03], [-0.04, -0.05], [-0.03, -0.07], [-0.01, -0.075]]
  };
  pulgares[tipo].forEach((p, i) => (P[1 + i] = p));
  [5, 9, 13, 17].forEach((base) => {
    P[base] = mcp[base];
    const abierto = tipo === 'palma' || (tipo === 'indice' && base === 5);
    (abierto ? estirado : doblado)(mcp[base]).forEach((p, i) => (P[base + 1 + i] = p));
  });
  const s = 1.6;
  return P.map(([x, y]) => ({ x: cx + (x * s) / aspecto, y: cy + y * s, z: 0 }));
}

/* ---------- Cliente WebSocket mínimo (Node 18 no trae uno) ---------- */
class ClienteWS {
  static conectar(puerto) {
    return new Promise((resolver, rechazar) => {
      const socket = net.connect(puerto, '127.0.0.1');
      const clave = crypto.randomBytes(16).toString('base64');
      const c = new ClienteWS(socket);
      socket.once('error', rechazar);
      socket.once('connect', () => {
        socket.write(
          `GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${clave}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        );
      });
      let cabecera = Buffer.alloc(0);
      const alDato = (d) => {
        cabecera = Buffer.concat([cabecera, d]);
        const fin = cabecera.indexOf('\r\n\r\n');
        if (fin < 0) return;
        socket.off('data', alDato);
        if (!/101/.test(cabecera.subarray(0, fin).toString())) return rechazar(new Error('sin websocket'));
        socket.on('data', (x) => c.datos(x));
        const resto = cabecera.subarray(fin + 4);
        if (resto.length) c.datos(resto);
        resolver(c);
      };
      socket.on('data', alDato);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.recibidos = [];
    this.esperando = [];
    this.cerrado = false;
    socket.on('close', () => (this.cerrado = true));
  }

  datos(trozo) {
    this.buffer = Buffer.concat([this.buffer, trozo]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 0x0f;
      let largo = this.buffer[1] & 0x7f;
      let pos = 2;
      if (largo === 126) {
        if (this.buffer.length < 4) return;
        largo = this.buffer.readUInt16BE(2);
        pos = 4;
      }
      if (this.buffer.length < pos + largo) return;
      const datos = this.buffer.subarray(pos, pos + largo);
      this.buffer = this.buffer.subarray(pos + largo);
      if (opcode === 0x1) {
        const m = JSON.parse(datos.toString('utf8'));
        this.recibidos.push(m);
        this.revisar();
      }
    }
  }

  revisar() {
    for (const e of this.esperando.slice()) {
      const i = this.recibidos.findIndex((m) => m.t === e.tipo);
      if (i >= 0) {
        const [m] = this.recibidos.splice(i, 1);
        this.esperando = this.esperando.filter((x) => x !== e);
        clearTimeout(e.t);
        e.resolver(m);
      }
    }
  }

  /** Espera un mensaje de cierto tipo (o falla después de "ms"). */
  esperar(tipo, ms = 3000) {
    return new Promise((resolver, rechazar) => {
      const e = { tipo, resolver };
      e.t = setTimeout(() => {
        this.esperando = this.esperando.filter((x) => x !== e);
        rechazar(new Error(`no llegó "${tipo}"`));
      }, ms);
      this.esperando.push(e);
      this.revisar();
    });
  }

  enviar(obj) {
    const datos = Buffer.from(JSON.stringify(obj), 'utf8');
    const mascara = crypto.randomBytes(4);
    const enmascarado = Buffer.alloc(datos.length);
    for (let i = 0; i < datos.length; i++) enmascarado[i] = datos[i] ^ mascara[i & 3];
    let cab;
    if (datos.length < 126) cab = Buffer.from([0x81, 0x80 | datos.length]);
    else {
      cab = Buffer.alloc(4);
      cab[0] = 0x81;
      cab[1] = 0x80 | 126;
      cab.writeUInt16BE(datos.length, 2);
    }
    this.socket.write(Buffer.concat([cab, mascara, enmascarado]));
  }

  /** Corta la conexión de golpe (como si se cayera el wifi). */
  cortar() {
    this.socket.destroy();
  }
}

module.exports = { cargarJuego, simular, manoSintetica, azarFijo, ClienteWS };
