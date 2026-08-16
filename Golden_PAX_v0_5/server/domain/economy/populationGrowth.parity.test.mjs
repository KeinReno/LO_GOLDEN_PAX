/**
 * True cross-repo parity test: GMap exports naturalPopDeltaBeforeModifiers
 * directly and it's a pure function, so we can diff against it exactly
 * (unlike deficit.mjs/taxes.mjs/adjustStock.mjs below, whose GMap
 * originals are either module-private or pull in file/DB side effects —
 * see their *.test.mjs for why those are behavior tests instead).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { naturalPopDeltaBeforeModifiers as newFn } from "./populationGrowth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/economyTick.mjs");

describe("naturalPopDeltaBeforeModifiers parity with GMap", () => {
  it("matches GMap across a grid of representative inputs", async () => {
    const { naturalPopDeltaBeforeModifiers: oldFn } = await import(oldModulePath);

    const cases = [
      [0, 100, 0.012, 1, 1, 0.15],
      [50, 100, 0.012, 1, 1, 0.15],
      [100, 100, 0.012, 1, 1, 0.15],
      [150, 100, 0.012, 1, 1, 0.15],
      [1000, 100, 0.012, 1, 1, 0.15],
      [50, 100, 0.02, 0.5, 0.4, 0.15],
      [50, 100, 0.012, 1, 1, 0.3],
      [50, 10000, 0.012, 1.2, 1, 0.15],
    ];

    for (const args of cases) {
      expect(newFn(...args)).toBeCloseTo(oldFn(...args), 10);
    }
  });
});
