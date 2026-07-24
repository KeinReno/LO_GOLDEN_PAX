/**
 * Soft-normalize WorldState for live table (P0.4).
 * Does not strip unknown fields — only fills safe defaults.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIASES_PATH = path.resolve(
  __dirname,
  "../content/core/id-aliases.json",
);

let aliasesCache = null;

export function loadAliases() {
  if (aliasesCache) return aliasesCache;
  try {
    aliasesCache = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
  } catch {
    aliasesCache = { ships: {}, resources: {}, units: {} };
  }
  return aliasesCache;
}

export function resolveAlias(kind, id) {
  if (!id || typeof id !== "string") return id;
  const a = loadAliases();
  const map = a[kind] || {};
  return map[id] ?? map[id.toLowerCase?.()] ?? id;
}

export function normalizeWorld(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("normalizeWorld: expected object");
  }
  const aliases = loadAliases();
  const meta = {
    schemaVersion: raw.meta?.schemaVersion ?? 9,
    name: raw.meta?.name ?? "Кампания",
    turn: raw.meta?.turn ?? 0,
    createdAt: raw.meta?.createdAt ?? new Date().toISOString(),
    updatedAt: raw.meta?.updatedAt ?? new Date().toISOString(),
    width: raw.meta?.width ?? 4000,
    height: raw.meta?.height ?? 3000,
    tableRevision: raw.meta?.tableRevision ?? 0,
    contentPacks: raw.meta?.contentPacks ?? ["core"],
  };

  const systems = (raw.systems ?? []).map((s) => ({
    ...s,
    visibleToFactionIds: Array.isArray(s.visibleToFactionIds)
      ? s.visibleToFactionIds
      : [],
    spaceObjects: Array.isArray(s.spaceObjects) ? s.spaceObjects : [],
    resources: Array.isArray(s.resources)
      ? s.resources.map((r) => resolveAlias("resources", r))
      : [],
    planets: Array.isArray(s.planets) ? s.planets : [],
  }));

  const fleets = (raw.fleets ?? []).map((f) => ({
    ...f,
    composition: Array.isArray(f.composition)
      ? f.composition.map((g) => ({
          ...g,
          type: resolveAlias("ships", g.type ?? g.defId),
          defId: g.defId
            ? resolveAlias("ships", g.defId)
            : resolveAlias("ships", g.type),
          count: g.count ?? 1,
        }))
      : [],
    route: Array.isArray(f.route) ? f.route : [],
    stance: f.stance ?? "idle",
    kind: f.kind ?? "combat",
  }));

  const legions = (raw.legions ?? []).map((l) => {
    if (Array.isArray(l.composition) && l.composition.length > 0) {
      return {
        ...l,
        composition: l.composition.map((g) => ({
          ...g,
          defId: resolveAlias("units", g.defId ?? g.type),
          count: g.count ?? 1,
        })),
        route: Array.isArray(l.route) ? l.route : [],
      };
    }
    // Migrate legacy strength → generic stack
    const strength = typeof l.strength === "number" ? l.strength : 1;
    return {
      ...l,
      composition: [
        {
          defId: resolveAlias("units", "unit.generic_line"),
          count: Math.max(1, Math.round(strength)),
          hp: 100,
        },
      ],
      route: Array.isArray(l.route) ? l.route : [],
    };
  });

  return {
    ...raw,
    meta,
    systems,
    links: raw.links ?? [],
    sectors: raw.sectors ?? [],
    factions: raw.factions ?? [],
    races: raw.races ?? [],
    fleets,
    legions,
    diplomacy: raw.diplomacy ?? [],
    orders: raw.orders ?? [],
    turnHistory: raw.turnHistory ?? [],
    caravans: raw.caravans ?? [],
    quests: raw.quests ?? [],
    _aliasesVersion: aliases.version ?? 1,
  };
}
