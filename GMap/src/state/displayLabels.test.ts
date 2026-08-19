import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combatStatLabel,
  courtRoleLabel,
  pathLabel,
  raceTagLabel,
  yearlyCategoryLabel,
} from "./gmUiLabels.ts";

describe("GM workshop display labels", () => {
  it("translates race tags to Russian", () => {
    assert.equal(raceTagLabel("synthetic"), "Синтеты");
    assert.equal(raceTagLabel("baseline"), "Базовая");
  });

  it("translates combat stats used by stat_mult", () => {
    assert.equal(combatStatLabel("defense"), "Броня");
    assert.equal(combatStatLabel("damage"), "Урон");
  });

  it("translates yearly quest categories and court roles", () => {
    assert.equal(yearlyCategoryLabel("pirates"), "Пираты");
    assert.equal(courtRoleLabel("strategist"), "Стратег");
    assert.equal(pathLabel("offensive"), "Путь удара");
  });
});
