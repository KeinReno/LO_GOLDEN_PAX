import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TreasuryPoint } from "../chartData";

type Props = {
  points: TreasuryPoint[];
  zeroTurn: number | null;
  avgNet: number;
};

function Tip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | null; dataKey?: string; color?: string }[];
  label?: number | string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="eco-chart-tip">
      <strong>Ход {label}</strong>
      {payload.map((p) =>
        p.value == null ? null : (
          <div key={String(p.dataKey)} style={{ color: p.color }}>
            {p.dataKey === "forecast" ? "Прогноз" : "Казна"}: {p.value}
          </div>
        ),
      )}
    </div>
  );
}

export function TreasuryChart({ points, zeroTurn, avgNet }: Props) {
  if (points.length === 0) {
    return <p className="hint">Нет истории казны.</p>;
  }

  return (
    <div className="eco-chart-block">
      <header className="eco-chart-block__head">
        <h4>Казна · прогноз</h4>
        <span className="hint tabular-nums">
          темп {avgNet > 0 ? `+${avgNet}` : avgNet}/ход
        </span>
      </header>
      <div className="eco-chart-block__body">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="turn"
              tick={{ fill: "#8a96a8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8a96a8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<Tip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "#8a96a8" }}
              formatter={(v) => (v === "forecast" ? "Прогноз" : "Казна")}
            />
            <Line
              type="monotone"
              dataKey="value"
              name="value"
              stroke="#e8c44c"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              name="forecast"
              stroke="#e8c44c"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {zeroTurn != null ? (
        <p className="eco-chart-forecast-warn" role="status">
          При текущем темпе казна уйдёт в ноль на ходу {zeroTurn}.
        </p>
      ) : avgNet < 0 ? (
        <p className="hint">Прогноз на 5 ходов — казна ещё в плюсе.</p>
      ) : (
        <p className="hint">Баланс неотрицательный — прогноз растёт или стабилен.</p>
      )}
    </div>
  );
}
