/**
 * Recorded CC0 sources + Banner Saga room (weight, plate, stereo slap).
 *   node scripts/assembleStaffRecorded.mjs
 */
import { mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public/audio/src");
const OUT = join(ROOT, "public/audio/sfx");
const FF = "ffmpeg";

function ff(args) {
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "ffmpeg failed");
}

function cut(src, start, dur, dest, af = []) {
  ff([
    "-i", src, "-ss", String(start), "-t", String(dur),
    "-af", ["asetpts=PTS-STARTPTS", ...af].join(","),
    "-ar", "44100", "-ac", "1", dest,
  ]);
}

function room(files, dest, spec) {
  const {
    dur = 0.55,
    vol = 0.42,
    hp = 55,
    lp = 6200,
    bass = 4,
    delays = "48|100|210|360",
    decays = "0.3|0.22|0.14|0.08",
    stereo = 16,
    pad = 0.35,
  } = spec;
  const fadeSt = Math.max(0.1, dur - 0.12);
  const args = [];
  for (const f of files) {
    args.push("-i", f);
  }
  const n = files.length;
  const labeled = files.map((_, i) => `[${i}]volume=1[${String.fromCharCode(97 + i)}]`);
  const mixIns = files.map((_, i) => `[${String.fromCharCode(97 + i)}]`).join("");
  const graph = [
    ...labeled,
    `${mixIns}amix=inputs=${n}:duration=longest:normalize=0,apad=pad_dur=${pad},highpass=f=${hp},lowpass=f=${lp},bass=g=${bass}:f=105:w=0.65,aecho=0.86:0.7:${delays}:${decays},volume=${vol},afade=t=in:d=0.01,afade=t=out:st=${fadeSt}:d=0.11,asplit=2[l][r]`,
    `[r]adelay=${stereo}[rd]`,
    `[l][rd]join=inputs=2:channel_layout=stereo[s]`,
  ].join(";");
  ff([
    ...args,
    "-filter_complex", graph,
    "-map", "[s]",
    "-ar", "44100",
    "-sample_fmt", "s16",
    "-t", String(dur),
    dest,
  ]);
}

const tmp = mkdtempSync(join(tmpdir(), "staff-rec-"));
const t = (n) => join(tmp, n);
await mkdir(OUT, { recursive: true });

const glass = join(SRC, "1330_wine_cheers.ogg");
const ring = join(SRC, "2886_glass_clink.ogg");
const table = join(SRC, "1204_glass_table.ogg");
const chain = join(SRC, "0358_chain.ogg");
const lid = join(SRC, "0053_metal_lid.ogg");
const book = join(SRC, "1410_book.ogg");
const bowl1 = join(SRC, "1110_bowl1.ogg");
const bowl2 = join(SRC, "2553_bowl2.ogg");
const bowl3 = join(SRC, "2554_bowl3.ogg");
const can = join(SRC, "0796_canister.ogg");

cut(glass, 0, 0.24, t("crystal.wav"), ["highpass=f=500", "volume=0.9"]);
cut(ring, 0.33, 0.7, t("ring.wav"), ["highpass=f=350", "volume=0.85"]);
cut(chain, 0, 0.3, t("chain.wav"), ["highpass=f=600", "volume=0.7"]);
cut(table, 0.18, 0.4, t("place1.wav"), ["highpass=f=280", "volume=0.95"]);
cut(table, 3.18, 0.42, t("place2.wav"), ["highpass=f=280", "volume=0.95"]);
cut(book, 0.27, 0.4, t("book.wav"));
cut(lid, 1.62, 0.5, t("lid1.wav"));
cut(lid, 3.72, 0.52, t("lid2.wav"));
cut(can, 0.43, 0.7, t("can.wav"), ["lowpass=f=900", "volume=0.8"]);
cut(bowl3, 0, 0.55, t("bodyShort.wav"), ["lowpass=f=340", "highpass=f=50", "volume=1.15"]);
cut(bowl2, 0, 0.9, t("bodyMid.wav"), ["lowpass=f=300", "highpass=f=48", "asetrate=37000,aresample=44100", "volume=1.2"]);
cut(bowl1, 0, 1.15, t("bodyDeep.wav"), ["lowpass=f=280", "highpass=f=45", "asetrate=35000,aresample=44100", "volume=1.25"]);
cut(bowl3, 0, 0.28, t("thump.wav"), ["lowpass=f=220", "volume=1.3"]);
ff(["-i", t("crystal.wav"), "-af", "asetrate=46700,aresample=44100", t("crystalHi.wav")]);

