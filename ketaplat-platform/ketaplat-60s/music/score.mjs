// music/score.mjs: the reel's original score, synthesized from scratch (no samples) and locked to reel/cues.js.
//   node music/score.mjs → music/score.wav, then:
//   ffmpeg -y -i music/score.wav -af "highpass=f=30,equalizer=f=250:t=q:w=1:g=-2,loudnorm=I=-14:TP=-1.2:LRA=8" -c:a aac -b:a 192k assets/score.m4a
// 120 BPM, A minor-ish, electronic: 808-style kick, clap, hats, a saw-ish bass, pluck arps, pads, in-key stabs/blips.
// SOUND RULE: no noise whooshes on transitions (they tire the ear fast). Chapter changes: swell(); cuts inside a chapter:
// bloom / glide / harp / hatRoll, or nothing. See references/sound.md in the kinetic-reel skill.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const C = require('../reel/cues.js'), S = C.S, Hh = C.hits;
const SR = 44100, DUR = C.dur + 1, N = Math.ceil(SR * DUR), BEAT = .5, TAU = Math.PI * 2;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const duck = new Float32Array(N).fill(1);   // sidechain: kick ducks the music bus
const musL = new Float32Array(N), musR = new Float32Array(N);
let seed = 7; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function put(t0, len, gen, { gain = 1, pan = 0, rev = 0, bus = 'drum' } = {}) {
  const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor((t0 + len) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  const BL = bus === 'mus' ? musL : L, BR = bus === 'mus' ? musR : R;
  // float rounding can make the first sample's local time -1e-16, and pow() of a negative is NaN: clamp it
  for (let i = i0; i < i1; i++) { const v = gen(Math.max(0, (i - t0 * SR) / SR)); BL[i] += v * gl; BR[i] += v * gr; sendL[i] += v * gl * rev; sendR[i] += v * gr * rev; }
}
function noise(t0, len, env, filt, o = {}) {
  let lp = 0, bp = 0;
  put(t0, len, tt => { const n = rnd() * 2 - 1, [fc, q0] = filt(tt), q = Math.max(q0, .45), f = Math.min(.85, 2 * Math.sin(Math.PI * Math.min(fc, SR / 7) / SR)); lp += f * bp; const hp = n - lp - q * bp; bp += f * hp; return env(tt) * (o.hp ? hp : o.lp ? lp : bp); }, o);   // f/q clamped: the SVF blows up near f = 1
}
// ---------- drums ----------
const kick = (t, v = 1) => {
  put(t, .55, tt => v * Math.sin(TAU * (48 * tt + 110 * (1 - Math.exp(-tt * 32)) / 32)) * Math.exp(-tt * 6.5) * (tt < .003 ? tt / .003 : 1), { gain: .95 });
  noise(t, .02, tt => v * .5 * Math.exp(-tt * 300), () => [3000, .5], { gain: .5 });
  const i0 = Math.floor(t * SR); for (let i = 0; i < SR * .3 && i0 + i < N; i++) duck[i0 + i] = Math.min(duck[i0 + i], 1 - .65 * Math.exp(-i / SR * 11));
};
const clap = (t, v = 1) => { for (let k = 0; k < 3; k++) noise(t + k * .012, .25, tt => v * (k === 2 ? .8 * Math.exp(-tt * 14) : .6 * Math.exp(-tt * 70)), () => [1400, .5], { gain: .75, rev: .25 }); put(t, .12, tt => v * .25 * Math.sin(TAU * 190 * tt) * Math.exp(-tt * 30), { gain: .6 }); };
const hat = (t, v = 1, open = false) => noise(t, open ? .3 : .06, tt => v * .45 * Math.exp(-tt * (open ? 12 : 70)), () => [9000, .6], { gain: .5, pan: .25, hp: true });
const tick = (t, v = 1) => put(t, .03, tt => v * .3 * Math.sin(TAU * 2600 * tt) * Math.exp(-tt * 180), { gain: .5, pan: -.3 });
// ---------- fx ----------
const impact = (t, v = 1) => { kick(t, v); noise(t, 1.4, tt => v * .9 * Math.exp(-tt * 3.2), tt => [1800 * Math.exp(-tt * 2) + 200, .7], { gain: .7, rev: .6, lp: true }); put(t, 1.6, tt => v * .5 * Math.sin(TAU * (38 * tt + 30 * (1 - Math.exp(-tt * 8)) / 8)) * Math.exp(-tt * 2.2), { gain: .8 }); };
const whoosh = (t, len, v = 1, up = true, pan = 0) => noise(t, len, tt => v * Math.pow(Math.sin(Math.PI * Math.min(1, tt / len)), 2), tt => [up ? 300 * Math.pow(25, tt / len) : 7000 * Math.pow(1 / 25, tt / len), .35], { gain: .7, pan, rev: .4 });
const riser = (t, len, v = 1) => { noise(t, len, tt => v * .35 * Math.pow(tt / len, 2.2), tt => [400 * Math.pow(12, tt / len), .6], { gain: .55, rev: .5, lp: true }); put(t, len, tt => v * .12 * Math.sin(TAU * (220 * tt + 440 * tt * tt / len)) * Math.pow(tt / len, 2), { gain: .6, rev: .4, bus: 'mus' }); };
const glitch = (t, len, v = 1) => { for (let k = 0; k < Math.floor(len / .035); k++) { const tt = t + k * .035, f = 300 + 3000 * rnd(); put(tt, .03, x => v * .22 * Math.sign(Math.sin(TAU * f * x)) * (rnd() < .5 ? 1 : .3), { gain: .6, pan: rnd() * 2 - 1 }); } };
const blip = (t, m = 93, v = 1, pan = 0) => put(t, .14, tt => v * .28 * Math.sin(TAU * mtof(m) * tt) * Math.exp(-tt * 28), { gain: .7, pan, rev: .35, bus: 'mus' });
const stab = (t, notes, v = 1) => notes.forEach((m, i) => put(t, .7, tt => v * .12 * (Math.sin(TAU * mtof(m) * tt) + .5 * Math.sin(TAU * mtof(m) * 2.001 * tt) + .25 * Math.sin(TAU * mtof(m) * 3 * tt)) * Math.exp(-tt * 5), { gain: .8, pan: (i - 1) * .4, rev: .45, bus: 'mus' }));
const odo = (t, len, v = 1) => { for (let k = 0; k < len / .045; k++) tick(t + k * .045 * (1 + k * .02), v * (.5 + .5 * rnd())); };
// ---------- synths ----------
const bass = (t, m, len, v = 1) => { let ph = 0; put(t, len + .05, tt => { ph += mtof(m) / SR; const saw = 2 * (ph % 1) - 1, sq = (ph % 1) < .5 ? 1 : -1, env = Math.min(1, tt / .005) * (tt < len ? 1 : Math.exp(-(tt - len) * 60)); return v * .32 * env * (Math.tanh(1.8 * (saw * .6 + sq * .25 + Math.sin(TAU * ph * .5) * .8))); }, { gain: .75, bus: 'mus' }); };
const pluck = (t, m, v = 1, pan = 0) => put(t, .5, tt => v * .16 * (Math.sin(TAU * mtof(m) * tt) + .35 * Math.sin(TAU * mtof(m) * 2 * tt) * Math.exp(-tt * 12) + .15 * Math.sin(TAU * mtof(m) * 3.01 * tt) * Math.exp(-tt * 20)) * Math.exp(-tt * 9), { gain: .8, pan, rev: .3, bus: 'mus' });
const pad = (t, notes, len, v = 1) => notes.forEach((m, i) => { const d = [1, 1.004, .996]; put(t, len + .8, tt => { let s = 0; for (const k of d) for (let h = 1; h <= 4; h++) s += Math.sin(TAU * mtof(m) * k * h * tt + h) / (h * h); return v * .025 * s * Math.min(1, tt / .4) * (tt > len ? Math.exp(-(tt - len) * 4) : 1); }, { gain: .8, pan: (i - 1) * .5, rev: .6, bus: 'mus' }); });

// ---------- arrangement (bars of 2 s) ----------
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
const ROOT = [33, 29, 36, 31];
const barOf = t => Math.floor(t / 2);

// ---- transition sound design (v3.1): no noise whooshes. Transitions are carried by the music: a reversed-pad swell
// into each chapter, and small in-key tonal cues (never the same one twice in a row) for the cuts inside a chapter.
// About half of the in-chapter transitions get no cue at all: the downbeat + the next shot's own sounds carry them.
const swell = (tEnd, notes, len = 1.6, v = 1) => notes.forEach((m, i) => put(tEnd - len, len + .06, tt => {   // reverse pad: grows, then stops dead on the cut
  const q = tt / len, env = q < 1 ? Math.pow(q, 2.6) : Math.max(0, 1 - (tt - len) / .06); let s = 0;
  for (let h = 1; h <= 3; h++) s += Math.sin(TAU * mtof(m) * h * tt + h) / (h * h);
  return v * .07 * s * env;
}, { gain: .8, pan: (i / Math.max(1, notes.length - 1) - .5) * .6, rev: .35, bus: 'mus' }));
const bloom = (t, notes, v = 1) => notes.forEach((m, i) => put(t + i * .03, 1.6, tt => v * .06 * (Math.sin(TAU * mtof(m) * tt) + .3 * Math.sin(TAU * mtof(m) * 2.01 * tt)) * Math.min(1, tt / .08) * Math.exp(-tt * 2.4), { gain: .8, pan: (i - 1) * .4, rev: .6, bus: 'mus' }));
const glide = (t, len, m0, m1, v = 1) => { let ph = 0; put(t, len + .15, tt => { const q = Math.min(1, tt / len), f = mtof(lerpN(m0, m1, q * q * (3 - 2 * q))); ph += f / SR; const tri = 1 - 4 * Math.abs((ph % 1) - .5); return v * .07 * tri * Math.sin(Math.PI * Math.min(1, tt / (len + .15))); }, { gain: .8, rev: .45, bus: 'mus' }); };
const harp = (t, span, notes, v = 1, dir = 1) => notes.forEach((m, i) => pluck(t + (dir > 0 ? i : notes.length - 1 - i) * span / notes.length, m, .32 * v, -.6 + 1.2 * i / Math.max(1, notes.length - 1)));
const hatRoll = (t, n = 4, v = .6) => { for (let k = 0; k < n; k++) hat(t - (n - k) * .0625, v * (.4 + .6 * k / n)); };
const lerpN = (a, b, k) => a + (b - a) * k;
const softImpact = (t, v = 1) => { kick(t, v); put(t, 1.2, tt => v * .4 * Math.sin(TAU * (40 * tt + 24 * (1 - Math.exp(-tt * 8)) / 8)) * Math.exp(-tt * 2.6), { gain: .8 }); };   // no noise tail
const AM = [57, 64, 69, 72], FM = [53, 60, 65, 69], CM = [52, 60, 67, 72], GM = [55, 62, 67, 71];

// ---- hits for 《课搭AI校园平台》 (60 s, 120 BPM)
// groove: kick 4-on-floor, claps on 2 & 4, offbeat hats, two-note bass; b8 goes calm
for (let t = 0; t < 60; t += BEAT) {
  const b = Math.round(t / BEAT), beatIn = b % 4, calm = t >= S.b8;
  kick(t, calm ? (beatIn === 0 ? .6 : 0) : beatIn === 0 ? 1 : .8);
  if ((beatIn === 1 || beatIn === 3) && !calm) clap(t, .55);
  hat(t + BEAT / 2, .35);
  if (!calm) bass(t, [33, 29, 36, 31][Math.floor(t / 2) % 4] + 12, BEAT * .45, .8);
}
// transition cues mirror the TR table: iris -> bloom, zoom -> glide
bloom(S.b1, [69, 76, 81], .9);
glide(S.b2, .5, 69, 81, .9);
bloom(S.b3, [65, 72, 79], .8);
glide(S.b4, .5, 67, 79, .9);
bloom(S.b5, [69, 76, 81], .8);
glide(S.b6, .5, 64, 76, .9);
bloom(S.b7, [67, 74, 79], .8);
glide(S.b8, .5, 69, 84, 1);
// typing ticks (b1 input), icon blips (b2), tablet blips (b3), quiz/phone (b4/b7), like odometer (b6)
for (let i = 0; i < 12; i++) tick(Hh.typeStart + i * .28, .45);
[Hh.icon1, Hh.icon2, Hh.icon3].forEach((tt, i) => blip(tt, 81 + i * 2, .6));
Hh.tablets.forEach((tt, i) => blip(tt, 84 + i * 2, .7));
blip(Hh.stream, 88, .6);
blip(Hh.quiz, 93, .8); blip(Hh.phone, 88, .6);
odo(Hh.like, 1.2, .8);
// finale swell + impact
swell(Hh.finale, [57, 64, 69, 72], 1.6, 1); impact(Hh.finale, 1); stab(Hh.finale + .6, [57, 60, 64, 69], .9);

// ---------- mix: sidechain music bus, reverb, glue, master ----------
function verb(inp, spread) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map(d => ({ b: new Float32Array(d + spread), i: 0, s: 0 })), aps = [556, 441, 341].map(d => ({ b: new Float32Array(d + spread), i: 0 }));
  const o = new Float32Array(N);
  for (let n = 0; n < N; n++) { const x = inp[n] * .02; let y = 0; for (const c of combs) { const v = c.b[c.i]; c.s = v * .7 + c.s * .3; c.b[c.i] = x + c.s * .82; c.i = (c.i + 1) % c.b.length; y += v; } for (const a of aps) { const v = a.b[a.i]; a.b[a.i] = y + v * .5; a.i = (a.i + 1) % a.b.length; y = v - y; } o[n] = y; }
  return o;
}
const wl = verb(sendL, 0), wr = verb(sendR, 23);
const oL = new Float32Array(N), oR = new Float32Array(N); let peak = 0;
for (let n = 0; n < N; n++) {
  let l = L[n] + musL[n] * duck[n] + wl[n] * 4, r = R[n] + musR[n] * duck[n] + wr[n] * 4;
  l = Math.tanh(l * 1.2) / 1.2 * 1.1; r = Math.tanh(r * 1.2) / 1.2 * 1.1;
  oL[n] = l; oR[n] = r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = .9 / peak, fadeOut = Math.floor((C.dur - .2) * SR);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const f = Math.min(1, n / (.02 * SR)) * (n > fadeOut ? Math.max(0, 1 - (n - fadeOut) / (1.2 * SR)) : 1);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, oL[n] * g * f)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, oR[n] * g * f)) * 32767), 46 + n * 4);
}
writeFileSync(new URL('./score.wav', import.meta.url), buf);
console.log(`score.wav: ${DUR} s, peak ${peak.toFixed(2)} → normalized`);
