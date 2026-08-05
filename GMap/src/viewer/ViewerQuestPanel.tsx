import type { Quest, ViewerPayload, WorldState } from "../state/types";
import { QuestDossier } from "./QuestDossier";
import {
  QuestsSection,
  visiblePlayerQuests,
  type QuestActionHandlers,
} from "./quests";

export { visiblePlayerQuests, type QuestActionHandlers };
export { QuestsSection };

/** Player quest card table (A9 / QuestsSection). */
export function ViewerQuestPanel({
  payload,
  onSelectQuest,
  actions,
  onFocusSystem,
  onOpenCourt,
  onCloseMap,
  compact,
}: {
  payload: ViewerPayload;
  onSelectQuest?: (questId: string) => void;
  actions?: QuestActionHandlers;
  onFocusSystem?: (systemId: string) => void;
  onOpenCourt?: () => void;
  onCloseMap?: () => void;
  compact?: boolean;
}) {
  return (
    <QuestsSection
      payload={payload}
      actions={actions}
      onSelectQuest={onSelectQuest}
      onFocusSystem={onFocusSystem}
      onOpenCourt={onOpenCourt}
      onCloseMap={onCloseMap}
      compact={compact}
    />
  );
}

/** @deprecated Prefer QuestDossier — kept for ViewerPage import compat. */
export function ViewerQuestDossier({
  quest,
  world,
  onClose,
  onFocusSystem,
  onResolveChoice,
  onResolveDice,
}: {
  quest: Quest;
  world: WorldState;
  onClose: () => void;
  onFocusSystem?: (systemId: string) => void;
  onResolveChoice?: (questId: string, choiceId: string) => Promise<boolean>;
  onResolveDice?: (
    questId: string,
    specIndex: number,
    choiceId?: string,
  ) => Promise<{
    ok: boolean;
    rolls?: number[];
    success?: boolean | null;
    message?: string;
  }>;
}) {
  return (
    <QuestDossier
      quest={quest}
      world={world}
      onClose={onClose}
      onFocusSystem={onFocusSystem}
      onResolveChoice={onResolveChoice}
      onResolveDice={onResolveDice}
    />
  );
}
