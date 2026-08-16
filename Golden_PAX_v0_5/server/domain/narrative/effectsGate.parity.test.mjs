import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { isIntentForbiddenByEffects as newFn } from "./effectsGate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/narrative.mjs");

describe("isIntentForbiddenByEffects parity with GMap", () => {
  it("matches across forbidding/non-forbidding effect stacks", async () => {
    const { isIntentForbiddenByEffects: oldFn } = await import(oldModulePath);

    const forbidding = [{ effect: "forbid_intent", args: { intentId: "intent.build" } }];
    expect(newFn(forbidding, "intent.build")).toBe(oldFn(forbidding, "intent.build"));
    expect(newFn(forbidding, "intent.research")).toBe(oldFn(forbidding, "intent.research"));
    expect(newFn([], "intent.build")).toBe(oldFn([], "intent.build"));
    expect(newFn(undefined, "intent.build")).toBe(oldFn(undefined, "intent.build"));
  });
});
