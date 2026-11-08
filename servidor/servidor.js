/* ============================================================
   FingerGol AR — servidor
   Hace dos cosas, sin instalar nada (solo Node.js 18 o más):
   1. Entrega los archivos de la carpeta /cliente (la página).
   2. Arma salas de 2 jugadores por WebSocket en la ruta /ws
      y reenvía los mensajes entre ellos.

   Uso:  node servidor/servidor.js      (o: npm start)
   Puerto: variable PORT (por defecto 3000)

   Reconexión: si a un jugador se le cae la conexión, su puesto
   en la sala se guarda unos segundos (ESPERA_RECONEXION). Con el
   código de la sala y su "llave" secreta puede volver y el
   partido sigue. Si sale a propósito ("salir"), la sala se cierra.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PUERTO = Number(process.env.PORT) || 3000;
const CARPETA_CLIENTE = path.resolve(__dirname, '..', 'cliente');
const GUID_WS = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MENSAJE = 64 * 1024;
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // sin I, L, O para no confundir
const ESPERA_RECONEXION = Number(process.env.ESPERA_RECONEXION) || 15; // segundos

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.patt': 'text/plain; charset=utf-8',
  '.task': 'application/octet-stream',
  '.wasm': 'application/wasm'
};

/* ======================= ARCHIVOS ======================= */
const servidor = http.createServer((req, res) => {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Ruta inválida');
  }
  if (ruta === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, salas: salas.size }));
  }
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.normalize(path.join(CARPETA_CLIENTE, ruta));
  if (!archivo.startsWith(CARPETA_CLIENTE + path.sep)) {
    res.writeHead(403);
    return res.end('Prohibido');
  }
  fs.stat(archivo, (err, info) => {
    if (err || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(archivo).pipe(res);
  });
});

/* ======================= WEBSOCKET ======================= */
class Conexion {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragmentos = [];
    this.vivo = true;
    this.abierta = true;
    this.sala = null;
    this.alRecibir = () => {};
    this.alCerrar = () => {};
    socket.setNoDelay(true);
    socket.on('data', (d) => this.datos(d));
    // 'end': el otro lado cortó (el servidor HTTP deja la conexión "medio abierta" si no)
    socket.on('end', () => this.terminar());
    socket.on('close', () => this.terminar());
    socket.on('error', () => this.terminar());
  }

  datos(trozo) {
    this.buffer = Buffer.concat([this.buffer, trozo]);
    while (this.abierta) {
      if (this.buffer.length < 2) return;
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const conMascara = (b1 & 0x80) !== 0;
      let largo = b1 & 0x7f;
      let pos = 2;
      if (largo === 126) {
        if (this.buffer.length < 4) return;
        largo = this.buffer.readUInt16BE(2);
        pos = 4;
      } else if (largo === 127) {
        if (this.buffer.length < 10) return;
        largo = Number(this.buffer.readBigUInt64BE(2));
        pos = 10;
      }
      if (largo > MAX_MENSAJE) return this.cerrar(1009);
      if (!conMascara) return this.cerrar(1002); // el navegador siempre enmascara
      if (this.buffer.length < pos + 4 + largo) return;
      const mascara = this.buffer.subarray(pos, pos + 4);
      pos += 4;
      const datos = Buffer.from(this.buffer.subarray(pos, pos + largo));
      for (let i = 0; i < datos.length; i++) datos[i] ^= mascara[i & 3];
      this.buffer = this.buffer.subarray(pos + largo);

      if (opcode === 0x8) return this.cerrar(1000);
      if (opcode === 0x9) { this.marco(0xa, datos); continue; } // ping -> pong
      if (opcode === 0xa) { this.vivo = true; continue; }       // pong
      if (opcode === 0x1 || opcode === 0x0) {
        this.fragmentos.push(datos);
        if (fin) {
          const texto = Buffer.concat(this.fragmentos).toString('utf8');
          this.fragmentos = [];
          this.vivo = true;
          let msg;
          try { msg = JSON.parse(texto); } catch (e) { continue; }
          if (msg && typeof msg.t === 'string') this.alRecibir(msg);
        }
      }
    }
  }

  marco(opcode, datos) {
    if (!this.abierta) return;
    const largo = datos.length;
    let cab;
    if (largo < 126) {
      cab = Buffer.from([0x80 | opcode, largo]);
    } else if (largo < 65536) {
      cab = Buffer.alloc(4);
      cab[0] = 0x80 | opcode;
      cab[1] = 126;
      cab.writeUInt16BE(largo, 2);
    } else {
      cab = Buffer.alloc(10);
      cab[0] = 0x80 | opcode;
      cab[1] = 127;
      cab.writeBigUInt64BE(BigInt(largo), 2);
    }
    this.socket.write(Buffer.concat([cab, datos]));
  }

  enviar(obj) {
    this.marco(0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
  }

  cerrar(codigo = 1000) {
    if (!this.abierta) return;
    const d = Buffer.alloc(2);
    d.writeUInt16BE(codigo, 0);
    try { this.marco(0x8, d); } catch (e) { /* nada */ }
    this.socket.end();
    this.terminar();
  }

  terminar() {
    if (!this.abierta) return;
    this.abierta = false;
    this.socket.destroy();
    this.alCerrar();
  }
}

