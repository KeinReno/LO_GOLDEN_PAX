/**
 * Generate cue heroes via ElevenLabs Sound Effects → live wav slots.
 *
 * Requires ELEVENLABS_API_KEY on a network ElevenLabs permits (RU/BY listed blocked).
 * Do not tunnel around that from this repo.
 *
 *   ELEVENLABS_API_KEY=... node scripts/genSfxEleven.mjs
 */
import { mkdir, writeFile, copyFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CUES_PATH = join(ROOT, "src/audio/cues.json");
const OUT = join(ROOT, "public/audio/sfx");
const TMP = join(OUT, "_eleven_tmp");

const key = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY;
if (!key) {
  console.error(
    "No ELEVENLABS_API_KEY. ElevenLabs is also blocked from this region's IPs (RU listed). Put the key in the environment only when calling from a permitted network — do not proxy around the block from here.",
  );
  process.exit(1);
}

const spec = JSON.parse(await readFile(CUES_PATH, "utf8"));
const variants = spec.elevenlabs?.variants ?? 2;
const endpoint = spec.elevenlabs?.endpoint;
const modelId = spec.elevenlabs?.model_id;
const format = spec.elevenlabs?.output_format ?? "mp3_44100_128";
const influence = spec.elevenlabs?.prompt_influence ?? 0.85;

await mkdir(TMP, { recursive: true });
await mkdir(OUT, { recursive: true });

function ffmpegConvert(mp3Path, wavPath, seconds) {
  const fadeStart = Math.max(0.05, seconds - 0.05);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      mp3Path,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-sample_fmt",
      "s16",
      "-af",
      `highpass=f=50,lowpass=f=12000,afade=t=out:st=${fadeStart.toFixed(3)}:d=0.045`,
      wavPath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.slice(-400) || "ffmpeg failed");
  }
}

for (const cue of spec.cues) {
  const seconds = Math.max(0.5, cue.duration_seconds ?? 0.5);
  for (let v = 1; v <= variants; v++) {
    const url = `${endpoint}?output_format=${encodeURIComponent(format)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cue.prompt,
        duration_seconds: seconds,
        prompt_influence: influence,
        model_id: modelId,
        loop: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${cue.id} v${v}: ${res.status} ${body.slice(0, 400)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mp3 = join(TMP, `${cue.id}__${String(v).padStart(2, "0")}.mp3`);
    const wav = join(OUT, `${cue.id}__${String(v).padStart(2, "0")}.wav`);
    await writeFile(mp3, buf);
    ffmpegConvert(mp3, wav, seconds);
    await unlink(mp3);
    console.log("wrote", wav);
  }
  await copyFile(join(OUT, `${cue.id}__01.wav`), join(OUT, `${cue.id}__03.wav`));
  await copyFile(join(OUT, `${cue.id}__02.wav`), join(OUT, `${cue.id}__04.wav`));
}

console.log("live slots updated. Preview: /audio/index.html");
