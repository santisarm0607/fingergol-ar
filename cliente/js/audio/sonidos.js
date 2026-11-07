/* ============================================================
   Sonidos sintetizados con Web Audio (no hay archivos de audio).
   Si luego quieres sonidos reales, cambia cada función por
   la reproducción de un .mp3 de la carpeta assets/.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const U = FG.util;

  class Sonidos {
    constructor() {
      this.ctx = null;
      this.silencio = U.leer('silencio', false);
      this.ultimo = {};
    }

    /** Debe llamarse desde un clic (los navegadores bloquean el audio antes). */
    activar() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.salida = this.ctx.createGain();
          this.salida.gain.value = 0.7;
          this.salida.connect(this.ctx.destination);
          const largo = this.ctx.sampleRate;
          this.ruidoBuf = this.ctx.createBuffer(1, largo, this.ctx.sampleRate);
          const d = this.ruidoBuf.getChannelData(0);
          for (let i = 0; i < largo; i++) d[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (e) {
        this.ctx = null;
      }
    }

    alternar() {
      this.silencio = !this.silencio;
      U.guardar('silencio', this.silencio);
      return this.silencio;
    }

    puede(nombre, ms) {
      if (this.silencio || !this.ctx) return false;
      const ahora = performance.now();
      if (this.ultimo[nombre] && ahora - this.ultimo[nombre] < ms) return false;
      this.ultimo[nombre] = ahora;
      return true;
    }

    tono(freq, dur, tipo = 'sine', vol = 0.3, retraso = 0, freqFinal = null) {
      const c = this.ctx;
      const t = c.currentTime + retraso;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(freq, t);
      if (freqFinal) o.frequency.exponentialRampToValueAtTime(freqFinal, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.salida);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    }

    ruido(dur, vol, freq, tipoFiltro = 'bandpass', retraso = 0, ataque = 0.005) {
      const c = this.ctx;
      const t = c.currentTime + retraso;
      const s = c.createBufferSource();
      s.buffer = this.ruidoBuf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = tipoFiltro;
      f.frequency.value = freq;
      f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + ataque);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.salida);
      s.start(t);
      s.stop(t + dur + 0.05);
    }

    boton() {
      if (!this.puede('boton', 60)) return;
      this.tono(620, 0.07, 'sine', 0.12);
    }
    patada(fuerza) {
      if (!this.puede('patada', 55)) return;
      const v = U.clamp(fuerza / 220, 0.18, 1);
      this.tono(170, 0.13, 'sine', 0.55 * v, 0, 55);
      this.ruido(0.05, 0.25 * v, 2200, 'highpass');
    }
    rebote(fuerza) {
      if (!this.puede('rebote', 70)) return;
      this.tono(300, 0.06, 'triangle', U.clamp(fuerza / 600, 0.04, 0.16));
    }
    poste() {
      if (!this.puede('poste', 150)) return;
      this.tono(880, 0.35, 'triangle', 0.18);
      this.tono(1320, 0.28, 'sine', 0.1, 0.01);
    }
    cuenta(n) {
      if (!this.puede('cuenta', 200)) return;
      this.tono(n > 0 ? 640 : 960, n > 0 ? 0.14 : 0.3, 'square', 0.09);
    }
    pitazo() {
      if (!this.puede('pitazo', 300)) return;
      this.silbato(0, 0.5);
    }
    /** Silbato del árbitro (retraso y duración en segundos). */
    silbato(retraso, dur) {
      const c = this.ctx;
      const t = c.currentTime + retraso;
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = 2650;
      lfo.frequency.value = 28;
      lfoG.gain.value = 140;
      lfo.connect(lfoG).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.salida);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    }
    gol() {
      if (!this.puede('gol', 500)) return;
      this.ruido(2.4, 0.32, 900, 'bandpass', 0, 0.25);  // "hinchada"
      this.ruido(1.8, 0.12, 2400, 'bandpass', 0.1, 0.2);
      [523, 659, 784, 1046].forEach((f, i) => this.tono(f, 0.22, 'square', 0.07, i * 0.11));
      this.tono(1046, 0.6, 'triangle', 0.12, 0.44);
    }
    fin() {
      if (!this.puede('fin', 800)) return;
      // pitazo final: corto, corto, largo… y luego la fanfarria
      this.silbato(0, 0.22);
      this.silbato(0.32, 0.22);
      this.silbato(0.64, 0.75);
      [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) =>
        this.tono(f, i === 6 ? 0.8 : 0.18, 'square', 0.07, 1.5 + i * 0.14)
      );
    }
  }

  FG.Sonidos = Sonidos;
})();
