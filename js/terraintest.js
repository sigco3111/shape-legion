// Terrain checks (Node): node js/terraintest.js [seeds]
// 1) units never inside blocked cells  2) single-bridge river battle ends with a winner  3) walls stop arrows  4) sim ms/tick flat vs river+bridge (1000v1000)
import { Sim } from './sim.js?v=2026111107';
import { ARENA, T } from './units.js?v=2026111107';
import { setupBattle } from './formation.js?v=2026111107';
import { STAGES } from './stages.js?v=2026111107';
import { terrainFor, TC, TCOLS } from './terrain.js?v=2026111107';
import { fight, autoCells, expectedUp } from './stagetest.js?v=2026111107';
import { effStage } from './upgrades.js?v=2026111107';
import { buildMods } from './upgrades.js?v=2026111107';

const RIVER1 = { terrain: { river: { c0: 30, c1: 33, bridges: [[16, 19]] } } }; // one bridge, 4 cells (100 units) wide, centre of the arena
const inBlocked = (sim, tr) => { let n = 0; for (let i = 0; i < sim.n; i++) if (sim.alive[i] && tr.mask[((sim.y[i] / TC) | 0) * TCOLS + ((sim.x[i] / TC) | 0)]) n++; return n; };
const now = () => performance.now();

export function run(log = console.log, seeds = 3) {
  const out = { ok: true };
  // 1) never inside blocked cells (terrain stages, auto layout, checked every 15 ticks)
  let viol = 0, checks = 0;
  for (const idx of [3, 4, 5, 6, 8, 9]) {
    const st = STAGES[idx], up = expectedUp(idx + 1).up, es = effStage(st, buildMods(up)), tr = terrainFor(st);
    fight(st, up, autoCells(es, [0.2, 0.25, 0.25, 0.15, 0.15]), st.seed, { onTick: (s) => { if (s.tick % 15 === 0) { checks++; viol += inBlocked(s, tr); } } });
  }
  log(`1) units inside blocked cells: ${viol} violations over ${checks} checks (6 terrain stages)`); out.viol = viol; if (viol) out.ok = false;
  // 2) single bridge, 600v600 mixed
  const tr1 = terrainFor(RIVER1); out.bridge = [];
  for (let k = 0; k < seeds; k++) {
    const s = new Sim({ cap: 3200, seed: 777 + k * 31, events: false }); setupBattle(s, 600); s.setTerrain(tr1);
    let v = 0; while (!s.over && s.tick < 30 * 90) { s.step(); if (s.tick % 30 === 0) v += inBlocked(s, tr1); }
    log(`2) single bridge 600v600 seed ${777 + k * 31}: winner=${s.over ? (s.winner === 0 ? 'blue' : s.winner === 1 ? 'red' : 'draw') : 'none'} t=${s.time.toFixed(1)}s left blue ${s.count(0)} red ${s.count(1)} inBlocked=${v}`);
    out.bridge.push({ over: s.over, t: s.time }); if (!s.over || s.time > 90 || v) out.ok = false;
  }
  // 3) walls stop arrows: archer shoots a tough target through a full wall (forced shots) vs the same without the wall
  const wallSpec = { terrain: { walls: [[30, 0, 30, 35]] } }, trW = terrainFor(wallSpec);
  const shoot = (tr, force) => {
    const s = new Sim({ cap: 64, seed: 5, events: false }); if (tr) s.setTerrain(tr);
    const a = s.spawn(0, T.ARCHER, 700, 450), v = s.spawn(1, T.SQUARE, 790, 450); const hp0 = s.hp[v];
    if (force) for (let k = 0; k < 20; k++) s.addProjectile(1, 0, T.ARCHER, 700, 450, 790, 450, v);
    for (let k = 0; k < 30 * 3; k++) s.step();
    return { dmg: hp0 - s.hp[v], liveProj: s.pn - s.pFreeN };
  };
  const open = shoot(null, true), wall = shoot(trW, true);
  // gated: the archer itself must not fire through the wall (its target stays unhurt while the wall stands between them)
  const gate = (tr) => { const s = new Sim({ cap: 64, seed: 5, events: false }); s.setTerrain(tr); const a = s.spawn(0, T.ARCHER, 700, 450), v = s.spawn(1, T.SQUARE, 790, 450); s.vx[v] = 0; const hp0 = s.hp[v]; for (let k = 0; k < 30; k++) { s.step(); s.x[v] = 790; s.y[v] = 450; s.x[a] = Math.min(s.x[a], 740); } return hp0 - s.hp[v]; };
  const gated = gate(trW), gatedOpen = gate(terrainFor({ terrain: { river: { c0: 30, c1: 30, bridges: [] } } }));
  log(`3) forced arrows: open dmg ${open.dmg.toFixed(1)} vs walled dmg ${wall.dmg.toFixed(1)} | archer fire gate (1s): wall ${gated.toFixed(1)} vs river ${gatedOpen.toFixed(1)}`);
  out.arrows = { open: open.dmg, wall: wall.dmg, gated, gatedOpen }; if (!(open.dmg > 0 && wall.dmg === 0 && gated === 0 && gatedOpen > 0)) out.ok = false;
  // 4) timing 1000v1000, first 20 sim seconds
  const timing = (tr) => { const s = new Sim({ cap: 3200, seed: 4242, events: false }); setupBattle(s, 1000); if (tr) s.setTerrain(tr); const t0 = now(); let n = 0; while (!s.over && n < 600) { s.step(); n++; } return (now() - t0) / n; };
  timing(null); const flat = timing(null), river = timing(tr1), flat2 = timing(null), river2 = timing(tr1);
  out.ms = { flat: (flat + flat2) / 2, river: (river + river2) / 2 };
  log(`4) 1000v1000 avg sim ms/tick (first 600 ticks): flat ${out.ms.flat.toFixed(2)} vs river+bridge ${out.ms.river.toFixed(2)}`);
  log(out.ok ? 'terraintest OK' : 'terraintest FAILED'); return out;
}
if (typeof process !== 'undefined' && /terraintest\.js$/.test(process.argv[1] || '')) run(console.log, +process.argv[2] || 3);
