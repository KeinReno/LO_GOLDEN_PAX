/**
 * Intel discovery/tick: bootstrap own knowledge, system discovery, diplomacy
 * knowledge bumps, per-turn blockade/presence intel gathering.
 * Extracted from ../intel.mjs.
 */
import {
  readIntelStore,
  writeIntelStore,
  ensureFactionIntel,
  setKnowledgeLevel,
  clampLevel,
  levelFromProgress,
  getIntelRules,
} from "./store.mjs";

/**
 * Bootstrap own race / techs / buildings / units to level 4.
 * @param {object} world
 * @param {string} factionId
 * @param {{ turn?: number, store?: ReturnType<typeof readIntelStore>, persist?: boolean, unlockedTechs?: string[] }} [opts]
 */
export function bootstrapOwnKnowledge(world, factionId, opts = {}) {
  if (!world || !factionId) return;
  const store = opts.store ?? readIntelStore();
  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  setKnowledgeLevel(factionId, "faction", factionId, 4, {
    source: "own",
    turn,
    store,
    persist: false,
  });

  const raceIds = new Set();
  if (Array.isArray(faction?.races)) {
    for (const r of faction.races) {
      const id = typeof r === "string" ? r : r?.id;
      if (id) raceIds.add(id);
    }
  }
  if (faction?.primaryRaceId) raceIds.add(faction.primaryRaceId);
  for (const id of raceIds) {
    setKnowledgeLevel(factionId, "race", id, 4, {
      source: "own",
      turn,
      store,
      persist: false,
    });
  }

  for (const tid of opts.unlockedTechs ?? []) {
    if (tid) {
      setKnowledgeLevel(factionId, "tech", tid, 4, {
        source: "own",
        turn,
        store,
        persist: false,
      });
    }
  }

  // Owned systems → buildings present (legacy + surface/orbital)
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      const lists = [
        ...(p.buildings ?? []),
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of lists) {
        const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
        if (bid) {
          setKnowledgeLevel(factionId, "building", bid, 4, {
            source: "own",
            turn,
            store,
            persist: false,
          });
        }
      }
    }
  }

  const seedUnitId = (uid) => {
    if (!uid || typeof uid !== "string") return;
    // Skip display-name leftovers (non catalog ids)
    if (!uid.includes(".") && !uid.startsWith("ship") && !uid.startsWith("unit")) {
      return;
    }
    setKnowledgeLevel(factionId, "unit", uid, 4, {
      source: "own",
      turn,
      store,
      persist: false,
    });
  };
  for (const f of world.fleets ?? []) {
    if (f.factionId !== factionId) continue;
    seedUnitId(f.unitDefId ?? f.templateId ?? f.classId);
    for (const g of f.composition ?? []) {
      seedUnitId(g?.defId || g?.type);
    }
  }
  for (const l of world.legions ?? []) {
    if (l.factionId !== factionId) continue;
    seedUnitId(l.unitDefId ?? l.templateId ?? l.classId);
    for (const g of l.composition ?? []) {
      seedUnitId(g?.defId || g?.type);
    }
  }

  if (opts.persist !== false && !opts.store) writeIntelStore(store);
}

/**
 * Add progress points toward system intel; apply resulting levels to entities there.
 * @param {object} world
 * @param {string} factionId
 * @param {string} systemId
 * @param {number} amount
 * @param {{ source?: string, turn?: number }} [opts]
 */
export function bumpSystemIntel(world, factionId, systemId, amount, opts = {}) {
  if (!world || !factionId || !systemId || !(amount > 0)) return;
  const store = readIntelStore();
  const row = ensureFactionIntel(factionId, store);
  const prev = Number(row.systemProgress[systemId] ?? 0);
  const next = prev + amount;
  row.systemProgress[systemId] = next;
  store.factions[factionId] = row;
  writeIntelStore(store);

  const level = levelFromProgress(next);
  if (level < 1) return;

  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const source = opts.source ?? "scout";
  applySystemDiscovery(world, factionId, systemId, level, { source, turn });
}

/**
 * Discover entities in a system at least to `level`.
 */
