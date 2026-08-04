import { useState, type ReactNode } from "react";
import type { TechnologyDef, TechUpgrade } from "../../state/contentCatalog";
import { renderEffect } from "../../state/EffectRenderers";

type Effect = NonNullable<TechnologyDef["effects"]>[number];

export type EffectNavigateTarget =
  | { kind: "economy_production"; category?: string; resource?: string }
  | { kind: "forces"; fromDefId?: string; toDefId?: string };

function EffectTooltip({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return <span className="research-effect-tooltip">{children}</span>;
}

function categoryFromResource(resource: unknown): string | undefined {
  const id = String(resource || "");
  const map: Record<string, string> = {
    "currency.extracta": "A",
    "currency.materia": "B",
    "currency.industria": "C",
    "currency.energia": "D",
    "currency.bios": "E",
    "currency.cognitio": "F",
    "currency.metal": "B",
    "currency.supply": "E",
  };
  return map[id];
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
  const [hover, setHover] = useState<string | null>(null);
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
            category: categoryFromResource(args.resource) || (args.category as string | undefined),
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
            onMouseEnter={() => setHover(key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="research-effect-icon" aria-hidden>
              {view.icon}
            </span>
            {clickable ? (
              <button
                type="button"
                className="research-effect-link"
                onClick={() => onEffectNavigate?.(nav!)}
                title="Перейти"
              >
                {view.short}
              </button>
            ) : (
              <span className="research-effect-text">{view.short}</span>
            )}
            <EffectTooltip open={hover === key}>{view.tip}</EffectTooltip>
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
