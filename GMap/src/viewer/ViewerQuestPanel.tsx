import { useMemo, useState } from "react";
import type { Quest, QuestType, ViewerPayload, WorldState } from "../state/types";
import { StatefulButton } from "../ui/StatefulButton";
import { DiceRoller } from "../ui/DiceRoller";
import { QuestDossier } from "./QuestDossier";

const STATUS_LABELS: Record<Quest["status"], string> = {
  active: "активен",
  done: "завершён",
  hidden: "скрыт",
  expired: "истёк",
};

const TYPE_GROUPS: { type: QuestType; label: string }[] = [
  { type: "main", label: "Основной сюжет" },
  { type: "side", label: "Сайды" },
  { type: "faction", label: "Фракционные" },
  { type: "foreign", label: "От других государств" },
  { type: "yearly", label: "Ежходные" },
];

export function visiblePlayerQuests(world: WorldState): Quest[] {
  return (world.quests ?? []).filter((q) => q.status !== "hidden");
}

function systemName(world: WorldState, id: string | null | undefined): string | null {
  if (!id) return null;
  const sys = world.systems.find((s) => s.id === id);
  return sys?.name ?? null;
}

function factionName(world: WorldState, id: string | null | undefined): string | null {
  if (!id) return null;
  const fac = world.factions.find((f) => f.id === id);
  return fac?.name ?? null;
}

function questType(q: Quest): QuestType {
  return q.type || "side";
}

function panelChoices(q: Quest) {
  if (q.arc?.stages?.length) {
    const stage = q.arc.stages[q.arc.currentStage] ?? q.arc.stages[0];
    if (stage?.choices?.length) return stage.choices;
  }
  return q.choices ?? [];
}

function panelDice(q: Quest) {
  if (q.diceRequired?.length) return q.diceRequired;
  const stage = q.arc?.stages?.[q.arc.currentStage];
  return stage?.diceRequired ?? [];
}

function hasRolledYearly(
  world: WorldState,
  factionId: string | undefined,
): boolean {
  if (!factionId) return true;
  const turn = world.meta?.turn ?? 0;
  return world.meta?.yearlyQuestRolls?.[factionId] === turn;
}

export type QuestActionHandlers = {
  onThrowYearlyDice?: () => Promise<{
    ok: boolean;
    roll?: number;
    message?: string;
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
  }>;
};

