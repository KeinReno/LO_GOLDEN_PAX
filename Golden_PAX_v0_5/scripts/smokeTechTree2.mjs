/**
 * Live HTTP check for Tech Tree 2.0 (agent-tasks/TECH_TREE_2_INTEGRATION_SPEC.md).
 * P0 grades, P1 sockets (upkeep-category swap, not persist-only), P3
 * offers/reroll/bypass billing, P5a tech-gated raise, P5c combat_role_mult.
 *
 * Race-weight live check skipped: offer candidate sets are RNG and need
 * many rolls to differ; techOffers.test.mjs already covers distribution.
 *
 * Usage: node server/serve.mjs  (other terminal) then:
 *        node scripts/smokeTechTree2.mjs
 */
import { createSmokeClient, assert } from "./smokeHttp.mjs";
import { getContent } from "../server/contentLoader.mjs";
import { OFFER_BYPASS_COGNITIO_MULT } from "../server/domain/tech/techOffers.mjs";

const { call, seatPlayer } = createSmokeClient();

function factionRow(state, factionId) {
  return state.factions.find((row) => row.faction.id === factionId);
}

function stocksOf(state, factionId) {
  return factionRow(state, factionId).economy.stocks;
}

function offerCandidateSet(techAccount) {
  const ids = new Set();
  for (const offer of Object.values(techAccount?.currentOffers || {})) {
    for (const id of offer.candidates || []) ids.add(id);
  }
  return ids;
}

function pickBypassTech(content, techAccount) {
  const inOffer = offerCandidateSet(techAccount);
  const unlocked = new Set(techAccount?.unlockedTechs || []);
  const pool = Object.values(content.technologies).filter((t) => {
    if (!t?.direction || t.catalogPending) return false;
    if (unlocked.has(t.id) || inOffer.has(t.id)) return false;
    const pres = t.prerequisites || [];
    return pres.every((p) => unlocked.has(p));
  });
  pool.sort(
    (a, b) =>
      Number(a.cost?.["currency.cognitio"] || 9999) - Number(b.cost?.["currency.cognitio"] || 9999),
  );
  const preferred = pool.find((t) => t.id === "tech.fixture.commerce_seed");
  return preferred || pool[0] || null;
}

/** GM turn overlay — same mergeIncome path playtest/turnCycle uses to seed stocks. */
async function ensureCognitio(campaignId, factionId, need) {
  const state = (await call("GET", `/api/campaign/${campaignId}/state`, { actor: "gm" })).json;
  const have = Number(stocksOf(state, factionId)["currency.cognitio"] ?? 0);
  if (have >= need) return have;
  const add = Math.ceil(need - have + 4);
  const tick = await call("POST", `/api/campaign/${campaignId}/turn`, {
    actor: "gm",
    body: { factionInputs: { [factionId]: { categoryIncome: { "currency.cognitio": add } } } },
  });
  assert(tick.ok, `GM cognitio top-up turn ok (${tick.status} ${tick.json?.error})`);
  const after = (await call("GET", `/api/campaign/${campaignId}/state`, { actor: "gm" })).json;
  const now = Number(stocksOf(after, factionId)["currency.cognitio"] ?? 0);
  assert(now >= need, `cognitio ${now} >= ${need} after GM economy overlay (+${add})`);
  return now;
}

