import { useCallback } from "react";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import {
  canOpenStanceRing,
  contactStrikeFromPreview,
  myEngagementSide,
  type ContactMode,
  type ContactStrike,
} from "./contactStrike";

export type { ContactMode, ContactStrike };
export { canOpenStanceRing, contactStrikeFromPreview, myEngagementSide };

export type ContactStrikeSubmit = (strike: ContactStrike) => void;

export function useCombatEngagement(opts: {
  onSubmitContact: ContactStrikeSubmit;
}) {
  const { onSubmitContact } = opts;

  const contactBattlePreview = useViewerBattleSessionStore(
    (s) => s.contactBattlePreview,
  );
  const contactBattleBusy = useViewerBattleSessionStore(
    (s) => s.contactBattleBusy,
  );
  const contactBattleError = useViewerBattleSessionStore(
    (s) => s.contactBattleError,
  );
  const contactBattleResultEng = useViewerBattleSessionStore(
    (s) => s.contactBattleResultEng,
  );
  const setContactBattleBusy = useViewerBattleSessionStore(
    (s) => s.setContactBattleBusy,
  );
  const setContactBattleError = useViewerBattleSessionStore(
    (s) => s.setContactBattleError,
  );
  const clearContactBattle = useViewerBattleSessionStore(
    (s) => s.clearContactBattle,
  );
  const beginContactChooser = useViewerBattleSessionStore(
    (s) => s.beginContactChooser,
  );

  const closeContactBattle = useCallback(() => {
    clearContactBattle();
  }, [clearContactBattle]);

  const runContactBattleChoice = useCallback(
    (mode: ContactMode) => {
      if (!contactBattlePreview) return;
      const strike = contactStrikeFromPreview(contactBattlePreview, mode);
      if (!strike) {
        setContactBattleError("Нет цели для контакта");
        return;
      }
      setContactBattleBusy(true);
      setContactBattleError(null);
      onSubmitContact(strike);
    },
    [
      contactBattlePreview,
      onSubmitContact,
      setContactBattleBusy,
      setContactBattleError,
    ],
  );

  return {
    contactBattlePreview,
    contactBattleBusy,
    contactBattleError,
    contactBattleResultEng,
    beginContactChooser,
    closeContactBattle,
    runContactBattleChoice,
    canOpenStanceRing,
    myEngagementSide,
  };
}
