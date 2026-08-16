import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { normalizeQuest as newFn } from "./quest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/questEngine.mjs");

describe("normalizeQuest parity with GMap", () => {
  it("fills in the same defaults for a sparse quest", async () => {
    const { normalizeQuest: oldFn } = await import(oldModulePath);
    // Explicit id sidesteps the Math.random() fallback so both sides are deterministic.
    const raw = { id: "q_fixed", catalogId: "quest.rescue" };
    expect(newFn(raw)).toEqual(oldFn(raw));
  });

  it("preserves provided fields instead of overriding them", async () => {
    const { normalizeQuest: oldFn } = await import(oldModulePath);
    const raw = { id: "q_2", name: "Спасти учёных", status: "resolved", type: "story", history: [{ kind: "message", body: "x" }] };
    expect(newFn(raw)).toEqual(oldFn(raw));
  });

  it("returns null for non-object input, same as GMap", async () => {
    const { normalizeQuest: oldFn } = await import(oldModulePath);
    expect(newFn(null)).toBe(oldFn(null));
    expect(newFn(undefined)).toBe(oldFn(undefined));
  });
});
