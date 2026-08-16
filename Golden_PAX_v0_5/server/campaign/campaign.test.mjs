import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { getContent } from "../contentLoader.mjs";
import { createCampaign, addFaction, listFactions, listCampaigns, listLoginCampaigns, pruneJunkCampaigns, getCurrentTurn, setFactionPeg, setFactionName } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "./economyStore.mjs";
import { loadTechAccount, saveTechAccount } from "./techStore.mjs";
import { loadCivicAccount } from "./civicStore.mjs";
import { loadDiplomacyAccount, setRelation, loadRelations } from "./diplomacyStore.mjs";
import { runCampaignTurn } from "./turn.mjs";
import { researchTech } from "../domain/tech/researchTech.mjs";
import { createSystem, createPlanet, savePlanet, loadPlanet, loadSystemWithPlanets } from "./planetStore.mjs";
import { createForce, loadForce } from "./forcesStore.mjs";
import { createSystemLink } from "./systemLinksStore.mjs";
import { colonizePlanet } from "../domain/planets/colonization.mjs";
import { placeBuilding } from "../domain/planets/construction.mjs";

const content = getContent(["core"]);

function setupCampaign(db, factionCount = 3) {
  const campaign = createCampaign(db, { name: "Test Campaign" });
  const factions = Array.from({ length: factionCount }, (_, i) =>
    addFaction(db, campaign.id, { id: `f${i}`, name: `Faction ${i}`, raceId: "race_human", colorHex: "#336699" }),
  );
  for (const f of factions) seedFactionAccounts(db, campaign.id, f.id, content);
  return { campaign, factions };
}

describe("campaign persistence: store layer round-trips", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("seeds real starting stocks from content, not a hard-coded copy", () => {
    const { campaign } = setupCampaign(db, 1);
    const eco = loadEconomyAccount(db, campaign.id, "f0");
    expect(eco.stocks).toEqual(content.economy_balance.start.stocks);
  });

  it("does not assume a fixed number of factions", () => {
    const { campaign } = setupCampaign(db, 6);
    expect(listFactions(db, campaign.id)).toHaveLength(6);
  });

  it("lists campaigns for the login dropdown and can rename a faction", () => {
    const { campaign, factions } = setupCampaign(db, 1);
    expect(listCampaigns(db)).toEqual([{ id: campaign.id, name: "Test Campaign" }]);
    const renamed = setFactionName(db, campaign.id, factions[0].id, "Белатор");
    expect(renamed?.name).toBe("Белатор");
  });

  it("hides smoke leftovers from the login dropdown and can prune them", () => {
    const keep = createCampaign(db, { name: "LO GOLDEN PAX — Центральный сектор (Сессия 2)" });
    createCampaign(db, { name: "smoke-viewer-mvp" });
    createCampaign(db, { name: "table-tonight-msurwoxt" });
    expect(listLoginCampaigns(db).map((c) => c.name)).toEqual([keep.name]);
    const removed = pruneJunkCampaigns(db);
    expect(removed.map((c) => c.name).sort()).toEqual(["smoke-viewer-mvp", "table-tonight-msurwoxt"]);
    expect(listCampaigns(db)).toEqual([{ id: keep.id, name: keep.name }]);
  });

  it("saveEconomyAccount round-trips stocks and appends ledger entries", () => {
    const { campaign } = setupCampaign(db, 1);
    const eco = loadEconomyAccount(db, campaign.id, "f0");
    eco.stocks["currency.metal"] += 50;
    saveEconomyAccount(db, campaign.id, "f0", eco, {
      turn: 1,
      journal: [{ factionId: "f0", currencyId: "currency.metal", delta: 50, reason: "test" }],
    });

    const reloaded = loadEconomyAccount(db, campaign.id, "f0");
    expect(reloaded.stocks["currency.metal"]).toBe(eco.stocks["currency.metal"]);

    const ledgerRows = db.prepare("SELECT * FROM ledger_entries WHERE campaign_id = ?").all(campaign.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({ currency_id: "currency.metal", delta: 50, reason: "test" });
  });

  it("tech unlocks persist to the EAV table and survive reload", () => {
    const { campaign } = setupCampaign(db, 1);
    const techAccount = loadTechAccount(db, campaign.id, "f0");
    const eco = loadEconomyAccount(db, campaign.id, "f0");
    const techDef = Object.values(content.technologies).find((t) => !t.prerequisites?.length && Number(t.cost?.["currency.cognitio"]) > 0);

    const result = researchTech(techAccount, eco.stocks, techDef.id, content, { turn: 1 });
    expect(result.ok).toBe(true);
    saveTechAccount(db, campaign.id, "f0", result.techAccount, { turn: 1 });

    const reloaded = loadTechAccount(db, campaign.id, "f0");
    expect(reloaded.unlockedTechs).toContain(techDef.id);
  });

  it("relations are symmetric regardless of insert order", () => {
    const { campaign } = setupCampaign(db, 2);
    setRelation(db, campaign.id, "f1", "f0", "war");
    const relations = loadRelations(db, campaign.id);
    expect(Object.values(relations)).toContain("war");
    expect(Object.keys(relations)).toEqual(["f0|f1"]);
  });
});

