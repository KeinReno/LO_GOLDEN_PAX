/**
 * Generate cue variants via ElevenLabs Sound Effects API.
 *
 * Requires ELEVENLABS_API_KEY. The API is geo-blocked from RU/BY/etc.
 * Do not tunnel around that from this repo.
 *
 *   ELEVENLABS_API_KEY=... node scripts/genSfxEleven.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CUES_PATH = join(ROOT, "client-web/src/audio/cues.json");
const OUT = join(ROOT, "client-web/public/audio/sfx/eleven");

const key = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY;
if (!key) {
  console.error(
    "No ELEVENLABS_API_KEY. ElevenLabs is also blocked from this region's IPs (RU listed). Put the key in the environment only when calling from a permitted network — do not proxy around the block from here.",
  );
  process.exit(1);
}

const spec = JSON.parse(await readFile(CUES_PATH, "utf8"));
const variants = spec.elevenlabs?.variants ?? 4;
const endpoint = spec.elevenlabs?.endpoint;
const modelId = spec.elevenlabs?.model_id;
const format = spec.elevenlabs?.output_format ?? "mp3_44100_128";
const influence = spec.elevenlabs?.prompt_influence ?? 0.78;

await mkdir(OUT, { recursive: true });

for (const cue of spec.cues) {
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
        duration_seconds: cue.duration_seconds,
        prompt_influence: influence,
        model_id: modelId,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${cue.id} v${v}: ${res.status} ${body.slice(0, 400)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `${cue.id}__${String(v).padStart(2, "0")}.mp3`;
    await writeFile(join(OUT, name), buf);
    console.log("wrote", name, buf.length, "bytes");
  }
}