room([t("crystal.wav"), t("bodyShort.wav")], join(OUT, "radio_squelch__01.wav"), {
  dur: 0.42, vol: 0.4, bass: 3, pad: 0.22, stereo: 14,
  delays: "42|88|170", decays: "0.24|0.16|0.1",
});
room([t("chain.wav"), t("thump.wav")], join(OUT, "radio_squelch__02.wav"), {
  dur: 0.4, vol: 0.36, bass: 4, pad: 0.2, stereo: 12, hp: 50,
  delays: "36|80|150", decays: "0.2|0.14|0.08",
});

room([t("ring.wav"), t("bodyDeep.wav")], join(OUT, "turn_advance__01.wav"), {
  dur: 0.82, vol: 0.4, bass: 7, pad: 0.42, stereo: 22, lp: 5200,
  delays: "55|110|230|400", decays: "0.36|0.26|0.16|0.1",
});
room([t("crystal.wav"), t("bodyMid.wav")], join(OUT, "turn_advance__02.wav"), {
  dur: 0.74, vol: 0.38, bass: 6, pad: 0.4, stereo: 20, lp: 5000,
  delays: "50|105|220|380", decays: "0.34|0.24|0.15|0.09",
});

ff([
  "-i", t("crystal.wav"), "-i", t("crystalHi.wav"), "-i", t("thump.wav"),
  "-filter_complex",
  "[1]adelay=185[d];[0][d][2]amix=inputs=3:duration=longest:normalize=0",
  t("contact1pre.wav"),
]);
room([t("contact1pre.wav")], join(OUT, "contact_alert__01.wav"), {
  dur: 0.62, vol: 0.4, bass: 4, pad: 0.2, stereo: 18,
  delays: "40|90|190", decays: "0.22|0.16|0.1",
});
// second hit: delay crystalHi inside a pre-mix
ff([
  "-i", t("crystal.wav"), "-i", t("crystalHi.wav"), "-i", t("bodyShort.wav"),
  "-filter_complex",
  "[1]adelay=200[d];[0][d][2]amix=inputs=3:duration=longest:normalize=0",
  t("contact2pre.wav"),
]);
room([t("contact2pre.wav")], join(OUT, "contact_alert__02.wav"), {
  dur: 0.64, vol: 0.38, bass: 3, pad: 0.18, stereo: 16,
  delays: "44|92|185", decays: "0.22|0.15|0.09",
});

room([t("book.wav"), t("lid1.wav"), t("can.wav"), t("thump.wav")], join(OUT, "seal_stamp__01.wav"), {
  dur: 0.55, vol: 0.44, bass: 8, pad: 0.18, stereo: 10, hp: 48, lp: 4500,
  delays: "32|70|150", decays: "0.18|0.12|0.08",
});
room([t("book.wav"), t("lid2.wav"), t("bodyShort.wav")], join(OUT, "seal_stamp__02.wav"), {
  dur: 0.52, vol: 0.42, bass: 7, pad: 0.18, stereo: 11, hp: 48, lp: 4800,
  delays: "34|74|155", decays: "0.18|0.12|0.08",
});

room([t("place1.wav"), t("thump.wav")], join(OUT, "token_drop__01.wav"), {
  dur: 0.4, vol: 0.4, bass: 5, pad: 0.16, stereo: 13, hp: 60,
  delays: "28|64|130", decays: "0.16|0.1|0.06",
});
room([t("place2.wav"), t("chain.wav"), t("thump.wav")], join(OUT, "token_drop__02.wav"), {
  dur: 0.4, vol: 0.38, bass: 4, pad: 0.16, stereo: 14, hp: 70,
  delays: "30|68|140", decays: "0.16|0.1|0.06",
});

for (const id of ["radio_squelch", "turn_advance", "contact_alert", "seal_stamp", "token_drop"]) {
  await copyFile(join(OUT, `${id}__01.wav`), join(OUT, `${id}__03.wav`));
  await copyFile(join(OUT, `${id}__02.wav`), join(OUT, `${id}__04.wav`));
}

await rm(tmp, { recursive: true, force: true });
console.log("assembled deep recorded cues →", OUT);
