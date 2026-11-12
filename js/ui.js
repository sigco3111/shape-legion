// DOM glue: menu, HUD, settings, banner, toast, camera input (mouse/touch/pinch/wheel via pointer events).
import { t, getLang, setLang, onLang, applyI18n } from './i18n.js?v=2026111110';
import { PRESETS } from './formation.js?v=2026111110';
import { NT, UNITS } from './units.js?v=2026111110';
import { STAGES, enemyCounts } from './stages.js?v=2026111110';
import { SKILLS, cooldownLeft } from './skills.js?v=2026111110';
import * as audio from './audio.js?v=2026111110';
import { terrainFor, TERR_ICON } from './terrain.js?v=2026111110';
import { iconSvg, unitIcon } from './icons.js?v=2026111110';
import { TECH, MAXLV, POP, STAT_KEYS, STAT_PCT, mobKey, statCost, buildMods, effStage, effStats } from './upgrades.js?v=2026111110';

const $ = (id) => document.getElementById(id);
export const CAPS = ['auto', 500, 1000, 2000, 3000];
const FONT_CREDIT = { pack: 'Kenney Pixel Square (Kenney Fonts)', author: 'Kenney', license: 'CC0 1.0', url: 'https://kenney.nl/assets/kenney-fonts', files: 'assets/kenney-pixel-square.woff2 (ASCII subset, woff2)' };
const CRT_KEY = 'shapelegion.crt.v1'; // 0 off / 1 light / 2 normal (default 1); own key, separate from settings + progress
const BOOT = ['BOOT SEQUENCE...', 'ARMY REGISTRY ... OK', `${NT} UNIT TYPES LOADED`];

