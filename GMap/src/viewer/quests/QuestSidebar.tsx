import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Dices, LayoutList } from "lucide-react";
import { StatefulButton } from "../../ui/StatefulButton";
import type { Quest, QuestKind } from "./types";
import {
  KIND_ORDER,
  QUEST_KIND_META,
  QUEST_STATUS_LABEL,
} from "./types";

export type QuestSidebarProps = {
  quests: Quest[];
  activeQuestId: string | null;
  onSelect: (id: string) => void;
  onShowInbox: () => void;
  /** Collapsed-rail shortcut only — main dice lives in AttentionInbox. */
  onRollPerTurn: () => void;
  perTurnRolled?: boolean;
  perTurnBusy?: boolean;
  droppingIds?: string[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  attentionCount?: number;
};

type ArcBucket = {
  arcId: string;
  label: string;
  items: Quest[];
};

function groupByKind(quests: Quest[]): { kind: QuestKind; items: Quest[] }[] {
  const live = quests.filter(
    (q) => q.status !== "completed" && q.status !== "failed",
  );
  return KIND_ORDER.map((kind) => ({
    kind,
    items: live.filter((q) => q.kind === kind),
  })).filter((g) => g.items.length > 0);
}

function nestArcs(items: Quest[]): { loose: Quest[]; arcs: ArcBucket[] } {
  const byArc = new Map<string, Quest[]>();
  const loose: Quest[] = [];
  for (const q of items) {
    if (!q.arcId) {
      loose.push(q);
      continue;
    }
    const list = byArc.get(q.arcId) ?? [];
    list.push(q);
    byArc.set(q.arcId, list);
  }
  const arcs: ArcBucket[] = [];
  for (const [arcId, list] of byArc) {
    if (list.length < 2) {
      loose.push(...list);
      continue;
    }
    arcs.push({
      arcId,
      label: list[0]?.arcLabel ?? "Арка",
      items: [...list].sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0)),
    });
  }
  return { loose, arcs };
}

