/**
 * True cross-repo parity for expireQuests (exported in GMap, mutates
 * `world.quests` in place and appends to a passed-in journal array — this
 * port returns {quests, journal} instead, see questTick.mjs's header).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { expireQuests as newFn } from "./questTick.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/questEngine.mjs");

function quests() {
  return [
    { id: "q1", status: "active", expiresTurn: 5, history: [] },
    { id: "q2", status: "active", expiresTurn: 10, history: [] },
    { id: "q3", status: "active", expiresTurn: null, history: [] },
    { id: "q4", status: "resolved", expiresTurn: 1, history: [] },
  ];
}

describe("expireQuests parity with GMap", () => {
  it("expires only active quests whose expiresTurn has arrived", async () => {
    const { expireQuests: oldFn } = await import(oldModulePath);

    const world = { quests: quests() };
    const oldJournal = [];
    oldFn(world, 7, oldJournal);

    const { quests: newQuests, journal: newJournal } = newFn(quests(), 7);

    expect(newQuests.map((q) => ({ id: q.id, status: q.status }))).toEqual(
      world.quests.map((q) => ({ id: q.id, status: q.status })),
    );
    expect(newJournal).toEqual(oldJournal);
  });
});
