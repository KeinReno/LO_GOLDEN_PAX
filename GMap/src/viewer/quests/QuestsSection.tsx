import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ViewerPayload } from "../../state/types";
import {
  adaptNpcTasks,
  adaptQuests,
  hasRolledPerTurn,
} from "./adaptQuest";
import { QuestSidebar } from "./QuestSidebar";
import { QuestStage } from "./QuestStage";
import { QuestChatPanel } from "./QuestChatPanel";
import { NpcPanel } from "./NpcPanel";
import { StoryTracker } from "./StoryTracker";
import { QuestDiceRoller } from "./DiceRoller";
import { useQuestsState } from "./useQuestsState";
import type { QuestLogEntry } from "./types";

export type QuestActionHandlers = {
  onThrowYearlyDice?: () => Promise<{
    ok: boolean;
    roll?: number;
    message?: string;
    questIds?: string[];
    error?: string;
  }>;
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
    error?: string;
  }>;
  onGiveNpcTask?: (
    npcId: string,
    opts: { taskLabel: string; etaTurn: number; linkedQuestId?: string },
  ) => void | Promise<boolean | void>;
  onSendChat?: (questId: string, text: string) => void | Promise<void>;
};

export type QuestsSectionProps = {
  payload: ViewerPayload;
  actions?: QuestActionHandlers;
  onFocusSystem?: (systemId: string) => void;
  onSelectQuest?: (questId: string) => void;
};

