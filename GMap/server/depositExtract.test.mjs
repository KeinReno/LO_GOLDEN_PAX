/**
 * Deposit extraction requires a matching building (v0.5).
 * Run: node --test server/depositExtract.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canExtractDeposit,
  extractableDepositIds,
  extractorDepositMap,
  buildingUnlocksDeposit,
} from "./depositExtract.mjs";
import { getContent } from "./contentLoader.mjs";
import { computeFlowBreakdown, runEconomyTick } from "./economyTick.mjs";
import { addPlanetExtraction, emptyFlows } from "./flowEngine.mjs";
import { convertPeggedResource } from "./currencyPeg.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "./ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(__dirname, "..", "data", "ledger.json");
const FX_PATH = path.join(__dirname, "..", "data", "fx-exchange.json");

const fixture = {
  map_resources: {
    "map.iron": {
      id: "map.iron",
      category: "A",
      tier: 1,
      yield: { "currency.metal": 2 },
    },
    "map.solari": {
      id: "map.solari",
      rank: "strategic",
      category: "D",
      tier: 5,
      yield: { "currency.metal": 2 },
    },
    "map.crystals": {
      id: "map.crystals",
      category: "B",
      tier: 2,
      yield: { "currency.materia": 1 },
    },
  },
  buildings: {
    "building.mine": {
      id: "building.mine",
      kind: "mine",
      category: "A",
      extractsCategory: "A",
      tier: 3,
    },
    "extract.gas_well": {
      id: "extract.gas_well",
      kind: "mine",
      category: "A",
      extractsCategory: "D",
      tier: 3,
    },
    "extract.asteroid_harvester": {
      id: "extract.asteroid_harvester",
      kind: "mine",
      category: "A",
      extractsCategory: ["A", "B"],
      tier: 7,
    },
    "energia.thermal_plant": {
      id: "energia.thermal_plant",
      kind: "factory",
      category: "D",
      tier: 2,
    },
    "custom.named": {
      id: "custom.named",
      kind: "mine",
      category: "F",
      extractsDeposits: ["map.iron"],
    },
    "extract.relays": {
      id: "extract.relays",
      kind: "relay",
      category: "A",
      extractsCategory: [],
      tier: 4,
    },
  },
};

function gate(buildings, depositType, content = fixture) {
  return canExtractDeposit({ buildings, depositType, content });
}

describe("canExtractDeposit", () => {
  it("denies a categorized deposit with no building", () => {
    const r = gate([], "map.iron");
    assert.equal(r.allowed, false);
    assert.equal(r.resourceId, "map.iron");
  });

  it("allows iron behind building.mine (extractsCategory A)", () => {
    const r = gate([{ buildingId: "building.mine" }], "map.iron");
    assert.equal(r.allowed, true);
    assert.equal(r.resourceId, "map.iron");
  });

  it("does not let a mine unlock a D deposit", () => {
    const r = gate([{ buildingId: "building.mine" }], "map.solari");
    assert.equal(r.allowed, false);
  });

  it("lets gas_well unlock D (solari), not A", () => {
    const well = [{ buildingId: "extract.gas_well" }];
    assert.equal(gate(well, "map.solari").allowed, true);
    assert.equal(gate(well, "map.iron").allowed, false);
  });

  it("lets asteroid_harvester unlock A and B", () => {
    const h = [{ buildingId: "extract.asteroid_harvester" }];
    assert.equal(gate(h, "map.iron").allowed, true);
    assert.equal(gate(h, "map.crystals").allowed, true);
    assert.equal(gate(h, "map.solari").allowed, false);
  });

  it("falls back to building.category when no extracts* key", () => {
    const r = gate([{ buildingId: "energia.thermal_plant" }], "map.solari");
    assert.equal(r.allowed, true);
  });

  it("honors extractsDeposits over category", () => {
    const r = gate([{ buildingId: "custom.named" }], "map.iron");
    assert.equal(r.allowed, true);
    assert.equal(gate([{ buildingId: "custom.named" }], "map.solari").allowed, false);
  });

  it("does not let extract.relays unlock A via empty extractsCategory", () => {
    const r = gate([{ buildingId: "extract.relays" }], "map.iron");
    assert.equal(r.allowed, false);
  });

  it("ignores disabled buildings", () => {
    const r = gate(
      [{ buildingId: "building.mine", disabled: true }],
      "map.iron",
    );
    assert.equal(r.allowed, false);
  });
});

describe("extractableDepositIds", () => {
  it("filters planet.resources to unlocked deposits", () => {
    const planet = {
      resources: ["map.iron", "map.solari"],
      buildings: [{ buildingId: "building.mine" }],
    };
    assert.deepEqual(extractableDepositIds(planet, fixture), ["map.iron"]);
  });
});

describe("extractorDepositMap", () => {
  it("lists explicit extractor keys only", () => {
    const map = extractorDepositMap(fixture);
    assert.deepEqual(map["building.mine"].extractsCategory, ["A"]);
    assert.deepEqual(map["extract.gas_well"].extractsCategory, ["D"]);
    assert.equal(map["energia.thermal_plant"], undefined);
  });
});

describe("buildingUnlocksDeposit", () => {
  it("is false when either side is missing", () => {
    assert.equal(buildingUnlocksDeposit(null, fixture.map_resources["map.iron"]), false);
  });

  it("treats explicit empty extractsCategory as deny (no A–F fallback)", () => {
    const iron = fixture.map_resources["map.iron"];
    assert.equal(
      buildingUnlocksDeposit({ id: "x", category: "A", extractsCategory: [] }, iron),
      false,
    );
    assert.equal(
      buildingUnlocksDeposit({ id: "x", category: "A", extractsCategory: "" }, iron),
      false,
    );
    assert.equal(
      buildingUnlocksDeposit({ id: "x", category: "A", extractsCategory: null }, iron),
      false,
    );
  });

  it("live extract.relays does not unlock category A deposits", () => {
    const content = getContent();
    const relays = content.buildings["extract.relays"];
    const titan = content.map_resources["map.titan"];
    assert.ok(relays, "extract.relays missing from content");
    assert.ok(titan, "map.titan missing from content");
    assert.equal(buildingUnlocksDeposit(relays, titan), false);
  });
});

describe("addPlanetExtraction gate", () => {
  it("credits 0 named resource with a deposit and no matching building", () => {
    const flows = emptyFlows();
    const strategicExtraction = {};
    addPlanetExtraction(flows, ["map.iron"], fixture, { strategicExtraction });
    assert.equal(flows.B[1].rate, 0);
    assert.equal(flows.A[1].rate, 0);
    assert.equal(Number(strategicExtraction["map.iron"] || 0), 0);
  });

  it("credits named yield when a matching building is passed", () => {
    const flows = emptyFlows();
    addPlanetExtraction(flows, ["map.iron"], fixture, {
      buildings: [{ buildingId: "building.mine" }],
    });
    assert.equal(flows.A[1].rate, 2);
  });

  it("skipExtractGate still credits a bare deposit (belt + mining station)", () => {
    const flows = emptyFlows();
    addPlanetExtraction(flows, ["map.iron"], fixture, { skipExtractGate: true });
    assert.equal(flows.A[1].rate, 2);
  });
});

function miniWorld({ buildings = [], resources = ["map.titan"], factionId = "fA" }) {
  return {
    factions: [{ id: factionId, treasuryPeg: null }],
    systems: [
      {
        id: "s1",
        ownerFactionId: factionId,
        planets: [
          {
            id: "p1",
            resources,
            population: 8,
            colonyType: "colony",
            buildings,
          },
        ],
        stations: [],
        resources: [],
      },
    ],
    fleets: [],
    legions: [],
  };
}

describe("computeFlowBreakdown named extraction", () => {
  const content = getContent();
  const eco = { techTiers: { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 }, stocks: {} };

  it("credits 0 named titan from a bare deposit tile", () => {
    const world = miniWorld({ buildings: [], resources: ["map.titan"] });
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    assert.equal(Number(flow.strategicExtraction?.["map.titan"] || 0), 0);
  });

  it("credits named titan when a matching mine is present", () => {
    const world = miniWorld({
      buildings: [{ buildingId: "building.mine" }],
      resources: ["map.titan"],
    });
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    assert.ok(
      Number(flow.strategicExtraction?.["map.titan"] || 0) > 0,
      `got ${flow.strategicExtraction?.["map.titan"]}`,
    );
  });

  it("does not let extract.relays unlock named titan", () => {
    const world = miniWorld({
      buildings: [{ buildingId: "extract.relays" }],
      resources: ["map.titan"],
    });
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    assert.equal(Number(flow.strategicExtraction?.["map.titan"] || 0), 0);
  });

  it("credits belt sys.resources when a mining station is present", () => {
    const world = {
      factions: [{ id: "fA", treasuryPeg: null }],
      systems: [
        {
          id: "s1",
          ownerFactionId: "fA",
          planets: [
            {
              id: "p1",
              resources: [],
              population: 8,
              colonyType: "colony",
              buildings: [],
            },
          ],
          stations: [{ kind: "mining", factionId: "fA" }],
          resources: ["map.titan"],
        },
      ],
      fleets: [],
      legions: [],
    };
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    assert.ok(
      Number(flow.strategicExtraction?.["map.titan"] || 0) > 0,
      `belt titan=${flow.strategicExtraction?.["map.titan"]}`,
    );
  });

  it("converts peg when pegged to the extracted resource", () => {
    const world = miniWorld({
      buildings: [{ buildingId: "building.mine" }],
      resources: ["map.titan"],
    });
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    const extracted = Number(flow.strategicExtraction?.["map.titan"] || 0);
    const conv = convertPeggedResource(
      { id: "fA", treasuryPeg: "map.titan" },
      extracted,
      content,
      { globalExtractionTotals: { "map.titan": extracted } },
    );
    assert.ok(extracted > 0);
    assert.ok(conv["currency.metal"] > 0, `metal=${conv["currency.metal"]}`);
  });
});

describe("runEconomyTick peg after gated extraction", () => {
  it("still converts pegged titan after all factions extract", () => {
    const content = getContent();
    const tag = `depxtest_${Date.now().toString(36)}`;
    const peggedId = `${tag}_peg`;
    const floorId = `${tag}_floor`;
    const world = {
      meta: { turn: 4 },
      factions: [
        { id: peggedId, treasuryPeg: "map.titan" },
        { id: floorId, treasuryPeg: null },
      ],
      systems: [
        {
          id: `${tag}_sys_p`,
          ownerFactionId: peggedId,
          planets: [
            {
              id: `${tag}_p`,
              resources: ["map.titan"],
              population: 8,
              colonyType: "colony",
              buildings: [{ buildingId: "building.mine" }],
            },
          ],
          stations: [],
          resources: [],
        },
        {
          id: `${tag}_sys_f`,
          ownerFactionId: floorId,
          planets: [
            {
              id: `${tag}_f`,
              resources: ["map.titan"],
              population: 8,
              colonyType: "colony",
              buildings: [{ buildingId: "building.mine" }],
            },
          ],
          stations: [],
          resources: [],
        },
      ],
      fleets: [],
      legions: [],
    };

    const snap = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
    const restore = (p, raw) => {
      if (raw == null) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return;
      }
      fs.writeFileSync(p, raw, "utf8");
    };
    const ledgerSnap = snap(LEDGER_PATH);
    const fxSnap = snap(FX_PATH);
    try {
      const seeded = readLedger();
      for (const id of [peggedId, floorId]) {
        const eco = ensureFactionEco(seeded, id);
        eco.techTiers = { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 };
        eco.stocks["currency.metal"] = 100;
        eco.stocks["currency.supply"] = 70;
      }
      writeLedger(seeded);
      const result = runEconomyTick(world, 5);
      const pegConverted =
        result?.breakdowns?.[peggedId]?.channels?.["currency.metal"]?.pegConverted || 0;
      const floorConverted =
        result?.breakdowns?.[floorId]?.channels?.["currency.metal"]?.pegConverted || 0;
      assert.ok(pegConverted > 0, `pegConverted=${pegConverted}`);
      assert.equal(floorConverted, 0);
      assert.equal(
        result?.breakdowns?.[floorId]?.channels?.["currency.metal"]?.bridgedFrom,
        "legacy_only",
      );
    } finally {
      restore(LEDGER_PATH, ledgerSnap);
      restore(FX_PATH, fxSnap);
    }
  });
});
