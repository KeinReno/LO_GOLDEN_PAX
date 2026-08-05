import type { QuestType } from "../../../state/types";
import { useWorldStore } from "../../../state/worldStore";
import { useCampaignSessionCtx } from "../../CampaignSessionContext";
import { GmQuestChoiceEditor } from "./GmQuestChoiceEditor";
import { GmQuestCatalogShell } from "./GmQuestCatalogShell";
import {
  emptyStoryQuest,
  type StoryQuestDef,
} from "./questCatalogShared";

const QUEST_KINDS: { id: QuestType; label: string }[] = [
  { id: "main", label: "Основной сюжет" },
  { id: "side", label: "Побочный" },
  { id: "faction", label: "Фракционный" },
  { id: "foreign", label: "От державы" },
];

const COMPLETION_MODES = [
  { id: "choice", label: "Через выбор" },
  { id: "objectives", label: "По целям" },
  { id: "manual", label: "Вручную (ГМ закрывает)" },
  { id: "dice", label: "Через кубик на квесте" },
  { id: "auto", label: "Авто (инфо-квест)" },
] as const;

function StoryQuestForm({
  draft,
  setDraft,
  catalogKey,
}: {
  draft: StoryQuestDef;
  setDraft: (v: StoryQuestDef) => void;
  catalogKey: string | null;
}) {
  const world = useWorldStore((s) => s.world);
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const factions = world.factions;
  const systems = world.systems;
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();

  const spawn = async (factionId: string) => {
    if (!catalogKey) return;
    try {
      const res = await fetch("/api/gm/quests/spawn-catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          catalog: "story_quests",
          catalogId: catalogKey,
          factionId,
          systemId: draft.placement?.systemId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.world) loadWorld(data.world);
      setSyncMsg(`Квест выдан: ${data.quest?.name ?? catalogKey}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const audience = draft.audience || {};
  const placement = draft.placement || {};
  const completion = draft.completion || {};

  return (
    <div className="gm-quest-form">
      <div className="gm-form-grid">
        <label className="gm-form-field gm-form-field--wide">
          <span>Название</span>
          <input
            type="text"
            className="gm-form-input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="gm-form-field">
          <span>Тип</span>
          <select
            className="gm-form-input"
            value={draft.kind ?? "side"}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as QuestType })
            }
          >
            {QUEST_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gm-form-check">
          <input
            type="checkbox"
            checked={draft.narrative !== false}
            onChange={(e) => setDraft({ ...draft, narrative: e.target.checked })}
          />
          <span>Narrative (лore UI)</span>
        </label>
        <label className="gm-form-check">
          <input
            type="checkbox"
            checked={Boolean(draft.secret)}
            onChange={(e) => setDraft({ ...draft, secret: e.target.checked })}
          />
          <span>Секретный</span>
        </label>
      </div>

      <label className="gm-form-field">
        <span>Hook</span>
        <textarea
          className="gm-form-input"
          rows={2}
          value={draft.summary ?? ""}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
      </label>
      <label className="gm-form-field">
        <span>Полное описание</span>
        <textarea
          className="gm-form-input"
          rows={5}
          value={draft.detail ?? ""}
          onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
        />
      </label>

      <div className="gm-form-section">
        <p className="gm-form-section-label">Кому выдавать</p>
        <div className="gm-form-grid">
          <label className="gm-form-check">
            <input
              type="checkbox"
              checked={Boolean(audience.allFactions)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  audience: { ...audience, allFactions: e.target.checked },
                })
              }
            />
            <span>Всем игрокам</span>
          </label>
          <label className="gm-form-field">
            <span>Мин. эра</span>
            <input
              type="number"
              min={1}
              className="gm-form-input"
              value={audience.minEra ?? 1}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  audience: { ...audience, minEra: Number(e.target.value) },
                })
              }
            />
          </label>
        </div>
        {!audience.allFactions && (
          <div className="gm-form-chip-list">
            {factions.map((f) => {
              const ids = audience.factionIds || [];
              const on = ids.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`btn ghost gm-pill ${on ? "active" : ""}`}
                  onClick={() => {
                    const next = on
                      ? ids.filter((x) => x !== f.id)
                      : [...ids, f.id];
                    setDraft({
                      ...draft,
                      audience: { ...audience, factionIds: next },
                    });
                  }}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="gm-form-section">
        <p className="gm-form-section-label">Где на карте</p>
        <div className="gm-form-grid">
          <label className="gm-form-check">
            <input
              type="checkbox"
              checked={placement.onMap !== false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  placement: { ...placement, onMap: e.target.checked },
                })
              }
            />
            <span>Показывать на карте</span>
          </label>
          <label className="gm-form-field">
            <span>Привязка системы</span>
            <select
              className="gm-form-input"
              value={placement.systemPick ?? "random_owned"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  placement: {
                    ...placement,
                    systemPick: e.target.value as "random_owned" | "fixed" | "none",
                  },
                })
              }
            >
              <option value="random_owned">Случайная своя</option>
              <option value="fixed">Фиксированная</option>
              <option value="none">Без системы</option>
            </select>
          </label>
          {placement.systemPick === "fixed" && (
            <label className="gm-form-field gm-form-field--wide">
              <span>Система</span>
              <select
                className="gm-form-input"
                value={placement.systemId ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    placement: {
                      ...placement,
                      systemId: e.target.value || null,
                    },
                  })
                }
              >
                <option value="">— выберите —</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="gm-form-section">
        <p className="gm-form-section-label">Завершение</p>
        <div className="gm-form-grid">
          <label className="gm-form-field">
            <span>Режим</span>
            <select
              className="gm-form-input"
              value={completion.mode ?? "choice"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  completion: {
                    ...completion,
                    mode: e.target.value as NonNullable<
                      StoryQuestDef["completion"]
                    >["mode"],
                  },
                })
              }
            >
              {COMPLETION_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gm-form-field">
            <span>Срок (ходов)</span>
            <input
              type="number"
              min={0}
              className="gm-form-input"
              placeholder="бессрочно"
              value={completion.expiresTurns ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  completion: {
                    ...completion,
                    expiresTurns: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </label>
          <label className="gm-form-check">
            <input
              type="checkbox"
              checked={draft.hasChoices !== false}
              onChange={(e) =>
                setDraft({ ...draft, hasChoices: e.target.checked })
              }
            />
            <span>Есть выборы</span>
          </label>
        </div>
      </div>

      <label className="gm-form-field">
        <span>NPC-источник (id)</span>
        <input
          type="text"
          className="gm-form-input"
          placeholder="npc_bel_astra"
          value={draft.sourceNpcId ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              sourceNpcId: e.target.value || null,
            })
          }
        />
      </label>

      {draft.hasChoices !== false && (
        <GmQuestChoiceEditor
          choices={draft.choices || []}
          onChange={(choices) => setDraft({ ...draft, choices })}
        />
      )}

      {completion.mode === "objectives" && (
        <div className="gm-form-section">
          <p className="gm-form-section-label">Цели</p>
          {(draft.objectives || []).map((obj, i) => (
            <div key={obj.id || i} className="gm-form-inline">
              <input
                type="text"
                className="gm-form-input"
                value={obj.text}
                onChange={(e) => {
                  const objectives = [...(draft.objectives || [])];
                  objectives[i] = { ...obj, text: e.target.value };
                  setDraft({ ...draft, objectives });
                }}
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  setDraft({
                    ...draft,
                    objectives: (draft.objectives || []).filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setDraft({
                ...draft,
                objectives: [
                  ...(draft.objectives || []),
                  { id: `obj_${(draft.objectives?.length ?? 0) + 1}`, text: "Новая цель" },
                ],
              })
            }
          >
            + Цель
          </button>
        </div>
      )}

      {catalogKey && (
        <div className="gm-form-section gm-story-spawn">
          <p className="gm-form-section-label">Выдать на стол сейчас</p>
          <div className="gm-form-chip-list">
            {factions.map((f) => (
              <button
                key={f.id}
                type="button"
                className="btn ghost"
                onClick={() => void spawn(f.id)}
              >
                → {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Visual editor for story_quests.json */
export function GmStoryQuestEditor() {
  return (
    <GmQuestCatalogShell<StoryQuestDef>
      catalog="story_quests"
      bag="quests"
      idPrefix="sq"
      emptyDef={emptyStoryQuest}
      fromPayload={(d) => d as StoryQuestDef}
      toPayload={(d) => d}
      renderForm={({ draft, setDraft }) => (
        <StoryQuestFormInner draft={draft} setDraft={setDraft} />
      )}
    />
  );
}

/** Wrapper to pass selected catalog key into spawn UI */
function StoryQuestFormInner({
  draft,
  setDraft,
}: {
  draft: StoryQuestDef;
  setDraft: (v: StoryQuestDef) => void;
}) {
  return (
    <StoryQuestForm
      draft={draft}
      setDraft={setDraft}
      catalogKey={draft.id || null}
    />
  );
}
