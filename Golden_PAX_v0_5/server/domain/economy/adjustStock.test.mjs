/**
 * Behavior test, not a cross-repo diff: GMap's adjustStock (server/
 * ledger.mjs) is exported, but importing it pulls in file-backed storage
 * and DB adapter modules with real side effects (reads/writes under
 * GMap/data) — not something a unit test should trigger. Cases re-derived
 * directly from reading that function.
 */
import { describe, it, expect } from "vitest";
import { adjustStock } from "./adjustStock.mjs";

describe("adjustStock", () => {
  it("applies a positive delta and returns a journal entry", () => {
    const eco = { factionId: "f1", stocks: { "currency.metal": 100 } };
    const { stocks, appliedDelta, journalEntry } = adjustStock(eco, "currency.metal", 25, {
      turn: 3,
      reason: "flow_income",
    });
    expect(stocks["currency.metal"]).toBe(125);
    expect(appliedDelta).toBe(25);
    expect(journalEntry).toMatchObject({ factionId: "f1", currencyId: "currency.metal", delta: 25, turn: 3, clamped: false });
  });

  it("never goes negative — clamps spending at 0", () => {
    const eco = { factionId: "f1", stocks: { "currency.metal": 10 } };
    const { stocks, appliedDelta, journalEntry } = adjustStock(eco, "currency.metal", -50);
    expect(stocks["currency.metal"]).toBe(0);
    expect(appliedDelta).toBe(-10);
    expect(journalEntry.clamped).toBe(true);
  });

  it("won't spend below a reserved amount", () => {
    const eco = {
      factionId: "f1",
      stocks: { "currency.metal": 100 },
      stockReserves: { "currency.metal": { amount: 30 } },
    };
    const { stocks, appliedDelta } = adjustStock(eco, "currency.metal", -90);
    expect(stocks["currency.metal"]).toBe(30);
    expect(appliedDelta).toBe(-70);
  });

  it("a reserve_change itself can dip into the reserved amount", () => {
    const eco = {
      factionId: "f1",
      stocks: { "currency.metal": 100 },
      stockReserves: { "currency.metal": { amount: 30 } },
    };
    const { stocks, appliedDelta } = adjustStock(eco, "currency.metal", -90, { reason: "reserve_change" });
    expect(stocks["currency.metal"]).toBe(10);
    expect(appliedDelta).toBe(-90);
  });

  it("emits no journal entry for a true zero-delta, zero-effect adjustment", () => {
    const eco = { factionId: "f1", stocks: { "currency.metal": 100 } };
    const { journalEntry } = adjustStock(eco, "currency.metal", 0);
    expect(journalEntry).toBeNull();
  });

  it("treats an unknown currency as starting from 0", () => {
    const eco = { factionId: "f1", stocks: {} };
    const { stocks } = adjustStock(eco, "currency.cognitio", 15);
    expect(stocks["currency.cognitio"]).toBe(15);
  });
});
