/**
 * Physical-model staff cues. Not the rejected hiss synth (synthStaffSfx.mjs).
 * Ident = mechanical relay gate. Tails = hull tone / brass+wax / glass.
 *
 *   node scripts/renderStaffFoley.mjs
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/audio/sfx");
const SR = 44100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x, lo = -1, hi = 1) {
  return Math.min(hi, Math.max(lo, x));
}

function mixAt(dst, src, at, gain = 1) {
  const i0 = Math.floor(at * SR);
  for (let i = 0; i < src.length; i++) {
    const j = i0 + i;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
}

function rise(t, ms) {
  if (t <= 0) return 0;
  const a = ms;
  if (t >= a) return 1;
  return 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
}

function ident(rng, pitch = 1) {
  const bodyHz = (88 + rng() * 10) * pitch;
  const warmHz = (340 + rng() * 40) * pitch;
  const n = Math.floor(SR * 0.11);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = rise(t, 0.008);
    const body = Math.sin(2 * Math.PI * bodyHz * t) * a * Math.exp(-t / 0.042) * 0.9;
    const warm = Math.sin(2 * Math.PI * warmHz * t) * a * Math.exp(-t / 0.022) * 0.18;
    out[i] = body + warm;
  }
  return out;
}

function hullTone(freq, seconds) {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = rise(t, 0.028);
    const d = Math.exp(-Math.max(0, t - 0.028) / 0.34);
    out[i] = Math.sin(2 * Math.PI * freq * t) * a * d * 0.7;
  }
  return out;
}

function stamp(rng) {
  const n = Math.floor(SR * 0.42);
  const out = new Float32Array(n);
  const f1 = 52 + rng() * 5;
  const f2 = 78 + rng() * 6;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = rise(t, 0.006);
    out[i] =
      Math.sin(2 * Math.PI * f1 * t) * a * Math.exp(-t / 0.18) * 0.8 +
      Math.sin(2 * Math.PI * f2 * t) * a * Math.exp(-t / 0.1) * 0.28;
  }
  return out;
}

function tokenDrop(rng) {
  const n = Math.floor(SR * 0.28);
  const out = new Float32Array(n);
  const brass = 420 + rng() * 30;
  const glass = 780 + rng() * 40;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = rise(t, 0.004);
    out[i] =
      Math.sin(2 * Math.PI * brass * t) * a * Math.exp(-t / 0.05) * 0.55 +
      Math.sin(2 * Math.PI * glass * t) * a * Math.exp(-t / 0.032) * 0.16;
  }
  return out;
}

function finish(samples, peak) {
  const hpC = Math.exp((-2 * Math.PI * 35) / SR);
  const lpC = 1 - Math.exp((-2 * Math.PI * 1400) / SR);
  let x1 = 0;
  let hp = 0;
  let lp = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    hp = hpC * (hp + x - x1);
    x1 = x;
    lp += (hp - lp) * lpC;
    samples[i] = lp;
  }
  const fade = Math.floor(SR * 0.018);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    samples[i] *= k;
    samples[samples.length - 1 - i] *= k;
  }
  let p = 1e-9;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  const g = peak / p;
  for (let i = 0; i < samples.length; i++) samples[i] = clamp(samples[i] * g);
  return samples;
}

function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(clamp(samples[i]) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function rmsDb(samples, t0, t1) {
  const a = Math.floor(t0 * SR);
  const b = Math.min(samples.length, Math.floor(t1 * SR));
  let e = 0;
  const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) e += samples[i] * samples[i];
  return 20 * Math.log10(Math.sqrt(e / n) + 1e-12);
}

const PEAK = {
  radio_squelch: 0.36,
  turn_advance: 0.34,
  contact_alert: 0.34,
  seal_stamp: 0.32,
  token_drop: 0.3,
};

const HEROES = [0x4a21, 0xb7c3];

function renderCue(id, seed) {
  const rng = mulberry32(seed);
  if (id === "radio_squelch") {
    const buf = new Float32Array(Math.floor(SR * 0.28));
    mixAt(buf, ident(rng, 1), 0.004);
    return finish(buf, PEAK[id]);
  }
  if (id === "turn_advance") {
    const buf = new Float32Array(Math.floor(SR * 0.58));
    mixAt(buf, ident(rng, 1), 0.004);
    mixAt(buf, hullTone(84 + rng() * 8, 0.5), 0.07, 1);
    return finish(buf, PEAK[id]);
  }
  if (id === "contact_alert") {
    const buf = new Float32Array(Math.floor(SR * 0.52));
    mixAt(buf, ident(rng, 1), 0.004);
    mixAt(buf, ident(mulberry32(seed ^ 0x9e37), 1.04), 0.2, 0.72);
    return finish(buf, PEAK[id]);
  }
  if (id === "seal_stamp") return finish(stamp(rng), PEAK[id]);
  if (id === "token_drop") return finish(tokenDrop(rng), PEAK[id]);
  throw new Error(id);
}

const IDS = ["radio_squelch", "turn_advance", "contact_alert", "seal_stamp", "token_drop"];

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const id of IDS) {
  for (let h = 0; h < 2; h++) {
    const samples = renderCue(id, HEROES[h] ^ (id.length * 19));
    const name = `${id}__${String(h + 1).padStart(2, "0")}.wav`;
    const buf = encodeWav(samples);
    await writeFile(join(OUT, name), buf);
    const tail0 = id === "radio_squelch" ? 0.1 : samples.length / SR * 0.65;
    manifest.push({
      cue: id,
      variant: h + 1,
      file: `sfx/${name}`,
      bytes: buf.length,
      peak: PEAK[id],
      rmsHeadDb: +rmsDb(samples, 0, 0.05).toFixed(1),
      rmsTailDb: +rmsDb(samples, tail0, samples.length / SR).toFixed(1),
    });
  }
  await copyFile(join(OUT, `${id}__01.wav`), join(OUT, `${id}__03.wav`));
  await copyFile(join(OUT, `${id}__02.wav`), join(OUT, `${id}__04.wav`));
}
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
for (const row of manifest) {
  console.log(
    `${row.cue}__${String(row.variant).padStart(2, "0")}  head ${row.rmsHeadDb} dB  tail ${row.rmsTailDb} dB`,
  );
}
console.log(`wrote 2 heroes × 5 cues (03/04 copies) → ${OUT}`);
