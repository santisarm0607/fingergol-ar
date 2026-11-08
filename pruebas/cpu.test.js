/* Pruebas de la máquina (rival para jugar solo). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cargarJuego, simular } = require('./ayudante');

const ARCHIVOS = ['config.js', 'utilidades.js', 'juego/fisica.js', 'juego/cpu.js'];

/** La máquina defiende sola: le lanzan el disco una y otra vez. */
function lanzamientos(nivel, semilla) {
  const FG = cargarJuego(ARCHIVOS, { semilla });
  const p = new FG.Partido({ golesParaGanar: 999 });
  const cpu = new FG.CPU(p, 1, nivel);
  p.iniciar();
  simular(p, 60, (dt) => {
    const o = cpu.actualizar(dt);
    p.fijarObjetivo(1, o.x, o.y);
    if (p.estado === 'jugando' && Math.hypot(p.balon.vx, p.balon.vy) < 5) {
      p.balon.vx = 120 + (semilla % 10) * 10;
      p.balon.vy = ((semilla % 3) - 1) * 60;
    }
  });
  return { autogoles: p.marcador[0], goles: p.marcador[1] };
}

test('la máquina (Normal y Difícil) no se mete autogoles', () => {
  for (const nivel of ['normal', 'dificil']) {
    let autogoles = 0;
    for (let i = 0; i < 6; i++) autogoles += lanzamientos(nivel, 100 + i).autogoles;
    assert.strictEqual(autogoles, 0, `autogoles en ${nivel}`);
  }
});

test('en Fácil los autogoles son raros', () => {
  let autogoles = 0;
  let goles = 0;
  for (let i = 0; i < 6; i++) {
    const r = lanzamientos('facil', 200 + i);
    autogoles += r.autogoles;
    goles += r.goles;
  }
  assert.ok(goles > 0, 'la máquina mete goles');
  assert.ok(autogoles <= Math.max(1, goles * 0.1), `${autogoles} autogoles de ${goles} goles`);
});

test('la máquina nunca sale de su mitad', () => {
  const FG = cargarJuego(ARCHIVOS, { semilla: 7 });
  const p = new FG.Partido({ golesParaGanar: 999 });
  const cpu = new FG.CPU(p, 1, 'dificil');
  p.iniciar();
  let minX = Infinity;
  simular(p, 40, (dt) => {
    const o = cpu.actualizar(dt);
    p.fijarObjetivo(1, o.x, o.y);
    minX = Math.min(minX, p.jugadores[1].x);
  });
  assert.ok(minX >= p.W / 2 - 1e-6, `llegó hasta x=${minX}`);
});

test('la máquina Difícil le gana a la Fácil', () => {
  let goles = [0, 0];
  for (let i = 0; i < 4; i++) {
    const FG = cargarJuego(ARCHIVOS, { semilla: 300 + i });
    const p = new FG.Partido({ golesParaGanar: 999 });
    const cpus = [new FG.CPU(p, 0, 'facil'), new FG.CPU(p, 1, 'dificil')];
    p.iniciar();
    simular(p, 120, (dt) => cpus.forEach((c, lado) => {
      const o = c.actualizar(dt);
      p.fijarObjetivo(lado, o.x, o.y);
    }));
    goles = [goles[0] + p.marcador[0], goles[1] + p.marcador[1]];
  }
  assert.ok(goles[1] > goles[0], `Fácil ${goles[0]} - Difícil ${goles[1]}`);
});
