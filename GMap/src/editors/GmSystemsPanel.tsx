/**
 * GmSystemsPanel — единая ГМ-панель для управления новыми системами (A1-A10).
 * Табы: Квесты · NPC · Дипломатия · Кубики · Обзор.
 * Все мутации идут через worldStore (client-side SoT в editor mode).
 */
import { useMemo, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { getCachedContent } from "../state/contentCatalog";
import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS } from "../state/defaults";
import { useSpotlight } from "../ui/aceternityFx";
import type {
  DiplomacyRelation,
  Faction,
  FactionNpc,
  NpcTask,
  Quest,
  QuestStatus,
  QuestType,
} from "../state/types";

type Tab = "quests" | "npc" | "diplo" | "dice" | "overview";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "quests", label: "Квесты", hint: "Создание, статусы, ежходные" },
  { id: "npc", label: "NPC", hint: "Поручения двора" },
  { id: "diplo", label: "Дипло", hint: "Отношения, договоры" },
  { id: "dice", label: "Кубики", hint: "Ad-hoc броски" },
  { id: "overview", label: "Обзор", hint: "Лояльность · снабжение · opinion" },
];

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: "активен",
  done: "завершён",
  hidden: "скрыт",
  expired: "истёк",
};

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  main: "Основной",
  side: "Сайд",
  faction: "Фракционный",
  foreign: "От державы",
  yearly: "Ежходный",
};

const DICE_PRESETS = [
  { sides: 4, label: "d4" },
  { sides: 6, label: "d6" },
  { sides: 10, label: "d10" },
  { sides: 20, label: "d20" },
  { sides: 100, label: "d100" },
];

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

function nowIso() {
  return new Date().toISOString();
}

export function GmSystemsPanel() {
  const [tab, setTab] = useState<Tab>("quests");
  const tabSpot = useSpotlight();
  return (
    <section className="panel gmsys-panel">
      <header className="panel-head">
        <div>
          <p className="panel-kicker">ГМ · системы</p>
          <h3>Управление миром</h3>
        </div>
      </header>
      <div className="gmsys-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`gmsys-tab fx-spotlight ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            title={t.hint}
            {...tabSpot.bind}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="gmsys-body">
        {tab === "quests" && <QuestsTab />}
        {tab === "npc" && <NpcTab />}
        {tab === "diplo" && <DiploTab />}
        {tab === "dice" && <DiceTab />}
        {tab === "overview" && <OverviewTab />}
      </div>
    </section>
  );
}

/* ───────────────────────── Квесты ───────────────────────── */

