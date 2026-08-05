import type { Planet, StarSystem, StationKind } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import { classifyPlanet } from "../state/planets";
import { COLONY_TYPE_LABELS } from "../state/defaults";
import { categoryByLetter, formatPlayerCost } from "../state/economyLabels";
import { systemSpaceObjects } from "../state/spaceObjects";
import { systemMineInfo, systemMineLabel } from "./depositMining";
import { resolvePoiIntel, type PoiIntel } from "./poiIntel";

export type CodexStationRow = {
  kind: StationKind;
  name: string;
  ap: number;
  costLabel: string;
  why: string;
};

export type CodexBuildingRow = {
  id: string;
  name: string;
  kind: string;
  zone: string;
  ap: number;
  costLabel: string;
  signature?: string;
  tradeoff?: string;
  why: string;
  relevance: string;
};

export type CodexPlanetTip = {
  planetId: string;
  name: string;
  tip: string;
  tone: "good" | "warn" | "muted";
};

export type SystemCodexModel = {
  objects: PoiIntel[];
  mining: {
    statusLabel: string;
    status: "none" | "own" | "other";
    deposits: { id: string; name: string }[];
    howTo: string[];
  };
  stations: CodexStationRow[];
  buildings: CodexBuildingRow[];
  planetTips: CodexPlanetTip[];
};

const STATION_CODEX: CodexStationRow[] = [
  {
    kind: "mining",
    name: "Добывающая станция",
    ap: 1,
    costLabel: "мет. 24 · снаб. 6",
    why: "Добывает весь пояс системы сразу — не привязана к одному депозиту.",
  },
  {
    kind: "military",
    name: "Оборонная платформа",
    ap: 2,
    costLabel: "мет. 36 · снаб. 12",
    why: "Защита и разрешение верфи, если нет planetary shipyard/spaceport.",
  },
  {
    kind: "science",
    name: "Научная станция",
    ap: 1,
    costLabel: "мет. 18 · снаб. 10",
    why: "Усиливает исследование аномалий и Cognitio в системе.",
  },
  {
    kind: "trade",
    name: "Торговый узел",
    ap: 1,
    costLabel: "мет. 22 · снаб. 8",
    why: "Логистика и обмен; полезен рядом с hub / трафиком.",
  },
  {
    kind: "relay",
    name: "Релейный маяк",
    ap: 1,
    costLabel: "мет. 28 · снаб. 6",
    why: "Связь и навигация державы между системами.",
  },
];

const KIND_WHY: Record<string, string> = {
  residential: "Рост населения и жилфонд колонии.",
  farm: "Пища / Bios — без этого колония голодает.",
  mine: "Добыча местных залежей Extracta на планете.",
  factory: "Промышленность: переработка Materia → Industria.",
  lab: "Наука Cognitio; нужно для tech и аномалий.",
  barracks: "Сухопутные войска — без казарм легион не собрать.",
  capitol: "Админцентр: очки действия, налоги, тип колонии.",
  defense: "Планетарная оборона / щиты.",
  spaceport: "Орбитальный хаб — логистика и верфь-доступ.",
  shipyard: "Постройка кораблей в системе.",
  habitat: "Доп. жильё на орбите.",
  custom: "Особая постройка кампании.",
};

function formatCost(cost?: Record<string, number>): string {
  return formatPlayerCost(cost);
}

