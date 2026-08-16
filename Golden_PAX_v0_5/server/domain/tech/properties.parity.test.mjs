import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { factionHasProperty as newFn } from "./properties.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/techActions.mjs");

describe("factionHasProperty parity with GMap", () => {
  it("base properties are always available; others require an unlock", async () => {
    const { factionHasProperty: oldFn } = await import(oldModulePath);

    for (const prop of ["strong", "weapon", "psion_suppress", "matter_destroy"]) {
      const account = { unlockedProperties: ["matter_destroy"] };
      expect(newFn(account, prop)).toBe(oldFn(account, prop));
    }
    expect(newFn({ unlockedProperties: [] }, "strong")).toBe(oldFn({ unlockedProperties: [] }, "strong"));
  });
});
