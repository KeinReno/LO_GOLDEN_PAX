import { seedEconomyAccount } from "./economyStore.mjs";
import { seedTechAccount } from "./techStore.mjs";
import { seedCivicAccount } from "./civicStore.mjs";
import { seedDiplomacyAccount } from "./diplomacyStore.mjs";
import { seedCourtAccount } from "./npcStore.mjs";
import { seedStabilityAccount } from "./stabilityStore.mjs";
import { setFactionPeg } from "./campaignStore.mjs";

/** Initializes every domain's account row for a newly-added faction. */
export function seedFactionAccounts(db, campaignId, factionId, content) {
  seedEconomyAccount(db, campaignId, factionId, content);
  seedTechAccount(db, campaignId, factionId);
  seedCivicAccount(db, campaignId, factionId);
  seedDiplomacyAccount(db, campaignId, factionId);
  seedCourtAccount(db, campaignId, factionId, content);
  seedStabilityAccount(db, campaignId, factionId, content);
  const peg = content?.faction_currency_bindings?.bindings?.[factionId]?.treasuryPeg;
  if (peg) setFactionPeg(db, campaignId, factionId, peg, 0);
}
