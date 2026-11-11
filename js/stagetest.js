// Headless campaign check (Node): auto-generated layouts vs each stage at the expected upgrade level; skill sanity test.
// Usage: node js/stagetest.js [seeds=8] [stage|all] [skills]
import { Sim } from './sim.js?v=2026111109';
import { UNITS, NT, T } from './units.js?v=2026111109';
import { STAGES, GRID, rewardFor, enemyCounts } from './stages.js?v=2026111109';
import { defaultUp, buildMods, effStage, TECH, POP, statCost, MAXLV } from './upgrades.js?v=2026111109';
import { Deploy, fillSim } from './deploy.js?v=2026111109';
import { deployBlocked } from './stages.js?v=2026111109';

// Purchase order of a typical player; stage N is tested with the gold earned in stages 1..N-1 spent in this order.
const PLAN = ['pop', 'inf0', 'cmd0', 'pop', 'grd0', 'arc0', 'pop', 'st:1:0', 'st:2:1', 'cav0', 'sge0', 'inf1', 'pop', 'cmd1', 'grd1', 'arc1', 'st:0:0', 'st:3:1', 'sge1', 'cav1', 'pop', 'st:1:1', 'st:4:1', 'inf2', 'grd2', 'arc2', 'cmd2', 'pop'];
const TECHI = { inf: 0, grd: 1, arc: 2, cav: 3, sge: 4, cmd: 5 };
export function expectedUp(n) { // upgrade state with the gold from clearing stages 1..n-1 (reward + half of ~50% surviving budget)
  let gold = 0; const up = defaultUp();
  for (let k = 0; k < n - 1; k++) { const st = STAGES[k]; gold += st.reward + Math.floor(0.5 * 0.5 * st.budget); }
  const spent0 = gold;
  for (const p of PLAN) {
    let cost = 0, apply;
    if (p === 'pop') { if (up.pop >= POP.cost.length) continue; cost = POP.cost[up.pop]; apply = () => up.pop++; }
    else if (p.startsWith('st:')) { const [, ty, k] = p.split(':').map(Number); const l = up.st[ty][k]; if (l >= MAXLV) continue; cost = statCost(ty, l); apply = () => up.st[ty][k]++; }
    else { const bi = TECHI[p.slice(0, 3)]; const ni = up.tech[bi]; if (ni >= 3) continue; cost = TECH[bi].nodes[ni].cost; apply = () => up.tech[bi]++; }
    if (cost > gold) break; // a player saves for the next item rather than skipping
    gold -= cost; apply();
  }
  return { up, gold: spent0, left: gold };
}

// ---- auto layouts: front line of squares, circles behind, archers/siege at the back, riders on the wings ----
const TEMPLATES = {
  balanced: [0.2, 0.25, 0.25, 0.15, 0.15], // cost share of circle, square, archer, rider, siege
  ranged:   [0.15, 0.2, 0.3, 0.1, 0.25],
  melee:    [0.3, 0.3, 0.15, 0.2, 0.05],
  riders:   [0.2, 0.2, 0.2, 0.3, 0.1],
};
export function autoCells(st, share) {
  const blk = deployBlocked(st);
  const cells = new Int8Array(GRID.cols * GRID.rows).fill(-1), B = st.budget, P = st.cap;
  const n = [0, 0, 0, 0, 0];
  for (let t = 0; t < NT; t++) n[t] = Math.floor(share[t] * B / UNITS[t].cost);
  const tot = n.reduce((a, b) => a + b, 0);
  if (tot > P) { const k = P / tot; for (let t = 0; t < NT; t++) n[t] = Math.floor(n[t] * k); }
  // leftover budget -> circles while population allows
  let cost = n.reduce((a, c, t) => a + c * UNITS[t].cost, 0), pop = n.reduce((a, b) => a + b, 0);
  while (cost + 1 <= B && pop + 1 <= P) { n[0]++; cost++; pop++; }
  const R0 = 9, R1 = 53;
  let col = GRID.cols - 1;
  const fill = (t, cnt, c0, r0, r1) => { // column by column, centred
    let c = c0;
    while (cnt > 0 && c >= 0) { // free rows of this column (terrain-blocked cells skipped), centred
      const rows = []; for (let r = r0; r <= r1; r++) if (!blk || !blk[r * GRID.cols + c]) rows.push(r);
      const k = Math.min(cnt, rows.length), s = (rows.length - k) >> 1;
      for (let j = s; j < s + k; j++) cells[rows[j] * GRID.cols + c] = t; cnt -= k; c--;
    }
    return c;
  };
  const wing = n[3] >> 1;
  fill(3, wing, GRID.cols - 3, 0, R0 - 2); fill(3, n[3] - wing, GRID.cols - 3, R1 + 2, GRID.rows - 1);
  col = fill(1, n[1], col, R0, R1);
  col = fill(0, n[0], col, R0, R1);
  col = fill(2, n[2], col, R0 + 4, R1 - 4);
  fill(4, n[4], col, R0 + 8, R1 - 8);
  return cells;
}
export function circleBlock(st) { // everything into one block of circles (the lazy strategy); blocked cells skipped
  const blk = deployBlocked(st), cells = new Int8Array(GRID.cols * GRID.rows).fill(-1); let n = Math.min(st.budget, st.cap), c = GRID.cols - 1;
  while (n > 0 && c >= 0) { let k = 0; for (let r = 11; r < GRID.rows && k < 40 && n > 0; r++) if (!blk || !blk[r * GRID.cols + c]) { cells[r * GRID.cols + c] = 0; k++; n--; } c--; }
  return cells;
}

