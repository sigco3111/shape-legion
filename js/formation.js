// Formation layout + presets (shared by demo battles and the self-test).
import { UNITS, NT, ARENA } from './units.js?v=2026111103';

export const MIX = [0.46, 0.14, 0.17, 0.15, 0.08]; // circle, square, archer, rider, siege (by count)
export const PRESETS = [
  { id: 'small', perSide: 200 },
  { id: 'standard', perSide: 600 },
  { id: 'medium', perSide: 1000 },
  { id: 'large', perSide: 1500 },
];

export function mixCounts(n, mix = MIX) {
  const c = mix.map((f) => Math.floor(n * f));
  c[0] += n - c.reduce((a, b) => a + b, 0);
  return c;
}

// Place `count` units of one type in rows starting at the front line; returns depth used.
function block(sim, team, type, count, frontX, depthOff, y0, y1, dir, jit) {
  if (count <= 0) return 0;
  const r = UNITS[type].r, sp = 2 * r + 1.8, len = y1 - y0;
  const perRow = Math.max(1, Math.floor(len / sp));
  const rows = Math.ceil(count / perRow);
  const rowStep = sp * 0.9;
  let placed = 0;
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(perRow, count - placed);
    const span = (inRow - 1) * sp, off = y0 + (len - span) / 2 + (row % 2 ? sp * 0.25 : 0);
    for (let k = 0; k < inRow; k++) {
      let x = frontX + dir * (depthOff + row * rowStep + r) + sim.rng.range(-jit, jit);
      let y = off + k * sp + sim.rng.range(-jit, jit);
      x = Math.max(r, Math.min(ARENA.w - r, x)); y = Math.max(r, Math.min(ARENA.h - r, y));
      sim.spawn(team, type, x, y); placed++;
    }
  }
  return rows * rowStep + r;
}

// counts: units per type. Squares front, circles behind, archers, siege at the back; riders on the wings.
export function layoutSide(sim, team, counts, opts = {}) {
  const W = ARENA.w, H = ARENA.h, dir = team === 0 ? -1 : 1;
  const frontX = W / 2 + dir * (opts.gap ?? 120);
  const ya = H * 0.2, yb = H * 0.8, jit = 2.2;
  const rid = counts[3], top = Math.ceil(rid / 2);
  block(sim, team, 3, top, frontX, 0, H * 0.04, ya - 10, dir, jit);
  block(sim, team, 3, rid - top, frontX, 0, yb + 10, H * 0.96, dir, jit);
  let d = 0;
  for (const t of [1, 0, 2, 4]) d += block(sim, team, t, counts[t], frontX, d, ya, yb, dir, jit) + 6;
}

export function setupBattle(sim, perSide, mix = MIX) {
  const c = mixCounts(perSide, mix);
  layoutSide(sim, 0, c); layoutSide(sim, 1, c);
}
export function setupCounts(sim, c0, c1) { layoutSide(sim, 0, c0); layoutSide(sim, 1, c1); }
