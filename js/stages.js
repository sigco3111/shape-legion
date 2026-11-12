// Campaign data: stages, enemy formations, star/reward rules, save progress (localStorage).
import { UNITS, ARENA } from './units.js?v=2026111110';
import { defaultUp, normUp } from './upgrades.js?v=2026111110';
import { terrainFor, rectBlocked } from './terrain.js?v=2026111110';

// Deployment grid (player half). Cells are snapped; enemy cells mirror it (d = columns from the centre line).
export const GRID = { cell: 14, cols: 56, rows: 63, x0: 8, y0: 9 };
export const gridX = (c) => GRID.x0 + (c + 0.5) * GRID.cell;
export const gridY = (r) => GRID.y0 + (r + 0.5) * GRID.cell;

// rec = recommended effective gold budget (budget incl. upgrades) the stage was tuned for; see js/stagetest.js.
// Enemy formation = rects {t:type, d0,d1: columns from the centre line, r0,r1: rows (inclusive), sx,sy: optional step}.
export const STAGES = [
  { id: 1, seed: 1101, budget: 150, cap: 140, reward: 100, rec: 120,
    enemy: [{ t: 0, d0: 8, d1: 17, r0: 26, r1: 37 }] }, // 120 circles in a block
  { id: 2, seed: 2202, budget: 260, cap: 220, reward: 160, rec: 200,
    enemy: [{ t: 1, d0: 6, d1: 6, r0: 20, r1: 43 }, { t: 0, d0: 8, d1: 13, r0: 22, r1: 41 }] }, // squares line + circles
  { id: 3, seed: 3303, budget: 340, cap: 240, reward: 240, rec: 300,
    enemy: [{ t: 1, d0: 6, d1: 7, r0: 24, r1: 37 }, { t: 2, d0: 9, d1: 11, r0: 26, r1: 35 }, { t: 3, d0: 14, d1: 15, r0: 8, r1: 11 }, { t: 3, d0: 14, d1: 15, r0: 52, r1: 55 }] }, // archers behind squares + riders
  { id: 4, terrain: { walls: [[31, 4, 32, 8], [31, 27, 32, 31]] }, seed: 4404, budget: 480, cap: 300, reward: 330, rec: 550,
    enemy: [{ t: 0, d0: 7, d1: 15, r0: 6, r1: 57 }, { t: 3, d0: 4, d1: 6, r0: 0, r1: 6 }, { t: 3, d0: 4, d1: 6, r0: 56, r1: 62 }] }, // wide circle line + rider flanks
  { id: 5, terrain: { river: { c0: 30, c1: 33, bridges: [[9, 11], [24, 26]] } }, seed: 5505, budget: 600, cap: 340, reward: 400, rec: 690,
    enemy: [{ t: 1, d0: 6, d1: 7, r0: 12, r1: 51 }, { t: 2, d0: 9, d1: 11, r0: 16, r1: 47 }, { t: 4, d0: 14, d1: 15, r0: 22, r1: 41, sy: 4 }] }, // square wall, archers behind, siege
  { id: 6, terrain: { river: { c0: 30, c1: 33, bridges: [[3, 5], [16, 19], [30, 32]] } }, seed: 6606, budget: 700, cap: 380, reward: 480, rec: 800,
    enemy: [{ t: 0, d0: 7, d1: 11, r0: 12, r1: 51 }, { t: 1, d0: 5, d1: 6, r0: 16, r1: 47 }, { t: 2, d0: 12, d1: 13, r0: 18, r1: 45 }, { t: 3, d0: 8, d1: 10, r0: 0, r1: 11 }, { t: 3, d0: 8, d1: 10, r0: 51, r1: 62 }, { t: 4, d0: 15, d1: 15, r0: 22, r1: 41, sy: 4 }] }, // mixed army, many riders
  { id: 7, terrain: { walls: [[32, 0, 33, 13], [32, 22, 33, 35]] }, seed: 7707, budget: 800, cap: 420, reward: 560, rec: 910,
    enemy: [{ t: 1, d0: 5, d1: 7, r0: 8, r1: 55 }, { t: 4, d0: 11, d1: 15, r0: 10, r1: 53, sx: 2, sy: 4 }, { t: 0, d0: 9, d1: 10, r0: 20, r1: 43 }] }, // siege battery behind squares
  { id: 8, terrain: { walls: [[31, 9, 32, 10], [31, 25, 32, 26]] }, seed: 8808, budget: 1000, cap: 520, reward: 750, rec: 1130,
    enemy: [{ t: 1, d0: 4, d1: 5, r0: 8, r1: 55 }, { t: 0, d0: 6, d1: 10, r0: 8, r1: 55 }, { t: 2, d0: 11, d1: 13, r0: 14, r1: 49 }, { t: 3, d0: 3, d1: 4, r0: 0, r1: 6 }, { t: 3, d0: 3, d1: 4, r0: 56, r1: 62 }, { t: 4, d0: 14, d1: 15, r0: 10, r1: 52, sy: 4 }] }, // boss army
  { id: 9, terrain: { river: { c0: 30, c1: 33, bridges: [[7, 9], [26, 28]] }, hills: [[23, 10, 28, 25], [35, 10, 40, 25]] }, seed: 9909, budget: 1150, cap: 560, reward: 900, rec: 1300,
    enemy: [{ t: 1, d0: 4, d1: 6, r0: 8, r1: 55 }, { t: 0, d0: 7, d1: 8, r0: 8, r1: 55 }, { t: 2, d0: 8, d1: 12, r0: 20, r1: 43 }, { t: 3, d0: 4, d1: 6, r0: 0, r1: 6 }, { t: 3, d0: 4, d1: 6, r0: 56, r1: 62 }, { t: 4, d0: 14, d1: 15, r0: 20, r1: 43, sy: 4 }] }, // two bridges, enemy archers on a hill
  { id: 10, terrain: { river: { c0: 30, c1: 33, bridges: [[4, 6], [16, 19], [29, 31]] }, walls: [[34, 12, 35, 15], [34, 20, 35, 23], [28, 12, 29, 15], [28, 20, 29, 23]] }, seed: 10010, budget: 1300, cap: 620, reward: 1200, rec: 1600,
    enemy: [{ t: 1, d0: 6, d1: 9, r0: 8, r1: 55 }, { t: 0, d0: 10, d1: 13, r0: 8, r1: 55 }, { t: 2, d0: 14, d1: 16, r0: 12, r1: 51 }, { t: 3, d0: 6, d1: 9, r0: 0, r1: 6 }, { t: 3, d0: 6, d1: 9, r0: 56, r1: 62 }, { t: 4, d0: 17, d1: 18, r0: 10, r1: 52, sy: 3 }] }, // final: river, bridge-head walls, huge army
];

