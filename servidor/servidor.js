/* ============================================================
   FingerGol AR — servidor
   Hace dos cosas, sin instalar nada (solo Node.js 18 o más):
   1. Entrega los archivos de la carpeta /cliente (la página).
   2. Arma salas de 2 jugadores por WebSocket en la ruta /ws
      y reenvía los mensajes entre ellos.

   Uso:  node servidor/servidor.js      (o: npm start)
   Puerto: variable PORT (por defecto 3000)
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
const salas = new Map(); // código -> { anfitrion, invitado }

function nuevoCodigo() {
  for (let intento = 0; intento < 1000; intento++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETRAS[crypto.randomInt(LETRAS.length)];
    if (!salas.has(c)) return c;
  }
  throw new Error('Sin códigos libres');
}

function rivalDe(con) {
  const s = con.sala && salas.get(con.sala);
  if (!s) return null;
  return s.anfitrion === con ? s.invitado : s.anfitrion;
}

function salir(con) {
  const codigo = con.sala;
  if (!codigo) return;
  const s = salas.get(codigo);
  con.sala = null;
  if (!s) return;
  const otro = s.anfitrion === con ? s.invitado : s.anfitrion;
  salas.delete(codigo);
  if (otro && otro.abierta) {
    otro.sala = null;
    otro.enviar({ t: 'rival-salio' });
  }
  console.log(`[sala ${codigo}] cerrada (quedan ${salas.size})`);
}

function alMensaje(con, m) {
  switch (m.t) {
    case 'crear': {
      salir(con);
      const codigo = nuevoCodigo();
      salas.set(codigo, { anfitrion: con, invitado: null });
      con.sala = codigo;
      con.enviar({ t: 'sala', codigo });
      console.log(`[sala ${codigo}] creada`);
      return;
    }
    case 'unir': {
      const codigo = String(m.codigo || '').toUpperCase().slice(0, 4);
      const s = salas.get(codigo);
      if (!s) return con.enviar({ t: 'error', msg: 'No existe una sala con ese código. Revisa las letras.' });
      if (s.anfitrion === con) return con.enviar({ t: 'error', msg: 'Esa es tu propia sala 🙂' });
      if (s.invitado) return con.enviar({ t: 'error', msg: 'Esa sala ya está llena.' });
      salir(con);
      s.invitado = con;
      con.sala = codigo;
      con.enviar({ t: 'unido', codigo });
      s.anfitrion.enviar({ t: 'rival-entro' });
      console.log(`[sala ${codigo}] se unió el rival`);
      return;
    }
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
  con.alCerrar = () => salir(con);
  conexiones.add(con);
  const quitar = con.alCerrar;
  con.alCerrar = () => {
    conexiones.delete(con);
    quitar();
  };
});

// Latido: si un jugador no responde en 30 s, se cierra su conexión
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
}, 15000).unref();

/* ======================= ARRANQUE ======================= */
servidor.listen(PUERTO, () => {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const r of lista || []) if (r.family === 'IPv4' && !r.internal) ips.push(r.address);
  }
  console.log('');
  console.log('  ⚽  FingerGol AR listo');
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
