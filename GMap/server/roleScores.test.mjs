/**
 * 8 RoleScores: exist, tick, B2 structural/energy still work.
 * Breakthrough stays a paid cognitio gate (not a silent unlock).
 * Run: node --test server/roleScores.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_IDS,
  applyRoleScores,
  emptyRoleScores,
  ensureRoleScores,
  publicRoleScores,
} from "./roleScores.mjs";
import { getContent } from "./contentLoader.mjs";
import {
  checkPathGate,
  isPathOpen,
  applyOpenPathEffect,
  pathStatusPayload,
} from "./techPaths.mjs";
import { computeFlowBreakdown } from "./economyTick.mjs";

const EIGHT = [
  "structural",
  "energy",
  "offensive",
  "defensive",
  "mobility",
  "cognitive",
  "biological",
  "exotic",
];

const content = {
  map_resources: {
    "map.iron": { id: "map.iron", tier: 1, roles: ["structural"] },
    "map.solari": {
      id: "map.solari",
      tier: 5,
      roles: ["energy", "offensive"],
    },
    "map.blumatid": {
      id: "map.blumatid",
      tier: 4,
      roles: ["structural", "defensive"],
    },
    "map.biomass": { id: "map.biomass", tier: 2, roles: ["biological"] },
    "map.relics": { id: "map.relics", tier: 9, roles: ["exotic"] },
    "map.grinid": { id: "map.grinid", tier: 7, roles: ["cognitive"] },
    "map.titan": { id: "map.titan", tier: 3, roles: ["structural", "mobility"] },
    "map.untyped": { id: "map.untyped", tier: 4, roles: [] },
  },
  economy_schema: {
    role_score_pilot: {
      roles: {},
      thresholds: Object.fromEntries(EIGHT.map((id) => [id, 5000])),
    },
  },
  role_milestones: Object.fromEntries(
    EIGHT.map((id) => [id, { id, threshold: 5000 }]),
  ),
  tech_paths: {
    paths: Object.fromEntries(
      EIGHT.map((id) => [
        id,
        {
          id,
          roleScoreKey: id,
          label: id,
          breakthroughTechId: `tech.path.${id}_breakthrough`,
        },
      ]),
    ),
  },
  technologies: {
    "tech.path.energy_breakthrough": {
      id: "tech.path.energy_breakthrough",
      opensPath: "energy",
      cost: { "currency.cognitio": 70 },
      effects: [{ effect: "open_path", args: { pathId: "energy" } }],
    },
  },
};

describe("ROLE_IDS", () => {
  it("lists the closed 8 roles", () => {
    assert.deepEqual([...ROLE_IDS], EIGHT);
  });
});

describe("ensureRoleScores / publicRoleScores", () => {
  it("creates all 8 scores at 0", () => {
    const eco = {};
    const scores = ensureRoleScores(eco);
    assert.equal(Object.keys(scores).length, 8);
    for (const id of EIGHT) assert.equal(scores[id], 0);
    assert.deepEqual(publicRoleScores(eco), emptyRoleScores());
  });

  it("fills missing keys on a B2 two-score save without wiping existing", () => {
    const eco = { roleScores: { structural: 12, energy: 40 } };
    ensureRoleScores(eco);
    assert.equal(eco.roleScores.structural, 12);
    assert.equal(eco.roleScores.energy, 40);
    for (const id of EIGHT) {
      if (id === "structural" || id === "energy") continue;
      assert.equal(eco.roleScores[id], 0);
    }
  });
});

describe("applyRoleScores tick", () => {
  it("grows structural from iron (B2 still works)", () => {
    const eco = { roleScores: emptyRoleScores() };
    applyRoleScores(eco, content, { "map.iron": 3 });
    assert.equal(eco.roleScores.structural, 3);
    assert.equal(eco.roleScores.energy, 0);
  });

  it("grows energy from solari (B2 still works) and also offensive", () => {
    const eco = { roleScores: emptyRoleScores() };
    applyRoleScores(eco, content, { "map.solari": 2 });
    assert.equal(eco.roleScores.energy, 10);
    assert.equal(eco.roleScores.offensive, 10);
    assert.equal(eco.roleScores.structural, 0);
  });

  it("ticks the remaining 6 roles from tagged extraction", () => {
    const eco = { roleScores: emptyRoleScores() };
    applyRoleScores(eco, content, {
      "map.blumatid": 1,
      "map.titan": 1,
      "map.grinid": 1,
      "map.biomass": 1,
      "map.relics": 1,
    });
    assert.equal(eco.roleScores.structural, 4 + 3);
    assert.equal(eco.roleScores.defensive, 4);
    assert.equal(eco.roleScores.mobility, 3);
    assert.equal(eco.roleScores.cognitive, 7);
    assert.equal(eco.roleScores.biological, 2);
    assert.equal(eco.roleScores.exotic, 9);
  });

  it("never decreases and ignores untagged resources", () => {
    const eco = { roleScores: { ...emptyRoleScores(), structural: 9 } };
    applyRoleScores(eco, content, { "map.untyped": 50, "map.iron": 1 });
    assert.equal(eco.roleScores.structural, 10);
    assert.equal(eco.roleScores.energy, 0);
  });

  it("does not double-add when def.roles and schema both tag the same role", () => {
    const eco = { roleScores: emptyRoleScores() };
    const dual = {
      map_resources: {
        "map.iron": { id: "map.iron", tier: 1, roles: ["structural"] },
      },
      economy_schema: {
        role_score_pilot: { roles: { structural: ["map.iron"] } },
      },
    };
    applyRoleScores(eco, dual, { "map.iron": 3 });
    assert.equal(eco.roleScores.structural, 3);
  });
});

describe("breakthrough is not a silent unlock", () => {
  it("threshold alone does not open the path", () => {
    const eco = {
      roleScores: { ...emptyRoleScores(), energy: 5000 },
      openPaths: [],
    };
    assert.equal(isPathOpen(eco, "energy"), false);
    const gate = checkPathGate(
      content.technologies["tech.path.energy_breakthrough"],
      eco,
      content,
    );
    assert.equal(gate.ok, true);
    assert.equal(isPathOpen(eco, "energy"), false);
  });

  it("below threshold blocks the paid breakthrough", () => {
    const eco = {
      roleScores: { ...emptyRoleScores(), energy: 4999 },
      openPaths: [],
    };
    const gate = checkPathGate(
      content.technologies["tech.path.energy_breakthrough"],
      eco,
      content,
    );
    assert.equal(gate.ok, false);
    assert.match(gate.error, /RoleScore/);
  });

  it("opens only after the breakthrough effect", () => {
    const eco = {
      roleScores: { ...emptyRoleScores(), energy: 5000 },
      openPaths: [],
    };
    applyOpenPathEffect(eco, "energy");
    assert.equal(isPathOpen(eco, "energy"), true);
  });

  it("gates all 8 roles: below threshold blocks, at threshold allows, does not auto-open", () => {
    for (const id of EIGHT) {
      const def = {
        id: `tech.path.${id}_breakthrough`,
        opensPath: id,
        effects: [{ effect: "open_path", args: { pathId: id } }],
      };
      const empty = { roleScores: emptyRoleScores(), openPaths: [] };
      const blocked = checkPathGate(def, empty, content);
      assert.equal(blocked.ok, false, id);
      assert.match(blocked.error, /RoleScore/);

      const scores = emptyRoleScores();
      scores[id] = 5000;
      const ready = { roleScores: scores, openPaths: [] };
      const gate = checkPathGate(def, ready, content);
      assert.equal(gate.ok, true, id);
      assert.equal(isPathOpen(ready, id), false, id);
    }
  });

  it("gates a missing tech_paths entry via role_milestones (exotic)", () => {
    const thin = {
      ...content,
      tech_paths: { paths: { energy: content.tech_paths.paths.energy } },
    };
    const def = {
      opensPath: "exotic",
      effects: [{ effect: "open_path", args: { pathId: "exotic" } }],
    };
    const blocked = checkPathGate(
      def,
      { roleScores: emptyRoleScores(), openPaths: [] },
      thin,
    );
    assert.equal(blocked.ok, false);
    const ready = checkPathGate(
      def,
      { roleScores: { ...emptyRoleScores(), exotic: 5000 }, openPaths: [] },
      thin,
    );
    assert.equal(ready.ok, true);
  });
});

describe("live content — 8 roles, B2 iron/solari still work", () => {
  it("milestones + path defs exist for all 8", () => {
    const c = getContent();
    for (const id of EIGHT) {
      const ms = c.role_milestones?.[id];
      assert.ok(ms, `missing role_milestones.${id}`);
      assert.equal(Number(ms.threshold), 5000);
      assert.equal(c.tech_paths?.paths?.[id]?.roleScoreKey, id, `path ${id}`);
    }
  });

  it("live map_resources: iron grows structural only; solari grows energy (B2) and offensive", () => {
    const c = getContent();
    const eco = { roleScores: emptyRoleScores() };
    applyRoleScores(eco, c, { "map.iron": 3 });
    assert.equal(eco.roleScores.structural, 3);
    assert.equal(eco.roleScores.energy, 0);
    applyRoleScores(eco, c, { "map.solari": 2 });
    assert.equal(eco.roleScores.energy, 10);
    assert.equal(eco.roleScores.offensive, 10);
    assert.equal(eco.roleScores.structural, 3);
  });

  it("live extraction tags accumulate all 8", () => {
    const c = getContent();
    const eco = { roleScores: emptyRoleScores() };
    applyRoleScores(eco, c, {
      "map.iron": 1,
      "map.solari": 1,
      "map.blumatid": 1,
      "map.titan": 1,
      "map.grinid": 1,
      "map.biomass": 1,
      "map.relics": 1,
    });
    for (const id of EIGHT) {
      assert.ok(eco.roleScores[id] > 0, `${id} should accumulate`);
    }
  });

  it("economy_balance.roleScore.keys matches the closed 8", () => {
    const c = getContent();
    assert.deepEqual(c.economy_balance?.roleScore?.keys, EIGHT);
    assert.ok(c.economy_balance?.currencyPeg);
    assert.equal(c.economy_balance?.forces?.mobilizationRate, 0.3);
    assert.equal(c.economy_balance?.forces?.crewPerTier, 5);
  });

  it("checkPathGate keys on all 8 RoleScores via path id even without live techs", () => {
    const c = getContent();
    for (const id of EIGHT) {
      const def = {
        opensPath: id,
        effects: [{ effect: "open_path", args: { pathId: id } }],
      };
      const blocked = checkPathGate(
        def,
        { roleScores: emptyRoleScores(), openPaths: [] },
        c,
      );
      assert.equal(blocked.ok, false, `${id} below threshold`);
      assert.match(blocked.error, /RoleScore/);
      const ready = checkPathGate(
        def,
        { roleScores: { ...emptyRoleScores(), [id]: 5000 }, openPaths: [] },
        c,
      );
      assert.equal(ready.ok, true, `${id} at threshold`);
      assert.equal(isPathOpen({ openPaths: [] }, id), false);
    }
  });

  it("milestone buildings requireRoleMilestone for all 8", () => {
    const c = getContent();
    for (const id of EIGHT) {
      const bId = c.role_milestones[id].unlocks[0].id;
      const def = c.buildings[bId];
      assert.equal(def?.requireRoleMilestone, id, bId);
    }
  });
});

describe("tick extraction — bulk + strategic (B2 T2.4)", () => {
  it("iron (bulk) scores structural; solari (strategic) still scores energy", () => {
    const world = {
      factions: [{ id: "fA" }],
      systems: [
        {
          id: "s1",
          ownerFactionId: "fA",
          planets: [{ id: "p1", resources: [], population: 8, buildings: [] }],
          stations: [{ kind: "mining", factionId: "fA" }],
          resources: ["map.iron", "map.solari"],
        },
      ],
      fleets: [],
      legions: [],
    };
    const eco = {
      techTiers: { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 },
      stocks: {},
    };
    const flow = computeFlowBreakdown(world, "fA", getContent(), eco);
    const ironRole = Number(flow.roleExtraction?.["map.iron"] || 0);
    const ironNamed = Number(flow.strategicExtraction?.["map.iron"] || 0);
    const solariRole = Number(flow.roleExtraction?.["map.solari"] || 0);
    const solariNamed = Number(flow.strategicExtraction?.["map.solari"] || 0);
    assert.ok(ironRole > 0, `bulk iron in roleExtraction, got ${ironRole}`);
    assert.equal(ironNamed, 0, "iron must not dual-write named stocks");
    assert.ok(solariRole > 0, `solari in roleExtraction, got ${solariRole}`);
    assert.ok(solariNamed > 0, "solari remains strategic for B1/peg");

    const scores = emptyRoleScores();
    applyRoleScores({ roleScores: scores }, getContent(), flow.roleExtraction);
    assert.ok(scores.structural > 0, "B2 structural still grows from iron");
    assert.ok(scores.energy > 0, "B2 energy still grows from solari");
  });
});

describe("pathStatusPayload — ready only with a live breakthrough", () => {
  it("fixture: only energy is ready because only energy has a tech file", () => {
    const scores = emptyRoleScores();
    for (const id of EIGHT) scores[id] = 5000;
    const rows = pathStatusPayload({ roleScores: scores, openPaths: [] }, content);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(byId.energy.ready, true);
    assert.equal(byId.energy.breakthroughTechId, "tech.path.energy_breakthrough");
    for (const id of EIGHT.filter((x) => x !== "energy")) {
      assert.equal(byId[id].ready, false, id);
      assert.equal(byId[id].breakthroughTechId, null, id);
    }
  });

  it("treats catalogPending breakthrough as not live", () => {
    const scores = { ...emptyRoleScores(), energy: 5000 };
    const pending = {
      ...content,
      technologies: {
        "tech.path.energy_breakthrough": {
          id: "tech.path.energy_breakthrough",
          catalogPending: true,
        },
      },
    };
    const row = pathStatusPayload(
      { roleScores: scores, openPaths: [] },
      pending,
    ).find((r) => r.id === "energy");
    assert.equal(row.ready, false);
    assert.equal(row.breakthroughTechId, null);
  });

  it("live catalog: offensive/defensive/mobility ready; five empty paths not ready", () => {
    const c = getContent();
    const scores = emptyRoleScores();
    for (const id of EIGHT) scores[id] = 99999;
    const byId = Object.fromEntries(
      pathStatusPayload({ roleScores: scores, openPaths: [] }, c).map((r) => [
        r.id,
        r,
      ]),
    );
    assert.equal(byId.offensive.ready, true);
    assert.equal(byId.defensive.ready, true);
    assert.equal(byId.mobility.breakthroughTechId, "tech.path.mobility_breakthrough");
    for (const id of ["structural", "energy", "cognitive", "biological", "exotic"]) {
      assert.equal(byId[id].ready, false, id);
      assert.equal(byId[id].breakthroughTechId, null, id);
    }
  });
});
