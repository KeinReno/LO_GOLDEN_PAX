import {
  CURRENCY_OPTIONS,
  EFFECT_PRESETS,
  effectsFromPreset,
} from "./questCatalogShared";

type EffectRow = { effect: string; args?: Record<string, unknown> };

type Props = {
  effects: EffectRow[];
  onChange: (effects: EffectRow[]) => void;
  label?: string;
};

function effectSummary(e: EffectRow): string {
  const args = e.args || {};
  if (e.effect === "loyalty_add") return `loyalty ${args.amount ?? 0}`;
  if (e.effect === "upkeep_flat" || e.effect === "production_flat") {
    const res = String(args.resource || "?").replace("currency.", "");
    return `${res} ${args.amount ?? 0}`;
  }
  if (e.effect === "grant_tech") return `tech: ${args.techId ?? "?"}`;
  if (e.effect === "grant_recipe") return `recipe: ${args.recipeId ?? "?"}`;
  if (e.effect === "ap_add") return `ОД ${args.amount ?? 0}`;
  return e.effect;
}

function patchEffectArg(
  effects: EffectRow[],
  index: number,
  key: string,
  value: unknown,
): EffectRow[] {
  return effects.map((e, i) =>
    i === index ? { ...e, args: { ...(e.args || {}), [key]: value } } : e,
  );
}

/** Visual builder for quest/catalog effects (no raw JSON). */
export function GmEffectBuilder({ effects, onChange, label }: Props) {
  const addPreset = (preset: (typeof EFFECT_PRESETS)[number]) => {
    onChange([...effects, effectsFromPreset(preset)]);
  };

  const remove = (index: number) => {
    onChange(effects.filter((_, i) => i !== index));
  };

  return (
    <div className="gm-effect-builder">
      {label && <p className="gm-form-section-label">{label}</p>}
      {effects.length === 0 && (
        <p className="hint">Нет эффектов — добавьте пресет ниже.</p>
      )}
      <ul className="gm-effect-builder-list">
        {effects.map((e, i) => (
          <li key={`${e.effect}-${i}`} className="gm-effect-builder-row">
            <span className="gm-effect-builder-kind">{effectSummary(e)}</span>
            <div className="gm-effect-builder-fields">
              {e.effect === "loyalty_add" && (
                <label>
                  ±
                  <input
                    type="number"
                    value={Number(e.args?.amount ?? 0)}
                    onChange={(ev) =>
                      onChange(
                        patchEffectArg(effects, i, "amount", Number(ev.target.value)),
                      )
                    }
                  />
                </label>
              )}
              {(e.effect === "upkeep_flat" || e.effect === "production_flat") && (
                <>
                  <select
                    value={String(e.args?.resource ?? "currency.metal")}
                    onChange={(ev) =>
                      onChange(patchEffectArg(effects, i, "resource", ev.target.value))
                    }
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={Number(e.args?.amount ?? 0)}
                    onChange={(ev) =>
                      onChange(
                        patchEffectArg(effects, i, "amount", Number(ev.target.value)),
                      )
                    }
                  />
                </>
              )}
              {e.effect === "grant_tech" && (
                <input
                  type="text"
                  placeholder="tech.id"
                  value={String(e.args?.techId ?? "")}
                  onChange={(ev) =>
                    onChange(patchEffectArg(effects, i, "techId", ev.target.value))
                  }
                />
              )}
              {e.effect === "grant_recipe" && (
                <input
                  type="text"
                  placeholder="recipe.id"
                  value={String(e.args?.recipeId ?? "")}
                  onChange={(ev) =>
                    onChange(patchEffectArg(effects, i, "recipeId", ev.target.value))
                  }
                />
              )}
              {e.effect === "ap_add" && (
                <input
                  type="number"
                  value={Number(e.args?.amount ?? 0)}
                  onChange={(ev) =>
                    onChange(
                      patchEffectArg(effects, i, "amount", Number(ev.target.value)),
                    )
                  }
                />
              )}
              {e.effect === "stability_add" && (
                <input
                  type="number"
                  value={Number(e.args?.amount ?? 0)}
                  onChange={(ev) =>
                    onChange(
                      patchEffectArg(effects, i, "amount", Number(ev.target.value)),
                    )
                  }
                />
              )}
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => remove(i)}
              aria-label="Удалить эффект"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="gm-effect-builder-add">
        {EFFECT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn ghost gm-pill"
            onClick={() => addPreset(p)}
          >
            + {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
