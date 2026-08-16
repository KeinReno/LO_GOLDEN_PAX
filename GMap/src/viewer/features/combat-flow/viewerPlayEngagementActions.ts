import type { CombatStanceId } from "../../PlayerEngagementPanel";

/** Scout + stance + card-battle callbacks shared by sheet, HQ, overlays. */
export type ViewerPlayEngagementActions = {
  submitScoutReveal: (systemId: string) => unknown;
  submitCombatStance: (engId: string, stance: CombatStanceId) => unknown;
  openStanceRing: (
    engId: string,
    anchor: { clientX: number; clientY: number },
  ) => void;
  submitRequestCardBattle: (engId: string) => unknown;
  openCardBattle: (engId: string) => void;
};