async function main() {
  console.log("=== smoke Tech Tree 2.0 — grades, sockets, offers, military gate, 5c ===\n");

  const tag = Date.now().toString(36);
  const alpha = `tt2a.${tag}`;
  const bravo = `tt2b.${tag}`;
  const charlie = `tt2c.${tag}`;

  const campaign = (await call("POST", "/api/campaign", { actor: "gm", body: { name: `smoke-tt2-${tag}` } })).json;
  assert(campaign?.id, `campaign created (${campaign.id})`);

  for (const [id, name, race, color] of [
    [alpha, "Alpha", "race_human", "#2266cc"],
    [bravo, "Bravo", "race_human", "#cc3322"],
    [charlie, "Charlie", "race_human", "#22aa66"],
  ]) {
    const created = await call("POST", `/api/campaign/${campaign.id}/factions`, {
      actor: "gm",
      body: { id, name, raceId: race, colorHex: color },
    });
    assert(created.ok, `${name} faction created`);
    await seatPlayer(campaign.id, id);
  }

  for (const [sysId, owner, planetId, planetName] of [
    [`sys.${alpha}`, alpha, `${alpha}.home`, "Alpha I"],
    [`sys.${bravo}`, bravo, `${bravo}.home`, "Bravo I"],
    [`sys.${charlie}`, charlie, `${charlie}.home`, "Charlie I"],
  ]) {
    await call("POST", `/api/campaign/${campaign.id}/systems`, { actor: "gm", body: { id: sysId, name: sysId, ownerFactionId: owner } });
    await call("POST", `/api/campaign/${campaign.id}/systems/${sysId}/planets`, {
      actor: "gm",
      body: { id: planetId, name: planetName, type: "rocky", climate: "temperate" },
    });
    await call("POST", `/api/campaign/${campaign.id}/systems/${sysId}/planets/${planetId}/colonize`, {
      actor: owner,
      body: { colonyType: "core" },
    });
  }
  await call("POST", `/api/campaign/${campaign.id}/systems/sys.${charlie}/links`, {
    actor: "gm",
    body: { toSystemId: `sys.${bravo}`, type: "corridor" },
  });

  let state = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const industry = factionRow(state, alpha).tech.currentOffers.industry;
  assert(Array.isArray(industry?.candidates) && industry.candidates.length === 3, `industry offer has 3 candidates: ${JSON.stringify(industry?.candidates)}`);
  assert(
    industry.candidates.every((id) => !String(id).startsWith("tech.fixture.") && !String(id).includes("catalog")),
    `industry offer is backbone techs (${industry.candidates.join(", ")})`,
  );
  assert(industry.rerolled === false, "industry offer has not been rerolled yet");

  const reroll1 = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/tech/offers/industry/reroll`, { actor: alpha });
  assert(reroll1.json?.ok === true, `industry reroll ok (${JSON.stringify(reroll1.json?.error)})`);
  const afterReroll = reroll1.json.techAccount.currentOffers.industry;
  assert(afterReroll.rerolled === true, "reroll consumed the one-time flag");
  assert(JSON.stringify(afterReroll.candidates) !== JSON.stringify(industry.candidates), `reroll changed the set (${industry.candidates} → ${afterReroll.candidates})`);

  const reroll2 = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/tech/offers/industry/reroll`, { actor: alpha });
  assert(reroll2.json?.ok === false, `second reroll refused (${reroll2.json?.error})`);

  const content = getContent(["core"]);
  const cogn = stocksOf(state, alpha)["currency.cognitio"] ?? 0;
  const pick = [...afterReroll.candidates]
    .sort((a, b) => Number(content.technologies[a]?.cost?.["currency.cognitio"] || 9999) - Number(content.technologies[b]?.cost?.["currency.cognitio"] || 9999))
    .find((id) => Number(content.technologies[id]?.cost?.["currency.cognitio"] || 9999) <= cogn);
  assert(pick, `an affordable offer candidate exists (cogn=${cogn}, candidates=${afterReroll.candidates})`);
  const listedCost = Number(content.technologies[pick]?.cost?.["currency.cognitio"] || 0);
  const cognBeforeListed = Number(stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha)["currency.cognitio"] ?? 0);
  const researched = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/research`, {
    actor: alpha,
    body: { techId: pick },
  });
  assert(researched.json?.ok === true, `researched offer candidate ${pick} (${researched.json?.error})`);
  assert(researched.json.offerBypass !== true, "offer path was not billed as bypass");
  const listedSpend = cognBeforeListed - Number(researched.json.stocks["currency.cognitio"] ?? 0);
  assert(listedSpend === listedCost, `listed path spent ${listedSpend} = listed ${listedCost}`);
  const regen = researched.json.techAccount.currentOffers.industry;
  assert(!regen.candidates.includes(pick), `industry offer regenerated without ${pick}: ${regen.candidates}`);
  assert(regen.rerolled === false, "regenerated offer resets the reroll flag");

  const bypassDef = pickBypassTech(content, researched.json.techAccount);
  assert(bypassDef, `a directed tech exists outside current offers (commerce_seed in-offer=${offerCandidateSet(researched.json.techAccount).has("tech.fixture.commerce_seed")})`);
  const bypassListed = Number(bypassDef.cost?.["currency.cognitio"] || 0);
  const bypassExpected = Math.ceil(bypassListed * OFFER_BYPASS_COGNITIO_MULT);
  await ensureCognitio(campaign.id, alpha, bypassExpected + 16);
  const cognBeforeBypass = Number(stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha)["currency.cognitio"] ?? 0);
  const bypassed = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/research`, {
    actor: alpha,
    body: { techId: bypassDef.id },
  });
  assert(bypassed.json?.ok === true, `researched bypass ${bypassDef.id} (${bypassed.json?.error})`);
  assert(bypassed.json.offerBypass === true, `offerBypass === true for ${bypassDef.id}`);
  const bypassSpend = cognBeforeBypass - Number(bypassed.json.stocks["currency.cognitio"] ?? 0);
  assert(
    bypassSpend === bypassExpected,
    `bypass spent ${bypassSpend} = ceil(${bypassListed} * ${OFFER_BYPASS_COGNITIO_MULT}) = ${bypassExpected} (listed path was ${listedSpend})`,
  );

  const alphaMine = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${alpha}/planets/${alpha}.home/build`, {
    actor: alpha,
    body: { buildingId: "building.mine" },
  });
  assert(alphaMine.json?.ok === true, `alpha built a mine (${alphaMine.json?.error})`);

  // HTTP state has stocks, not the category flow grid. Proxy: same mine,
  // one turn before socket fill vs one turn after — D(energia) demand
  // drops and E(bios) demand rises only if swapUpkeepCurrency fired.
  const preSocketStocks = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha);
  const preTurn = await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  assert(preTurn.ok, "pre-socket turn ok");
  const afterPre = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha);
  const deltaEnergiaPre = (afterPre["currency.energia"] ?? 0) - (preSocketStocks["currency.energia"] ?? 0);
  const deltaBiosPre = (afterPre["currency.bios"] ?? 0) - (preSocketStocks["currency.bios"] ?? 0);

  const socketResearch = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/research`, {
    actor: alpha,
    body: { techId: "tech.fixture.socket_extractors" },
  });
  assert(socketResearch.json?.ok === true, `researched socket fixture (${socketResearch.json?.error})`);
  const filled = await call("POST", `/api/campaign/${campaign.id}/factions/${alpha}/tech/tech.fixture.socket_extractors/fill-socket`, {
    actor: alpha,
    body: { resourceId: "map.biofuel" },
  });
  assert(filled.json?.ok === true, `filled extractor socket with biofuel (${filled.json?.error})`);
  assert(filled.json.techAccount.techSockets["tech.fixture.socket_extractors"] === "map.biofuel", "persisted socket is map.biofuel");

  const postSocketStocks = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha);
  const postTurn = await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  assert(postTurn.ok, "post-socket turn ok");
  const afterPost = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, alpha);
  const deltaEnergiaPost = (afterPost["currency.energia"] ?? 0) - (postSocketStocks["currency.energia"] ?? 0);
  const deltaBiosPost = (afterPost["currency.bios"] ?? 0) - (postSocketStocks["currency.bios"] ?? 0);
  assert(
    deltaEnergiaPost > deltaEnergiaPre,
    `socket swap raised energia Δ ${deltaEnergiaPre} → ${deltaEnergiaPost} (less D upkeep)`,
  );
  assert(
    deltaBiosPost < deltaBiosPre,
    `socket swap lowered bios Δ ${deltaBiosPre} → ${deltaBiosPost} (more E upkeep)`,
  );

  const mine = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${bravo}/planets/${bravo}.home/build`, {
    actor: bravo,
    body: { buildingId: "building.mine" },
  });
  assert(mine.json?.ok === true, `bravo built a mine (${mine.json?.error})`);

  const graded = await call("POST", `/api/campaign/${campaign.id}/factions/${bravo}/research`, {
    actor: bravo,
    body: { techId: "tech.fixture.graded_extracta" },
  });
  assert(graded.json?.ok === true, `bravo researched graded fixture (${graded.json?.error})`);

  const extractaBefore = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, bravo)["currency.extracta"];
  await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  const afterG1 = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const deltaG1 = stocksOf(afterG1, bravo)["currency.extracta"] - extractaBefore;

  const up1 = await call("POST", `/api/campaign/${campaign.id}/factions/${bravo}/tech/tech.fixture.graded_extracta/upgrade-grade`, { actor: bravo });
  assert(up1.json?.ok === true && up1.json.techAccount.techGrades["tech.fixture.graded_extracta"] === 2, `grade 1→2 (${up1.json?.error})`);
  const up2 = await call("POST", `/api/campaign/${campaign.id}/factions/${bravo}/tech/tech.fixture.graded_extracta/upgrade-grade`, { actor: bravo });
  assert(up2.json?.ok === true && up2.json.techAccount.techGrades["tech.fixture.graded_extracta"] === 3, `grade 2→3 (${up2.json?.error})`);

  const extractaMid = stocksOf((await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json, bravo)["currency.extracta"];
  await call("POST", `/api/campaign/${campaign.id}/turn`, { actor: "gm", body: {} });
  const afterG3 = (await call("GET", `/api/campaign/${campaign.id}/state`, { actor: "gm" })).json;
  const deltaG3 = stocksOf(afterG3, bravo)["currency.extracta"] - extractaMid;
  assert(deltaG3 > deltaG1, `grade 3 extracta Δ ${deltaG3} > grade 1 Δ ${deltaG1}`);

  const barracks = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${charlie}/planets/${charlie}.home/build`, {
    actor: charlie,
    body: { buildingId: "building.barracks" },
  });
  assert(barracks.json?.ok === true, `charlie built barracks (${barracks.json?.error})`);

  const blocked = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${charlie}/planets/${charlie}.home/forces`, {
    actor: charlie,
    body: { defId: "unit.armor_cadre", kind: "unit", count: 1, name: "Cadre" },
  });
  assert(blocked.json?.ok === false, `armor cadre blocked pre-tech (${blocked.json?.error})`);
  assert(/tech|property/i.test(blocked.json?.error || ""), `block reason mentions tech/property: ${blocked.json?.error}`);

  const mil = await call("POST", `/api/campaign/${campaign.id}/factions/${charlie}/research`, {
    actor: charlie,
    body: { techId: "tech.fixture.military_unlock" },
  });
  assert(mil.json?.ok === true, `researched military unlock (${mil.json?.error})`);
  assert((mil.json.techAccount.unlockedProperties || []).includes("weapon.plasma"), "unlock_property weapon.plasma applied");

  const raised = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${charlie}/planets/${charlie}.home/forces`, {
    actor: charlie,
    body: { defId: "unit.armor_cadre", kind: "unit", count: 1, name: "Cadre" },
  });
  assert(raised.json?.ok === true, `armor cadre allowed after tech (${raised.json?.error})`);
  assert(raised.json.force.composition[0].roles[0] === "vehicle", `charlie cadre combat role is vehicle (${raised.json.force.composition[0].roles})`);

  const anti = await call("POST", `/api/campaign/${campaign.id}/factions/${charlie}/research`, {
    actor: charlie,
    body: { techId: "tech.fixture.anti_armor" },
  });
  assert(anti.json?.ok === true, `researched anti-armor fixture (${anti.json?.error})`);

  const bravoBarracks = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${bravo}/planets/${bravo}.home/build`, {
    actor: bravo,
    body: { buildingId: "building.barracks" },
  });
  assert(bravoBarracks.json?.ok === true, `bravo built barracks (${bravoBarracks.json?.error})`);
  await ensureCognitio(campaign.id, bravo, 16);
  const bravoMil = await call("POST", `/api/campaign/${campaign.id}/factions/${bravo}/research`, {
    actor: bravo,
    body: { techId: "tech.fixture.military_unlock" },
  });
  assert(bravoMil.json?.ok === true, `bravo researched military unlock (${bravoMil.json?.error})`);
  const bravoCadre = await call("POST", `/api/campaign/${campaign.id}/systems/sys.${bravo}/planets/${bravo}.home/forces`, {
    actor: bravo,
    body: { defId: "unit.armor_cadre", kind: "unit", count: 1, name: "Bravo Armor" },
  });
  assert(bravoCadre.json?.ok === true, `bravo raised armor cadre (${bravoCadre.json?.error})`);
  assert(bravoCadre.json.force.composition[0].roles[0] === "vehicle", `bravo cadre combat role is vehicle (${bravoCadre.json.force.composition[0].roles})`);
  const marched = await call("POST", `/api/campaign/${campaign.id}/forces/${bravoCadre.json.force.id}/move`, {
    actor: bravo,
    body: { toSystemId: `sys.${charlie}` },
  });
  assert(marched.json?.ok, `bravo cadre marched to charlie (${marched.json?.error})`);

  const engage = await call("POST", `/api/campaign/${campaign.id}/forces/${raised.json.force.id}/engage`, {
    actor: charlie,
    body: { forceBId: bravoCadre.json.force.id, stanceA: "hold", stanceB: "hold" },
  });
  assert(engage.status === 200 && engage.json?.ok === true, `anti-armor engage 200/ok (${engage.status} ${engage.json?.error})`);
  const ratio = engage.json.powerA / Math.max(1e-9, engage.json.powerB);
  assert(
    engage.json.powerA > engage.json.powerB && ratio >= 1.14 && ratio <= 1.16,
    `combat_role_mult vs vehicle: powerA ${engage.json.powerA} / powerB ${engage.json.powerB} = ${ratio.toFixed(4)} (~1.15)`,
  );

  console.log("\n=== Tech Tree 2.0 live check passed ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
