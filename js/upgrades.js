// Upgrade data + logic (no DOM): population cap, per-type stat levels, 6-branch tech tree, and the battle modifier object.
// The sim's base balance table (units.js) is never edited; buildMods() produces multipliers applied on top at battle start.
import { UNITS, NT, T, HP_SCALE } from './units.js?v=2026111110';

export const MAXLV = 5;
export const STAT_KEYS = ['hp', 'dmg', 'mob']; // mob = speed (melee types) or range (archer, siege)
export const STAT_PCT = { hp: 0.10, dmg: 0.09, mob: 0.08 }; // per level, additive: mult = 1 + pct * level
export const STAT_COST = [40, 70, 110, 160, 230]; // price of level 1..5, scaled per type below
export const TYPE_COST = [1, 1.6, 1.6, 1.8, 2.4];
export const POP = { step: 20, cost: [60, 120, 200, 300, 450] }; // +20 population per level
export const mobKey = (ty) => (UNITS[ty].range > 0 ? 'rng' : 'spd');

// Tech tree: 6 branches x 3 nodes (each node needs the previous one). fx: additive percentages on top of 1.0.
// fx keys: budgetPct, budgetAdd, capAdd, hp/dmg/spd/rng {type: pct}, splash, charge, wall, vsSquare, brushMax.
export const TECH = [
  { id: 'inf', nodes: [{ cost: 120, fx: { budgetPct: 0.10 } }, { cost: 220, fx: { hp: { [T.CIRCLE]: 0.12 } } }, { cost: 360, fx: { dmg: { [T.CIRCLE]: 0.10 }, spd: { [T.CIRCLE]: 0.08 } } }] },
  { id: 'grd', nodes: [{ cost: 120, fx: { hp: { [T.SQUARE]: 0.10 } } }, { cost: 220, fx: { wall: 0.10 } }, { cost: 360, fx: { hp: { [T.SQUARE]: 0.15 }, dmg: { [T.SQUARE]: 0.10 } } }] },
  { id: 'arc', nodes: [{ cost: 120, fx: { rng: { [T.ARCHER]: 0.08 } } }, { cost: 220, fx: { vsSquare: 0.15 } }, { cost: 360, fx: { dmg: { [T.ARCHER]: 0.10 }, hp: { [T.ARCHER]: 0.10 } } }] },
  { id: 'cav', nodes: [{ cost: 120, fx: { spd: { [T.RIDER]: 0.08 } } }, { cost: 220, fx: { charge: 0.20 } }, { cost: 360, fx: { hp: { [T.RIDER]: 0.12 }, dmg: { [T.RIDER]: 0.08 } } }] },
  { id: 'sge', nodes: [{ cost: 150, fx: { splash: 0.15 } }, { cost: 260, fx: { rng: { [T.SIEGE]: 0.10 } } }, { cost: 420, fx: { splash: 0.20, dmg: { [T.SIEGE]: 0.08 } } }] },
  { id: 'cmd', nodes: [{ cost: 150, fx: { budgetAdd: 25 } }, { cost: 260, fx: { brushMax: 4 } }, { cost: 420, fx: { budgetAdd: 40, capAdd: 10 } }] },
];

// Commander skills unlocked by the Command branch (TECH index 5): `need` = Command nodes owned. Rally is free; no save change needed.
export const CMD_BRANCH = 5;
export const CMD_SKILLS = [{ id: 'rally', need: 0 }, { id: 'volley', need: 1 }, { id: 'charge', need: 2 }];
export const skillsFor = (up) => { const n = normUp(up).tech[CMD_BRANCH]; return CMD_SKILLS.map((k) => n >= k.need); };

