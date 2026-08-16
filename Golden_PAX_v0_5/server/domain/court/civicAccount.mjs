/**
 * A faction's civic-path progress. Ported from the civic-related fields
 * of GMap/server/ledger.mjs's defaultFactionEco (civicScores, laws) —
 * split out like domain/economy/ledgerAccount.mjs and domain/tech/
 * techAccount.mjs note GMap bundles unrelated domains into one object.
 *
 * Note: GMap's civic "building" unlocks write to the *same*
 * `eco.unlockedProperties` list that domain/tech unlocks do (a tech and a
 * civic path can both grant "property X"). This port preserves that
 * sharing deliberately — civicPaths.mjs takes a tech account (see
 * domain/tech/techAccount.mjs) as an argument rather than duplicating an
 * unlockedProperties list here, so a property unlocked via civic progress
 * is visible to domain/tech's checks and vice versa, same as in GMap.
 */
export function defaultCivicAccount() {
  return { civicScores: { trade: 0, culture: 0 }, laws: [] };
}
