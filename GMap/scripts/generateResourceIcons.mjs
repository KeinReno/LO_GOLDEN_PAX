/**
 * Generate unique SVG icons for every map resource + write RESOURCE_POOL snippet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESOURCES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/core/map_resources.json"), "utf8"),
);
const OUT_DIR = path.join(ROOT, "public/icons/game/resources");
const DIST_DIR = path.join(ROOT, "dist/icons/game/resources");

function slug(name) {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .replace(/[а-я]/g, (ch) => {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
        р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
        ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[ch] ?? "x";
    });
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h, s, l) {
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

const SHAPES = [
  (c1, c2) =>
    `<circle cx="256" cy="256" r="190" fill="${c1}"/><circle cx="256" cy="256" r="110" fill="${c2}"/>`,
  (c1, c2) =>
    `<rect x="70" y="70" width="372" height="372" rx="48" fill="${c1}"/><rect x="150" y="150" width="212" height="212" rx="24" fill="${c2}"/>`,
  (c1, c2) =>
    `<polygon points="256,40 470,472 42,472" fill="${c1}"/><polygon points="256,140 390,420 122,420" fill="${c2}"/>`,
  (c1, c2) =>
    `<polygon points="256,36 476,256 256,476 36,256" fill="${c1}"/><polygon points="256,120 392,256 256,392 120,256" fill="${c2}"/>`,
  (c1, c2) =>
    `<polygon points="256,40 330,190 490,210 370,330 400,490 256,400 112,490 142,330 22,210 182,190" fill="${c1}"/><circle cx="256" cy="270" r="70" fill="${c2}"/>`,
  (c1, c2) =>
    `<polygon points="150,60 362,60 470,256 362,452 150,452 42,256" fill="${c1}"/><polygon points="190,140 322,140 390,256 322,372 190,372 122,256" fill="${c2}"/>`,
  (c1, c2) =>
    `<path d="M256 48c80 80 160 80 208 160s-16 176-96 224-176 16-224-64S96 144 176 96s80-48 80-48z" fill="${c1}"/><circle cx="270" cy="240" r="80" fill="${c2}"/>`,
  (c1, c2) =>
    `<rect x="96" y="96" width="320" height="320" fill="${c1}" transform="rotate(20 256 256)"/><circle cx="256" cy="256" r="90" fill="${c2}"/>`,
];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

const names = Object.values(RESOURCES).map((r) => r.name);
const mapping = {};

for (const name of names) {
  const s = slug(name);
  const h = hash(name);
  const shape = SHAPES[h % SHAPES.length];
  const hue = h % 360;
  const c1 = hsl(hue, 62, 52);
  const c2 = hsl((hue + 40) % 360, 70, 72);
  const letter = name.trim().charAt(0).toUpperCase();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${hsl((hue + 80) % 360, 55, 38)}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="#0b1020"/>
  ${shape("url(#g)", c2)}
  <text x="256" y="300" text-anchor="middle" font-family="Georgia, serif" font-size="180" font-weight="700" fill="#0b1020" opacity="0.85">${letter}</text>
</svg>
`;
  const file = `${s}.svg`;
  fs.writeFileSync(path.join(OUT_DIR, file), svg);
  fs.writeFileSync(path.join(DIST_DIR, file), svg);
  mapping[name] = s;
}

const mapPath = path.join(ROOT, "content/core/resource-icon-slugs.json");
fs.writeFileSync(mapPath, JSON.stringify(mapping, null, 2) + "\n");

const poolPath = path.join(ROOT, "src/state/resourcePool.generated.ts");
const poolBody = `/** Auto-generated from content/core/map_resources.json — do not edit by hand. */
export const RESOURCE_POOL: string[] = ${JSON.stringify(names, null, 2)};

export type ResourceName = string;

export const RESOURCE_ICON_SLUGS: Record<string, string> = ${JSON.stringify(mapping, null, 2)};
`;
fs.writeFileSync(poolPath, poolBody);

console.log("Generated", names.length, "resource icons →", OUT_DIR);
console.log("Wrote", mapPath);
console.log("Wrote", poolPath);