// Deploy-grid cells (player half, row-major) touching water or wall: not paintable (Uint8Array, cached per terrain).
const blkCache = new WeakMap();
export function deployBlocked(stage) {
  const tr = terrainFor(stage); if (!tr) return null;
  if (blkCache.has(tr)) return blkCache.get(tr);
  const b = new Uint8Array(GRID.cols * GRID.rows), g = GRID;
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) { const x = g.x0 + c * g.cell, y = g.y0 + r * g.cell; if (rectBlocked(tr, x, y, x + g.cell, y + g.cell)) b[r * g.cols + c] = 1; }
  blkCache.set(tr, b); return b;
}
// Enemy formation = mirrored deploy cells; cells on water / walls are dropped (the enemy also avoids terrain).
export function enemyCells(stage) {
  const out = [], tr = terrainFor(stage);
  for (const q of stage.enemy) for (let d = q.d0; d <= q.d1; d += q.sx || 1) for (let r = q.r0; r <= q.r1; r += q.sy || 1) {
    const x = ARENA.w - gridX(GRID.cols - 1 - d), y = gridY(r);
    if (tr && rectBlocked(tr, x - GRID.cell / 2, y - GRID.cell / 2, x + GRID.cell / 2, y + GRID.cell / 2)) continue;
    out.push({ type: q.t, x, y });
  }
  return out;
}
export function enemyCounts(stage) {
  const c = [0, 0, 0, 0, 0]; for (const u of enemyCells(stage)) c[u.type]++;
  return c;
}
export const enemyCost = (stage) => enemyCounts(stage).reduce((a, n, i) => a + n * UNITS[i].cost, 0);

// 1 star = win, 2 = survivors >= 40% of deployed cost, 3 = >= 70%.
export function starsFor(win, survivorCost, deployedCost) {
  if (!win) return 0;
  const r = survivorCost / Math.max(1, deployedCost);
  return r >= 0.7 ? 3 : r >= 0.4 ? 2 : 1;
}
// Gold: win = base + half of surviving cost; defeat = consolation (25% of base).
export function rewardFor(stage, win, survivorCost) {
  return win ? stage.reward + Math.floor(survivorCost * 0.5) : Math.floor(stage.reward * 0.25);
}

const KEY = 'shapelegion.save.v1';
// Save v2 adds `up` (upgrade levels); v1 saves load fine (missing fields default).
export const SAVE_VER = 2;
export function defaultSave() { return { v: SAVE_VER, stars: STAGES.map(() => 0), gold: 0, unlocked: 1, up: defaultUp() }; }
export function loadSave() {
  const s = defaultSave();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') {
      STAGES.forEach((_, i) => { s.stars[i] = Math.max(0, Math.min(3, (o.stars && o.stars[i]) | 0)); });
      s.gold = Math.max(0, o.gold | 0); s.unlocked = Math.max(1, Math.min(STAGES.length, o.unlocked | 0)); s.up = normUp(o.up);
      // saves from before stages 4-8 existed: a cleared last stage unlocks the one after it
      s.stars.forEach((n, i) => { if (n > 0 && i + 2 > s.unlocked) s.unlocked = Math.min(STAGES.length, i + 2); });
    }
  } catch (e) { /* private mode / bad json */ }
  return s;
}
export function storeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
// Applies a finished battle to the save (best stars kept, next stage unlocked on a win).
export function recordResult(s, idx, stars, gold) {
  s.gold += gold; if (stars > s.stars[idx]) s.stars[idx] = stars;
  if (stars > 0 && idx + 2 > s.unlocked) s.unlocked = Math.min(STAGES.length, idx + 2);
  storeSave(s); return s;
}
// Wipes all progress (stars, gold, unlocks, upgrades) and returns a fresh save.
export function resetSave() { const s = defaultSave(); storeSave(s); return s; }