export function createUI(h) {
  const el = {};
  ['menu', 'hud', 'banner', 'settings', 'credits', 'toast', 'fps', 'debug', 'timer', 'totBlue', 'totRed', 'meterBlue', 'meterRed', 'seedTxt', 'chipsBlue', 'chipsRed', 'btnPause', 'presetSel', 'presetBtns', 'speedBtns', 'bannerTitle', 'bannerSub', 'bannerStars', 'setCap', 'setVol', 'setSfx', 'setMus', 'setMute', 'setShake', 'setFps', 'setLang', 'setFx', 'view', 'stages', 'deploy', 'result', 'upgrades']
    .forEach((k) => (el[k] = $(k)));
  const ui = { el, preset: h.settings.preset };

  // chips with one shape glyph per unit type
  const chipRefs = [[], []];
  for (let tm = 0; tm < 2; tm++) {
    const box = tm ? el.chipsRed : el.chipsBlue;
    for (let ty = 0; ty < NT; ty++) {
      const c = document.createElement('span'); c.className = 'chip';
      c.innerHTML = `${unitIcon(ty, 2, tm ? 'r' : 'b')}<span>0</span>`;
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
    el.fps.dataset.scr = name; // CSS hides the readout on menu / stage / upgrade screens
    if (name !== 'battle') ui.hideBanner();
    if (name === 'menu') ui.startBoot(); else ui.finishBoot();
  };
  ui.setCampaignHud = (on) => { el.hud.classList.toggle('campaign', on); { const hs = $('hStage'); if (hs) hs.textContent = on && ui.hudStage ? ui.hudStage : ''; } $('help').dataset.i18n = on ? 'hud.help.camp' : 'hud.help'; $('help').textContent = t(on ? 'hud.help.camp' : 'hud.help'); };

  // ---- campaign: stage select, deploy panel, result ----
  const buildStagesLegacy = (save) => { // old stage list (index.html without #stageMap)
    $('goldTxt').textContent = save.gold;
    const box = $('stageList'); box.innerHTML = '';
    const md = buildMods(save.up);
    STAGES.forEach((st, i) => {
      const es = effStage(st, md), locked = i + 1 > save.unlocked, b = document.createElement('button');
      b.type = 'button'; b.className = 'stage' + (locked ? ' locked' : ''); b.disabled = locked;
      const n = save.stars[i];
      const tr = terrainFor(st), tl = tr ? `<span class="terr" title="${t('terr.label')}">${tr.tags.map((k) => TERR_ICON[k] + ' ' + t('terr.' + k)).join(' · ')}</span> · ` : '';
      b.innerHTML = `<span class="sn">${locked ? '--' : i + 1}</span><span class="si"><b>${t('stage.' + st.id)}</b><small>${locked ? t('stage.locked') : tl + t('stage.' + st.id + '.desc')} · ${t('stage.info', { b: es.budget, c: es.cap, r: st.rec })}${!locked && es.budget < st.rec * 0.85 ? ` · <span class="low">! ${t('stage.low')}</span>` : ''}</small></span><span class="ss">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
      b.onclick = () => h.onStagePick(i);
      box.appendChild(b);
    });
  };
  // ---- stage select: mission map terminal (pixel-grid tactical map + briefing panel) ----
  const MAP_W = 720, MAP_H = 400;
  const NODES = [[60, 320], [150, 240], [260, 320], [370, 240], [480, 320], [590, 240], [670, 150], [560, 70], [400, 110], [150, 70]]; // route order, stage 1 -> 10
  const nodePos = (i) => NODES[i] || [60 + (i % 7) * 100, i % 2 ? 240 : 320];
  const ecCache = new Map();
  let sel = -1, cur = null;
  const isOpen = (i) => !!cur && i + 1 <= cur.unlocked;
  const frontier = (save) => { const i = save.stars.findIndex((n, k) => n === 0 && k < save.unlocked); return i >= 0 ? i : Math.min(save.unlocked, STAGES.length) - 1; };
  const starRow = (n, px, all) => [0, 1, 2].map((k) => (k < n || all ? iconSvg('star', px, k < n ? '' : 'off') : '')).join('');
  const nodeHtml = (i) => {
    const st = STAGES[i], lk = !isOpen(i), n = cur.stars[i], [x, y] = nodePos(i), tr = terrainFor(st), tags = tr ? tr.tags : [];
    const stat = lk ? t('stage.locked') : n > 0 ? t('stage.st.clear') : t('stage.st.open');
    return `<button type="button" class="nd ${lk ? 'lk' : n > 0 ? 'ok' : 'av'}" data-i="${i}" style="left:${(x / MAP_W * 100).toFixed(3)}%;top:${(y / MAP_H * 100).toFixed(3)}%" aria-label="${t('stage.n', { n: i + 1 })}${lk ? '' : ' ' + t('stage.' + st.id)} - ${stat}${n > 0 ? ' ' + n + '/3' : ''}"${lk ? ' aria-disabled="true"' : ''}><span class="tr">${tags.map((k) => iconSvg(k, 2)).join('')}</span><span class="pl">${lk ? iconSvg('lock', 3) : i + 1}</span><span class="sr">${n > 0 ? starRow(n, 2, true) : ''}</span></button>`;
  };
  const mapSvg = () => {
    let g = '', rt = '';
    for (let x = 0; x <= MAP_W; x += 40) for (let y = 0; y <= MAP_H; y += 40) g += `M${x - 1} ${y - 1}h2v2h-2z`;
    for (let i = 0; i + 1 < STAGES.length; i++) {
      const [ax, ay] = nodePos(i), [bx, by] = nodePos(i + 1);
      rt += `<path class="rt${isOpen(i + 1) ? ' on' : ''}" d="M${ax} ${ay}H${bx}V${by}"/>`;
    }
    let lab = ''; for (let k = 0; k < 18; k++) lab += `<text x="${20 + k * 40}" y="12" text-anchor="middle">${String.fromCharCode(65 + k)}</text>`;
    for (let k = 1; k < 10; k++) lab += `<text x="6" y="${k * 40 + 3}">${k}</text>`;
    return `<svg class="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="mg" d="${g}"/><g class="ml">${lab}</g>${rt}</svg>`;
  };
  const briefHtml = () => {
    const i = sel, st = STAGES[i], es = effStage(st, buildMods(cur.up)), n = cur.stars[i], tr = terrainFor(st);
    let ec = ecCache.get(st.id); if (!ec) ecCache.set(st.id, (ec = enemyCounts(st)));
    const low = es.budget < st.rec * 0.85;
    const terr = tr ? tr.tags.map((k) => `<span class="tg">${iconSvg(k, 2)}${t('terr.' + k)}</span>`).join('') : `<span class="dim">${t('terr.none')}</span>`;
    const enemy = ec.map((c, ty) => (c ? `<span class="ec" title="${t('unit.' + ty)}">${unitIcon(ty, 2, 'r')}<b>${c}</b><small>${t('unit.' + ty)}</small></span>` : '')).join('');
    return `<div class="bh"><span>${t('stage.n', { n: i + 1 })}</span><em>${n > 0 ? t('stage.st.clear') : t('stage.st.open')}</em></div>
<h2>${t('stage.' + st.id)}</h2><p class="bd">${t('stage.' + st.id + '.desc')}</p>
<div class="kv"><div><span>${t('stage.budget')}</span><b>${es.budget}G</b></div><div><span>${t('stage.rec')}</span><b>${st.rec}G</b></div><div><span>${t('stage.gold')}</span><b>${cur.gold}G</b></div><div><span>${t('stage.pop')}</span><b>${es.cap}</b></div></div>
${low ? `<div class="lg warn"><span>! ${t('stage.low')}</span></div>` : ''}
<div class="lg"><span>${t('terr.label')}</span><div class="tgs">${terr}</div></div>
<div class="lg"><span>${t('stage.enemy')}</span><div class="ecs">${enemy}</div></div>
<div class="lg col"><span>${t('stage.rule')}</span><div class="rule"><span>${starRow(1, 2)} ${t('stage.r1')}</span><span>${starRow(2, 2)} ${t('stage.r2')}</span><span>${starRow(3, 2)} ${t('stage.r3')}</span></div></div>
<div class="lg"><span>${t('stage.best')}</span><b class="bst">${n > 0 ? starRow(n, 2, true) : `<span class="dim">${t('stage.none')}</span>`}</b></div>`;
  };
  const go = () => { if (cur && sel >= 0 && isOpen(sel)) h.onStagePick(sel); };
  function paintSel(focus) {
    const map = $('stageMap'); if (!map) return;
    map.querySelectorAll('.nd').forEach((b) => { const on = +b.dataset.i === sel; b.classList.toggle('sel', on); b.tabIndex = on ? 0 : -1; if (on) { b.setAttribute('aria-current', 'true'); if (focus) b.focus({ preventScroll: true }); } else b.removeAttribute('aria-current'); });
    $('stageBrief').innerHTML = briefHtml();
    const wrap = map.parentElement, b = map.querySelector('.nd.sel');
    if (b && wrap && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, b.offsetLeft - wrap.clientWidth / 2);
  }
  function selectStage(i, focus) { if (!isOpen(i)) return; sel = i; paintSel(focus); }
  function navStage(dir) {
    let j = sel;
    if (dir === 'left' || dir === 'right') { const k = sel + (dir === 'right' ? 1 : -1); if (k >= 0 && k < STAGES.length && isOpen(k)) j = k; }
    else {
      const [cx, cy] = nodePos(sel); let bs = 1e9;
      for (let k = 0; k < STAGES.length; k++) {
        if (k === sel || !isOpen(k)) continue;
        const [x, y] = nodePos(k), dx = x - cx, dy = y - cy;
        if (dir === 'up' ? dy >= -10 : dy <= 10) continue;
        const sc = dy * dy + 3 * dx * dx; if (sc < bs) { bs = sc; j = k; }
      }
    }
    if (j !== sel) selectStage(j, true);
  }
  ui.buildStages = (save) => {
    $('goldTxt').textContent = save.gold;
    if (!$('stageMap')) return buildStagesLegacy(save);
    cur = save; if (!(sel >= 0 && sel < STAGES.length && isOpen(sel))) sel = frontier(save);
    const map = $('stageMap');
    map.innerHTML = mapSvg() + STAGES.map((_, i) => nodeHtml(i)).join('');
    paintSel(false);
  };
  { const map = $('stageMap'); if (map) map.onclick = (e) => {
    const b = e.target.closest('.nd'); if (!b) return; const i = +b.dataset.i;
    if (!isOpen(i)) { ui.toast(t('stage.locked.tap'), 1800); return; }
    if (i === sel) go(); else selectStage(i, false);
  }; }
  { const g = $('stageGo'); if (g) g.onclick = go; }
  addEventListener('keydown', (e) => {
    if (!$('stageMap') || el.stages.classList.contains('hidden') || !cur || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!el.settings.classList.contains('hidden') || !el.credits.classList.contains('hidden')) return;
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (dir) { e.preventDefault(); navStage(dir); }
    else if (e.key === 'Enter' && !e.target.closest('button,a,select,input')) { e.preventDefault(); go(); }
    else if (e.key === 'Escape') { e.preventDefault(); h.onMenu(); }
  });
  const unitBtns = [];
  for (let ty = 0; ty < NT; ty++) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.type = ty;
    b.innerHTML = `<span class="ico">${unitIcon(ty, 3, 'b')}</span><b></b><small>${UNITS[ty].cost}G</small><em>0</em>`;
    b.onclick = () => h.onDeployType(ty);
    $('dUnits').appendChild(b); unitBtns.push(b);
  }
  $('dBrush').onclick = (e) => { const b = e.target.closest('button'); if (b) h.onBrush(+b.dataset.brush); };
  $('dErase').onclick = () => h.onErase(); $('dUndo').onclick = () => h.onUndo(); $('dClear').onclick = () => h.onClear();
  $('dFight').onclick = () => h.onFight(); $('dBack').onclick = () => h.onDeployBack(); $('dFit').onclick = () => h.onFit();
  $('resRetry').onclick = () => h.onRetry(); $('resNext').onclick = () => h.onNext(); $('resMenu').onclick = () => h.onHome();
  let fullT = 0;
  const blocks = (v, max) => Math.ceil(Math.min(1, v / Math.max(1, max)) * 20) * 5; // 20-block bar: width in 5 % steps
  const setTxt = (n, v) => { if (n._v !== v) { n._v = v; n.textContent = v; } };
  const setW = (n, v) => { if (n._w !== v) { n._w = v; n.style.width = v + '%'; } };
  ui.updateDeploy = (dep, st) => {
    const bud = st.budget, cap = st.cap;
    setW($('dBudgetBar'), blocks(dep.cost, bud)); setTxt($('dBudgetTxt'), `${dep.cost}/${bud}G`);
    setW($('dPopBar'), blocks(dep.pop, cap)); setTxt($('dPopTxt'), `${dep.pop}/${cap}`);
    unitBtns.forEach((b, ty) => {
      setTxt(b.children[1], t('unit.' + ty)); setTxt(b.children[3], dep.counts[ty]);
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
    $('dInfo').innerHTML = `${unitIcon(ty, 1, 'b')} <b>${t('unit.' + ty)}</b> ${t('info.hp')} <b>${Math.round(e.hp)}</b>${pctTxt(e.mul.hp)} · ${t('info.dmg')} <b>${e.dmg.toFixed(1)}</b>${pctTxt(e.mul.dmg)} · ${mob}${perks.length ? ' · <em>' + perks.join(' · ') + '</em>' : ''}`;
  };
  // ---- commander skills (battle HUD) ----
  const skBtns = [];
  const setH = (n, v) => { if (n._h !== v) { n._h = v; n.style.height = v + '%'; } };
  SKILLS.forEach((sk, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sk'; b.dataset.skill = i;
    b.innerHTML = `<kbd>${sk.key}</kbd><b></b><small></small><i class="cdf"></i><span class="cdt"></span>`;
    b.onclick = () => h.onSkill(i, false);
    $('skills').appendChild(b); skBtns.push(b);
  });
  ui.buildSkills = (st) => { // st = skill state or null (hidden)
    $('skills').classList.toggle('hidden', !st);
    skBtns.forEach((b, i) => { b.children[1].textContent = t('skill.' + SKILLS[i].id); b.title = t('skill.' + SKILLS[i].id + '.d') + (st && !st.unlocked[i] ? ' — ' + t('skill.locked', { n: [0, 1, 2][i] }) : ''); });
    if (st) ui.updateSkills(st, 0);
  };
  ui.updateSkills = (st, time) => {
    if (!st) return;
    skBtns.forEach((b, i) => {
      const sk = SKILLS[i], cd = cooldownLeft(st, i, time), usable = st.unlocked[i] && st.uses[i] > 0;
      setTxt(b.children[1], t('skill.' + sk.id));
      setTxt(b.children[2], !st.unlocked[i] ? 'LOCK' : `x${st.uses[i]}/${sk.uses}`);
      const fill = usable && cd > 0 ? Math.ceil(Math.min(1, cd / sk.cd) * 10) * 10 : 0; // block fill in 10 % steps
      setH(b.children[3], fill);
      setTxt(b.children[4], usable && cd > 0 ? cd.toFixed(cd < 10 ? 1 : 0) : '');
      b.classList.toggle('cd', usable && cd > 0); b.classList.toggle('off', !usable); b.classList.toggle('lk', !st.unlocked[i]);
      b.classList.toggle('ready', usable && cd <= 0); b.classList.toggle('aim', st.aim === i);
    });
    el.view.style.cursor = st.aim >= 0 ? 'crosshair' : '';
  };
  // ---- upgrade screen: 'war ledger' (left nav plates | stat rows with block bars, or the tech tree diagram + detail panel) ----
  let upTab = 0, upSel = null;
  const NAV = [0, 1, 2, 3, 4, 'pop', 'tech'];
  const navIcon = (n) => (typeof n === 'number' ? unitIcon(n, 3) : iconSvg(n === 'pop' ? 'arrow' : 'tree', 3));
  const navName = (n) => t('up.nav.' + n);
  const BR_ICON = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'flag'];
  const lvBar = (l, m) => `<span class="lvb" role="img" aria-label="${t('up.lv', { l, m })}">${Array.from({ length: m }, (_, k) => `<i${k < l ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const techState = (up, bi, ni) => (up.tech[bi] > ni ? 'own' : up.tech[bi] === ni ? 'av' : 'lk');
  const statRow = (fk, icon, name, l, m, cur, next, cost, gold, buy) => {
    const max = l >= m, short = max ? 0 : Math.max(0, cost - gold);
    return `<div class="sr${max ? ' mx' : ''}"><div class="sn">${icon}<b>${name}</b></div>${lvBar(l, m)}<div class="sv"><b>${cur}</b>${max ? '' : `<small>&gt; ${next}</small>`}</div>`
      + `<div class="sc"><span class="cost">${max ? t('up.max') : cost + 'G'}</span>${short ? `<small class="short">${t('up.short', { n: short })}</small>` : ''}</div>`
      + `<button type="button" class="buy br" data-fk="${fk}" data-buy="${buy}"${max || short ? ' disabled' : ''}>${max ? t('up.owned') : t('up.buy')}</button></div>`;
  };
  const techDetail = (save) => {
    const [bi, ni] = upSel, br = TECH[bi], nd = br.nodes[ni], s = techState(save.up, bi, ni), short = Math.max(0, nd.cost - save.gold), key = `tech.${br.id}.${ni + 1}`;
    return `<div class="dt-h">${iconSvg(BR_ICON[bi], 3)}<span>${t('tech.' + br.id)} ${ni + 1}/3</span><em class="st ${s}">${t('up.state.' + s)}</em></div><h2>${t(key)}</h2><p class="bd">${t(key + '.d')}</p>`
      + `<div class="lg"><span>${t('up.cost')}</span><b>${nd.cost}G</b></div><div class="lg"><span>${t('up.gold')}</span><b>${save.gold}G</b></div>`
      + (s === 'lk' ? `<div class="lg warn"><span>! ${t('up.locked')}</span></div>` : s === 'av' && short ? `<div class="lg warn"><span>! ${t('up.short', { n: short })}</span></div>` : '')
      + `<button type="button" class="buy br" data-fk="tb" data-buy="tech:${bi}:${ni}"${s === 'av' && !short ? '' : ' disabled'}>${s === 'own' ? t('up.owned') : t('up.buy')}</button>`;
  };
  ui.buildUpgrades = (save) => {
    $('upGold').textContent = save.gold + 'G';
    { const tb = $('upTabs'); if (tb) tb.classList.add('hidden'); }
    const box = $('upBody'), act = document.activeElement, fk = act && box.contains(act) ? act.dataset.fk : null, up = save.up, gold = save.gold;
    const nav = `<nav class="wl-nav" aria-label="${t('up.title')}">${NAV.map((n) => `<button type="button" class="nv${n === upTab ? ' on' : ''}${n === 'pop' ? ' sep' : ''}" data-nav="${n}" data-fk="nv${n}"${n === upTab ? ' aria-current="page"' : ''}>${navIcon(n)}<span>${navName(n)}</span></button>`).join('')}</nav>`;
    let main = '';
    if (typeof upTab === 'number') {
      const ty = upTab, e = effStats(ty, buildMods(up)), mob = e.range > 0 ? `${t('info.rng')} ${Math.round(e.range)}` : `${t('info.spd')} ${Math.round(e.speed)}`;
      main = `<div class="wl-h"><span class="big-ic">${unitIcon(ty, 5, 'b')}</span><h2>${t('unit.' + ty)}</h2><p class="bd">${t('info.hp')} ${Math.round(e.hp)} · ${t('info.dmg')} ${e.dmg.toFixed(1)} · ${mob}</p></div>`
        + STAT_KEYS.map((k, ki) => { const l = up.st[ty][ki], pc = Math.round(STAT_PCT[k] * 100); return statRow(`s${ki}`, `<span class="k">${['HP', 'ATK', 'MOB'][ki]}</span>`, t('up.' + (k === 'mob' ? mobKey(ty) : k)), l, MAXLV, `+${pc * l}%`, `+${pc * (l + 1)}%`, l < MAXLV ? statCost(ty, l) : 0, gold, `stat:${ty}:${ki}`); }).join('');
    } else if (upTab === 'pop') {
      const l = up.pop, m = POP.cost.length;
      main = `<div class="wl-h"><span class="big-ic">${iconSvg('arrow', 5)}</span><h2>${t('up.pop')}</h2><p class="bd">${t('up.pop.d', { n: POP.step })}</p></div>`
        + statRow('p', `<span class="k">POP</span>`, t('up.pop'), l, m, `+${l * POP.step}`, `+${(l + 1) * POP.step}`, l < m ? POP.cost[l] : 0, gold, 'pop');
    } else {
      if (!upSel || !TECH[upSel[0]]) { const bi = TECH.findIndex((b, i) => up.tech[i] < b.nodes.length); upSel = bi < 0 ? [0, 0] : [bi, up.tech[bi]]; }
      const tree = TECH.map((br, bi) => `<div class="tt-row"><span class="tt-l">${iconSvg(BR_ICON[bi], 2)}<b>${t('tech.' + br.id)}</b></span>${br.nodes.map((nd, ni) => {
        const s = techState(up, bi, ni), on = upSel[0] === bi && upSel[1] === ni;
        return `<i class="cn${ni === 0 || up.tech[bi] >= ni ? ' on' : ''}"></i><button type="button" class="tn ${s}${on ? ' sel' : ''}" data-node="${bi}:${ni}" data-fk="n${bi}:${ni}" aria-pressed="${on}" aria-label="${t('tech.' + br.id)} ${ni + 1}: ${t('tech.' + br.id + '.' + (ni + 1))} - ${t('up.state.' + s)}">${s === 'own' ? iconSvg('check', 3) : s === 'lk' ? iconSvg('lock', 2) : ni + 1}</button>`;
      }).join('')}</div>`).join('');
      main = `<div class="tt-wrap"><div class="tt" role="group" aria-label="${t('up.tech')}"><div class="tt-root">${t('up.root')}</div>${tree}</div><aside class="tt-detail" aria-live="polite">${techDetail(save)}</aside></div>`;
    }
    box.innerHTML = nav + `<div class="wl-main">${main}</div>`;
    const back = fk && box.querySelector(`[data-fk="${fk}"]:not(:disabled)`) || (fk && box.querySelector(`[data-fk="nv${upTab}"]`));
    if (back) back.focus({ preventScroll: true });
  };
  $('upBody').addEventListener('click', (e) => {
    const nv = e.target.closest('[data-nav]'), nd = e.target.closest('[data-node]'), by = e.target.closest('[data-buy]');
    if (nv) { upTab = /^\d+$/.test(nv.dataset.nav) ? +nv.dataset.nav : nv.dataset.nav; h.onUpgradesRefresh(); }
    else if (nd) { upSel = nd.dataset.node.split(':').map(Number); h.onUpgradesRefresh(); }
    else if (by && !by.disabled) { const p = by.dataset.buy.split(':'); if (h.onBuy(...(p[0] === 'pop' ? ['pop'] : [p[0], +p[1], +p[2]]))) ui.toast(t('up.bought'), 1200); }
  });
  $('upBody').addEventListener('keydown', (e) => { // arrows: up/down through nav plates; tech tree nodes in 2D
    const k = e.key, f = e.target; if (e.ctrlKey || e.metaKey || e.altKey || !k.startsWith('Arrow')) return;
    if (f.dataset.nav != null && (k === 'ArrowUp' || k === 'ArrowDown')) { const all = [...$('upBody').querySelectorAll('[data-nav]')], i = all.indexOf(f) + (k === 'ArrowDown' ? 1 : -1); if (all[i]) { e.preventDefault(); all[i].focus(); } }
    else if (f.dataset.node != null) {
      const [b, n] = f.dataset.node.split(':').map(Number), nb = b + (k === 'ArrowDown') - (k === 'ArrowUp'), nn = n + (k === 'ArrowRight') - (k === 'ArrowLeft'), nx = $('upBody').querySelector(`[data-node="${nb}:${nn}"]`);
      if (nx) { e.preventDefault(); nx.focus(); }
    }
  });
  $('upgradesBtn').onclick = () => h.onUpgrades(); $('resUpg').onclick = () => h.onUpgrades(); $('upBack').onclick = () => h.onUpgradesBack();
  ui.setDeploy = (st, idx) => {
    const name = t('stage.n', { n: idx + 1 }) + ' · ' + t('stage.' + st.id);
    $('dStage').textContent = name; ui.hudStage = name;
    const hs = $('hStage'); if (hs) hs.textContent = name;
    const wl = $('dWallet'); if (wl && h.gold) wl.textContent = h.gold() + 'G';
    { const tr = terrainFor(st); $('dLegend').innerHTML = tr ? tr.tags.map((k) => `<span>${iconSvg(k, 1)} ${t('terr.' + k)}: ${t('legend.' + k)}</span>`).join(' · ') : ''; $('dDesc').innerHTML = (tr ? tr.tags.map((k) => iconSvg(k, 1) + ' ' + t('terr.' + k)).join(' · ') + ' — ' : '') + t('stage.' + st.id + '.desc'); }
    const ec = enemyCounts(st); $('dEnemy').innerHTML = ec.map((n, ty) => (n ? `<span class="chip" title="${t('unit.' + ty)}">${unitIcon(ty, 2, 'r')}<span>${n}</span></span>` : '')).join('');
  };
  let payT = 0;
  const lgRow = (k, v, cls = '') => `<div class="lg ${cls}"><span>${k}</span><b>${v}</b></div>`;
  ui.showResult = (r) => {
    const rt = $('resTitle'), L = $('resLedger'), P = $('resPay'), st = STAGES[r.idx];
    const key = r.draw ? 'draw' : r.win ? 'win' : 'lose', pct = Math.round(100 * r.sv / Math.max(1, r.dv));
    rt.textContent = L ? t('res.stamp.' + key) : t('res.' + key); rt.dataset.team = r.win ? 0 : 1; rt.dataset.res = key;
    { const hd = $('resHdr'); if (hd) hd.textContent = `${t('res.hdr')} // ${r.idx != null ? t('stage.n', { n: r.idx + 1 }) : ''}${st ? ' · ' + t('stage.' + st.id) : ''}`; }
    $('resSub').textContent = L ? t('res.' + key) : t('res.sub', { time: r.time.toFixed(1), s: r.sv, d: r.dv, p: pct });
    const stars = $('resStars'), nb = r.newBest ? `<b class="nb">${t('res.new')}</b>` : '';
    if (L) {
      stars.innerHTML = [0, 1, 2].map((k) => iconSvg('star', 5, `${k < r.stars ? 'lit' : 'off'}" style="--i:${k}`)).join('') + nb;
      stars.setAttribute('aria-label', t('banner.stars', { n: r.stars }));
      const rows = [[t('res.l.time'), r.time.toFixed(1) + 's']];
      if (r.units != null) rows.push([t('res.l.dep'), `${r.units}`], [t('res.l.surv'), `${r.surv} / ${r.units}`]);
      L.innerHTML = rows.map((x, i) => lgRow(x[0], x[1]).replace('class="lg ', `style="--i:${i}" class="lg `)).join('')
        + `<div class="lg lv" style="--i:${rows.length}"><span>${t('res.l.val')}</span><div class="bar"><i style="width:${blocks(r.sv, r.dv)}%"></i></div><b>${pct}%</b></div>`
        + (r.kills != null ? lgRow(t('res.l.kill'), `${r.kills} / ${r.foes}`).replace('class="lg ', `style="--i:${rows.length + 1}" class="lg `) : '');
    } else stars.textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) + (r.newBest ? '  ' + t('res.new') : '');
    if (P) {
      const lines = r.win ? [[t('res.l.base'), '+' + r.base + 'G'], [t('res.l.bonus'), '+' + r.bonus + 'G']] : [];
      P.innerHTML = lines.map((x) => lgRow(x[0], x[1])).join('') + `<div class="lg tot"><span>${t(r.win ? 'res.l.total' : 'res.l.cons')}</span><b id="resTotal">+0G</b></div>` + (r.wallet != null ? lgRow(t('res.l.wallet'), r.wallet + 'G', 'wal2') : '');
      const tot = $('resTotal'), calm = matchMedia('(prefers-reduced-motion: reduce)').matches; clearInterval(payT);
      if (calm || r.gold <= 0) tot.textContent = '+' + r.gold + 'G';
      else { let k = 0; payT = setInterval(() => { k++; tot.textContent = '+' + (k >= 14 ? r.gold : Math.round(r.gold * k / 14)) + 'G'; if (k >= 14) clearInterval(payT); }, 45); }
    } else { const g = $('resGold'); if (g) g.textContent = r.win ? t('res.goldwin', { g: r.gold, b: r.base, s: r.bonus }) : t('res.golddef', { g: r.gold }); }
    $('resNext').classList.toggle('hidden', !r.hasNext);
    { const bar = el.result.querySelector('.rpt-bar'); if (bar) bar.classList.toggle('three', !r.hasNext); }
    const card = el.result.querySelector('.menu-card'); if (card) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in'); card.scrollTop = 0; }
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
    setTxt(el.totBlue, a); setTxt(el.totRed, b);
    for (let tm = 0; tm < 2; tm++) for (let ty = 0; ty < NT; ty++) setTxt(chipRefs[tm][ty].lastChild, sim.cnt[tm * NT + ty]);
    const va = sim.value(0), vb = sim.value(1), tot = Math.max(1, va + vb);
    const wb = Math.round(20 * va / tot) * 5; setW(el.meterBlue, wb); setW(el.meterRed, 100 - wb); // 20-block bar
    const s = Math.floor(sim.time);
    setTxt(el.timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    setTxt(el.seedTxt, `${t('hud.seed')} ${seed}`);
  };
  const refreshTexts = () => {
    applyI18n(document); tglTxt();
    ui.buildPresets(); h.onTexts && h.onTexts();
    chipRefs.forEach((arr, tm) => arr.forEach((c, ty) => { c.title = `${t('team.' + tm)} ${t('unit.' + ty)}`; }));
    el.btnPause.title = t(h.isPaused() ? 'hud.play' : 'hud.pause');
    el.setLang.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
    $('menuLang').innerHTML = getLang() === 'ko' ? 'LANG: <b>[KO]</b> EN' : 'LANG: KO <b>[EN]</b>';
  };
  ui.refresh = refreshTexts;
  ui.setPaused = (p) => { el.btnPause.textContent = p ? '>' : 'II'; el.btnPause.title = t(p ? 'hud.play' : 'hud.pause'); };
  ui.setSpeed = (s) => el.speedBtns.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  ui.setFps = (on) => el.fps.classList.toggle('hidden', !on);

  // ---- buttons ----
  $('demoBtn').onclick = () => h.onDemo();
  $('campaignBtn').onclick = () => h.onCampaign(); $('stagesBack').onclick = () => h.onMenu();
  $('menuSettings').onclick = () => ui.openSettings();
  $('menuCredits').onclick = () => { ui.buildCredits(); openModal(el.credits, () => $('creditsList')); };
  $('creditsClose').onclick = () => closeModal(el.credits);
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
  const paintRange = (inp) => { inp.style.setProperty('--v', (100 * inp.value / (inp.max || 1)) + '%'); const o = inp.closest('.fld'), rv = o && o.querySelector('.rv'); if (rv) rv.textContent = Math.round(100 * inp.value / (inp.max || 1)) + '%'; };
  const tglTxt = () => document.querySelectorAll('input.tgl').forEach((i) => { i.dataset.on = t('set.on'); i.dataset.off = t('set.off'); });
  const trap = (sec) => sec.addEventListener('keydown', (e) => { // keep Tab inside an open modal
    if (e.key !== 'Tab') return;
    const f = [...sec.querySelectorAll('button:not(:disabled),select,input,a[href],[tabindex="0"]')].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  let lastFocus = null;
  const openModal = (sec, first) => { if (sec.classList.contains('hidden')) lastFocus = document.activeElement; sec.classList.remove('hidden'); const f = first && first(); if (f) f.focus({ preventScroll: true }); };
  const closeModal = (sec) => { if (sec.classList.contains('hidden')) return false; sec.classList.add('hidden'); if (lastFocus && lastFocus.isConnected && lastFocus.offsetParent) lastFocus.focus({ preventScroll: true }); lastFocus = null; return true; };
  ui.openSettings = () => {
    const s = h.settings; autoOpt(); tglTxt();
    el.setCap.value = String(s.cap); el.setShake.checked = s.shake;
    if (el.setFps) el.setFps.checked = !!(h.fpsOn && h.fpsOn());
    const au = audio.settings(); el.setVol.value = au.master; el.setSfx.value = au.sfx; el.setMus.value = au.music; el.setMute.checked = au.mute;
    [el.setVol, el.setSfx, el.setMus].forEach(paintRange);
    el.setFx.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.fx === s.fx));
    ui.setCrt(ui.getCrt(), false);
    resetBox(false); openModal(el.settings, () => el.setLang.querySelector('button.on') || el.setLang.querySelector('button'));
  };
  const closeSettings = () => closeModal(el.settings);
  const resetBox = (on) => { $('setResetBox').classList.toggle('hidden', !on); $('setReset').classList.toggle('hidden', on); if (on) $('setResetNo').focus(); };
  $('setReset').onclick = () => resetBox(true); $('setResetNo').onclick = () => { resetBox(false); $('setReset').focus(); };
  $('setResetYes').onclick = () => { resetBox(false); closeSettings(); h.onReset(); };
  $('setClose').onclick = () => { resetBox(false); closeSettings(); };
  el.setLang.onclick = (e) => { const b = e.target.closest('button'); if (b) { setLang(b.dataset.lang); h.onLang(b.dataset.lang); autoOpt(); tglTxt(); } };
  el.setCap.onchange = () => { h.onSetting('cap', el.setCap.value === 'auto' ? 'auto' : +el.setCap.value); ui.buildPresets(); };
  for (const [k, id] of [['master', 'setVol'], ['sfx', 'setSfx'], ['music', 'setMus']]) el[id].oninput = () => { audio.set(k, +el[id].value); paintRange(el[id]); };
  el.setMute.onchange = () => audio.set('mute', el.setMute.checked);
  if (el.setFps) el.setFps.onchange = () => { if (h.fpsOn && !!h.fpsOn() !== el.setFps.checked) h.onFps(); };
  const SEC = (k, rows) => `<section class="cl-sec"><h2 class="lbl">${t('credits.sec.' + k)}</h2>${rows}</section>`;
  const licBadge = (c) => { const by = /BY/i.test(c.license); return `<span class="lic ${by ? 'by' : 'zero'}">[${by ? 'CC-BY' : 'CC0'}]</span>`; };
  const credRow = (c) => `<article class="ce"><div class="ct"><b>${c.pack}</b>${licBadge(c)}</div><div class="cm">${t('credits.by')}: ${c.author} · ${t('credits.lic')}: ${c.licenseUrl ? `<a href="${c.licenseUrl}" target="_blank" rel="noopener">${c.license}</a>` : c.license}</div><a class="cu" href="${c.url}" target="_blank" rel="noopener">${c.url}</a><div class="cf">${t('credits.files')}: ${c.files}</div>${c.attribution ? `<div class="ca">${c.attribution}</div>` : ''}</article>`;
  ui.buildCredits = () => {
    const code = { pack: 'Shape Legion', author: 'sigco3111', license: 'MIT', url: 'https://github.com/sigco3111/shape-legion', files: 'js/*.js, css/style.css, index.html' };
    $('creditsList').innerHTML = SEC('code', credRow(code).replace(/<span class="lic[^>]*>[^<]*<\/span>/, '<span class="lic zero">[MIT]</span>')) + SEC('font', credRow(FONT_CREDIT)) + SEC('sound', audio.CREDITS.map(credRow).join(''));
    $('creditsList').tabIndex = 0;
  };
  el.setShake.onchange = () => h.onSetting('shake', el.setShake.checked);
  el.setFx.onclick = (e) => { const b = e.target.closest('button'); if (b) { h.onSetting('fx', +b.dataset.fx); ui.openSettings(); } };
  for (const id of ['settings', 'credits']) { el[id].addEventListener('pointerdown', (e) => { if (e.target === el[id]) closeModal(el[id]); }); trap(el[id]); }

  // ---- CRT effect level (html[data-crt]; first applied by the inline script in index.html) ----
  ui.getCrt = () => { try { const v = localStorage.getItem(CRT_KEY), n = v == null ? 1 : +v; return n === 0 || n === 1 || n === 2 ? n : 1; } catch (e) { return 1; } };
  ui.setCrt = (n, store = true) => {
    n = n === 0 || n === 1 || n === 2 ? n : 1;
    document.documentElement.dataset.crt = String(n);
    if (store) try { localStorage.setItem(CRT_KEY, String(n)); } catch (e) { /* private mode */ }
    const box = $('setCrt'); if (box) box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.crt === n));
  };
  ui.setCrt(ui.getCrt(), false);
  { const box = $('setCrt'); if (box) box.onclick = (e) => { const b = e.target.closest('button'); if (b) ui.setCrt(+b.dataset.crt); }; }

  // ---- start screen: typed boot lines (any key / tap skips; never blocks the menu) + keyboard menu ----
  let bootDone = false, bootTimer = 0;
  const bootBox = () => $('boot');
  ui.finishBoot = () => {
    clearTimeout(bootTimer); bootTimer = 0;
    const box = bootBox(); if (!box || bootDone) return;
    bootDone = true; box.innerHTML = BOOT.map((l) => `<div>${l}</div>`).join('');
  };
  ui.startBoot = () => {
    const box = bootBox(); if (!box || bootDone || bootTimer) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ui.finishBoot(); return; }
    box.innerHTML = ''; let li = 0, ci = 0, row = null;
    const tick = () => {
      if (li >= BOOT.length) { bootTimer = 0; bootDone = true; if (row) row.classList.remove('cur'); return; }
      if (ci === 0) { if (row) row.classList.remove('cur'); row = document.createElement('div'); row.className = 'cur'; box.appendChild(row); }
      ci++; row.textContent = BOOT[li].slice(0, ci);
      let wait = 24;
      if (ci >= BOOT[li].length) { li++; ci = 0; wait = 220; }
      bootTimer = setTimeout(tick, wait);
    };
    bootTimer = setTimeout(tick, 120);
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (bootTimer) ui.finishBoot(); }, { capture: true, passive: true });
  const mItems = [...document.querySelectorAll('#menuList button')]; let mSel = Math.max(0, mItems.findIndex((b) => b.classList.contains('sel')));
  const markSel = () => mItems.forEach((b, i) => b.classList.toggle('sel', i === mSel));
  mItems.forEach((b, i) => { const on = () => { mSel = i; markSel(); }; b.addEventListener('pointerenter', on); b.addEventListener('focus', on); });
  addEventListener('keydown', (e) => {
    if (!mItems.length || el.menu.classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!el.settings.classList.contains('hidden') || !el.credits.classList.contains('hidden') || e.target.matches('input,select,textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mSel = (mSel + (e.key === 'ArrowDown' ? 1 : mItems.length - 1)) % mItems.length; markSel(); mItems[mSel].focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button,a')) { e.preventDefault(); mItems[mSel].click(); }
  });

  // ---- keyboard ----
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.target.matches('select')) { // innermost first: modal -> result -> upgrades -> aim
      if (closeModal(el.settings) || closeModal(el.credits)) return;
      if (!el.result.classList.contains('hidden')) { h.onMenu(); return; }
      if (!el.upgrades.classList.contains('hidden')) { h.onUpgradesBack(); return; }
      h.onCancelAim(); return;
    }
    if (e.target.matches('input,select,textarea')) return;
    if (el.hud.classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); h.onPause(); }
    else if (k === 'f') h.onFit();
    else if (k === 'r') h.onReplay();
    else if (h.isCampaign() && (k === '1' || k === '2' || k === '3')) h.onSkill(+k - 1, true);
    else if (h.isCampaign() && (k === '4' || k === '5' || k === '6')) h.onSpeed([1, 2, 4][+k - 4]);
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
    const p = local(e); ptrs.set(e.pointerId, { p, p0: p, kind, t0: performance.now(), aim: kind === 'cam' && ptrs.size === 0 && h.isAiming() }); lastDist = 0; lastMid = null; h.onUserCamera();
    if (kind === 'paint') { const w = W(p); h.onPaintStart(w[0], w[1]); }
  });
  view.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) { if (e.pointerType === 'mouse') h.onHover(W(local(e))); return; }
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
  const up = (e) => { const q = ptrs.get(e.pointerId); if (!q) return; ptrs.delete(e.pointerId); if (q.kind === 'paint') h.onPaintEnd(); if (q.aim && ptrs.size === 0 && e.type === 'pointerup' && performance.now() - q.t0 < 900 && Math.hypot(q.p[0] - q.p0[0], q.p[1] - q.p0[1]) < 12) h.onAimTap(W(q.p)); lastDist = 0; lastMid = null; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up); view.addEventListener('lostpointercapture', up);
  view.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size) h.onHover(null); });
  view.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); h.onUserCamera(); h.onZoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), x, y); }, { passive: false });
  view.addEventListener('dblclick', () => { if (!h.isDeploy()) h.onFit(); });
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  onLang(() => refreshTexts());
  return ui;
}