export function fight(stage, up, cells, seed, opt = {}) {
  const m = buildMods(up), st = effStage(stage, m), dep = new Deploy(st, cells);
  const sim = new Sim({ cap: 3200, seed, events: false });
  sim.setMods(0, m); fillSim(sim, st, dep);
  const maxT = opt.maxTicks || 9000;
  while (!sim.over && sim.tick < maxT) { sim.step(); if (opt.onTick) opt.onTick(sim); }
  return { sim, st, dep };
}

export function evalStage(idx, seeds = 8, log = console.log) {
  const stage = STAGES[idx], { up, gold } = expectedUp(idx + 1), m = buildMods(up), st = effStage(stage, m);
  const res = { stage: idx + 1, gold, budget: st.budget, cap: st.cap, up: `pop${up.pop} tech${up.tech.join('')}`, templates: {}, circle: 0, maxT: 0 };
  let ecost = 0; const ec = enemyCounts(stage);
  ec.forEach((c, t) => { ecost += c * UNITS[t].cost; });
  res.enemy = `${ec.join('/')} cost ${ecost}`;
  for (const [name, share] of Object.entries(TEMPLATES)) {
    let w = 0, surv = 0;
    for (let k = 0; k < seeds; k++) {
      const { sim } = fight(stage, up, autoCells(st, share), stage.seed + k * 7919);
      if (sim.winner === 0) { w++; surv += sim.value(0) / Math.max(1, sim.value(0, true)); } res.maxT = Math.max(res.maxT, sim.time);
    }
    res.templates[name] = +(w / seeds).toFixed(2); if (name === 'balanced') res.surv = +(surv / seeds).toFixed(2);
  }
  let cw = 0;
  for (let k = 0; k < seeds; k++) { const { sim } = fight(stage, up, circleBlock(st), stage.seed + k * 7919); if (sim.winner === 0) cw++; res.maxT = Math.max(res.maxT, sim.time); }
  res.circle = +(cw / seeds).toFixed(2); res.maxT = +res.maxT.toFixed(0);
  log(`S${res.stage} gold~${gold} ${res.up} B${res.budget}/P${res.cap} enemy ${res.enemy} | win ${Object.entries(res.templates).map(([k, v]) => k + ' ' + v).join(' ')} (bal surv ${res.surv}) | circles ${res.circle} | maxT ${res.maxT}s`);
  return res;
}

// Skill sanity: same seed, with vs without a skill cast at 8 s, measured 3 s later (before the runs diverge much).
export function skillTest(log = console.log) {
  const out = {}, stage = STAGES[4], up = expectedUp(5).up, st = effStage(stage, buildMods(up)), cells = autoCells(st, TEMPLATES.balanced);
  const px = 560, py = 450, rad = 240;
  const run = (cast) => {
    let done = false, d0 = 0;
    const { sim } = fight(stage, up, cells, 4242, { maxTicks: 30 * 11, onTick: (s) => { if (!done && s.time >= 8) { done = true; cast(s); } } });
    let sd = 0, n = 0, rb = 0;
    for (let i = 0; i < sim.n; i++) if (sim.alive[i] && sim.team[i] === 0 && sim.rt[i] > 0) { sd += Math.hypot(sim.x[i] - px, sim.y[i] - py); n++; }
    return { enemyHp: sim.hpTotal(1), kills: sim.cnt0.slice(NT).reduce((a, b) => a + b, 0) - sim.count(1), rallyDist: n ? sd / n : 0, n };
  };
  const none = run(() => {}), vol = run((s) => { out.volleyN = s.castVolley(0); });
  const chg = run((s) => { out.chargeN = s.castCharge(0); }), ral = run((s) => { out.rallyN = s.castRally(0, px, py, rad); });
  // rally distance of the same units without the cast: re-measure by marking at cast time
  let ref = 0, nref = 0, marked = null;
  fight(stage, up, cells, 4242, { maxTicks: 30 * 11, onTick: (s) => { if (!marked && s.time >= 8) { marked = []; for (let i = 0; i < s.n; i++) if (s.alive[i] && s.team[i] === 0 && Math.hypot(s.x[i] - px, s.y[i] - py) <= rad) marked.push(i); } if (marked && s.tick === 30 * 11 - 1) { for (const i of marked) if (s.alive[i]) { ref += Math.hypot(s.x[i] - px, s.y[i] - py); nref++; } } } });
  log(`skills cast@8s, enemy hp left @11s (lower = more damage): none ${none.enemyHp.toFixed(0)} | volley(${out.volleyN} shooters) ${vol.enemyHp.toFixed(0)} | charge(${out.chargeN} riders) ${chg.enemyHp.toFixed(0)}`);
  log(`rally(${out.rallyN} units): mean distance to rally point after 3 s ${ral.rallyDist.toFixed(0)} vs ${(ref / Math.max(1, nref)).toFixed(0)} without`);
  out.none = none; out.vol = vol; out.chg = chg; out.ral = ral; out.refDist = ref / Math.max(1, nref);
  return out;
}

if (typeof process !== 'undefined' && /stagetest\.js$/.test(process.argv[1] || '')) {
  const seeds = +process.argv[2] || 8, which = process.argv[3] || 'all';
  if (process.argv.includes('skills')) skillTest();
  else for (let i = 0; i < STAGES.length; i++) if (which === 'all' || +which === i + 1) evalStage(i, seeds);
}
