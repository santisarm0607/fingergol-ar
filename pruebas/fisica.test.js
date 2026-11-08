/* Pruebas de la física: rebotes, goles, mitades y fin del partido. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cargarJuego, simular } = require('./ayudante');

const FG = cargarJuego(['config.js', 'utilidades.js', 'juego/fisica.js']);
const W = FG.config.CANCHA.ancho;
const H = FG.config.CANCHA.alto;

/** Partido ya jugando (sin la cuenta regresiva). */
function partidoJugando(opciones) {
  const p = new FG.Partido(opciones);
  p.iniciar();
  p.cambiarEstado('jugando');
  p.sacarEventos();
  return p;
}

test('la cuenta regresiva dice 3, 2, 1 y luego suena el pitazo', () => {
  const p = new FG.Partido();
  p.iniciar();
  const ev = simular(p, 2.5);
  const numeros = ev.filter((e) => e.tipo === 'cuenta').map((e) => e.n);
  assert.deepStrictEqual(numeros, [3, 2, 1]);
  assert.ok(ev.some((e) => e.tipo === 'pitazo'));
  assert.strictEqual(p.estado, 'jugando');
});

test('el disco rebota en la banda de arriba', () => {
  const p = partidoJugando();
  Object.assign(p.balon, { x: 60, y: 8, vx: 0, vy: -150 });
  simular(p, 0.3);
  assert.ok(p.balon.vy > 0, 'ahora baja');
  assert.ok(p.balon.y >= p.balon.r, 'no se sale de la mesa');
});

test('fuera de la boca del arco, el disco rebota en el fondo (no es gol)', () => {
  const p = partidoJugando();
  Object.assign(p.balon, { x: W - 10, y: 10, vx: 200, vy: 0 });
  simular(p, 0.4);
  assert.deepStrictEqual(Array.from(p.marcador), [0, 0]);
  assert.ok(p.balon.vx < 0, 'rebotó hacia atrás');
});

test('el disco en el arco derecho es gol del equipo 1 (izquierda)', () => {
  const p = partidoJugando();
  Object.assign(p.balon, { x: W - 15, y: H / 2, vx: 220, vy: 0 });
  const ev = simular(p, 0.5);
  assert.deepStrictEqual(Array.from(p.marcador), [1, 0]);
  assert.strictEqual(p.estado, 'gol');
  assert.ok(ev.some((e) => e.tipo === 'gol' && e.equipo === 0));
});

test('el disco en el arco izquierdo es gol del equipo 2 (derecha)', () => {
  const p = partidoJugando();
  Object.assign(p.balon, { x: 15, y: H / 2, vx: -220, vy: 0 });
  simular(p, 0.5);
  assert.deepStrictEqual(Array.from(p.marcador), [0, 1]);
});

test('el poste hace rebotar el disco', () => {
  const p = partidoJugando();
  const yPoste = (H - FG.config.CANCHA.arco) / 2;
  Object.assign(p.balon, { x: W - 12, y: yPoste, vx: 200, vy: 0 });
  const ev = simular(p, 0.3);
  assert.ok(ev.some((e) => e.tipo === 'poste' || e.tipo === 'rebote'), 'chocó');
  assert.deepStrictEqual(Array.from(p.marcador), [0, 0]);
});

test('cada mazo se queda en su mitad aunque el dedo se pase', () => {
  const p = partidoJugando();
  p.fijarObjetivo(0, W - 5, 50); // jugador 1 quiere ir hasta el otro arco
  p.fijarObjetivo(1, 5, 50);     // jugador 2 también
  simular(p, 1);
  assert.ok(p.jugadores[0].x <= W / 2 + 1e-6, 'el azul no pasa la mitad');
  assert.ok(p.jugadores[1].x >= W / 2 - 1e-6, 'el fucsia no pasa la mitad');
});

test('el mazo le pega al disco y avisa la fuerza del golpe', () => {
  const p = partidoJugando();
  Object.assign(p.balon, { x: 60, y: 50, vx: 0, vy: 0 });
  p.jugadores[0].x = 30;
  p.jugadores[0].y = 50;
  p.fijarObjetivo(0, 70, 50);
  const ev = simular(p, 0.5);
  const golpe = ev.find((e) => e.tipo === 'patada');
  assert.ok(golpe, 'hubo golpe');
  assert.ok(golpe.fuerza > 50, 'golpe fuerte');
  assert.ok(p.balon.vx > 0, 'el disco sale hacia el arco rival');
});

test('el partido termina al llegar a los goles para ganar', () => {
  const p = partidoJugando({ golesParaGanar: 2 });
  p.marcador = [1, 0];
  Object.assign(p.balon, { x: W - 15, y: H / 2, vx: 220, vy: 0 });
  const ev = simular(p, 4);
  assert.strictEqual(p.estado, 'fin');
  const fin = ev.find((e) => e.tipo === 'fin');
  assert.ok(fin);
  assert.strictEqual(fin.ganador, 0);
});

test('el estado para la red se puede aplicar en el otro dispositivo', () => {
  const a = partidoJugando();
  Object.assign(a.balon, { x: 42.34, y: 61.2, vx: 10, vy: -5 });
  a.marcador = [3, 2];
  const b = new FG.Partido();
  b.aplicarRed(JSON.parse(JSON.stringify(a.estadoRed())));
  assert.deepStrictEqual(Array.from(b.marcador), [3, 2]);
  assert.strictEqual(b.estado, 'jugando');
  assert.ok(Math.abs(b.balon.x - 42.3) < 0.01);
});
