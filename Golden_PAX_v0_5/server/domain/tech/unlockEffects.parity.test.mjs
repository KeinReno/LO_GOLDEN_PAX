/**
 * True cross-repo parity for the unlock_tech_tier / unlock_property
 * effects — the pure subset of GMap's applyUnlockEffects (server/
 * techActions.mjs). open_path effects are deliberately excluded from
 * every case here since that branch calls into techPaths.mjs, which
 * isn't ported (see unlockEffects.mjs's header for why).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { applyUnlockEffects as newFn } from "./unlockEffects.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/techActions.mjs");

describe("applyUnlockEffects parity with GMap (tier/property effects only)", () => {
  it("matches GMap's tier-raising and property-unlocking behavior", async () => {
    const { applyUnlockEffects: oldFn } = await import(oldModulePath);

    const cases = [
      [{ techTiers: { A: 1 }, unlockedProperties: [] }, [{ effect: "unlock_tech_tier", args: { category: "A", to: 3 } }]],
      // Lower tier must not downgrade an already-higher one.
      [{ techTiers: { A: 5 }, unlockedProperties: [] }, [{ effect: "unlock_tech_tier", args: { category: "A", to: 2 } }]],
      [{ techTiers: {}, unlockedProperties: ["toxic"] }, [{ effect: "unlock_property", args: { property: "weapon" } }]],
      // Duplicate property must not be added twice.
      [{ techTiers: {}, unlockedProperties: ["weapon"] }, [{ effect: "unlock_property", args: { property: "weapon" } }]],
      [{ techTiers: { A: 1 }, unlockedProperties: [] }, []],
    ];

    for (const [account, effects] of cases) {
      const oldEco = { ...account, openPaths: [] };
      oldFn(oldEco, effects);

      const result = newFn(account, effects);
      expect(result.techTiers).toEqual(oldEco.techTiers);
      expect(result.unlockedProperties).toEqual(oldEco.unlockedProperties);
    }
  });
});