/** Player quest sidebar + history (A9). */
export function ViewerQuestPanel({
  payload,
  onSelectQuest,
  actions,
}: {
  payload: ViewerPayload;
  onSelectQuest: (questId: string) => void;
  actions?: QuestActionHandlers;
}) {
  const quests = useMemo(
    () => visiblePlayerQuests(payload.world),
    [payload.world],
  );
  const active = quests.filter((q) => q.status === "active");
  const [selectedId, setSelectedId] = useState<string | null>(
    active[0]?.id ?? null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [diceBusy, setDiceBusy] = useState(false);
  const [yearlyDice, setYearlyDice] = useState<{
    value: number;
    rolling: boolean;
    message?: string;
  } | null>(null);
  const [paneBusy, setPaneBusy] = useState(false);
  const [paneDice, setPaneDice] = useState<{
    value: number;
    rolling: boolean;
    message?: string;
  } | null>(null);

  const selected =
    quests.find((q) => q.id === selectedId) ??
    active[0] ??
    quests[0] ??
    null;

  const rolled = hasRolledYearly(payload.world, payload.factionId);
  const selectedChoices = selected ? panelChoices(selected) : [];
  const selectedDice = selected ? panelDice(selected) : [];

  const grouped = TYPE_GROUPS.map((g) => ({
    ...g,
    items: quests.filter((q) => questType(q) === g.type),
  })).filter((g) => g.items.length > 0);

  const throwYearly = async () => {
    if (!actions?.onThrowYearlyDice) return;
    setDiceBusy(true);
    const res = await actions.onThrowYearlyDice();
    setDiceBusy(false);
    if (!res.ok || res.roll == null) return;
    setYearlyDice({
      value: res.roll,
      rolling: true,
      message: res.message,
    });
  };

  return (
    <section className={`quest-panel-v2 ${sidebarOpen ? "is-open" : ""}`}>
      {!rolled && (
        <section className="quest-yearly-roll hq-card">
          <h3>Ежходный кубик</h3>
          <p className="hint">Бросьте 1d6 — столько событий появится в этом ходу.</p>
          {yearlyDice ? (
            <DiceRoller
              value={yearlyDice.value}
              rolling={yearlyDice.rolling}
              onSettled={() =>
                setYearlyDice((d) => (d ? { ...d, rolling: false } : d))
              }
            />
          ) : (
            <StatefulButton
              className="btn primary"
              busy={diceBusy}
              onClick={() => void throwYearly()}
            >
              Бросить кубик (1d6)
            </StatefulButton>
          )}
          {yearlyDice && !yearlyDice.rolling && yearlyDice.message && (
            <p className="dice-result-text" data-reveal>
              {yearlyDice.message}
            </p>
          )}
        </section>
      )}

      <div className="quest-split">
        <aside
          className={`quest-sidebar ${sidebarOpen ? "is-expanded" : ""}`}
          onMouseEnter={() => setSidebarOpen(true)}
        >
          <button
            type="button"
            className="quest-sidebar-toggle"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? "◂" : "▸"} Список
          </button>
          {grouped.length === 0 ? (
            <div className="hq-empty quest-empty">
              <p className="hint">
                Нет известных квестов. Бросьте ежходный кубик или ждите Сцену.
              </p>
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.type} className="quest-sidebar-group">
                <h4>{g.label}</h4>
                <ul className="quest-sidebar-list">
                  {g.items.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        className={`quest-sidebar-item ${
                          selected?.id === q.id ? "is-active" : ""
                        }`}
                        onClick={() => {
                          setSelectedId(q.id);
                          onSelectQuest(q.id);
                        }}
                      >
                        <span className="quest-sidebar-name">{q.name}</span>
                        <span className="hint">
                          {STATUS_LABELS[q.status]}
                          {systemName(
                            payload.world,
                            q.sourceSystemId ?? q.systemId,
                          )
                            ? ` · ${systemName(
                                payload.world,
                                q.sourceSystemId ?? q.systemId,
                              )}`
                            : ""}
                          {factionName(payload.world, q.sourceFactionId)
                            ? ` · ${factionName(payload.world, q.sourceFactionId)}`
                            : ""}
                          {q.type === "yearly" && q.status === "active"
                            ? " · 🎲"
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </aside>

        <div className="quest-history-pane">
          {selected ? (
            <>
              <header className="quest-history-head">
                <h3>{selected.name}</h3>
                <p className="quest-summary">{selected.summary}</p>
              </header>
              {selected.arc?.stages?.length ? (
                <ol className="quest-arc-stages" aria-label="Арка">
                  {selected.arc.stages.map((s, i) => (
                    <li
                      key={s.id}
                      className={
                        i === (selected.arc?.currentStage ?? 0)
                          ? "is-current"
                          : i < (selected.arc?.currentStage ?? 0)
                            ? "is-done"
                            : ""
                      }
                    >
                      <strong>{s.label}</strong>
                    </li>
                  ))}
                </ol>
              ) : null}

              <ol className="quest-timeline" aria-label="История">
                {(selected.history ?? []).length === 0 ? (
                  <li className="is-current">
                    <span className="quest-timeline-dot" aria-hidden />
                    <div>
                      <strong>Известно</strong>
                      <p className="hint">Записей ещё нет — откройте досье.</p>
                    </div>
                  </li>
                ) : (
                  (selected.history ?? []).map((h, i, arr) => (
                    <li
                      key={`${h.at}-${i}`}
                      className={i === arr.length - 1 ? "is-current" : "is-done"}
                    >
                      <span className="quest-timeline-dot" aria-hidden />
                      <div>
                        <strong>
                          ход {h.turn}
                          {h.kind ? ` · ${h.kind}` : ""}
                        </strong>
                        <p className="quest-summary">{h.body}</p>
                      </div>
                    </li>
                  ))
                )}
              </ol>

              {selected.status === "active" && selectedChoices.length > 0 && (
                <div className="quest-choice-preview">
                  <h4>Выбор</h4>
                  <div className="btn-col">
                    {selectedChoices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="btn sm ghost"
                        disabled={paneBusy || !actions?.onResolveChoice}
                        title={c.description}
                        onClick={() => {
                          if (!actions?.onResolveChoice) return;
                          if (c.diceRequired?.length) {
                            void (async () => {
                              setPaneBusy(true);
                              const res = await actions.onResolveDice?.(
                                selected.id,
                                0,
                                c.id,
                              );
                              setPaneBusy(false);
                              if (!res?.ok || res.rolls?.[0] == null) return;
                              setPaneDice({
                                value: res.rolls[0],
                                rolling: true,
                                message: res.message,
                              });
                            })();
                            return;
                          }
                          void (async () => {
                            setPaneBusy(true);
                            await actions.onResolveChoice?.(selected.id, c.id);
                            setPaneBusy(false);
                          })();
                        }}
                      >
                        {c.label}
                        {c.diceRequired?.length ? " · 🎲" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected.status === "active" &&
                selectedDice.length > 0 &&
                !selectedChoices.some((c) => c.diceRequired?.length) && (
                  <div className="quest-dice-block">
                    {paneDice ? (
                      <DiceRoller
                        value={paneDice.value}
                        rolling={paneDice.rolling}
                        onSettled={() =>
                          setPaneDice((d) =>
                            d ? { ...d, rolling: false } : d,
                          )
                        }
                      />
                    ) : (
                      <StatefulButton
                        className="btn primary sm"
                        busy={paneBusy}
                        disabled={!actions?.onResolveDice}
                        onClick={() => {
                          void (async () => {
                            setPaneBusy(true);
                            const res = await actions?.onResolveDice?.(
                              selected.id,
                              0,
                            );
                            setPaneBusy(false);
                            if (!res?.ok || res.rolls?.[0] == null) return;
                            setPaneDice({
                              value: res.rolls[0],
                              rolling: true,
                              message: res.message,
                            });
                          })();
                        }}
                      >
                        Бросить кубик
                      </StatefulButton>
                    )}
                    {paneDice && !paneDice.rolling && paneDice.message && (
                      <p className="dice-result-text" data-reveal>
                        {paneDice.message}
                      </p>
                    )}
                  </div>
                )}

              {paneDice && selectedChoices.some((c) => c.diceRequired?.length) && (
                <div className="quest-dice-block">
                  <DiceRoller
                    value={paneDice.value}
                    rolling={paneDice.rolling}
                    onSettled={() =>
                      setPaneDice((d) => (d ? { ...d, rolling: false } : d))
                    }
                  />
                  {paneDice && !paneDice.rolling && paneDice.message && (
                    <p className="dice-result-text" data-reveal>
                      {paneDice.message}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                className="btn primary sm"
                onClick={() => onSelectQuest(selected.id)}
              >
                Открыть досье
              </button>
            </>
          ) : (
            <p className="hint">Выберите квест слева.</p>
          )}
        </div>
      </div>
    </section>
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
