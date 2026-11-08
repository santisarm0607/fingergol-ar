/* ============================================================
   Mesa 3D de air hockey sobre tu mesa real (modo AR).
   No usa WebGL: cada punto 3D se proyecta con la cámara de AR.js
   (CamaraAR) y se dibuja en Canvas 2D de lo más lejano a lo más
   cercano. Así se ve igual en cualquier celular o portátil.

   Coordenadas: x = largo (0..160), z = ancho (0..100), h = altura.
   (La física usa x, y; aquí la "y" de la física es la z.)
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const W = F.ancho;
  const H = F.alto;
  const Y1 = (H - F.arco) / 2;
  const Y2 = Y1 + F.arco;
  const rgba = FG.util.rgba;

  const BANDA = 3;        // grosor de las bandas
  const ALTO_BANDA = 4;   // altura de las bandas
  const ALTO_MAZO = 2.4;  // base del mazo
  const ALTO_PERILLA = 4.6;
  const ALTO_DISCO = 1.4;

  class Render3D {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.cam = null;
      this.particulas = [];
      this.textos = [];
      this.estela = [];
      this.temblor = 0;
      this.destello = null;
      this.golpes = [0, 0];
      this.fuego = null;
      this.ahorro = false;
      this.menosMovimiento = false;
      this.rotado = false;
      this.activo = false;
      this.ajustar();
      window.addEventListener('resize', () => this.activo && this.ajustar());
    }

    ajustar() {
      const dpr = this.ahorro ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      if (!this.activo) return;
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.c.style.width = this.w + 'px';
      this.c.style.height = this.h + 'px';
    }

    usarCamara(cam) {
      this.cam = cam;
      this.activo = true;
      this.ajustar();
    }

    transformPantalla() {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /* ---------- efectos (misma forma que RenderPantalla) ---------- */
    efectoPatada(x, y, fuerza, color) {
      const n = Math.min(14, 3 + Math.floor(fuerza / 25));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 15 + Math.random() * fuerza * 0.3;
        this.particulas.push({
          x, z: y, h: 2, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: 10 + Math.random() * 20,
          vida: 0.35 + Math.random() * 0.25, max: 0.6, color, tam: 0.7, tipo: 'chispa'
        });
      }
    }
    efectoGol(equipo) {
      const xArco = equipo === 0 ? W : 0;
      const colores = [C.EQUIPOS[equipo].color, '#ffffff', '#f4ff5a'];
      const n = this.ahorro ? 50 : 100;
      for (let i = 0; i < n; i++) {
        const a = (equipo === 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.6;
        const v = 20 + Math.random() * 60;
        this.particulas.push({
          x: xArco, z: H / 2 + (Math.random() - 0.5) * F.arco, h: 6,
          vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: 40 + Math.random() * 70,
          vida: 1.6 + Math.random() * 1.2, max: 2.8, color: colores[i % 3],
          tam: 1 + Math.random(), tipo: 'confeti'
        });
      }
      this.temblor = 12;
      this.destello = { color: C.EQUIPOS[equipo].color, vida: 0.5 };
    }
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
        const roce = Math.exp(-(p.tipo === 'confeti' ? 1.2 : 4) * dt);
        p.vx *= roce;
        p.vz *= roce;
        p.vh -= (p.tipo === 'confeti' ? 70 : 120) * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.h = Math.max(0.2, p.h + p.vh * dt);
        if (p.h <= 0.2) {
          p.vh = 0;
          p.vx *= 0.8;
          p.vz *= 0.8;
        }
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

    /* ---------- utilidades de dibujo ---------- */
    P(x, h, z) {
      return this.cam.proyectar(x, h, z);
    }
    proyectarLista(pts) {
      const out = [];
      for (const q of pts) {
        const r = this.P(q[0], q[1], q[2]);
        if (!r) return null;
        out.push(r);
      }
      return out;
    }
    camino(pr, cerrar) {
      const ctx = this.ctx;
      ctx.beginPath();
      pr.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      if (cerrar) ctx.closePath();
    }
    poligono(pts, relleno, borde, grosor) {
      const pr = this.proyectarLista(pts);
      if (!pr) return;
      const ctx = this.ctx;
      this.camino(pr, true);
      if (relleno) {
        ctx.fillStyle = relleno;
        ctx.fill();
      }
      if (borde) {
        ctx.strokeStyle = borde;
        ctx.lineWidth = grosor || 1;
        ctx.stroke();
      }
    }
    /** Línea de neón (con brillo, salvo en modo ahorro). */
    neon(pts, color, grosor, cerrar) {
      const pr = this.proyectarLista(pts);
      if (!pr) return;
      const ctx = this.ctx;
      this.camino(pr, cerrar);
      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!this.ahorro) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    circulo(x, z, r, n = 32, h = 0, a0 = 0, a1 = Math.PI * 2) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([x + Math.cos(a) * r, h, z + Math.sin(a) * r]);
      }
      return pts;
    }
    /** ¿La cara con esta normal mira hacia la cámara? */
    mira(normal, centro) {
      const ojo = this.cam.ojo();
      return normal[0] * (ojo[0] - centro[0]) + normal[1] * (ojo[1] - centro[1]) + normal[2] * (ojo[2] - centro[2]) > 0;
    }
    distancia(x, z) {
      const ojo = this.cam.ojo();
      return Math.hypot(x - ojo[0], z - ojo[2]);
    }

    /* ======================= DIBUJO PRINCIPAL ======================= */
    /**
     * op = { manos, etiquetas, locales, avisos, rotulos, gesto }
     */
    dibujar(partido, op = {}) {
      const ctx = this.ctx;
      this.transformPantalla();
      ctx.clearRect(0, 0, this.w, this.h);
      if (partido && this.cam && this.cam.visible()) {
        const temblor = this.menosMovimiento ? 0 : this.temblor;
        const tx = (Math.random() - 0.5) * temblor;
        const ty = (Math.random() - 0.5) * temblor;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, tx * this.dpr, ty * this.dpr);
        const centro = this.P(W / 2, 0, H / 2);
        this.eC = centro ? centro.e : 3;
        this.dibujarSuperficie();
        if (op.rotulos) this.dibujarRotulos(op.rotulos);
        this.dibujarEstela(partido.balon);
        this.dibujarVolumenes(partido, op);
        this.dibujarParticulas();
        this.transformPantalla();
        this.dibujarEtiquetas(partido, op);
        this.dibujarTextos();
      }
      this.transformPantalla();
      if (op.manos) op.manos.forEach((m) => this.dibujarMano(m));
      if (this.destello && !this.menosMovimiento) {
        ctx.fillStyle = rgba(this.destello.color, Math.max(0, this.destello.vida) * 0.45);
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    /* ---------- superficie: sombra, mesa índigo, huequitos y neón ---------- */
    dibujarSuperficie() {
      const m = F.fondoArco + BANDA + 3;
      // sombra suave que "pega" la mesa virtual a tu mesa real
      this.poligono([[-m - 3, 0, -BANDA - 6], [W + m + 3, 0, -BANDA - 6], [W + m + 3, 0, H + BANDA + 6], [-m - 3, 0, H + BANDA + 6]], 'rgba(0,0,0,0.25)');
      this.poligono([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], 'rgba(21,16,74,0.9)');
      [0, 1].forEach((lado) => {
        const x0 = lado === 0 ? 0 : W / 2;
        this.poligono([[x0, 0, 0], [x0 + W / 2, 0, 0], [x0 + W / 2, 0, H], [x0, 0, H]], rgba(C.EQUIPOS[lado].color, 0.05));
      });

      // huequitos del aire (pocos, para que no pese)
      if (!this.ahorro) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(140,150,255,0.35)';
        for (let x = 8; x < W; x += 12) {
          for (let z = 8; z < H; z += 12) {
            const q = this.P(x, 0, z);
            if (!q) continue;
            const t = Math.max(1, q.e * 0.5);
            ctx.fillRect(q.x - t / 2, q.y - t / 2, t, t);
          }
        }
      }

      const g = Math.max(1.2, this.eC * 0.55);
      [0, 1].forEach((lado) => {
        const color = C.EQUIPOS[lado].color;
        const x0 = lado === 0 ? 0 : W;
        const s = lado === 0 ? 1 : -1;
        // semicírculo del área
        this.neon(this.circulo(x0, H / 2, 24, 20, 0, -Math.PI / 2, Math.PI / 2).map((p) => [x0 + (p[0] - x0) * s, 0, p[2]]), color, g);
        // línea de tiro
        this.neon([[x0 + s * 40, 0, 3], [x0 + s * 40, 0, H - 3]], rgba(color, 0.45), g * 0.6);
        // fondo del arco: ranura iluminada
        const xa = lado === 0 ? -F.fondoArco : W;
        this.poligono([[xa, 0, Y1], [xa + F.fondoArco, 0, Y1], [xa + F.fondoArco, 0, Y2], [xa, 0, Y2]], rgba(color, 0.3));
      });
      // centro
      this.neon([[W / 2, 0, 0], [W / 2, 0, H]], 'rgba(235,240,255,0.9)', g * 0.8);
      this.neon(this.circulo(W / 2, H / 2, 13, 28), 'rgba(235,240,255,0.9)', g * 0.8);
    }

    dibujarRotulos(rotulos) {
      const ctx = this.ctx;
      [0, 1].forEach((lado) => {
        const q = this.P(lado === 0 ? W * 0.25 : W * 0.75, 0.2, H / 2);
        if (!q || !rotulos[lado]) return;
        ctx.font = `700 ${Math.max(14, q.e * 7)}px "Rajdhani", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.EQUIPOS[lado].color, 0.85);
        ctx.fillText(rotulos[lado], q.x, q.y);
      });
    }

    dibujarEstela(b) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 70) this.estela.push({ x: b.x, z: b.y });
      else this.estela.shift();
      if (this.estela.length > 10) this.estela.shift();
      const ctx = this.ctx;
      const color = this.fuego ? this.fuego.color : '#ffffff';
      this.estela.forEach((p, i) => {
        const q = this.P(p.x, 0.6, p.z);
        if (!q) return;
        const a = (i + 1) / this.estela.length;
        ctx.fillStyle = rgba(color, a * 0.3);
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(1, b.r * q.e * (0.4 + a * 0.6)), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    /* ---------- bandas, arcos, mazos y disco (de lejos a cerca) ---------- */
    dibujarVolumenes(partido, op) {
      const lista = [];
      const e = BANDA;
      const piezas = [
        // [x0, x1, z0, z1, equipo]
        [-e, W / 2, -e, 0, 0], [W / 2, W + e, -e, 0, 1],
        [-e, W / 2, H, H + e, 0], [W / 2, W + e, H, H + e, 1],
        [-e, 0, 0, Y1, 0], [-e, 0, Y2, H, 0],
        [W, W + e, 0, Y1, 1], [W, W + e, Y2, H, 1],
        // paredes del bolsillo de cada arco
        [-F.fondoArco - e, -F.fondoArco, Y1 - e, Y2 + e, 0],
        [-F.fondoArco, -e, Y1 - e, Y1, 0], [-F.fondoArco, -e, Y2, Y2 + e, 0],
        [W + F.fondoArco, W + F.fondoArco + e, Y1 - e, Y2 + e, 1],
        [W + e, W + F.fondoArco, Y1 - e, Y1, 1], [W + e, W + F.fondoArco, Y2, Y2 + e, 1]
      ];
      for (const c of piezas) {
        const cx = (c[0] + c[1]) / 2;
        const cz = (c[2] + c[3]) / 2;
        lista.push({ d: this.distancia(cx, cz), fn: () => this.banda(c[0], c[1], c[2], c[3], c[4]) });
      }
      partido.jugadores.forEach((j) => {
        lista.push({ d: this.distancia(j.x, j.y), fn: () => this.mazo(j, op) });
      });
      const b = partido.balon;
      lista.push({ d: this.distancia(b.x, b.y), fn: () => this.disco(b, partido) });
      lista.sort((a, c) => c.d - a.d).forEach((o) => o.fn());
    }

    banda(x0, x1, z0, z1, equipo) {
      const h = ALTO_BANDA;
      const caras = [
        { n: [0, 0, -1], p: [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]], col: '#140f45' },
        { n: [0, 0, 1], p: [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], col: '#1a1458' },
        { n: [-1, 0, 0], p: [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], col: '#110d3a' },
        { n: [1, 0, 0], p: [[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]], col: '#110d3a' }
      ];
      for (const cara of caras) {
        const c = cara.p.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
        if (this.mira(cara.n, c)) this.poligono(cara.p, cara.col);
      }
      const color = C.EQUIPOS[equipo].color;
      this.poligono([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], '#231b7a');
      // tubo de neón encima de la banda
      const g = Math.max(1, this.eC * 0.5);
      const largoX = x1 - x0 >= z1 - z0;
      const pts = largoX
        ? [[x0, h + 0.05, (z0 + z1) / 2], [x1, h + 0.05, (z0 + z1) / 2]]
        : [[(x0 + x1) / 2, h + 0.05, z0], [(x0 + x1) / 2, h + 0.05, z1]];
      this.neon(pts, color, g);
    }

    /** Cilindro vertical: costados que miran a la cámara + tapa. */
    cilindro(x, z, r, h0, h1, colorLado, colorTapa, borde, grosor) {
      const n = 22;
      const abajo = [];
      const arriba = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        abajo.push([x + Math.cos(a) * r, h0, z + Math.sin(a) * r]);
        arriba.push([x + Math.cos(a) * r, h1, z + Math.sin(a) * r]);
      }
      const pa = this.proyectarLista(abajo);
      const pb = this.proyectarLista(arriba);
      if (!pa || !pb) return;
      const ctx = this.ctx;
      ctx.fillStyle = colorLado;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2;
        const centro = [x + Math.cos(a) * r, (h0 + h1) / 2, z + Math.sin(a) * r];
        if (!this.mira([Math.cos(a), 0, Math.sin(a)], centro)) continue;
        ctx.moveTo(pa[i].x, pa[i].y);
        ctx.lineTo(pa[i + 1].x, pa[i + 1].y);
        ctx.lineTo(pb[i + 1].x, pb[i + 1].y);
        ctx.lineTo(pb[i].x, pb[i].y);
        ctx.closePath();
      }
      ctx.fill();
      this.camino(pb, true);
      ctx.fillStyle = colorTapa;
      ctx.fill();
      if (borde) {
        ctx.strokeStyle = borde;
        ctx.lineWidth = grosor || 1;
        if (!this.ahorro) {
          ctx.shadowColor = borde;
          ctx.shadowBlur = 10;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    sombra(x, z, r) {
      this.poligono(this.circulo(x + 0.8, z + 1.2, r * 1.05, 18, 0.02), 'rgba(0,0,0,0.38)');
    }

    mazo(j, op) {
      const eq = C.EQUIPOS[j.lado];
      const esLocal = !op.locales || op.locales.includes(j.lado);
      const perdido = !j.activo && esLocal && op.avisos;
      const ctx = this.ctx;
      ctx.globalAlpha = perdido ? 0.45 : 1;
      this.sombra(j.x, j.y, j.r);
      const g = 1 + 0.25 * Math.sin(this.golpes[j.lado] * Math.PI);
      const borde = Math.max(1.2, this.eC * 1.1);
      this.cilindro(j.x, j.y, j.r, 0, ALTO_MAZO, rgba(eq.oscuro, 1), eq.oscuro, eq.color, borde);
      this.neon(this.circulo(j.x, j.y, j.r * 0.66, 20, ALTO_MAZO + 0.02), rgba(eq.color, 0.6), Math.max(0.8, this.eC * 0.35), true);
      this.cilindro(j.x, j.y, j.r * 0.42 * g, ALTO_MAZO, ALTO_MAZO + ALTO_PERILLA * g, rgba(eq.color, 0.75), eq.color);
      const brillo = this.P(j.x - j.r * 0.12, ALTO_MAZO + ALTO_PERILLA * g + 0.05, j.y - j.r * 0.14);
      if (brillo) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(brillo.x, brillo.y, Math.max(1.5, j.r * 0.13 * brillo.e), 0, Math.PI * 2);
        ctx.fill();
      }
      if (perdido) {
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -performance.now() / 60;
        this.neon(this.circulo(j.x, j.y, j.r + 2.2, 28, 0.05), '#ffd23f', Math.max(1, this.eC * 0.5), true);
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }

    disco(b, partido) {
      const color = this.fuego ? this.fuego.color : '#f4ff5a';
      this.sombra(b.x, b.y, b.r);
      this.cilindro(b.x, b.y, b.r, 0, ALTO_DISCO, '#0f0c36', '#1b1650', color, Math.max(1.2, this.eC * 0.9));
      // marca que gira con el disco
      this.neon(this.circulo(b.x, b.y, b.r * 0.42, 10, ALTO_DISCO + 0.02, b.giro, b.giro + Math.PI * 1.2), rgba(color, 0.85), Math.max(0.8, this.eC * 0.35));
      if (partido.estado === 'cuenta') {
        const p = 1 + 0.25 * Math.sin(performance.now() / 120);
        this.neon(this.circulo(b.x, b.y, b.r * 1.9 * p, 28, 0.05), 'rgba(244,255,90,0.85)', Math.max(1, this.eC * 0.4), true);
      }
    }

    dibujarParticulas() {
      const ctx = this.ctx;
      for (const p of this.particulas) {
        const q = this.P(p.x, p.h, p.z);
        if (!q) continue;
        const a = Math.min(1, p.vida / (p.max * 0.5));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const t = Math.max(1.5, p.tam * q.e);
        if (p.tipo === 'confeti') ctx.fillRect(q.x - t / 2, q.y - t / 4, t, t / 2);
        else {
          ctx.beginPath();
          ctx.arc(q.x, q.y, t * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- textos en pantalla, pegados a la mesa ---------- */
    dibujarEtiquetas(partido, op) {
      const ctx = this.ctx;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      partido.jugadores.forEach((j) => {
        const q = this.P(j.x, ALTO_MAZO + ALTO_PERILLA + 3, j.y);
        if (!q) return;
        const texto = op.etiquetas ? op.etiquetas[j.lado] : String(j.lado + 1);
        if (texto) {
          ctx.font = '700 14px "Rajdhani", system-ui, sans-serif';
          const ancho = ctx.measureText(texto).width + 12;
          ctx.fillStyle = 'rgba(12,9,46,0.85)';
          ctx.strokeStyle = C.EQUIPOS[j.lado].color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(q.x - ancho / 2, q.y - 20, ancho, 18, 4);
          else ctx.rect(q.x - ancho / 2, q.y - 20, ancho, 18);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(texto, q.x, q.y - 10);
        }
        const esLocal = !op.locales || op.locales.includes(j.lado);
        if (!j.activo && esLocal && op.avisos) {
          ctx.font = '700 17px "Rajdhani", system-ui, sans-serif';
          const msg = '¿Y tu mano?';
          const ancho = ctx.measureText(msg).width + 16;
          ctx.fillStyle = 'rgba(10,14,30,0.85)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(q.x - ancho / 2, q.y - 52, ancho, 28, 14);
          else ctx.rect(q.x - ancho / 2, q.y - 52, ancho, 28);
          ctx.fill();
          ctx.fillStyle = '#ffd23f';
          ctx.fillText(msg, q.x, q.y - 37);
        }
      });
    }

    dibujarTextos() {
      const ctx = this.ctx;
      for (const t of this.textos) {
        const q = this.P(t.fx, 8, t.fy);
        if (!q) continue;
        const avance = 1 - t.vida / t.max;
        const a = Math.min(1, t.vida / 0.35);
        const tam = Math.max(20, q.e * 6) * (avance < 0.15 ? 0.6 + avance * 2.7 : 1);
        ctx.globalAlpha = a;
        ctx.font = `800 ${tam}px "Rajdhani", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(8,10,24,0.85)';
        ctx.strokeText(t.texto, q.x, q.y - avance * 40);
        ctx.fillStyle = t.color || '#ffd23f';
        ctx.fillText(t.texto, q.x, q.y - avance * 40);
      }
      ctx.globalAlpha = 1;
    }
  }

  // la mano y el anillo de los gestos se dibujan igual que en la pantalla normal
  Render3D.prototype.dibujarMano = FG.RenderPantalla.prototype.dibujarMano;
  Render3D.prototype.dibujarGesto = FG.RenderPantalla.prototype.dibujarGesto;

  FG.Render3D = Render3D;
})();
