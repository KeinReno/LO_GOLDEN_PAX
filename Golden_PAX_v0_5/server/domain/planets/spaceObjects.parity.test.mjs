/**
 * Parity test: applySpaceObjectEffects is exported+pure in GMap
 * (server/flowEngine.mjs). Diff outputs directly.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { applySpaceObjectEffects } from "./spaceObjects.mjs";
import { emptyFlows } from "../economy/flowEngine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/flowEngine.mjs");

const sampleDef = {
  effects: [
    { effect: "capacity_add", args: { category: "A", tier: 2, amount: 1 } },
    { effect: "rate_mod", args: { category: "A", tier: 3, amount: 2 } },
    { effect: "demand_mod", args: { category: "B", tier: 1, amount: 1 } },
    { effect: "unlock_property", args: { property: "psion_store", chance: 1 } },
  ],
};

describe("applySpaceObjectEffects parity with GMap", () => {
  it("matches GMap on capacity_add / rate_mod / demand_mod (and ignores unlock_property)", async () => {
    const old = await import(oldModulePath);
    const mine = emptyFlows();
    const theirs = old.emptyFlows();
    applySpaceObjectEffects(mine, sampleDef, { rateScale: 0.5 });
    old.applySpaceObjectEffects(theirs, sampleDef, { rateScale: 0.5 });
    expect(mine).toEqual(theirs);
  });
});
