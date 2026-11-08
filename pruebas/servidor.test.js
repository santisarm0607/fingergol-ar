/* Pruebas del servidor: salas, mensajes y reconexión. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { ClienteWS } = require('./ayudante');

const PUERTO = 3900 + Math.floor(Math.random() * 90);
let servidor;

test.before(async () => {
  servidor = spawn(process.execPath, [path.join(__dirname, '..', 'servidor', 'servidor.js')], {
    env: Object.assign({}, process.env, { PORT: String(PUERTO), ESPERA_RECONEXION: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolver, rechazar) => {
    servidor.stdout.on('data', (d) => /listo/.test(String(d)) && resolver());
    servidor.on('exit', (c) => rechazar(new Error('el servidor se cerró: ' + c)));
  });
});
test.after(() => servidor && servidor.kill());

async function salaConDos() {
  const a = await ClienteWS.conectar(PUERTO);
  a.enviar({ t: 'crear' });
  const sala = await a.esperar('sala');
  const b = await ClienteWS.conectar(PUERTO);
  b.enviar({ t: 'unir', codigo: sala.codigo });
  const unido = await b.esperar('unido');
  await a.esperar('rival-entro');
  return { a, b, codigo: sala.codigo, llaveA: sala.llave, llaveB: unido.llave };
}

test('/salud responde que el servidor está corriendo (para mostrar "En línea")', async () => {
  const http = require('http');
  const datos = await new Promise((resolver, rechazar) => {
    http
      .get(`http://127.0.0.1:${PUERTO}/salud`, (res) => {
        let cuerpo = '';
        res.on('data', (d) => (cuerpo += d));
        res.on('end', () => resolver({ cuerpo, cors: res.headers['access-control-allow-origin'] }));
      })
      .on('error', rechazar);
  });
  assert.strictEqual(JSON.parse(datos.cuerpo).ok, true);
  assert.strictEqual(datos.cors, '*');
});

test('responde al ping', async () => {
  const a = await ClienteWS.conectar(PUERTO);
  a.enviar({ t: 'ping' });
  await a.esperar('pong');
  a.cortar();
});

test('crear sala da un código de 4 letras y una llave', async () => {
  const a = await ClienteWS.conectar(PUERTO);
  a.enviar({ t: 'crear' });
  const m = await a.esperar('sala');
  assert.match(m.codigo, /^[A-Z]{4}$/);
  assert.ok(m.llave && m.llave.length >= 16);
  a.cortar();
});

test('unirse y reenviar mensajes entre los dos', async () => {
  const { a, b } = await salaConDos();
  b.enviar({ t: 'in', x: 10, y: 20 });
  const m = await a.esperar('in');
  assert.strictEqual(m.x, 10);
  a.enviar({ t: 'st', m: [1, 0] });
  assert.deepStrictEqual((await b.esperar('st')).m, [1, 0]);
  a.cortar();
  b.cortar();
});

test('errores claros: sala que no existe y sala llena', async () => {
  const c = await ClienteWS.conectar(PUERTO);
  c.enviar({ t: 'unir', codigo: 'ZZZZ' });
  assert.match((await c.esperar('error')).msg, /No existe/);
  const { a, b, codigo } = await salaConDos();
  c.enviar({ t: 'unir', codigo });
  assert.match((await c.esperar('error')).msg, /llena/);
  [a, b, c].forEach((x) => x.cortar());
});

test('si se cae el invitado, puede volver con su llave y el partido sigue', async () => {
  const { a, b, codigo, llaveB } = await salaConDos();
  b.cortar();
  assert.strictEqual((await a.esperar('rival-caido')).s, 1);
  const b2 = await ClienteWS.conectar(PUERTO);
  b2.enviar({ t: 'volver', codigo, llave: llaveB });
  assert.strictEqual((await b2.esperar('vuelto')).rol, 'invitado');
  await a.esperar('rival-volvio');
  b2.enviar({ t: 'in', x: 5 });
  assert.strictEqual((await a.esperar('in')).x, 5);
  a.cortar();
  b2.cortar();
});

test('si se cae el anfitrión, también puede volver', async () => {
  const { a, b, codigo, llaveA } = await salaConDos();
  a.cortar();
  await b.esperar('rival-caido');
  const a2 = await ClienteWS.conectar(PUERTO);
  a2.enviar({ t: 'volver', codigo, llave: llaveA });
  assert.strictEqual((await a2.esperar('vuelto')).rol, 'anfitrion');
  await b.esperar('rival-volvio');
  a2.cortar();
  b.cortar();
});

test('con una llave equivocada no se puede entrar a la sala', async () => {
  const { a, b, codigo } = await salaConDos();
  const intruso = await ClienteWS.conectar(PUERTO);
  intruso.enviar({ t: 'volver', codigo, llave: 'llave-falsa' });
  await intruso.esperar('error');
  [a, b, intruso].forEach((x) => x.cortar());
});

test('si no vuelve a tiempo, el rival recibe "salió" por caída', async () => {
  const { a, b } = await salaConDos();
  b.cortar();
  await a.esperar('rival-caido');
  const m = await a.esperar('rival-salio', 3000);
  assert.strictEqual(m.motivo, 'caida');
  a.cortar();
});

test('salir a propósito cierra la sala en el momento', async () => {
  const { a, b } = await salaConDos();
  b.enviar({ t: 'salir' });
  const m = await a.esperar('rival-salio', 500);
  assert.strictEqual(m.motivo, 'salio');
  a.cortar();
  b.cortar();
});
