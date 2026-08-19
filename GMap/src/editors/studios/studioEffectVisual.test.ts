import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VISUAL_EFFECT_IDS } from "./studioEffectIds.ts";

describe("studio visual effects", () => {
  it("covers stat_mult so GM never types raw args", () => {
    assert.ok(VISUAL_EFFECT_IDS.includes("stat_mult"));
    assert.ok(VISUAL_EFFECT_IDS.includes("cost_mult"));
  });
});
