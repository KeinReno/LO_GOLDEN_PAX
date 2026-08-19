import { GmQuestChoiceEditor } from "./GmQuestChoiceEditor";
import { GmQuestCatalogShell } from "./GmQuestCatalogShell";
import { CatalogIdSelect } from "../CatalogIdSelect";
import { getCachedContent } from "../../../state/contentCatalog";
import { yearlyCategoryLabel } from "../../../state/displayLabels";
import {
  FILTER_FIELDS,
  YEARLY_CATEGORIES,
  emptyYearlyQuest,
  type YearlyQuestDef,
} from "./questCatalogShared";

function FilterEditor({
  filterBy,
  onChange,
}: {
  filterBy: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const content = getCachedContent();
  const races = Object.values(content?.races ?? {})
    .filter((r) => r?.id)
    .map((r) => ({ id: r.id, name: r.name ?? r.id }));
  const buildings = Object.values(content?.buildings ?? {}).map((b) => ({
    id: b.id,
    name: b.name ?? b.id,
  }));

  return (
    <div className="gm-form-section">
      <p className="gm-form-section-label">Условия появления</p>
      <div className="gm-form-grid">
        {FILTER_FIELDS.map((f) => {
          const val = filterBy[f.key];
          if (f.type === "bool") {
            return (
              <label key={f.key} className="gm-form-check">
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => {
                    const next = { ...filterBy };
                    if (e.target.checked) next[f.key] = true;
                    else delete next[f.key];
                    onChange(next);
                  }}
                />
                <span>{f.label}</span>
              </label>
            );
          }
          if (f.type === "race" || f.type === "building") {
            return (
              <label key={f.key} className="gm-form-field">
                <span>{f.label}</span>
                <CatalogIdSelect
                  value={val != null ? String(val) : ""}
                  onChange={(id) => {
                    const next = { ...filterBy };
                    if (!id) delete next[f.key];
                    else next[f.key] = id;
                    onChange(next);
                  }}
                  options={f.type === "race" ? races : buildings}
                  emptyLabel="— не задано —"
                />
              </label>
            );
          }
          return (
            <label key={f.key} className="gm-form-field">
              <span>{f.label}</span>
              <input
                type={f.type === "number" ? "number" : "text"}
                className="gm-form-input"
                placeholder={f.placeholder}
                value={val != null ? String(val) : ""}
                onChange={(e) => {
                  const next = { ...filterBy };
                  const raw = e.target.value;
                  if (!raw) delete next[f.key];
                  else
                    next[f.key] =
                      f.type === "number" ? Number(raw) : raw;
                  onChange(next);
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function YearlyQuestForm({
  draft,
  setDraft,
}: {
  draft: YearlyQuestDef;
  setDraft: (v: YearlyQuestDef) => void;
}) {
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
          <span>Категория</span>
          <select
            className="gm-form-input"
            value={draft.category ?? "neutral"}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {YEARLY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {yearlyCategoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="gm-form-check">
          <input
            type="checkbox"
            checked={Boolean(draft.neutral)}
            onChange={(e) => setDraft({ ...draft, neutral: e.target.checked })}
          />
          <span>Нейтральный (fallback в пуле)</span>
        </label>
      </div>

      <label className="gm-form-field">
          <span>Кратко</span>
        <textarea
          className="gm-form-input"
          rows={2}
          value={draft.summary ?? ""}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
      </label>
      <label className="gm-form-field">
          <span>Подробности</span>
        <textarea
          className="gm-form-input"
          rows={4}
          value={draft.detail ?? ""}
          onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
        />
      </label>

      <FilterEditor
        filterBy={(draft.filterBy as Record<string, unknown>) || {}}
        onChange={(filterBy) => setDraft({ ...draft, filterBy })}
      />

      <GmQuestChoiceEditor
        choices={draft.choices || []}
        onChange={(choices) => setDraft({ ...draft, choices })}
      />
    </div>
  );
}

/** Visual editor for yearly_quests.json */
export function GmYearlyQuestEditor() {
  return (
    <GmQuestCatalogShell<YearlyQuestDef>
      catalog="yearly_quests"
      bag=""
      idPrefix="yq"
      emptyDef={emptyYearlyQuest}
      fromPayload={(d) => d as YearlyQuestDef}
      toPayload={(d) => d}
      renderForm={({ draft, setDraft }) => (
        <YearlyQuestForm draft={draft} setDraft={setDraft} />
      )}
    />
  );
}
