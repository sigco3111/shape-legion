// WebAudio engine: lazy start on first gesture, decoded-buffer cache, pooled voices (hard cap), per-sound min interval + random pitch,
// event aggregation (hit counts per ~100 ms -> one or two sounds), music with crossfade. Silent (no errors) when assets/AudioContext are missing.
const KEY = 'shapelegion.audio.v1';
const BASE = new URL('../assets/audio/', import.meta.url).href;
export const VOICE_CAP = 24, PITCH = 0.06;

// kind -> files (random variant), gain, gap = min seconds between triggers (also the aggregation window), per = max simultaneous voices of the kind, pri = bypasses the voice cap
export const SOUNDS = {
  melee: { files: ['melee_1', 'melee_2', 'melee_3'], gain: 0.5, gap: 0.09, per: 4, agg: true },
  arrow: { files: ['arrow_hit'], gain: 0.45, gap: 0.1, per: 3, agg: true },
  shot: { files: ['arrow_shot'], gain: 0.28, gap: 0.12, per: 3, agg: true },
  wall: { files: ['arrow_hit'], gain: 0.3, gap: 0.12, per: 2, agg: true, rate: 0.8 },
  cat: { files: ['catapult_launch'], gain: 0.6, gap: 0.2, per: 2, agg: true },
  boom: { files: ['boulder_boom'], gain: 0.7, gap: 0.14, per: 3, agg: true },
  death: { files: ['death_1', 'death_2'], gain: 0.35, gap: 0.12, per: 3, agg: true },
  rally: { files: ['skill_rally'], gain: 0.8, gap: 0.3, per: 1, pri: true },
  volley: { files: ['skill_volley'], gain: 0.8, gap: 0.3, per: 1, pri: true },
  charge: { files: ['skill_charge'], gain: 0.8, gap: 0.3, per: 1, pri: true },
  click: { files: ['ui_click'], gain: 0.5, gap: 0.04, per: 2, pri: true },
  confirm: { files: ['ui_confirm'], gain: 0.6, gap: 0.1, per: 1, pri: true },
  victory: { files: ['victory'], gain: 0.8, gap: 1, per: 1, pri: true },
  defeat: { files: ['defeat'], gain: 0.8, gap: 1, per: 1, pri: true },
};
export const TRACKS = { menu: 'bgm_menu', battle: 'bgm_battle' };

// Credits shown in-game (js/ui.js) and mirrored in CREDITS.md. All files were converted to OGG (and trimmed); no other change.
export const CREDITS = [
  { pack: 'Impact Sounds', author: 'Kenney', license: 'CC0 1.0', url: 'https://kenney.nl/assets/impact-sounds', files: 'melee_1, melee_3, arrow_hit, catapult_launch, death_1, death_2' },
  { pack: 'Interface Sounds', author: 'Kenney', license: 'CC0 1.0', url: 'https://kenney.nl/assets/interface-sounds', files: 'arrow_shot, ui_click, ui_confirm' },
  { pack: 'Music Jingles', author: 'Kenney', license: 'CC0 1.0', url: 'https://kenney.nl/assets/music-jingles', files: 'skill_rally, skill_charge, victory, defeat' },
  { pack: 'Metal Impact Sounds', author: 'BMacZero (Brian MacIntosh)', license: 'CC0 1.0', url: 'https://opengameart.org/content/metal-impact-sounds', files: 'melee_2' },
  { pack: 'Fantasy Magic Spell', author: 'Almitory', license: 'CC0 1.0', url: 'https://opengameart.org/content/fantasy-magic-spell', files: 'skill_volley' },
  { pack: 'Rpg Loop 1', author: 'Tozan', license: 'CC0 1.0', url: 'https://opengameart.org/content/rpg-loop-1', files: 'bgm_battle' },
  { pack: 'Calm Ambient 3 (Lifewave 2k)', author: 'Snabisch', license: 'CC0 1.0', url: 'https://opengameart.org/content/calm-ambient-3-lifewave-2k', files: 'bgm_menu (first 90 s)' },
  { pack: 'Boom Pack 2', author: 'dklon', license: 'CC-BY 3.0', url: 'https://opengameart.org/content/boom-pack-2', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', files: 'boulder_boom', attribution: 'dklon — "Boom Pack 2" (https://opengameart.org/content/boom-pack-2), CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Converted to OGG and trimmed.' },
];

const DEF = { master: 0.8, sfx: 0.8, music: 0.5, mute: false };
let S = { ...DEF };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }

let ctx = null, master = null, sfxBus = null, musBus = null, comp = null;
const buffers = new Map(), loading = new Map(), failed = new Set();
const st = { played: 0, dropped: 0, throttled: 0 };
const acc = {}, last = {}, live = {};
let voices = 0, want = null, cur = null, loadStarted = false;

export function settings() { return { ...S }; }
function applyGains() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(S.mute ? 0 : S.master, t, 0.03); sfxBus.gain.setTargetAtTime(S.sfx, t, 0.03); musBus.gain.setTargetAtTime(S.music, t, 0.05);
}
export function set(k, v) {
  if (!(k in DEF)) return;
  S[k] = k === 'mute' ? !!v : Math.max(0, Math.min(1, +v || 0));
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  applyGains();
}
export function setVolume(v) { set('master', v); } // legacy

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC();
      comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain();
      sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      applyGains();
    }
    if (ctx.state !== 'running' && ctx.resume) ctx.resume().catch(() => {});
    if (!loadStarted) { loadStarted = true; preload(); }
    if (want) music(want);
  } catch (e) { ctx = null; }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (loading.has(name)) return loading.get(name);
  const p = (async () => {
    try {
      const r = await fetch(BASE + name + '.ogg'); if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      const buf = await new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q && q.catch) q.catch(rej); });
      buffers.set(name, buf); return buf;
    } catch (e) { failed.add(name); return null; }
  })();
  loading.set(name, p); return p;
}
async function preload() {
  const sfx = [...new Set(Object.values(SOUNDS).flatMap((s) => s.files))];
  await Promise.all(sfx.map(load));
  await Promise.all(Object.values(TRACKS).map(load));
  if (want) music(want);
}

