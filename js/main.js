// Entry: game loop (fixed 30 Hz sim, interpolated render), battle controller, settings, adaptive quality.
import { Sim } from './sim.js?v=2026111101';
import { DT, NT, UNITS } from './units.js?v=2026111101';
import { PRESETS, setupBattle } from './formation.js?v=2026111101';
import { Renderer } from './render.js?v=2026111101';
import { createUI } from './ui.js?v=2026111101';
import { setLang, t, applyI18n } from './i18n.js?v=2026111101';
import { newSeed } from './rng.js?v=2026111101';
import * as audio from './audio.js?v=2026111101';

const params = new URLSearchParams(location.search);
const KEY = 'shapelegion.settings.v1';
const defaults = { lang: 'ko', cap: 'auto', fx: 2, volume: 0.35, shake: true, preset: 'standard', fps: false };
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
if (params.has('cap')) settings.cap = params.get('cap') === 'auto' ? 'auto' : +params.get('cap');
if (params.has('lang')) settings.lang = params.get('lang');
if (params.has('preset')) settings.preset = params.get('preset');
if (params.has('fps')) settings.fps = params.get('fps') !== '0';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };
const TIERS = [500, 1000, 2000, 3000];
let autoCap = 2000;
const effectiveCap = () => (settings.cap === 'auto' ? autoCap : settings.cap);
const noAdapt = params.get('noadapt') === '1';
let urlSeed = +params.get('seed') || 0;

const canvas = document.getElementById('view');
const R = new Renderer(canvas);
R.fx = settings.fx; R.shakeOn = settings.shake && R.shakeOn;
audio.setVolume(settings.volume);

const G = { screen: 'menu', sim: null, seed: 0, ambient: true, paused: false, speed: 1, acc: 0, perSide: 0, history: [], nextLog: 5, bannerShown: false, ambientTimer: 0, userCam: false, simMs: 0, simTicks: 0, fpsOn: settings.fps };
window.__sl = { G, R, settings, get sim() { return G.sim; }, startBattle: (...a) => startBattle(...a) };

