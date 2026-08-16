import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeActionAp, mergeCancelAp } from "./orderApMerge.ts";
import {
  hopsSuffix,
  intentDefIdFromOrderType,
  unitOrderAcceptedVerb,
  unitOrderNote,
} from "./unitOrderCopy.ts";

describe("mergeActionAp", () => {
  const cur = {
    reservedAp: 2,
    apMax: 9,
    reservedForceAp: 1,
    forceApMax: 2,
  };

  it("takes explicit reserved from API", () => {
    const next = mergeActionAp(cur, { reservedAp: 5, apMax: 9 });
    assert.equal(next.reservedAp, 5);
    assert.equal(next.apMax, 9);
  });

  it("adds intent cost when reserved omitted", () => {
    const next = mergeActionAp(cur, { intent: { apCost: 3, forceApCost: 1 } });
    assert.equal(next.reservedAp, 5);
    assert.equal(next.reservedForceAp, 2);
  });

  it("uses fallback cost", () => {
    const next = mergeActionAp(cur, {}, { apCost: 2, forceCost: 0 });
    assert.equal(next.reservedAp, 4);
    assert.equal(next.reservedForceAp, 1);
  });
});

describe("mergeCancelAp", () => {
  const cur = {
    reservedAp: 2,
    apMax: 9,
    reservedForceAp: 1,
    forceApMax: 2,
  };

  it("refunds 1 when reserved omitted", () => {
    const next = mergeCancelAp(cur, {});
    assert.equal(next.reservedAp, 1);
    assert.equal(next.reservedForceAp, 0);
  });

  it("takes explicit reserved from API", () => {
    const next = mergeCancelAp(cur, { reservedAp: 0, reservedForceAp: 0 });
    assert.equal(next.reservedAp, 0);
    assert.equal(next.reservedForceAp, 0);
  });
});

describe("unitOrderCopy", () => {
  it("intent def id", () => {
    assert.equal(intentDefIdFromOrderType("move_fleet"), "intent.move_fleet");
    assert.equal(intentDefIdFromOrderType("intent.scout_reveal"), "intent.scout_reveal");
  });

  it("note for drag move with hops", () => {
    assert.match(
      unitOrderNote({
        orderType: "move_fleet",
        hops: 2,
        isMove: true,
      }),
      /Перетаскивание/,
    );
    assert.ok(hopsSuffix(2).length > 0);
    assert.equal(hopsSuffix(undefined), "");
  });

  it("accepted verbs", () => {
    assert.equal(unitOrderAcceptedVerb("attack_system", false), "Приказ на атаку принят");
    assert.equal(unitOrderAcceptedVerb("move_fleet", true), "Перемещён");
    assert.equal(unitOrderAcceptedVerb("claim_system", false), "Приказ на захват принят");
  });

  it("contact note", () => {
    assert.equal(
      unitOrderNote({
        orderType: "attack_system",
        isMove: false,
        contactMode: "card",
      }),
      "Контакт · карты",
    );
  });
});
