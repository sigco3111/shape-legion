// DOM glue: menu, HUD, settings, banner, toast, camera input (mouse/touch/pinch/wheel via pointer events).
import { t, getLang, setLang, onLang, applyI18n } from './i18n.js?v=2026111103';
import { PRESETS } from './formation.js?v=2026111103';
import { NT, UNITS } from './units.js?v=2026111103';
import { STAGES, enemyCounts } from './stages.js?v=2026111103';
import { TECH, MAXLV, POP, STAT_KEYS, STAT_PCT, mobKey, statCost, buildMods, effStage, effStats } from './upgrades.js?v=2026111103';

const $ = (id) => document.getElementById(id);
export const CAPS = ['auto', 500, 1000, 2000, 3000];

export function createUI(h) {
  const el = {};
  ['menu', 'hud', 'banner', 'settings', 'credits', 'toast', 'fps', 'debug', 'timer', 'totBlue', 'totRed', 'meterBlue', 'meterRed', 'seedTxt', 'chipsBlue', 'chipsRed', 'btnPause', 'presetSel', 'presetBtns', 'speedBtns', 'bannerTitle', 'bannerSub', 'bannerStars', 'setCap', 'setVol', 'setShake', 'setLang', 'setFx', 'view', 'stages', 'deploy', 'result', 'upgrades']
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
    el.stages.classList.toggle('hidden', name !== 'stages');
    el.deploy.classList.toggle('hidden', name !== 'deploy');
    el.upgrades.classList.toggle('hidden', name !== 'upgrades');
    if (name !== 'result') el.result.classList.add('hidden');
    el.view.style.cursor = name === 'deploy' ? 'crosshair' : '';
    if (name !== 'battle') ui.hideBanner();
  };
  ui.setCampaignHud = (on) => { el.hud.classList.toggle('campaign', on); $('help').dataset.i18n = on ? 'hud.help.camp' : 'hud.help'; $('help').textContent = t(on ? 'hud.help.camp' : 'hud.help'); };

  // ---- campaign: stage select, deploy panel, result ----
  ui.buildStages = (save) => {
    $('goldTxt').textContent = save.gold;
    const box = $('stageList'); box.innerHTML = '';
    const md = buildMods(save.up);
    STAGES.forEach((st, i) => {
      const es = effStage(st, md), locked = i + 1 > save.unlocked, b = document.createElement('button');
      b.type = 'button'; b.className = 'stage' + (locked ? ' locked' : ''); b.disabled = locked;
      const n = save.stars[i];
      b.innerHTML = `<span class="sn">${locked ? '🔒' : i + 1}</span><span class="si"><b>${t('stage.' + st.id)}</b><small>${locked ? t('stage.locked') : t('stage.' + st.id + '.desc')} · ${t('stage.info', { b: es.budget, c: es.cap })}</small></span><span class="ss">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
      b.onclick = () => h.onStagePick(i);
      box.appendChild(b);
    });
  };
  const unitBtns = [];
  for (let ty = 0; ty < NT; ty++) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.type = ty;
    b.innerHTML = `<i class="sh t${ty} b"></i><b></b><small>${UNITS[ty].cost}G</small><em>0</em>`;
    b.onclick = () => h.onDeployType(ty);
    $('dUnits').appendChild(b); unitBtns.push(b);
  }
  $('dBrush').onclick = (e) => { const b = e.target.closest('button'); if (b) h.onBrush(+b.dataset.brush); };
  $('dErase').onclick = () => h.onErase(); $('dUndo').onclick = () => h.onUndo(); $('dClear').onclick = () => h.onClear();
  $('dFight').onclick = () => h.onFight(); $('dBack').onclick = () => h.onDeployBack(); $('dFit').onclick = () => h.onFit();
  $('resRetry').onclick = () => h.onRetry(); $('resNext').onclick = () => h.onNext(); $('resMenu').onclick = () => h.onHome();
  let fullT = 0;
  ui.updateDeploy = (dep, st) => {
    const bud = st.budget, cap = st.cap;
    $('dBudgetBar').style.width = Math.min(100, 100 * dep.cost / bud) + '%'; $('dBudgetTxt').textContent = `${t('dep.gold')} ${dep.cost}/${bud}`;
    $('dPopBar').style.width = Math.min(100, 100 * dep.pop / cap) + '%'; $('dPopTxt').textContent = `${t('dep.pop')} ${dep.pop}/${cap}`;
    unitBtns.forEach((b, ty) => {
      b.children[1].textContent = t('unit.' + ty); b.children[3].textContent = dep.counts[ty];
      b.setAttribute('aria-checked', String(!dep.erase && dep.type === ty)); b.classList.toggle('poor', !dep.canAfford(ty));
    });
    const md = h.mods(); $('dBrush4').classList.toggle('hidden', md.brushMax < 4); ui.setInfo(dep.type, md);
    $('dBrush').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.brush === dep.brush));
    $('dErase').classList.toggle('on', dep.erase); $('dUndo').disabled = !dep.strokes.length;
    if (dep.limitHit) { dep.limitHit = false; $('dBudget').classList.add('full'); $('dPop').classList.add('full'); clearTimeout(fullT); fullT = setTimeout(() => { $('dBudget').classList.remove('full'); $('dPop').classList.remove('full'); }, 500); }
  };
  const pctTxt = (mul) => (mul > 1.0001 ? ` <i>(+${Math.round((mul - 1) * 100)}%)</i>` : '');
  ui.setInfo = (ty, md) => {
    const e = effStats(ty, md), perks = [];
    if (ty === 1 && md.wall) perks.push(t('info.wall', { n: Math.round(md.wall * 100) }));
    if (ty === 2 && md.vsSquare > 1) perks.push(t('info.pierce', { n: Math.round((md.vsSquare - 1) * 100) }));
    if (ty === 3 && md.charge > 1) perks.push(t('info.charge', { n: Math.round((md.charge - 1) * 100) }));
    if (ty === 4 && md.splash > 1) perks.push(t('info.splash', { n: Math.round((md.splash - 1) * 100) }));
    const mob = e.range > 0 ? `${t('info.rng')} <b>${Math.round(e.range)}</b>${pctTxt(e.mul.range)}` : `${t('info.spd')} <b>${Math.round(e.speed)}</b>${pctTxt(e.mul.speed)}`;
    $('dInfo').innerHTML = `<i class="sh t${ty} b"></i><b>${t('unit.' + ty)}</b> ${t('info.hp')} <b>${Math.round(e.hp)}</b>${pctTxt(e.mul.hp)} · ${t('info.dmg')} <b>${e.dmg.toFixed(1)}</b>${pctTxt(e.mul.dmg)} · ${mob}${perks.length ? ' · <em>' + perks.join(' · ') + '</em>' : ''}`;
  };
  // ---- upgrade screen ----
  let upTab = 'army';
  ui.buildUpgrades = (save) => {
    $('upGold').textContent = save.gold;
    $('upTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === upTab));
    const box = $('upBody'); box.innerHTML = '';
    const up = save.up;
    const mk = (parent, cls, html, cost, state, fn) => { // state: 'buy' | 'max' | 'locked'
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ub ' + cls + (state === 'max' ? ' owned' : '');
      const afford = save.gold >= cost;
      b.innerHTML = `${html}<small>${state === 'max' ? t('up.owned') : state === 'locked' ? t('up.locked') : cost + 'G'}</small>`;
      if (state === 'locked' || state === 'max') b.disabled = true; else { b.classList.toggle('poor', !afford); b.onclick = () => { if (!afford) { ui.toast(t('up.need'), 1800); return; } h.onBuy(...fn); }; }
      parent.appendChild(b); return b;
    };
    if (upTab === 'army') {
      const sec = document.createElement('div'); sec.className = 'urow';
      sec.innerHTML = `<div class="uhead"><b>${t('up.pop')}</b><span class="dim">${t('up.pop.d', { n: POP.step })}</span></div>`;
      const lv = up.pop, mx = POP.cost.length;
      mk(sec, 'wide', `<b>${t('up.lv', { l: lv, m: mx })}</b><span>+${lv * POP.step}</span>`, POP.cost[lv], lv >= mx ? 'max' : 'buy', ['pop']);
      box.appendChild(sec);
      for (let ty = 0; ty < UNITS.length; ty++) {
        const r = document.createElement('div'); r.className = 'urow';
        r.innerHTML = `<div class="uhead"><i class="sh t${ty} b"></i><b>${t('unit.' + ty)}</b></div>`;
        const g = document.createElement('div'); g.className = 'ugrid';
        STAT_KEYS.forEach((k, ki) => {
          const l = up.st[ty][ki], nm = t('up.' + (k === 'mob' ? mobKey(ty) : k));
          mk(g, '', `<b>${nm}</b><span>${t('up.lv', { l, m: MAXLV })} · +${Math.round(STAT_PCT[k] * l * 100)}%</span>`, l < MAXLV ? statCost(ty, l) : 0, l >= MAXLV ? 'max' : 'buy', ['stat', ty, ki]);
        });
        r.appendChild(g); box.appendChild(r);
      }
    } else {
      TECH.forEach((br, bi) => {
        const r = document.createElement('div'); r.className = 'urow';
        r.innerHTML = `<div class="uhead"><b>${t('tech.' + br.id)}</b><span class="dim">${up.tech[bi]}/3</span></div>`;
        const g = document.createElement('div'); g.className = 'ugrid';
        br.nodes.forEach((nd, ni) => {
          const own = up.tech[bi] > ni, state = own ? 'max' : up.tech[bi] === ni ? 'buy' : 'locked';
          mk(g, 'node', `<b>${t('tech.' + br.id + '.' + (ni + 1))}</b><span>${t('tech.' + br.id + '.' + (ni + 1) + '.d')}</span>`, nd.cost, state, ['tech', bi, ni]);
        });
        r.appendChild(g); box.appendChild(r);
      });
    }
  };
  $('upTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { upTab = b.dataset.tab; h.onUpgradesRefresh(); } };
  $('upgradesBtn').onclick = () => h.onUpgrades(); $('resUpg').onclick = () => h.onUpgrades(); $('upBack').onclick = () => h.onUpgradesBack();
  ui.setDeploy = (st, idx) => {
    $('dStage').textContent = t('stage.n', { n: idx + 1 }) + ' · ' + t('stage.' + st.id);
    $('dDesc').textContent = t('stage.' + st.id + '.desc');
    const ec = enemyCounts(st); $('dEnemy').innerHTML = ec.map((n, ty) => (n ? `<span class="chip" title="${t('unit.' + ty)}"><i class="sh t${ty} r"></i><span>${n}</span></span>` : '')).join('');
  };
  ui.showResult = (r) => {
    $('resTitle').textContent = t(r.draw ? 'res.draw' : r.win ? 'res.win' : 'res.lose'); $('resTitle').dataset.team = r.win ? 0 : 1;
    $('resSub').textContent = t('res.sub', { time: r.time.toFixed(1), s: r.sv, d: r.dv, p: Math.round(100 * r.sv / Math.max(1, r.dv)) });
    $('resStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) + (r.newBest ? '  ' + t('res.new') : '');
    $('resGold').textContent = r.win ? t('res.goldwin', { g: r.gold, b: r.base, s: r.bonus }) : t('res.golddef', { g: r.gold });
    $('resNext').classList.toggle('hidden', !r.hasNext);
    el.result.classList.remove('hidden'); $(r.win && r.hasNext ? 'resNext' : 'resRetry').focus();
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
    ui.buildPresets(); h.onTexts && h.onTexts();
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
  $('campaignBtn').onclick = () => h.onCampaign(); $('stagesBack').onclick = () => h.onMenu();
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
    el.settings.classList.remove('hidden'); resetBox(false);
  };
  const closeSettings = () => el.settings.classList.add('hidden');
  const resetBox = (on) => { $('setResetBox').classList.toggle('hidden', !on); $('setReset').classList.toggle('hidden', on); };
  $('setReset').onclick = () => resetBox(true); $('setResetNo').onclick = () => resetBox(false);
  $('setResetYes').onclick = () => { resetBox(false); closeSettings(); h.onReset(); };
  $('setClose').onclick = () => { resetBox(false); closeSettings(); };
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

  // ---- pointer input: camera (mouse/touch/pen) + painting during the deploy phase ----
  // Deploy: one pointer paints; right/middle-drag, Space+drag or two fingers move/zoom the camera. Otherwise one pointer pans.
  const view = el.view, ptrs = new Map(); // id -> { p: [x, y], kind: 'paint' | 'cam', t0 }
  let lastDist = 0, lastMid = null, spaceDown = false;
  const local = (e) => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const W = (p) => h.toWorld(p[0], p[1]);
  addEventListener('keydown', (e) => { if (e.code === 'Space' && h.isDeploy() && !e.target.matches('input,select,textarea')) { spaceDown = true; e.preventDefault(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space') { if (spaceDown) e.preventDefault(); spaceDown = false; } });
  addEventListener('blur', () => { spaceDown = false; });
  view.addEventListener('pointerdown', (e) => {
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button > 2) return;
    view.setPointerCapture(e.pointerId);
    let kind = 'cam';
    if (h.isDeploy() && !spaceDown && ptrs.size === 0 && (!mouse || e.button === 0)) kind = 'paint';
    for (const q of ptrs.values()) if (q.kind === 'paint') { q.kind = 'cam'; if (performance.now() - q.t0 < 250) h.onPaintCancel(); else h.onPaintEnd(); }
    const p = local(e); ptrs.set(e.pointerId, { p, kind, t0: performance.now() }); lastDist = 0; lastMid = null; h.onUserCamera();
    if (kind === 'paint') { const w = W(p); h.onPaintStart(w[0], w[1]); }
  });
  view.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) { if (e.pointerType === 'mouse' && h.isDeploy()) h.onHover(W(local(e))); return; }
    const prev = q.p, cur = local(e); q.p = cur;
    if (q.kind === 'paint') { h.onPaintMove(W(prev), W(cur)); return; }
    const cams = [...ptrs.values()].filter((v) => v.kind === 'cam');
    if (cams.length === 1) h.onPan(cur[0] - prev[0], cur[1] - prev[1]);
    else if (cams.length === 2) {
      const [a, b] = [cams[0].p, cams[1].p], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (lastDist) { h.onZoomAt(d / lastDist, mid[0], mid[1]); h.onPan(mid[0] - lastMid[0], mid[1] - lastMid[1]); }
      lastDist = d; lastMid = mid;
    }
  });
  const up = (e) => { const q = ptrs.get(e.pointerId); if (!q) return; ptrs.delete(e.pointerId); if (q.kind === 'paint') h.onPaintEnd(); lastDist = 0; lastMid = null; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up); view.addEventListener('lostpointercapture', up);
  view.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size) h.onHover(null); });
  view.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); h.onUserCamera(); h.onZoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), x, y); }, { passive: false });
  view.addEventListener('dblclick', () => { if (!h.isDeploy()) h.onFit(); });
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  onLang(() => refreshTexts());
  return ui;
}
