import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveTechDef as newFn } from "./resolveTechDef.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/techActions.mjs");

describe("resolveTechDef parity with GMap", () => {
  it("resolves the same def for live techs, combos, and unknown ids", async () => {
    const { resolveTechDef: oldFn } = await import(oldModulePath);
    const content = {
      technologies: { "tech.a": { id: "tech.a", name: "A" } },
      tech_combos: { "tech.combo_x": { id: "tech.combo_x", name: "X" } },
    };

    expect(newFn(content, "tech.a")).toEqual(oldFn(content, "tech.a"));
    expect(newFn(content, "tech.combo_x")).toEqual(oldFn(content, "tech.combo_x"));
    expect(newFn(content, "tech.missing")).toEqual(oldFn(content, "tech.missing"));
    expect(newFn(content, null)).toEqual(oldFn(content, null));
  });
});
