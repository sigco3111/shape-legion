// Canvas 2D renderer: sprite atlas, static background, batched drawImage, additive glow/bloom, pooled FX.
import { UNITS, NT, TEAMS, ARENA, ATK } from './units.js?v=2026111107';
import { EV } from './sim.js?v=2026111107';
import { TC, TCOLS, TROWS, K } from './terrain.js?v=2026111107';

const TAU = Math.PI * 2, DIRS = 16, CELLW = 28; // atlas cell size in world units
const MAXP = 7000, MAXR = 300;

export class Camera {
  constructor() { this.x = ARENA.w / 2; this.y = ARENA.h / 2; this.zoom = 1; this.minZoom = 0.3; this.maxZoom = 6; }
  fit(vw, vh) {
    this.zoom = Math.min(vw / (ARENA.w + 60), vh / (ARENA.h + 60));
    this.minZoom = Math.min(this.zoom * 0.8, 0.5); this.x = ARENA.w / 2; this.y = ARENA.h / 2;
  }
  clamp() {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.x = Math.max(-100, Math.min(ARENA.w + 100, this.x)); this.y = Math.max(-100, Math.min(ARENA.h + 100, this.y));
  }
  zoomAt(factor, sx, sy, vw, vh) { // keep world point under (sx,sy) fixed
    const wx = this.x + (sx - vw / 2) / this.zoom, wy = this.y + (sy - vh / 2) / this.zoom;
    this.zoom *= factor; this.clamp();
    this.x = wx - (sx - vw / 2) / this.zoom; this.y = wy - (sy - vh / 2) / this.zoom; this.clamp();
  }
  panBy(dxPx, dyPx) { this.x -= dxPx / this.zoom; this.y -= dyPx / this.zoom; this.clamp(); }
}

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

