/* ============================================================
   Render 3D del futbolito (Canvas 2D + perspectiva propia).
   No usa WebGL: proyecta cada punto 3D con la cámara activa
   (virtual o AR) y dibuja de lo más lejano a lo más cercano.
   Así el mismo dibujo sirve sobre la mesa (AR.js) y en el
   modo práctica, y se ve igual en cualquier celular.

   Coordenadas: x = largo (0..160), z = ancho (0..100), h = altura.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});
  const C = FG.config;
  const F = C.CANCHA;
  const W = F.ancho;
  const H = F.alto;
  const Y1 = (H - F.arco) / 2;
  const Y2 = Y1 + F.arco;

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  FG.util.rgba = rgba;

  // silueta de un guayo visto desde arriba (adelante = +x, costado = +y)
  const GUAYO = [
    [4.6, 0], [4.1, 1.5], [2.6, 2.2], [0, 2.3], [-2.4, 2.1], [-3.8, 1.3], [-4.2, 0],
    [-3.8, -1.3], [-2.4, -2.1], [0, -2.3], [2.6, -2.2], [4.1, -1.5]
  ];

  class Render3D {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.virtual = new FG.CamaraVirtual();
      this.cam = this.virtual;
      this.ar = false;
      this.particulas = [];
      this.textos = [];
      this.estela = [];
      this.temblor = 0;
      this.destello = null;
      this.ajustar();
      window.addEventListener('resize', () => this.ajustar());
      window.addEventListener('orientationchange', () => setTimeout(() => this.ajustar(), 250));
    }

    ajustar() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.c.style.width = this.w + 'px';
      this.c.style.height = this.h + 'px';
      this.virtual.ajustar(this.w, this.h);
      this.rotado = this.virtual.vertical;
      document.body.classList.toggle('vertical', this.rotado);
    }

    usarCamara(cam, esAR) {
      this.cam = cam;
      this.ar = !!esAR;
    }

    /* ---------- efectos ---------- */
    efectoPatada(x, y, fuerza, color) {
      const n = Math.min(14, 3 + Math.floor(fuerza / 25));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 15 + Math.random() * fuerza * 0.3;
        this.particulas.push({
          x, z: y, h: 3, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: 10 + Math.random() * 20,
          vida: 0.35 + Math.random() * 0.25, max: 0.6, color, tam: 0.7, tipo: 'chispa'
        });
      }
    }
    efectoGol(equipo) {
      const xArco = equipo === 0 ? W : 0;
      const colores = [C.EQUIPOS[equipo].color, '#ffffff', '#ffd23f'];
      for (let i = 0; i < 110; i++) {
        const a = (equipo === 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.6;
        const v = 20 + Math.random() * 60;
        this.particulas.push({
          x: xArco, z: H / 2 + (Math.random() - 0.5) * F.arco, h: 8,
          vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: 40 + Math.random() * 70,
          vida: 1.6 + Math.random() * 1.2, max: 2.8, color: colores[i % 3],
          tam: 1 + Math.random(), tipo: 'confeti', giro: Math.random() * 6
        });
      }
      this.temblor = 12;
      this.destello = { color: C.EQUIPOS[equipo].color, vida: 0.5 };
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
        if (p.giro != null) p.giro += dt * 9;
      }
      this.particulas = this.particulas.filter((p) => p.vida > 0);
      for (const t of this.textos) t.vida -= dt;
      this.textos = this.textos.filter((t) => t.vida > 0);
      this.temblor *= Math.exp(-6 * dt);
      if (this.destello) {
        this.destello.vida -= dt;
        if (this.destello.vida <= 0) this.destello = null;
      }
    }

    /* ---------- utilidades de dibujo ---------- */
    P(x, h, z) {
      return this.cam.proyectar(x, h, z);
    }
    /** Proyecta una lista de puntos [x,h,z]; null si alguno queda detrás de la cámara. */
    proyectarLista(pts) {
      const out = [];
      for (const q of pts) {
        const r = this.P(q[0], q[1], q[2]);
        if (!r) return null;
        out.push(r);
      }
      return out;
    }
    poligono(pts, relleno, borde, grosor) {
      const pr = this.proyectarLista(pts);
      if (!pr) return;
      const ctx = this.ctx;
      ctx.beginPath();
      pr.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
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
    linea(pts, color, grosor, cerrar) {
      const pr = this.proyectarLista(pts);
      if (!pr) return;
      const ctx = this.ctx;
      ctx.beginPath();
      pr.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      if (cerrar) ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      ctx.stroke();
    }
    circuloSuelo(x, z, r, n = 40, h = 0, a0 = 0, a1 = Math.PI * 2) {
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

    /* ======================= DIBUJO PRINCIPAL ======================= */
    /**
     * op = {
     *   figuras: [bool, bool]   dibujar muñeco (true) o solo guayos (false, la mano real es el cuerpo)
     *   etiquetas: ['1','2'], locales: [lados de este dispositivo], avisos: bool,
     *   manos: [{puntos:[[sx,sy]...], color, lado, numero}], esqueleto: bool
     * }
     */
    dibujar(partido, op = {}) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      if (partido && this.cam.visible()) {
        const tx = (Math.random() - 0.5) * this.temblor;
        const ty = (Math.random() - 0.5) * this.temblor;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, tx * this.dpr, ty * this.dpr);
        const centro = this.P(W / 2, 0, H / 2);
        this.eCentro = centro ? centro.e : 3;
        this.dibujarMesa();
        if (op.rotulos) this.dibujarRotulos(op.rotulos);
        this.dibujarSombras(partido, op);
        this.dibujarObjetos(partido, op);
        this.dibujarParticulas();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.dibujarAvisos(partido, op);
        this.dibujarTextos();
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (op.manos) op.manos.forEach((m) => this.dibujarMano(m, op.esqueleto));
      if (this.destello) {
        ctx.fillStyle = rgba(this.destello.color, Math.max(0, this.destello.vida) * 0.45);
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    /* ---------- mesa: sombra, madera, césped y líneas ---------- */
    dibujarMesa() {
      const m = F.fondoArco + 5;
      // sombra suave debajo del futbolito (lo "pega" a la mesa real)
      this.poligono([[-m - 4, 0, -8], [W + m + 4, 0, -8], [W + m + 4, 0, H + 8], [-m - 4, 0, H + 8]], 'rgba(0,0,0,0.28)');
      this.poligono([[-m, 0, -5], [W + m, 0, -5], [W + m, 0, H + 5], [-m, 0, H + 5]], 'rgba(0,0,0,0.22)');
      // base de madera
      this.poligono([[-m + 2, 0, -3], [W + m - 2, 0, -3], [W + m - 2, 0, H + 3], [-m + 2, 0, H + 3]], '#5a361d');

      // césped a franjas
      const franjas = 10;
      for (let i = 0; i < franjas; i++) {
        const x0 = (i * W) / franjas;
        const x1 = ((i + 1) * W) / franjas;
        this.poligono([[x0, 0, 0], [x1, 0, 0], [x1, 0, H], [x0, 0, H]], i % 2 ? '#2a9d5a' : '#23894d');
      }
      this.poligono([[0, 0, 0], [W / 2, 0, 0], [W / 2, 0, H], [0, 0, H]], rgba(C.EQUIPOS[0].color, 0.08));
      this.poligono([[W / 2, 0, 0], [W, 0, 0], [W, 0, H], [W / 2, 0, H]], rgba(C.EQUIPOS[1].color, 0.08));
      // fondo del arco (césped dentro de la red)
      [0, 1].forEach((lado) => {
        const x0 = lado === 0 ? -F.fondoArco : W;
        this.poligono([[x0, 0, Y1], [x0 + F.fondoArco, 0, Y1], [x0 + F.fondoArco, 0, Y2], [x0, 0, Y2]], '#1f7a45');
      });

      // líneas
      const b = 'rgba(255,255,255,0.92)';
      const g = Math.max(1, this.eCentro * 0.55);
      this.linea([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], b, g, true);
      this.linea([[W / 2, 0, 0], [W / 2, 0, H]], b, g);
      this.linea(this.circuloSuelo(W / 2, H / 2, 13), b, g);
      this.poligono(this.circuloSuelo(W / 2, H / 2, 0.9, 10), b);
      [[0, 1], [W, -1]].forEach(([x, s]) => {
        this.linea([[x, 0, H / 2 - 25], [x + 22 * s, 0, H / 2 - 25], [x + 22 * s, 0, H / 2 + 25], [x, 0, H / 2 + 25]], b, g);
        this.linea([[x, 0, H / 2 - 13], [x + 8 * s, 0, H / 2 - 13], [x + 8 * s, 0, H / 2 + 13], [x, 0, H / 2 + 13]], b, g);
        this.poligono(this.circuloSuelo(x + 15 * s, H / 2, 0.7, 8), b);
        const ang = s > 0 ? 0 : Math.PI;
        this.linea(this.circuloSuelo(x + 15 * s, H / 2, 11, 16, 0, ang - 0.88, ang + 0.88), b, g);
      });
      [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, -Math.PI / 2]].forEach(([x, z, a]) => {
        this.linea(this.circuloSuelo(x, z, 2.5, 8, 0, a, a + Math.PI / 2), b, g);
      });

      // bandas de madera (cajas bajas alrededor de la cancha)
      const e = 2.6;
      const cajas = [
        [-e, W + e, -e, 0],
        [-e, W + e, H, H + e],
        [-e, 0, 0, Y1], [-e, 0, Y2, H],
        [W, W + e, 0, Y1], [W, W + e, Y2, H]
      ];
      const ojo = this.cam.ojo();
      cajas
        .map((c) => ({ c, d: Math.hypot((c[0] + c[1]) / 2 - ojo[0], (c[2] + c[3]) / 2 - ojo[2]) }))
        .sort((a, b2) => b2.d - a.d)
        .forEach(({ c }) => this.caja(c[0], c[1], c[2], c[3], F.banda));
    }

    caja(x0, x1, z0, z1, alto) {
      const caras = [
        { n: [0, 0, -1], p: [[x0, 0, z0], [x1, 0, z0], [x1, alto, z0], [x0, alto, z0]], col: '#7c4a27' },
        { n: [0, 0, 1], p: [[x0, 0, z1], [x1, 0, z1], [x1, alto, z1], [x0, alto, z1]], col: '#8e5a32' },
        { n: [-1, 0, 0], p: [[x0, 0, z0], [x0, 0, z1], [x0, alto, z1], [x0, alto, z0]], col: '#6e4123' },
        { n: [1, 0, 0], p: [[x1, 0, z0], [x1, 0, z1], [x1, alto, z1], [x1, alto, z0]], col: '#6e4123' }
      ];
      for (const cara of caras) {
        const c = cara.p.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
        if (this.mira(cara.n, c)) this.poligono(cara.p, cara.col);
      }
      this.poligono([[x0, alto, z0], [x1, alto, z0], [x1, alto, z1], [x0, alto, z1]], '#c88a52', 'rgba(255,230,190,0.35)', 1);
    }

    /** Letreros pintados en cada mitad (en el lobby: de quién es cada lado). */
    dibujarRotulos(rotulos) {
      const ctx = this.ctx;
      [0, 1].forEach((lado) => {
        const q = this.P(lado === 0 ? W * 0.25 : W * 0.75, 0.2, H / 2);
        if (!q || !rotulos[lado]) return;
        ctx.font = `800 ${Math.max(14, q.e * 7)}px "Baloo 2", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(C.EQUIPOS[lado].color, 0.75);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.strokeText(rotulos[lado], q.x, q.y);
        ctx.fillText(rotulos[lado], q.x, q.y);
      });
    }

    /* ---------- sombras sobre el césped ---------- */
    dibujarSombras(partido, op) {
      const b = partido.balon;
      this.poligono(this.circuloSuelo(b.x + 0.8, b.y + 0.8, b.r * 0.95, 16, 0.05), 'rgba(0,0,0,0.38)');
      partido.jugadores.forEach((j) => {
        const fig = op.figuras && op.figuras[j.lado];
        if (fig) this.poligono(this.circuloSuelo(j.x + 1, j.y + 1, 6.5, 16, 0.05), 'rgba(0,0,0,0.3)');
        if (!j.activo && !fig) return;
        j.pies.forEach((p) => this.poligono(this.circuloSuelo(p.x + 0.6, p.y + 0.6, 3.6, 12, 0.05), 'rgba(0,0,0,0.3)'));
      });
    }

    /* ---------- objetos ordenados por profundidad ---------- */
    dibujarObjetos(partido, op) {
      const items = [];
      const prof = (x, h, z) => {
        const q = this.P(x, h, z);
        return q ? q.p : -1;
      };
      [0, 1].forEach((lado) => {
        const x = lado === 0 ? -F.fondoArco / 2 : W + F.fondoArco / 2;
        items.push({ d: prof(x, F.alturaArco / 2, H / 2), dibujar: () => this.dibujarArco(lado) });
      });
      const b = partido.balon;
      items.push({ d: prof(b.x, b.r, b.y), dibujar: () => this.dibujarBalon(b, partido) });
      partido.jugadores.forEach((j) => {
        const fig = op.figuras && op.figuras[j.lado];
        if (fig) {
          items.push({ d: prof(j.x, 12, j.y), dibujar: () => this.dibujarMuneco(j, op) });
        } else if (j.activo || (op.locales && op.locales.includes(j.lado))) {
          j.pies.forEach((p) => items.push({ d: prof(p.x, 1, p.y), dibujar: () => this.dibujarGuayo(p, j) }));
        }
      });
      items.filter((i) => i.d > 0).sort((a, b2) => b2.d - a.d).forEach((i) => i.dibujar());
    }

    dibujarArco(lado) {
      const x0 = lado === 0 ? 0 : W;
      const xb = lado === 0 ? -F.fondoArco : W + F.fondoArco;
      const hA = F.alturaArco;
      const hB = hA * 0.62;
      const tinte = rgba(C.EQUIPOS[lado].color, 0.16);
      const red = 'rgba(255,255,255,0.38)';
      const gRed = Math.max(0.6, this.eCentro * 0.18);
      // paños de la red: fondo, techo y lados
      this.poligono([[xb, 0, Y1], [xb, 0, Y2], [xb, hB, Y2], [xb, hB, Y1]], tinte);
      this.poligono([[x0, hA, Y1], [x0, hA, Y2], [xb, hB, Y2], [xb, hB, Y1]], tinte);
      this.poligono([[x0, 0, Y1], [xb, 0, Y1], [xb, hB, Y1], [x0, hA, Y1]], tinte);
      this.poligono([[x0, 0, Y2], [xb, 0, Y2], [xb, hB, Y2], [x0, hA, Y2]], tinte);
      // malla
      const pasos = 9;
      for (let i = 0; i <= pasos; i++) {
        const z = Y1 + (F.arco * i) / pasos;
        this.linea([[xb, 0, z], [xb, hB, z], [x0, hA, z]], red, gRed);
      }
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        this.linea([[xb, hB * t, Y1], [xb, hB * t, Y2]], red, gRed);
        this.linea([[x0, hA * t, Y1], [xb, hB * t, Y1]], red, gRed);
        this.linea([[x0, hA * t, Y2], [xb, hB * t, Y2]], red, gRed);
      }
      // palos y travesaño
      const gPalo = Math.max(1.5, this.eCentro * 1.5);
      const ctx = this.ctx;
      ctx.lineCap = 'round';
      this.linea([[x0, 0, Y1], [x0, hA, Y1], [x0, hA, Y2], [x0, 0, Y2]], 'rgba(0,0,0,0.25)', gPalo + 1.5);
      this.linea([[x0, 0, Y1], [x0, hA, Y1], [x0, hA, Y2], [x0, 0, Y2]], '#ffffff', gPalo);
      this.linea([[xb, 0, Y1], [xb, hB, Y1], [xb, hB, Y2], [xb, 0, Y2]], 'rgba(230,236,255,0.8)', gPalo * 0.5);
      ctx.lineCap = 'butt';
    }

    dibujarBalon(b, partido) {
      const c = this.P(b.x, b.r, b.y);
      if (!c) return;
      const ctx = this.ctx;
      const r = b.r * c.e;
      // estela cuando va rápido
      const v = Math.hypot(b.vx, b.vy);
      if (v > 80) this.estela.push([c.x, c.y, r]);
      else this.estela.shift();
      if (this.estela.length > 9) this.estela.shift();
      this.estela.forEach((q, i) => {
        const a = (i + 1) / this.estela.length;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.2})`;
        ctx.beginPath();
        ctx.arc(q[0], q[1], q[2] * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });
      const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.4, r * 0.1, c.x, c.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#e8ecf4');
      g.addColorStop(1, '#a3adc0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      // parches que ruedan en la dirección del movimiento
      const d = this.P(b.x + b.vx * 0.05, b.r, b.y + b.vy * 0.05);
      const ang = d ? Math.atan2(d.y - c.y, d.x - c.x) : 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1b2233';
      const desp = Math.sin(b.giro) * r * 0.35;
      const cx = c.x + Math.cos(ang) * desp;
      const cy = c.y + Math.sin(ang) * desp;
      this.pentagono(cx, cy, r * 0.36, b.giro * 0.3);
      for (let i = 0; i < 5; i++) {
        const a = b.giro * 0.3 + (i * Math.PI * 2) / 5;
        this.pentagono(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, r * 0.3, a);
      }
      ctx.restore();
      ctx.lineWidth = Math.max(0.6, r * 0.08);
      ctx.strokeStyle = 'rgba(20,25,40,0.55)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (partido.estado === 'cuenta') {
        ctx.strokeStyle = 'rgba(255,210,63,0.95)';
        ctx.lineWidth = Math.max(1.5, this.eCentro * 0.6);
        const pulso = 1 + 0.2 * Math.sin(performance.now() / 120);
        this.linea(this.circuloSuelo(b.x, b.y, b.r * 1.9 * pulso, 24, 0.1), 'rgba(255,210,63,0.95)', Math.max(1.5, this.eCentro * 0.6));
      }
    }

    pentagono(x, y, r, rot) {
      const ctx = this.ctx;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = rot + (i * Math.PI * 2) / 5 - Math.PI / 2;
        if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }

    /** Guayo (zapato de fútbol) en la punta de un dedo. */
    dibujarGuayo(p, j) {
      const eq = C.EQUIPOS[j.lado];
      const ctx = this.ctx;
      const ca = Math.cos(p.ang);
      const sa = Math.sin(p.ang);
      const pts = (h, esc = 1) =>
        GUAYO.map(([fx, fy]) => [p.x + (fx * ca - fy * sa) * esc, h, p.y + (fx * sa + fy * ca) * esc]);
      ctx.globalAlpha = !j.activo ? 0.35 : p.enJuego ? 1 : 0.4;
      this.poligono(pts(0, 1.06), '#15181f');                          // suela
      this.poligono(pts(1.8), eq.color, 'rgba(255,255,255,0.7)', Math.max(0.8, this.eCentro * 0.25)); // capellada
      // tres rayas blancas y la punta oscura
      const g = Math.max(0.8, this.eCentro * 0.32);
      [-0.8, 0.3, 1.4].forEach((f) => {
        const a = [p.x + (f * ca - 2.0 * sa), 1.9, p.y + (f * sa + 2.0 * ca)];
        const b = [p.x + ((f + 0.9) * ca + 2.0 * sa), 1.9, p.y + ((f + 0.9) * sa - 2.0 * ca)];
        this.linea([a, b], 'rgba(255,255,255,0.9)', g);
      });
      this.poligono(this.circuloSuelo(p.x + ca * 3.4, p.y + sa * 3.4, 1, 8, 1.9), eq.oscuro);
      ctx.globalAlpha = 1;
    }

    /** Muñeco (máquina, rival en línea o modo práctica): sus pies son los dos colliders. */
    dibujarMuneco(j, op) {
      const eq = C.EQUIPOS[j.lado];
      const ctx = this.ctx;
      const lx = -Math.sin(j.ang);
      const lz = Math.cos(j.ang);
      const fx = Math.cos(j.ang);
      const fz = Math.sin(j.ang);
      const cadera = [j.x, 11, j.y];
      const pc = this.P(...cadera);
      if (!pc) return;
      const e = pc.e;
      ctx.globalAlpha = j.activo ? 1 : 0.5;
      ctx.lineCap = 'round';
      // piernas (de la más lejana a la más cercana)
      const piernas = j.pies.map((p, n) => {
        const s = n === 0 ? -1 : 1;
        const cad = [j.x + lx * s * 2.2, 11, j.y + lz * s * 2.2];
        const rod = [(cad[0] + p.x) / 2 + fx * 1.2, 6, (cad[2] + p.y) / 2 + fz * 1.2];
        const pie = [p.x, 1.6, p.y];
        const q = this.P(...pie);
        return { p, cad, rod, pie, d: q ? q.p : 0 };
      }).sort((a, b) => b.d - a.d);
      piernas.forEach((pi) => {
        this.dibujarGuayo(pi.p, j);
        ctx.globalAlpha = j.activo ? 1 : 0.5;
        this.linea([pi.rod, pi.pie], '#f2c9a0', Math.max(1.5, e * 2.2));       // pierna
        this.linea([[pi.pie[0], 3.4, pi.pie[2]], [pi.rod[0], 5, pi.rod[2]]], eq.color, Math.max(1.5, e * 2.4)); // media
        this.linea([pi.cad, pi.rod], '#20263a', Math.max(2, e * 2.8));        // pantaloneta
      });
      // torso (camiseta) mirando a la cámara
      const hombro = this.P(j.x, 21, j.y);
      const cad2 = this.P(j.x, 10.5, j.y);
      if (hombro && cad2) {
        const anchoT = 9 * e;
        const alto = Math.max(cad2.y - hombro.y, 3 * e);
        const xT = (hombro.x + cad2.x) / 2;
        const g = ctx.createLinearGradient(xT - anchoT / 2, 0, xT + anchoT / 2, 0);
        g.addColorStop(0, eq.oscuro);
        g.addColorStop(0.5, eq.color);
        g.addColorStop(1, eq.oscuro);
        ctx.fillStyle = g;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(xT - anchoT / 2, hombro.y, anchoT, alto, Math.min(anchoT, alto) * 0.3);
        else ctx.rect(xT - anchoT / 2, hombro.y, anchoT, alto);
        ctx.fill();
        // brazos
        const mov = Math.sin(performance.now() / 160 + j.lado) * e * 1.5;
        ctx.strokeStyle = '#f2c9a0';
        ctx.lineWidth = Math.max(1.2, e * 1.6);
        ctx.beginPath();
        ctx.moveTo(xT - anchoT / 2, hombro.y + e * 1.5);
        ctx.lineTo(xT - anchoT / 2 - e * 2, hombro.y + alto * 0.75 + mov);
        ctx.moveTo(xT + anchoT / 2, hombro.y + e * 1.5);
        ctx.lineTo(xT + anchoT / 2 + e * 2, hombro.y + alto * 0.75 - mov);
        ctx.stroke();
        // número
        const etq = (op.etiquetas && op.etiquetas[j.lado]) || String(j.lado + 1);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.max(8, e * (etq.length > 2 ? 4 : 5.5))}px "Baloo 2", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(etq, xT, hombro.y + alto * 0.5);
      }
      // cabeza
      const cab = this.P(j.x, 26.5, j.y);
      if (cab) {
        const rc = 4 * cab.e;
        ctx.fillStyle = '#f2c9a0';
        ctx.beginPath();
        ctx.arc(cab.x, cab.y, rc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b1d14';
        ctx.beginPath();
        ctx.arc(cab.x, cab.y - rc * 0.15, rc * 1.02, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
      }
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    }

    dibujarParticulas() {
      const ctx = this.ctx;
      for (const p of this.particulas) {
        const q = this.P(p.x, p.h, p.z);
        if (!q) continue;
        const a = Math.min(1, p.vida / (p.max * 0.4));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const t = Math.max(1, p.tam * q.e);
        if (p.tipo === 'confeti') {
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(p.giro);
          ctx.fillRect(-t, -t / 2.5, t * 2, t / 1.25);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(q.x, q.y, t * a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    /** Aviso "¿Y tu mano?" sobre los jugadores locales que perdieron la mano. */
    dibujarAvisos(partido, op) {
      if (!op.avisos) return;
      const ctx = this.ctx;
      partido.jugadores.forEach((j) => {
        if (j.activo || !(op.locales || []).includes(j.lado)) return;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -performance.now() / 60;
        this.linea(this.circuloSuelo(j.x, j.y, 11, 28, 0.2), '#ffd23f', 2.5);
        ctx.setLineDash([]);
        const q = this.P(j.x, 18, j.y);
        if (!q) return;
        const msg = '✌️ ¿Y tu mano?';
        ctx.font = '700 15px "Baloo 2", system-ui, sans-serif';
        const ancho = ctx.measureText(msg).width + 18;
        ctx.fillStyle = 'rgba(10,14,30,0.88)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(q.x - ancho / 2, q.y - 15, ancho, 30, 15);
        else ctx.rect(q.x - ancho / 2, q.y - 15, ancho, 30);
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, q.x, q.y + 1);
      });
    }

    dibujarTextos() {
      const ctx = this.ctx;
      for (const t of this.textos) {
        const q = this.P(t.fx, 14, t.fy);
        if (!q) continue;
        const avance = 1 - t.vida / t.max;
        const a = Math.min(1, t.vida / 0.35);
        const tam = Math.max(18, this.eCentro * 7) * (avance < 0.15 ? 0.6 + avance * 2.7 : 1);
        ctx.globalAlpha = a;
        ctx.font = `800 ${tam}px "Baloo 2", system-ui, sans-serif`;
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

    /** Mano real (modo AR): camiseta sobre el dorso y, en el lobby, el esqueleto. */
    dibujarMano(m, esqueleto) {
      const ctx = this.ctx;
      const pts = m.puntos;
      if (esqueleto) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(m.color, 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [a, b] of FG.CONEXIONES_MANO) {
          ctx.moveTo(pts[a][0], pts[a][1]);
          ctx.lineTo(pts[b][0], pts[b][1]);
        }
        ctx.stroke();
        [8, 12].forEach((i) => {
          ctx.strokeStyle = m.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pts[i][0], pts[i][1], 10, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      if (m.lado == null) return;
      // camiseta en el dorso de la mano (entre los nudillos y la muñeca)
      const idx = [0, 5, 9, 13, 17];
      const cx = idx.reduce((s, i) => s + pts[i][0], 0) / idx.length;
      const cy = idx.reduce((s, i) => s + pts[i][1], 0) / idx.length;
      const tam = Math.max(26, Math.min(70, Math.hypot(pts[5][0] - pts[17][0], pts[5][1] - pts[17][1]) * 0.9));
      const eq = C.EQUIPOS[m.lado];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.92;
      const s = tam / 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s);
      ctx.lineTo(-s, -s * 0.7);
      ctx.lineTo(-s * 0.85, -s * 0.25);
      ctx.lineTo(-s * 0.6, -s * 0.35);
      ctx.lineTo(-s * 0.6, s);
      ctx.lineTo(s * 0.6, s);
      ctx.lineTo(s * 0.6, -s * 0.35);
      ctx.lineTo(s * 0.85, -s * 0.25);
      ctx.lineTo(s, -s * 0.7);
      ctx.lineTo(s * 0.45, -s);
      ctx.quadraticCurveTo(0, -s * 0.6, -s * 0.45, -s);
      ctx.closePath();
      ctx.fillStyle = eq.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${tam * 0.5}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.numero || String(m.lado + 1), 0, s * 0.2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  FG.Render3D = Render3D;
})();
