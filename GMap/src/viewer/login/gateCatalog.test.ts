import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  campaignsForMode,
  coverflowNeighbors,
  coverflowStep,
  defaultCampaignId,
  digitsKey,
  FALLBACK_GATE_CAMPAIGNS,
} from "./gateCatalog.ts";

describe("gateCatalog", () => {
  it("shares the three hub campaigns across every mode", () => {
    const list = campaignsForMode("rpg");
    assert.deepEqual(
      list.map((c) => c.id),
      ["silver_hearts", "golden_pax", "final_crusade"],
    );
    assert.equal(defaultCampaignId(list), "golden_pax");
    assert.equal(campaignsForMode("saga")[1]?.live, true);
  });

  it("coverflow wraps Silver Hearts and Final Crusade around Golden Pax", () => {
    const { prev, center, next } = coverflowNeighbors(
      FALLBACK_GATE_CAMPAIGNS,
      "golden_pax",
    );
    assert.equal(prev?.id, "silver_hearts");
    assert.equal(center?.id, "golden_pax");
    assert.equal(next?.id, "final_crusade");
  });

  it("steps the coverflow in wrap direction", () => {
    const list = FALLBACK_GATE_CAMPAIGNS;
    assert.equal(coverflowStep(list, "golden_pax", "final_crusade"), 1);
    assert.equal(coverflowStep(list, "golden_pax", "silver_hearts"), -1);
    assert.equal(coverflowStep(list, "final_crusade", "silver_hearts"), 1);
  });

  it("keeps only digits for the access key", () => {
    assert.equal(digitsKey("48a48"), "4848");
    assert.equal(digitsKey("123456789"), "12345678");
  });
});
