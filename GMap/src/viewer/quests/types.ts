/** UI quest model for the Quests card table (view = "quests"). */

export type QuestKind = "main" | "side" | "faction" | "foreign" | "perturn";
export type QuestStatus =
  | "offered"
  | "active"
  | "completed"
  | "failed"
  | "locked";

export interface QuestEffect {
  kind:
    | "resource"
    | "buff"
    | "debuff"
    | "population"
    | "army"
    | "fleet"
    | "loyalty";
  target?: string;
  value: number;
  durationTurns?: number;
}

export interface QuestChoice {
  id: string;
  label: string;
  hint?: string;
  effects?: QuestEffect[];
  resultText?: string;
  /** World choice needs a dice roll before resolve. */
  needsDice?: boolean;
  /** Stock spends required (currencyId → amount). */
  costs?: Record<string, number>;
  /** Short cost label for the choice card, e.g. "−6 bios". */
  costLabel?: string;
}

export interface DiceCheck {
  dice: number;
  dc?: number;
  modifier?: number;
  onSuccess?: { text: string; effects?: QuestEffect[] };
  onFail?: { text: string; effects?: QuestEffect[] };
  /** Index into world diceRequired when resolving via API. */
  specIndex?: number;
}

export interface QuestLogEntry {
  id: string;
  turn: number;
  author: "player" | "gm" | "npc" | "system";
  authorName?: string;
  text: string;
  timestamp: string;
  effects?: QuestEffect[];
}

export interface QuestObjective {
  id: string;
  text: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  kind: QuestKind;
  status: QuestStatus;
  giverFactionId?: string;
  giverFactionName?: string;
  giverSystemId?: string;
  systemId?: string;
  systemName?: string;
  arcId?: string;
  arcLabel?: string;
  stage?: number;
  stageCount?: number;
  stageLabels?: string[];
  narrative: boolean;
  hook: string;
  description: string;
  objectives?: QuestObjective[];
  choices?: QuestChoice[];
  diceCheck?: DiceCheck;
  reward?: Record<string, number>;
  secret?: boolean;
  tags?: string[];
  log?: QuestLogEntry[];
  artUrl?: string;
  expiresTurn?: number | null;
}

export interface NpcTaskView {
  id: string;
  npcId: string;
  npcName: string;
  title?: string;
  role?: string;
  avatarUrl?: string | null;
  project: string;
  progress: number;
  status: "idle" | "working" | "done";
  assignedTurn?: number;
  etaTurn?: number;
}

export const QUEST_KIND_META: Record<
  QuestKind,
  { label: string; icon: string }
> = {
  main: { label: "Основной сюжет", icon: "📜" },
  side: { label: "Сайд-квесты", icon: "⭐" },
  faction: { label: "Фракционные", icon: "🏛" },
  foreign: { label: "От других держав", icon: "🌐" },
  perturn: { label: "Ежеходные", icon: "🎲" },
};

export const QUEST_STATUS_LABEL: Record<QuestStatus, string> = {
  offered: "предложен",
  active: "активен",
  completed: "завершён",
  failed: "провал",
  locked: "закрыт",
};

export const KIND_ORDER: QuestKind[] = [
  "main",
  "side",
  "faction",
  "foreign",
  "perturn",
];

export const QUEST_ART_BY_KIND: Record<QuestKind, string> = {
  main: "/icons/game/crystal-ball.svg",
  side: "/icons/game/comet.svg",
  faction: "/icons/game/banner.svg",
  foreign: "/icons/game/portal.svg",
  perturn: "/icons/game/star-flare.svg",
};
