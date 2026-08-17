/**
 * Player↔player diplomatic deal offers (pending inbox).
 * Accept applies resource swaps + optional relation/treaty change immediately.
 *
 * Thin re-export barrel — implementation lives in ./diploOffers/*.mjs.
 * Kept as the stable import path so existing `from "./diploOffers.mjs"`
 * call sites across the server don't need to change.
 */
export {
  DIPLO_OFFERS_PATH,
  MUTUAL_TREATIES,
  UNILATERAL_STANCES,
  readDiploOffers,
  writeDiploOffers,
  getDiploOffersForFaction,
  countIncomingDiploOffers,
} from "./diploOffers/helpers.mjs";
export { createDiploOffer } from "./diploOffers/createOffer.mjs";
export { applyUnilateralStance } from "./diploOffers/unilateralStance.mjs";
export { respondDiploOffer } from "./diploOffers/respond.mjs";
