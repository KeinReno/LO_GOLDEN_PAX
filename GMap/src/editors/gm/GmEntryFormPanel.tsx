import type { EffectInstance } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import { CATEGORY_CURRENCIES } from "../../state/economyLabels";
import { COURT_ROLE_LABELS, courtRoleLabel } from "../../state/displayLabels";
import { CatalogIdMulti } from "./CatalogIdSelect";
import { GmEffectBuilder } from "./atelier/GmEffectBuilder";
import type { AtelierCatalogId } from "./GmCatalogEditor";

type Props = {
  catalog: AtelierCatalogId;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
};

/** No-code form fields for common Atelier catalogs. */
export function GmEntryFormPanel({ catalog, data, onChange }: Props) {
  const patch = (key: string, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  if (catalog === "buildings") {
    const cost = (data.cost as Record<string, number>) || {};
    return (
      <div className="gm-entry-form">
        <div className="gm-form-grid">
          <label className="gm-form-field gm-form-field--wide">
            <span>Название</span>
            <input
              className="gm-form-input"
              value={String(data.name ?? "")}
              onChange={(e) => patch("name", e.target.value)}
            />
          </label>
          <label className="gm-form-field">
            <span>Тир</span>
            <input
              type="number"
              className="gm-form-input"
              value={Number(data.tier ?? 1)}
              onChange={(e) => patch("tier", Number(e.target.value))}
            />
          </label>
          <label className="gm-form-field">
            <span>Металл</span>
            <input
              type="number"
              className="gm-form-input"
              value={cost["currency.metal"] ?? 0}
              onChange={(e) =>
                patch("cost", {
                  ...cost,
                  "currency.metal": Number(e.target.value),
                })
              }
            />
          </label>
          <label className="gm-form-field">
            <span>Снабжение</span>
            <input
              type="number"
              className="gm-form-input"
              value={cost["currency.supply"] ?? 0}
              onChange={(e) =>
                patch("cost", {
                  ...cost,
                  "currency.supply": Number(e.target.value),
                })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (catalog === "technologies") {
    const cost = (data.cost as Record<string, number>) || {};
    return (
      <div className="gm-entry-form">
        <div className="gm-form-grid">
          <label className="gm-form-field gm-form-field--wide">
            <span>Название</span>
            <input
              className="gm-form-input"
              value={String(data.name ?? "")}
              onChange={(e) => patch("name", e.target.value)}
            />
          </label>
          <label className="gm-form-field">
            <span>Категория</span>
            <select
              className="gm-form-input"
              value={String(data.category ?? "A")}
              onChange={(e) => patch("category", e.target.value)}
            >
              {CATEGORY_CURRENCIES.map((c) => (
                <option key={c.letter} value={c.letter}>
                  {c.letter} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="gm-form-field">
            <span>Эра</span>
            <input
              type="number"
              className="gm-form-input"
              value={Number(data.era ?? 1)}
              onChange={(e) => patch("era", Number(e.target.value))}
            />
          </label>
          <label className="gm-form-field">
            <span>Знание</span>
            <input
              type="number"
              className="gm-form-input"
              value={cost["currency.cognitio"] ?? 0}
              onChange={(e) =>
                patch("cost", {
                  ...cost,
                  "currency.cognitio": Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <label className="gm-form-field">
          <span>Описание</span>
          <textarea
            className="gm-form-input"
            rows={2}
            value={String(data.flavor ?? "")}
            onChange={(e) => patch("flavor", e.target.value)}
          />
        </label>
      </div>
    );
  }

  if (catalog === "court_tasks") {
    const effects = (data.effects as EffectInstance[]) || [];
    const roles = (data.roles as string[]) || [];
    return (
      <div className="gm-entry-form">
        <div className="gm-form-grid">
          <label className="gm-form-field gm-form-field--wide">
            <span>Название</span>
            <input
              className="gm-form-input"
              value={String(data.label ?? "")}
              onChange={(e) => patch("label", e.target.value)}
            />
          </label>
          <label className="gm-form-field">
            <span>Срок (ходов)</span>
            <input
              type="number"
              className="gm-form-input"
              value={Number(data.etaTurns ?? 2)}
              onChange={(e) => patch("etaTurns", Number(e.target.value))}
            />
          </label>
          <label className="gm-form-field gm-form-field--wide">
            <span>Роли двора</span>
            <CatalogIdMulti
              values={roles}
              onChange={(ids) => patch("roles", ids)}
              options={Object.keys(COURT_ROLE_LABELS).map((id) => ({
                id,
                name: courtRoleLabel(id),
              }))}
              addLabel="— добавить роль —"
            />
          </label>
        </div>
        <GmEffectBuilder
          label="Эффекты поручения"
          effects={effects}
          onChange={(fx) => patch("effects", fx)}
        />
      </div>
    );
  }

  if (catalog === "npc_traits") {
    const effects = (data.effects as EffectInstance[]) || [];
    return (
      <div className="gm-entry-form">
        <div className="gm-form-grid">
          <label className="gm-form-field gm-form-field--wide">
            <span>Название</span>
            <input
              className="gm-form-input"
              value={String(data.name ?? "")}
              onChange={(e) => patch("name", e.target.value)}
            />
          </label>
          <label className="gm-form-field">
            <span>Область</span>
            <select
              className="gm-form-input"
              value={String(data.scope ?? "faction")}
              onChange={(e) => patch("scope", e.target.value)}
            >
              <option value="faction">Держава</option>
              <option value="both">Держава и персонаж</option>
            </select>
          </label>
        </div>
        <label className="gm-form-field">
          <span>Описание</span>
          <textarea
            className="gm-form-input"
            rows={2}
            value={String(data.description ?? "")}
            onChange={(e) => patch("description", e.target.value)}
          />
        </label>
        <GmEffectBuilder
          label="Эффекты"
          effects={effects}
          onChange={(fx) => patch("effects", fx)}
        />
      </div>
    );
  }

  if (catalog === "tech_recipes") {
    const ingredients = (data.ingredients as string[]) || [];
    const results = (data.results as string[]) || [];
    const techOpts = Object.values(getCachedContent()?.technologies ?? {})
      .filter((t) => t?.id)
      .map((t) => ({ id: t.id, name: t.name ?? t.id }));
    const recipeOpts = Object.values(getCachedContent()?.tech_recipes ?? {})
      .filter((r) => r?.id)
      .map((r) => ({ id: r.id, name: r.name ?? r.id }));
    const resultOpts = [...techOpts, ...recipeOpts];
    return (
      <div className="gm-entry-form">
        <label className="gm-form-field">
          <span>Название</span>
          <input
            className="gm-form-input"
            value={String(data.name ?? "")}
            onChange={(e) => patch("name", e.target.value)}
          />
        </label>
        <label className="gm-form-field">
          <span>Ингредиенты</span>
          <CatalogIdMulti
            values={ingredients}
            onChange={(ids) => patch("ingredients", ids)}
            options={techOpts}
            addLabel="— добавить технологию —"
          />
        </label>
        <label className="gm-form-field">
          <span>Результат</span>
          <CatalogIdMulti
            values={results}
            onChange={(ids) => patch("results", ids)}
            options={resultOpts}
            addLabel="— добавить результат —"
          />
        </label>
        <label className="gm-form-field">
          <span>Эра</span>
          <input
            type="number"
            className="gm-form-input"
            value={Number(data.era ?? 1)}
            onChange={(e) => patch("era", Number(e.target.value))}
          />
        </label>
      </div>
    );
  }

  return (
    <p className="hint">
      Для этого каталога используйте быстрые поля выше или переключитесь на JSON.
    </p>
  );
}

const FORM_CATALOGS: AtelierCatalogId[] = [
  "buildings",
  "technologies",
  "court_tasks",
  "npc_traits",
  "tech_recipes",
];

export function supportsEntryForm(catalog: AtelierCatalogId): boolean {
  return FORM_CATALOGS.includes(catalog);
}
