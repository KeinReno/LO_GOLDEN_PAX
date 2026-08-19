import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBreakthroughTechId } from "./techPathLive.ts";

describe("liveBreakthroughTechId", () => {
  it("returns null when the id is missing, pending, or unknown", () => {
    const techs = {
      "tech.live": { name: "Live" },
      "tech.stub": { name: "Stub", catalogPending: true },
    };
    assert.equal(liveBreakthroughTechId({ breakthroughTechId: null }, techs), null);
    assert.equal(liveBreakthroughTechId({ breakthroughTechId: "tech.ghost" }, techs), null);
    assert.equal(liveBreakthroughTechId({ breakthroughTechId: "tech.stub" }, techs), null);
    assert.equal(liveBreakthroughTechId({ breakthroughTechId: "tech.live" }, techs), "tech.live");
  });
});
