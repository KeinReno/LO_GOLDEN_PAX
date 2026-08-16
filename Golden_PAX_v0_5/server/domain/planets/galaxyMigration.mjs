/**
 * GMap → Golden Pax galaxy mapping (pure). Persistence is
 * server/campaign/galaxyMigration.mjs; this file never sees a DB.
 *
 * Settled in notes/2026-08-13-galaxy-migration-grill.md +
 * agent-tasks/GALAXY_MIGRATION_SPEC.md:
 *   - positions/names/links/sectors/kind/stars/ownerFactionId copied as-is
 *   - population is planetCapFromBuildings of migrated buildings, never f(oldPop)
 *   - old population only caps how many buildings to keep (heuristic below)
 *   - starting grade = smallest grade whose slots fit the kept building count
 *   - space-object tags come over as data, including currently-inert ones
 *
 * Building-count heuristic (proposed at implementation time, per the grill):
 * percentile rank of oldPopulation among populated source planets (pop > 0).
 *   maxSurface = pop<=0 ? 0 : clamp(round(1 + pct*47), 1, 48)
 *   maxOrbital = pop<=0 ? 0 : clamp(round(pct*12), 0, 12)
 * Keep min(actual, cap). Prefer residential/habitat, then capitol, then
 * original order — so a pop-7 world with 20 buildings keeps ~1 housing, not
 * a random factory, and a 100M world with 0 buildings stays at 0 buildings
 * (old pop is not a license to invent buildings either).
 *
 * GMap `kind: depot` has no buildings.json def (35 surface instances).
 * Alias depot → factory at the same zone rather than drop the building.
 */
import { defForKindZone, normalizeColonyType } from "./buildingDefs.mjs";
import { planetCapFromBuildings } from "./populationCap.mjs";
import {
  MAX_GRADE,
  smallestGradeForOrbitalSlots,
  smallestGradeForSurfaceSlots,
  surfaceSlotsForGrade,
  orbitalSlotsForGrade,
} from "./planetGrade.mjs";
import { instantiateSpaceObject } from "./spaceObjects.mjs";

export const KIND_ZONE_ALIASES = { depot: "factory" };
const ZONE_FALLBACKS = ["surface", "orbital", "subsurface", "deep"];

const FORBIDDEN_SYSTEM_FIELDS = [
  "coOwnerFactionIds",
  "locked",
  "isCapital",
  "poiType",
  "visibleToFactionIds",
  "activity",
  "tradeWithSystemId",
  "scannerDeadZone",
  "blockaded",
  "anomalyMotion",
  "questId",
  "trafficHub",
  "contested",
  "logistics",
  "revoltContested",
  "revoltUntilTurn",
  "stations",
];

