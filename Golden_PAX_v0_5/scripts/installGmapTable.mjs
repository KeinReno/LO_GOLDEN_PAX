/**
 * Wipe smoke leftover campaigns, import GMap/data/published.json if missing,
 * seat Белатор 4848 / Карнед 4849 on the real factions.
 *
 * Usage (from Golden_PAX_v0_5/): node scripts/installGmapTable.mjs
 */
import { getDb } from "../server/db/store.mjs";
import { loadContent } from "../server/contentLoader.mjs";
import { listCampaigns, listLoginCampaigns, pruneJunkCampaigns } from "../server/campaign/campaignStore.mjs";
import { findPlayerByPlainToken, mintPlayerToken, seatPlayerOnFaction } from "../server/campaign/playerStore.mjs";
import { loadPublishedGalaxy, migratePublishedGalaxy } from "./migrateGalaxy.mjs";

const SEATS = [
  { factionId: "faction_belator", pin: "4848", displayName: "Белатор" },
  { factionId: "faction_karned", pin: "4849", displayName: "Карнед" },
];

function findImportedGalaxy(db) {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(s.id) as systems
       FROM campaigns c
       LEFT JOIN systems s ON s.campaign_id = c.id
       GROUP BY c.id
       HAVING systems >= 500
       ORDER BY c.created_at DESC`,
    )
    .all()[0] || listCampaigns(db).find((c) => /GOLDEN PAX|GMap galaxy/i.test(c.name));
}

function seatPin(db, campaignId, { factionId, pin, displayName }) {
  const existing = findPlayerByPlainToken(db, pin);
  if (existing) {
    const seated = seatPlayerOnFaction(db, campaignId, factionId, existing.id);
    if (!seated.ok) throw new Error(`seat ${factionId}: ${seated.error}`);
    db.prepare("UPDATE players SET display_name = ? WHERE id = ?").run(displayName, existing.id);
    return { pin, factionId, playerId: existing.id, reused: true };
  }
  const minted = mintPlayerToken(db, campaignId, factionId, { token: pin, displayName });
  if (!minted.ok) throw new Error(`mint ${factionId}: ${minted.error}`);
  db.prepare("UPDATE factions SET is_npc = 0 WHERE campaign_id = ? AND id = ?").run(campaignId, factionId);
  return { pin, factionId, playerId: minted.playerId, reused: false };
}

const db = getDb();
const pruned = pruneJunkCampaigns(db);
console.log(`pruned ${pruned.length} junk campaigns`);

let galaxy = findImportedGalaxy(db);
if (!galaxy) {
  const content = loadContent(["core"]);
  const world = loadPublishedGalaxy();
  const result = migratePublishedGalaxy(db, world, content, {
    campaignName: world.meta?.name || "LO GOLDEN PAX — Центральный сектор (Сессия 2)",
  });
  galaxy = { id: result.persisted.campaign.id, name: result.persisted.campaign.name, systems: result.systemCount };
  console.log(`imported ${galaxy.systems} systems as ${galaxy.name}`);
} else {
  console.log(`already present: ${galaxy.name} (${galaxy.systems ?? "?"} systems)`);
}

for (const seat of SEATS) {
  const row = seatPin(db, galaxy.id, seat);
  console.log(`${seat.displayName}\t${row.pin}\t${row.factionId}\t${row.reused ? "reused" : "minted"}`);
}

console.log("login campaigns:");
for (const c of listLoginCampaigns(db)) console.log(`  ${c.name}`);
