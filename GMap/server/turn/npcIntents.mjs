import { journalPush } from "./journal.mjs";
import {
  applyRefugeeConvoy,
  applyGiveNpcTask,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
  applyAssignBlocLeader,
  applyAssignRaceLeader,
} from "../narrative.mjs";

export function applyRefugeeConvoyIntent(world, intent, journal) {
  return applyRefugeeConvoy(world, intent, journal);
}

// Thin re-exports used by APPLIERS (narrative owns the logic).
export {
  applyGiveNpcTask,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
  applyAssignBlocLeader,
  applyAssignRaceLeader,
};
