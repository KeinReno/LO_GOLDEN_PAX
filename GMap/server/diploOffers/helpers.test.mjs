/**
 * Diplo offer helpers: summed escrow, unique assets, capital, system transfer.
 * Run: node --test server/diploOffers/helpers.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  affordResources,
  duplicateAssetError,
  resourceNeedByCurrency,
  transferAssets,
  validateAssets,
} from "./helpers.mjs";

describe("affordResources", () => {
  it("sums same-currency lines before comparing stock", () => {
    const items = [
      { kind: "resource", currencyId: "currency.metal", amount: 50 },
      { kind: "resource", currencyId: "currency.metal", amount: 50 },
    ];
    assert.deepEqual(resourceNeedByCurrency(items), { "currency.metal": 100 });
    const short = affordResources({ "currency.metal": 80 }, items);
    assert.equal(short.ok, false);
    const ok = affordResources({ "currency.metal": 100 }, items);
    assert.equal(ok.ok, true);
  });
});

describe("duplicateAssetError", () => {
  it("rejects the same fleet twice", () => {
    const dup = duplicateAssetError([
      { kind: "fleet", fleetId: "fl1" },
      { kind: "fleet", fleetId: "fl1" },
    ]);
    assert.equal(dup.ok, false);
    const ok = duplicateAssetError([
      { kind: "fleet", fleetId: "fl1" },
      { kind: "fleet", fleetId: "fl2" },
    ]);
    assert.equal(ok.ok, true);
  });
});

describe("validateAssets", () => {
  const world = {
    factions: [{ id: "a", capitalSystemId: "cap" }],
    fleets: [],
    legions: [],
    systems: [
      { id: "cap", ownerFactionId: "a", isCapital: true },
      { id: "out", ownerFactionId: "a", isCapital: false },
    ],
  };

  it("blocks the capital system", () => {
    const cap = validateAssets(world, "a", [{ kind: "system", systemId: "cap" }], {
      factions: {},
    });
    assert.equal(cap.ok, false);
    assert.match(String(cap.error), /столиц/);
  });

  it("rejects catalogPending techs even if unlocked", () => {
    const ledger = {
      factions: {
        a: { unlockedTechs: ["tech.a_asteroid_prospecting"], stocks: {} },
      },
    };
    const out = validateAssets(
      world,
      "a",
      [{ kind: "tech", techId: "tech.a_asteroid_prospecting" }],
      ledger,
    );
    assert.equal(out.ok, false);
  });
});

describe("transferAssets", () => {
  it("moves owned planets and stations with the system", () => {
    const world = {
      factions: [],
      fleets: [],
      legions: [],
      systems: [
        {
          id: "out",
          ownerFactionId: "a",
          planets: [
            { id: "p1", ownerFactionId: "a" },
            { id: "p2", ownerFactionId: "other" },
          ],
          stations: [
            { id: "st1", factionId: "a" },
            { id: "st2", factionId: "other" },
          ],
        },
      ],
    };
    transferAssets(
      world,
      "a",
      "b",
      [{ kind: "system", systemId: "out" }],
      { factions: {} },
    );
    const s = world.systems[0];
    assert.equal(s.ownerFactionId, "b");
    assert.equal(s.planets[0].ownerFactionId, "b");
    assert.equal(s.planets[1].ownerFactionId, "other");
    assert.equal(s.stations[0].factionId, "b");
    assert.equal(s.stations[1].factionId, "other");
  });
});
