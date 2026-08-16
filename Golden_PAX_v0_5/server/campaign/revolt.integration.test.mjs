/**
 * Integration: stability fixture → Stage 2 spawn → Stage 3 secession
 * creates a queryable faction with ownership transfer.
 * NOT a GMap port.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { getContent } from "../contentLoader.mjs";
import { createCampaign, addFaction, getFaction, listFactions } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { createSystem, createPlanet, savePlanet, listFactionPlanets, loadSystemWithPlanets } from "./planetStore.mjs";
import { createForce, loadForce, listCampaignForces } from "./forcesStore.mjs";
import { runCampaignTurn } from "./turn.mjs";
import { saveStability, listFactionRevolts, upsertPlanetRevolt } from "./stabilityStore.mjs";
import { loadFactionCourt } from "./npcStore.mjs";
import { syntheticCrewGroup } from "../domain/combat/boarding.mjs";

const content = getContent(["core"]);
const militia = content.units["unit.militia"];

function setup(db) {
  const campaign = createCampaign(db, { name: "revolt" });
  const faction = addFaction(db, campaign.id, {
    id: "f0",
    name: "Source",
    raceId: "race_human",
    colorHex: "#336699",
  });
  seedFactionAccounts(db, campaign.id, faction.id, content);
  createSystem(db, campaign.id, { id: "sys1", name: "Helios", ownerFactionId: "f0" });
  const planet = createPlanet(db, campaign.id, "sys1", {
    id: "p1",
    name: "Helios I",
    type: "rocky",
    climate: "temperate",
    habitable: true,
    population: 50,
    colonyType: "core",
    ownerFactionId: "f0",
    raceComposition: [{ raceId: "race_human", percent: 100 }],
  });
  return { campaignId: campaign.id, planet };
}

describe("stability + revolt campaign tick", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("seeds stability at the first-pass starting value", () => {
    const { campaignId } = setup(db);
    const turn = runCampaignTurn(db, campaignId, content);
    expect(turn.turn).toBe(1);
    const row = db.prepare("SELECT value FROM faction_stability WHERE faction_id = 'f0'").get();
    expect(row.value).toBe(content.economy_balance.stability.startingValue + content.economy_balance.stability.naturalDecay);
  });

  it("Stage 2 spawns a militia rebel force from population without spending it", () => {
    const { campaignId } = setup(db);
    saveStability(db, campaignId, "f0", 24);
    const result = runCampaignTurn(db, campaignId, content);
    const spawn = result.revolt.find((e) => e.type === "rebel_spawn");
    expect(spawn).toBeTruthy();
    expect(spawn.planetId).toBe("p1");
    const force = loadForce(db, campaignId, spawn.forceId);
    expect(force.kind).toBe("legion");
    expect(force.composition[0]).toMatchObject({
      defId: "unit.militia",
      damage: militia.stats.damage,
      defense: militia.stats.defense,
      hp: militia.stats.hp,
      speed: militia.stats.speed,
    });
    expect(force.composition[0].count).toBeGreaterThanOrEqual(1);
    expect(listFactionPlanets(db, campaignId, "f0")[0].population).toBeGreaterThan(0);
    expect(listFactionRevolts(db, campaignId, "f0")).toHaveLength(1);
  });

  it("a present garrison engages with rebel retreat-stance; occupation continues if they disengage", () => {
    const { campaignId } = setup(db);
    createForce(db, campaignId, {
      id: "gar-1",
      factionId: "f0",
      kind: "legion",
      name: "Garrison",
      homePlanetId: "p1",
      systemId: "sys1",
      composition: [syntheticCrewGroup(40, militia)],
    });
    saveStability(db, campaignId, "f0", 24);
    const result = runCampaignTurn(db, campaignId, content);
    const spawn = result.revolt.find((e) => e.type === "rebel_spawn");
    expect(spawn?.engagement).toBe("retreat_b");
    expect(loadForce(db, campaignId, spawn.forceId)).toBeTruthy();
  });

  it("Stage 3 creates a real NPC faction, transfers the planet, and is queryable like any other faction", () => {
    const { campaignId } = setup(db);
    saveStability(db, campaignId, "f0", 24);
    const first = runCampaignTurn(db, campaignId, content);
    const spawn = first.revolt.find((e) => e.type === "rebel_spawn");
    expect(spawn).toBeTruthy();
    const row = listFactionRevolts(db, campaignId, "f0")[0];
    upsertPlanetRevolt(db, campaignId, { ...row, stage2SinceTurn: first.turn - 3 });

    const blocsBefore = loadFactionCourt(db, campaignId, "f0", content).internalBlocs.length;
    const second = runCampaignTurn(db, campaignId, content);
    const secession = second.revolt.find((e) => e.type === "secession");
    expect(secession).toBeTruthy();

    const born = getFaction(db, campaignId, secession.newFactionId);
    expect(born).toMatchObject({ id: secession.newFactionId, isNpc: true, name: "Breakaway of Helios I" });
    expect(listFactions(db, campaignId).some((f) => f.id === born.id)).toBe(true);
    expect(listFactionPlanets(db, campaignId, "f0")).toHaveLength(0);
    expect(listFactionPlanets(db, campaignId, born.id)[0]).toMatchObject({ id: "p1", ownerFactionId: born.id });
    expect(listFactionPlanets(db, campaignId, born.id)[0].population).toBeGreaterThan(0);
    const sys = loadSystemWithPlanets(db, campaignId, "sys1");
    expect(sys.ownerFactionId).toBe(born.id);
    const rebelForce = listCampaignForces(db, campaignId).find((f) => f.factionId === born.id);
    expect(rebelForce?.kind).toBe("legion");

    const blocsAfter = loadFactionCourt(db, campaignId, "f0", content).internalBlocs.length;
    expect(blocsAfter).toBe(blocsBefore);
  });
});
