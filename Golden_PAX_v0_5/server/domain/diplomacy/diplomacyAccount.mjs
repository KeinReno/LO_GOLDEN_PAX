/**
 * A faction's diplomacy state. Ported from GMap/server/opinionTick.mjs's
 * ensureFactionDiplomacy — reshaped from mutate-a-faction-object-in-place
 * to a standalone default value, matching this domain's convention.
 */
export function defaultDiplomacyAccount() {
  return { opinions: {}, treaties: [], history: [], lastBrokenTreatyTurn: null };
}
