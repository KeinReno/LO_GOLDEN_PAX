import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TechnologyDef } from "../../../state/contentCatalog.ts";
import {
  collectOfferCandidateIds,
  isBypassFrontierTech,
  isCatalogStubTech,
  visibleGraphTechs,
} from "./visibleGraphTechs.ts";

function tech(
  id: string,
  extra?: Partial<TechnologyDef>,
): TechnologyDef {
  return { id, name: id, category: "A", era: 1, ...extra };
}

describe("visibleGraphTechs", () => {
  const catalog = [tech("done"), tech("offer"), tech("queued"), tech("hidden")];

  it("treats catalogPending and alchemyOnly as hidden stubs", () => {
    assert.equal(isCatalogStubTech(tech("live")), false);
    assert.equal(isCatalogStubTech(tech("stub", { catalogPending: true })), true);
    assert.equal(isCatalogStubTech(tech("lab", { alchemyOnly: true })), true);
  });

  it("collects candidate ids from every offer bag", () => {
    const ids = collectOfferCandidateIds({
      industry: { candidates: ["a", "b"] },
      A: { candidates: ["c"] },
    });
    assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
  });

  it("keeps unlocked, offered, and queued techs; drops the rest", () => {
    const visible = visibleGraphTechs(
      catalog,
      new Set(["done"]),
      { industry: { candidates: ["offer"] } },
      new Set(["queued"]),
    );
    assert.deepEqual(
      visible.map((t) => t.id).sort(),
      ["done", "offer", "queued"],
    );
  });

  it("shows nothing from the catalog when there is no progress and no offers", () => {
    const visible = visibleGraphTechs(catalog, new Set(), undefined, undefined);
    assert.deepEqual(visible, []);
  });

  it("bypass opt-in adds prereq-met techs outside the offer, not the locked catalog", () => {
    const tree = [
      tech("done"),
      tech("offer"),
      tech("ready"),
      tech("locked", { prerequisites: ["missing"] }),
      tech("stub", { catalogPending: true }),
    ];
    const offers = { industry: { candidates: ["offer"] } };
    const unlocked = new Set(["done"]);
    const offerIds = collectOfferCandidateIds(offers);
    assert.equal(isBypassFrontierTech(tree[2], unlocked, offerIds), true);
    assert.equal(isBypassFrontierTech(tree[3], unlocked, offerIds), false);
    assert.equal(isBypassFrontierTech(tree[4], unlocked, offerIds), false);
    const visible = visibleGraphTechs(tree, unlocked, offers, undefined, {
      includeBypass: true,
    });
    assert.deepEqual(
      visible.map((t) => t.id).sort(),
      ["done", "offer", "ready"],
    );
  });
});
