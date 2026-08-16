/**
 * Formation auras + property strike channels.
 * Run: node --test server/cardBattleAuras.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getContent } from "./contentLoader.mjs";
import { propertyCombatBreakdown } from "./combatResolve.mjs";
import {
  applyEscortNeighborBlock,
  cardBattleRules,
  estimateStrikeDamage,
  formationAuraMods,
} from "./cardBattle.mjs";

function card(partial) {
  return {
    cardId: partial.cardId,
    defId: partial.defId || "u",
    role: partial.role || "line",
    count: partial.count ?? 1,
    hp: 40,
    maxHp: 40,
    damage: 20,
    defense: 10,
    shields: 0,
    accuracy: 60,
    targeting: "line_first",
    filledSlots: partial.filledSlots || {},
    ...partial,
  };
}

describe("formationAuraMods", () => {
  const rules = { formationAuras: { escortIncomingMult: 0.85, supportOutgoingMult: 1.15 } };

  it("escort neighbor cuts incoming on the covered card", () => {
    const escort = card({ cardId: "e", role: "screen" });
    const line = card({ cardId: "l", role: "line" });
    const front = [escort, line];
    const covered = formationAuraMods(line, front, rules);
    const isolated = formationAuraMods(escort, front, rules);
    assert.equal(covered.incomingMult, 0.85);
    assert.deepEqual(covered.tags, ["escort"]);
    assert.equal(isolated.incomingMult, 1);
  });

  it("support neighbor raises outgoing on the wing card", () => {
    const wing = card({ cardId: "c", role: "carrier" });
    const gun = card({ cardId: "g", role: "line" });
    const front = [wing, gun];
    const buffed = formationAuraMods(gun, front, rules);
    assert.equal(buffed.outgoingMult, 1.15);
    assert.deepEqual(buffed.tags, ["support"]);
  });

  it("dead neighbor does not project an aura", () => {
    const escort = card({ cardId: "e", role: "screen", count: 0 });
    const line = card({ cardId: "l", role: "line" });
    const mods = formationAuraMods(line, [escort, line], rules);
    assert.equal(mods.incomingMult, 1);
    assert.equal(mods.tags.length, 0);
  });
});

describe("applyEscortNeighborBlock", () => {
  it("grants Block only when escort has a living neighbor", () => {
    const rules = cardBattleRules();
    const clustered = {
      frontLines: {
        a: [
          card({ cardId: "e", role: "screen" }),
          card({ cardId: "l", role: "line" }),
        ],
      },
      block: { a: 0 },
    };
    applyEscortNeighborBlock(clustered, rules);
    assert.equal(clustered.block.a, rules.formationAuras.escortNeighborBlock);

    const lone = {
      frontLines: { a: [card({ cardId: "e", role: "screen" })] },
      block: { a: 0 },
    };
    applyEscortNeighborBlock(lone, rules);
    assert.equal(lone.block.a, 0);
  });
});

describe("propertyCombatBreakdown", () => {
  const content = getContent();

  it("no-ops without slot fills", () => {
    const r = propertyCombatBreakdown({ filledSlots: {} }, { filledSlots: {} }, content);
    assert.equal(r.mult, 1);
    assert.equal(r.tags.length, 0);
  });

  it("matter_destroy vs shield is pierce, not absorb", () => {
    const atk = { filledSlots: { weapon: "map.blakula" } };
    const def = { filledSlots: { shield: "map.blumatid" } };
    const r = propertyCombatBreakdown(atk, def, content);
    assert.ok(r.tags.includes("hull_break"));
    assert.ok(r.tags.includes("shield_pierce"));
    assert.ok(!r.tags.includes("shield_absorb"));
    assert.ok(r.mult > 1.5);
  });

  it("plain weapon vs shield absorbs", () => {
    const atk = { filledSlots: { weapon: "map.iron" } };
    const def = { filledSlots: { shield: "map.blumatid" } };
    const r = propertyCombatBreakdown(atk, def, content);
    assert.ok(r.tags.includes("shield_absorb") || r.mult <= 1);
  });

  it("high-tier weapon pierces low-tier hull", () => {
    const atk = { filledSlots: { weapon: "map.blakula" } };
    const def = { filledSlots: { hull: "map.iron" } };
    const r = propertyCombatBreakdown(atk, def, content);
    assert.ok(r.tags.includes("hull_pierce"));
    assert.ok(r.mult > 1);
  });
});

describe("estimateStrikeDamage uses property fills", () => {
  const content = getContent();
  const base = {
    role: "line",
    count: 1,
    hp: 40,
    maxHp: 40,
    damage: 20,
    defense: 0,
    shields: 0,
    accuracy: 60,
  };

  it("filled crush weapon hits harder than empty slots", () => {
    const bare = { ...base, filledSlots: {} };
    const armed = { ...base, filledSlots: { weapon: "map.blakula" } };
    const target = { ...base, role: "line", filledSlots: { hull: "map.iron" } };
    const dBare = estimateStrikeDamage(bare, target, content);
    const dArmed = estimateStrikeDamage(armed, target, content);
    assert.ok(dArmed > dBare, `armed ${dArmed} vs bare ${dBare}`);
  });

  it("escort aura reduces incoming vs same pair", () => {
    const atk = { ...base, cardId: "atk", filledSlots: {} };
    const def = { ...base, cardId: "def", filledSlots: {} };
    const raw = estimateStrikeDamage(atk, def, content, { incomingMult: 1 });
    const covered = estimateStrikeDamage(atk, def, content, {
      incomingMult: 0.85,
    });
    assert.ok(covered < raw, `covered ${covered} vs raw ${raw}`);
  });
});
