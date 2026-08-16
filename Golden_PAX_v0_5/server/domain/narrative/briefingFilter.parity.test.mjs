import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { filterBriefingForFaction as newFn } from "./briefingFilter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/briefingFilter.mjs");

const world = { systems: [{ id: "sys1", ownerFactionId: "fA" }, { id: "sys2", ownerFactionId: "fB" }] };

const journal = {
  turnFrom: 4,
  turnTo: 5,
  economy: { fA: { channels: { "currency.metal": { net: 12 } }, deficit: "ok", pressure: 0, apMax: 5 } },
  events: [
    { type: "economy", factionId: "fA", net: { "currency.metal": 12 } },
    { type: "combat", attacker: "fA", defender: "fB", systemId: "sys2" },
    { type: "combat", attacker: "fC", defender: "fD", systemId: "sys9" },
    { type: "timer_fired", factionId: "fA" },
    { type: "colonize", systemId: "sys1" },
  ],
};

describe("filterBriefingForFaction parity with GMap", () => {
  it("matches for a faction involved in some events", async () => {
    const { filterBriefingForFaction: oldFn } = await import(oldModulePath);
    expect(newFn(journal, "fA", world)).toEqual(oldFn(journal, "fA", world));
  });

  it("matches for a faction not touched by anything (empty events, null economy)", async () => {
    const { filterBriefingForFaction: oldFn } = await import(oldModulePath);
    expect(newFn(journal, "fZ", world)).toEqual(oldFn(journal, "fZ", world));
  });

  it("returns null for missing journal/factionId, same as GMap", async () => {
    const { filterBriefingForFaction: oldFn } = await import(oldModulePath);
    expect(newFn(null, "fA", world)).toBe(oldFn(null, "fA", world));
    expect(newFn(journal, null, world)).toBe(oldFn(journal, null, world));
  });
});
