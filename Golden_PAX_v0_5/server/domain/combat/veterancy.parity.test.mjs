import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { veterancyConfig as newConfig, levelFromXp as newLevel } from "./veterancy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/combatResolve.mjs");

describe("veterancyConfig / levelFromXp parity with GMap", () => {
  it("matches default config and level thresholds", async () => {
    const { veterancyConfig: oldConfig, levelFromXp: oldLevel } = await import(oldModulePath);

    expect(newConfig({})).toEqual(oldConfig({}));

    const custom = { rules: { veterancy: { thresholds: [0, 50, 200], bonuses: [{}, {}, {}] } } };
    expect(newConfig(custom)).toEqual(oldConfig(custom));

    for (const xp of [0, 49, 50, 199, 200, 5000]) {
      expect(newLevel(xp, custom.rules.veterancy.thresholds)).toBe(oldLevel(xp, custom.rules.veterancy.thresholds));
    }
  });
});