export const statCost = (ty, lv) => Math.round(STAT_COST[lv] * TYPE_COST[ty] / 5) * 5;
export const defaultUp = () => ({ pop: 0, st: Array.from({ length: NT }, () => [0, 0, 0]), tech: TECH.map(() => 0) });
const clamp = (v, hi) => Math.max(0, Math.min(hi, v | 0));
// Accepts anything (missing / old-save / corrupt) and returns a valid upgrade object.
export function normUp(o) {
  const u = defaultUp();
  if (!o || typeof o !== 'object') return u;
  u.pop = clamp(o.pop, POP.cost.length);
  for (let ty = 0; ty < NT; ty++) for (let k = 0; k < 3; k++) u.st[ty][k] = clamp(o.st && o.st[ty] && o.st[ty][k], MAXLV);
  TECH.forEach((b, i) => { u.tech[i] = clamp(o.tech && o.tech[i], b.nodes.length); });
  return u;
}

// Modifier object: multipliers per type (arrays of NT) + perk values. null/defaults == unchanged base balance.
export function buildMods(up) {
  up = normUp(up);
  const one = () => new Array(NT).fill(1);
  const m = { hp: one(), dmg: one(), spd: one(), rng: one(), splash: 1, charge: 1, wall: 0, vsSquare: 1, budgetMul: 1, budgetAdd: 0, capAdd: POP.step * up.pop, brushMax: 3, skills: skillsFor(up) };
  for (let ty = 0; ty < NT; ty++) {
    m.hp[ty] += STAT_PCT.hp * up.st[ty][0]; m.dmg[ty] += STAT_PCT.dmg * up.st[ty][1];
    m[mobKey(ty)][ty] += STAT_PCT.mob * up.st[ty][2];
  }
  TECH.forEach((b, bi) => {
    for (let n = 0; n < up.tech[bi]; n++) {
      const fx = b.nodes[n].fx;
      for (const k of ['hp', 'dmg', 'spd', 'rng']) if (fx[k]) for (const ty in fx[k]) m[k][ty] += fx[k][ty];
      if (fx.splash) m.splash += fx.splash; if (fx.charge) m.charge += fx.charge; if (fx.wall) m.wall += fx.wall; if (fx.vsSquare) m.vsSquare += fx.vsSquare;
      if (fx.budgetPct) m.budgetMul += fx.budgetPct; if (fx.budgetAdd) m.budgetAdd += fx.budgetAdd; if (fx.capAdd) m.capAdd += fx.capAdd;
      if (fx.brushMax) m.brushMax = Math.max(m.brushMax, fx.brushMax);
    }
  });
  return m;
}
// Stage with the upgrade-adjusted budget / population cap (enemy untouched).
export function effStage(st, m) { return { ...st, budget: Math.round(st.budget * m.budgetMul) + m.budgetAdd, cap: st.cap + m.capAdd }; }
// Effective stats of one unit type, for the deploy info panel.
export function effStats(ty, m) {
  const u = UNITS[ty];
  return { hp: u.hp * HP_SCALE * m.hp[ty], dmg: u.dmg * m.dmg[ty], speed: u.speed * m.spd[ty], range: u.range * m.rng[ty], base: { hp: u.hp * HP_SCALE, dmg: u.dmg, speed: u.speed, range: u.range }, mul: { hp: m.hp[ty], dmg: m.dmg[ty], speed: m.spd[ty], range: m.rng[ty] } };
}

// Purchases: mutate save {gold, up}; return false when not allowed. Caller stores the save.
function pay(save, cost) { if (save.gold < cost) return false; save.gold -= cost; return true; }
export function buyPop(save) { const l = save.up.pop; return l < POP.cost.length && pay(save, POP.cost[l]) && (save.up.pop++, true); }
export function buyStat(save, ty, k) { const l = save.up.st[ty][k]; return l < MAXLV && pay(save, statCost(ty, l)) && (save.up.st[ty][k]++, true); }
export function buyTech(save, bi, ni) { // ni must be the next node of the branch
  if (save.up.tech[bi] !== ni || ni >= TECH[bi].nodes.length) return false;
  return pay(save, TECH[bi].nodes[ni].cost) && (save.up.tech[bi]++, true);
}
