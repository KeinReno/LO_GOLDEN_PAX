import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIPLO_CARD_PREFIX,
  DIPLO_ZONE_ACCEPTS,
  addDealItem,
  cardAllowedOnSide,
  diploCardId,
  parseDiploCard,
  parsedToDealItem,
  remainingStock,
  resourceCommittedInOffers,
  treatyConflict,
  dealNeedsHold,
  dealFairness,
} from "./diploDealCards.ts";

describe("diplo deal cards", () => {
  it("round-trips card ids", () => {
    const parsed = parseDiploCard(
      diploCardId({ kind: "resource", currencyId: "currency.metal" }),
    );
    assert.deepEqual(parsed, { kind: "resource", currencyId: "currency.metal" });
    const item = parsedToDealItem(parsed!, 40);
    assert.equal(item.kind, "resource");
    if (item.kind === "resource") assert.equal(item.amount, 40);
  });

  it("prefixes diplo zone accepts", () => {
    const token = DIPLO_ZONE_ACCEPTS[0];
    assert.equal(token, DIPLO_CARD_PREFIX);
    assert.ok("diplo:fleet:abc".startsWith(token));
    assert.equal("court:npc-1".startsWith(token), false);
  });

  it("give vs want asset ownership", () => {
    const my = {
      fleets: [{ id: "f1", name: "A" }],
      legions: [],
      systems: [{ id: "s1", name: "Sol" }],
      techs: [{ id: "tech.x", name: "X" }],
    };
    const their = {
      fleets: [{ id: "f2", name: "B" }],
      legions: [],
      systems: [{ id: "s2", name: "Tau" }],
      techs: [],
    };
    assert.equal(
      cardAllowedOnSide({ kind: "fleet", fleetId: "f1" }, "give", my, their),
      true,
    );
    assert.equal(
      cardAllowedOnSide({ kind: "fleet", fleetId: "f1" }, "want", my, their),
      false,
    );
    assert.equal(
      cardAllowedOnSide({ kind: "fleet", fleetId: "f2" }, "want", my, their),
      true,
    );
    assert.equal(
      cardAllowedOnSide({ kind: "tech", techId: "tech.x" }, "want", my, their),
      false,
    );
  });

  it("merges stacked resources and skips duplicate fleets", () => {
    const first = addDealItem([], {
      kind: "resource",
      currencyId: "currency.metal",
      amount: 40,
    });
    const merged = addDealItem(first.next, {
      kind: "resource",
      currencyId: "currency.metal",
      amount: 10,
    });
    assert.equal(merged.next.length, 1);
    const row = merged.next[0];
    assert.equal(row.kind, "resource");
    if (row.kind === "resource") assert.equal(row.amount, 50);

    const once = addDealItem([], { kind: "fleet", fleetId: "fl1" });
    const twice = addDealItem(once.next, { kind: "fleet", fleetId: "fl1" });
    assert.equal(twice.skipped, "already");
    assert.equal(twice.next.length, 1);
  });

  it("remaining stock subtracts committed give and escrow", () => {
    assert.equal(
      remainingStock(80, [
        { kind: "resource", currencyId: "currency.metal", amount: 30 },
      ], "currency.metal"),
      50,
    );
    assert.equal(
      remainingStock(
        80,
        [{ kind: "resource", currencyId: "currency.metal", amount: 10 }],
        "currency.metal",
        20,
      ),
      50,
    );
    assert.equal(
      resourceCommittedInOffers(
        [
          {
            give: [{ kind: "resource", currencyId: "currency.metal", amount: 15 }],
          },
        ],
        "currency.metal",
      ),
      15,
    );
    assert.equal(treatyConflict([{ kind: "treaty", treaty: "trade" }], "alliance"), true);
    assert.equal(treatyConflict([{ kind: "treaty", treaty: "trade" }], "trade"), false);
  });

  it("hold for irreversible assets, not for metal", () => {
    assert.equal(
      dealNeedsHold([{ kind: "resource", currencyId: "currency.metal", amount: 10 }]),
      false,
    );
    assert.equal(dealNeedsHold([{ kind: "fleet", fleetId: "f1" }]), true);
    assert.equal(dealNeedsHold([{ kind: "treaty", treaty: "alliance" }]), true);
    assert.equal(dealNeedsHold([{ kind: "treaty", treaty: "trade" }]), false);
  });

  it("fairness labels skew", () => {
    const even = dealFairness(
      [{ kind: "resource", currencyId: "currency.metal", amount: 40 }],
      [{ kind: "resource", currencyId: "currency.extracta", amount: 40 }],
    );
    assert.equal(even?.tone, "even");
    const giveHeavy = dealFairness(
      [{ kind: "fleet", fleetId: "f1" }],
      [{ kind: "resource", currencyId: "currency.metal", amount: 5 }],
    );
    assert.equal(giveHeavy?.tone, "give");
    assert.equal(dealFairness([], []), null);
    const draftGive = dealFairness(
      [
        { kind: "resource", currencyId: "currency.metal", amount: 40 },
        { kind: "resource", currencyId: "currency.metal", amount: 200 },
      ],
      [{ kind: "resource", currencyId: "currency.extracta", amount: 40 }],
    );
    assert.equal(draftGive?.tone, "give");
  });
});
