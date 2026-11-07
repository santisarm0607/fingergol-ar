/* ============================================================
   Render "Modo Pantalla": dibuja la cancha encima del video de la
   cámara (en espejo, como un espejo real) usando Canvas 2D.
   También convierte coordenadas: video -> pantalla -> cancha.
   Si la pantalla está vertical, la cancha se gira 90°.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const U = FG.util;
  const FUENTE_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  FG.util.rgba = rgba;

  /** Dibuja la cancha en coordenadas de cancha. */
  FG.dibujarCampo = function (ctx, op = {}) {
    const W = F.ancho;
    const H = F.alto;
    const fondo = F.fondoArco;
    const y1 = (H - F.arco) / 2;
    const y2 = y1 + F.arco;
    const a = op.transparente ? 0.4 : 1;

    // césped a franjas
    const franjas = 10;
    for (let i = 0; i < franjas; i++) {
      ctx.fillStyle = i % 2 ? `rgba(36,156,84,${a})` : `rgba(27,134,70,${a})`;
      ctx.fillRect((i * W) / franjas, 0, W / franjas + 0.05, H);
    }
    // cada mitad con un toque del color de su equipo
    ctx.fillStyle = rgba(C.EQUIPOS[0].color, 0.08);
    ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = rgba(C.EQUIPOS[1].color, 0.08);
    ctx.fillRect(W / 2, 0, W / 2, H);

    // líneas
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 0.6;
    ctx.lineJoin = 'round';
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // áreas grande y chica, punto penal y medialuna
    ctx.strokeRect(0, H / 2 - 25, 22, 50);
    ctx.strokeRect(W - 22, H / 2 - 25, 22, 50);
    ctx.strokeRect(0, H / 2 - 13, 8, 26);
    ctx.strokeRect(W - 8, H / 2 - 13, 8, 26);
    [[15, 0], [W - 15, Math.PI]].forEach(([x, ang]) => {
      ctx.beginPath();
      ctx.arc(x, H / 2, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, H / 2, 11, ang - 0.88, ang + 0.88);
      ctx.stroke();
    });
    // tiros de esquina
    [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, -Math.PI / 2]].forEach(([x, y, ang]) => {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, ang, ang + Math.PI / 2);
      ctx.stroke();
    });

    // arcos con red
    [0, 1].forEach((lado) => {
      const x0 = lado === 0 ? -fondo : W;
      ctx.fillStyle = rgba(C.EQUIPOS[lado].color, op.transparente ? 0.28 : 0.35);
      ctx.fillRect(x0, y1, fondo, F.arco);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      for (let x = x0; x <= x0 + fondo + 0.01; x += 1.75) {
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
      }
      for (let y = y1; y <= y2 + 0.01; y += 1.75) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + fondo, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(x0, y1, fondo, F.arco);
      ctx.fillStyle = '#ffffff';
      [y1, y2].forEach((y) => {
        ctx.beginPath();
        ctx.arc(lado === 0 ? 0 : W, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      });
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
      this.golpes = [0, 0];   // "rebote" de cada figura al pegarle al balón (1 → 0)
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
    /** La figura del jugador "salta" al pegarle al balón. */
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

      // sombra
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(j.x + 0.9, j.y + 1.3, j.r * 1.02, j.r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // halo
      const halo = ctx.createRadialGradient(j.x, j.y, j.r * 0.6, j.x, j.y, j.r * 1.75);
      halo.addColorStop(0, rgba(eq.color, 0.45));
      halo.addColorStop(1, rgba(eq.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r * 1.75, 0, Math.PI * 2);
      ctx.fill();
      // ficha
      const g = ctx.createRadialGradient(j.x - j.r * 0.35, j.y - j.r * 0.35, j.r * 0.1, j.x, j.y, j.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, eq.color);
      g.addColorStop(1, eq.oscuro);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();

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
      const figura = op.figuras && op.figuras[j.lado];
      if (figura) {
        // figura (emoji) encima de la ficha: se inclina al moverse y salta al patear
        const g = this.golpes[j.lado];
        const salto = 1 + 0.38 * Math.sin(g * Math.PI);
        const inclina = U.clamp((this.rotado ? -j.vy : j.vx) / 500, -0.35, 0.35);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(inclina);
        ctx.scale(salto, salto);
        ctx.font = `${Math.max(16, rPx * 1.3)}px ${FUENTE_EMOJI}`;
        ctx.fillText(figura, 0, rPx * 0.08);
        ctx.restore();
        if (texto) {
          // nombre pequeño debajo de la ficha
          ctx.font = `800 ${Math.max(10, rPx * 0.42)}px "Baloo 2", system-ui, sans-serif`;
          const ancho = ctx.measureText(texto).width + 12;
          const y = sy + rPx + Math.max(9, rPx * 0.35);
          ctx.fillStyle = rgba(C.EQUIPOS[j.lado].oscuro, 0.9);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(sx - ancho / 2, y - 9, ancho, 18, 9);
          else ctx.rect(sx - ancho / 2, y - 9, ancho, 18);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(texto, sx, y + 1);
        }
      } else {
        ctx.font = `800 ${Math.max(10, rPx * ((texto || '').length > 2 ? 0.55 : 0.8))}px "Baloo 2", system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(texto || String(j.lado + 1), sx, sy + rPx * 0.06);
      }

      const esLocal = !op.locales || op.locales.includes(j.lado);
      if (!j.activo && esLocal && op.avisos) {
        ctx.font = `700 ${Math.max(12, rPx * 0.62)}px "Baloo 2", system-ui, sans-serif`;
        const msg = '✋ ¿Y tu mano?';
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

    dibujarBalon(b, partido) {
      const ctx = this.ctx;
      // sombra
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.ellipse(b.x + 0.7, b.y + 1.1, b.r, b.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // esfera
      const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#e9edf5');
      g.addColorStop(1, '#a9b2c4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      // parches negros que "ruedan"
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1b2233';
      const giro = b.giro;
      const desp = Math.sin(giro) * b.r * 0.35;
      const ang = Math.atan2(b.vy, b.vx);
      const cx = b.x + Math.cos(ang) * desp;
      const cy = b.y + Math.sin(ang) * desp;
      this.pentagono(cx, cy, b.r * 0.36, giro * 0.3);
      for (let i = 0; i < 5; i++) {
        const a = giro * 0.3 + (i * Math.PI * 2) / 5;
        this.pentagono(cx + Math.cos(a) * b.r * 0.92, cy + Math.sin(a) * b.r * 0.92, b.r * 0.3, a);
      }
      ctx.restore();
      ctx.lineWidth = 0.35;
      ctx.strokeStyle = 'rgba(20,25,40,0.6)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();

      // en la cuenta regresiva, un anillo marca el saque
      if (partido.estado === 'cuenta') {
        ctx.strokeStyle = 'rgba(255,210,63,0.9)';
        ctx.lineWidth = 0.6;
        const p = 1 + 0.25 * Math.sin(performance.now() / 120);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.9 * p, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    pentagono(x, y, r, rot) {
      const ctx = this.ctx;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = rot + (i * Math.PI * 2) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
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
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(punta[0], punta[1], m.figura ? 20 : 9, 0, Math.PI * 2);
        ctx.stroke();
        if (m.figura) {
          // tu figura en la punta del dedo índice
          ctx.fillStyle = rgba(m.color, 0.35);
          ctx.fill();
          ctx.font = `26px ${FUENTE_EMOJI}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.figura, punta[0], punta[1] + 2);
        }
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
        ctx.font = `800 ${tam}px "Baloo 2", system-ui, sans-serif`;
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
