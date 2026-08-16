/**
 * researchPathTo is a true cross-repo parity target when called with no
 * `opts` (its 4th arg): GMap's version only touches readLiveBoard/
 * readLedger inside the `opts.eco || opts.factionId` branch, which is
 * skipped entirely when opts is omitted — so the 3-arg call is pure, same
 * as this port. firstMissingPrerequisite has no GMap equivalent to diff
 * against (that repeated inline loop was never its own function there),
 * so it's behavior-tested instead.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { firstMissingPrerequisite, researchPathTo as newResearchPathTo } from "./prerequisites.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/techActions.mjs");

const content = {
  technologies: {
    "tech.a": { id: "tech.a", name: "A", cost: { "currency.cognitio": 10 }, category: "A", era: 1, prerequisites: [] },
    "tech.b": { id: "tech.b", name: "B", cost: { "currency.cognitio": 20 }, category: "A", era: 2, prerequisites: ["tech.a"] },
    "tech.c": { id: "tech.c", name: "C", cost: { "currency.cognitio": 30 }, category: "A", era: 3, prerequisites: ["tech.b"] },
  },
};

describe("firstMissingPrerequisite", () => {
  it("returns the first unmet prerequisite", () => {
    expect(firstMissingPrerequisite(content.technologies["tech.c"], [])).toBe("tech.b");
    expect(firstMissingPrerequisite(content.technologies["tech.c"], ["tech.b"])).toBeNull();
  });
});

describe("researchPathTo parity with GMap (called without opts, so both are pure)", () => {
  it("matches GMap's prerequisite walk + cognitio sum", async () => {
    const { researchPathTo: oldResearchPathTo } = await import(oldModulePath);

    for (const [unlocked, target] of [
      [[], "tech.c"],
      [["tech.a"], "tech.c"],
      [["tech.a", "tech.b"], "tech.c"],
      [[], "tech.a"],
      [[], "tech.unknown"],
    ]) {
      expect(newResearchPathTo(target, unlocked, content)).toEqual(oldResearchPathTo(target, unlocked, content));
    }
  });
});
