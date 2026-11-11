// Entry: game loop (fixed 30 Hz sim, interpolated render), battle controller, settings, adaptive quality.
import { Sim } from './sim.js?v=2026111109';
import { DT, NT, UNITS } from './units.js?v=2026111109';
import { PRESETS, setupBattle } from './formation.js?v=2026111109';
import { Renderer } from './render.js?v=2026111109';
import { createUI } from './ui.js?v=2026111109';
import { setLang, t, applyI18n } from './i18n.js?v=2026111109';
import { newSeed } from './rng.js?v=2026111109';
import * as audio from './audio.js?v=2026111109';
import { STAGES, loadSave, storeSave, resetSave, recordResult, starsFor, rewardFor } from './stages.js?v=2026111109';
import { buildMods, effStage, buyPop, buyStat, buyTech } from './upgrades.js?v=2026111109';
import { Deploy, fillSim, fillPreview, drawOverlay } from './deploy.js?v=2026111109';
import { terrainFor } from './terrain.js?v=2026111109';
import { SKILLS, newSkillState, canUse, cooldownLeft } from './skills.js?v=2026111109';
import { SK } from './units.js?v=2026111109';

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
// Audio: start on the first gesture (autoplay policy / mobile), UI click sounds by delegation.
for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled) audio.play(b.classList.contains('big') || b.id === 'dFight' ? 'confirm' : 'click'); }, true);

const G = { screen: 'menu', sim: null, seed: 0, ambient: true, paused: false, speed: 1, acc: 0, perSide: 0, history: [], nextLog: 5, bannerShown: false, ambientTimer: 0, userCam: false, simMs: 0, simTicks: 0, fpsOn: settings.fps, camp: null, sk: null, cursor: null };
let SAVE = loadSave();
window.__sl = { G, R, settings, audio, get save() { return SAVE; }, get camp() { return G.camp; }, get sim() { return G.sim; }, startBattle: (...a) => startBattle(...a) };

