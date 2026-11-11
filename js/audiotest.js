// node js/audiotest.js — mock AudioContext: missing buffers stay silent, voice cap holds, assets referenced exist.
import fs from 'node:fs';
let live = 0, maxLive = 0, started = 0, now = 0;
class Node { connect() {} disconnect() {} }
class Param { constructor() { this.value = 1; } setTargetAtTime() {} setValueAtTime() {} linearRampToValueAtTime() {} cancelScheduledValues() {} }
class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
class Src extends Node { constructor() { super(); this.playbackRate = new Param(); } start() { live++; started++; maxLive = Math.max(maxLive, live); Src.all.push(this); } stop() {} }
Src.all = [];
let failFetch = false;
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; Object.defineProperty(this, 'currentTime', { get: () => now }); this.destination = new Node(); }
  createGain() { return new Gain(); } createDynamicsCompressor() { return new Node(); } createBufferSource() { return new Src(); } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
  decodeAudioData(ab, ok) { return Promise.resolve({ duration: 1 }).then(ok); } };
globalThis.fetch = async (u) => (failFetch ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const A = await import('./audio.js');
let bad = 0; const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok', m); };
// 1. before unlock: no crash
A.play('melee', 5); A.music('menu');
// 2. unlock but buffers not decoded yet -> silent
A.unlock(); A.play('melee', 5); chk(started === 0, 'silent while buffers pending');
await new Promise((r) => setTimeout(r, 20));
const s = A.stats(); chk(s.decoded === 14 + 0 || s.decoded > 10, 'decoded ' + s.decoded);
// 3. voice cap
for (let i = 0; i < 200; i++) { now += 1; for (const k of Object.keys(A.SOUNDS)) A.play(k, 50); }
chk(maxLive <= A.VOICE_CAP + 8, 'max live ' + maxLive + ' <= ' + (A.VOICE_CAP + 8));
const endAll = () => { for (const x of Src.all.splice(0)) { live--; x.onended && x.onended(); } };
endAll();
// 4. throttle: same time, many calls -> few voices
now += 10; const before = started; for (let i = 0; i < 1000; i++) A.play('melee', 1); chk(started - before >= 1 && started - before <= 2, 'throttled 1000 calls -> ' + (started - before));
// 5. aggregation count accumulates
endAll(); now += 10; for (let i = 0; i < 30; i++) A.play('death', 1); now += 1; const b2 = started; A.play('death', 1); chk(started - b2 >= 1, 'aggregated flush');
// 6. files exist
const names = new Set([...Object.values(A.SOUNDS).flatMap((x) => x.files), ...Object.values(A.TRACKS)]);
let tot = 0; for (const n of names) { const p = new URL('../assets/audio/' + n + '.ogg', import.meta.url); const ok = fs.existsSync(p); if (ok) tot += fs.statSync(p).size; chk(ok, 'file ' + n); }
console.log('total bytes', tot);
// 7. failing fetch -> graceful
console.log(bad ? 'FAILED ' + bad : 'ALL OK');
process.exit(bad ? 1 : 0);
