import type { TechnologyDef, TechUpgrade } from "../../state/contentCatalog";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../../state/economyLabels";
import { renderEffect } from "../../state/EffectRenderers";
import { AnimatedTooltip } from "../../ui/AnimatedTooltip";

type Effect = NonNullable<TechnologyDef["effects"]>[number];

export type EffectNavigateTarget =
  | { kind: "economy_production"; category?: string; resource?: string }
  | { kind: "forces"; fromDefId?: string; toDefId?: string };

function categoryFromResource(resource: unknown): string | undefined {
  const id = String(resource || "");
  const fromCat = CATEGORY_CURRENCIES.find((c) => c.id === id);
  if (fromCat) return fromCat.letter;
  if (id === BUILD_METAL.id) return "B";
  if (id === BUILD_SUPPLY.id) return "E";
  return undefined;
}

export function EffectsList({
  effects,
  buildings,
  onBuildingClick,
  onEffectNavigate,
}: {
  effects: TechnologyDef["effects"] | TechUpgrade["effects"];
  buildings?: string[];
  onBuildingClick?: (buildingName: string) => void;
  onEffectNavigate?: (target: EffectNavigateTarget) => void;
}) {
  const list = (effects || []) as Effect[];

  if (!list.length && !(buildings && buildings.length)) {
    return <p className="hint">Нет прямых эффектов.</p>;
  }

  return (
    <ul className="research-effects" aria-label="Эффекты">
      {list.map((e, i) => {
        const key = `${e.effect}-${i}`;
        const view = renderEffect(e);
        const args = (e.args || {}) as Record<string, unknown>;
        let nav: EffectNavigateTarget | null = null;
        if (e.effect === "production_mult" || e.effect === "production_flat") {
          nav = {
            kind: "economy_production",
            category:
              categoryFromResource(args.resource) ||
              (args.category as string | undefined),
            resource: args.resource as string | undefined,
          };
        } else if (e.effect === "unit_upgrade") {
          nav = {
            kind: "forces",
            fromDefId: args.from as string | undefined,
            toDefId: args.to as string | undefined,
          };
        }
        const clickable = !!(nav && onEffectNavigate);
        return (
          <li
            key={key}
            className={`research-effect-item ${clickable ? "is-nav" : ""}`}
          >
            <AnimatedTooltip content={view.tip} side="top">
              <span className="research-effect-row">
                <span className="research-effect-icon" aria-hidden>
                  {view.icon}
                </span>
                {clickable ? (
                  <button
                    type="button"
                    className="research-effect-link"
                    onClick={() => onEffectNavigate?.(nav!)}
                  >
                    {view.short}
                  </button>
                ) : (
                  <span className="research-effect-text">{view.short}</span>
                )}
              </span>
            </AnimatedTooltip>
          </li>
        );
      })}
      {buildings && buildings.length > 0 ? (
        <li className="research-effect-item research-effect-item--buildings">
          <span className="research-effect-icon" aria-hidden>
            🏭
          </span>
          <span className="research-effect-text">
            Открывает здания:{" "}
            {buildings.map((name, i) => (
              <span key={name}>
                {i > 0 ? ", " : null}
                {onBuildingClick ? (
                  <button
                    type="button"
                    className="research-building-link"
                    onClick={() => onBuildingClick(name)}
                  >
                    {name}
                  </button>
                ) : (
                  name
                )}
              </span>
            ))}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
