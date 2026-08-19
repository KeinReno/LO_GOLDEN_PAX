import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canOutfitUnit } from "./outfitRules.ts";

describe("canOutfitUnit", () => {
  it("allows infantry when the def has slots", () => {
    assert.equal(
      canOutfitUnit(
        {
          id: "u.inf",
          name: "Пехота",
          roles: ["infantry"],
          slots: [{ role: "kit" }],
        },
        "legion",
      ),
      true,
    );
  });

  it("blocks only when there are no slots", () => {
    assert.equal(
      canOutfitUnit({ id: "u.inf", name: "Пехота", slots: [] }, "legion"),
      false,
    );
    assert.equal(canOutfitUnit(null, "fleet"), false);
  });
});
