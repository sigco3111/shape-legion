// Deploy phase logic (no DOM): snapped grid painting, budget/population limits, undo, sim filling, canvas overlay.
import { UNITS, NT, ARENA } from './units.js?v=2026111110';
import { GRID, gridX, gridY, enemyCells, deployBlocked } from './stages.js?v=2026111110';
import { terrainFor } from './terrain.js?v=2026111110';

export class Deploy {
  constructor(stage, cells) {
    this.stage = stage;
    this.cells = cells ? Int8Array.from(cells) : new Int8Array(GRID.cols * GRID.rows).fill(-1);
    this.blk = deployBlocked(stage); this.blockHit = false; // terrain: cells on water / walls cannot hold units
    if (this.blk) for (let i = 0; i < this.cells.length; i++) if (this.blk[i]) this.cells[i] = -1;
    this.counts = new Int32Array(NT); this.cost = 0; this.pop = 0;
    for (const v of this.cells) if (v >= 0) { this.counts[v]++; this.cost += UNITS[v].cost; this.pop++; }
    this.type = 0; this.brush = 1; this.erase = false;
    this.strokes = []; this.cur = null; this.limitHit = false; this.version = 0;
  }
  canPlace(type, replaced = -1) {
    const dc = UNITS[type].cost - (replaced >= 0 ? UNITS[replaced].cost : 0), dp = replaced >= 0 ? 0 : 1;
    return this.cost + dc <= this.stage.budget && this.pop + dp <= this.stage.cap;
  }
  canAfford(type) { return this.canPlace(type); }
  cellAt(wx, wy) {
    const c = Math.floor((wx - GRID.x0) / GRID.cell), r = Math.floor((wy - GRID.y0) / GRID.cell);
    return c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows ? null : [c, r];
  }
  set(i, v) { // low-level change with bookkeeping; records the old value in the current stroke
    const o = this.cells[i]; if (o === v) return;
    if (o >= 0) { this.counts[o]--; this.cost -= UNITS[o].cost; this.pop--; }
    if (v >= 0) { this.counts[v]++; this.cost += UNITS[v].cost; this.pop++; }
    this.cells[i] = v; if (this.cur) this.cur.push(i, o); this.version++;
  }
  stamp(c, r) {
    const n = this.brush, lo = -Math.floor((n - 1) / 2);
    for (let dr = lo; dr < lo + n; dr++) for (let dc = lo; dc < lo + n; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= GRID.cols || rr >= GRID.rows) continue;
      const i = rr * GRID.cols + cc, o = this.cells[i];
      if (this.erase) { if (o >= 0) this.set(i, -1); }
      else if (this.blk && this.blk[i]) this.blockHit = true;
      else if (o !== this.type) { if (this.canPlace(this.type, o)) this.set(i, this.type); else this.limitHit = true; }
    }
  }
  begin() { this.cur = []; }
  end() { if (this.cur && this.cur.length) this.strokes.push(this.cur); this.cur = null; }
  cancel() { const s = this.cur; this.cur = null; if (s) for (let k = s.length - 2; k >= 0; k -= 2) this.set(s[k], s[k + 1]); }
  paintAt(wx, wy) { const p = this.cellAt(wx, wy); if (p) this.stamp(p[0], p[1]); }
  paintLine(x0, y0, x1, y1) { // dense sampling so fast drags leave no gaps
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (GRID.cell * 0.5)));
    for (let k = 1; k <= n; k++) this.paintAt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
  }
  undo() {
    this.end(); const s = this.strokes.pop(); if (!s) return false;
    const keep = this.cur; this.cur = null;
    for (let k = s.length - 2; k >= 0; k -= 2) this.set(s[k], s[k + 1]);
    this.cur = keep; return true;
  }
  clear() {
    this.end(); this.cur = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] >= 0) this.set(i, -1);
    this.end();
  }
  units() { // row-major, deterministic
    const out = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] >= 0) out.push({ type: this.cells[i], x: gridX(i % GRID.cols), y: gridY((i / GRID.cols) | 0) });
    return out;
  }
}

