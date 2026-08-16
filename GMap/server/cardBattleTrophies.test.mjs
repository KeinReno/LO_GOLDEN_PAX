/**
 * Card-battle salvage trophy: one module into an empty slot.
 * Run: node --test server/cardBattleTrophies.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getContent } from "./contentLoader.mjs";
import {
  buildSalvageOffer,
  claimCardBattleSalvage,
  autoClaimSalvageIfAi,
} from "./cardBattle.mjs";

function worldPair(winnerFill = {}, loserFill = { weapon: "module.space.kinetic_cannon" }) {
  return {
    meta: { turn: 1 },
    fleets: [
      {
        id: "fa",
        factionId: "win",
        composition: [
          {
            id: "ga",
            defId: "ship.scout",
            count: 1,
            filledSlots: { ...winnerFill },
          },
        ],
      },
      {
        id: "fb",
        factionId: "lose",
        composition: [
          {
            id: "gb",
            defId: "ship.scout",
            count: 1,
            filledSlots: { ...loserFill },
          },
        ],
      },
    ],
    systems: [{ id: "s1", planets: [] }],
  };
}

function eng() {
  return {
    id: "e1",
    systemId: "s1",
    sides: [
      { factionId: "win", fleetIds: ["fa"], legionIds: [] },
      { factionId: "lose", fleetIds: ["fb"], legionIds: [] },
    ],
  };
}

describe("buildSalvageOffer", () => {
  const content = getContent();

  it("offers wreck weapon that fits an empty winner slot", () => {
    const offer = buildSalvageOffer(
      worldPair(),
      eng(),
      "win",
      "lose",
      content,
    );
    assert.equal(offer.status, "pending");
    const wreck = offer.options.find(
      (o) => o.resourceId === "module.space.kinetic_cannon" && o.role === "weapon",
    );
    assert.ok(wreck, `options=${JSON.stringify(offer.options)}`);
    assert.equal(wreck.source, "wreck");
    assert.ok(wreck.fits.some((f) => f.parentId === "fa"));
  });

  it("status none when winner slots are already full on salvage roles", () => {
    const filled = {
      weapon: "map.iron",
      hull: "map.iron",
      shield: "map.blumatid",
    };
    const offer = buildSalvageOffer(
      worldPair(filled, { weapon: "module.space.kinetic_cannon" }),
      eng(),
      "win",
      "lose",
      content,
    );
    assert.equal(offer.status, "none");
    assert.equal(offer.options.length, 0);
  });

  it("falls back to catalog scrap when loser has no fills", () => {
    const offer = buildSalvageOffer(
      worldPair({}, {}),
      eng(),
      "win",
      "lose",
      content,
    );
    assert.equal(offer.status, "pending");
    assert.ok(offer.options.length >= 1);
    assert.ok(offer.options.every((o) => o.source === "scrap"));
  });
});

describe("claimCardBattleSalvage", () => {
  const content = getContent();

  it("installs the wreck module into the empty slot", () => {
    const world = worldPair();
    const engagement = eng();
    const offer = buildSalvageOffer(world, engagement, "win", "lose", content);
    const opt = offer.options.find((o) => o.resourceId === "module.space.kinetic_cannon");
    engagement.result = {
      trophies: {
        winnerFactionId: "win",
        metal: 0,
        metalPending: 4,
        salvage: offer,
      },
    };
    const r = claimCardBattleSalvage(
      world,
      engagement,
      "win",
      { optionId: opt.id },
      content,
    );
    assert.equal(r.ok, true, r.error);
    assert.equal(world.fleets[0].composition[0].filledSlots.weapon, "module.space.kinetic_cannon");
    assert.equal(engagement.result.trophies.salvage.status, "claimed");
    assert.equal(engagement.result.trophies.metal, 0);
  });

  it("rejects a second claim", () => {
    const world = worldPair();
    const engagement = eng();
    const offer = buildSalvageOffer(world, engagement, "win", "lose", content);
    engagement.result = {
      trophies: {
        winnerFactionId: "win",
        metal: 0,
        salvage: offer,
      },
    };
    const opt = offer.options[0];
    const first = claimCardBattleSalvage(
      world,
      engagement,
      "win",
      { optionId: opt.id },
      content,
    );
    assert.equal(first.ok, true);
    const second = claimCardBattleSalvage(
      world,
      engagement,
      "win",
      { optionId: opt.id },
      content,
    );
    assert.equal(second.ok, false);
  });
});

describe("autoClaimSalvageIfAi", () => {
  const content = getContent();

  it("NPC winner auto-installs the first wreck", () => {
    const world = worldPair();
    world.factions = [
      { id: "win", aiControlled: true },
      { id: "lose", password: "x" },
    ];
    const engagement = eng();
    const offer = buildSalvageOffer(world, engagement, "win", "lose", content);
    engagement.result = {
      trophies: {
        winnerFactionId: "win",
        metal: 0,
        salvage: offer,
      },
    };
    const r = autoClaimSalvageIfAi(world, engagement, content);
    assert.equal(r.ok, true);
    assert.equal(engagement.result.trophies.salvage.status, "claimed");
    assert.equal(world.fleets[0].composition[0].filledSlots.weapon, "module.space.kinetic_cannon");
  });

  it("human winner leaves the offer pending", () => {
    const world = worldPair();
    world.factions = [
      { id: "win", password: "secret" },
      { id: "lose", aiControlled: true },
    ];
    const engagement = eng();
    const offer = buildSalvageOffer(world, engagement, "win", "lose", content);
    engagement.result = {
      trophies: {
        winnerFactionId: "win",
        metal: 0,
        salvage: offer,
      },
    };
    const r = autoClaimSalvageIfAi(world, engagement, content);
    assert.equal(r.skipped, true);
    assert.equal(engagement.result.trophies.salvage.status, "pending");
    assert.equal(world.fleets[0].composition[0].filledSlots.weapon, undefined);
  });
});
