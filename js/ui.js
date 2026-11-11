// DOM glue: menu, HUD, settings, banner, toast, camera input (mouse/touch/pinch/wheel via pointer events).
import { t, getLang, setLang, onLang, applyI18n } from './i18n.js?v=2026111101';
import { PRESETS } from './formation.js?v=2026111101';
import { NT } from './units.js?v=2026111101';

const $ = (id) => document.getElementById(id);
export const CAPS = ['auto', 500, 1000, 2000, 3000];

export function createUI(h) {
  const el = {};
  ['menu', 'hud', 'banner', 'settings', 'credits', 'toast', 'fps', 'debug', 'timer', 'totBlue', 'totRed', 'meterBlue', 'meterRed', 'seedTxt', 'chipsBlue', 'chipsRed', 'btnPause', 'presetSel', 'presetBtns', 'speedBtns', 'bannerTitle', 'bannerSub', 'bannerStars', 'setCap', 'setVol', 'setShake', 'setLang', 'setFx', 'view']
    .forEach((k) => (el[k] = $(k)));
  const ui = { el, preset: h.settings.preset };

  // chips with one shape glyph per unit type
  const chipRefs = [[], []];
  for (let tm = 0; tm < 2; tm++) {
    const box = tm ? el.chipsRed : el.chipsBlue;
    for (let ty = 0; ty < NT; ty++) {
      const c = document.createElement('span'); c.className = 'chip';
      c.innerHTML = `<i class="sh t${ty} ${tm ? 'r' : 'b'}"></i><span>0</span>`;
      box.appendChild(c); chipRefs[tm].push(c);
    }
  }

  function presetLabel(p, cap) {
    const n = Math.min(p.perSide, Math.floor(cap / 2));
    return `${t('preset.' + p.id)} ${n} vs ${n}`;
  }
  ui.buildPresets = () => {
    const cap = h.effectiveCap();
    el.presetBtns.innerHTML = ''; el.presetSel.innerHTML = '';
    for (const p of PRESETS) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio');
      b.dataset.preset = p.id; b.textContent = presetLabel(p, cap) + (p.perSide * 2 > cap ? ' *' : '');
      b.setAttribute('aria-checked', String(p.id === ui.preset));
      b.onclick = () => { ui.preset = p.id; h.onPreset(p.id); ui.buildPresets(); };
      el.presetBtns.appendChild(b);
      const o = document.createElement('option'); o.value = p.id; o.textContent = presetLabel(p, cap); o.selected = p.id === ui.preset; el.presetSel.appendChild(o);
    }
  };
  el.presetSel.onchange = () => { ui.preset = el.presetSel.value; h.onPreset(ui.preset); h.onNew(); ui.buildPresets(); };

  ui.showScreen = (name) => {
    el.menu.classList.toggle('hidden', name !== 'menu');
    el.hud.classList.toggle('hidden', name !== 'battle');
    if (name !== 'battle') ui.hideBanner();
  };
  ui.hideBanner = () => el.banner.classList.add('hidden');
  ui.showBanner = (winner, sim, seed) => {
    el.bannerTitle.textContent = t(winner < 0 ? 'banner.draw' : 'banner.win' + winner);
    el.bannerTitle.dataset.team = winner;
    el.bannerSub.textContent = t('banner.sub', { time: sim.time.toFixed(1), n: winner < 0 ? 0 : sim.count(winner), seed });
    const st = winner === 0 ? sim.stars(0) : 0;
    el.bannerStars.textContent = winner === 0 ? '★'.repeat(st) + '☆'.repeat(3 - st) : '';
    el.banner.classList.remove('hidden');
    $('bnNew').focus();
  };
  let toastT = 0;
  ui.toast = (msg, ms = 4500) => { el.toast.textContent = msg; el.toast.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.add('hidden'), ms); };

  ui.updateHud = (sim, seed) => {
    const a = sim.count(0), b = sim.count(1);
    el.totBlue.textContent = a; el.totRed.textContent = b;
    for (let tm = 0; tm < 2; tm++) for (let ty = 0; ty < NT; ty++) chipRefs[tm][ty].lastChild.textContent = sim.cnt[tm * NT + ty];
    const va = sim.value(0), vb = sim.value(1), tot = Math.max(1, va + vb);
    el.meterBlue.style.width = (100 * va / tot).toFixed(1) + '%'; el.meterRed.style.width = (100 * vb / tot).toFixed(1) + '%';
    const s = Math.floor(sim.time);
    el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.seedTxt.textContent = `${t('hud.seed')} ${seed}`;
  };
  const refreshTexts = () => {
    applyI18n(document);
    ui.buildPresets();
    chipRefs.forEach((arr, tm) => arr.forEach((c, ty) => { c.title = `${t('team.' + tm)} ${t('unit.' + ty)}`; }));
    el.btnPause.title = t(h.isPaused() ? 'hud.play' : 'hud.pause');
    el.setLang.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  };
  ui.refresh = refreshTexts;
  ui.setPaused = (p) => { el.btnPause.textContent = p ? '▶' : '⏸'; el.btnPause.title = t(p ? 'hud.play' : 'hud.pause'); };
  ui.setSpeed = (s) => el.speedBtns.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  ui.setFps = (on) => el.fps.classList.toggle('hidden', !on);

  // ---- buttons ----
  $('demoBtn').onclick = () => h.onDemo();
  $('menuSettings').onclick = () => ui.openSettings();
  $('menuCredits').onclick = () => el.credits.classList.remove('hidden');
  $('creditsClose').onclick = () => el.credits.classList.add('hidden');
  $('menuLang').onclick = () => { setLang(getLang() === 'ko' ? 'en' : 'ko'); h.onLang(getLang()); };
  $('btnMenu').onclick = () => h.onMenu(); $('bnMenu').onclick = () => h.onMenu();
  $('btnSettings').onclick = () => ui.openSettings();
  el.btnPause.onclick = () => h.onPause();
  el.speedBtns.onclick = (e) => { const b = e.target.closest('button'); if (b) h.onSpeed(+b.dataset.speed); };
  $('btnReplay').onclick = () => h.onReplay(); $('bnReplay').onclick = () => h.onReplay();
  $('btnNew').onclick = () => h.onNew(); $('bnNew').onclick = () => h.onNew();
  $('btnFit').onclick = () => h.onFit();
  $('btnFps').onclick = () => h.onFps();

  // ---- settings ----
  el.setCap.innerHTML = CAPS.map((c) => `<option value="${c}">${c === 'auto' ? '' : c}</option>`).join('');
  const autoOpt = () => { el.setCap.options[0].textContent = `${t('set.auto')} (${h.autoCap()})`; };
  ui.openSettings = () => {
    const s = h.settings; autoOpt();
    el.setCap.value = String(s.cap); el.setVol.value = s.volume; el.setShake.checked = s.shake;
    el.setFx.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.fx === s.fx));
    el.settings.classList.remove('hidden');
  };
  const closeSettings = () => el.settings.classList.add('hidden');
  $('setClose').onclick = closeSettings;
  el.setLang.onclick = (e) => { const b = e.target.closest('button'); if (b) { setLang(b.dataset.lang); h.onLang(b.dataset.lang); autoOpt(); } };
  el.setCap.onchange = () => { h.onSetting('cap', el.setCap.value === 'auto' ? 'auto' : +el.setCap.value); ui.buildPresets(); };
  el.setVol.oninput = () => h.onSetting('volume', +el.setVol.value);
  el.setShake.onchange = () => h.onSetting('shake', el.setShake.checked);
  el.setFx.onclick = (e) => { const b = e.target.closest('button'); if (b) { h.onSetting('fx', +b.dataset.fx); ui.openSettings(); } };
  for (const id of ['settings', 'credits']) el[id].addEventListener('pointerdown', (e) => { if (e.target === el[id]) el[id].classList.add('hidden'); });

  // ---- keyboard ----
  addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key === 'Escape') { closeSettings(); el.credits.classList.add('hidden'); return; }
    if (el.hud.classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); h.onPause(); }
    else if (k === 'f') h.onFit();
    else if (k === 'r') h.onReplay();
    else if (k === '1' || k === '2' || k === '3') h.onSpeed([1, 2, 4][+k - 1]);
    else if (k === '+' || k === '=') h.onZoom(1.2); else if (k === '-') h.onZoom(1 / 1.2);
    else if (k === 'arrowleft') h.onPan(80, 0); else if (k === 'arrowright') h.onPan(-80, 0);
    else if (k === 'arrowup') h.onPan(0, 80); else if (k === 'arrowdown') h.onPan(0, -80);
  });

  // ---- camera input: pointer events (mouse + touch + pen), wheel zoom, pinch ----
  const view = el.view, ptrs = new Map();
  let lastDist = 0, lastMid = null;
  const local = (e) => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); lastDist = 0; lastMid = null; h.onUserCamera();
  });
  view.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), cur = local(e); ptrs.set(e.pointerId, cur);
    if (ptrs.size === 1) h.onPan(cur[0] - prev[0], cur[1] - prev[1]);
    else if (ptrs.size === 2) {
      const [p, q] = [...ptrs.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]), mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (lastDist) { h.onZoomAt(d / lastDist, mid[0], mid[1]); h.onPan(mid[0] - lastMid[0], mid[1] - lastMid[1]); }
      lastDist = d; lastMid = mid;
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); lastDist = 0; lastMid = null; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up); view.addEventListener('lostpointercapture', up);
  view.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); h.onUserCamera(); h.onZoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), x, y); }, { passive: false });
  view.addEventListener('dblclick', () => h.onFit());
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  onLang(() => refreshTexts());
  return ui;
}
