import type { TechnologyDef, TechUpgrade } from "../../state/contentCatalog";
import { StatefulButton } from "../../ui/StatefulButton";

function cognitioCost(u: TechUpgrade): number {
  return Number(u.cost?.["currency.cognitio"] ?? 0);
}

function effectSummary(u: TechUpgrade): string {
  const parts: string[] = [];
  for (const e of u.effects || []) {
    if (e.effect === "production_mult") {
      parts.push(`+${Math.round((Number(e.args.mult) - 1) * 100)}% добыча`);
    } else if (e.effect === "upkeep_mult") {
      parts.push(`${Math.round(Number(e.args.mult) * 100)}% апкип`);
    } else if (e.effect === "unlock_property") {
      parts.push(`свойство «${e.args.property}»`);
    } else if (e.effect === "stat_mult") {
      parts.push(`${e.args.stat} ×${e.args.mult}`);
    } else if (e.effect === "unit_upgrade") {
      parts.push(`${e.args.from} → ${e.args.to}`);
    } else {
      parts.push(e.effect);
    }
  }
  return parts.join(" · ") || "—";
}

/** ROI score: higher is better. Uses category net income when available. */
export function upgradeRoiScore(
  u: TechUpgrade,
  categoryIncome: number,
  categoryDemand: number,
): number {
  const cost = Math.max(1, cognitioCost(u));
  let gainPerTurn = 0;
  for (const e of u.effects || []) {
    if (e.effect === "production_mult") {
      const mult = Number(e.args.mult) || 1;
      gainPerTurn += Math.max(0, categoryIncome) * (mult - 1);
    } else if (e.effect === "upkeep_mult") {
      const mult = Number(e.args.mult) || 1;
      // lower upkeep = savings
      gainPerTurn += Math.max(0, categoryDemand) * (1 - mult);
    } else if (e.effect === "unlock_property" || e.effect === "unit_upgrade") {
      gainPerTurn += 2;
    } else {
      gainPerTurn += 0.5;
    }
  }
  return gainPerTurn / cost;
}

function starsFromScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 3;
  const ratio = score / maxScore;
  if (ratio >= 0.85) return 5;
  if (ratio >= 0.65) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

export function UpgradesComparison({
  tech,
  unlockedUpgrades,
  unlockedTechs,
  cognitio,
  busy,
  pendingUpgradeId,
  successId,
  categoryIncome,
  categoryDemand,
  onResearchUpgrade,
}: {
  tech: TechnologyDef;
  unlockedUpgrades: Set<string>;
  unlockedTechs?: Set<string>;
  cognitio: number;
  busy?: boolean;
  pendingUpgradeId?: string | null;
  successId?: string | null;
  categoryIncome: number;
  categoryDemand: number;
  onResearchUpgrade?: (techId: string, upgradeId: string) => void;
}) {
  const upgrades = tech.upgrades || [];
  if (!upgrades.length) return null;

  const scored = upgrades.map((u) => ({
    u,
    score: upgradeRoiScore(u, categoryIncome, categoryDemand),
    done: unlockedUpgrades.has(u.id),
    cost: cognitioCost(u),
  }));
  const maxScore = Math.max(
    0,
    ...scored.filter((s) => !s.done).map((s) => s.score),
  );
  const bestId =
    scored
      .filter((s) => !s.done)
      .sort((a, b) => b.score - a.score)[0]?.u.id ?? null;

  return (
    <div className="research-upgrades-compare">
      <h4>Сравнение апгрейдов</h4>
      <table>
        <thead>
          <tr>
            <th>Апгрейд</th>
            <th>Эффект</th>
            <th>Цена</th>
            <th>ROI</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {scored.map(({ u, score, done, cost }) => {
            const stars = "★".repeat(starsFromScore(score, maxScore || score));
            const preOk = (u.prerequisites || []).every(
              (p) =>
                unlockedUpgrades.has(p) || (unlockedTechs?.has(p) ?? false),
            );
            const canUp =
              !done &&
              preOk &&
              cognitio >= cost &&
              !busy &&
              !!onResearchUpgrade;
            return (
              <tr
                key={u.id}
                className={[
                  done ? "is-done" : "",
                  bestId === u.id ? "is-best" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td>
                  <strong>
                    {done ? "★ " : ""}
                    {u.name}
                  </strong>
                </td>
                <td className="hint">{effectSummary(u)}</td>
                <td className="tabular">{done ? "—" : cost}</td>
                <td className="tabular" title={`score ${score.toFixed(2)}`}>
                  {done ? "—" : stars}
                </td>
                <td>
                  {done ? (
                    <span className="hint">изучено</span>
                  ) : (
                    <StatefulButton
                      className={`btn sm ${canUp ? "primary" : ""}`}
                      disabled={!canUp}
                      busy={busy && pendingUpgradeId === u.id}
                      success={successId === u.id}
                      successLabel="Улучшено"
                      onClick={() => {
                        if (!canUp) return;
                        onResearchUpgrade?.(tech.id, u.id);
                      }}
                    >
                      Улучшить
                    </StatefulButton>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {bestId ? (
        <p className="hint research-roi-hint">
          Рекомендация: «{upgrades.find((u) => u.id === bestId)?.name}» — макс.
          ROI
        </p>
      ) : null}
    </div>
  );
}
