/* Pruebas de los gestos con la mano (pausa y pulgar arriba). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cargarJuego, manoSintetica } = require('./ayudante');

const FG = cargarJuego(['config.js', 'utilidades.js', 'entrada/gestos.js']);
const { clasificar, DetectorGestos } = FG.Gestos;

test('reconoce la mano abierta, el pulgar arriba y el dedo índice', () => {
  for (const aspecto of [16 / 9, 4 / 3]) {
    assert.strictEqual(clasificar(manoSintetica('palma', 0.5, 0.6, aspecto), aspecto), 'palma');
    assert.strictEqual(clasificar(manoSintetica('pulgar', 0.5, 0.6, aspecto), aspecto), 'pulgar');
    assert.strictEqual(clasificar(manoSintetica('indice', 0.5, 0.6, aspecto), aspecto), 'indice');
  }
});

test('una mano incompleta no es ningún gesto', () => {
  assert.strictEqual(clasificar([], 16 / 9), null);
  assert.strictEqual(clasificar(null, 16 / 9), null);
});

test('hay que sostener la mano abierta para pausar', () => {
  const d = new DetectorGestos({ palma: 1.2, pulgar: 0.9 });
  const mano = { puntos: manoSintetica('palma') };
  let r;
  for (let i = 0; i < 30; i++) r = d.actualizar([mano], 1 / 30, ['palma'], 16 / 9); // 1 segundo
  assert.strictEqual(r.listo, false);
  assert.ok(r.progreso > 0.7 && r.progreso < 1);
  let listo = false;
  for (let i = 0; i < 8; i++) listo = listo || d.actualizar([mano], 1 / 30, ['palma'], 16 / 9).listo;
  assert.strictEqual(listo, true, 'se pausa después de 1,2 segundos');
});

test('si mueves la mano abierta (estás jugando) no se pausa', () => {
  const d = new DetectorGestos({ palma: 1.2, pulgar: 0.9 });
  let listo = false;
  for (let i = 0; i < 120; i++) {
    const x = 0.5 + 0.15 * Math.sin(i / 6); // la mano va y viene
    const r = d.actualizar([{ puntos: manoSintetica('palma', x, 0.6) }], 1 / 30, ['palma'], 16 / 9);
    listo = listo || r.listo;
  }
  assert.strictEqual(listo, false);
});

test('se activa una sola vez hasta que sueltas el gesto', () => {
  const d = new DetectorGestos({ palma: 0.5, pulgar: 0.5 });
  const mano = { puntos: manoSintetica('palma') };
  let veces = 0;
  for (let i = 0; i < 90; i++) if (d.actualizar([mano], 1 / 30, ['palma'], 16 / 9).listo) veces++;
  assert.strictEqual(veces, 1);
});

test('después de pausar con la palma, el pulgar arriba funciona de inmediato', () => {
  const d = new DetectorGestos({ palma: 0.5, pulgar: 0.5 });
  const palma = { puntos: manoSintetica('palma') };
  const pulgar = { puntos: manoSintetica('pulgar') };
  let pausa = false;
  let sigue = false;
  for (let i = 0; i < 20; i++) pausa = pausa || d.actualizar([palma], 1 / 30, ['palma'], 16 / 9).listo;
  for (let i = 0; i < 20; i++) sigue = sigue || d.actualizar([pulgar], 1 / 30, ['pulgar'], 16 / 9).listo;
  assert.ok(pausa, 'la palma pausó');
  assert.ok(sigue, 'el pulgar continuó sin tener que esperar');
});

test('solo cuenta los gestos que valen en ese momento', () => {
  const d = new DetectorGestos({ palma: 0.3, pulgar: 0.3 });
  const mano = { puntos: manoSintetica('pulgar') };
  let listo = false;
  for (let i = 0; i < 30; i++) listo = listo || d.actualizar([mano], 1 / 30, ['palma'], 16 / 9).listo;
  assert.strictEqual(listo, false, 'el pulgar no pausa el juego');
});