function normalizeColony(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

function planetHasKind(p: Planet, kind: string): boolean {
  return [...(p.surfaceBuildings ?? []), ...(p.orbitalBuildings ?? [])].some(
    (b) => !b.disabled && b.kind === kind,
  );
}

function pickBuildingsForSystem(
  system: StarSystem,
  factionId?: string | null,
): CodexBuildingRow[] {
  const content = getCachedContent();
  const buildings = content?.buildings ?? {};
  const kindsNeeded = new Set<string>([
    "mine",
    "farm",
    "factory",
    "lab",
    "shipyard",
    "spaceport",
    "barracks",
    "defense",
    "residential",
    "capitol",
  ]);

  for (const p of system.planets ?? []) {
    for (const b of [...(p.surfaceBuildings ?? []), ...(p.orbitalBuildings ?? [])]) {
      if (b.kind) kindsNeeded.add(b.kind);
    }
    if ((p.resources ?? []).length > 0) kindsNeeded.add("mine");
  }

  const ownPlanets = (system.planets ?? []).filter((p) => {
    const owner = p.ownerFactionId || system.ownerFactionId;
    return factionId && owner === factionId;
  });
  if (ownPlanets.some((p) => classifyPlanet(p) === "inhabited")) {
    kindsNeeded.add("capitol");
  }

  const best = new Map<string, { row: CodexBuildingRow; tier: number }>();
  for (const def of Object.values(buildings)) {
    if (!def?.kind || !kindsNeeded.has(def.kind)) continue;
    if (def.faction && def.faction !== "generic" && def.faction !== factionId) {
      continue;
    }
    const tier = def.tier ?? 1;
    const prev = best.get(def.kind);
    if (prev && prev.tier <= tier) continue;
    best.set(def.kind, {
      tier,
      row: {
        id: def.id,
        name: def.name,
        kind: def.kind,
        zone: def.zone ?? "surface",
        ap: def.ap ?? 1,
        costLabel: formatCost(def.cost),
        signature: def.signature,
        tradeoff: def.tradeoff,
        why: KIND_WHY[def.kind] ?? "Специализированная постройка.",
        relevance: relevanceForKind(def.kind, system, factionId),
      },
    });
  }

  const order = [
    "mine",
    "farm",
    "factory",
    "lab",
    "shipyard",
    "spaceport",
    "barracks",
    "defense",
    "residential",
    "capitol",
  ];
  return [...best.values()]
    .map((x) => x.row)
    .sort((a, b) => {
      const ia = order.indexOf(a.kind);
      const ib = order.indexOf(b.kind);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .slice(0, 10);
}

function relevanceForKind(
  kind: string,
  system: StarSystem,
  factionId?: string | null,
): string {
  const planets = system.planets ?? [];
  const own = planets.filter((p) => {
    const o = p.ownerFactionId || system.ownerFactionId;
    return factionId && o === factionId;
  });

  if (kind === "mine") {
    const withRes = planets.filter((p) => (p.resources ?? []).length > 0);
    const missing = own.filter(
      (p) => (p.resources ?? []).length > 0 && !planetHasKind(p, "mine"),
    );
    if (missing.length)
      return `На ${missing.length} мир(ах) есть залежи без шахты`;
    if (withRes.length) return "В системе есть планетарные залежи";
    return "Локальная добыча, если появятся залежи";
  }
  if (kind === "shipyard" || kind === "spaceport") {
    const has = own.some(
      (p) => planetHasKind(p, "shipyard") || planetHasKind(p, "spaceport"),
    );
    const mil = (system.stations ?? []).some(
      (s) => s.kind === "military" && s.factionId === factionId,
    );
    if (has) return "Верфь уже есть — можно производить корабли";
    if (mil) return "Военная станция частично заменяет верфь";
    return "Нужна для производства кораблей";
  }
  if (kind === "barracks") {
    const has = own.some((p) => planetHasKind(p, "barracks"));
    return has ? "Казармы есть — можно набирать войска" : "Нужны для легионов";
  }
  if (kind === "farm") {
    const hungry = own.filter(
      (p) =>
        (p.population ?? 0) > 0 &&
        !planetHasKind(p, "farm") &&
        classifyPlanet(p) === "inhabited",
    );
    if (hungry.length) return "Колонии без агрокомплекса — риск голода";
    return "Кормит население (Bios)";
  }
  if (kind === "lab") {
    const objs = systemSpaceObjects(system);
    if (objs.some((t) => t === "anomaly" || t === "ruin"))
      return "Рядом аномалия/руины — lab особенно полезен";
    return "Базовая наука державы";
  }
  return KIND_WHY[kind] ?? "";
}

function buildPlanetTips(
  system: StarSystem,
  factionId?: string | null,
): CodexPlanetTip[] {
  const tips: CodexPlanetTip[] = [];
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    const own = !!factionId && owner === factionId;
    const habit = classifyPlanet(p);
    const colony = normalizeColony(p.colonyType);
    const resN = (p.resources ?? []).length;

    if (own && habit === "inhabited") {
      if (resN > 0 && !planetHasKind(p, "mine")) {
        tips.push({
          planetId: p.id,
          name: p.name,
          tip: `Залежи ×${resN} без шахты — построй mine`,
          tone: "warn",
        });
      }
      if ((p.population ?? 0) > 0 && !planetHasKind(p, "farm")) {
        tips.push({
          planetId: p.id,
          name: p.name,
          tip: "Население без агрокомплекса",
          tone: "warn",
        });
      }
      if (colony !== "none") {
        tips.push({
          planetId: p.id,
          name: p.name,
          tip: `Колония: ${COLONY_TYPE_LABELS[colony] ?? colony}`,
          tone: "good",
        });
      }
    } else if (
      habit === "habitable" &&
      colony === "none" &&
      (p.population ?? 0) <= 0
    ) {
      tips.push({
        planetId: p.id,
        name: p.name,
        tip:
          system.ownerFactionId === factionId
            ? "Пригодна — можно колонизировать"
            : "Пустой пригодный мир",
        tone: "warn",
      });
    } else if (!own && habit === "inhabited") {
      tips.push({
        planetId: p.id,
        name: p.name,
        tip: "Чужой мир",
        tone: "muted",
      });
    }
  }
  // Cap noise
  const warn = tips.filter((t) => t.tone === "warn");
  const rest = tips.filter((t) => t.tone !== "warn");
  return [...warn, ...rest].slice(0, 8);
}

export function buildSystemCodex(
  system: StarSystem,
  opts?: {
    factionId?: string | null;
    mapResourceNames?: Record<string, string>;
  },
): SystemCodexModel {
  const factionId = opts?.factionId;
  const names = opts?.mapResourceNames ?? {};
  const mine = systemMineInfo(system, factionId);
  const deposits = (system.resources ?? []).map((id) => ({
    id,
    name: names[id] ?? id.replace(/^map\./, ""),
  }));

  const howTo: string[] = [
    "Депозиты пояса — общие: одна mining-станция качает весь пояс.",
    "ПКМ / долгий тап по депозиту или алерт «Пояс не добывается» → стройка.",
    "Стоимость добычи: мет.24 · снаб.6 · 1 ОД (система должна быть вашей).",
  ];
  if (mine.status === "own") {
    howTo.unshift("Сейчас пояс уже добывается вашей станцией.");
  } else if (mine.status === "other") {
    howTo.unshift("Пояс занят чужой mining-станцией.");
  }

  return {
    objects: systemSpaceObjects(system).map(resolvePoiIntel),
    mining: {
      statusLabel: systemMineLabel(mine.status),
      status: mine.status,
      deposits,
      howTo,
    },
    stations: STATION_CODEX,
    buildings: pickBuildingsForSystem(system, factionId),
    planetTips: buildPlanetTips(system, factionId),
  };
}

/** Short effect line for space object (optional enrichment). */
export function formatEffectHint(
  effect: string,
  args: Record<string, unknown>,
): string {
  const cat = String(args.category ?? "");
  const label = categoryByLetter(cat)?.name ?? cat;
  const tier = args.tier != null ? ` T${args.tier}` : "";
  const amt = Number(args.amount ?? 0);
  const sign = amt >= 0 ? "+" : "";
  switch (effect) {
    case "capacity_add":
      return `${sign}${amt} ёмкость ${label}${tier}`;
    case "rate_mod":
      return `${sign}${amt} rate ${label}${tier}`;
    case "demand_mod":
      return `${sign}${amt} спрос ${label}${tier}`;
    case "unlock_property":
      return `шанс открыть ${String(args.property ?? "свойство")}`;
    default:
      return effect;
  }
}