/* ======================= SALAS ======================= */
// código -> { anfitrion, invitado, llaves: { anfitrion, invitado }, esperas: { rol: temporizador } }
const salas = new Map();

function nuevoCodigo() {
  for (let intento = 0; intento < 1000; intento++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETRAS[crypto.randomInt(LETRAS.length)];
    if (!salas.has(c)) return c;
  }
  throw new Error('Sin códigos libres');
}

const nuevaLlave = () => crypto.randomBytes(12).toString('hex');
const otroRol = (rol) => (rol === 'anfitrion' ? 'invitado' : 'anfitrion');

function rivalDe(con) {
  const s = con.sala && salas.get(con.sala);
  if (!s) return null;
  return s[otroRol(con.rol)];
}

/** Cierra la sala y avisa al que quede conectado (motivo: 'salio' | 'caida'). */
function cerrarSala(codigo, motivo) {
  const s = salas.get(codigo);
  if (!s) return;
  salas.delete(codigo);
  Object.values(s.esperas).forEach((t) => clearTimeout(t));
  for (const rol of ['anfitrion', 'invitado']) {
    const con = s[rol];
    if (!con) continue;
    con.sala = null;
    if (con.abierta && motivo) con.enviar({ t: 'rival-salio', motivo });
  }
  console.log(`[sala ${codigo}] cerrada (quedan ${salas.size})`);
}

/** Salir a propósito: la sala se cierra en el momento. */
function salir(con) {
  const codigo = con.sala;
  if (!codigo) return;
  const s = salas.get(codigo);
  con.sala = null;
  if (!s) return;
  s[con.rol] = null;
  cerrarSala(codigo, 'salio');
}

/** Se cayó la conexión (sin "salir"): guardamos su puesto un rato. */
function caer(con) {
  const codigo = con.sala;
  if (!codigo) return;
  const s = salas.get(codigo);
  con.sala = null;
  if (!s || s[con.rol] !== con) return;
  const rol = con.rol;
  s[rol] = null;
  // (si nadie se había unido todavía, igual guardamos la sala por si vuelve el anfitrión)
  const otro = s[otroRol(rol)];
  if (otro && otro.abierta) otro.enviar({ t: 'rival-caido', s: ESPERA_RECONEXION });
  clearTimeout(s.esperas[rol]);
  s.esperas[rol] = setTimeout(() => {
    delete s.esperas[rol];
    if (salas.get(codigo) === s && !s[rol]) cerrarSala(codigo, 'caida');
  }, ESPERA_RECONEXION * 1000);
  console.log(`[sala ${codigo}] se cayó ${rol}, esperando ${ESPERA_RECONEXION} s`);
}

