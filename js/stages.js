// Campaign data: stages, enemy formations, star/reward rules, save progress (localStorage).
import { UNITS, ARENA } from './units.js?v=2026111103';
import { defaultUp, normUp } from './upgrades.js?v=2026111103';

// Deployment grid (player half). Cells are snapped; enemy cells mirror it (d = columns from the centre line).
export const GRID = { cell: 14, cols: 56, rows: 63, x0: 8, y0: 9 };
export const gridX = (c) => GRID.x0 + (c + 0.5) * GRID.cell;
export const gridY = (r) => GRID.y0 + (r + 0.5) * GRID.cell;

// Enemy formation = rects {t:type, d0,d1: columns from the centre line, r0,r1: rows (inclusive), sx,sy: optional step}.
export const STAGES = [
  { id: 1, seed: 1101, budget: 150, cap: 140, reward: 100,
    enemy: [{ t: 0, d0: 8, d1: 17, r0: 26, r1: 37 }] }, // 120 circles in a block
  { id: 2, seed: 2202, budget: 260, cap: 220, reward: 160,
    enemy: [{ t: 1, d0: 6, d1: 6, r0: 20, r1: 43 }, { t: 0, d0: 8, d1: 13, r0: 22, r1: 41 }] }, // squares line + circles
  { id: 3, seed: 3303, budget: 340, cap: 240, reward: 240,
    enemy: [{ t: 1, d0: 6, d1: 7, r0: 24, r1: 37 }, { t: 2, d0: 9, d1: 11, r0: 26, r1: 35 }, { t: 3, d0: 14, d1: 15, r0: 8, r1: 11 }, { t: 3, d0: 14, d1: 15, r0: 52, r1: 55 }] }, // archers behind squares + riders
];

export function enemyCells(stage) {
  const out = [];
  for (const q of stage.enemy) for (let d = q.d0; d <= q.d1; d += q.sx || 1) for (let r = q.r0; r <= q.r1; r += q.sy || 1) out.push({ type: q.t, x: ARENA.w - gridX(GRID.cols - 1 - d), y: gridY(r) });
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