function QuestsTab() {
  const world = useWorldStore((s) => s.world);
  const upsertQuest = useWorldStore((s) => s.upsertQuest);
  const removeQuest = useWorldStore((s) => s.removeQuest);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const content = getCachedContent();
  const yearlyCatalog = content?.yearly_quests ?? {};
  const [filter, setFilter] = useState<QuestType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<Quest>>({
    name: "",
    summary: "",
    type: "side",
    systemId: null,
  });
  const [rollTarget, setRollTarget] = useState<string>(world.factions[0]?.id ?? "");
  const [rollResult, setRollResult] = useState<string | null>(null);

  const quests = useMemo(() => {
    const list = [...(world.quests ?? [])];
    return list.filter((q) => filter === "all" || (q.type || "side") === filter);
  }, [world.quests, filter]);

  const systems = world.systems;
  const sysName = (id: string | null) =>
    id ? systems.find((s) => s.id === id)?.name ?? id : "—";

  function patchQuest(q: Quest, patch: Partial<Quest>) {
    upsertQuest({ ...q, ...patch });
  }

  function createCustom() {
    if (!draft.name?.trim()) return;
    const q: Quest = {
      id: uid("quest"),
      name: draft.name.trim(),
      summary: draft.summary?.trim() || "",
      detail: "",
      systemId: draft.systemId ?? null,
      status: "active",
      type: (draft.type as QuestType) || "side",
      history: [
        { at: nowIso(), turn: world.meta.turn, kind: "message", body: "Создан ГМ" },
      ],
    };
    upsertQuest(q);
    setDraft({ name: "", summary: "", type: "side", systemId: null });
    setCreating(false);
  }

  function rollYearlyFor(factionId: string) {
    const fac = world.factions.find((f) => f.id === factionId);
    if (!fac) return;
    const catalog = Object.values(yearlyCatalog);
    if (!catalog.length) {
      setRollResult("Каталог ежходных квестов пуст");
      return;
    }
    const count = rollDie(6);
    const picked: Quest[] = [];
    const pool = [...catalog];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const def = pool.splice(idx, 1)[0];
      picked.push({
        id: uid("yquest"),
        name: def.name,
        summary: def.summary || "",
        detail: def.detail || "",
        systemId: null,
        status: "active",
        type: "yearly",
        sourceFactionId: factionId,
        catalogId: def.id,
        expiresTurn: world.meta.turn + 3,
        choices: def.choices,
        history: [
          {
            at: nowIso(),
            turn: world.meta.turn,
            kind: "message",
            body: `Брошен кубик ежходных: ${count}. Создано для ${fac.name}.`,
          },
        ],
      });
    }
    picked.forEach(upsertQuest);
    setRollResult(
      `Кубик = ${count} → создано ${picked.length} ежходных квестов для «${fac.name}»`,
    );
  }

  return (
    <div className="gmsys-quests">
      <div className="gmsys-toolbar">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as QuestType | "all")}
          className="gmsys-select"
        >
          <option value="all">Все типы ({world.quests?.length ?? 0})</option>
          {(Object.keys(QUEST_TYPE_LABELS) as QuestType[]).map((t) => (
            <option key={t} value={t}>
              {QUEST_TYPE_LABELS[t]} (
              {world.quests?.filter((q) => (q.type || "side") === t).length ?? 0})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn primary fx-moving-border"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "Отмена" : "+ Квест"}
        </button>
      </div>

      {creating && (
        <div className="gmsys-create">
          <input
            className="gmsys-input"
            placeholder="Название квеста"
            value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <textarea
            className="gmsys-input"
            placeholder="Краткое описание"
            rows={2}
            value={draft.summary ?? ""}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
          <div className="gmsys-row">
            <select
              className="gmsys-select"
              value={draft.type ?? "side"}
              onChange={(e) =>
                setDraft({ ...draft, type: e.target.value as QuestType })
              }
            >
              {(Object.keys(QUEST_TYPE_LABELS) as QuestType[]).map((t) => (
                <option key={t} value={t}>
                  {QUEST_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              className="gmsys-select"
              value={draft.systemId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, systemId: e.target.value || null })
              }
            >
              <option value="">Без системы</option>
              {systems.slice(0, 200).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn primary block fx-moving-border"
            onClick={createCustom}
            disabled={!draft.name?.trim()}
          >
            Создать
          </button>
        </div>
      )}

      <div className="gmsys-yearly">
        <p className="gmsys-subhead">Ежходные квесты (кубик)</p>
        <div className="gmsys-row">
          <select
            className="gmsys-select"
            value={rollTarget}
            onChange={(e) => setRollTarget(e.target.value)}
          >
            {world.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost fx-moving-border"
            onClick={() => rollYearlyFor(rollTarget)}
            disabled={!Object.keys(yearlyCatalog).length}
          >
            Бросить 1d6
          </button>
        </div>
        {rollResult && <p className="gmsys-roll-result">{rollResult}</p>}
        {!Object.keys(yearlyCatalog).length && (
          <p className="gmsys-hint">
            Каталог пуст — проверь content/core/yearly_quests.json
          </p>
        )}
      </div>

      <ul className="gmsys-list">
        {quests.map((q) => (
          <li key={q.id} className="gmsys-list-row">
            <div className="gmsys-list-main">
              <p className="gmsys-list-title">{q.name}</p>
              <p className="gmsys-list-meta">
                <span className={`gmsys-badge gmsys-badge--${q.type || "side"}`}>
                  {QUEST_TYPE_LABELS[q.type || "side"]}
                </span>
                <span className={`gmsys-status gmsys-status--${q.status}`}>
                  {QUEST_STATUS_LABELS[q.status]}
                </span>
                {q.systemId && (
                  <button
                    type="button"
                    className="gmsys-link"
                    onClick={() => focusCameraOnSystem(q.systemId!)}
                  >
                    {sysName(q.systemId)}
                  </button>
                )}
                {q.expiresTurn != null && (
                  <span className="gmsys-hint">истёк: ход {q.expiresTurn}</span>
                )}
              </p>
            </div>
            <div className="gmsys-list-actions">
              <select
                className="gmsys-select-sm"
                value={q.status}
                onChange={(e) =>
                  patchQuest(q, { status: e.target.value as QuestStatus })
                }
              >
                {(Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {QUEST_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="gmsys-input-sm"
                placeholder="истёк"
                value={q.expiresTurn ?? ""}
                onChange={(e) =>
                  patchQuest(q, {
                    expiresTurn:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => removeQuest(q.id)}
                title="Удалить"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {!quests.length && (
          <li className="gmsys-empty">Нет квестов в этой категории</li>
        )}
      </ul>
    </div>
  );
}

/* ───────────────────────── NPC ───────────────────────── */

function NpcTab() {
  const world = useWorldStore((s) => s.world);
  const updateFaction = useWorldStore((s) => s.updateFaction);
  const [taskDraft, setTaskDraft] = useState<
    Record<string, { label: string; eta: number; questId: string }>
  >({});

  const factionsWithNpcs = world.factions.filter((f) => (f.npcs || []).length > 0);
  const allNpcs = factionsWithNpcs.flatMap((f) =>
    (f.npcs || []).map((n) => ({ npc: n, faction: f })),
  );

  function draftFor(npcId: string) {
    return taskDraft[npcId] ?? { label: "", eta: 1, questId: "" };
  }
  function setDraftField(
    npcId: string,
    field: "label" | "eta" | "questId",
    value: string | number,
  ) {
    setTaskDraft((d) => ({
      ...d,
      [npcId]: { ...draftFor(npcId), [field]: value },
    }));
  }

  function setTask(faction: Faction, npc: FactionNpc) {
    const draft = taskDraft[npc.id];
    const label = (draft?.label ?? "").trim();
    if (!label) return;
    const task: NpcTask = {
      id: uid("task"),
      label,
      startedTurn: world.meta.turn,
      etaTurn: world.meta.turn + (draft?.eta ?? 1),
      progress: 0,
      linkedQuestId: draft?.questId || undefined,
    };
    const npcs = (faction.npcs || []).map((n) =>
      n.id === npc.id ? { ...n, currentTask: task } : n,
    );
    updateFaction(faction.id, { npcs });
    setTaskDraft((d) => ({ ...d, [npc.id]: { label: "", eta: 1, questId: "" } }));
  }

  function clearTask(faction: Faction, npc: FactionNpc) {
    const npcs = (faction.npcs || []).map((n) =>
      n.id === npc.id ? { ...n, currentTask: undefined } : n,
    );
    updateFaction(faction.id, { npcs });
  }

  return (
    <div className="gmsys-npc">
      <p className="gmsys-subhead">
        Двор ({allNpcs.length} NPC в {factionsWithNpcs.length} фракциях)
      </p>
      {!allNpcs.length && (
        <p className="gmsys-empty">
          Нет NPC. Добавляйте NPC фракциям через PolityEditor → Профиль.
        </p>
      )}
      <ul className="gmsys-list">
        {allNpcs.map(({ npc, faction }) => {
          const task = npc.currentTask;
          const linkedQuest = task?.linkedQuestId
            ? world.quests.find((q) => q.id === task.linkedQuestId)
            : null;
          return (
            <li key={npc.id} className="gmsys-list-row gmsys-npc-row">
              <div className="gmsys-list-main">
                <p className="gmsys-list-title">
                  {npc.name}
                  <span className="gmsys-hint"> · {faction.name}</span>
                </p>
                <p className="gmsys-list-meta">
                  {npc.title && <span>{npc.title}</span>}
                  {npc.role && (
                    <span className="gmsys-badge gmsys-badge--muted">
                      {npc.role}
                    </span>
                  )}
                </p>
                {task ? (
                  <div className="gmsys-task">
                    <p>
                      <strong>{task.label}</strong>
                    </p>
                    <p className="gmsys-hint">
                      ход {task.startedTurn} → {task.etaTurn}
                      {linkedQuest ? ` · квест: ${linkedQuest.name}` : ""}
                    </p>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => clearTask(faction, npc)}
                    >
                      Снять
                    </button>
                  </div>
                ) : (
                  <div className="gmsys-task-form">
                    <input
                      className="gmsys-input-sm"
                      placeholder="Поручение"
                      value={draftFor(npc.id).label}
                      onChange={(e) =>
                        setDraftField(npc.id, "label", e.target.value)
                      }
                    />
                    <input
                      type="number"
                      className="gmsys-input-sm gmsys-eta"
                      min={1}
                      value={draftFor(npc.id).eta}
                      onChange={(e) =>
                        setDraftField(npc.id, "eta", Number(e.target.value) || 1)
                      }
                      title="Ходов до завершения"
                    />
                    <select
                      className="gmsys-select-sm"
                      value={draftFor(npc.id).questId}
                      onChange={(e) =>
                        setDraftField(npc.id, "questId", e.target.value)
                      }
                      title="Связать с квестом"
                    >
                      <option value="">без квеста</option>
                      {world.quests
                        .filter((q) => q.status === "active")
                        .slice(0, 100)
                        .map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => setTask(faction, npc)}
                      disabled={!draftFor(npc.id).label.trim()}
                    >
                      Дать
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Дипломатия ───────────────────────── */

function DiploTab() {
  const world = useWorldStore((s) => s.world);
  const setDiplomacy = useWorldStore((s) => s.setDiplomacy);
  const [aId, setAId] = useState<string>(world.factions[0]?.id ?? "");
  const [bId, setBId] = useState<string>(world.factions[1]?.id ?? "");
  const [relation, setRelation] = useState<DiplomacyRelation>("neutral");

  const edges = world.diplomacy ?? [];
  const facName = (id: string) =>
    world.factions.find((f) => f.id === id)?.name ?? id;

  function apply() {
    if (!aId || !bId || aId === bId) return;
    setDiplomacy(aId, bId, relation);
  }

  return (
    <div className="gmsys-diplo">
      <div className="gmsys-diplo-form">
        <p className="gmsys-subhead">Установить отношение</p>
        <div className="gmsys-row">
          <select
            className="gmsys-select"
            value={aId}
            onChange={(e) => setAId(e.target.value)}
          >
            {world.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span className="gmsys-hint">↔</span>
          <select
            className="gmsys-select"
            value={bId}
            onChange={(e) => setBId(e.target.value)}
          >
            {world.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="gmsys-row">
          <select
            className="gmsys-select"
            value={relation}
            onChange={(e) =>
              setRelation(e.target.value as DiplomacyRelation)
            }
          >
            {DIPLOMACY_RELATIONS.map((r) => (
              <option key={r} value={r}>
                {DIPLOMACY_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary"
            onClick={apply}
            disabled={!aId || !bId || aId === bId}
          >
            Применить
          </button>
        </div>
      </div>

      <p className="gmsys-subhead">
        Активные отношения ({edges.length})
      </p>
      <ul className="gmsys-list">
        {edges.map((d) => (
          <li key={d.id} className="gmsys-list-row gmsys-diplo-row">
            <div className="gmsys-list-main">
              <p className="gmsys-list-title">
                {facName(d.aId)} ↔ {facName(d.bId)}
              </p>
              <p className="gmsys-list-meta">
                <span
                  className={`gmsys-badge gmsys-badge--rel gmsys-badge--${d.relation}`}
                >
                  {DIPLOMACY_LABELS[d.relation] ?? d.relation}
                </span>
              </p>
            </div>
            <div className="gmsys-list-actions">
              <select
                className="gmsys-select-sm"
                value={d.relation}
                onChange={(e) =>
                  setDiplomacy(d.aId, d.bId, e.target.value as DiplomacyRelation)
                }
              >
                {DIPLOMACY_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {DIPLOMACY_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setDiplomacy(d.aId, d.bId, "neutral")}
                title="Сбросить в нейтралитет"
              >
                ⟲
              </button>
            </div>
          </li>
        ))}
        {!edges.length && (
          <li className="gmsys-empty">Нет активных отношений</li>
        )}
      </ul>
    </div>
  );
}

/* ───────────────────────── Кубики ───────────────────────── */

type DiceRoll = {
  id: string;
  at: string;
  spec: { count: number; sides: number; label: string };
  rolls: number[];
  total: number;
  threshold?: number;
  success?: boolean;
  note?: string;
};

function DiceTab() {
  const [count, setCount] = useState(1);
  const [sides, setSides] = useState(20);
  const [threshold, setThreshold] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<DiceRoll[]>([]);

  function roll() {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
    const total = rolls.reduce((s, v) => s + v, 0);
    const thr = threshold === "" ? undefined : Number(threshold);
    const success = thr != null ? total >= thr : undefined;
    const entry: DiceRoll = {
      id: uid("roll"),
      at: nowIso(),
      spec: { count, sides, label: `${count}d${sides}` },
      rolls,
      total,
      threshold: thr,
      success,
      note: note.trim() || undefined,
    };
    setHistory((h) => [entry, ...h].slice(0, 30));
  }

  return (
    <div className="gmsys-dice">
      <p className="gmsys-subhead">Ad-hoc бросок</p>
      <div className="gmsys-dice-presets">
        {DICE_PRESETS.map((p) => (
          <button
            key={p.sides}
            type="button"
            className={`btn ghost sm ${sides === p.sides ? "active" : ""}`}
            onClick={() => setSides(p.sides)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="gmsys-row">
        <label className="gmsys-field">
          Кол-во
          <input
            type="number"
            className="gmsys-input-sm"
            min={1}
            max={20}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
            }
          />
        </label>
        <label className="gmsys-field">
          Граней
          <input
            type="number"
            className="gmsys-input-sm"
            min={2}
            max={100}
            value={sides}
            onChange={(e) =>
              setSides(Math.max(2, Math.min(100, Number(e.target.value) || 2)))
            }
          />
        </label>
        <label className="gmsys-field">
          Порог успеха
          <input
            type="number"
            className="gmsys-input-sm"
            placeholder="—"
            value={threshold}
            onChange={(e) =>
              setThreshold(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>
      </div>
      <input
        className="gmsys-input"
        placeholder="Заметка (почему бросок)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="btn primary block fx-moving-border" onClick={roll}>
        Бросить {count}d{sides}
      </button>

      <p className="gmsys-subhead">История ({history.length})</p>
      <ul className="gmsys-list gmsys-dice-history">
        {history.map((r) => (
          <li key={r.id} className="gmsys-list-row gmsys-dice-row">
            <div className="gmsys-list-main">
              <p className="gmsys-list-title">
                {r.spec.label} → <strong>{r.total}</strong>
                {r.success != null && (
                  <span
                    className={`gmsys-status ${r.success ? "gmsys-status--done" : "gmsys-status--expired"}`}
                  >
                    {r.success ? "успех" : "провал"}
                  </span>
                )}
              </p>
              <p className="gmsys-list-meta">
                <span className="gmsys-hint">
                  грани: {r.rolls.join(", ")}
                  {r.threshold != null ? ` · порог ${r.threshold}` : ""}
                </span>
              </p>
              {r.note && <p className="gmsys-hint">«{r.note}»</p>}
            </div>
          </li>
        ))}
        {!history.length && (
          <li className="gmsys-empty">Ещё не бросали</li>
        )}
      </ul>
    </div>
  );
}

/* ───────────────────────── Обзор ───────────────────────── */

function OverviewTab() {
  const world = useWorldStore((s) => s.world);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);

  const rows = useMemo(() => {
    return world.factions.map((f) => {
      const owned = world.systems.filter((s) => s.ownerFactionId === f.id);
      const planets = owned.flatMap((s) => s.planets || []);
      const inhabited = planets.filter((p) => (p.population || 0) > 0);
      const avgLoyalty = inhabited.length
        ? Math.round(
            inhabited.reduce((s, p) => s + (p.loyalty ?? 50), 0) /
              inhabited.length,
          )
        : null;
      const connected = owned.filter((s) => s.logistics?.connectedToCapital).length;
      const disconnected = owned.length - connected;
      const lowLoyalty = inhabited.filter((p) => (p.loyalty ?? 50) < 20);
      const opinions = Object.entries(f.diplomacy?.opinions ?? {});
      const enemies = opinions.filter(([, v]) => v <= -40).length;
      const friends = opinions.filter(([, v]) => v >= 40).length;
      return {
        faction: f,
        systems: owned.length,
        planets: inhabited.length,
        avgLoyalty,
        connected,
        disconnected,
        lowLoyaltyCount: lowLoyalty.length,
        lowLoyaltySystems: lowLoyalty
          .map((p) =>
            world.systems.find((s) => (s.planets || []).some((pp) => pp.id === p.id)),
          )
          .filter(Boolean),
        enemies,
        friends,
        traits: (f.traits || []).length,
        npcs: (f.npcs || []).length,
        busyNpcs: (f.npcs || []).filter((n) => n.currentTask).length,
      };
    });
  }, [world.factions, world.systems]);

  const totals = useMemo(() => {
    const t = { systems: 0, planets: 0, connected: 0, disconnected: 0, lowLoyalty: 0, traits: 0, npcs: 0, busyNpcs: 0 };
    for (const r of rows) {
      t.systems += r.systems;
      t.planets += r.planets;
      t.connected += r.connected;
      t.disconnected += r.disconnected;
      t.lowLoyalty += r.lowLoyaltyCount;
      t.traits += r.traits;
      t.npcs += r.npcs;
      t.busyNpcs += r.busyNpcs;
    }
    return t;
  }, [rows]);

  return (
    <div className="gmsys-overview">
      <div className="gmsys-stats">
        <div className="gmsys-stat">
          <span className="gmsys-stat-val">{totals.systems}</span>
          <span className="gmsys-stat-label">систем</span>
        </div>
        <div className="gmsys-stat">
          <span className="gmsys-stat-val">{totals.planets}</span>
          <span className="gmsys-stat-label">планет</span>
        </div>
        <div className="gmsys-stat gmsys-stat--ok">
          <span className="gmsys-stat-val">{totals.connected}</span>
          <span className="gmsys-stat-label">снабж.</span>
        </div>
        <div className="gmsys-stat gmsys-stat--warn">
          <span className="gmsys-stat-val">{totals.disconnected}</span>
          <span className="gmsys-stat-label">отрез.</span>
        </div>
        <div className="gmsys-stat gmsys-stat--bad">
          <span className="gmsys-stat-val">{totals.lowLoyalty}</span>
          <span className="gmsys-stat-label">бунт</span>
        </div>
        <div className="gmsys-stat">
          <span className="gmsys-stat-val">{totals.traits}</span>
          <span className="gmsys-stat-label">traits</span>
        </div>
        <div className="gmsys-stat">
          <span className="gmsys-stat-val">
            {totals.busyNpcs}/{totals.npcs}
          </span>
          <span className="gmsys-stat-label">NPC заняты</span>
        </div>
      </div>

      <ul className="gmsys-list gmsys-overview-list">
        {rows.map((r) => (
          <li key={r.faction.id} className="gmsys-list-row gmsys-overview-row">
            <div className="gmsys-list-main">
              <p className="gmsys-list-title">
                <span
                  className="gmsys-color-dot"
                  style={{ background: r.faction.color }}
                />
                {r.faction.name}
              </p>
              <p className="gmsys-list-meta">
                <span className="gmsys-hint">
                  {r.systems} систем · {r.planets} планет
                </span>
                {r.avgLoyalty != null && (
                  <span
                    className={`gmsys-badge ${r.avgLoyalty < 30 ? "gmsys-badge--bad" : r.avgLoyalty >= 60 ? "gmsys-badge--ok" : ""}`}
                  >
                    лоял. {r.avgLoyalty}
                  </span>
                )}
                {r.disconnected > 0 && (
                  <span className="gmsys-badge gmsys-badge--warn">
                    {r.disconnected} отрез.
                  </span>
                )}
                {r.lowLoyaltyCount > 0 && (
                  <span className="gmsys-badge gmsys-badge--bad">
                    {r.lowLoyaltyCount} бунт
                  </span>
                )}
                {r.enemies > 0 && (
                  <span className="gmsys-badge gmsys-badge--bad">
                    {r.enemies} врагов
                  </span>
                )}
                {r.friends > 0 && (
                  <span className="gmsys-badge gmsys-badge--ok">
                    {r.friends} союзн.
                  </span>
                )}
                {r.traits > 0 && (
                  <span className="gmsys-badge gmsys-badge--muted">
                    {r.traits} trait
                  </span>
                )}
                {r.busyNpcs > 0 && (
                  <span className="gmsys-badge gmsys-badge--muted">
                    {r.busyNpcs}/{r.npcs} NPC
                  </span>
                )}
              </p>
              {r.lowLoyaltySystems.length > 0 && (
                <p className="gmsys-hint">
                  Бунт:{" "}
                  {r.lowLoyaltySystems.slice(0, 4).map((s) => (
                    <button
                      key={s!.id}
                      type="button"
                      className="gmsys-link"
                      onClick={() => focusCameraOnSystem(s!.id)}
                    >
                      {s!.name}
                    </button>
                  ))}
                  {r.lowLoyaltySystems.length > 4 && " …"}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