describe("runCampaignTurn", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("advances current_turn and persists economy/civic/diplomacy for every faction", () => {
    const { campaign } = setupCampaign(db, 3);
    setRelation(db, campaign.id, "f0", "f1", "alliance");

    const result = runCampaignTurn(db, campaign.id, content, {
      f0: { categoryIncome: { "currency.materia": 50 } },
    });

    expect(result.turn).toBe(1);
    expect(getCurrentTurn(db, campaign.id)).toBe(1);
    expect(Object.keys(result.economy.breakdowns)).toEqual(["f0", "f1", "f2"]);

    const f0Eco = loadEconomyAccount(db, campaign.id, "f0");
    expect(f0Eco.stocks["currency.materia"]).toBeGreaterThan(content.economy_balance.start.stocks["currency.materia"]);

    const f0Diplo = loadDiplomacyAccount(db, campaign.id, "f0");
    expect(f0Diplo.opinions.f1).toBeGreaterThan(0); // allied
  });

  it("a faction with a real colonized+built planet earns its building's yield_flat automatically, no categoryIncome override needed", () => {
    const { campaign } = setupCampaign(db, 1);
    const system = createSystem(db, campaign.id, { id: "sys1", name: "Sys 1", ownerFactionId: "f0" });
    const rawPlanet = createPlanet(db, campaign.id, system.id, { id: "p1", name: "P1", type: "rocky", climate: "arid", habitable: true });

    const colonized = colonizePlanet(system, rawPlanet, "f0", "outpost", { "currency.metal": 100, "currency.supply": 100 }, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [] }).planet;
    savePlanet(db, campaign.id, colonized);
    const built = placeBuilding(system, colonized, content.buildings["building.mine"], "f0", { "currency.metal": 100, "currency.supply": 100, "currency.extracta": 100 }, content).planet;
    // building.mine needs laborSlots: 3 to fully staff — outpost colonization only starts with 2 population, so
    // bump it here; this test is about yield_flat wiring, not labor-gating (that's laborAllocation.test.mjs's job).
    savePlanet(db, campaign.id, { ...built, population: 10 });

    const before = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.extracta"];
    runCampaignTurn(db, campaign.id, content, {}); // no categoryIncome override at all
    const after = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.extracta"];

    // building.mine yields +2 currency.extracta/turn (content/core/buildings.json), untaxed.
    expect(after - before).toBe(2);
  });

  it("a planet over its real (buildings-derived) cap loses population — proves planetCapFromBuildings actually gates growth", () => {
    // content's real baseGrowth is ~1.2%/turn, which floors to a 0 delta
    // for any population near colonization size — genuine slow-growth
    // GMap-parity behavior (see domain/economy/populationGrowth.mjs's
    // parity test), not something a single turn will visibly show. The
    // over-cap emigration branch produces a much bigger, immediately
    // visible delta, so it's what actually proves turn.mjs is computing
    // and using a real per-planet cap (base 20, no cap-raising buildings
    // placed) rather than a placeholder.
    const { campaign } = setupCampaign(db, 1);
    const system = createSystem(db, campaign.id, { id: "sys1", name: "Sys 1", ownerFactionId: "f0" });
    const rawPlanet = createPlanet(db, campaign.id, system.id, { id: "p1", name: "P1", habitable: true });
    const colonized = colonizePlanet(system, rawPlanet, "f0", "colony", { "currency.metal": 100, "currency.supply": 100 }, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [] }).planet;
    savePlanet(db, campaign.id, { ...colonized, population: 25 }); // above the real base cap of 20 — no housing built
    const before = 25;

    runCampaignTurn(db, campaign.id, content, {});

    const after = loadPlanet(db, system.id, "p1").population;
    expect(after).toBeLessThan(before);
  });

  it("the second turn reads what the first turn wrote (real cross-turn persistence, not per-request state)", () => {
    const { campaign } = setupCampaign(db, 2);

    const first = runCampaignTurn(db, campaign.id, content, { f0: { categoryIncome: { "currency.materia": 100 } } });
    expect(first.turn).toBe(1);
    const afterFirst = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.materia"];

    const second = runCampaignTurn(db, campaign.id, content, { f0: { categoryIncome: { "currency.materia": 100 } } });
    expect(second.turn).toBe(2);
    const afterSecond = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.materia"];

    expect(afterSecond).toBeGreaterThan(afterFirst);
  });

  it("does not assume exactly two or three factions", () => {
    const { campaign } = setupCampaign(db, 5);
    const result = runCampaignTurn(db, campaign.id, content, {});
    expect(Object.keys(result.economy.breakdowns)).toHaveLength(5);
    expect(result.diplomacy.factions).toHaveLength(5);
    expect(result.civic.factions).toHaveLength(5);
  });

  it("a civic building unlock in the same turn updates the shared techAccount, visible on reload", () => {
    const { campaign } = setupCampaign(db, 1);
    // Push trade score above content's real free_port threshold directly, bypassing the tick's own scoring math —
    // this test is about the tech/civic account sharing, not re-deriving the civic scoring formula (already covered elsewhere).
    const civicBefore = loadCivicAccount(db, campaign.id, "f0");
    civicBefore.civicScores.trade = 999999;
    db.prepare("UPDATE faction_civic SET trade_score = ? WHERE campaign_id = ? AND faction_id = ?").run(999999, campaign.id, "f0");

    runCampaignTurn(db, campaign.id, content, {});

    const techAfter = loadTechAccount(db, campaign.id, "f0");
    expect(techAfter.unlockedProperties.length).toBeGreaterThan(0);
  });

  it("a faction with no buildings still receives the legacy supply floor (metal stays flat)", () => {
    const { campaign } = setupCampaign(db, 1);
    const before = loadEconomyAccount(db, campaign.id, "f0").stocks;
    runCampaignTurn(db, campaign.id, content, {});
    const after = loadEconomyAccount(db, campaign.id, "f0").stocks;
    expect(after["currency.supply"]).toBeGreaterThan(before["currency.supply"]);
    expect(after["currency.metal"]).toBe(before["currency.metal"]);
  });

  it("an owned asteroid adds extracta income and depletes remaining; an unowned asteroid does neither", () => {
    const { campaign } = setupCampaign(db, 2);
    createSystem(db, campaign.id, {
      id: "sys.owned",
      name: "Owned Belt",
      ownerFactionId: "f0",
      spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }],
    });
    createSystem(db, campaign.id, {
      id: "sys.wild",
      name: "Wild Belt",
      ownerFactionId: null,
      spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }],
    });

    const before = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.extracta"];
    runCampaignTurn(db, campaign.id, content, {});
    const after = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.extracta"];
    expect(after - before).toBe(3);

    const owned = loadSystemWithPlanets(db, campaign.id, "sys.owned");
    expect(owned.spaceObjects).toHaveLength(1);
    expect(owned.spaceObjects[0].remainingAmount).toBe(237);

    const wild = loadSystemWithPlanets(db, campaign.id, "sys.wild");
    expect(wild.spaceObjects[0].remainingAmount).toBe(240);
  });

    it("a pegged faction extracting that resource earns metal beyond the floor", () => {
    const { campaign } = setupCampaign(db, 1);
    const system = createSystem(db, campaign.id, { id: "sys1", name: "Sys 1", ownerFactionId: "f0" });
    const rawPlanet = createPlanet(db, campaign.id, system.id, {
      id: "p1",
      name: "P1",
      type: "rocky",
      climate: "arid",
      habitable: true,
      resources: ["map.titan"],
    });
    const colonized = colonizePlanet(system, rawPlanet, "f0", "colony", { "currency.metal": 100, "currency.supply": 100 }, content, {
      mode: "auto",
      founderRaceId: "race_human",
      factionPlanets: [],
    }).planet;
    savePlanet(db, campaign.id, colonized);
    const built = placeBuilding(system, colonized, content.buildings["building.mine"], "f0", { "currency.metal": 100, "currency.supply": 100, "currency.extracta": 100 }, content).planet;
    savePlanet(db, campaign.id, { ...built, population: 10 });
    setFactionPeg(db, campaign.id, "f0", "map.titan", 0);

    const before = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.metal"];
    const result = runCampaignTurn(db, campaign.id, content, {});
    const after = loadEconomyAccount(db, campaign.id, "f0").stocks["currency.metal"];

    expect(after).toBeGreaterThan(before);
    expect(result.fx.credits["map.titan"]).toBeGreaterThan(0);
  });

  it("movement points refill to max on turn regardless of location", () => {
    const { campaign } = setupCampaign(db, 1);
    createSystem(db, campaign.id, { id: "sys.home", name: "Home", ownerFactionId: "f0", isCapital: true });
    createSystem(db, campaign.id, { id: "sys.far", name: "Far", ownerFactionId: "f0" });
    createSystemLink(db, campaign.id, { fromId: "sys.home", toId: "sys.far", type: "corridor" });
    const force = createForce(db, campaign.id, {
      factionId: "f0",
      kind: "fleet",
      name: "Scout",
      systemId: "sys.far",
      engineTier: 0,
      fuelTier: 0,
      movementPoints: 0,
      composition: [],
    });
    runCampaignTurn(db, campaign.id, content, {});
    const after = loadForce(db, campaign.id, force.id);
    expect(after.systemId).toBe("sys.far");
    expect(after.movementPoints).toBe(content.rules.movement.fuelMovementPoints["0"]);
  });
});
