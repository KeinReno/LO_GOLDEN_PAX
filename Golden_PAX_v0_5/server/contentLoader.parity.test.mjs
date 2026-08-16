/**
 * Parity check against GMap's original loader (GMap/server/contentLoader.mjs)
 * on the same content — proves the rewrite in ./contentLoader.mjs (table-
 * driven merge spec instead of ~50 hand-written blocks) preserves exact
 * behavior. This test imports across the repo boundary into ../GMap on
 * purpose; delete it once GMap is retired and this loader is the only one.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContent as loadContentNew } from "./contentLoader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldLoaderPath = path.resolve(__dirname, "../../GMap/server/contentLoader.mjs");

// content/core diverged from GMap's copy on 2026-08-12/13 with a few new,
// intentional fields (domain/planets/domain/forces new design, not ported
// from GMap — see their READMEs). Strip them before comparing so this test
// still verifies loader/merge parity for everything else. 2026-08-13 also
// added diplomacy `track` + currency_exchange/currency_union (two-track
// economic relations, Q6/Q7 of the currency-peg grill). 2026-08-14 added
// economy_balance.planetGrade and space_objects depletes/combat fields
// (Priority 4, not present in GMap). 2026-08-14 Tech Tree 2.0 added
// direction/gradeable/socket/raceAffinity on techs, fixture techs, and
// requiresTech / weapon.plasma on unit.armor_cadre.
// Nested catalog upgrades[] were stripped from this tree (zero live
// prereqs); GMap still has them, so stripNewFields drops `upgrades` on both.
function stripNewFields(content) {
  const out = { ...content };
  if (out.buildings) {
    const buildings = {};
    for (const [id, def] of Object.entries(out.buildings)) {
      const { laborSlots, ...rest } = def;
      buildings[id] = rest;
    }
    out.buildings = buildings;
  }
  if (out.units?.["unit.militia"]) {
    const units = { ...out.units };
    const { raisableWithoutBuilding, ...rest } = units["unit.militia"];
    units["unit.militia"] = rest;
    out.units = units;
  }
  if (out.units?.["unit.armor_cadre"]) {
    const units = { ...out.units };
    const { requiresTech, ...rest } = units["unit.armor_cadre"];
    if (Array.isArray(rest.slots)) {
      rest.slots = rest.slots.map((slot) => {
        const props = slot.require?.properties;
        if (!props?.includes("weapon.plasma")) return slot;
        return {
          ...slot,
          require: { ...slot.require, properties: props.filter((p) => p !== "weapon.plasma") },
        };
      });
    }
    units["unit.armor_cadre"] = rest;
    out.units = units;
  }
  if (out.technologies) {
    const technologies = {};
    for (const [id, def] of Object.entries(out.technologies)) {
      if (id.startsWith("tech.fixture.")) continue;
      const { direction, gradeable, gradeTable, socket, raceAffinity, upgrades, ...rest } = def;
      technologies[id] = rest;
    }
    out.technologies = technologies;
  }
  if (out.economy_balance?.forces) {
    const { mobilizationRate, crewPerTier, ...rest } = out.economy_balance.forces;
    out.economy_balance = { ...out.economy_balance, forces: rest };
  }
  if (out.economy_balance) {
    const { planetGrade, currencyPeg, stability, ...rest } = out.economy_balance;
    out.economy_balance = rest;
  }
  if (out.rules?.movement) {
    const {
      engineRangeHops,
      fuelMovementPoints,
      legionMovementPoints,
      movementPointsPerHop,
      ...rest
    } = out.rules.movement;
    // GMap leaves legionRangeHops null (falls back to rangeHops: 3). This
    // project's movement spec stores the equivalent as an explicit 3.
    out.rules = { ...out.rules, movement: { ...rest, legionRangeHops: rest.legionRangeHops === 3 ? null : rest.legionRangeHops } };
  }
  if (out.space_objects?.objects) {
    const objects = {};
    for (const [id, def] of Object.entries(out.space_objects.objects)) {
      const { depletes, startingRemaining, combat, ...rest } = def;
      objects[id] = rest;
    }
    out.space_objects = { ...out.space_objects, objects };
  }
  if (out.diplomacy_stances) {
    const stances = {};
    for (const [id, def] of Object.entries(out.diplomacy_stances)) {
      if (id === "currency_exchange" || id === "currency_union") continue;
      const { track, blurb, ...rest } = def;
      stances[id] = rest;
    }
    out.diplomacy_stances = stances;
  }
  return out;
}

describe("contentLoader parity with GMap", () => {
  it("produces identical merged content for core+golden_pax", async () => {
    const { loadContent: loadContentOld } = await import(oldLoaderPath);

    const oldContent = loadContentOld(["core", "golden_pax"]);
    const newContent = loadContentNew(["core", "golden_pax"]);

    const strip = ({ loadedAt, ...rest }) => stripNewFields(rest);
    expect(strip(newContent)).toEqual(strip(oldContent));
  });

  it("produces identical content for core alone", async () => {
    const { loadContent: loadContentOld } = await import(oldLoaderPath);

    const oldContent = loadContentOld(["core"]);
    const newContent = loadContentNew(["core"]);

    const strip = ({ loadedAt, ...rest }) => stripNewFields(rest);
    expect(strip(newContent)).toEqual(strip(oldContent));
  });
});
