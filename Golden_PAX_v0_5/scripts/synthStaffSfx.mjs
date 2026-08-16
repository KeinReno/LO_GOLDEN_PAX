/**
 * Local stand-in SFX (stdlib PCM WAV). Not ElevenLabs.
 * Brass/glass/radio — no wood. 4 seeded variants per cue.
 *
 *   node scripts/synthStaffSfx.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "client-web/public/audio/sfx");
const CUES = JSON.parse(
  readFileSync(join(ROOT, "client-web/src/audio/cues.json"), "utf8"),
);
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

function env(t, attack, decay) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

function bandlimitedNoise(rng, hp, lp, state) {
  const x = rng() * 2 - 1;
  state.lp += (x - state.lp) * lp;
  state.hp += (state.lp - state.hp) * hp;
  return state.lp - state.hp;
}

function render(seconds, fn) {
  const n = Math.floor(SR * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = fn(i / SR, i);
  let peak = 1e-6;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = 0.72 / peak;
  for (let i = 0; i < n; i++) samples[i] = clamp(samples[i] * g);
  return samples;
}

function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.round(clamp(samples[i]) * 32767);
    data.writeInt16LE(v, i * 2);
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

function squelch(t, rng, jitter, st) {
  const open = 0.018 + jitter * 0.004;
  const hold = 0.09 + jitter * 0.02;
  const e = env(t, open, hold) * (t < 0.22 ? 1 : 0);
  const hiss = bandlimitedNoise(rng, 0.18, 0.55, st);
  const ring = Math.sin(2 * Math.PI * (1650 + jitter * 120) * t) * Math.exp(-t * 28);
  return (hiss * 0.85 + ring * 0.22) * e;
}

const synth = {
  radio_squelch: (seed) => {
    const rng = mulberry32(seed);
    const jitter = rng();
    const st = { lp: 0, hp: 0 };
    return render(0.5, (t) => squelch(t, rng, jitter, st));
  },
  turn_advance: (seed) => {
    const rng = mulberry32(seed);
    const jitter = rng();
    const f = 92 + jitter * 10;
    const st = { lp: 0, hp: 0 };
    return render(0.7, (t) => {
      const sq = squelch(t, rng, jitter, st) * 0.9;
      const body = Math.sin(2 * Math.PI * f * t) * env(t - 0.08, 0.012, 0.28);
      const harm = Math.sin(2 * Math.PI * f * 2 * t) * env(t - 0.08, 0.01, 0.16) * 0.18;
      return sq + body * 0.55 + harm;
    });
  },
  contact_alert: (seed) => {
    const rng = mulberry32(seed);
    const jitter = rng();
    const gap = 0.16 + jitter * 0.03;
    const stA = { lp: 0, hp: 0 };
    const stB = { lp: 0, hp: 0 };
    const rng2 = mulberry32(seed + 17);
    return render(0.6, (t) => {
      const a = squelch(t, rng, jitter, stA);
      const b = squelch(t - gap, rng2, jitter + 0.15, stB) * 0.92;
      return a + b;
    });
  },
  seal_stamp: (seed) => {
    const rng = mulberry32(seed);
    const st = { lp: 0, hp: 0 };
    const f = 68 + rng() * 8;
    return render(0.55, (t) => {
      const thud =
        Math.sin(2 * Math.PI * f * t) * env(t, 0.004, 0.14) +
        Math.sin(2 * Math.PI * (f * 1.7) * t) * env(t, 0.003, 0.08) * 0.35;
      const wax = bandlimitedNoise(rng, 0.35, 0.7, st) * env(t, 0.002, 0.045) * 0.55;
      return thud * 0.9 + wax;
    });
  },
  token_drop: (seed) => {
    const rng = mulberry32(seed);
    const st = { lp: 0, hp: 0 };
    // brass + glass inharmonics — no hollow wood body
    const brass = 840 + rng() * 40;
    const glass = 2460 + rng() * 80;
    return render(0.5, (t) => {
      const click = bandlimitedNoise(rng, 0.45, 0.85, st) * env(t, 0.001, 0.012);
      const metal =
        Math.sin(2 * Math.PI * brass * t) * env(t, 0.0015, 0.07) * 0.45 +
        Math.sin(2 * Math.PI * brass * 2.03 * t) * env(t, 0.001, 0.04) * 0.18;
      const glaze =
        Math.sin(2 * Math.PI * glass * t) * env(t, 0.001, 0.055) * 0.5 +
        Math.sin(2 * Math.PI * (glass * 1.51) * t) * env(t, 0.001, 0.03) * 0.22;
      return click * 0.7 + metal + glaze;
    });
  },
};

const SEEDS = [0x51af, 0x0c31, 0x9e2b, 0x77d4];

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const cue of CUES.cues) {
  const fn = synth[cue.id];
  if (!fn) throw new Error(`no synth for ${cue.id}`);
  for (let v = 0; v < 4; v++) {
    const name = `${cue.id}__${String(v + 1).padStart(2, "0")}.wav`;
    const buf = encodeWav(fn(SEEDS[v] ^ cue.id.length * 13));
    await writeFile(join(OUT, name), buf);
    manifest.push({ cue: cue.id, variant: v + 1, file: `sfx/${name}`, bytes: buf.length });
  }
}
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`wrote ${manifest.length} wavs → ${OUT}`);
