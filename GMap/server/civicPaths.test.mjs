/**
 * Civic law modifiers from content, not hardcoded ids.
 * Run: node --test server/civicPaths.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectLawModifierEffects,
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
