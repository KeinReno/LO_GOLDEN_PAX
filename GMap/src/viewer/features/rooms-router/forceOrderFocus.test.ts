import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planForceUnitOrder, produceDeckNote } from "./forceOrderFocus.ts";

describe("planForceUnitOrder", () => {
  it("opens queue when unit missing", () => {
    assert.deepEqual(planForceUnitOrder({ kind: "fleet", unit: undefined }), {
      kind: "queue",
    });
  });

  it("plans fleet ring", () => {
    assert.deepEqual(
      planForceUnitOrder({
        kind: "fleet",
        unit: { id: "fl1", systemId: "s1" },
      }),
      {
        kind: "map-ring",
        orderType: "move_fleet",
        systemId: "s1",
        fleetId: "fl1",
        legionId: null,
      },
    );
  });

  it("plans legion ring", () => {
    assert.deepEqual(
      planForceUnitOrder({
        kind: "legion",
        unit: { id: "lg1", systemId: "s2" },
      }),
      {
        kind: "map-ring",
        orderType: "move_legion",
        systemId: "s2",
        fleetId: null,
        legionId: "lg1",
      },
    );
  });
});

describe("produceDeckNote", () => {
  it("ship vs unit copy", () => {
    assert.match(produceDeckNote("ships"), /Верфь/);
    assert.match(produceDeckNote("units"), /Казармы/);
  });
});
