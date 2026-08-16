/**
 * Live HTTP check for Court & NPC roster (agent-tasks/COURT_AND_NPC_ROSTER_SPEC.md).
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeCourtRoster.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";

const { call, seatPlayer } = createSmokeClient();

async function main() {
  console.log("=== smoke court / NPC roster ===\n");
  const tag = Date.now().toString(36);
  const fid = `court.${tag}`;

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-court-${tag}` } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);
  const fa = await call("POST", `/api/campaign/${campaign.id}/factions`, {
    actor: "gm",
    body: { id: fid, name: "Courtland", raceId: "race_human", colorHex: "#2266cc" },
  });
  assert(fa.ok, "faction created");
  await seatPlayer(campaign.id, fid);
  await seatPlayer(campaign.id, fid);

  const playerCreate = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs`, {
    actor: fid,
    body: { name: "Should Fail", raceId: "race_human" },
  });
  assert(playerCreate.status === 403, `NPC create is GM-only (got ${playerCreate.status})`);
  const playerPatch = await call("PATCH", `/api/campaign/${campaign.id}/factions/${fid}/npcs/nope`, {
    actor: fid,
    body: { name: "Hacked" },
  });
  assert(playerPatch.status === 403, `NPC edit is GM-only (got ${playerPatch.status})`);

  const created = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs`, {
    actor: "gm",
    body: { name: "Regent", raceId: "race_human", isPlayerRuler: true, traitIds: ["npc_trait.regent_builder"] },
  });
  assert(created.ok && created.json.rulerNpcId, `GM created ruler (${created.json.rulerNpcId})`);
  const rulerId = created.json.rulerNpcId;

  const advisor = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs`, {
    actor: "gm",
    body: { name: "Treasurer", raceId: "race_human" },
  });
  assert(advisor.ok, "GM created advisor");
  const advisorId = advisor.json.npcs.find((n) => n.name === "Treasurer").id;

  const seat = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs/${advisorId}/seat`, {
    actor: fid,
    body: { seatId: "seat.architect" },
  });
  assert(seat.ok && seat.json.npcs.find((n) => n.id === advisorId).councilSeat === "seat.architect", "player seated advisor");

  const throne = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs/${advisorId}/seat`, {
    actor: fid,
    body: { seatId: "seat.ruler" },
  });
  assert(!throne.ok, "player cannot seat the throne");

  const portfolio = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/council/seats/seat.architect/portfolio`, {
    actor: "gm",
    body: { portfolioId: "economy" },
  });
  assert(portfolio.ok && portfolio.json.council.seatPortfolios["seat.architect"] === "economy", "GM assigned economy portfolio");

  const state = await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" });
  const court = state.json.factions.find((row) => row.faction.id === fid).court;
  assert(court.internalBlocs.length >= 11, `blocs displayed (${court.internalBlocs.length})`);
  assert(court.npcs.length === 2, "two NPCs in campaign state");

  const removeRuler = await call("DELETE", `/api/campaign/${campaign.id}/factions/${fid}/npcs/${rulerId}`, { actor: "gm", body: {} });
  assert(!removeRuler.ok, "cannot remove ruler without confirmSetRuler");

  // Live numbers: equal militias, then a commander posting on A's legion must raise powerA.
  const rival = `court.r.${tag}`;
  const fb = await call("POST", `/api/campaign/${campaign.id}/factions`, {
    actor: "gm",
    body: { id: rival, name: "Rival", raceId: "race_human", colorHex: "#cc3322" },
  });
  assert(fb.ok, "rival faction created");
  await seatPlayer(campaign.id, rival);
  const sysA = `sys.${fid}`;
  const sysB = `sys.${rival}`;
  const planetA = `${fid}.home`;
  const planetB = `${rival}.home`;
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysA, name: "A Home", ownerFactionId: fid } });
  await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysB, name: "B Home", ownerFactionId: rival } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/links`, { actor: "gm", body: { toSystemId: sysB, type: "corridor" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets`, { actor: "gm", body: { id: planetA, name: "A I", type: "rocky", climate: "temperate" } });
  await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets`, { actor: "gm", body: { id: planetB, name: "B I", type: "rocky", climate: "temperate" } });
  const colA = await call("POST", `/api/campaign/${campaign.id}/systems/${sysA}/planets/${planetA}/colonize`, { actor: fid, body: { colonyType: "core" } });
  const colB = await call("POST", `/api/campaign/${campaign.id}/systems/${sysB}/planets/${planetB}/colonize`, { actor: rival, body: { colonyType: "core" } });
  assert(colA.ok && colB.ok, `colonized both homes (${colA.json?.error || "ok"} / ${colB.json?.error || "ok"})`);

  async function raiseLevy(actor, sysId, planetId, name) {
    return call("POST", `/api/campaign/${campaign.id}/systems/${sysId}/planets/${planetId}/forces`, {
      actor,
      body: { defId: "unit.militia", kind: "unit", count: 1, name },
    });
  }
  const raisedA1 = await raiseLevy(fid, sysA, planetA, "A Levy 1");
  const raisedB1 = await raiseLevy(rival, sysB, planetB, "B Levy 1");
  const raisedA2 = await raiseLevy(fid, sysA, planetA, "A Levy 2");
  const raisedB2 = await raiseLevy(rival, sysB, planetB, "B Levy 2");
  assert(
    raisedA1.json?.ok && raisedB1.json?.ok && raisedA2.json?.ok && raisedB2.json?.ok,
    `raised two militia pairs (A1=${raisedA1.json?.error || raisedA1.json?.force?.id} B1=${raisedB1.json?.error || raisedB1.json?.force?.id} A2=${raisedA2.json?.error || raisedA2.json?.force?.id} B2=${raisedB2.json?.error || raisedB2.json?.force?.id})`,
  );
  assert(raisedA1.json.force.kind === "legion", `militia is a legion (got ${raisedA1.json.force.kind})`);

  const march1 = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedB1.json.force.id}/move`, {
    actor: rival,
    body: { toSystemId: sysA },
  });
  const march2 = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedB2.json.force.id}/move`, {
    actor: rival,
    body: { toSystemId: sysA },
  });
  assert(march1.json?.ok && march2.json?.ok, `rival marched both levies to A (${march1.json?.error} / ${march2.json?.error})`);

  const baseline = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedA1.json.force.id}/engage`, {
    actor: fid,
    body: { forceBId: raisedB1.json.force.id, stanceA: "hold", stanceB: "hold" },
  });
  assert(baseline.json?.ok, `baseline engage ok (${baseline.json?.error})`);
  const baseA = baseline.json.powerA;
  const baseB = baseline.json.powerB;

  const commander = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs`, {
    actor: "gm",
    body: { name: "Marshal", raceId: "race_human" },
  });
  const commanderId = commander.json.npcs.find((n) => n.name === "Marshal").id;
  const posted = await call("POST", `/api/campaign/${campaign.id}/factions/${fid}/npcs/${commanderId}/posting`, {
    actor: fid,
    body: { kind: "commander", targetId: raisedA2.json.force.id },
  });
  assert(posted.ok && posted.json.npcs.find((n) => n.id === commanderId).posting.kind === "commander", "player posted commander");

  const boosted = await call("POST", `/api/campaign/${campaign.id}/forces/${raisedA2.json.force.id}/engage`, {
    actor: fid,
    body: { forceBId: raisedB2.json.force.id, stanceA: "hold", stanceB: "hold" },
  });
  assert(boosted.json?.ok, `boosted engage ok (${boosted.json?.error})`);
  assert(
    boosted.json.powerA > baseA && boosted.json.powerA > boosted.json.powerB,
    `commander posting raises powerA ${baseA} → ${boosted.json.powerA} (powerB ${baseB} → ${boosted.json.powerB})`,
  );

  console.log("\nall court roster smoke checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
