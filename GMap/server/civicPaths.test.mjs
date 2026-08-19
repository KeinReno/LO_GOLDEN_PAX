/**
 * Civic law modifiers from content, not hardcoded ids.
 * Run: node --test server/civicPaths.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  civicStatusPayload,
  collectLawModifierEffects,
  isPlayableCivicUnlock,
  listLawUnlocks,
} from "./civicPaths.mjs";
import { getContent } from "./contentLoader.mjs";

describe("collectLawModifierEffects", () => {
  it("emits production_mult / loyalty_add from civic_paths law effects", () => {
    const content = getContent();
    const laws = listLawUnlocks(content);
    assert.ok(laws.some((l) => l.effects?.length));
    const none = collectLawModifierEffects({ laws: [] }, content);
    assert.equal(none.length, 0);
    const open = collectLawModifierEffects({ laws: ["law.open_markets"] }, content);
    assert.ok(
      open.some(
        (e) => e.effect === "production_mult" && e.source?.id === "law.open_markets",
      ),
    );
    const faith = collectLawModifierEffects({ laws: ["law.state_religion"] }, content);
    assert.ok(
      faith.some(
        (e) => e.effect === "loyalty_add" && e.source?.id === "law.state_religion",
      ),
    );
  });
});

describe("isPlayableCivicUnlock / civicStatusPayload", () => {
  it("laws with effects stay playable; empty laws and missing buildings do not", () => {
    const c = getContent();
    assert.equal(
      isPlayableCivicUnlock(
        { id: "law.open_markets", kind: "law", effects: [{ effect: "production_mult" }] },
        c,
      ),
      true,
    );
    assert.equal(
      isPlayableCivicUnlock({ id: "law.empty", kind: "law", effects: [] }, c),
      false,
    );
    assert.equal(
      isPlayableCivicUnlock(
        { id: "bld.does_not_exist", kind: "building", name: "Ghost" },
        c,
      ),
      false,
    );
  });

  it("payload omits a building unlock that is not in the catalog", () => {
    const stub = {
      civic_paths: {
        paths: {
          trade: {
            id: "trade",
            name: "Trade",
            unlocks: [
              {
                id: "law.open_markets",
                kind: "law",
                name: "Markets",
                effects: [{ effect: "production_mult" }],
              },
              { id: "bld.ghost", kind: "building", name: "Ghost" },
            ],
          },
        },
        thresholds: {
          trade: { "law.open_markets": 10, "bld.ghost": 10 },
        },
      },
      buildings: {},
    };
    const trade = civicStatusPayload(
      { civicScores: { trade: 99, culture: 0 } },
      stub,
    ).find((r) => r.id === "trade");
    assert.ok(trade);
    assert.equal(
      trade.unlocks.some((u) => u.id === "bld.ghost"),
      false,
    );
    assert.equal(
      trade.unlocks.some((u) => u.id === "law.open_markets"),
      true,
    );
  });
});
