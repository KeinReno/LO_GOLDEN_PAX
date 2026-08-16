import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { findPlayerByPlainToken, mintPlayerToken, seatPlayerOnFaction, GM_TABLE_PIN } from "./playerStore.mjs";

function setup(db) {
  const campaign = createCampaign(db, { name: "Pin Table" });
  addFaction(db, campaign.id, { id: "f1", name: "Alpha", raceId: "race_human", colorHex: "#111111" });
  addFaction(db, campaign.id, { id: "f2", name: "Bravo", raceId: "race_human", colorHex: "#222222" });
  return campaign;
}

describe("mintPlayerToken 4-digit PINs", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("mints a random 4-digit PIN that is not the GM pin", () => {
    const campaign = setup(db);
    const minted = mintPlayerToken(db, campaign.id, "f1");
    expect(minted.ok).toBe(true);
    expect(minted.token).toMatch(/^\d{4}$/);
    expect(minted.token).not.toBe(GM_TABLE_PIN);
    expect(findPlayerByPlainToken(db, minted.token)?.id).toBe(minted.playerId);
  });

  it("accepts a specific PIN and rejects the reserved GM pin", () => {
    const campaign = setup(db);
    const ok = mintPlayerToken(db, campaign.id, "f1", { token: "4848", displayName: "Белатор" });
    expect(ok).toMatchObject({ ok: true, token: "4848", displayName: "Белатор" });

    const reserved = mintPlayerToken(db, campaign.id, "f2", { token: "2142" });
    expect(reserved).toEqual({ ok: false, error: "pin_reserved" });
  });

  it("rejects a PIN already seated on another faction", () => {
    const campaign = setup(db);
    expect(mintPlayerToken(db, campaign.id, "f1", { token: "4848" }).ok).toBe(true);
    expect(mintPlayerToken(db, campaign.id, "f2", { token: "4848" })).toEqual({ ok: false, error: "pin_taken" });
  });

  it("rejects tokens that are not 4 digits", () => {
    const campaign = setup(db);
    expect(mintPlayerToken(db, campaign.id, "f1", { token: "48" })).toEqual({
      ok: false,
      error: "pin_must_be_4_digits",
    });
  });

  it("can reseat an existing PIN onto another faction", () => {
    const campaign = setup(db);
    const minted = mintPlayerToken(db, campaign.id, "f1", { token: "4848" });
    expect(seatPlayerOnFaction(db, campaign.id, "f2", minted.playerId)).toEqual({
      ok: true,
      playerId: minted.playerId,
      factionId: "f2",
    });
  });
});
