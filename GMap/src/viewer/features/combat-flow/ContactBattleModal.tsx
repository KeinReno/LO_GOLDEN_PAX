import { ContactBattleChooser } from "../../ContactBattleChooser";
import {
  useCombatEngagement,
  type ContactStrikeSubmit,
} from "./useCombatEngagement";

type Props = {
  onSubmitContact: ContactStrikeSubmit;
};

/** Contact chooser host — session via useViewerBattleSessionStore. */
export function ContactBattleModal({ onSubmitContact }: Props) {
  const {
    contactBattlePreview,
    contactBattleBusy,
    contactBattleError,
    contactBattleResultEng,
    closeContactBattle,
    runContactBattleChoice,
  } = useCombatEngagement({ onSubmitContact });

  if (!contactBattlePreview) return null;

  return (
    <ContactBattleChooser
      preview={contactBattlePreview}
      busy={contactBattleBusy}
      error={contactBattleError}
      resultEngagement={contactBattleResultEng}
      onCancel={closeContactBattle}
      onChooseAuto={() => runContactBattleChoice("auto")}
      onChooseCard={() => runContactBattleChoice("card")}
    />
  );
}