const ui = createUI({
  settings, effectiveCap, autoCap: () => autoCap, isPaused: () => G.paused,
  onDemo: () => { audio.unlock(); startBattle(settings.preset, urlSeed || newSeed(), false); urlSeed = 0; },
  onPreset: (id) => { settings.preset = id; save(); },
  onReplay: () => startBattle(settings.preset, G.seed, false),
  onNew: () => startBattle(settings.preset, newSeed(), false),
  onMenu: () => toMenu(),
  onPause: () => setPaused(!G.paused),
  onSpeed: (s) => { G.speed = s; ui.setSpeed(s); },
  onFit: () => { R.cam.fit(R.vw, R.vh); G.userCam = false; },
  onFps: () => { G.fpsOn = !G.fpsOn; settings.fps = G.fpsOn; save(); ui.setFps(G.fpsOn); },
  onZoom: (f) => { R.cam.zoomAt(f, R.vw / 2, R.vh / 2, R.vw, R.vh); },
  onZoomAt: (f, x, y) => R.cam.zoomAt(f, x, y, R.vw, R.vh),
  onPan: (dx, dy) => R.cam.panBy(dx, dy),
  onUserCamera: () => { G.userCam = true; audio.unlock(); },
  onLang: (l) => { settings.lang = l; save(); },
  onSetting: (k, v) => {
    settings[k] = v; save();
    if (k === 'fx') R.fx = v; if (k === 'volume') audio.setVolume(v);
    if (k === 'shake') R.shakeOn = v && !(matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (k === 'cap') ui.buildPresets();
  },
});

function toMenu() {
  G.screen = 'menu'; ui.showScreen('menu'); ui.buildPresets(); startAmbient();
}
function setPaused(p) { G.paused = p; ui.setPaused(p); }

function startAmbient() {
  G.ambient = true; G.paused = false; G.speed = 1; ui.setPaused(false); ui.setSpeed(1);
  newBattle(PRESETS[0].perSide * 0.75 | 0, newSeed());
  R.cam.fit(R.vw, R.vh); R.cam.zoom *= 1.12; G.userCam = false;
}

function newBattle(perSide, seed) {
  const sim = new Sim({ cap: 3200, seed, events: true });
  setupBattle(sim, perSide);
  G.sim = sim; G.seed = seed; G.perSide = perSide; G.acc = 0; G.history = []; G.nextLog = 5; G.bannerShown = false; G.simMs = 0; G.simTicks = 0;
  R.clearFx();
  return sim;
}

function startBattle(presetId, seed, ambient) {
  const p = PRESETS.find((x) => x.id === presetId) || PRESETS[1];
  const cap = effectiveCap(), perSide = Math.min(p.perSide, Math.floor(cap / 2));
  if (perSide < p.perSide) ui.toast(t('toast.scaled', { cap, n: perSide }));
  settings.preset = p.id; save();
  G.screen = 'battle'; G.ambient = false; ui.showScreen('battle'); ui.buildPresets(); ui.setFps(G.fpsOn);
  setPaused(false); G.speed = 1; ui.setSpeed(1);
  const sim = newBattle(perSide, seed);
  R.cam.fit(R.vw, R.vh); G.userCam = false;
  ui.updateHud(sim, seed);
  console.log(`[battle] start preset=${p.id} units=${sim.n} (${perSide} vs ${perSide}) seed=${seed} cap=${cap}`);
}

function snapshot(sim) {
  const c = Array.from(sim.cnt);
  return { t: +sim.time.toFixed(1), blue: c.slice(0, NT), red: c.slice(NT) };
}
function logStats(sim) {
  const s = snapshot(sim); G.history.push(s);
  const names = UNITS.map((u) => u.id[0]).join('/');
  console.log(`[stats] t=${s.t}s ${names} blue=${s.blue.join('/')} red=${s.red.join('/')}`);
  const d = document.getElementById('debug');
  if (params.has('debug')) { d.classList.remove('hidden'); d.textContent = 'time  blue(' + names + ')  red\n' + G.history.slice(-8).map((h) => `${String(h.t).padStart(5)}  ${h.blue.join('/').padEnd(22)} ${h.red.join('/')}`).join('\n'); }
}

// ---- resize ----
function resize() {
  const w = innerWidth, h = innerHeight, first = !R.vw || R.vw === 1;
  R.resize(w, h);
  if (first || !G.userCam) { const z = G.ambient ? 1.12 : 1; R.cam.fit(w, h); R.cam.zoom *= z; }
}
addEventListener('resize', resize);
new ResizeObserver(() => resize()).observe(document.getElementById('app'));

// ---- loop ----
let last = performance.now(), fpsAcc = 0, fpsFrames = 0, fpsText = '', winT = 0, winN = 0, lastAdapt = 0, hudT = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, ts - last); last = ts;
  const sim = G.sim;
  if (!sim) return;
  const sp = G.ambient ? 1 : G.speed;
  if (!G.paused && !sim.over) {
    G.acc += (dtMs / 1000) * sp;
    if (G.acc > 0.3) G.acc = 0.3;
    let n = 0;
    const t0 = performance.now();
    while (G.acc >= DT && n < 10 && !sim.over) { sim.step(); G.acc -= DT; n++; }
    if (n) { G.simMs += performance.now() - t0; G.simTicks += n; }
    if (G.acc >= DT) G.acc = 0; // too slow: drop time rather than spiral
    if (!G.ambient && sim.time >= G.nextLog) { logStats(sim); G.nextLog += 5; }
  }
  R.consume(sim);
  if (!G.ambient) {
    const a = R.audioCounts;
    if (a.melee) audio.play('melee', a.melee); if (a.shot) audio.play('shot', a.shot); if (a.death) audio.play('death', a.death); if (a.boom) audio.play('boom', a.boom);
  }
  R.updateFx(G.paused ? 0 : (dtMs / 1000) * sp);
  R.draw(sim, sim.over || G.paused ? 1 : G.acc / DT);

  // end of battle
  if (sim.over && !G.bannerShown) {
    G.bannerShown = true;
    if (G.ambient) { clearTimeout(G.ambientTimer); G.ambientTimer = setTimeout(() => { if (G.ambient) startAmbient(); }, 2500); }
    else {
      logStats(sim);
      console.log(`[battle-end] winner=${sim.winner < 0 ? 'draw' : sim.winner ? 'red' : 'blue'} t=${sim.time.toFixed(1)}s survivors blue=${sim.count(0)} red=${sim.count(1)} avgSimMs/tick=${(G.simMs / Math.max(1, G.simTicks)).toFixed(2)}`);
      setTimeout(() => { if (!G.ambient && G.sim === sim) ui.showBanner(sim.winner, sim, G.seed); }, 900);
    }
  }
  // HUD + overlay
  hudT += dtMs; fpsAcc += dtMs; fpsFrames++;
  if (!G.ambient && hudT > 180) { hudT = 0; ui.updateHud(sim, G.seed); }
  if (fpsAcc >= 500) {
    const fps = fpsFrames * 1000 / fpsAcc;
    if (G.fpsOn) ui.el.fps.textContent = `FPS ${fps.toFixed(0)}  frame ${(fpsAcc / fpsFrames).toFixed(1)}ms\nunits ${sim.count(0) + sim.count(1)}/${sim.n}  proj ${sim.pn - sim.pFreeN}\nsim ${(G.simMs / Math.max(1, G.simTicks)).toFixed(2)}ms/tick  draw ${R.stats.ms.toFixed(1)}ms\nparticles ${R.stats.particles}  seed ${G.seed}`;
    adapt(fpsAcc / fpsFrames);
    fpsAcc = 0; fpsFrames = 0;
    if (G.simTicks > 600) { G.simMs *= 0.5; G.simTicks *= 0.5; }
  }
}

