import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canOpenStanceRing,
  contactStrikeFromPreview,
  myEngagementSide,
} from "./contactStrike.ts";

describe("contactStrikeFromPreview", () => {
  const preview = {
    drop: {
      kind: "fleet",
      unitId: "f1",
      fromSystemId: "s1",
      toSystemId: "s1",
      hops: 0,
      intent: "attack",
      targetUnitKind: "fleet",
      targetUnitId: "f2",
      targetFactionId: "enemy",
    },
  } as any;

  it("builds auto contact strike", () => {
    const s = contactStrikeFromPreview(preview, "auto");
    assert.ok(s);
    assert.equal(s!.kind, "fleet");
    assert.equal(s!.unitId, "f1");
    assert.equal(s!.contact.contactMode, "auto");
    assert.equal(s!.contact.targetUnitId, "f2");
  });

  it("builds card contact strike", () => {
    const s = contactStrikeFromPreview(preview, "card");
    assert.equal(s!.contact.contactMode, "card");
  });

  it("returns null without target unit", () => {
    const s = contactStrikeFromPreview(
      { drop: { kind: "fleet", unitId: "f1", toSystemId: "s1", hops: 0 } } as any,
      "auto",
    );
    assert.equal(s, null);
  });
});

describe("canOpenStanceRing", () => {
  it("rejects missing eng or locked side", () => {
    assert.equal(canOpenStanceRing(undefined, "me"), false);
    assert.equal(
      canOpenStanceRing(
        { sides: [{ factionId: "me", locked: true }] },
        "me",
      ),
      false,
    );
  });

  it("allows unlocked own side", () => {
    assert.equal(
      canOpenStanceRing(
        { sides: [{ factionId: "me", locked: false }] },
        "me",
      ),
      true,
    );
  });
});

describe("myEngagementSide", () => {
  it("finds own side", () => {
    const side = myEngagementSide(
      {
        sides: [
          { factionId: "them", stance: "assault" },
          { factionId: "me", stance: "hold" },
        ],
      },
      "me",
    );
    assert.equal(side?.stance, "hold");
  });
});
