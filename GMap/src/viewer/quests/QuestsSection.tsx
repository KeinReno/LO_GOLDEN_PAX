import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ScrollText, Users } from "lucide-react";
import type { ViewerPayload } from "../../state/types";
import {
  adaptNpcTasks,
  adaptQuests,
  canAffordCosts,
  hasRolledPerTurn,
} from "./adaptQuest";
import { QuestSidebar } from "./QuestSidebar";
import { QuestStage } from "./QuestStage";
import { QuestChatPanel } from "./QuestChatPanel";
import {
  AttentionInbox,
  collectAttention,
} from "./AttentionInbox";
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
  onResolveChoice?: (
    questId: string,
    choiceId: string,
  ) => Promise<boolean | { ok: boolean; error?: string }>;
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
  /** Deep-link into the Court personnel room. */
  onOpenCourt?: () => void;
  /** Phone full-screen room — back to map from inbox. */
  onCloseMap?: () => void;
  /** Phone bottom sheet — single-pane navigation. */
  compact?: boolean;
};

export function QuestsSection({
  payload,
  actions,
  onFocusSystem,
  onSelectQuest,
  onOpenCourt,
  onCloseMap,
  compact = false,
}: QuestsSectionProps) {
  const activeQuestId = useQuestsState((s) => s.activeQuestId);
  const selectQuest = useQuestsState((s) => s.selectQuest);
  const clearQuest = useQuestsState((s) => s.clearQuest);
  const setMode = useQuestsState((s) => s.setMode);
  const chatOpen = useQuestsState((s) => s.chatOpen);
  const openChat = useQuestsState((s) => s.openChat);
  const closeChat = useQuestsState((s) => s.closeChat);
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

  useEffect(() => {
    setMode("quests");
  }, [setMode]);

  const quests = useMemo(
    () => adaptQuests(payload, logsByQuest),
    [payload, logsByQuest],
  );
  const npcTasks = useMemo(() => adaptNpcTasks(payload), [payload]);
  const turn = payload.world.meta?.turn ?? 0;
  const rolled = hasRolledPerTurn(payload.world, payload.factionId);

  const selected =
    activeQuestId != null
      ? (quests.find((q) => q.id === activeQuestId) ?? null)
      : null;

  const attentionCount = useMemo(
    () => collectAttention(quests, turn).length + (rolled ? 0 : 1),
    [quests, turn, rolled],
  );
  const courtBadge = npcTasks.filter(
    (t) => t.status === "working" || t.status === "done",
  ).length;

  useEffect(() => {
    if (droppingIds.length === 0) return;
    const t = window.setTimeout(() => clearDropping(), 1200);
    return () => window.clearTimeout(t);
  }, [droppingIds, clearDropping]);

  useEffect(() => {
    if (!actionMsg) return;
    const t = window.setTimeout(() => setActionMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [actionMsg]);

  const pick = (id: string) => {
    selectQuest(id);
    onSelectQuest?.(id);
    setStageDice(null);
  };

  const showInbox = () => {
    clearQuest();
  };

  const openJournal = (id: string) => {
    selectQuest(id);
    onSelectQuest?.(id);
    openChat();
  };

  const appendSystemLog = useCallback(
    (questId: string, text: string) => {
      const entry: QuestLogEntry = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        turn,
        author: "system",
        text,
        timestamp: new Date().toISOString(),
      };
      appendLog(questId, entry);
    },
    [turn, appendLog],
  );

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

  const stocks = payload.economy?.stocks;
  const choose = useCallback(
    async (choiceId: string) => {
      if (!selected || !actions?.onResolveChoice) return;
      setBusy(true);
      setActionMsg(null);
      const choice = selected.choices?.find((c) => c.id === choiceId);
      try {
        if (choice?.costs && !canAffordCosts(choice.costs, stocks)) {
          setActionMsg(
            choice.costLabel
              ? `Не хватает ресурсов: ${choice.costLabel}`
              : "Недостаточно ресурсов для этого выбора",
          );
          return;
        }
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
        const res = await actions.onResolveChoice(selected.id, choiceId);
        const ok = typeof res === "boolean" ? res : res.ok;
        if (ok) {
          appendSystemLog(
            selected.id,
            choice?.resultText || `Выбор: ${choice?.label ?? choiceId}`,
          );
        } else {
          setActionMsg(
            typeof res === "object" && res.error
              ? res.error
              : "Выбор не применён",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [selected, actions, stocks, appendSystemLog],
  );

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
      if (e.key === "Escape" && chatOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeChat();
        return;
      }
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
        e.stopImmediatePropagation();
        void choose(choices[n - 1]!.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected, choose, chatOpen, closeChat]);

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

  const rightOpen = chatOpen;

  const diceOverlayUi = (
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
  );

  if (compact) {
    const screen =
      chatOpen && selected ? "chat" : selected ? "detail" : "inbox";
    const goBack = () => {
      if (screen === "chat") closeChat();
      else if (screen === "detail") showInbox();
      else onCloseMap?.();
    };

    return (
      <div className={`quests-mobile quests-mobile--${screen}`}>
        <header className="quests-mobile__bar">
          <button
            type="button"
            className="quests-mobile__back"
            onClick={goBack}
            aria-label={
              screen === "inbox" ? "Назад к карте" : "Назад"
            }
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          </button>
          <div className="quests-mobile__titles">
            <strong>
              {screen === "inbox"
                ? "Квесты"
                : screen === "chat"
                  ? "Журнал"
                  : (selected?.title ?? "Квест")}
            </strong>
            {screen === "inbox" && (
              <span className="hint">ход {turn}</span>
            )}
          </div>
          {screen === "inbox" && onOpenCourt ? (
            <button
              type="button"
              className="quests-mobile__action"
              onClick={onOpenCourt}
            >
              <Users size={16} aria-hidden />
              Двор
              {courtBadge > 0 ? (
                <span className="quest-group-count">{courtBadge}</span>
              ) : null}
            </button>
          ) : null}
          {screen === "detail" && selected ? (
            <button
              type="button"
              className="quests-mobile__action"
              onClick={() => openJournal(selected.id)}
            >
              Чат
            </button>
          ) : null}
        </header>

        {actionMsg ? (
          <p className="quest-action-msg quests-mobile__msg" role="status">
            {actionMsg}
          </p>
        ) : null}

        <div className="quests-mobile__body">
          {screen === "inbox" ? (
            <AttentionInbox
              quests={quests}
              npcTasks={npcTasks}
              turn={turn}
              perTurnRolled={rolled}
              perTurnBusy={perTurnBusy}
              onRollPerTurn={() => void rollPerTurn()}
              onSelectQuest={pick}
              onOpenCourt={() => onOpenCourt?.()}
              onOpenJournal={openJournal}
              onFocusSystem={onFocusSystem}
              showCourtLink={false}
            />
          ) : null}
          {screen === "detail" && selected ? (
            <QuestStage
              quest={selected}
              busy={busy}
              chatOpen={chatOpen}
              compact
              stocks={payload.economy?.stocks}
              onChoose={(id) => void choose(id)}
              onRollDice={() => void rollGm()}
              onOpenChat={() => openJournal(selected.id)}
              onFocusSystem={onFocusSystem}
              onOpenCourt={onOpenCourt}
              dicePreview={stageDice}
              onDiceSettled={() =>
                setStageDice((d) => (d ? { ...d, rolling: false } : d))
              }
            />
          ) : null}
          {screen === "chat" && selected ? (
            <QuestChatPanel
              quest={selected}
              open
              embedded
              onClose={closeChat}
              onSend={(t) => void sendChat(t)}
            />
          ) : null}
        </div>

        {diceOverlayUi}
      </div>
    );
  }

  return (
    <section
      className={[
        "quests-table",
        compact ? "quests-table--mobile" : "",
        compact && selected ? "quests-table--mobile-detail" : "",
        !compact && sidebarCollapsed ? "is-rail-collapsed" : "",
        rightOpen ? "is-dock-open" : "",
        chatOpen ? "is-chat-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!compact && (
        <QuestSidebar
          quests={quests}
          activeQuestId={selected?.id ?? null}
          onSelect={pick}
          onShowInbox={showInbox}
          onRollPerTurn={() => void rollPerTurn()}
          perTurnRolled={rolled}
          perTurnBusy={perTurnBusy}
          droppingIds={droppingIds}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          attentionCount={attentionCount}
        />
      )}

      <div className="quests-table__center">
        {compact && selected ? (
          <header className="quests-table__mobile-head">
            <button
              type="button"
              className="btn ghost sm quests-table__back"
              onClick={showInbox}
            >
              ← Обзор
            </button>
            <strong className="quests-table__mobile-title">{selected.title}</strong>
            {chatOpen ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={closeChat}
              >
                Закрыть чат
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => openJournal(selected.id)}
              >
                Чат
              </button>
            )}
          </header>
        ) : (
          <nav className="quests-table__modes" aria-label="Режим квестов">
            <button
              type="button"
              className="quests-table__mode is-active"
              aria-current="page"
            >
              <ScrollText size={14} aria-hidden />
              Квесты
              {attentionCount > 0 ? (
                <span className="quest-group-count">{attentionCount}</span>
              ) : null}
            </button>
            {onOpenCourt ? (
              <button
                type="button"
                className="quests-table__mode"
                onClick={onOpenCourt}
              >
                <Users size={14} aria-hidden />
                Двор
                {courtBadge > 0 ? (
                  <span className="quest-group-count">{courtBadge}</span>
                ) : null}
              </button>
            ) : null}
          </nav>
        )}

        {actionMsg ? (
          <p className="quest-action-msg" role="status">
            {actionMsg}
          </p>
        ) : null}

        {!(compact && chatOpen) &&
          (selected ? (
            <div className="quests-table__stage">
              {!compact && (
                <button
                  type="button"
                  className="btn ghost sm quests-table__back"
                  onClick={showInbox}
                >
                  ← Обзор хода
                </button>
              )}
              <QuestStage
                quest={selected}
                busy={busy}
                chatOpen={chatOpen}
                stocks={payload.economy?.stocks}
                onChoose={(id) => void choose(id)}
                onRollDice={() => void rollGm()}
                onOpenChat={() => {
                  openJournal(selected.id);
                }}
                onFocusSystem={onFocusSystem}
                onOpenCourt={onOpenCourt}
                dicePreview={stageDice}
                onDiceSettled={() =>
                  setStageDice((d) => (d ? { ...d, rolling: false } : d))
                }
              />
            </div>
          ) : (
            <AttentionInbox
              quests={quests}
              npcTasks={npcTasks}
              turn={turn}
              perTurnRolled={rolled}
              perTurnBusy={perTurnBusy}
              onRollPerTurn={() => void rollPerTurn()}
              onSelectQuest={pick}
              onOpenCourt={() => onOpenCourt?.()}
              onOpenJournal={openJournal}
              onFocusSystem={onFocusSystem}
              showCourtLink={false}
            />
          ))}
      </div>

      <div className="quests-table__dock" aria-hidden={!rightOpen}>
        {selected && rightOpen ? (
          <QuestChatPanel
            quest={selected}
            open={chatOpen}
            onClose={closeChat}
            onSend={(t) => void sendChat(t)}
          />
        ) : null}
      </div>

      {diceOverlayUi}
    </section>
  );
}
