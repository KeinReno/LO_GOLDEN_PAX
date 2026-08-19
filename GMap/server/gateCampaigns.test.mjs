import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GATE_CAMPAIGN_ID_RE,
  normalizeGateCampaigns,
  readGateCampaigns,
} from "./gateCampaigns.mjs";

describe("gateCampaigns", () => {
  it("keeps the three hub campaigns in coverflow order", () => {
    const doc = readGateCampaigns();
    assert.deepEqual(
      doc.campaigns.map((c) => c.id),
      ["silver_hearts", "golden_pax", "final_crusade"],
    );
    assert.equal(doc.campaigns[1]?.live, true);
    assert.match(String(doc.campaigns[1]?.image), /golden-pax/);
  });

  it("fills missing fields from defaults", () => {
    const doc = normalizeGateCampaigns({ campaigns: [{ id: "golden_pax", blurb: "Новый текст" }] });
    const pax = doc.campaigns.find((c) => c.id === "golden_pax");
    assert.equal(pax?.blurb, "Новый текст");
    assert.equal(pax?.title, "Golden Pax");
    assert.equal(doc.campaigns.length, 3);
  });

  it("rejects unsafe ids", () => {
    assert.equal(GATE_CAMPAIGN_ID_RE.test("../x"), false);
    assert.equal(GATE_CAMPAIGN_ID_RE.test("golden_pax"), true);
  });
});
