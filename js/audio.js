// Tiny synthesized SFX (no asset files). Unlocked on first user gesture; rate-limited per kind.
let ctx = null, master = null, noise = null, volume = 0.35;
const last = {};
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    ctx = new AC(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
function burst(freq, q, dur, gain, type = 'bandpass', slide = 0) {
  const t0 = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur); f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random() * 0.2, dur + 0.02);
}
// kind: melee | shot | boom | death ; n = how many events happened since last call (loudness)
export function play(kind, n = 1) {
  if (!ctx || volume <= 0 || n <= 0) return;
  const now = ctx.currentTime, gap = kind === 'boom' ? 0.12 : 0.07;
  if (last[kind] && now - last[kind] < gap) return;
  last[kind] = now;
  const k = Math.min(1, 0.25 + Math.log2(1 + n) / 5);
  if (kind === 'melee') burst(1800, 1.2, 0.07, 0.25 * k);
  else if (kind === 'shot') burst(3200, 0.8, 0.09, 0.2 * k, 'highpass');
  else if (kind === 'death') burst(600, 0.9, 0.16, 0.3 * k, 'bandpass', 0.5);
  else if (kind === 'boom') {
    burst(500, 0.7, 0.45, 0.8 * k, 'lowpass', 0.15);
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = now;
    o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(35, t0 + 0.35);
    g.gain.setValueAtTime(0.5 * k, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.45);
  }
}