const FORBIDDEN_PLANET_FIELDS = [
  "loyalty",
  "censusLocked",
  "surveyed",
  "orbitIndex",
  "size",
  "coOwnerFactionIds",
  "contested",
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Fraction 0..1 of `sortedAsc` at or below `value`. Min→0, max→1. */
export function percentileRank(value, sortedAsc) {
  if (!sortedAsc?.length) return 0;
  if (sortedAsc.length === 1) return 1;
  let i = 0;
  for (; i < sortedAsc.length; i++) {
    if (sortedAsc[i] > value) break;
  }
  return clamp((i - 1) / (sortedAsc.length - 1), 0, 1);
}

export function populatedPopulations(world) {
  const out = [];
  for (const sys of world?.systems || []) {
    for (const p of sys.planets || []) {
      const n = Number(p.population) || 0;
      if (n > 0) out.push(n);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

export function buildingCountCaps(oldPopulation, percentile) {
  const pop = Number(oldPopulation) || 0;
  if (pop <= 0) return { maxSurface: 0, maxOrbital: 0 };
  return {
    maxSurface: clamp(Math.round(1 + percentile * 47), 1, 48),
    maxOrbital: clamp(Math.round(percentile * 12), 0, 12),
  };
}

function housingRank(b) {
  if (b.kind === "residential" || b.kind === "habitat") return 0;
  if (b.kind === "capitol") return 1;
  return 2;
}

export function trimBuildings(list, cap) {
  const src = list || [];
  if (src.length <= cap) return [...src];
  return src
    .map((b, i) => ({ b, i, r: housingRank(b) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, cap)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.b);
}

export function resolveKindZoneDef(content, kind, zone) {
  const kinds = [kind, KIND_ZONE_ALIASES[kind]].filter(Boolean);
  const zones = [zone, ...ZONE_FALLBACKS.filter((z) => z !== zone)];
  for (const k of kinds) {
    for (const z of zones) {
      const def = defForKindZone(content, k, z);
      if (def) {
        return {
          ok: true,
          def,
          aliased: k !== kind || z !== zone,
        };
      }
    }
  }
  return { ok: false, error: `unmapped_building:${kind}/${zone}` };
}

export function migrateBuildingInstance(content, inst) {
  const kind = inst?.kind;
  const zone = inst?.zone || "surface";
  if (!kind) return { ok: false, error: "building_missing_kind" };
  const resolved = resolveKindZoneDef(content, kind, zone);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    aliased: resolved.aliased,
    building: {
      id: inst.id,
      buildingId: resolved.def.id,
      name: inst.name || resolved.def.name,
      kind,
      zone,
      disabled: !!inst.disabled,
    },
  };
}

export function collectKindZoneCombos(world) {
  const combos = new Map();
  for (const sys of world?.systems || []) {
    for (const p of sys.planets || []) {
      for (const b of [...(p.surfaceBuildings || []), ...(p.orbitalBuildings || [])]) {
        const key = `${b.kind || "?"}/${b.zone || "?"}`;
        combos.set(key, (combos.get(key) || 0) + 1);
      }
    }
  }
  return combos;
}

function spaceObjectTypeId(tag) {
  if (typeof tag === "string") return tag;
  return tag?.typeId || tag?.type || tag?.kind || null;
}

export function migrateSpaceObjects(src, content) {
  const out = [];
  for (const tag of src?.spaceObjects || []) {
    const typeId = spaceObjectTypeId(tag);
    if (!typeId) continue;
    const made = instantiateSpaceObject(typeId, content);
    if (made.ok) out.push(made.instance);
    else out.push({ typeId, remainingAmount: null });
  }
  return out;
}

function normalizeColorHex(color) {
  const s = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  return "#888888";
}

function factionRaceId(faction, world, content) {
  const races = content?.races || {};
  if (faction.primaryRaceId && races[faction.primaryRaceId]) return faction.primaryRaceId;
  const counts = new Map();
  for (const sys of world.systems || []) {
    for (const p of sys.planets || []) {
      const owned = p.ownerFactionId === faction.id || sys.ownerFactionId === faction.id;
      if (!owned) continue;
      for (const rc of p.raceComposition || []) {
        if (!rc?.raceId) continue;
        counts.set(rc.raceId, (counts.get(rc.raceId) || 0) + (Number(rc.percent) || 0));
      }
    }
  }
  let best = null;
  let bestN = -1;
  for (const [id, n] of counts) {
    if (races[id] && n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best || "race_human";
}

export function migrateFaction(faction, world, content) {
  return {
    id: faction.id,
    name: faction.name || faction.id,
    colorHex: normalizeColorHex(faction.color || faction.colorHex),
    raceId: factionRaceId(faction, world, content),
    isNpc: true,
  };
}

export function migrateSector(sector) {
  return {
    id: sector.id,
    name: sector.name || sector.id,
    polygon: Array.isArray(sector.polygon) ? sector.polygon : [],
    color: sector.color ?? null,
    notes: sector.notes ?? null,
  };
}

export function migrateLink(link) {
  return {
    id: link.id,
    fromId: link.fromId,
    toId: link.toId,
    type: link.type || "corridor",
  };
}

export function migrateSystem(src, content) {
  return {
    id: src.id,
    name: src.name,
    x: src.x,
    y: src.y,
    kind: src.kind ?? null,
    stars: Array.isArray(src.stars) ? src.stars : null,
    ownerFactionId: src.ownerFactionId || null,
    spaceObjects: migrateSpaceObjects(src, content),
  };
}

function allSourceBuildings(src) {
  return [...(src.surfaceBuildings || []), ...(src.orbitalBuildings || [])];
}

export function migratePlanet(src, { system, content, populatedSorted }) {
  const oldPopulation = Number(src.population) || 0;
  const pct = percentileRank(oldPopulation, populatedSorted);
  const { maxSurface, maxOrbital } = buildingCountCaps(oldPopulation, pct);

  const resolved = [];
  for (const inst of allSourceBuildings(src)) {
    const r = migrateBuildingInstance(content, inst);
    if (!r.ok) return { ok: false, planetId: src.id, error: r.error };
    resolved.push(r);
  }

  const surfacePool = resolved.filter((r) => r.building.zone !== "orbital").map((r) => r.building);
  const orbitalPool = resolved.filter((r) => r.building.zone === "orbital").map((r) => r.building);
  const surfaceBuildings = trimBuildings(surfacePool, maxSurface);
  const orbitalBuildings = trimBuildings(orbitalPool, maxOrbital);

  const colonyType = normalizeColonyType(src.colonyType);
  const kept = surfaceBuildings.length + orbitalBuildings.length;
  const inhabited = colonyType !== "none" || kept > 0;

  const grade = smallestGradeForSurfaceSlots(surfaceBuildings.length, content);
  const orbitalGrade = smallestGradeForOrbitalSlots(orbitalBuildings.length, content);

  const planet = {
    id: src.id,
    name: src.name,
    type: src.type ?? null,
    climate: src.climate ?? null,
    habitable: src.habitable !== false,
    colonizable: src.colonizable !== false,
    raceComposition: Array.isArray(src.raceComposition) ? src.raceComposition : [],
    resources: Array.isArray(src.resources) ? src.resources.filter((id) => typeof id === "string") : [],
    surfaceBuildings: inhabited ? surfaceBuildings : [],
    orbitalBuildings: inhabited ? orbitalBuildings : [],
    grade: inhabited ? grade : 1,
    orbitalGrade: inhabited ? orbitalGrade : 1,
    colonyType: inhabited ? (colonyType === "none" ? "colony" : colonyType) : "none",
    ownerFactionId: inhabited ? src.ownerFactionId || system?.ownerFactionId || null : null,
  };
  planet.population = inhabited ? planetCapFromBuildings(planet, content) : 0;

  return {
    ok: true,
    planet,
    meta: {
      oldPopulation,
      percentile: pct,
      maxSurface,
      maxOrbital,
      aliasedBuildings: resolved.filter((r) => r.aliased).length,
    },
  };
}

/**
 * Strip the source world down to selected system ids (links whose both
 * ends remain). Sectors and factions are kept in full — they're small.
 */
export function filterWorld(world, systemIds) {
  const keep = new Set(systemIds);
  return {
    ...world,
    systems: (world.systems || []).filter((s) => keep.has(s.id)),
    links: (world.links || []).filter((l) => keep.has(l.fromId) && keep.has(l.toId)),
  };
}

/** Stratified sample: empty + pop-bucket planets + a tagged system. */
export function pickRepresentativeSystemIds(world, n = 24) {
  const systems = world.systems || [];
  const scored = [];
  for (const sys of systems) {
    const planets = sys.planets || [];
    const pops = planets.map((p) => Number(p.population) || 0);
    const maxPop = pops.length ? Math.max(...pops) : 0;
    const buildings = planets.reduce(
      (n, p) => n + (p.surfaceBuildings || []).length + (p.orbitalBuildings || []).length,
      0,
    );
    const tags = (sys.spaceObjects || []).length;
    scored.push({ id: sys.id, maxPop, buildings, tags });
  }
  const pick = new Set();
  const take = (arr, count) => {
    let added = 0;
    for (const row of arr) {
      if (added >= count || pick.size >= n) break;
      if (pick.has(row.id)) continue;
      pick.add(row.id);
      added += 1;
    }
  };
  take(scored.filter((s) => s.maxPop === 0 && s.buildings === 0), 3);
  take([...scored].sort((a, b) => a.maxPop - b.maxPop).filter((s) => s.maxPop > 0), 4);
  take([...scored].sort((a, b) => b.maxPop - a.maxPop), 4);
  take([...scored].sort((a, b) => b.buildings - a.buildings), 6);
  take(scored.filter((s) => (s.tags || 0) > 0), 4);
  take(scored, n);
  return [...pick];
}

export function mapGalaxy(world, content) {
  const populatedSorted = populatedPopulations(world);
  const factions = (world.factions || []).map((f) => migrateFaction(f, world, content));
  const sectors = (world.sectors || []).map(migrateSector);
  const systems = [];
  const planets = [];
  const errors = [];
  let aliasedBuildings = 0;

  for (const src of world.systems || []) {
    const system = migrateSystem(src, content);
    systems.push(system);
    for (const srcPlanet of src.planets || []) {
      const made = migratePlanet(srcPlanet, { system: src, content, populatedSorted });
      if (!made.ok) {
        errors.push(made);
        continue;
      }
      planets.push({ ...made.planet, systemId: src.id });
      aliasedBuildings += made.meta.aliasedBuildings;
    }
  }

  const links = (world.links || []).map(migrateLink);
  const combos = collectKindZoneCombos(world);
  const unresolvedCombos = [...combos.keys()].filter((key) => {
    const [kind, zone] = key.split("/");
    return !resolveKindZoneDef(content, kind, zone).ok;
  });

  return {
    ok: errors.length === 0 && unresolvedCombos.length === 0,
    factions,
    sectors,
    systems,
    planets,
    links,
    errors,
    unresolvedCombos,
    report: {
      systemCount: systems.length,
      planetCount: planets.length,
      linkCount: links.length,
      sectorCount: sectors.length,
      factionCount: factions.length,
      aliasedBuildings,
      kindZoneCombos: [...combos.keys()].sort(),
    },
  };
}

export function assertMappedPlanet(src, mapped, content) {
  if (mapped.population === src.population && Number(src.population) > 200) {
    throw new Error(`population copied from source on ${mapped.id}: ${mapped.population}`);
  }
  const surfaceN = (mapped.surfaceBuildings || []).length;
  const orbitalN = (mapped.orbitalBuildings || []).length;
  if (surfaceN > surfaceSlotsForGrade(mapped.grade, content)) {
    throw new Error(`grade ${mapped.grade} cannot fit ${surfaceN} surface-pool buildings on ${mapped.id}`);
  }
  if (orbitalN > orbitalSlotsForGrade(mapped.orbitalGrade, content)) {
    throw new Error(`orbitalGrade ${mapped.orbitalGrade} cannot fit ${orbitalN} orbital buildings on ${mapped.id}`);
  }
  if (mapped.grade > MAX_GRADE || mapped.orbitalGrade > MAX_GRADE) {
    throw new Error(`grade out of range on ${mapped.id}`);
  }
  for (const field of FORBIDDEN_PLANET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(mapped, field) && mapped[field] != null) {
      throw new Error(`forbidden planet field ${field} on ${mapped.id}`);
    }
  }
}

export function assertMappedSystem(mapped) {
  for (const field of FORBIDDEN_SYSTEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(mapped, field)) {
      throw new Error(`forbidden system field ${field} on ${mapped.id}`);
    }
  }
}

export { FORBIDDEN_PLANET_FIELDS, FORBIDDEN_SYSTEM_FIELDS };
