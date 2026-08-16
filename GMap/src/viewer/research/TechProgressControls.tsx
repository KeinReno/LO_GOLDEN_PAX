import type { TechnologyDef } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import {
  factionTechGrade,
  fillCostForOption,
  gradeUpgradeCost,
  isGradeable,
  MAX_TECH_GRADE,
  resourceLabel,
  socketOptions,
} from "../../state/techProgress";
import { StatefulButton } from "../../ui/StatefulButton";

function costLabel(cost: Record<string, number> | null | undefined): string {
  if (!cost) return "";
  return Object.entries(cost)
    .filter(([, n]) => Number(n) > 0)
    .map(([id, n]) => `${n} ${id.replace(/^currency\./, "")}`)
    .join(" · ");
}

export function TechProgressControls({
  tech,
  eco,
  busy,
  pendingKey,
  successKey,
  onUpgradeGrade,
  onFillSocket,
}: {
  tech: TechnologyDef;
  eco?: ViewerPayload["economy"];
  busy?: boolean;
  pendingKey?: string | null;
  successKey?: string | null;
  onUpgradeGrade?: (techId: string) => void;
  onFillSocket?: (techId: string, resourceId: string) => void;
}) {
  const gradeable = isGradeable(tech);
  const options = socketOptions(tech);
  if (!gradeable && !options) return null;

  const grade = factionTechGrade(eco, tech.id);
  const nextCost = gradeable ? gradeUpgradeCost(grade, tech) : null;
  const slotted = eco?.techSockets?.[tech.id] || null;
  const stocks = eco?.stocks || {};

  return (
    <div className="research-upgrades research-progress">
      {gradeable ? (
        <div className="research-progress-row">
          <h4>Ранг {grade}/{MAX_TECH_GRADE}</h4>
          {nextCost ? (
            <StatefulButton
              className="btn"
              disabled={
                busy ||
                Object.entries(nextCost).some(
                  ([cur, n]) => (stocks[cur] ?? 0) < Number(n),
                )
              }
              busy={busy && pendingKey === `grade:${tech.id}`}
              success={successKey === `grade:${tech.id}`}
              successLabel="Повышено"
              onClick={() => onUpgradeGrade?.(tech.id)}
            >
              Ранг {grade + 1} · {costLabel(nextCost)}
            </StatefulButton>
          ) : (
            <p className="hint">Максимальный ранг</p>
          )}
        </div>
      ) : null}
      {options ? (
        <div className="research-progress-row">
          <h4>Сокет{slotted ? ` · ${resourceLabel(slotted)}` : ""}</h4>
          <ul>
            {Object.entries(options).map(([resourceId, option]) => {
              const cost = fillCostForOption(option);
              const active = slotted === resourceId;
              const unaffordable = Object.entries(cost).some(
                ([cur, n]) => (stocks[cur] ?? 0) < Number(n),
              );
              return (
                <li key={resourceId} className={active ? "is-done" : undefined}>
                  <span className="research-upgrade-head">
                    {resourceLabel(resourceId)}
                    {active ? " · слот" : ""}
                  </span>
                  <StatefulButton
                    className="btn ghost"
                    disabled={busy || unaffordable}
                    busy={busy && pendingKey === `socket:${tech.id}:${resourceId}`}
                    success={successKey === `socket:${tech.id}:${resourceId}`}
                    successLabel="Слот"
                    onClick={() => onFillSocket?.(tech.id, resourceId)}
                  >
                    {active ? "Заполнено" : `Слот · ${costLabel(cost)}`}
                  </StatefulButton>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
