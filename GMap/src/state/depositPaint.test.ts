import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  paintTagExtras,
  resourcesHas,
  sameDepositToken,
  toggleDeposit,
  uniqueDepositTokens,
} from "./depositAliases.ts";

describe("deposit aliases", () => {
  it("treats map.iron and железо as one deposit", () => {
    assert.equal(sameDepositToken("map.iron", "железо"), true);
    assert.equal(resourcesHas(["map.iron"], "железо"), true);
    assert.equal(resourcesHas(["титан"], "железо"), false);
  });

  it("hides id extras when the paint pool already has the name", () => {
    const extras = paintTagExtras(
      ["map.iron", "map.unknown_stub"],
      ["железо", "титан"],
    );
    assert.deepEqual(extras, ["map.unknown_stub"]);
  });

  it("toggle removes the id sibling instead of adding a Russian duplicate", () => {
    assert.deepEqual(toggleDeposit(["map.iron"], "железо"), []);
    assert.deepEqual(toggleDeposit([], "map.iron"), ["железо"]);
  });

  it("dedupes mixed id/name lists", () => {
    assert.deepEqual(uniqueDepositTokens(["map.iron", "железо", "титан"]), [
      "map.iron",
      "титан",
    ]);
  });
});