function alMensaje(con, m) {
  switch (m.t) {
    case 'ping':
      con.enviar({ t: 'pong' });
      return;
    case 'crear': {
      salir(con);
      const codigo = nuevoCodigo();
      const llave = nuevaLlave();
      salas.set(codigo, { anfitrion: con, invitado: null, llaves: { anfitrion: llave, invitado: null }, esperas: {} });
      con.sala = codigo;
      con.rol = 'anfitrion';
      con.enviar({ t: 'sala', codigo, llave });
      console.log(`[sala ${codigo}] creada`);
      return;
    }
    case 'unir': {
      const codigo = String(m.codigo || '').toUpperCase().slice(0, 4);
      const s = salas.get(codigo);
      if (!s) return con.enviar({ t: 'error', msg: 'No existe una sala con ese código. Revisa las letras.' });
      if (s.anfitrion === con) return con.enviar({ t: 'error', msg: 'Esa es tu propia sala.' });
      if (s.invitado || s.llaves.invitado) return con.enviar({ t: 'error', msg: 'Esa sala ya está llena.' });
      if (!s.anfitrion) return con.enviar({ t: 'error', msg: 'Quien creó la sala perdió la conexión. Espera un momento y prueba de nuevo.' });
      salir(con);
      const llave = nuevaLlave();
      s.invitado = con;
      s.llaves.invitado = llave;
      con.sala = codigo;
      con.rol = 'invitado';
      con.enviar({ t: 'unido', codigo, llave });
      s.anfitrion.enviar({ t: 'rival-entro' });
      console.log(`[sala ${codigo}] se unió el rival`);
      return;
    }
    case 'volver': {
      const codigo = String(m.codigo || '').toUpperCase().slice(0, 4);
      const s = salas.get(codigo);
      const rol = s && ['anfitrion', 'invitado'].find((r) => s.llaves[r] && s.llaves[r] === m.llave);
      if (!rol) return con.enviar({ t: 'error', msg: 'La sala ya se cerró.' });
      const viejo = s[rol];
      if (viejo && viejo !== con) {
        // el servidor todavía creía viva la conexión vieja: la reemplazamos
        viejo.sala = null;
        viejo.terminar();
      }
      clearTimeout(s.esperas[rol]);
      delete s.esperas[rol];
      s[rol] = con;
      con.sala = codigo;
      con.rol = rol;
      con.enviar({ t: 'vuelto', rol });
      const otro = s[otroRol(rol)];
      if (otro && otro.abierta) otro.enviar({ t: 'rival-volvio' });
      console.log(`[sala ${codigo}] volvió ${rol}`);
      return;
    }
    case 'salir':
      salir(con);
      return;
    default: {
      // cualquier otro mensaje del juego se reenvía al rival
      const otro = rivalDe(con);
      if (otro && otro.abierta) otro.enviar(m);
    }
  }
}

servidor.on('upgrade', (req, socket) => {
  const ruta = (req.url || '').split('?')[0];
  const clave = req.headers['sec-websocket-key'];
  if (ruta !== '/ws' || !clave || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const aceptar = crypto.createHash('sha1').update(clave + GUID_WS).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${aceptar}\r\n\r\n`
  );
  const con = new Conexion(socket);
  con.alRecibir = (m) => alMensaje(con, m);
  con.alCerrar = () => caer(con);
  conexiones.add(con);
  const quitar = con.alCerrar;
  con.alCerrar = () => {
    conexiones.delete(con);
    quitar();
  };
});

// Latido: si un jugador no responde en unos 10 s, se cierra su conexión
// (y empieza la espera de reconexión de su sala)
const conexiones = new Set();
setInterval(() => {
  for (const con of conexiones) {
    if (!con.vivo) {
      con.terminar();
      continue;
    }
    con.vivo = false;
    try { con.marco(0x9, Buffer.alloc(0)); } catch (e) { con.terminar(); }
  }
}, 5000).unref();

/* ======================= ARRANQUE ======================= */
servidor.listen(PUERTO, () => {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const r of lista || []) if (r.family === 'IPv4' && !r.internal) ips.push(r.address);
  }
  console.log('');
  console.log('  FingerGol AR listo');
  console.log(`  ➜  En este computador:  http://localhost:${PUERTO}`);
  ips.forEach((ip) => console.log(`  ➜  En tu red Wi-Fi:     http://${ip}:${PUERTO}  (la cámara pide https, mira el README)`));
  console.log('  (Ctrl + C para apagar)');
  console.log('');
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ✖ El puerto ${PUERTO} ya está en uso. Cierra el otro programa o usa otro puerto:`);
    console.error('    PORT=3001 npm start   (Windows PowerShell:  $env:PORT=3001; npm start)\n');
    process.exit(1);
  }
  throw e;
});