// Fill a Sim with the stage's enemy (team 1) and the painted formation (team 0). Deterministic for a given seed.
export function fillSim(sim, stage, dep) {
  sim.setTerrain(terrainFor(stage));
  for (const u of enemyCells(stage)) sim.spawn(1, u.type, u.x, u.y);
  for (const u of dep.units()) sim.spawn(0, u.type, u.x, u.y);
  return sim;
}
// Reuse a Sim as a static preview (not stepped): reset and refill, expose all units to the renderer.
export function fillPreview(sim, stage, dep) {
  sim.n = 0; sim.cnt.fill(0); sim.cnt0.fill(0); sim.over = false; sim.winner = -1; sim.time = 0; sim.tick = 0;
  fillSim(sim, stage, dep);
  for (let i = 0; i < sim.n; i++) sim.ord[i] = i;
  sim.nOrd = sim.n;
}

// Canvas overlay in world units: team zones, snapped grid (player half), hovering brush footprint.
export function drawOverlay(c, dep, hover, zoom) {
  const W = ARENA.w, H = ARENA.h, g = GRID;
  c.fillStyle = 'rgba(61,165,255,0.07)'; c.fillRect(0, 0, W / 2, H);
  c.fillStyle = 'rgba(255,77,94,0.06)'; c.fillRect(W / 2, 0, W / 2, H);
  c.strokeStyle = 'rgba(61,165,255,0.55)'; c.lineWidth = 2 / zoom; c.strokeRect(g.x0 - 4, g.y0 - 4, g.cols * g.cell + 8, g.rows * g.cell + 8);
  if (zoom > 0.45) {
    c.strokeStyle = 'rgba(120,180,255,0.09)'; c.lineWidth = 1 / zoom; c.beginPath();
    for (let i = 0; i <= g.cols; i++) { const x = g.x0 + i * g.cell; c.moveTo(x, g.y0); c.lineTo(x, g.y0 + g.rows * g.cell); }
    for (let j = 0; j <= g.rows; j++) { const y = g.y0 + j * g.cell; c.moveTo(g.x0, y); c.lineTo(g.x0 + g.cols * g.cell, y); }
    c.stroke();
  }
  if (dep.blk) { // blocked deploy cells (water / walls) are shown as invalid
    c.fillStyle = 'rgba(255,50,60,0.2)';
    for (let r = 0; r < g.rows; r++) for (let q = 0; q < g.cols; q++) if (dep.blk[r * g.cols + q]) c.fillRect(g.x0 + q * g.cell, g.y0 + r * g.cell, g.cell, g.cell);
  }
  if (hover) {
    const p = dep.cellAt(hover[0], hover[1]);
    if (p) {
      const n = dep.brush, lo = -Math.floor((n - 1) / 2), c0 = Math.max(0, p[0] + lo), r0 = Math.max(0, p[1] + lo);
      const c1 = Math.min(g.cols, p[0] + lo + n), r1 = Math.min(g.rows, p[1] + lo + n);
      c.fillStyle = dep.erase ? 'rgba(255,90,106,0.25)' : 'rgba(255,255,255,0.18)'; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5 / zoom;
      c.fillRect(g.x0 + c0 * g.cell, g.y0 + r0 * g.cell, (c1 - c0) * g.cell, (r1 - r0) * g.cell);
      c.strokeRect(g.x0 + c0 * g.cell, g.y0 + r0 * g.cell, (c1 - c0) * g.cell, (r1 - r0) * g.cell);
      if (dep.blk && !dep.erase) {
        c.fillStyle = 'rgba(255,40,50,0.55)';
        for (let r = r0; r < r1; r++) for (let q = c0; q < c1; q++) if (dep.blk[r * g.cols + q]) c.fillRect(g.x0 + q * g.cell, g.y0 + r * g.cell, g.cell, g.cell);
      }
    }
  }
}
