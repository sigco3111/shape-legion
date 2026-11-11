// Terrain data (no DOM): stage terrain spec -> 25-unit coarse grid (64 x 36). Shared by sim, renderer, deploy and stage data.
// Spec: { river: { c0, c1, bridges: [[r0, r1], ...] }, walls: [[c0, r0, c1, r1], ...], hills: [[c0, r0, c1, r1], ...] } (cells inclusive).
import { ARENA } from './units.js?v=2026111106';

export const TC = 25, TCOLS = ARENA.w / TC, TROWS = ARENA.h / TC;
export const K = { GROUND: 0, WATER: 1, WALL: 2, BRIDGE: 3, HILL: 4 };
// sim mask bits: 1 = impassable (water or wall), 2 = wall (also blocks arrows; water does not)
export const M_BLOCK = 1, M_WALL = 2;
export const HILL_RANGE = 1.25; // archers / siege standing on a hill shoot this much farther

const cache = new WeakMap();
export function terrainFor(stage) {
  const sp = stage && stage.terrain;
  if (!sp) return null;
  if (cache.has(sp)) return cache.get(sp);
  const kind = new Uint8Array(TCOLS * TROWS), mask = new Uint8Array(TCOLS * TROWS), hill = new Uint8Array(TCOLS * TROWS);
  const rect = (a, k) => { for (let r = a[1]; r <= a[3]; r++) for (let c = a[0]; c <= a[2]; c++) kind[r * TCOLS + c] = k; };
  for (const h of sp.hills || []) rect(h, K.HILL);
  if (sp.river) {
    const { c0, c1, bridges = [] } = sp.river;
    rect([c0, 0, c1, TROWS - 1], K.WATER);
    for (const [r0, r1] of bridges) rect([c0, r0, c1, r1], K.BRIDGE);
  }
  for (const w of sp.walls || []) rect(w, K.WALL);
  let hasWater = false, hasWall = false, hasHill = false;
  for (let i = 0; i < kind.length; i++) {
    const k = kind[i];
    if (k === K.WATER) { mask[i] = M_BLOCK; hasWater = true; }
    else if (k === K.WALL) { mask[i] = M_BLOCK | M_WALL; hasWall = true; }
    else if (k === K.HILL) { hill[i] = 1; hasHill = true; }
  }
  const tags = []; if (sp.river) { tags.push('river'); if (sp.river.bridges && sp.river.bridges.length) tags.push('bridge'); } if (hasWall) tags.push('wall'); if (hasHill) tags.push('hill');
  const t = { kind, mask, hill, hasWater, hasWall, hasHill, tags };
  cache.set(sp, t); return t;
}
export const TERR_ICON = { river: '🌊', bridge: '🌉', wall: '🧱', hill: '⛰' };

// True if any impassable coarse cell overlaps the world rect (x0,y0)-(x1,y1).
export function rectBlocked(t, x0, y0, x1, y1) {
  if (!t) return false;
  const c0 = Math.max(0, Math.floor(x0 / TC)), c1 = Math.min(TCOLS - 1, Math.floor((x1 - 1e-6) / TC));
  const r0 = Math.max(0, Math.floor(y0 / TC)), r1 = Math.min(TROWS - 1, Math.floor((y1 - 1e-6) / TC));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (t.mask[r * TCOLS + c]) return true;
  return false;
}
export const blockedAt = (t, x, y) => !!t && t.mask[Math.max(0, Math.min(TROWS - 1, (y / TC) | 0)) * TCOLS + Math.max(0, Math.min(TCOLS - 1, (x / TC) | 0))] !== 0;
