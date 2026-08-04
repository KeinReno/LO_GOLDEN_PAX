import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Dices, Users } from "lucide-react";
import { StatefulButton } from "../../ui/StatefulButton";
import type { NpcTaskView, Quest, QuestKind } from "./types";
import {
  KIND_ORDER,
  QUEST_KIND_META,
  QUEST_STATUS_LABEL,
} from "./types";

export type QuestSidebarProps = {
  quests: Quest[];
  activeQuestId: string | null;
  onSelect: (id: string) => void;
  onRollPerTurn: () => void;
  onOpenNpc: () => void;
  npcTasks: NpcTaskView[];
  perTurnRolled?: boolean;
  perTurnBusy?: boolean;
  droppingIds?: string[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

type ArcBucket = {
  arcId: string;
  label: string;
  items: Quest[];
};

function groupByKind(quests: Quest[]): { kind: QuestKind; items: Quest[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    items: quests.filter((q) => q.kind === kind),
  })).filter((g) => g.items.length > 0 || g.kind === "perturn");
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
    quest.giverFactionName || quest.systemName || quest.giverSystemId || "";
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
  onRollPerTurn,
  onOpenNpc,
  npcTasks,
  perTurnRolled = false,
  perTurnBusy = false,
  droppingIds = [],
  collapsed = false,
  onToggleCollapse,
}: QuestSidebarProps) {
  const groups = useMemo(() => groupByKind(quests), [quests]);
  const [openKinds, setOpenKinds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(KIND_ORDER.map((k) => [k, true])),
  );

  const workingNpc = npcTasks.filter((t) => t.status === "working").length;

  if (collapsed) {
    return (
      <aside className="quest-rail quest-rail--collapsed" aria-label="Квесты">
        <button
          type="button"
          className="quest-rail__expand"
          onClick={onToggleCollapse}
          aria-expanded={false}
          title="Список квестов"
        >
          ▸
        </button>
        {!perTurnRolled ? (
          <button
            type="button"
            className="quest-rail__expand quest-rail__expand--dice"
            onClick={onRollPerTurn}
            disabled={perTurnBusy}
            title="Ежеходный кубик"
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
        <h3>Квесты</h3>
        {onToggleCollapse ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={onToggleCollapse}
            aria-expanded
          >
            ◂
          </button>
        ) : null}
      </header>

      {!perTurnRolled ? (
        <div className="quest-rail__dice-cta">
          <div>
            <strong>Ежеходный кубик</strong>
            <p className="hint">1d6 → столько событий упадёт в этот ход</p>
          </div>
          <StatefulButton
            className="btn primary sm"
            busy={perTurnBusy}
            onClick={onRollPerTurn}
          >
            <Dices size={14} aria-hidden /> Бросить
          </StatefulButton>
        </div>
      ) : (
        <p className="quest-rail__dice-done hint">Ежеходный кубик уже брошен</p>
      )}

      <div className="quest-rail__scroll">
        {groups.map(({ kind, items }) => {
          const meta = QUEST_KIND_META[kind];
          const open = openKinds[kind] !== false;
          const { loose, arcs } = nestArcs(items);
          return (
            <section key={kind} className="quest-rail__group">
              <div className="quest-rail__group-head">
                <button
                  type="button"
                  className="quest-rail__accordion"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenKinds((s) => ({ ...s, [kind]: !open }))
                  }
                >
                  <span aria-hidden>{meta.icon}</span>
                  <span>{meta.label}</span>
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
      </div>

      <footer className="quest-rail__foot">
        <button
          type="button"
          className="btn block ghost quest-rail__npc-btn"
          onClick={onOpenNpc}
        >
          <Users size={14} aria-hidden />
          Двор и поручения
          {workingNpc > 0 ? (
            <span className="quest-group-count">{workingNpc}</span>
          ) : null}
        </button>
      </footer>
    </aside>
  );
}
