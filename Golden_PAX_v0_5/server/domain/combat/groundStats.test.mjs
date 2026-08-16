import { describe, it, expect } from "vitest";
import { rolePower } from "./roleMatchups.mjs";
import { adaptGroupsForRolePower } from "./groundStats.mjs";

describe("adaptGroupsForRolePower", () => {
  it("maps militia defense/speed onto fields rolePower reads", () => {
    const raw = [{ roles: ["infantry"], damage: 8, defense: 8, hp: 70, speed: 4, count: 1, maxHp: 70 }];
    const adapted = adaptGroupsForRolePower(raw);
    expect(adapted[0].shields).toBe(8);
    expect(adapted[0].accuracy).toBe(80);
    expect(rolePower(adapted).infantry).toBeGreaterThan(rolePower(raw).infantry);
  });

  it("does not overwrite ship accuracy/shields", () => {
    const ships = [{ roles: ["screen"], damage: 4, armor: 4, shields: 2, hp: 22, accuracy: 65, count: 1, maxHp: 22 }];
    const adapted = adaptGroupsForRolePower(ships);
    expect(adapted[0].accuracy).toBe(65);
    expect(adapted[0].shields).toBe(2);
  });
});