function shapePath(c, shape, r, ang) {
  c.beginPath();
  if (shape === 'circle') c.arc(0, 0, r, 0, TAU);
  else if (shape === 'square') { const h = r * 0.9; c.save(); c.rotate(ang); c.roundRect ? c.roundRect(-h, -h, 2 * h, 2 * h, r * 0.22) : c.rect(-h, -h, 2 * h, 2 * h); c.restore(); }
  else {
    let pts;
    if (shape === 'triangle') pts = [[1.3 * r, 0], [-0.75 * r, 0.95 * r], [-0.75 * r, -0.95 * r]];
    else if (shape === 'diamond') pts = [[1.5 * r, 0], [0, 0.78 * r], [-1.0 * r, 0], [0, -0.78 * r]];
    else { pts = []; for (let k = 0; k < 5; k++) { const a = k * TAU / 5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    pts.forEach(([px, py], k) => { const x = px * ca - py * sa, y = px * sa + py * ca; k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.closePath();
  }
}

// One sprite: soft glow + baked shadow + gradient fill + team-specific outline (solid = blue, dashed + dot = red).
function paintSprite(c, S, type, team, ang, flash) {
  const U = UNITS[type], tm = TEAMS[team], r = U.r;
  c.save(); c.scale(S, S);
  const gr = Math.min(r * 2.2, CELLW / 2 - 0.3); // keep the halo inside its atlas cell
  let g = c.createRadialGradient(0, 0, r * 0.4, 0, 0, gr);
  g.addColorStop(0, rgba(tm.rgb, flash ? 0.7 : 0.3)); g.addColorStop(1, rgba(tm.rgb, 0));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, gr, 0, TAU); c.fill();
  c.save();
  if (!flash) { c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 3 * S; c.shadowOffsetY = 1.6 * S; c.shadowOffsetX = 0.6 * S; }
  shapePath(c, U.shape, r, ang);
  if (flash) c.fillStyle = '#fff';
  else { g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.3); g.addColorStop(0, tm.light); g.addColorStop(0.45, tm.base); g.addColorStop(1, tm.dark); c.fillStyle = g; }
  c.fill(); c.restore();
  c.lineJoin = 'round';
  if (!flash) {
    shapePath(c, U.shape, r, ang);
    c.lineWidth = team === 0 ? 0.9 : 1.05; c.strokeStyle = team === 0 ? 'rgba(235,247,255,0.95)' : 'rgba(255,225,228,0.95)';
    if (team === 1) c.setLineDash([2.1, 1.3]);
    c.stroke(); c.setLineDash([]);
    // type details
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.6;
    if (type === 1) { c.beginPath(); c.save(); c.rotate(ang); c.roundRect ? c.roundRect(-r * 0.5, -r * 0.5, r, r, 0.8) : c.rect(-r * 0.5, -r * 0.5, r, r); c.restore(); c.stroke(); }
    if (type === 4) { c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.stroke(); }
    if (team === 1) { c.fillStyle = 'rgba(40,0,10,0.75)'; c.beginPath(); c.arc(0, 0, r * 0.22, 0, TAU); c.fill(); }
  }
  c.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.cam = new Camera(); this.dpr = 1; this.vw = 1; this.vh = 1;
    this.atlasScale = 0; this.atlas = null; this.bgScale = 0; this.bg = null;
    this.decal = mk(ARENA.w / 2, ARENA.h / 2); this.dctx = this.decal.getContext('2d');
    this.bloom = mk(8, 8); this.bctx = this.bloom.getContext('2d');
    this.fx = 2; this.bloomOn = true; this.shakeOn = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.shake = 0; this.shx = 0; this.shy = 0;
    this.terr = null; this.waterPath = null; this.shim = null; this.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // pooled particles
    this.pn = 0; this.pX = new Float32Array(MAXP); this.pY = new Float32Array(MAXP); this.pVX = new Float32Array(MAXP); this.pVY = new Float32Array(MAXP);
    this.pL = new Float32Array(MAXP); this.pM = new Float32Array(MAXP); this.pS = new Float32Array(MAXP); this.pC = new Uint8Array(MAXP);
    // splash rings
    this.rn = 0; this.rX = new Float32Array(MAXR); this.rY = new Float32Array(MAXR); this.rA = new Float32Array(MAXR); this.rM = new Float32Array(MAXR); this.rR = new Float32Array(MAXR); this.rC = new Uint8Array(MAXR);
    this.dots = TEAMS.map((tm) => { const c = mk(32, 32), x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.25, rgba(tm.rgb, 0.9)); g.addColorStop(1, rgba(tm.rgb, 0)); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c; });
    this.stats = { drawn: 0, particles: 0, ms: 0 };
    this.audioCounts = { melee: 0, shot: 0, boom: 0, death: 0, arrow: 0, cat: 0, wall: 0 };
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = cssW; this.vh = cssH;
    this.canvas.width = Math.max(1, Math.floor(cssW * this.dpr)); this.canvas.height = Math.max(1, Math.floor(cssH * this.dpr));
    this.bloom.width = Math.max(1, Math.ceil(this.canvas.width / 4)); this.bloom.height = Math.max(1, Math.ceil(this.canvas.height / 4));
  }

  // Terrain (null = none): pre-rendered into the static background; only the water shimmer overlay is animated.
  setTerrain(t) {
    if (t === this.terr) return;
    this.terr = t; this.bgScale = 0; this.waterPath = null;
    if (t && t.hasWater) {
      const p = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
      for (let i = 0; i < t.kind.length; i++) if (t.kind[i] === K.WATER) { const x = (i % TCOLS) * TC, y = ((i / TCOLS) | 0) * TC; p.rect(x, y, TC, TC); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + TC); y1 = Math.max(y1, y + TC); }
      this.waterPath = p; this.waterBox = [x0, y0, x1, y1];
      if (!this.shim) this.shim = makeShimmerTile();
    }
  }

  clearFx() { this.pn = 0; this.rn = 0; this.shake = 0; this.dctx.clearRect(0, 0, this.decal.width, this.decal.height); }

  // ---- static resources, rebuilt only when the zoom bucket changes ----
  ensureResources() {
    const need = this.cam.zoom * this.dpr;
    const as = Math.max(1, Math.min(4, Math.ceil(need * 1.15)));
    if (as !== this.atlasScale) this.buildAtlas(as);
    const bs = need > 1.1 ? 2 : 1;
    if (bs !== this.bgScale) this.buildBackground(bs);
  }

  buildAtlas(S) {
    const P = Math.ceil(CELLW * S), cols = DIRS, rows = 2 * 2 * NT; // variant x team x type
    const a = mk(P * cols, P * rows), c = a.getContext('2d');
    for (let v = 0; v < 2; v++) for (let tm = 0; tm < 2; tm++) for (let ty = 0; ty < NT; ty++) {
      const row = (v * 2 + tm) * NT + ty, nd = ty === 0 ? 1 : DIRS;
      for (let d = 0; d < nd; d++) {
        c.save(); c.translate(d * P + P / 2, row * P + P / 2);
        paintSprite(c, S, ty, tm, d * TAU / DIRS, v === 1);
        c.restore();
      }
    }
    this.atlas = a; this.atlasScale = S; this.P = P;
  }

  buildBackground(S) {
    const W = ARENA.w, H = ARENA.h, b = mk(W * S, H * S), c = b.getContext('2d');
    c.scale(S, S);
    let g = c.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#121c33'); g.addColorStop(1, '#070b16'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(0, 0, W / 2, 0); g.addColorStop(0, rgba(TEAMS[0].rgb, 0.10)); g.addColorStop(1, rgba(TEAMS[0].rgb, 0)); c.fillStyle = g; c.fillRect(0, 0, W / 2, H);
    g = c.createLinearGradient(W, 0, W / 2, 0); g.addColorStop(0, rgba(TEAMS[1].rgb, 0.10)); g.addColorStop(1, rgba(TEAMS[1].rgb, 0)); c.fillStyle = g; c.fillRect(W / 2, 0, W / 2, H);
    // speckle texture (seeded locally so it never changes between rebuilds)
    let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(160,190,255,${0.02 + rnd() * 0.04})`; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    // grid
    c.lineWidth = 1 / S;
    for (let pass = 0; pass < 2; pass++) {
      const step = pass ? 100 : 25; c.strokeStyle = pass ? 'rgba(120,160,255,0.10)' : 'rgba(120,160,255,0.045)'; c.beginPath();
      for (let x = 0; x <= W; x += step) { c.moveTo(x, 0); c.lineTo(x, H); }
      for (let y = 0; y <= H; y += step) { c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke();
    }
    c.setLineDash([10, 8]); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
    if (this.terr) paintTerrain(c, this.terr, S, this.shim || (this.shim = makeShimmerTile()));
    // vignette + border
    g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(140,180,255,0.35)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
    c.strokeStyle = 'rgba(140,180,255,0.9)'; c.lineWidth = 3; c.beginPath();
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) { c.moveTo(x + dx * 30, y + dy * 1.5); c.lineTo(x + dx * 1.5, y + dy * 1.5); c.lineTo(x + dx * 1.5, y + dy * 30); }
    c.stroke();
    this.bg = b; this.bgScale = S;
  }

  // ---- FX spawning from sim events ----
  spawnP(x, y, vx, vy, life, size, team) {
    if (this.pn >= MAXP) return;
    const k = this.pn++;
    this.pX[k] = x; this.pY[k] = y; this.pVX[k] = vx; this.pVY[k] = vy; this.pL[k] = this.pM[k] = life; this.pS[k] = size; this.pC[k] = team;
  }
  spawnRing(x, y, rad, team, life = 0.45) {
    if (this.rn >= MAXR) return;
    const k = this.rn++; this.rX[k] = x; this.rY[k] = y; this.rA[k] = 0; this.rM[k] = life; this.rR[k] = rad; this.rC[k] = team;
  }
  // Commander skill effect (rings + flash sparks). kind: 0 rally (ring around the point), 1 volley / 2 charge (rings + sparks at sampled units).
  skillFx(kind, pts, n, cx, cy, rad) {
    if (kind === 0) {
      for (let i = 0; i < 3; i++) this.spawnRing(cx, cy, rad * (0.85 - i * 0.25), 0, 0.5 + i * 0.2);
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; this.spawnP(cx + Math.cos(a) * rad * 0.8, cy + Math.sin(a) * rad * 0.8, -Math.cos(a) * 140, -Math.sin(a) * 140, 0.6, 3, 0); }
    }
    for (let k = 0; k < n; k++) {
      const x = pts[k * 2], y = pts[k * 2 + 1];
      this.spawnRing(x, y, kind === 1 ? 20 : 16, 0, 0.5);
      for (let i = 0; i < 4; i++) { const a = kind === 1 ? -Math.PI / 2 + (Math.random() - 0.5) : Math.random() * TAU; this.spawnP(x, y, Math.cos(a) * 90, Math.sin(a) * 90, 0.5, 3.4, 0); }
    }
    if (this.shakeOn) this.shake = Math.min(5, this.shake + 2);
  }

  consume(sim) {
    const n = sim.evN, fx = this.fx, load = this.pn / MAXP, ac = this.audioCounts;
    ac.melee = ac.shot = ac.boom = ac.death = ac.arrow = ac.cat = ac.wall = 0;
    const dctx = this.dctx;
    for (let k = 0; k < n; k++) {
      const x = sim.evX[k], y = sim.evY[k], tm = sim.evA[k];
      switch (sim.evKind[k]) {
        case EV.DEATH: {
          ac.death++;
          const np = load > 0.7 ? 1 : [2, 4, 7][fx];
          for (let i = 0; i < np; i++) { const a = Math.random() * TAU, sp = 25 + Math.random() * 90; this.spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, 1.2 + Math.random() * 1.8, tm); }
          dctx.fillStyle = rgba(TEAMS[tm].rgb, 0.12); dctx.beginPath(); dctx.arc(x * 0.5, y * 0.5, 1.2 + Math.random() * 0.8, 0, TAU); dctx.fill();
          dctx.fillStyle = 'rgba(0,0,0,0.3)'; dctx.fillRect(x * 0.5 - 0.5, y * 0.5 - 0.5, 1, 1);
          break;
        }
        case EV.HIT: {
          if (sim.evB[k] === 2) ac.arrow++; else ac.melee++;
          if (fx > 0 && load < 0.8) { const a = Math.random() * TAU; this.spawnP(x, y, Math.cos(a) * 40, Math.sin(a) * 40, 0.18, sim.evB[k] === 1 ? 2.4 : 1.3, tm); }
          break;
        }
        case EV.SPLASH: {
          ac.boom++; this.spawnRing(x, y, sim.evB[k], tm);
          const np = [4, 10, 18][fx];
          for (let i = 0; i < np; i++) { const a = Math.random() * TAU, sp = 20 + Math.random() * 80; this.spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + Math.random() * 0.4, 1.5 + Math.random() * 2, tm); }
          if (this.shakeOn) this.shake = Math.min(5, this.shake + 1.2);
          break;
        }
        case EV.SHOT: if (sim.evB[k] === 1) ac.cat++; else ac.shot++; break;
        case EV.WALL: { // arrow stopped by a wall: short spark fan (always a few, even on low fx)
          ac.wall++;
          if (load < 0.9) for (let i = 0; i < [2, 4, 6][fx]; i++) { const a = Math.random() * TAU, sp = 50 + Math.random() * 110; this.spawnP(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.18 + Math.random() * 0.2, 1.4 + Math.random() * 1.6, tm); }
          break;
        }
      }
    }
    sim.evN = 0;
  }

  updateFx(dt) {
    for (let k = 0; k < this.pn; k++) {
      this.pL[k] -= dt;
      if (this.pL[k] <= 0) { const l = --this.pn; this.pX[k] = this.pX[l]; this.pY[k] = this.pY[l]; this.pVX[k] = this.pVX[l]; this.pVY[k] = this.pVY[l]; this.pL[k] = this.pL[l]; this.pM[k] = this.pM[l]; this.pS[k] = this.pS[l]; this.pC[k] = this.pC[l]; k--; continue; }
      this.pX[k] += this.pVX[k] * dt; this.pY[k] += this.pVY[k] * dt; const d = Math.exp(-3 * dt); this.pVX[k] *= d; this.pVY[k] *= d;
    }
    for (let k = 0; k < this.rn; k++) {
      this.rA[k] += dt;
      if (this.rA[k] >= this.rM[k]) { const l = --this.rn; this.rX[k] = this.rX[l]; this.rY[k] = this.rY[l]; this.rA[k] = this.rA[l]; this.rM[k] = this.rM[l]; this.rR[k] = this.rR[l]; this.rC[k] = this.rC[l]; k--; }
    }
    this.shake *= Math.exp(-7 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shx = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0; this.shy = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
  }

  // ---- main draw ----
  draw(sim, alpha) {
    const t0 = performance.now();
    this.ensureResources();
    const c = this.ctx, cam = this.cam, dpr = this.dpr, cw = this.canvas.width, ch = this.canvas.height;
    const sc = cam.zoom * dpr, ox = cw / 2 - cam.x * sc + this.shx * dpr, oy = ch / 2 - cam.y * sc + this.shy * dpr;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#05080f'; c.fillRect(0, 0, cw, ch);
    c.setTransform(sc, 0, 0, sc, ox, oy);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.bg, 0, 0, ARENA.w, ARENA.h);
    c.drawImage(this.decal, 0, 0, ARENA.w, ARENA.h);
    if (this.overlay) this.overlay(c); // deploy-phase zones/grid/brush (world units)
    if (this.waterPath) this.drawShimmer(c);
    c.imageSmoothingQuality = 'low';
    // visible world rect
    const m = 16, vx0 = -ox / sc - m, vy0 = -oy / sc - m, vx1 = (cw - ox) / sc + m, vy1 = (ch - oy) / sc + m;
    const atlas = this.atlas, P = this.P, half = CELLW / 2, X = sim.x, Y = sim.y, PX = sim.px, PY = sim.py, ty = sim.type, tm = sim.team, fl = sim.flash, an = sim.ang, ord = sim.ord;
    let drawn = 0;
    const doBloom = this.bloomOn && this.fx > 0;
    let bc = null;
    if (doBloom) { bc = this.bctx; bc.setTransform(1, 0, 0, 1, 0, 0); bc.globalCompositeOperation = 'source-over'; bc.clearRect(0, 0, this.bloom.width, this.bloom.height); bc.globalCompositeOperation = 'lighter'; const bs = sc / 4; bc.setTransform(bs, 0, 0, bs, ox / 4, oy / 4); }
    for (let o = 0; o < sim.nOrd; o++) {
      const i = ord[o];
      if (!sim.alive[i]) continue;
      const x = PX[i] + (X[i] - PX[i]) * alpha, y = PY[i] + (Y[i] - PY[i]) * alpha;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const t = ty[i], team = tm[i];
      let f = 0;
      if (t !== 0) { let a = an[i]; if (a < 0) a += TAU; f = ((a * DIRS / TAU + 0.5) | 0) & (DIRS - 1); }
      const row = ((fl[i] > 0 ? 1 : 0) * 2 + team) * NT + t;
      c.drawImage(atlas, f * P, row * P, P, P, x - half, y - half, CELLW, CELLW);
      if (doBloom) { const g = UNITS[t].r * 2.2; bc.drawImage(this.dots[team], x - g, y - g, g * 2, g * 2); }
      drawn++;
    }
    // projectiles
    c.globalCompositeOperation = 'lighter';
    for (let team = 0; team < 2; team++) {
      const col = TEAMS[team].rgb;
      c.beginPath();
      for (let p = 0; p < sim.pHigh; p++) {
        if (!sim.pAlive[p] || sim.pKind[p] !== ATK.ARROW || sim.pTeam[p] !== team) continue;
        const x = sim.pPX[p] + (sim.pX[p] - sim.pPX[p]) * alpha, y = sim.pPY[p] + (sim.pY[p] - sim.pPY[p]) * alpha;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const l = 13 / (Math.hypot(sim.pVX[p], sim.pVY[p]) + 1e-6);
        c.moveTo(x - sim.pVX[p] * l, y - sim.pVY[p] * l); c.lineTo(x, y);
      }
      c.lineCap = 'round';
      c.strokeStyle = rgba(col, 0.35); c.lineWidth = 3; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.1; c.stroke();
    }
    for (let p = 0; p < sim.pHigh; p++) { // boulders: ground shadow, arc height, trail
      if (!sim.pAlive[p] || sim.pKind[p] !== ATK.BOULDER) continue;
      const u = Math.min(1, sim.pT[p] / sim.pDur[p]), h = 4 * 38 * u * (1 - u);
      const x = sim.pPX[p] + (sim.pX[p] - sim.pPX[p]) * alpha, y = sim.pPY[p] + (sim.pY[p] - sim.pPY[p]) * alpha;
      const col = TEAMS[sim.pTeam[p]].rgb;
      c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y, 4, 2, 0, 0, TAU); c.fill();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(x, y - h, 0, x, y - h, 6.5); g.addColorStop(0, '#fff'); g.addColorStop(0.3, rgba(col, 0.8)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - 6.5, y - h - 6.5, 13, 13);
      c.strokeStyle = rgba(col, 0.4); c.lineWidth = 2; c.beginPath(); c.moveTo(x - sim.pVX[p] * 0.05, y - h + 3 + 0); c.lineTo(x, y - h); c.stroke();
    }
    // particles (additive)
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < this.pn; k++) {
      const x = this.pX[k], y = this.pY[k];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const lf = this.pL[k] / this.pM[k], s = this.pS[k] * (0.5 + lf) * 1.6;
      c.globalAlpha = Math.min(1, lf * 1.4);
      c.drawImage(this.dots[this.pC[k]], x - s, y - s, s * 2, s * 2);
    }
    c.globalAlpha = 1;
    // splash rings
    c.lineWidth = 1.6;
    for (let k = 0; k < this.rn; k++) {
      const u = this.rA[k] / this.rM[k], r = this.rR[k] * (0.3 + 0.9 * (1 - (1 - u) * (1 - u)));
      c.strokeStyle = rgba(TEAMS[this.rC[k]].rgb, 0.8 * (1 - u)); c.beginPath(); c.arc(this.rX[k], this.rY[k], r, 0, TAU); c.stroke();
      c.fillStyle = rgba(TEAMS[this.rC[k]].rgb, 0.18 * (1 - u)); c.fill();
    }
    // bloom composite
    if (doBloom) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low';
      c.globalAlpha = 0.3; c.drawImage(this.bloom, 0, 0, cw, ch); c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'source-over';
    this.stats.drawn = drawn; this.stats.particles = this.pn; this.stats.ms = performance.now() - t0;
  }

  // Slow animated water highlights: a pre-rendered tile scrolled under a clip of the water cells (the only per-frame terrain cost).
  drawShimmer(c) {
    const tm = this.reduced ? 0 : performance.now() / 1000, [x0, y0, x1, y1] = this.waterBox, T = 128, ox = (tm * 7) % T, oy = (tm * 3) % T;
    c.save(); c.clip(this.waterPath); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55 + 0.25 * Math.sin(tm * 0.8);
    for (let y = Math.floor((y0 - oy) / T) * T + oy; y < y1; y += T) for (let x = Math.floor((x0 - ox) / T) * T + ox; x < x1; x += T) c.drawImage(this.shim, x, y, T, T);
    c.restore();
  }
}

// ---- terrain painting (static background) ----
function makeShimmerTile() { // seamless 128x128 tile of faint wave streaks
  const t = mk(128, 128), c = t.getContext('2d'); let s = 777; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  c.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const y = rnd() * 128, x = rnd() * 128, len = 14 + rnd() * 26, a = 0.10 + rnd() * 0.16;
    for (const dy of [-128, 0, 128]) for (const dx of [-128, 0, 128]) {
      c.strokeStyle = `rgba(170,220,255,${a})`; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x + dx, y + dy); c.quadraticCurveTo(x + dx + len / 2, y + dy - 3, x + dx + len, y + dy); c.stroke();
    }
  }
  return t;
}
function paintTerrain(c, t, S, shim) {
  const { kind } = t, at = (cx, cy) => (cx < 0 || cy < 0 || cx >= TCOLS || cy >= TROWS ? -1 : kind[cy * TCOLS + cx]);
  const cells = (k, f) => { for (let i = 0; i < kind.length; i++) if (kind[i] === k) f((i % TCOLS) * TC, ((i / TCOLS) | 0) * TC, i % TCOLS, (i / TCOLS) | 0); };
  // hills: raised plateaus with soft contour rings
  cells(K.HILL, (x, y, cx, cy) => { c.fillStyle = 'rgba(110,150,90,0.20)'; c.fillRect(x, y, TC, TC); });
  cells(K.HILL, (x, y, cx, cy) => {
    c.lineWidth = 2.2; c.strokeStyle = 'rgba(200,235,160,0.55)'; c.beginPath();
    if (at(cx, cy - 1) !== K.HILL) { c.moveTo(x, y); c.lineTo(x + TC, y); } if (at(cx, cy + 1) !== K.HILL) { c.moveTo(x, y + TC); c.lineTo(x + TC, y + TC); }
    if (at(cx - 1, cy) !== K.HILL) { c.moveTo(x, y); c.lineTo(x, y + TC); } if (at(cx + 1, cy) !== K.HILL) { c.moveTo(x + TC, y); c.lineTo(x + TC, y + TC); }
    c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath();
    if (at(cx, cy + 1) !== K.HILL) { c.moveTo(x, y + TC + 3); c.lineTo(x + TC, y + TC + 3); } if (at(cx + 1, cy) !== K.HILL) { c.moveTo(x + TC + 3, y); c.lineTo(x + TC + 3, y + TC); }
    c.stroke();
  });
  // water (also under bridges)
  const wet = (k) => k === K.WATER || k === K.BRIDGE;
  cells(K.WATER, (x, y) => { const g = c.createLinearGradient(x, y, x + TC, y + TC); g.addColorStop(0, '#15477a'); g.addColorStop(1, '#0d2f58'); c.fillStyle = g; c.fillRect(x, y, TC, TC); });
  cells(K.BRIDGE, (x, y) => { c.fillStyle = '#0f3a66'; c.fillRect(x, y, TC, TC); });
  c.save(); c.globalAlpha = 0.6; for (let y = 0; y < ARENA.h; y += 128) for (let x = 0; x < ARENA.w; x += 128) { c.save(); c.beginPath(); cells(K.WATER, (px, py) => { if (px < x + 128 && px + TC > x && py < y + 128 && py + TC > y) c.rect(px, py, TC, TC); }); c.clip(); c.drawImage(shim, x, y, 128, 128); c.restore(); } c.restore();
  cells(K.WATER, (x, y, cx, cy) => { // shore: light foam line on the water edge, muddy bank outside
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n = at(cx + dx, cy + dy); if (n === K.WATER || n === K.BRIDGE || n === -1) continue;
      const hx = dx === 0, ex = dx > 0 ? x + TC : x, ey = dy > 0 ? y + TC : y;
      c.fillStyle = 'rgba(200,235,255,0.35)'; hx ? c.fillRect(x, dy > 0 ? ey - 3 : ey, TC, 3) : c.fillRect(dx > 0 ? ex - 3 : ex, y, 3, TC);
      c.fillStyle = 'rgba(105,88,60,0.40)'; hx ? c.fillRect(x, dy > 0 ? ey : ey - 5, TC, 5) : c.fillRect(dx > 0 ? ex : ex - 5, y, 5, TC);
    }
  });
  // bridges: planks across, rails along the open sides, shadow on the water
  cells(K.BRIDGE, (x, y, cx, cy) => {
    if (at(cx, cy + 1) === K.WATER) { c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(x, y + TC, TC, 6); }
    c.fillStyle = '#8c633a'; c.fillRect(x, y, TC, TC);
    c.fillStyle = '#6d4a28'; for (let px = 0; px < TC; px += 6.25) c.fillRect(x + px, y, 1.4, TC);
    c.fillStyle = 'rgba(255,220,160,0.18)'; for (let px = 0; px < TC; px += 6.25) c.fillRect(x + px + 1.6, y, 1, TC);
    if (at(cx, cy - 1) !== K.BRIDGE) { c.fillStyle = '#3f2a18'; c.fillRect(x, y, TC, 4); c.fillStyle = 'rgba(255,220,160,0.3)'; c.fillRect(x, y, TC, 1.3); }
    if (at(cx, cy + 1) !== K.BRIDGE) { c.fillStyle = '#3f2a18'; c.fillRect(x, y + TC - 4, TC, 4); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + TC - 1.3, TC, 1.3); }
  });
  // walls: soft drop shadow pass, then stone blocks
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 9 * S; c.shadowOffsetX = 3 * S; c.shadowOffsetY = 5 * S; c.fillStyle = '#4b505a';
  cells(K.WALL, (x, y) => c.fillRect(x, y, TC, TC)); c.restore();
  cells(K.WALL, (x, y, cx, cy) => {
    const g = c.createLinearGradient(x, y, x + TC, y + TC); g.addColorStop(0, '#a4acb9'); g.addColorStop(1, '#5f6775');
    c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(x + 0.7, y + 0.7, TC - 1.4, TC - 1.4, 3) : c.rect(x + 0.7, y + 0.7, TC - 1.4, TC - 1.4); c.fill();
    c.strokeStyle = 'rgba(30,34,44,0.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 1, y + TC / 2); c.lineTo(x + TC - 1, y + TC / 2);
    const o = (cx + cy) % 2 ? 7 : 16; c.moveTo(x + o, y + 1); c.lineTo(x + o, y + TC / 2); c.moveTo(x + TC - o, y + TC / 2); c.lineTo(x + TC - o, y + TC - 1); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x + 2, y + 1.5, TC - 4, 1.4); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 2, y + TC - 2.8, TC - 4, 1.4);
  });
}
