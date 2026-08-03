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
const STANCES_PATH = path.resolve(
  __dirname,
  "../content/core/diplomacy_stances.json",
);

let aliasesCache = null;
let stancesCache = null;

export function loadAliases() {
  if (aliasesCache) return aliasesCache;
  try {
    aliasesCache = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
  } catch {
    aliasesCache = { ships: {}, resources: {}, units: {} };
  }
  return aliasesCache;
}

function loadDiplomacyStances() {
  if (stancesCache) return stancesCache;
  try {
    stancesCache = JSON.parse(fs.readFileSync(STANCES_PATH, "utf8"));
  } catch {
    stancesCache = {};
  }
  return stancesCache;
}

export function resolveAlias(kind, id) {
  if (!id || typeof id !== "string") return id;
  const a = loadAliases();
  const map = a[kind] || {};
  return map[id] ?? map[id.toLowerCase?.()] ?? id;
}

function normalizeCompGroup(g, kind) {
  const defId =
    kind === "ships"
      ? resolveAlias("ships", g.defId || g.type)
      : resolveAlias("units", g.defId || g.type);
  return {
    ...g,
    ...(kind === "ships"
      ? {
          type: resolveAlias("ships", g.type ?? g.defId),
          defId,
        }
      : { defId }),
    count: g.count ?? 1,
    xp: typeof g.xp === "number" ? g.xp : 0,
    level: typeof g.level === "number" ? g.level : 0,
  };
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
    yearlyQuestRolls:
      raw.meta?.yearlyQuestRolls && typeof raw.meta.yearlyQuestRolls === "object"
        ? raw.meta.yearlyQuestRolls
        : {},
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
    planets: Array.isArray(s.planets)
      ? s.planets.map((p) => ({
          ...p,
          loyalty:
            typeof p.loyalty === "number" && Number.isFinite(p.loyalty)
              ? Math.max(0, Math.min(100, p.loyalty))
              : 50,
          raceComposition: Array.isArray(p.raceComposition)
            ? p.raceComposition
            : [],
        }))
      : [],
    logistics:
      s.logistics && typeof s.logistics === "object" ? s.logistics : undefined,
  }));

  const fleets = (raw.fleets ?? []).map((f) => ({
    ...f,
    composition: Array.isArray(f.composition)
      ? f.composition.map((g) => normalizeCompGroup(g, "ships"))
      : [],
    route: Array.isArray(f.route) ? f.route : [],
    stance: f.stance ?? "idle",
    kind: f.kind ?? "combat",
  }));

  const legions = (raw.legions ?? []).map((l) => {
    if (Array.isArray(l.composition) && l.composition.length > 0) {
      return {
        ...l,
        composition: l.composition.map((g) => normalizeCompGroup(g, "units")),
        route: Array.isArray(l.route) ? l.route : [],
      };
    }
    const strength = typeof l.strength === "number" ? l.strength : 1;
    return {
      ...l,
      composition: [
        {
          defId: resolveAlias("units", "unit.generic_line"),
          count: Math.max(1, Math.round(strength)),
          hp: 100,
          xp: 0,
          level: 0,
        },
      ],
      route: Array.isArray(l.route) ? l.route : [],
    };
  });

  const races = (raw.races ?? []).map((r) => ({
    ...r,
    traits: Array.isArray(r?.traits) ? r.traits : [],
    xenorelations:
      r?.xenorelations && typeof r.xenorelations === "object"
        ? r.xenorelations
        : {},
    tags: Array.isArray(r?.tags) ? r.tags : [],
  }));

  const diplomacyEdges = Array.isArray(raw.diplomacy) ? raw.diplomacy : [];

  const factions = (raw.factions ?? []).map((f) => {
    const diplo =
      f?.diplomacy && typeof f.diplomacy === "object"
        ? {
            opinions:
              f.diplomacy.opinions && typeof f.diplomacy.opinions === "object"
                ? f.diplomacy.opinions
                : {},
            treaties: Array.isArray(f.diplomacy.treaties)
              ? f.diplomacy.treaties
              : [],
            history: Array.isArray(f.diplomacy.history)
              ? f.diplomacy.history
              : [],
            lastBrokenTreatyTurn:
              typeof f.diplomacy.lastBrokenTreatyTurn === "number"
                ? f.diplomacy.lastBrokenTreatyTurn
                : null,
          }
        : { opinions: {}, treaties: [], history: [] };

    if (diplo.treaties.length === 0 && diplomacyEdges.length > 0) {
      const stances = loadDiplomacyStances();
      for (const edge of diplomacyEdges) {
        if (!edge || edge.relation === "neutral") continue;
        let otherId = null;
        if (edge.aId === f.id) otherId = edge.bId;
        else if (edge.bId === f.id) otherId = edge.aId;
        if (!otherId) continue;
        const stance = stances[edge.relation] || {};
        const effects = Array.isArray(stance.effects)
          ? stance.effects.map((e) => ({ ...e }))
          : [];
        diplo.treaties.push({
          id: edge.id || `treaty_${f.id}_${otherId}_${edge.relation}`,
          type: edge.relation,
          withFactionId: otherId,
          startedTurn: raw.meta?.turn ?? 0,
          expiresTurn: null,
          effects,
        });
      }
    } else {
      // Backfill empty effects from stance catalog (legacy migrated treaties).
      const stances = loadDiplomacyStances();
      diplo.treaties = diplo.treaties.map((t) => {
        if (Array.isArray(t.effects) && t.effects.length > 0) return t;
        const stance = stances[t.type] || {};
        return {
          ...t,
          effects: Array.isArray(stance.effects)
            ? stance.effects.map((e) => ({ ...e }))
            : [],
        };
      });
    }

    return {
      ...f,
      traits: Array.isArray(f?.traits) ? f.traits : [],
      capitalSystemId: f?.capitalSystemId ?? null,
      primaryRaceId: f?.primaryRaceId ?? f?.primaryRace ?? null,
      activeEffects: Array.isArray(f?.activeEffects) ? f.activeEffects : [],
      diplomacy: diplo,
      npcs: Array.isArray(f?.npcs)
        ? f.npcs.map((n) => ({
            ...n,
            currentTask: n.currentTask ?? undefined,
            relationships:
              n.relationships && typeof n.relationships === "object"
                ? n.relationships
                : undefined,
          }))
        : [],
    };
  });

  return {
    ...raw,
    meta,
    systems,
    links: raw.links ?? [],
    sectors: raw.sectors ?? [],
    factions,
    races,
    fleets,
    legions,
    diplomacy: diplomacyEdges,
    orders: raw.orders ?? [],
    turnHistory: raw.turnHistory ?? [],
    caravans: raw.caravans ?? [],
    quests: (raw.quests ?? []).map((q) => ({
      ...q,
      type: q.type || "side",
      history: Array.isArray(q.history) ? q.history : [],
      sourceNpcId: q.sourceNpcId ?? null,
      sourceFactionId: q.sourceFactionId ?? null,
      sourceSystemId: q.sourceSystemId ?? q.systemId ?? null,
      expiresTurn: q.expiresTurn ?? null,
      catalogId: q.catalogId ?? null,
    })),
    courtEvents: Array.isArray(raw.courtEvents) ? raw.courtEvents : [],
    loyaltyMatrix:
      raw.loyaltyMatrix && typeof raw.loyaltyMatrix === "object"
        ? raw.loyaltyMatrix
        : {},
    _aliasesVersion: aliases.version ?? 1,
  };
}

/**
 * Soft-normalize a persisted engagement (A6 migration).
 */
export function normalizeEngagement(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const status =
    raw.status === "commit" || raw.status === "contact"
      ? "active"
      : raw.status || "active";
  return {
    ...raw,
    status,
    startedTurn: raw.startedTurn ?? raw.turnCreated ?? 0,
    roundsElapsed: raw.roundsElapsed ?? 0,
    maxRounds: raw.maxRounds ?? 3,
    requiresPlayerInput:
      raw.requiresPlayerInput != null ? raw.requiresPlayerInput : true,
    mode: raw.mode || "auto",
    cardBattleRequests: Array.isArray(raw.cardBattleRequests)
      ? raw.cardBattleRequests
      : [],
    phase: raw.phase ?? (raw.theater === "assault" ? "bombard" : undefined),
    sides: (raw.sides || []).map((s) => ({
      ...s,
      locked: s.locked === true,
      stance: s.stance || "hold",
    })),
  };
}
