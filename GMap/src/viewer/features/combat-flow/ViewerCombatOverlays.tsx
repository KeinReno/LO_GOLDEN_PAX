import { ContactBattleModal } from "./ContactBattleModal";
import type { ContactStrike } from "./useCombatEngagement";
import { myEngagementSide } from "./contactStrike";
import { pickActiveCardBattle } from "./cardBattlePick";
import { CardBattleTable } from "../../CardBattleTable";
import { EngagementStanceRing } from "../../EngagementStanceRing";
import type {
  CombatStanceId,
  ViewerEngagement,
} from "../../PlayerEngagementPanel";
import type { ViewerPayload } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";

type Props = {
  payload: ViewerPayload | null;
  password: string;
  onSubmitContact: (strike: ContactStrike) => void;
  onSubmitStance: (engagementId: string, stance: CombatStanceId) => void;
  onEngagementUpdated: (next: ViewerEngagement) => void;
};

export function ViewerCombatOverlays({
  payload,
  password,
  onSubmitContact,
  onSubmitStance,
  onEngagementUpdated,
}: Props) {
  const stanceRing = useViewerMapOverlayStore((s) => s.stanceRing);
  const setStanceRing = useViewerMapOverlayStore((s) => s.setStanceRing);
  const cardBattleId = useViewerBattleSessionStore((s) => s.cardBattleId);
  const cardBattleMinimized = useViewerBattleSessionStore(
    (s) => s.cardBattleMinimized,
  );
  const minimizeCardBattle = useViewerBattleSessionStore(
    (s) => s.minimizeCardBattle,
  );
  const stanceBusy = useViewerBattleSessionStore((s) => s.stanceBusy);
  const engagements = useViewerBattleSessionStore((s) => s.engagements);

  const eng = stanceRing
    ? engagements.find((e) => e.id === stanceRing.engagementId)
    : undefined;
  const mySide =
    payload && eng ? myEngagementSide(eng, payload.factionId) : undefined;
  const activeCard = payload
    ? pickActiveCardBattle(
        engagements,
        payload.factionId,
        cardBattleId,
        cardBattleMinimized,
      )
    : null;
  const factionNames = payload
    ? Object.fromEntries(payload.world.factions.map((f) => [f.id, f.name]))
    : {};

  return (
    <>
      <ContactBattleModal onSubmitContact={onSubmitContact} />
      {stanceRing && payload && (
        <EngagementStanceRing
          open
          x={stanceRing.x}
          y={stanceRing.y}
          engagementId={stanceRing.engagementId}
          currentStance={mySide?.stance}
          locked={!!mySide?.locked}
          busy={stanceBusy}
          onClose={() => setStanceRing(null)}
          onPickStance={(stance) => {
            onSubmitStance(stanceRing.engagementId, stance);
            setStanceRing(null);
          }}
        />
      )}
      {activeCard && payload && (
        <div className="cbt-overlay" role="dialog" aria-modal="true">
          <CardBattleTable
            engagement={activeCard}
            factionId={payload.factionId}
            password={password}
            factionNames={factionNames}
            busy={stanceBusy}
            onUpdated={onEngagementUpdated}
            onClose={() => minimizeCardBattle()}
          />
        </div>
      )}
    </>
  );
}
