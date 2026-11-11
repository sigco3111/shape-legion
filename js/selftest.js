// Headless balance/perf self-test. Browser: ?selftest=1 (&full=1). Node: node js/selftest.js [full]
import { Sim } from './sim.js?v=2026111106';
import { UNITS, NT, DT } from './units.js?v=2026111106';
import { setupBattle, setupCounts } from './formation.js?v=2026111106';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
const NAMES = UNITS.map((u) => u.id);

function fight(seed, setup, maxTicks = 9000) {
  const s = new Sim({ cap: 3200, seed, events: false });
  setup(s);
  while (!s.over && s.tick < maxTicks) s.step();
  return s;
}

export async function runSelfTest({ full = false, log = console.log } = {}) {
  const out = { preset: [], matrix: {}, perf: null, ok: true };
  const seeds = full ? 30 : 10;
  log(`== Self-test (${full ? 'full' : 'quick'}) ==`);
  // 1) mixed 600 v 600 preset, mirror armies
  let bw = 0, dur = 0, maxDur = 0;
  for (let k = 1; k <= seeds; k++) {
    const seed = k * 104729 + 977, s = fight(seed, (x) => setupBattle(x, 600));
    const w = s.winner; if (w === 0) bw++;
    dur += s.time; maxDur = Math.max(maxDur, s.time);
    out.preset.push({ seed, winner: w, time: +s.time.toFixed(1), blue: s.count(0), red: s.count(1) });
    log(`600v600 seed ${seed}: winner=${w === 0 ? 'blue' : w === 1 ? 'red' : 'draw'} t=${s.time.toFixed(1)}s survivors blue ${s.count(0)} red ${s.count(1)}`);
    await yieldUI();
  }
  out.presetSummary = { blueWinRate: bw / seeds, avgDuration: +(dur / seeds).toFixed(1), maxDuration: +maxDur.toFixed(1) };
  if (maxDur >= 90) out.ok = false;
  log(`600v600: blue win rate ${(100 * bw / seeds).toFixed(0)}% | avg duration ${(dur / seeds).toFixed(1)}s | max ${maxDur.toFixed(1)}s (target < 90s) ${maxDur < 90 ? 'OK' : 'FAIL'}`);

  // 2) type-vs-type matrix at equal cost; row type wins% (sides alternate per seed)
  const budget = full ? 600 : 300, ms = full ? 6 : 4;
  log(`-- matrix: row vs column, equal cost ${budget}, ${ms} seeds, row-win% / avg s --`);
  log('            ' + NAMES.map((n) => n.padEnd(11)).join(''));
  for (let a = 0; a < NT; a++) {
    let line = NAMES[a].padEnd(12);
    for (let b = 0; b < NT; b++) {
      if (a === b) { line += '-'.padEnd(11); continue; }
      let wins = 0, tsum = 0;
      for (let k = 1; k <= ms; k++) {
        const ca = new Array(NT).fill(0), cb = new Array(NT).fill(0);
        ca[a] = Math.floor(budget / UNITS[a].cost); cb[b] = Math.floor(budget / UNITS[b].cost);
        const aBlue = k % 2 === 1;
        const s = fight(100 * a + 10 * b + k, (x) => (aBlue ? setupCounts(x, ca, cb) : setupCounts(x, cb, ca)));
        if (s.winner === (aBlue ? 0 : 1)) wins++; else if (s.winner === -1) wins += 0.5;
        tsum += s.time;
      }
      const pct = Math.round(100 * wins / ms);
      out.matrix[NAMES[a] + '>' + NAMES[b]] = { winPct: pct, avgTime: +(tsum / ms).toFixed(1) };
      line += `${pct}%/${(tsum / ms).toFixed(0)}s`.padEnd(11);
      await yieldUI();
    }
    log(line);
  }

  // 3) perf: 1000 v 1000
  const s = new Sim({ cap: 3200, seed: 7, events: false }); setupBattle(s, 1000);
  for (let i = 0; i < 20; i++) s.step(); // warm-up
  const t0 = now(), n = 120;
  for (let i = 0; i < n; i++) s.step();
  const per = (now() - t0) / n;
  out.perf = { units: s.n, msPerTick: +per.toFixed(2) };
  log(`perf 1000v1000 (${s.n} units): avg sim ${per.toFixed(2)} ms/tick (budget ${(1000 * DT).toFixed(1)} ms)`);
  log(out.ok ? 'SELFTEST OK' : 'SELFTEST FAIL');
  return out;
}

// Node entry
if (typeof process !== 'undefined' && process.argv && /selftest\.js$/.test(process.argv[1] || '')) {
  runSelfTest({ full: process.argv.includes('full') });
}
