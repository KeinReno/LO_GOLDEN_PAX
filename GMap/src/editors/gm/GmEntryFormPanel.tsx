import type { EffectInstance } from "../../state/contentCatalog";
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
            <span>Tier</span>
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
            <span>Supply</span>
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
            <input
              className="gm-form-input"
              maxLength={1}
              value={String(data.category ?? "A")}
              onChange={(e) => patch("category", e.target.value.toUpperCase())}
            />
          </label>
          <label className="gm-form-field">
            <span>Era</span>
            <input
              type="number"
              className="gm-form-input"
              value={Number(data.era ?? 1)}
              onChange={(e) => patch("era", Number(e.target.value))}
            />
          </label>
          <label className="gm-form-field">
            <span>Cognitio</span>
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
          <span>Flavor</span>
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
            <span>Label</span>
            <input
              className="gm-form-input"
              value={String(data.label ?? "")}
              onChange={(e) => patch("label", e.target.value)}
            />
          </label>
          <label className="gm-form-field">
            <span>ETA (ходов)</span>
            <input
              type="number"
              className="gm-form-input"
              value={Number(data.etaTurns ?? 2)}
              onChange={(e) => patch("etaTurns", Number(e.target.value))}
            />
          </label>
          <label className="gm-form-field gm-form-field--wide">
            <span>Roles (через запятую)</span>
            <input
              className="gm-form-input"
              value={roles.join(", ")}
              onChange={(e) =>
                patch(
                  "roles",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
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
            <span>Scope</span>
            <select
              className="gm-form-input"
              value={String(data.scope ?? "faction")}
              onChange={(e) => patch("scope", e.target.value)}
            >
              <option value="faction">faction</option>
              <option value="both">both</option>
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
          <span>Ингредиенты (id через запятую)</span>
          <input
            className="gm-form-input"
            value={ingredients.join(", ")}
            onChange={(e) =>
              patch(
                "ingredients",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              )
            }
          />
        </label>
        <label className="gm-form-field">
          <span>Результат (id через запятую)</span>
          <input
            className="gm-form-input"
            value={results.join(", ")}
            onChange={(e) =>
              patch(
                "results",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              )
            }
          />
        </label>
        <label className="gm-form-field">
          <span>Era</span>
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
