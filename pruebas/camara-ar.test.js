/* Pruebas de la mesa 3D: la cámara de AR proyecta la mesa y encuentra el dedo. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cargarJuego } = require('./ayudante');

const FG = cargarJuego(['config.js', 'utilidades.js', 'ar/ar.js']);

// cámara mirando la mesa desde arriba, inclinada 52° (como un celular apoyado)
function camaraFalsa() {
  const a = (52 * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const ancla = [1, 0, 0, 0, 0, cs, sn, 0, 0, -sn, cs, 0, 0.05, -0.6, -3.6, 1];
  const fov = (52 * Math.PI) / 180;
  const f = 1 / Math.tan(fov / 2);
  const asp = 1280 / 720;
  const n = 0.01;
  const fa = 100;
  const proy = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0];
  const cam = new FG.CamaraAR({
    lista: () => true,
    matrizAncla: () => ancla,
    matrizCamara: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    proyeccion: () => proy,
    rect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  });
  cam.preparar();
  return cam;
}

test('la mesa se ve dentro de la pantalla', () => {
  const cam = camaraFalsa();
  assert.ok(cam.visible());
  for (const [x, z] of [[0, 0], [160, 0], [0, 100], [160, 100], [80, 50]]) {
    const q = cam.proyectar(x, 0, z);
    assert.ok(q, `esquina ${x},${z}`);
    assert.ok(q.x > 0 && q.x < 1280 && q.y > 0 && q.y < 720, `esquina ${x},${z} en pantalla`);
  }
});

test('lo cercano se ve más grande que lo lejano', () => {
  const cam = camaraFalsa();
  const lejos = cam.proyectar(80, 0, 0);
  const cerca = cam.proyectar(80, 0, 100);
  assert.ok(cerca.e > lejos.e);
});

test('un punto de la pantalla vuelve al mismo punto de la mesa (el dedo)', () => {
  const cam = camaraFalsa();
  for (const [x, z] of [[20, 30], [80, 50], [140, 85], [3, 97]]) {
    const q = cam.proyectar(x, 0, z);
    const [x2, z2] = cam.pantallaAPlano(q.x, q.y);
    assert.ok(Math.abs(x2 - x) < 0.01 && Math.abs(z2 - z) < 0.01, `${x},${z} -> ${x2.toFixed(2)},${z2.toFixed(2)}`);
  }
});
