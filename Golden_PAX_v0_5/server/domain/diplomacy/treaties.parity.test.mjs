/**
 * True cross-repo parity for collectTreatyEffects's "explicit t.effects
 * array" path (exported and pure in GMap for that path — the catalog-
 * lookup fallback path calls GMap's real getContent(), so that path is
 * behavior-tested in treaties.test.mjs instead against a synthetic
 * catalog, since this port takes the catalog as an explicit argument
 * rather than reading it from a global — see this file's and
 * treaties.mjs's headers).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { collectTreatyEffects as newFn } from "./treaties.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/opinionTick.mjs");

describe("collectTreatyEffects parity with GMap (explicit-effects path)", () => {
  it("matches for treaties carrying their own effects array", async () => {
    const { collectTreatyEffects: oldFn } = await import(oldModulePath);

    const faction = {
      id: "fA",
      diplomacy: {
        treaties: [
          { id: "t1", type: "trade", withFactionId: "fB", effects: [{ effect: "production_mult", args: { mult: 1.1 } }] },
          { id: "t2", type: "war", withFactionId: "fC", effects: [{ effect: "treaty_effect", args: { effect: "combat_mult", args: { mult: 1.05 } } }] },
          { id: "t3", type: "nap", withFactionId: "fD", effects: [] },
        ],
      },
    };

    expect(newFn(faction, {})).toEqual(oldFn(faction));
  });

  it("an account with no treaties yields no effects", async () => {
    const { collectTreatyEffects: oldFn } = await import(oldModulePath);
    const faction = { id: "fA", diplomacy: { treaties: [] } };
    expect(newFn(faction, {})).toEqual(oldFn(faction));
  });
});
