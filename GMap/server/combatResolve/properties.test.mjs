import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shipDef, unitDef } from "./properties.mjs";

const content = {
  ships: {
    "ship.scout": { id: "ship.scout", name: "Разведчик" },
    "ship.transport": { id: "ship.transport", name: "Транспорт" },
  },
  units: {
    "unit.breach_cadre": { id: "unit.breach_cadre", name: "Штурмовой кадр" },
  },
};

describe("shipDef / unitDef aliases", () => {
  it("matches ship catalog names case-insensitively", () => {
    assert.equal(shipDef(content, "разведчик")?.id, "ship.scout");
    assert.equal(shipDef(content, "транспорт")?.id, "ship.transport");
  });

  it("maps unit.assault to breach cadre", () => {
    assert.equal(unitDef(content, "unit.assault")?.id, "unit.breach_cadre");
  });
});
