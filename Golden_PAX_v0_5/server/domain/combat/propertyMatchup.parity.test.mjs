import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { propertyCombatMult as newFn } from "./propertyMatchup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/combatResolve.mjs");

const content = {
  combat_property_matchups: { enabled: true },
  map_resources: {
    "res.amp_cannon": { id: "res.amp_cannon", tier: 3, properties: ["weapon_amp"] },
    "res.destroyer_beam": { id: "res.destroyer_beam", tier: 2, properties: ["matter_destroy"] },
    "res.deflector": { id: "res.deflector", tier: 1, properties: ["shield"] },
    "res.plate": { id: "res.plate", tier: 1, properties: ["armor"] },
  },
};

function group(filledSlots) {
  return { filledSlots, compSlots: [] };
}

describe("propertyCombatMult parity with GMap", () => {
  it("matches across weapon/shield/hull combinations", async () => {
    const { propertyCombatMult: oldFn } = await import(oldModulePath);

    const cases = [
      [group({}), group({})],
      [group({ weapon: "res.amp_cannon" }), group({})],
      [group({ weapon: "res.destroyer_beam" }), group({ shield: "res.deflector" })],
      [group({ weapon: "res.amp_cannon" }), group({ shield: "res.deflector" })],
      [group({ weapon: "res.amp_cannon" }), group({ hull: "res.plate" })],
    ];

    for (const [attacker, defender] of cases) {
      expect(newFn(attacker, defender, content)).toBeCloseTo(oldFn(attacker, defender, content), 10);
    }
  });
});
