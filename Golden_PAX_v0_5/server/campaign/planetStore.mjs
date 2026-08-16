/**
 * Systems/planets/buildings persistence. See domain/planets/*.mjs for the
 * rules this loads/saves data for, and this project's db/schema.sql for
 * the table shapes.
 */
import { derivePlanetSlots, orbitalSlotsForGrade, surfaceSlotsForGrade } from "../domain/planets/planetGrade.mjs";

function newSpaceObjectId() {
  return `sso_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSpaceObjects(db, systemId) {
  return db
    .prepare(
      "SELECT id, type_id as typeId, remaining_amount as remainingAmount FROM system_space_objects WHERE system_id = ?",
    )
    .all(systemId)
    .map((r) => ({
      id: r.id,
      typeId: r.typeId,
      remainingAmount: r.remainingAmount == null ? null : r.remainingAmount,
    }));
}

export function addSpaceObject(db, campaignId, systemId, { id, typeId, remainingAmount }) {
  const objectId = id || newSpaceObjectId();
  db.prepare(
    "INSERT INTO system_space_objects (id, campaign_id, system_id, type_id, remaining_amount) VALUES (?, ?, ?, ?, ?)",
  ).run(objectId, campaignId, systemId, typeId, remainingAmount ?? null);
  return { id: objectId, typeId, remainingAmount: remainingAmount ?? null };
}

export function deleteSpaceObject(db, campaignId, systemId, objectId) {
  const info = db.prepare("DELETE FROM system_space_objects WHERE campaign_id = ? AND system_id = ? AND id = ?").run(campaignId, systemId, objectId);
  return info.changes > 0;
}

/** Replace-all sync, same pattern as planet buildings. */
export function saveSystemSpaceObjects(db, campaignId, systemId, spaceObjects) {
  db.prepare("DELETE FROM system_space_objects WHERE campaign_id = ? AND system_id = ?").run(campaignId, systemId);
  const insert = db.prepare(
    "INSERT INTO system_space_objects (id, campaign_id, system_id, type_id, remaining_amount) VALUES (?, ?, ?, ?, ?)",
  );
  for (const o of spaceObjects || []) {
    insert.run(o.id, campaignId, systemId, o.typeId, o.remainingAmount ?? null);
  }
}

function serializeStars(stars) {
  if (stars == null) return null;
  return JSON.stringify(stars);
}

function parseStars(raw) {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createSystem(db, campaignId, { id, name, ownerFactionId, spaceObjects, x, y, isCapital, kind, stars }) {
  db.prepare(
    "INSERT INTO systems (id, campaign_id, name, owner_faction_id, x, y, is_capital, kind, stars_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, campaignId, name, ownerFactionId ?? null, x ?? null, y ?? null, isCapital ? 1 : 0, kind ?? null, serializeStars(stars));
  for (const spec of spaceObjects || []) {
    addSpaceObject(db, campaignId, id, spec);
  }
  return getSystem(db, campaignId, id);
}

export function getSystem(db, campaignId, systemId) {
  const row = db
    .prepare(
      "SELECT id, name, owner_faction_id as ownerFactionId, x, y, is_capital as isCapital, kind, stars_json as starsJson FROM systems WHERE campaign_id = ? AND id = ?",
    )
    .get(campaignId, systemId);
  if (!row) return null;
  const { starsJson, ...rest } = row;
  return { ...rest, isCapital: !!row.isCapital, kind: row.kind ?? null, stars: parseStars(starsJson), spaceObjects: listSpaceObjects(db, systemId) };
}

export function updateSystem(db, campaignId, systemId, patch) {
  const current = getSystem(db, campaignId, systemId);
  if (!current) return null;
  const name = patch.name ?? current.name;
  const ownerFactionId = patch.ownerFactionId !== undefined ? patch.ownerFactionId : current.ownerFactionId;
  const x = patch.x !== undefined ? patch.x : current.x;
  const y = patch.y !== undefined ? patch.y : current.y;
  const isCapital = patch.isCapital !== undefined ? patch.isCapital : current.isCapital;
  const kind = patch.kind !== undefined ? patch.kind : current.kind;
  const stars = patch.stars !== undefined ? patch.stars : current.stars;
  db.prepare(
    "UPDATE systems SET name = ?, owner_faction_id = ?, x = ?, y = ?, is_capital = ?, kind = ?, stars_json = ? WHERE campaign_id = ? AND id = ?",
  ).run(name, ownerFactionId ?? null, x ?? null, y ?? null, isCapital ? 1 : 0, kind ?? null, serializeStars(stars), campaignId, systemId);
  return getSystem(db, campaignId, systemId);
}

export function listSystemIds(db, campaignId) {
  return db.prepare("SELECT id FROM systems WHERE campaign_id = ?").all(campaignId).map((r) => r.id);
}

const PLANET_COLUMNS = `id, system_id as systemId, name, type, climate, habitable, colonizable, population, colony_type as colonyType,
              owner_faction_id as ownerFactionId, grade, orbital_grade as orbitalGrade,
              surface_slots as surfaceSlots, orbital_slots as orbitalSlots,
              race_composition_json as raceCompositionJson, resources_json as resourcesJson`;

export function createPlanet(db, campaignId, systemId, planet) {
  const slotted = derivePlanetSlots({ ...planet, grade: planet.grade ?? 1, orbitalGrade: planet.orbitalGrade ?? 1 });
  db.prepare(
    `INSERT INTO planets (id, system_id, campaign_id, name, type, climate, habitable, colonizable, population, colony_type, owner_faction_id, grade, orbital_grade, surface_slots, orbital_slots, race_composition_json, resources_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    slotted.id,
    systemId,
    campaignId,
    slotted.name,
    slotted.type ?? null,
    slotted.climate ?? null,
    slotted.habitable === false ? 0 : 1,
    slotted.colonizable === false ? 0 : 1,
    slotted.population ?? 0,
    slotted.colonyType ?? "none",
    slotted.ownerFactionId ?? null,
    slotted.grade,
    slotted.orbitalGrade,
    slotted.surfaceSlots,
    slotted.orbitalSlots,
    JSON.stringify(slotted.raceComposition ?? []),
    JSON.stringify(slotted.resources ?? []),
  );
  return loadPlanet(db, systemId, slotted.id);
}

