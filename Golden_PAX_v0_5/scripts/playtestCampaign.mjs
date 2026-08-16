/**
 * Narrative playtest v2: 10 turns, two factions with opposite strategies —
 * now with a real world (systems/planets/buildings, domain/planets/*)
 * instead of hand-typed income numbers. v1 of this script fed fake
 * categoryIncome every turn; that made it obvious there was no game
 * underneath the formulas. This version colonizes real planets and builds
 * real buildings — income comes from computeFactionFlowIncome, not from me.
 *
 * Usage: node server/serve.mjs & node scripts/playtestCampaign.mjs
 */
import { createSmokeClient } from "./smokeHttp.mjs";
import { getContent } from "../server/contentLoader.mjs";

const { call: rawCall, seatPlayer } = createSmokeClient();

async function call(method, path, { actor, body } = {}) {
  const res = await rawCall(method, path, { actor, body });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json;
}

const log = (line) => console.log(line);

function pickNextResearchable(techAccount, content) {
  const unlocked = new Set(techAccount.unlockedTechs);
  return Object.values(content.technologies)
    .filter((t) => !unlocked.has(t.id))
    .filter((t) => (t.prerequisites || []).every((p) => unlocked.has(p)))
    .filter((t) => Number(t.cost?.["currency.cognitio"]) > 0)
    .sort((a, b) => Number(a.cost["currency.cognitio"]) - Number(b.cost["currency.cognitio"]))[0];
}

function makeFleet(count, { damage, hp, armor = 8, shields = 8, roles = ["line"] }) {
  return [{ roles, damage, accuracy: 80, armor, shields, count, hp, maxHp: hp }];
}

async function tryBuild(campaignId, systemId, planetId, factionId, buildingId) {
  const result = await call("POST", `/api/campaign/${campaignId}/systems/${systemId}/planets/${planetId}/build`, {
    actor: factionId,
    body: { buildingId },
  });
  log(result.ok ? `[build] ${factionId} built ${buildingId} on ${planetId}` : `[build] ${factionId} FAILED to build ${buildingId}: ${result.error}`);
  return result;
}

