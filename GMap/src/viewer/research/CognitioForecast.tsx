import type { TechnologyDef } from "../../state/contentCatalog";
import { effectiveCognitioCost } from "../../state/researchCosts";
import { fmtSigned } from "../../state/numberFormat";
import type { ViewerPayload } from "../../state/types";
import type { QueueForecastItem } from "./ResearchQueue";

function cognitioCost(tech: TechnologyDef, eco?: ViewerPayload["economy"]): number {
  return effectiveCognitioCost(tech, eco, tech.category);
}

/** Cumulative turns to afford each queued tech given current stock + income. */
export function buildQueueForecasts(
  queue: string[],
  byId: Map<string, TechnologyDef>,
  cognitio: number,
  income: number,
  eco?: ViewerPayload["economy"],
): QueueForecastItem[] {
  let pool = cognitio;
  const out: QueueForecastItem[] = [];
  let spentTurns = 0;

  for (const techId of queue) {
    const tech = byId.get(techId);
    if (!tech) {
      out.push({ techId, turns: null, ready: false });
      continue;
    }
    const cost = cognitioCost(tech, eco);
    if (pool >= cost) {
      out.push({ techId, turns: spentTurns, ready: spentTurns === 0 });
      pool -= cost;
      continue;
    }
    if (income <= 0) {
      out.push({ techId, turns: null, ready: false });
      continue;
    }
    const need = cost - pool;
    const turns = Math.ceil(need / income);
    spentTurns += turns;
    pool += turns * income - cost;
    out.push({ techId, turns: spentTurns, ready: false });
  }
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 64;
  const h = 18;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      className={`research-sparkline ${up ? "is-up" : "is-down"}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={pts}
      />
    </svg>
  );
}

/** Net cognitio per turn from recent ledger rows (last N turns). */
export function cognitioSparkFromRecent(
  recent:
    | {
        currencyId: string;
        delta: number;
        turn: number | null;
        reason: string;
      }[]
    | undefined,
  maxTurns = 10,
): number[] {
  if (!recent?.length) return [];
  const byTurn = new Map<number, number>();
  for (const e of recent) {
    if (e.currencyId !== "currency.cognitio") continue;
    if (e.turn == null) continue;
    byTurn.set(e.turn, (byTurn.get(e.turn) ?? 0) + Number(e.delta || 0));
  }
  const turns = [...byTurn.keys()].sort((a, b) => a - b).slice(-maxTurns);
  return turns.map((t) => byTurn.get(t) ?? 0);
}

export function CognitioForecast({
  cognitio,
  income,
  forecasts,
  byId,
  spark,
  eco,
}: {
  cognitio: number;
  income: number;
  forecasts: QueueForecastItem[];
  byId: Map<string, TechnologyDef>;
  spark: number[];
  eco?: ViewerPayload["economy"];
}) {
  if (forecasts.length === 0) {
    return (
      <div className="research-forecast">
        <p className="hint research-forecast-stock">
          Знание: <strong className="tabular">{cognitio}</strong>
          {income !== 0 ? (
            <span className="tabular">
              {" "}
                ({fmtSigned(income)}/ход)
            </span>
          ) : null}
          <Sparkline values={spark} />
        </p>
        <p className="hint">Добавьте технологии в очередь для прогноза.</p>
      </div>
    );
  }

  return (
    <div className="research-forecast" aria-label="Прогноз исследований">
      <p className="hint research-forecast-stock">
        Знание: <strong className="tabular">{cognitio}</strong>
        {income !== 0 ? (
          <span className="tabular">
            {" "}
                ({fmtSigned(income)}/ход)
          </span>
        ) : null}
        <Sparkline values={spark} />
      </p>
      <ul className="research-forecast-list">
        {forecasts.map((f) => {
          const tech = byId.get(f.techId);
          const cost = tech ? cognitioCost(tech, eco) : 0;
          let label: string;
          if (f.ready) label = "готова сейчас ✓";
          else if (f.turns == null) label = "нет дохода — ждать";
          else label = `через ${f.turns} ход${f.turns === 1 ? "" : f.turns < 5 ? "а" : "ов"}`;
          return (
            <li key={f.techId}>
              <strong>{tech?.name ?? f.techId}</strong>
              <span className="hint tabular"> ({cost})</span>
              <span className="hint"> — {label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