// Auto quality: lower effects first, then the auto unit cap for the next battle.
function adapt(avgMs) {
  if (noAdapt || G.ambient || G.paused || document.hidden || G.sim.over) { winT = 0; winN = 0; return; }
  winT += avgMs; winN++;
  if (winN < 6) return; // ~3 s windows
  const avg = winT / winN; winT = 0; winN = 0;
  if (avg < 38 || performance.now() - lastAdapt < 4000) return;
  lastAdapt = performance.now();
  if (R.bloomOn) { R.bloomOn = false; ui.toast(t('toast.fxlow')); }
  else if (R.fx > 0) { R.fx--; ui.toast(t('toast.fxlow')); }
  else if (settings.cap === 'auto' && autoCap > TIERS[0]) { autoCap = TIERS[TIERS.indexOf(autoCap) - 1]; ui.toast(t('toast.lowered', { cap: autoCap })); ui.buildPresets(); }
}

// ---- boot ----
setLang(settings.lang);
ui.refresh(); ui.setFps(G.fpsOn);
resize();
if (params.get('selftest')) {
  const out = document.getElementById('selftestOut');
  document.getElementById('selftest').classList.remove('hidden'); document.getElementById('menu').classList.add('hidden');
  import('./selftest.js?v=2026111101').then(async (m) => {
    const lines = [];
    const res = await m.runSelfTest({ full: params.get('full') === '1', log: (s) => { lines.push(s); out.textContent = lines.join('\n'); console.log('[selftest] ' + s); } });
    window.__selftest = res;
  });
} else {
  toMenu();
  if (params.get('autostart')) startBattle(params.get('autostart'), +params.get('seed') || newSeed(), false);
}
requestAnimationFrame(frame);
document.getElementById('app').classList.add('ready');