function QuestRow({
  quest,
  active,
  dropping,
  onSelect,
}: {
  quest: Quest;
  active: boolean;
  dropping?: boolean;
  onSelect: (id: string) => void;
}) {
  const from =
    quest.giverFactionName || quest.giverNpcName || quest.systemName || "";
  const logCount = quest.log?.length ?? 0;
  return (
    <motion.li
      layout
      initial={dropping ? { y: -24, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      <button
        type="button"
        className={`quest-nav-item ${active ? "is-active" : ""} ${quest.narrative ? "is-narrative" : ""}`}
        onClick={() => onSelect(quest.id)}
      >
        <span
          className={`quest-status-dot quest-status-dot--${quest.status}`}
          title={QUEST_STATUS_LABEL[quest.status]}
          aria-hidden
        />
        <span className="quest-nav-item__body">
          <span className="quest-nav-item__title">
            {quest.secret ? "🔒 " : ""}
            {quest.title}
          </span>
          <span className="quest-nav-item__meta">
            {from ? <span className="hint">{from}</span> : null}
            {quest.narrative ? (
              <span className="quest-nav-item__journal" title="Есть журнал сюжета">
                <BookOpen size={11} aria-hidden />
                {logCount > 0 ? logCount : ""}
              </span>
            ) : logCount > 0 ? (
              <span className="quest-nav-item__journal hint" title="Записи истории">
                {logCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

export function QuestSidebar({
  quests,
  activeQuestId,
  onSelect,
  onShowInbox,
  onRollPerTurn,
  perTurnRolled = false,
  perTurnBusy = false,
  droppingIds = [],
  collapsed = false,
  onToggleCollapse,
  attentionCount = 0,
}: QuestSidebarProps) {
  const groups = useMemo(() => groupByKind(quests), [quests]);
  const done = useMemo(
    () =>
      quests.filter(
        (q) => q.status === "completed" || q.status === "failed",
      ),
    [quests],
  );
  const [openKinds, setOpenKinds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(KIND_ORDER.map((k) => [k, true])),
  );

  if (collapsed) {
    return (
      <aside className="quest-rail quest-rail--collapsed" aria-label="Квесты">
          <button
            type="button"
            className="quest-rail__expand"
            onClick={onToggleCollapse}
            aria-expanded={false}
            aria-label="Развернуть список квестов"
            title="Список квестов"
          >
          ▸
        </button>
          <button
            type="button"
            className="quest-rail__expand"
            onClick={onShowInbox}
            title="Обзор"
            aria-label="Обзор хода"
          >
          <LayoutList size={14} />
        </button>
        {!perTurnRolled ? (
          <button
            type="button"
            className="quest-rail__expand quest-rail__expand--dice"
            onClick={onRollPerTurn}
            disabled={perTurnBusy}
            title="Кубик хода"
            aria-label="Бросить кубик хода"
          >
            <Dices size={14} />
          </button>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="quest-rail" aria-label="Квесты">
      <header className="quest-rail__head">
        <h3>Журнал</h3>
        {onToggleCollapse ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={onToggleCollapse}
            aria-expanded
            aria-label="Свернуть список квестов"
          >
            ◂
          </button>
        ) : null}
      </header>

      <div className="quest-rail__inbox-link">
        <button
          type="button"
          className={`quest-nav-item ${activeQuestId == null ? "is-active" : ""}`}
          onClick={onShowInbox}
        >
          <LayoutList size={14} aria-hidden />
          <span className="quest-nav-item__body">
            <span className="quest-nav-item__title">Обзор хода</span>
            <span className="hint">
              {attentionCount > 0
                ? `${attentionCount} требуют внимания`
                : "Очередь решений"}
            </span>
          </span>
          {attentionCount > 0 ? (
            <span className="quest-group-count">{attentionCount}</span>
          ) : null}
        </button>
        {!perTurnRolled ? (
          <StatefulButton
            className="btn ghost sm quest-rail__dice-mini"
            busy={perTurnBusy}
            onClick={onRollPerTurn}
            title="Кубик хода"
            aria-label="Бросить кубик хода"
          >
            <Dices size={14} aria-hidden />
          </StatefulButton>
        ) : null}
      </div>

      <div className="quest-rail__scroll">
        {groups.map(({ kind, items }) => {
          const meta = QUEST_KIND_META[kind];
          const open = openKinds[kind] !== false;
          const { loose, arcs } = nestArcs(items);
          return (
            <section key={kind} className={`quest-rail__group quest-rail__group--${kind}`}>
              <div className="quest-rail__group-head">
                <button
                  type="button"
                  className="quest-rail__accordion"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenKinds((s) => ({ ...s, [kind]: !open }))
                  }
                >
                  <span className="quest-rail__kind-mark" aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="quest-rail__kind-label">{meta.label}</span>
                  <span className="quest-group-count">{items.length}</span>
                </button>
              </div>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="quest-rail__group-body"
                  >
                    {items.length === 0 ? (
                      <p className="hint quest-rail__empty">
                        {kind === "perturn"
                          ? "После броска события появятся здесь."
                          : "Пусто"}
                      </p>
                    ) : (
                      <>
                        {arcs.map((arc) => (
                          <div key={arc.arcId} className="quest-rail__arc">
                            <h5 className="quest-rail__arc-label">{arc.label}</h5>
                            <ul className="quest-rail__list">
                              {arc.items.map((q) => (
                                <QuestRow
                                  key={q.id}
                                  quest={q}
                                  active={q.id === activeQuestId}
                                  dropping={droppingIds.includes(q.id)}
                                  onSelect={onSelect}
                                />
                              ))}
                            </ul>
                          </div>
                        ))}
                        <ul className="quest-rail__list">
                          {loose.map((q) => (
                            <QuestRow
                              key={q.id}
                              quest={q}
                              active={q.id === activeQuestId}
                              dropping={droppingIds.includes(q.id)}
                              onSelect={onSelect}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          );
        })}
        {done.length > 0 ? (
          <section className="quest-rail__group quest-rail__group--done">
            <details className="quest-rail__done">
              <summary>
                Завершённые
                <span className="quest-group-count">{done.length}</span>
              </summary>
              <ul className="quest-rail__list">
                {done.map((q) => (
                  <QuestRow
                    key={q.id}
                    quest={q}
                    active={q.id === activeQuestId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </details>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
