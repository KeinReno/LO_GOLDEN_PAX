/**
 * Seat tonight's PINs on the imported GMap table.
 * GM pin lives in data/master-token.txt (2142), not here.
 */
import { getDb } from "../server/db/store.mjs";
import { listLoginCampaigns, listFactions } from "../server/campaign/campaignStore.mjs";
import { findPlayerByPlainToken, mintPlayerToken, seatPlayerOnFaction } from "../server/campaign/playerStore.mjs";

const SEATS = [
  { factionId: "faction_belator", pin: "4848", displayName: "Белатор" },
  { factionId: "faction_karned", pin: "4849", displayName: "Карнед" },
];

const db = getDb();
const campaign = listLoginCampaigns(db)[0];
if (!campaign) {
  console.error("no table campaign — run node scripts/installGmapTable.mjs");
  process.exit(1);
}
const factions = listFactions(db, campaign.id);
for (const seat of SEATS) {
  if (!factions.some((f) => f.id === seat.factionId)) {
    console.error(`missing ${seat.factionId} in ${campaign.name}`);
    process.exit(1);
  }
  const existing = findPlayerByPlainToken(db, seat.pin);
  if (existing) {
    const seated = seatPlayerOnFaction(db, campaign.id, seat.factionId, existing.id);
    if (!seated.ok) {
      console.error(seated.error);
      process.exit(1);
    }
    db.prepare("UPDATE players SET display_name = ? WHERE id = ?").run(seat.displayName, existing.id);
  } else {
    const minted = mintPlayerToken(db, campaign.id, seat.factionId, {
      token: seat.pin,
      displayName: seat.displayName,
    });
    if (!minted.ok) {
      console.error(minted.error);
      process.exit(1);
    }
    db.prepare("UPDATE factions SET is_npc = 0 WHERE campaign_id = ? AND id = ?").run(campaign.id, seat.factionId);
  }
  console.log(`${seat.displayName}\t${seat.pin}\t${seat.factionId}`);
}
console.log(`campaign\t${campaign.name}\t${campaign.id}`);