export function QuestsSection({
  payload,
  actions,
  onFocusSystem,
  onSelectQuest,
}: QuestsSectionProps) {
  const activeQuestId = useQuestsState((s) => s.activeQuestId);
  const selectQuest = useQuestsState((s) => s.selectQuest);
  const chatOpen = useQuestsState((s) => s.chatOpen);
  const openChat = useQuestsState((s) => s.openChat);
  const closeChat = useQuestsState((s) => s.closeChat);
  const npcOpen = useQuestsState((s) => s.npcOpen);
  const openNpc = useQuestsState((s) => s.openNpc);
  const closeNpc = useQuestsState((s) => s.closeNpc);
  const sidebarCollapsed = useQuestsState((s) => s.sidebarCollapsed);
  const toggleSidebar = useQuestsState((s) => s.toggleSidebar);
  const droppingIds = useQuestsState((s) => s.droppingIds);
  const setDroppingIds = useQuestsState((s) => s.setDroppingIds);
  const clearDropping = useQuestsState((s) => s.clearDropping);
  const diceOverlay = useQuestsState((s) => s.diceOverlay);
  const showDice = useQuestsState((s) => s.showDice);
  const settleDice = useQuestsState((s) => s.settleDice);
  const clearDice = useQuestsState((s) => s.clearDice);
  const logsByQuest = useQuestsState((s) => s.logsByQuest);
  const appendLog = useQuestsState((s) => s.appendLog);
  const hydrateLogs = useQuestsState((s) => s.hydrateLogs);

  const [busy, setBusy] = useState(false);
  const [perTurnBusy, setPerTurnBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [stageDice, setStageDice] = useState<{
    value: number;
    rolling: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    hydrateLogs();
  }, [hydrateLogs]);

  const quests = useMemo(
    () => adaptQuests(payload, logsByQuest),
    [payload, logsByQuest],
  );
  const npcTasks = useMemo(() => adaptNpcTasks(payload), [payload]);
  const turn = payload.world.meta?.turn ?? 0;
  const rolled = hasRolledPerTurn(payload.world, payload.factionId);

  const selected =
    quests.find((q) => q.id === activeQuestId) ??
    quests.find((q) => q.status === "active") ??
    quests[0] ??
    null;

  useEffect(() => {
    if (!activeQuestId && selected) {
      selectQuest(selected.id);
    }
  }, [activeQuestId, selected, selectQuest]);

  useEffect(() => {
    if (droppingIds.length === 0) return;
    const t = window.setTimeout(() => clearDropping(), 1200);
    return () => window.clearTimeout(t);
  }, [droppingIds, clearDropping]);

  useEffect(() => {
    if (!actionMsg) return;
    const t = window.setTimeout(() => setActionMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMsg]);

  const pick = (id: string) => {
    selectQuest(id);
    onSelectQuest?.(id);
    setStageDice(null);
    closeNpc();
  };

  const openJournal = (id: string) => {
    selectQuest(id);
    onSelectQuest?.(id);
    openChat();
  };

  const appendSystemLog = (questId: string, text: string) => {
    const entry: QuestLogEntry = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      turn,
      author: "system",
      text,
      timestamp: new Date().toISOString(),
    };
    appendLog(questId, entry);
  };

  const rollPerTurn = async () => {
    if (perTurnBusy) return;
    if (!actions?.onThrowYearlyDice) {
      setActionMsg("Кубик недоступен: нет обработчика действия.");
      return;
    }
    if (rolled) {
      setActionMsg("Ежеходный кубик уже брошен в этом ходу.");
      return;
    }
    setPerTurnBusy(true);
    setActionMsg(null);
    try {
      const res = await actions.onThrowYearlyDice();
      if (!res.ok) {
        setActionMsg(res.error || "Не удалось бросить кубик.");
        return;
      }
      if (res.roll == null) {
        setActionMsg(res.message || "Сервер не вернул результат броска.");
        return;
      }
      showDice({
        value: res.roll,
        sides: 6,
        label: "Ежеходные",
        message: res.message,
      });
      setActionMsg(res.message || `Выпало ${res.roll}`);
      if (res.questIds?.length) setDroppingIds(res.questIds);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPerTurnBusy(false);
    }
  };

  const choose = async (choiceId: string) => {
    if (!selected || !actions?.onResolveChoice) return;
    setBusy(true);
    setActionMsg(null);
    const choice = selected.choices?.find((c) => c.id === choiceId);
    try {
      if (choice?.needsDice && actions.onResolveDice) {
        const res = await actions.onResolveDice(selected.id, 0, choiceId);
        if (!res.ok || res.rolls?.[0] == null) {
          setActionMsg(res.error || "Бросок не удался");
          return;
        }
        setStageDice({
          value: res.rolls[0],
          rolling: true,
          message: res.message,
        });
        appendSystemLog(selected.id, res.message || `Бросок: ${res.rolls[0]}`);
        return;
      }
      const ok = await actions.onResolveChoice(selected.id, choiceId);
      if (ok) {
        appendSystemLog(
          selected.id,
          choice?.resultText || `Выбор: ${choice?.label ?? choiceId}`,
        );
      } else {
        setActionMsg("Выбор не применён");
      }
    } finally {
      setBusy(false);
    }
  };

  const rollGm = async () => {
    if (!selected || !actions?.onResolveDice) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await actions.onResolveDice(
        selected.id,
        selected.diceCheck?.specIndex ?? 0,
      );
      if (!res.ok || res.rolls?.[0] == null) {
        setActionMsg(res.error || "Бросок не удался");
        return;
      }
      setStageDice({
        value: res.rolls[0],
        rolling: true,
        message: res.message,
      });
      appendSystemLog(selected.id, res.message || `Бросок: ${res.rolls[0]}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || selected.status !== "active") return;
      const choices = selected.choices ?? [];
      if (!choices.length) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) {
        e.preventDefault();
        void choose(choices[n - 1]!.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sendChat = async (text: string) => {
    if (!selected) return;
    const entry: QuestLogEntry = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      turn,
      author: "player",
      authorName: "Вы",
      text,
      timestamp: new Date().toISOString(),
    };
    appendLog(selected.id, entry);
    await actions?.onSendChat?.(selected.id, text);
  };

  const assignNpc = async (npcId: string, project: string) => {
    if (!actions?.onGiveNpcTask) return;
    await actions.onGiveNpcTask(npcId, {
      taskLabel: project,
      etaTurn: turn + 2,
      linkedQuestId: selected?.id,
    });
  };

  const rightOpen = chatOpen || npcOpen;

  return (
    <section
      className={[
        "quests-table",
        sidebarCollapsed ? "is-rail-collapsed" : "",
        rightOpen ? "is-dock-open" : "",
        chatOpen ? "is-chat-open" : "",
        npcOpen ? "is-npc-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <QuestSidebar
        quests={quests}
        activeQuestId={selected?.id ?? null}
        onSelect={pick}
        onRollPerTurn={() => void rollPerTurn()}
        onOpenNpc={openNpc}
        npcTasks={npcTasks}
        perTurnRolled={rolled}
        perTurnBusy={perTurnBusy}
        droppingIds={droppingIds}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <div className="quests-table__center">
        {actionMsg ? (
          <p className="quest-action-msg" role="status">
            {actionMsg}
          </p>
        ) : null}

        <StoryTracker
          quests={quests}
          activeQuestId={selected?.id ?? null}
          onSelect={pick}
          onOpenJournal={openJournal}
          onFocusSystem={onFocusSystem}
        />

        <div className="quests-table__stage">
          <QuestStage
            quest={selected}
            busy={busy}
            chatOpen={chatOpen}
            onChoose={(id) => void choose(id)}
            onRollDice={() => void rollGm()}
            onOpenChat={() => {
              if (selected) openJournal(selected.id);
              else openChat();
            }}
            onFocusSystem={onFocusSystem}
            dicePreview={stageDice}
            onDiceSettled={() =>
              setStageDice((d) => (d ? { ...d, rolling: false } : d))
            }
          />
        </div>
      </div>

      <div className="quests-table__dock" aria-hidden={!rightOpen}>
        {selected ? (
          <QuestChatPanel
            quest={selected}
            open={chatOpen}
            onClose={closeChat}
            onSend={(t) => void sendChat(t)}
          />
        ) : null}

        <NpcPanel
          open={npcOpen}
          onClose={closeNpc}
          tasks={npcTasks}
          turn={turn}
          onAssign={assignNpc}
        />
      </div>

      <AnimatePresence>
        {diceOverlay ? (
          <motion.div
            className="quest-dice-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            onClick={() => {
              if (!diceOverlay.rolling) clearDice();
            }}
          >
            <div
              className="quest-dice-overlay__card"
              onClick={(e) => e.stopPropagation()}
            >
              <QuestDiceRoller
                value={diceOverlay.value}
                sides={diceOverlay.sides}
                rolling={diceOverlay.rolling}
                label={diceOverlay.label}
                onSettled={() => {
                  settleDice();
                  window.setTimeout(() => clearDice(), 1200);
                }}
              />
              {!diceOverlay.rolling && diceOverlay.message ? (
                <p className="dice-result-text" data-reveal>
                  {diceOverlay.message}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
