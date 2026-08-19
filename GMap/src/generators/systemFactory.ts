import { v4 as uuid } from "uuid";
import type {
  Climate,
  Planet,
  PlanetType,
  StarBody,
  StarClass,
  StarSystem,
  SystemKind,
} from "../state/types";
import { depositPaintPool } from "../state/depositPaint";

const PAINT_POOL = [...depositPaintPool()];

const STAR_WEIGHTS: { cls: StarClass; w: number; lum: number }[] = [
  { cls: "M", w: 40, lum: 0.3 },
  { cls: "K", w: 25, lum: 0.5 },
  { cls: "G", w: 15, lum: 1 },
  { cls: "F", w: 10, lum: 1.4 },
  { cls: "A", w: 6, lum: 2 },
  { cls: "B", w: 3, lum: 4 },
  { cls: "O", w: 1, lum: 8 },
];

const PLANET_TYPES: PlanetType[] = [
  "rocky",
  "gas",
  "ice",
  "desert",
  "ocean",
  "toxic",
  "artifact",
];

const CLIMATES: Climate[] = [
  "frozen",
  "cold",
  "temperate",
  "hot",
  "infernal",
  "tidal_locked",
];

function pickWeighted<T extends { w: number }>(items: T[], rnd: () => number): T {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rnd() * total;
  for (const item of items) {
    r -= item.w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed?: number): () => number {
  return mulberry32(seed ?? Date.now() % 1_000_000);
}

function makeStars(rnd: () => number): StarBody[] {
  const roll = rnd();
  const count = roll < 0.7 ? 1 : roll < 0.92 ? 2 : 3;
  const stars: StarBody[] = [];
  for (let i = 0; i < count; i++) {
    const picked = pickWeighted(STAR_WEIGHTS, rnd);
    stars.push({
      class: picked.cls,
      luminosity: picked.lum * (0.8 + rnd() * 0.4),
    });
  }
  return stars;
}

function makePlanet(index: number, rnd: () => number): Planet {
  const type = pick(PLANET_TYPES, rnd);
  const climate =
    type === "ice"
      ? "frozen"
      : type === "gas"
        ? pick(["cold", "temperate", "hot"] as Climate[], rnd)
        : pick(CLIMATES, rnd);

  const resources: string[] = [];
  if (rnd() < 0.45) resources.push(pick(PAINT_POOL, rnd));
  if (rnd() < 0.15) resources.push(pick(PAINT_POOL, rnd));

  const canSettle =
    (type === "rocky" || type === "ocean" || type === "desert") &&
    (climate === "temperate" || climate === "cold" || climate === "hot");

  let population = 0;
  if (canSettle && rnd() < 0.55) {
    population = Math.floor(1_000_000 + rnd() * 8_000_000_000);
  }

  const raceComposition =
    population > 0
      ? (() => {
          const a = Math.floor(40 + rnd() * 45);
          const b = Math.floor(rnd() * (100 - a));
          const c = Math.max(0, 100 - a - b);
          const shares = [
            { raceId: "race_human", percent: a },
            { raceId: "race_belator", percent: b },
            { raceId: "race_synth", percent: c },
          ].filter((r) => r.percent > 0);
          return shares;
        })()
      : [];

  return {
    id: uuid(),
    name: `Планета ${index + 1}`,
    type,
    climate,
    population,
    raceComposition,
    resources: [...new Set(resources)],
  };
}

export function createRandomSystem(
  x: number,
  y: number,
  rnd: () => number,
  nameIndex: number,
  resourceChance = 0.35,
  kind: SystemKind = "stellar",
): StarSystem {
  if (kind === "corridor") {
    const resources: string[] = [];
    if (rnd() < resourceChance * 0.5) resources.push(pick(PAINT_POOL, rnd));
    return {
      id: uuid(),
      name: `COR-${String(nameIndex).padStart(3, "0")}`,
      x,
      y,
      kind: "corridor",
      stars: [],
      planets: [],
      stations: [],
      resources: [...new Set(resources)],
      ownerFactionId: null,
      sectorId: null,
      locked: false,
      visibleToFactionIds: [],
      activity: "none",
      tradeWithSystemId: null,
      notes: "",
    };
  }

  const planetCount = 1 + Math.floor(rnd() * 6);
  const planets = Array.from({ length: planetCount }, (_, i) =>
    makePlanet(i, rnd),
  );

  const resources: string[] = [];
  if (rnd() < resourceChance) resources.push(pick(PAINT_POOL, rnd));
  if (rnd() < resourceChance * 0.4) resources.push(pick(PAINT_POOL, rnd));

  const stations =
    rnd() < 0.18
      ? [
          {
            id: uuid(),
            name: "Орбитальная станция",
            kind: pick(
              ["science", "mining", "military", "trade", "relay"] as const,
              rnd,
            ),
            factionId: null as string | null,
          },
        ]
      : [];

  return {
    id: uuid(),
    name: `SYS-${String(nameIndex).padStart(3, "0")}`,
    x,
    y,
    kind: "stellar",
    stars: makeStars(rnd),
    planets,
    stations,
    resources: [...new Set(resources)],
    ownerFactionId: null,
    sectorId: null,
    locked: false,
    visibleToFactionIds: [],
    activity: "none",
    tradeWithSystemId: null,
    notes: "",
  };
}

export function starColor(cls: StarClass): number {
  const colors: Record<StarClass, number> = {
    O: 0x9bbcff,
    B: 0xa8c8ff,
    A: 0xffffff,
    F: 0xfff4c2,
    G: 0xffe566,
    K: 0xffb347,
    M: 0xff6b4a,
  };
  return colors[cls];
}