const ui = createUI({
  settings, effectiveCap, autoCap: () => autoCap, isPaused: () => G.paused,
  onDemo: () => { audio.unlock(); startBattle(settings.preset, urlSeed || newSeed(), false); urlSeed = 0; },
  onPreset: (id) => { settings.preset = id; save(); },
  onReplay: () => (G.camp ? startFight() : startBattle(settings.preset, G.seed, false)),
  onNew: () => startBattle(settings.preset, newSeed(), false),
  onMenu: () => (G.camp ? toStages() : toMenu()),
  onTexts: () => { if (G.sk) ui.buildSkills(G.sk); if (G.screen === 'stages') ui.buildStages(SAVE); if (G.screen === 'upgrades') ui.buildUpgrades(SAVE); if (G.camp) { ui.setDeploy(STAGES[G.camp.idx], G.camp.idx); G.camp.dirty = true; } },
  onCampaign: () => { audio.unlock(); toStages(); },
  onStagePick: (i) => startDeploy(i),
  mods: () => buildMods(SAVE.up),
  gold: () => SAVE.gold,
  onUpgrades: () => toUpgrades(),
  onUpgradesBack: () => toStages(),
  onUpgradesRefresh: () => ui.buildUpgrades(SAVE),
  onBuy: (k, a, b) => {
    const ok = k === 'pop' ? buyPop(SAVE) : k === 'stat' ? buyStat(SAVE, a, b) : buyTech(SAVE, a, b);
    if (ok) { storeSave(SAVE); console.log(`[upgrade] ${k} ${a ?? ''} ${b ?? ''} gold=${SAVE.gold}`); }
    ui.buildUpgrades(SAVE); return ok;
  },
  onReset: () => { SAVE = resetSave(); console.log('[save] reset'); if (G.camp || G.screen === 'stages' || G.screen === 'upgrades') toStages(); ui.toast(t('set.reset.done'), 2500); },
  isDeploy: () => G.screen === 'deploy',
  toWorld: (sx, sy) => [R.cam.x + (sx - R.vw / 2) / R.cam.zoom, R.cam.y + (sy - R.vh / 2) / R.cam.zoom],
  onDeployType: (ty) => { const d = G.camp.dep; d.type = ty; d.erase = false; G.camp.dirty = true; },
  onBrush: (n) => { G.camp.dep.brush = n; G.camp.dirty = true; },
  onErase: () => { const d = G.camp.dep; d.erase = !d.erase; G.camp.dirty = true; },
  onUndo: () => { G.camp.dep.undo(); G.camp.dirty = true; },
  onClear: () => { G.camp.dep.clear(); G.camp.dirty = true; },
  onFight: () => startFight(),
  onDeployBack: () => toStages(),
  onHome: () => toMenu(),
  onRetry: () => startDeploy(G.camp.idx, G.camp.dep.cells),
  onNext: () => startDeploy(Math.min(STAGES.length - 1, G.camp.idx + 1)),
  onPaintStart: (x, y) => { const d = G.camp.dep; d.begin(); d.paintAt(x, y); G.camp.hover = [x, y]; G.camp.dirty = true; blockedToast(d); },
  onPaintMove: (a, b) => { const d = G.camp.dep; d.paintLine(a[0], a[1], b[0], b[1]); G.camp.hover = b; G.camp.dirty = true; blockedToast(d); },
  onPaintEnd: () => { G.camp.dep.end(); G.camp.dirty = true; },
  onPaintCancel: () => { G.camp.dep.cancel(); G.camp.dirty = true; },
  onHover: (w) => { G.cursor = w; if (G.camp) { G.camp.hover = w; } },
  isCampaign: () => !!G.camp && G.screen === 'battle',
  isAiming: () => !!G.sk && G.sk.aim >= 0 && G.screen === 'battle',
  onSkill: (i, fromKey) => useSkill(i, fromKey),
  onAimTap: (w) => { if (G.sk && G.sk.aim >= 0) castSkill(G.sk.aim, w); },
  onCancelAim: () => { if (G.sk && G.sk.aim >= 0) { G.sk.aim = -1; ui.updateSkills(G.sk, G.sim ? G.sim.time : 0); } },
  onPause: () => setPaused(!G.paused),
  onSpeed: (s) => { G.speed = s; ui.setSpeed(s); },
  onFit: () => { fitView(); G.userCam = false; },
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

function blockedToast(d) { if (d.blockHit) { d.blockHit = false; if (performance.now() - (G.blkToast || 0) > 1500) { G.blkToast = performance.now(); ui.toast(t('dep.blocked'), 1400); } } }
function toMenu() {
  audio.music('menu'); G.screen = 'menu'; G.camp = null; endSkills(); R.overlay = null; ui.setCampaignHud(false); ui.showScreen('menu'); ui.buildPresets(); startAmbient();
}
// Fit the arena between the deploy top bar and bottom panel (plain fit elsewhere).
function fitView() {
  R.cam.fit(R.vw, R.vh);
  if (G.screen !== 'deploy') return;
  const top = document.querySelector('#dTop .dinfo').getBoundingClientRect().bottom + 6, bot = R.vh - document.getElementById('dPanel').getBoundingClientRect().top + 6;
  const z = Math.max(0.15, Math.min(R.vw / 1660, (R.vh - top - bot) / 940));
  R.cam.zoom = z; R.cam.minZoom = Math.min(z * 0.8, 0.5); R.cam.y = 450 + (bot - top) / 2 / z; R.cam.x = 800;
}
function toStages() {
  audio.music('menu'); G.screen = 'stages'; G.camp = null; endSkills(); R.overlay = null; ui.setCampaignHud(false); ui.showScreen('stages'); ui.buildStages(SAVE);
  if (!G.ambient) startAmbient();
}
function toUpgrades() {
  audio.music('menu'); G.screen = 'upgrades'; G.camp = null; endSkills(); R.overlay = null; ui.setCampaignHud(false); ui.showScreen('upgrades'); ui.buildUpgrades(SAVE);
  if (!G.ambient) startAmbient();
}
function startDeploy(idx, cells) {
  const st = effStage(STAGES[idx], buildMods(SAVE.up)), dep = new Deploy(st, cells); // st = stage with upgrade-adjusted budget / population cap
  const sim = G.camp && G.camp.prevSim ? G.camp.prevSim : new Sim({ cap: 3200, seed: st.seed, events: false });
  G.camp = { idx, st, dep, prevSim: sim, dirty: true, hover: null, lastVer: -1 };
  audio.music('menu'); endSkills(); clearTimeout(G.ambientTimer); G.screen = 'deploy'; G.ambient = false; G.paused = false; G.speed = 1; G.bannerShown = false;
  ui.setCampaignHud(true); ui.setPaused(false); ui.setSpeed(1); ui.showScreen('deploy'); ui.setDeploy(st, idx);
  G.sim = sim; G.seed = st.seed; G.acc = 0; R.clearFx(); R.setTerrain(terrainFor(st));
  R.overlay = (c) => drawOverlay(c, G.camp.dep, G.camp.hover, R.cam.zoom);
  fitView(); G.userCam = false;
}
function startFight() {
  const cp = G.camp; if (!cp) return;
  if (cp.dep.pop === 0) { ui.toast(t('dep.empty'), 2500); return; }
  const st = cp.st, sim = new Sim({ cap: 3200, seed: st.seed, events: true });
  sim.setMods(0, buildMods(SAVE.up)); // upgrades apply to the player team only; the sim's base table is untouched
  fillSim(sim, st, cp.dep);
  audio.music('battle'); G.sim = sim; G.seed = st.seed; G.screen = 'battle'; G.ambient = false; G.acc = 0; G.history = []; G.nextLog = 5; G.bannerShown = false; G.simMs = 0; G.simTicks = 0;
  R.clearFx(); R.overlay = null; cp.hover = null;
  ui.setCampaignHud(true); ui.showScreen('battle'); ui.setFps(G.fpsOn); setPaused(false); G.speed = 1; ui.setSpeed(1);
  G.sk = newSkillState(buildMods(SAVE.up).skills); ui.buildSkills(G.sk);
  ui.updateHud(sim, st.seed);
  console.log(`[campaign] fight stage=${st.id} blue=${sim.count(0)} red=${sim.count(1)} cost=${cp.dep.cost}/${st.budget} seed=${st.seed}`);
}
function endSkills() { G.sk = null; ui.buildSkills(null); ui.el.view.style.cursor = ''; }
// Commander skills: Rally (aim at the cursor/tap), Volley, Charge. Cooldowns run on sim time; a cast that affects nobody costs nothing.
function useSkill(i, fromKey) {
  const sk = G.sk, sim = G.sim;
  if (!sk || !G.camp || G.screen !== 'battle' || !sim || sim.over) return;
  if (!sk.unlocked[i]) { ui.toast(t('skill.locked', { n: [0, 1, 2][i] }), 2000); return; }
  if (sk.uses[i] <= 0 || cooldownLeft(sk, i, sim.time) > 0 || G.paused) return;
  if (SKILLS[i].aim) {
    if (sk.aim === i) { sk.aim = -1; ui.updateSkills(sk, sim.time); return; }
    if (fromKey && G.cursor) { castSkill(i, G.cursor); return; }
    sk.aim = i; ui.toast(t('skill.aim'), 3000); ui.updateSkills(sk, sim.time); return;
  }
  castSkill(i, null);
}
function castSkill(i, w) {
  const sk = G.sk, sim = G.sim, def = SKILLS[i];
  if (!sk || !sim || sim.over || !canUse(sk, i, sim.time)) return;
  const n = i === 0 ? sim.castRally(0, w[0], w[1]) : i === 1 ? sim.castVolley(0) : sim.castCharge(0);
  sk.aim = -1;
  if (n > 0) audio.play(['rally', 'volley', 'charge'][i]);
  if (n === 0) { ui.toast(t('skill.none'), 1500); ui.updateSkills(sk, sim.time); return; }
  sk.uses[i]--; sk.next[i] = sim.time + def.cd;
  R.skillFx(i, sim.fxPts, sim.fxN, w ? w[0] : 0, w ? w[1] : 0, SK.rallyRadius);
  ui.toast(t('skill.cast', { name: t('skill.' + def.id) }) + ` (${n})`, 1200); ui.updateSkills(sk, sim.time);
  console.log(`[skill] ${def.id} t=${sim.time.toFixed(1)}s units=${n} uses=${sk.uses[i]} cd=${def.cd}s`);
}
function finishCampaign(sim) {
  const cp = G.camp, st = STAGES[cp.idx], win = sim.winner === 0;
  const sv = sim.value(0), dv = sim.value(0, true), stars = starsFor(win, sv, dv), gold = rewardFor(st, win, sv);
  const newBest = stars > SAVE.stars[cp.idx];
  recordResult(SAVE, cp.idx, stars, gold);
  console.log(`[campaign] result stage=${st.id} win=${win} stars=${stars} gold=+${gold} survivors=${sv}/${dv} total=${SAVE.gold}`);
  ui.showResult({ win, draw: sim.winner < 0, stars, newBest, gold, base: win ? st.reward : 0, bonus: Math.floor(sv * 0.5), time: sim.time, sv, dv, hasNext: win && cp.idx + 1 < STAGES.length && SAVE.unlocked > cp.idx + 1 });
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
  R.clearFx(); R.setTerrain(null);
  return sim;
}

function startBattle(presetId, seed, ambient) {
  const p = PRESETS.find((x) => x.id === presetId) || PRESETS[1];
  const cap = effectiveCap(), perSide = Math.min(p.perSide, Math.floor(cap / 2));
  if (perSide < p.perSide) ui.toast(t('toast.scaled', { cap, n: perSide }));
  settings.preset = p.id; save();
  audio.music('battle'); G.screen = 'battle'; G.ambient = false; ui.showScreen('battle'); ui.buildPresets(); ui.setFps(G.fpsOn);
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
  if (first || !G.userCam) { const z = G.ambient ? 1.12 : 1; R.cam.fit(w, h); R.cam.zoom *= z; if (G.screen === 'deploy') fitView(); }
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
  const deploying = G.screen === 'deploy';
  if (deploying && G.camp.dirty) { G.camp.dirty = false; fillPreview(sim, G.camp.st, G.camp.dep); ui.updateDeploy(G.camp.dep, G.camp.st); if (!G.camp.refit) { G.camp.refit = true; if (!G.userCam) fitView(); } } // panel height is final after the first update
  if (!G.paused && !sim.over && !deploying) {
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
    for (const k of ['melee', 'arrow', 'shot', 'cat', 'wall', 'boom', 'death']) if (a[k]) audio.play(k, a[k]);
  }
  R.updateFx(G.paused ? 0 : (dtMs / 1000) * sp);
  R.draw(sim, sim.over || G.paused || deploying ? 1 : G.acc / DT);

  // end of battle
  if (sim.over && !G.bannerShown) {
    G.bannerShown = true;
    if (G.ambient) { clearTimeout(G.ambientTimer); G.ambientTimer = setTimeout(() => { if (G.ambient) startAmbient(); }, 2500); }
    else {
      logStats(sim);
      console.log(`[battle-end] winner=${sim.winner < 0 ? 'draw' : sim.winner ? 'red' : 'blue'} t=${sim.time.toFixed(1)}s survivors blue=${sim.count(0)} red=${sim.count(1)} avgSimMs/tick=${(G.simMs / Math.max(1, G.simTicks)).toFixed(2)}`);
      setTimeout(() => { if (!G.ambient && G.sim === sim) { audio.music(null); audio.play(sim.winner === 0 ? 'victory' : 'defeat'); if (G.camp) finishCampaign(sim); else ui.showBanner(sim.winner, sim, G.seed); } }, 900);
    }
  }
  // HUD + overlay
  hudT += dtMs; fpsAcc += dtMs; fpsFrames++;
  if (!G.ambient && !deploying && hudT > 180) { hudT = 0; ui.updateHud(sim, G.seed); if (G.sk) ui.updateSkills(G.sk, sim.time); }
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
  import('./selftest.js?v=2026111109').then(async (m) => {
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