// ---- sfx ----
function trigger(kind, loud) {
  const d = SOUNDS[kind]; if (!d || !ctx || ctx.state === 'closed') return false;
  const names = d.files.filter((f) => buffers.has(f)); if (!names.length) return false; // not decoded (yet / failed): silence
  if (voices >= VOICE_CAP && !d.pri) { st.dropped++; return false; }
  if (voices >= VOICE_CAP + 8) { st.dropped++; return false; }
  if ((live[kind] || 0) >= d.per) { st.dropped++; return false; }
  const buf = buffers.get(names[(Math.random() * names.length) | 0]);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = (d.rate || 1) * (1 + (Math.random() * 2 - 1) * PITCH);
  g.gain.value = d.gain * loud * (0.9 + Math.random() * 0.2);
  src.connect(g); g.connect(sfxBus);
  voices++; live[kind] = (live[kind] || 0) + 1; st.played++;
  src.onended = () => { voices--; live[kind]--; try { g.disconnect(); } catch (e) { /* ignore */ } };
  try { src.start(); } catch (e) { voices--; live[kind]--; return false; }
  return true;
}
// Call every frame with the number of events seen that frame. Aggregates per kind: when the kind's interval has elapsed, the
// accumulated count maps to loudness and to one voice (two when >= 12 events).
export function play(kind, n = 1) {
  const d = SOUNDS[kind]; if (!ctx || !d || n <= 0 || S.mute) return;
  const now = ctx.currentTime;
  if (d.agg) {
    acc[kind] = (acc[kind] || 0) + n;
    if (last[kind] !== undefined && now - last[kind] < d.gap) { st.throttled++; return; }
    n = acc[kind]; acc[kind] = 0;
  } else if (last[kind] !== undefined && now - last[kind] < d.gap) { st.throttled++; return; }
  last[kind] = now;
  const k = Math.min(1, 0.3 + Math.log2(1 + n) / 5);
  trigger(kind, k);
  if (d.agg && n >= 12) trigger(kind, k * 0.7);
}

// ---- music ----
export function music(name) {
  want = name || null;
  if (!ctx) return;
  if (cur && cur.name === want) return;
  const t = ctx.currentTime;
  if (cur) { const o = cur; cur = null; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(o.g.gain.value, t); o.g.gain.linearRampToValueAtTime(0, t + 1.2); setTimeout(() => { try { o.src.stop(); o.g.disconnect(); } catch (e) { /* ignore */ } }, 1400); }
  if (!want) return;
  const buf = buffers.get(TRACKS[want]); if (!buf) return; // preload() calls music(want) again when decoded
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5);
  src.connect(g); g.connect(musBus);
  try { src.start(); cur = { name: want, src, g }; } catch (e) { /* ignore */ }
}

export function stats() {
  const dur = {}; buffers.forEach((b, k) => { dur[k] = +b.duration.toFixed(2); });
  return { state: ctx ? ctx.state : 'none', decoded: buffers.size, failed: [...failed], voices, music: cur ? cur.name : null, ...st, durations: dur };
}