async function main() {
  const { getContent } = await import("../server/contentLoader.mjs");
  const content = getContent();

  log("=== Golden Pax — 10-turn playtest campaign (v2: real world) ===\n");

  const campaign = await call("POST", "/api/campaign", { actor: "gm", body: { name: "Playtest v2: Directorate vs Ascendancy" } });
  log(`Campaign created: ${campaign.id}\n`);

  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: "econos", name: "Директорат Эконос", raceId: "race_human", colorHex: "#2266cc" } });
  await call("POST", `/api/campaign/${campaign.id}/factions`, { actor: "gm", body: { id: "bellum", name: "Восхождение Беллум", raceId: "race_belator", colorHex: "#cc3322" } });
  await seatPlayer(campaign.id, "econos");
  await seatPlayer(campaign.id, "bellum");
  log("Factions seated: econos (race_human, торговцы), bellum (race_belator, милитаристы)\n");

  // Worldgen: one system each, two planets each (a home world + a second one to expand into).
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: "sys.econos", name: "Econos Prime", ownerFactionId: "econos" } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: "sys.bellum", name: "Bellum Reach", ownerFactionId: "bellum" } });
  for (const [sysId, factionId, planetId, n] of [
    ["sys.econos", "econos", "econos.home", "Econos Prime I"],
    ["sys.econos", "econos", "econos.second", "Econos Prime II"],
    ["sys.bellum", "bellum", "bellum.home", "Bellum Reach I"],
  ]) {
    await call("POST", `/api/campaign/${campaign.id}/systems/${sysId}/planets`, { actor: "gm", body: { id: planetId, name: n, type: "rocky", climate: "temperate" } });
  }
  log("Worldgen: econos has 2 planets (Econos Prime I/II), bellum has 1 (Bellum Reach I)\n");

  // Turn 0.5: colonize home planets before the first real turn.
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.econos/planets/econos.home/colonize`, { actor: "econos", body: { colonyType: "colony" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.bellum/planets/bellum.home/colonize`, { actor: "bellum", body: { colonyType: "colony" } });
  log("Colonized: econos.home, bellum.home\n");

  for (const factionId of ["econos", "bellum"]) {
    const roll = await call("POST", "/api/quests/roll-yearly", { actor: factionId, body: { factionId, turn: 0, ctx: { era: 1 }, systemIds: [`sys.${factionId}`] } });
    log(`[quests] ${factionId} rolled ${roll.roll} -> ${roll.count} quest(s): ${roll.quests.map((q) => q.name).join(", ")}`);
  }
  log("");

  let bellumFleet = makeFleet(40, { damage: 60, hp: 120, roles: ["line"] });
  let econosFleet = makeFleet(15, { damage: 25, hp: 90, roles: ["screen"] });

  // Econos's economic build order — real buildings, real costs, real yield_flat income.
  const econosBuildPlan = { 2: ["econos.home", "building.mine"], 4: ["econos.home", "materia.mint"], 6: ["econos.home", "energia.zro_reactor"], 8: ["econos.home", "bios.biolab"] };

  for (let turn = 1; turn <= 10; turn++) {
    log(`--- Turn ${turn} ---`);

    if (turn === 5) {
      const colonize = await call("POST", `/api/campaign/${campaign.id}/systems/sys.econos/planets/econos.second/colonize`, { actor: "econos", body: { colonyType: "outpost" } });
      log(colonize.ok ? "[expand] econos colonized Econos Prime II" : `[expand] econos FAILED to colonize: ${colonize.error}`);
    }
    if (econosBuildPlan[turn]) {
      const [planetId, buildingId] = econosBuildPlan[turn];
      await tryBuild(campaign.id, "sys.econos", planetId, "econos", buildingId);
    }

    // No categoryIncome override at all — everything econos/bellum earn now comes from real owned planets/buildings.
    const tickResult = await call("POST", `/api/campaign/${campaign.id}/turn`, {
      actor: "gm",
      body: {
        factionInputs: {
          bellum: { pressureAdd: turn >= 3 ? 6 : 0 }, // war taxation pressure — bellum has no economic buildings, this is its only "input"
        },
      },
    });

    const eb = tickResult.economy.breakdowns.econos;
    const bb = tickResult.economy.breakdowns.bellum;
    log(`[economy] econos: deficit=${eb.deficit} pressure=${eb.pressure} channels=${JSON.stringify(eb.channels)}`);
    log(`[economy] bellum: deficit=${bb.deficit} pressure=${bb.pressure} channels=${JSON.stringify(bb.channels)}`);

    if (turn % 2 === 0) {
      const state = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
      const econosTech = state.factions.find((f) => f.faction.id === "econos").tech;
      const next = pickNextResearchable(econosTech, content);
      if (next) {
        const research = await call("POST", `/api/campaign/${campaign.id}/factions/econos/research`, { actor: "econos", body: { techId: next.id, turn } });
        log(research.ok ? `[tech] econos researched "${next.name}" (${next.id})` : `[tech] econos failed to research ${next.id}: ${research.error}`);
      }
    }

    if (turn === 3) {
      await call("POST", `/api/campaign/${campaign.id}/relations`, { actor: "gm", body: { factionAId: "bellum", factionBId: "econos", relation: "war", turn } });
      log("[diplomacy] bellum declares WAR on econos");
    }

    if (turn >= 4 && turn % 2 === 0 && bellumFleet.length && econosFleet.length) {
      const fight = await call("POST", "/api/combat/resolve-exchange", {
        actor: "gm",
        body: { groupsA: bellumFleet, groupsB: econosFleet, stanceA: "hold", stanceB: "hold", factionIdA: "bellum", factionIdB: "econos" },
      });
      bellumFleet = fight.groupsA;
      econosFleet = fight.groupsB;
      log(
        `[combat] bellum vs econos -> ${fight.outcome} (powerA=${Math.round(fight.powerA)}, powerB=${Math.round(fight.powerB)}) | bellum ${bellumFleet[0]?.count ?? 0} left, econos ${econosFleet[0]?.count ?? 0} left`,
      );
    } else if (turn >= 4 && turn % 2 === 0) {
      log(`[combat] skipped — one side has no forces left (bellum ${bellumFleet[0]?.count ?? 0}, econos ${econosFleet[0]?.count ?? 0})`);
    }

    const finalState = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
    const econosOpinion = finalState.factions.find((f) => f.faction.id === "econos").diplomacy.opinions.bellum ?? 0;
    log(`[diplomacy] econos's opinion of bellum: ${Math.round(econosOpinion)}`);
    log("");
  }

  log("=== Final state ===");
  const finalState = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
  log(`Turn reached: ${finalState.currentTurn}`);
  for (const f of finalState.factions) {
    log(`\n${f.faction.name} (${f.faction.id}):`);
    log(`  stocks: ${JSON.stringify(f.economy.stocks)}`);
    log(`  deficit=${f.economy.deficit} pressure=${Math.round(f.economy.pressure)}`);
    log(`  unlockedTechs: ${f.tech.unlockedTechs.join(", ") || "(none)"}`);
    log(`  unlockedProperties: ${f.tech.unlockedProperties.join(", ") || "(none)"}`);
  }
  log(`\nplanets:`);
  for (const sys of finalState.systems) {
    for (const p of sys.planets) {
      const buildings = [...p.surfaceBuildings, ...p.orbitalBuildings].map((b) => b.buildingId);
      log(`  ${p.name} (${p.id}): owner=${p.ownerFactionId ?? "none"} pop=${Math.round(p.population)} colonyType=${p.colonyType} buildings=[${buildings.join(", ")}]`);
    }
  }
  log(`\nrelations: ${JSON.stringify(finalState.relations)}`);
  log(`\nbellum fleet remaining: ${bellumFleet[0]?.count ?? 0} (started 40)`);
  log(`econos fleet remaining: ${econosFleet[0]?.count ?? 0} (started 15)`);
}

main().catch((err) => {
  console.error("PLAYTEST FAILED:", err);
  process.exit(1);
});
