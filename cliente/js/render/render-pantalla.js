/* ============================================================
   Render: dibuja la mesa de air hockey neón encima del video de la
   cámara (en espejo, como un espejo real) usando Canvas 2D.
   También convierte coordenadas: video -> pantalla -> cancha.
   Si la pantalla está vertical, la cancha se gira 90°.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const U = FG.util;

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  FG.util.rgba = rgba;

  /**
   * Dibuja la mesa de air hockey en coordenadas de cancha:
   * superficie con los huequitos del aire, líneas de neón y arcos.
   */
  FG.dibujarCampo = function (ctx, op = {}) {
    const W = F.ancho;
    const H = F.alto;
    const fondo = F.fondoArco;
    const y1 = (H - F.arco) / 2;
    const y2 = y1 + F.arco;
    const a = op.transparente ? 0.55 : 1;
    const [c0, c1] = [C.EQUIPOS[0].color, C.EQUIPOS[1].color];

    // superficie de la mesa
    ctx.fillStyle = `rgba(21,16,74,${a})`;
    ctx.fillRect(0, 0, W, H);
    // huequitos por donde sale el aire
    ctx.fillStyle = `rgba(140,150,255,${0.22 * a + 0.05})`;
    for (let x = 4; x < W; x += 5) {
      for (let y = 4; y < H; y += 5) {
        ctx.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
      }
    }

    const neon = (color, ancho, brillo) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      ctx.shadowColor = color;
      ctx.shadowBlur = brillo;
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // cada mitad con el neón de su equipo
    [[0, c0], [1, c1]].forEach(([lado, color]) => {
      const x0 = lado === 0 ? 0 : W;
      const s = lado === 0 ? 1 : -1;
      neon(color, 0.7, 6);
      // banda (borde de la mesa)
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(x0, 0);
      ctx.lineTo(x0, y1);
      ctx.moveTo(x0, y2);
      ctx.lineTo(x0, H);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      // semicírculo del área
      ctx.beginPath();
      ctx.arc(x0, H / 2, 24, -Math.PI / 2, Math.PI / 2, lado === 1);
      ctx.stroke();
      // línea de tiro
      neon(rgba(color, 0.45), 0.35, 0);
      ctx.beginPath();
      ctx.moveTo(x0 + s * 40, 3);
      ctx.lineTo(x0 + s * 40, H - 3);
      ctx.stroke();
    });

    // centro: línea y círculo en blanco
    neon('rgba(235,240,255,0.9)', 0.5, 5);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // arcos: ranuras iluminadas
    [0, 1].forEach((lado) => {
      const color = C.EQUIPOS[lado].color;
      const x0 = lado === 0 ? -fondo : W;
      ctx.fillStyle = rgba(color, op.transparente ? 0.25 : 0.18);
      ctx.fillRect(x0, y1, fondo, F.arco);
      neon(color, 0.9, 8);
      ctx.strokeRect(x0, y1, fondo, F.arco);
      ctx.shadowBlur = 0;
    });
  };

  class RenderPantalla {
    constructor(canvas, video) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.video = video;
      this.conCamara = false;
      this.particulas = [];
      this.textos = [];
      this.estela = [];
      this.temblor = 0;
      this.destello = null;
      this.golpes = [0, 0];   // "rebote" de cada mazo al pegarle al disco (1 → 0)
      this.fuego = null;      // estela de color después de un tiro fuerte
      this.ajustar();
      window.addEventListener('resize', () => this.ajustar());
      window.addEventListener('orientationchange', () => setTimeout(() => this.ajustar(), 250));
    }

    ajustar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.dpr = dpr;
      this.w = w;
      this.h = h;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.c.style.width = w + 'px';
      this.c.style.height = h + 'px';
      this.rotado = h > w * 1.05;
      document.body.classList.toggle('vertical', this.rotado);

      const largo = F.ancho + 2 * (F.fondoArco + 2);
      const ancho = F.alto + 4;
      const arriba = 70; // espacio para el marcador
      const pad = 10;
      const areaW = w - pad * 2;
      const areaH = h - arriba - pad;
      let s;
      let ox;
      let oy;
      if (!this.rotado) {
        s = Math.min(areaW / largo, areaH / ancho);
        ox = (w - F.ancho * s) / 2;
        oy = arriba + (areaH - F.alto * s) / 2;
      } else {
        s = Math.min(areaW / ancho, areaH / largo);
        ox = (w - F.alto * s) / 2;
        oy = arriba + (areaH - F.ancho * s) / 2;
      }
      this.campo = { s, ox, oy };
    }

    /* ---------- conversiones de coordenadas ---------- */
    canchaAPantalla(fx, fy) {
      const { s, ox, oy } = this.campo;
      if (!this.rotado) return [ox + fx * s, oy + fy * s];
      return [ox + fy * s, oy + (F.ancho - fx) * s];
    }
    pantallaACancha(sx, sy) {
      const { s, ox, oy } = this.campo;
      if (!this.rotado) return [(sx - ox) / s, (sy - oy) / s];
      return [F.ancho - (sy - oy) / s, (sx - ox) / s];
    }
    /** Punto normalizado del video (0..1) -> píxel en pantalla (video en espejo, "cover"). */
    videoAPantalla(nx, ny) {
      const v = this.video;
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;
      const esc = Math.max(this.w / vw, this.h / vh);
      const dw = vw * esc;
      const dh = vh * esc;
      const ox = (this.w - dw) / 2;
      const oy = (this.h - dh) / 2;
      return [ox + (1 - nx) * dw, oy + ny * dh];
    }

    transformCancha(dx = 0, dy = 0) {
      const { s, ox, oy } = this.campo;
      const d = this.dpr;
      if (!this.rotado) this.ctx.setTransform(s * d, 0, 0, s * d, (ox + dx) * d, (oy + dy) * d);
      else this.ctx.setTransform(0, -s * d, s * d, 0, (ox + dx) * d, (oy + dy + F.ancho * s) * d);
    }
    transformPantalla() {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /* ---------- efectos ---------- */
    efectoPatada(x, y, fuerza, color) {
      const n = Math.min(14, 3 + Math.floor(fuerza / 25));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 15 + Math.random() * (fuerza * 0.35);
        this.particulas.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          vida: 0.35 + Math.random() * 0.25, max: 0.6, color, tam: 0.6 + Math.random() * 0.6, tipo: 'chispa'
        });
      }
    }
    efectoGol(equipo) {
      const xArco = equipo === 0 ? F.ancho : 0;
      const colores = [C.EQUIPOS[equipo].color, '#ffffff', '#ffd23f'];
      for (let i = 0; i < 90; i++) {
        const a = (equipo === 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.4;
        const v = 30 + Math.random() * 90;
        this.particulas.push({
          x: xArco, y: F.alto / 2 + (Math.random() - 0.5) * F.arco,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          vida: 1.2 + Math.random() * 1.2, max: 2.4,
          color: colores[i % 3], tam: 0.9 + Math.random() * 1.1, tipo: 'confeti', giro: Math.random() * 6
        });
      }
      this.temblor = 14;
      this.destello = { color: C.EQUIPOS[equipo].color, vida: 0.5 };
    }
    /** El mazo del jugador "salta" al pegarle al disco. */
    golpear(lado, fuerza) {
      this.golpes[lado] = 1;
      if (fuerza > 190) this.fuego = { color: C.EQUIPOS[lado].color, vida: 0.8 };
    }
    textoFlotante(texto, fx, fy, color) {
      this.textos.push({ texto, fx, fy, color, vida: 1.1, max: 1.1 });
    }

    actualizarEfectos(dt) {
      for (const p of this.particulas) {
        p.vida -= dt;
        const roce = Math.exp(-(p.tipo === 'confeti' ? 1.6 : 5) * dt);
        p.vx *= roce;
        p.vy *= roce;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.giro != null) p.giro += dt * 8;
      }
      this.particulas = this.particulas.filter((p) => p.vida > 0);
      for (const t of this.textos) t.vida -= dt;
      this.textos = this.textos.filter((t) => t.vida > 0);
      this.temblor *= Math.exp(-6 * dt);
      this.golpes = this.golpes.map((g) => Math.max(0, g - dt * 4));
      if (this.fuego) {
        this.fuego.vida -= dt;
        if (this.fuego.vida <= 0) this.fuego = null;
      }
      if (this.destello) {
        this.destello.vida -= dt;
        if (this.destello.vida <= 0) this.destello = null;
      }
    }

    /* ---------- dibujo ---------- */
    /**
     * @param partido  FG.Partido
     * @param op  { manos: [{puntos:[[sx,sy]...], color}], etiquetas: ['1','2'],
     *              locales: [lados de este dispositivo], avisos: bool, soloCapas: bool }
     */
    dibujar(partido, op = {}) {
      const ctx = this.ctx;
      this.transformPantalla();
      ctx.clearRect(0, 0, this.w, this.h);

      if (!op.soloCapas && partido) {
        const tx = (Math.random() - 0.5) * this.temblor;
        const ty = (Math.random() - 0.5) * this.temblor;
        this.transformCancha(tx, ty);
        FG.dibujarCampo(ctx, { transparente: this.conCamara });
        this.dibujarEstela(partido.balon);
        this.dibujarParticulas();
        partido.jugadores.forEach((j) => this.dibujarJugador(j, op));
        this.dibujarBalon(partido.balon, partido);
        this.transformPantalla();
        partido.jugadores.forEach((j) => this.dibujarEtiqueta(j, op));
      }

      if (op.manos) op.manos.forEach((m) => this.dibujarMano(m));
      this.transformPantalla();
      this.dibujarTextos(op.proyectar);

      if (this.destello) {
        ctx.fillStyle = rgba(this.destello.color, Math.max(0, this.destello.vida) * 0.5);
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    dibujarEstela(b) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 70) this.estela.push({ x: b.x, y: b.y });
      else this.estela.shift();
      if (this.estela.length > 10) this.estela.shift();
      const ctx = this.ctx;
      // después de un tiro fuerte la estela toma el color del equipo
      const color = this.fuego ? this.fuego.color : '#ffffff';
      const fuerte = this.fuego ? Math.min(1, this.fuego.vida * 2) : 0;
      this.estela.forEach((p, i) => {
        const a = (i + 1) / this.estela.length;
        ctx.fillStyle = rgba(color, a * (0.22 + fuerte * 0.4));
        ctx.beginPath();
        ctx.arc(p.x, p.y, b.r * (0.4 + a * (0.6 + fuerte * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    dibujarParticulas() {
      const ctx = this.ctx;
      for (const p of this.particulas) {
        const a = Math.min(1, p.vida / (p.max * 0.5));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.tipo === 'confeti') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.giro);
          ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.tam * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    dibujarJugador(j, op) {
      const ctx = this.ctx;
      const eq = C.EQUIPOS[j.lado];
      const esLocal = !op.locales || op.locales.includes(j.lado);
      const perdido = !j.activo && esLocal && op.avisos;
      ctx.globalAlpha = perdido ? 0.45 : 1;

      // mazo de air hockey visto desde arriba: anillo de neón, base y perilla
      const r = j.r;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(j.x + 0.6, j.y + 1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = eq.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = eq.oscuro;
      ctx.beginPath();
      ctx.arc(j.x, j.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = r * 0.16;
      ctx.strokeStyle = eq.color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // anillo interior
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = rgba(eq.color, 0.6);
      ctx.beginPath();
      ctx.arc(j.x, j.y, r * 0.66, 0, Math.PI * 2);
      ctx.stroke();
      // perilla (donde iría la mano)
      const g = 1 + 0.25 * Math.sin(this.golpes[j.lado] * Math.PI);
      ctx.fillStyle = eq.color;
      ctx.beginPath();
      ctx.arc(j.x, j.y, r * 0.44 * g, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(j.x - r * 0.12, j.y - r * 0.14, r * 0.14, 0, Math.PI * 2);
      ctx.fill();

      if (perdido) {
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([1.6, 1.4]);
        ctx.lineDashOffset = -performance.now() / 120;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(j.x, j.y, j.r + 2.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }

    dibujarEtiqueta(j, op) {
      const ctx = this.ctx;
      const [sx, sy] = this.canchaAPantalla(j.x, j.y);
      const rPx = j.r * this.campo.s;
      const texto = op.etiquetas ? op.etiquetas[j.lado] : String(j.lado + 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (texto) {
        // nombre corto en una plaquita debajo del mazo
        ctx.font = `700 ${Math.max(11, rPx * 0.46)}px "Rajdhani", system-ui, sans-serif`;
        const ancho = ctx.measureText(texto).width + 12;
        const y = sy + rPx + Math.max(10, rPx * 0.4);
        ctx.fillStyle = 'rgba(12,9,46,0.85)';
        ctx.strokeStyle = C.EQUIPOS[j.lado].color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx - ancho / 2, y - 9, ancho, 18, 4);
        else ctx.rect(sx - ancho / 2, y - 9, ancho, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(texto, sx, y + 1);
      }

      const esLocal = !op.locales || op.locales.includes(j.lado);
      if (!j.activo && esLocal && op.avisos) {
        ctx.font = `700 ${Math.max(12, rPx * 0.62)}px "Rajdhani", system-ui, sans-serif`;
        const msg = '¿Y tu mano?';
        const ancho = ctx.measureText(msg).width + 16;
        const y = sy - rPx - 22;
        ctx.fillStyle = 'rgba(10,14,30,0.85)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx - ancho / 2, y - 14, ancho, 28, 14);
        else ctx.rect(sx - ancho / 2, y - 14, ancho, 28);
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(msg, sx, y + 1);
      }
    }

    /** El "balón" es un disco de air hockey que brilla. */
    dibujarBalon(b, partido) {
      const ctx = this.ctx;
      const color = this.fuego ? this.fuego.color : '#f4ff5a';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(b.x + 0.5, b.y + 0.8, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#1b1650';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = b.r * 0.3;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // marca que gira con el disco
      ctx.strokeStyle = rgba(color, 0.8);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.42, b.giro, b.giro + Math.PI * 1.2);
      ctx.stroke();

      // en la cuenta regresiva, un anillo marca el saque
      if (partido.estado === 'cuenta') {
        ctx.strokeStyle = 'rgba(244,255,90,0.85)';
        ctx.lineWidth = 0.5;
        const p = 1 + 0.25 * Math.sin(performance.now() / 120);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.9 * p, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    /** m = { puntos: [[sx,sy] x21], color } ya convertidos a pantalla */
    dibujarMano(m) {
      const ctx = this.ctx;
      this.transformPantalla();
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(m.color, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [a, b] of FG.CONEXIONES_MANO) {
        const p = m.puntos[a];
        const q = m.puntos[b];
        if (!p || !q) continue;
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      m.puntos.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
      const punta = m.puntos[8];
      if (punta) {
        // anillo de neón en la punta del índice: ahí está tu mazo
        ctx.strokeStyle = m.color;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(punta[0], punta[1], 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    dibujarTextos(proyectar) {
      const ctx = this.ctx;
      const conv = proyectar || ((x, y) => this.canchaAPantalla(x, y));
      for (const t of this.textos) {
        const p = conv(t.fx, t.fy);
        if (!p) continue;
        const avance = 1 - t.vida / t.max;
        const a = Math.min(1, t.vida / 0.35);
        const tam = Math.max(18, (this.campo.s || 5) * 5.2) * (avance < 0.15 ? 0.6 + avance * 2.7 : 1);
        ctx.globalAlpha = a;
        ctx.font = `800 ${tam}px "Rajdhani", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(8,10,24,0.85)';
        ctx.strokeText(t.texto, p[0], p[1] - avance * 40);
        ctx.fillStyle = t.color || '#ffd23f';
        ctx.fillText(t.texto, p[0], p[1] - avance * 40);
      }
      ctx.globalAlpha = 1;
    }
  }

  FG.RenderPantalla = RenderPantalla;
})();