function rowToPlanet(db, row) {
  const buildings = db
    .prepare("SELECT id, building_id as buildingId, name, kind, zone, disabled FROM planet_buildings WHERE planet_id = ?")
    .all(row.id)
    .map((b) => ({ ...b, disabled: !!b.disabled }));
  const grade = row.grade ?? 1;
  const orbitalGrade = row.orbitalGrade ?? 1;
  return {
    id: row.id,
    systemId: row.systemId,
    name: row.name,
    type: row.type,
    climate: row.climate,
    habitable: !!row.habitable,
    colonizable: !!row.colonizable,
    population: row.population,
    colonyType: row.colonyType,
    ownerFactionId: row.ownerFactionId,
    grade,
    orbitalGrade,
    surfaceSlots: surfaceSlotsForGrade(grade),
    orbitalSlots: orbitalSlotsForGrade(orbitalGrade),
    raceComposition: JSON.parse(row.raceCompositionJson),
    resources: JSON.parse(row.resourcesJson),
    surfaceBuildings: buildings.filter((b) => b.zone !== "orbital"),
    orbitalBuildings: buildings.filter((b) => b.zone === "orbital"),
  };
}

export function loadPlanet(db, systemId, planetId) {
  const row = db.prepare(`SELECT ${PLANET_COLUMNS} FROM planets WHERE system_id = ? AND id = ?`).get(systemId, planetId);
  return row ? rowToPlanet(db, row) : null;
}

/** A system with all of its planets (and each planet's buildings) nested — the shape domain/planets/*.mjs functions expect. */
export function loadSystemWithPlanets(db, campaignId, systemId) {
  const system = getSystem(db, campaignId, systemId);
  if (!system) return null;
  const planetRows = db.prepare(`SELECT ${PLANET_COLUMNS} FROM planets WHERE system_id = ?`).all(systemId);
  return { ...system, planets: planetRows.map((row) => rowToPlanet(db, row)) };
}

export function listSystemsWithPlanets(db, campaignId) {
  return listSystemIds(db, campaignId).map((id) => loadSystemWithPlanets(db, campaignId, id));
}

/** All planets a faction owns across every system in the campaign. */
export function listFactionPlanets(db, campaignId, factionId) {
  const rows = db.prepare(`SELECT ${PLANET_COLUMNS} FROM planets WHERE campaign_id = ? AND owner_faction_id = ?`).all(campaignId, factionId);
  return rows.map((row) => rowToPlanet(db, row));
}

/** Persist a planet's own fields + fully replace its building list (buildings are small in count; simplest correct sync). */
export function savePlanet(db, campaignId, planet) {
  const slotted = derivePlanetSlots(planet);
  db.prepare(
    `UPDATE planets SET name = ?, population = ?, colony_type = ?, owner_faction_id = ?, habitable = ?, colonizable = ?, grade = ?, orbital_grade = ?, surface_slots = ?, orbital_slots = ?, race_composition_json = ?, resources_json = ?
     WHERE campaign_id = ? AND id = ?`,
  ).run(
    slotted.name,
    slotted.population ?? 0,
    slotted.colonyType ?? "none",
    slotted.ownerFactionId ?? null,
    slotted.habitable === false ? 0 : 1,
    slotted.colonizable === false ? 0 : 1,
    slotted.grade,
    slotted.orbitalGrade,
    slotted.surfaceSlots,
    slotted.orbitalSlots,
    JSON.stringify(slotted.raceComposition ?? []),
    JSON.stringify(slotted.resources ?? []),
    campaignId,
    slotted.id,
  );

  db.prepare("DELETE FROM planet_buildings WHERE planet_id = ?").run(slotted.id);
  const insertBuilding = db.prepare("INSERT INTO planet_buildings (id, planet_id, building_id, name, kind, zone, disabled) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const b of [...(slotted.surfaceBuildings ?? []), ...(slotted.orbitalBuildings ?? [])]) {
    insertBuilding.run(b.id, slotted.id, b.buildingId, b.name ?? null, b.kind ?? null, b.zone ?? "surface", b.disabled ? 1 : 0);
  }
}
