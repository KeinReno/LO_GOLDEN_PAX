import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { Quest, QuestEffect, QuestLogEntry } from "./types";
import {
  QUEST_EFFECT_KIND_LABELS,
  resolveResourceOrCurrencyLabel,
} from "../../state/displayLabels";

export type QuestChatPanelProps = {
  quest: Quest;
  open: boolean;
  onClose: () => void;
  onSend: (text: string) => void | Promise<void>;
};

function EffectBadge({ effect }: { effect: QuestEffect }) {
  const sign = effect.value >= 0 ? "+" : "";
  const kindLabel = QUEST_EFFECT_KIND_LABELS[effect.kind] ?? effect.kind;
  const targetLabel = effect.target
    ? resolveResourceOrCurrencyLabel(effect.target)
    : null;
  const label =
    effect.kind === "resource"
      ? `${sign}${effect.value} ${targetLabel ?? "⬡"}`
      : `${sign}${effect.value} ${kindLabel}`;
  return (
    <span
      className={`quest-chat-fx ${effect.value >= 0 ? "is-pos" : "is-neg"}`}
    >
      {label}
    </span>
  );
}

function Bubble({ entry }: { entry: QuestLogEntry }) {
  const side = entry.author === "player" ? "right" : "left";
  const who =
    entry.authorName ||
    (entry.author === "player"
      ? "Вы"
      : entry.author === "gm"
        ? "GM"
        : entry.author === "npc"
          ? "NPC"
          : "Система");
  return (
    <div className={`quest-chat-bubble quest-chat-bubble--${side} quest-chat-bubble--${entry.author}`}>
      <header>
        <strong>{who}</strong>
        <span className="hint">ход {entry.turn}</span>
      </header>
      <p>{entry.text}</p>
      {entry.effects?.length ? (
        <div className="quest-chat-fx-row">
          {entry.effects.map((fx, i) => (
            <EffectBadge key={i} effect={fx} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuestChatPanel({
  quest,
  open,
  onClose,
  onSend,
}: QuestChatPanelProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const log = quest.log ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="chat"
          className="quest-chat-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          aria-label={`Чат квеста: ${quest.title}`}
        >
          <header className="quest-chat-panel__head">
            <div>
              <p className="dossier-kicker">
                {quest.narrative ? "Журнал сюжета" : "История квеста"}
              </p>
              <h3>{quest.title}</h3>
              <p className="hint">
                {quest.narrative
                  ? "Пишите поступок — ответ GM/агента попадёт сюда."
                  : "Хроника выборов и бросков. Обсуждение — у сюжетных арок."}
              </p>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              aria-label="Закрыть журнал"
            >
              <X size={16} />
            </button>
          </header>

          <div className="quest-chat-panel__log">
            {log.length === 0 ? (
              <div className="quest-chat-empty">
                <p className="hint">
                  {quest.narrative
                    ? "Нити сюжета ещё нет — опишите первый ход кампании."
                    : "Пока нет записей. Выборы и кубики появятся здесь."}
                </p>
              </div>
            ) : (
              log.map((e) => <Bubble key={e.id} entry={e} />)
            )}
            <div ref={endRef} />
          </div>

          <form className="quest-chat-panel__compose" onSubmit={(e) => void submit(e)}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                quest.narrative
                  ? "Ваш поступок в сюжете…"
                  : "Заметка / вопрос мастеру…"
              }
              aria-label="Сообщение"
              disabled={busy}
            />
            <button
              type="submit"
              className="btn primary sm"
              disabled={busy || !text.trim()}
            >
              Отправить
            </button>
          </form>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
