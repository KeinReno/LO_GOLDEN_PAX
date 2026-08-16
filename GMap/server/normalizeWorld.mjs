/**
 * Soft-normalize WorldState for live table (P0.4).
 * Does not strip unknown fields — only fills safe defaults.
 *
 * Note (B2): faction eco.roleScores lives in ledger.json, not WorldState.
 * Migration/init is ledger.ensureFactionEco → roleScores.ensureRoleScores (8 keys).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncNpcPassiveEffects } from "./courtGovernance.mjs";
import { normalizeGmPegMultipliers } from "./currencyPeg.mjs";
import { derivedGradeFields } from "./planetGrade.mjs";
import { getContent } from "./contentLoader.mjs";
// NOTE: do not import orderEngine here — it pulls tableStore and causes DATA_DIR TDZ.
// Order migration helpers are inlined below (kept in sync with orderEngine.normalizePlayerOrder).

const HOURS_PER_TURN = 24;

function gameHourAtTurn(turn) {
  return Math.max(0, Math.floor(Number(turn) || 0)) * HOURS_PER_TURN;
}

/** Local copy of orderEngine.normalizePlayerOrder — avoid circular import. */
function normalizePlayerOrder(raw, currentTurn = 0) {
  if (!raw || typeof raw !== "object") return raw;
  const category = raw.category ?? "eta";
  let status = raw.status ?? "pending";
  if (category === "eta" && raw.resolvesAt == null) {
    if (status === "pending" || status === "applied" || status === "accepted") {
      status = "resolved";
    }
  }
  if (status === "applied") status = "resolved";
  const { apCost, forceApCost } =
    raw.apCost != null
      ? { apCost: raw.apCost, forceApCost: raw.forceApCost ?? 0 }
      : { apCost: 0, forceApCost: 0 };
  return {
    ...raw,
    category,
    status,
    resolvesAt: raw.resolvesAt ?? null,
    startedAt: raw.startedAt ?? gameHourAtTurn(raw.turn ?? currentTurn),
    baseDuration: raw.baseDuration ?? null,
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers : [],
    progress: raw.progress ?? undefined,
    ratePerTurn: raw.ratePerTurn ?? undefined,
    apCost,
    forceApCost,
  };
}

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
  const content = getContent();
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
    gmPegMultipliers: normalizeGmPegMultipliers(raw.meta?.gmPegMultipliers),
  };

  const systems = (raw.systems ?? []).map((s) => ({
    ...s,
    visibleToFactionIds: Array.isArray(s.visibleToFactionIds)
      ? s.visibleToFactionIds
      : [],
    spaceObjects: Array.isArray(s.spaceObjects) ? s.spaceObjects : [],
    spaceObjectRemaining:
      s.spaceObjectRemaining && typeof s.spaceObjectRemaining === "object"
        ? s.spaceObjectRemaining
        : {},
    resources: Array.isArray(s.resources)
      ? s.resources.map((r) => resolveAlias("resources", r))
      : [],
    planets: Array.isArray(s.planets)
      ? s.planets.map((p) => ({
          ...p,
          resources: Array.isArray(p.resources)
            ? p.resources.map((r) => resolveAlias("resources", r))
            : [],
          loyalty:
            typeof p.loyalty === "number" && Number.isFinite(p.loyalty)
              ? Math.max(0, Math.min(100, p.loyalty))
              : 50,
          stability:
            typeof p.stability === "number" && Number.isFinite(p.stability)
              ? Math.max(0, Math.min(100, p.stability))
              : p.stability,
          raceComposition: Array.isArray(p.raceComposition)
            ? p.raceComposition
            : [],
          cultureId:
            typeof p.cultureId === "string" && p.cultureId
              ? p.cultureId
              : undefined,
          lineageId:
            typeof p.lineageId === "string" && p.lineageId
              ? p.lineageId
              : undefined,
          faithShare: Array.isArray(p.faithShare)
            ? p.faithShare.map((row) => ({
                faithId: String(row.faithId || row.id || ""),
                percent: Number(row.percent ?? row.share ?? 0),
              }))
            : undefined,
          ...derivedGradeFields(p, content),
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
        const asymmetric =
          stance.asymmetric === true ||
          edge.relation === "vassal" ||
          Array.isArray(stance.effectsSubject) ||
          Array.isArray(stance.effectsOverlord);
        let effects = Array.isArray(stance.effects)
          ? stance.effects.map((e) => ({ ...e }))
          : [];
        if (asymmetric) {
          const subjectId =
            edge.subjectFactionId || edge.vassalFactionId || null;
          const overlordId = edge.overlordFactionId || null;
          if (!subjectId && !overlordId) {
            // Undirected edge — skip rather than apply bilaterally.
            effects = [];
          } else if (f.id === subjectId) {
            effects = Array.isArray(stance.effectsSubject)
              ? stance.effectsSubject.map((e) => ({ ...e }))
              : effects;
          } else if (f.id === overlordId || (subjectId && f.id !== subjectId)) {
            effects = Array.isArray(stance.effectsOverlord)
              ? stance.effectsOverlord.map((e) => ({ ...e }))
              : [];
          } else {
            effects = [];
          }
        }
        diplo.treaties.push({
          id: edge.id || `treaty_${f.id}_${otherId}_${edge.relation}`,
          type: edge.relation,
          withFactionId: otherId,
          startedTurn: raw.meta?.turn ?? 0,
          expiresTurn: null,
          effects,
          track: edge.track === "economic" ? "economic" : "political",
          ...(edge.subjectFactionId || edge.vassalFactionId
            ? {
                subjectFactionId:
                  edge.subjectFactionId || edge.vassalFactionId,
              }
            : {}),
          ...(edge.overlordFactionId
            ? { overlordFactionId: edge.overlordFactionId }
            : {}),
        });
      }
    } else {
      // Backfill empty effects from stance catalog (legacy migrated treaties).
      const stances = loadDiplomacyStances();
      diplo.treaties = diplo.treaties.map((t) => {
        // Respect explicit empty effects (e.g. vassal overlord side).
        if (Array.isArray(t.effects)) return t;
        const stance = stances[t.type] || {};
        const asymmetric =
          stance.asymmetric === true ||
          t.type === "vassal" ||
          Array.isArray(stance.effectsSubject) ||
          Array.isArray(stance.effectsOverlord);
        if (asymmetric) {
          const subjectId = t.subjectFactionId || null;
          if (subjectId && f.id !== subjectId) {
            return {
              ...t,
              effects: Array.isArray(stance.effectsOverlord)
                ? stance.effectsOverlord.map((e) => ({ ...e }))
                : [],
            };
          }
        }
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
      defaultCultureId: f?.defaultCultureId ?? "culture.baseline",
      primaryFaith: f?.primaryFaith ?? "faith.secular",
      dominantIdeology: f?.dominantIdeology ?? undefined,
      fxCurrencyId: f?.fxCurrencyId ?? null,
      treasuryPeg: f?.treasuryPeg ?? null,
      pegChangedTurn:
        f?.pegChangedTurn == null || !Number.isFinite(Number(f.pegChangedTurn))
          ? null
          : Number(f.pegChangedTurn),
      lastTreasuryPeg:
        typeof f?.lastTreasuryPeg === "string" && f.lastTreasuryPeg.trim()
          ? f.lastTreasuryPeg.trim()
          : null,
      activeEffects: Array.isArray(f?.activeEffects) ? f.activeEffects : [],
      diplomacy: diplo,
      npcs: Array.isArray(f?.npcs)
        ? f.npcs.map((n) => {
            const postingRaw = n.posting;
            const postingKind =
              postingRaw &&
              typeof postingRaw === "object" &&
              ["court", "governor", "commander", "admiral"].includes(
                postingRaw.kind,
              )
                ? postingRaw.kind
                : "court";
            const posting = {
              kind: postingKind,
              sinceTurn:
                typeof postingRaw?.sinceTurn === "number"
                  ? postingRaw.sinceTurn
                  : (meta?.turn ?? 0),
              ...(postingKind === "governor" &&
              (postingRaw?.systemId || postingRaw?.targetId)
                ? { systemId: postingRaw.systemId || postingRaw.targetId }
                : {}),
              ...(postingKind === "commander"
                ? {
                    ...(postingRaw?.legionId || postingRaw?.forceId
                      ? {
                          legionId: postingRaw.legionId || postingRaw.forceId,
                          forceId: postingRaw.forceId || postingRaw.legionId,
                        }
                      : {}),
                  }
                : {}),
              ...(postingKind === "admiral"
                ? {
                    ...(postingRaw?.fleetId || postingRaw?.forceId
                      ? {
                          fleetId: postingRaw.fleetId || postingRaw.forceId,
                          forceId: postingRaw.forceId || postingRaw.fleetId,
                        }
                      : {}),
                  }
                : {}),
            };
            return {
              ...n,
              raceId:
                typeof n.raceId === "string" && n.raceId ? n.raceId : n.raceId ?? null,
              traitIds: Array.isArray(n.traitIds)
                ? n.traitIds.filter((id) => typeof id === "string")
                : [],
              posting,
              councilSeat:
                typeof n.councilSeat === "string" && n.councilSeat
                  ? n.councilSeat
                  : null,
              blocId:
                typeof n.blocId === "string" && n.blocId ? n.blocId : null,
              isBlocLeader: n.isBlocLeader === true,
              isPlayerRuler: n.isPlayerRuler === true,
              raceLeadership:
                n.raceLeadership &&
                typeof n.raceLeadership === "object" &&
                typeof n.raceLeadership.raceId === "string" &&
                n.raceLeadership.raceId
                  ? {
                      raceId: n.raceLeadership.raceId,
                      ...(typeof n.raceLeadership.title === "string" &&
                      n.raceLeadership.title
                        ? { title: n.raceLeadership.title }
                        : {}),
                    }
                  : null,
              currentTask: n.currentTask ?? undefined,
              relationships:
                n.relationships && typeof n.relationships === "object"
                  ? n.relationships
                  : undefined,
            };
          })
        : [],
      rulerNpcId:
        typeof f?.rulerNpcId === "string" && f.rulerNpcId
          ? f.rulerNpcId
          : null,
      internalBlocs: Array.isArray(f?.internalBlocs)
        ? f.internalBlocs.map((b) => ({
            id: String(b.id || ""),
            name: String(b.name || b.id || ""),
            color: typeof b.color === "string" ? b.color : undefined,
            kind: [
              "house",
              "church",
              "military",
              "guild",
              "race_caucus",
              "guest",
            ].includes(b.kind)
              ? b.kind
              : undefined,
            stance: ["loyal", "ambitious", "hostile", "neutral"].includes(
              b.stance,
            )
              ? b.stance
              : "neutral",
            agenda: typeof b.agenda === "string" ? b.agenda : undefined,
            description:
              typeof b.description === "string" ? b.description : undefined,
            raceIds: Array.isArray(b.raceIds)
              ? b.raceIds.filter((id) => typeof id === "string")
              : undefined,
            leaderNpcId:
              typeof b.leaderNpcId === "string" && b.leaderNpcId
                ? b.leaderNpcId
                : null,
            homeSystemId:
              typeof b.homeSystemId === "string" ? b.homeSystemId : undefined,
            homeSystemName:
              typeof b.homeSystemName === "string"
                ? b.homeSystemName
                : undefined,
            influence: Math.max(0, Math.min(100, Number(b.influence) || 0)),
            support: Math.max(0, Math.min(100, Number(b.support) || 0)),
            threat: Math.max(0, Math.min(100, Number(b.threat) || 0)),
          }))
        : [],
      council:
        f?.council && typeof f.council === "object"
          ? {
              unlockedSeatIds: Array.isArray(f.council.unlockedSeatIds)
                ? f.council.unlockedSeatIds.filter((id) => typeof id === "string")
                : [],
              lockedSeatIds: Array.isArray(f.council.lockedSeatIds)
                ? f.council.lockedSeatIds.filter((id) => typeof id === "string")
                : [],
              seatLabels:
                f.council.seatLabels && typeof f.council.seatLabels === "object"
                  ? Object.fromEntries(
                      Object.entries(f.council.seatLabels).filter(
                        ([k, v]) => typeof k === "string" && typeof v === "string",
                      ),
                    )
                  : undefined,
              seatPortfolios:
                f.council.seatPortfolios &&
                typeof f.council.seatPortfolios === "object"
                  ? Object.fromEntries(
                      Object.entries(f.council.seatPortfolios).filter(
                        ([k, v]) => typeof k === "string" && typeof v === "string",
                      ),
                    )
                  : undefined,
              extraSeats: Array.isArray(f.council.extraSeats)
                ? f.council.extraSeats
                    .filter((s) => s && typeof s.id === "string")
                    .map((s) => ({
                      id: s.id,
                      label:
                        typeof s.label === "string" && s.label
                          ? s.label
                          : "Советник",
                      roles: Array.isArray(s.roles) ? s.roles : undefined,
                      angleDeg:
                        typeof s.angleDeg === "number" ? s.angleDeg : undefined,
                    }))
                : undefined,
            }
          : undefined,
    };
  });

  // Stub faction for leftover revolt legions (stabilityRevolt.mjs also mints rebel.<planet>.<turn>).
  const REBEL_FACTION_ID = "faction_rebels";
  const hasRebelForces =
    fleets.some((f) => f.factionId === REBEL_FACTION_ID) ||
    legions.some((l) => l.factionId === REBEL_FACTION_ID);
  const factionsOut =
    hasRebelForces && !factions.some((f) => f.id === REBEL_FACTION_ID)
      ? [
          ...factions,
          {
            id: REBEL_FACTION_ID,
            name: "Мятежники",
            color: "#6b2b2b",
            kind: "neutral",
            capitalSystemId: null,
            primaryRaceId: null,
            traits: [],
            activeEffects: [],
            diplomacy: { opinions: {}, treaties: [], history: [] },
            npcs: [],
            defaultCultureId: "culture.baseline",
            primaryFaith: "faith.secular",
            fxCurrencyId: null,
            treasuryPeg: null,
          },
        ]
      : factions;

  const out = {
    ...raw,
    meta,
    systems,
    links: raw.links ?? [],
    sectors: raw.sectors ?? [],
    factions: factionsOut,
    races,
    fleets,
    legions,
    diplomacy: diplomacyEdges,
    orders: (raw.orders ?? []).map((o) =>
      normalizePlayerOrder(o, meta.turn ?? 0),
    ),
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

  // Rebuild scoped NPC passives + bloc influence (idempotent).
  try {
    syncNpcPassiveEffects(out);
  } catch {
    // content may be unavailable in some CLI contexts
  }

  return out;
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