export function applySystemDiscovery(
  world,
  factionId,
  systemId,
  level,
  opts = {},
) {
  const sys = (world.systems ?? []).find((s) => s.id === systemId);
  if (!sys) return;
  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const source = opts.source ?? "fleet";
  const store = opts.store ?? readIntelStore();
  const lv = clampLevel(level);

  if (sys.ownerFactionId && sys.ownerFactionId !== factionId) {
    setKnowledgeLevel(factionId, "faction", sys.ownerFactionId, lv, {
      source,
      turn,
      store,
      persist: false,
    });
  }

  for (const p of sys.planets ?? []) {
    // Population race composition if present
    for (const slice of p.raceComposition ?? p.raceMix ?? p.races ?? []) {
      const rid =
        typeof slice === "string" ? slice : slice?.raceId ?? slice?.id;
      if (rid) {
        setKnowledgeLevel(factionId, "race", rid, Math.min(lv, 2), {
          source,
          turn,
          store,
          persist: false,
        });
      }
    }
    const lists = [
      ...(p.buildings ?? []),
      ...(p.surfaceBuildings ?? []),
      ...(p.orbitalBuildings ?? []),
    ];
    for (const b of lists) {
      const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
      if (bid) {
        setKnowledgeLevel(factionId, "building", bid, lv, {
          source,
          turn,
          store,
          persist: false,
        });
      }
    }
  }

  for (const f of world.fleets ?? []) {
    if (f.systemId !== systemId || f.factionId === factionId) continue;
    if (f.factionId) {
      setKnowledgeLevel(factionId, "faction", f.factionId, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
    const uid = f.unitDefId ?? f.templateId ?? f.classId;
    if (uid) {
      setKnowledgeLevel(factionId, "unit", uid, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
  }
  for (const l of world.legions ?? []) {
    if (l.systemId !== systemId || l.factionId === factionId) continue;
    if (l.factionId) {
      setKnowledgeLevel(factionId, "faction", l.factionId, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
    const uid = l.unitDefId ?? l.templateId ?? l.classId;
    if (uid) {
      setKnowledgeLevel(factionId, "unit", uid, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
  }

  if (opts.persist !== false) writeIntelStore(store);
}

/** Diplomacy relation → faction knowledge floor. */
const DIPLO_FACTION_LEVEL = {
  neutral: 1,
  truce: 1,
  nap: 1,
  war: 1,
  vassal: 2,
  trade: 2,
  alliance: 3,
  research_pact: 3,
  migration_treaty: 2,
};

/**
 * Raise intel from diplomacy relation between two factions (mutual).
 */
export function updateIntelFromDiplomacy(
  world,
  factionId,
  targetFactionId,
  relation,
  opts = {},
) {
  if (!factionId || !targetFactionId || factionId === targetFactionId) return;
  const level = DIPLO_FACTION_LEVEL[relation] ?? 0;
  if (level < 1) return;
  const turn = opts.turn ?? world?.meta?.turn ?? 0;
  const store = opts.store ?? readIntelStore();

  setKnowledgeLevel(factionId, "faction", targetFactionId, level, {
    source: `diplomacy:${relation}`,
    turn,
    store,
    persist: false,
  });

  // Research pact → tech category bump for partner's unlocked techs if available
  if (relation === "research_pact" || relation === "alliance") {
    const techLevel = relation === "research_pact" ? 4 : 3;
    const partnerEco = opts.partnerUnlockedTechs;
    if (Array.isArray(partnerEco)) {
      for (const tid of partnerEco) {
        setKnowledgeLevel(factionId, "tech", tid, techLevel, {
          source: `diplomacy:${relation}`,
          turn,
          store,
          persist: false,
        });
      }
    }
  }

  if (relation === "trade") {
    // Economy peek: discover partner race at 2 if known
    const partner = (world?.factions ?? []).find(
      (f) => f.id === targetFactionId,
    );
    const raceIds = new Set();
    if (partner?.primaryRaceId) raceIds.add(partner.primaryRaceId);
    for (const r of partner?.races ?? []) {
      const rid = typeof r === "string" ? r : r?.id;
      if (rid) raceIds.add(rid);
    }
    for (const rid of raceIds) {
      setKnowledgeLevel(factionId, "race", rid, 2, {
        source: "trade_agreement",
        turn,
        store,
        persist: false,
      });
    }
  }

  if (opts.persist !== false) writeIntelStore(store);
}

/**
 * Tick: fleets on blockade gather intel; sync contacts into intel.
 */
export function processIntelTick(world, getVisibleSystemIds) {
  if (!world) return;
  const rules = getIntelRules();
  const turn = world.meta?.turn ?? 0;
  const store = readIntelStore();

  for (const faction of world.factions ?? []) {
    if (!faction?.id) continue;
    ensureFactionIntel(faction.id, store);
    bootstrapOwnKnowledge(world, faction.id, {
      turn,
      store,
      persist: false,
    });

    const visible = new Set(
      getVisibleSystemIds
        ? getVisibleSystemIds(world, faction.id)
        : (world.systems ?? []).map((s) => s.id),
    );

    // Presence discover level 1
    for (const fleet of world.fleets ?? []) {
      if (fleet.factionId !== faction.id) continue;
      if (!visible.has(fleet.systemId)) continue;
      const sys = (world.systems ?? []).find((s) => s.id === fleet.systemId);
      if (!sys) continue;
      const foreign =
        (sys.ownerFactionId && sys.ownerFactionId !== faction.id) ||
        (world.fleets ?? []).some(
          (f) =>
            f.systemId === fleet.systemId && f.factionId !== faction.id,
        );
      if (foreign) {
        applySystemDiscovery(world, faction.id, fleet.systemId, 1, {
          source: "fleet",
          turn,
          store,
          persist: false,
        });
      }
      if (fleet.stance === "blockade") {
        const prev = Number(
          store.factions[faction.id]?.systemProgress?.[fleet.systemId] ?? 0,
        );
        const next = prev + rules.intelPerBlockadeTurn;
        store.factions[faction.id].systemProgress[fleet.systemId] = next;
        const level = levelFromProgress(next, rules);
        if (level >= 1) {
          applySystemDiscovery(world, faction.id, fleet.systemId, level, {
            source: "blockade",
            turn,
            store,
            persist: false,
          });
        }
      }
    }

    for (const legion of world.legions ?? []) {
      if (legion.factionId !== faction.id) continue;
      if (!visible.has(legion.systemId)) continue;
      applySystemDiscovery(world, faction.id, legion.systemId, 1, {
        source: "legion",
        turn,
        store,
        persist: false,
      });
    }
  }

  writeIntelStore(store);
}
