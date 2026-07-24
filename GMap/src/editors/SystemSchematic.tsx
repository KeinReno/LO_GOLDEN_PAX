import type { Planet, StarBody, StarSystem, OrbitalStation } from "../state/types";
import {
  PLANET_TYPE_COLORS,
  classifyPlanet,
  planetsByOrbit,
} from "../state/planets";
import { STAR_CLASS_LABELS } from "../state/defaults";

interface SystemSchematicProps {
  system: StarSystem;
  selectedPlanetId: string | null;
  onSelectPlanet: (planetId: string | null) => void;
}

const STAR_FILL: Record<string, string> = {
  O: "#9db4ff",
  B: "#a8c8ff",
  A: "#e8f0ff",
  F: "#fff4c8",
  G: "#ffd56a",
  K: "#ffaa55",
  M: "#ff6b4a",
};

/** Schematic orbital map — independent of galaxy x/y coordinates. */
export function SystemSchematic({
  system,
  selectedPlanetId,
  onSelectPlanet,
}: SystemSchematicProps) {
  const planets = planetsByOrbit(system.planets);
  const stations = system.stations ?? [];
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const maxOrbit = Math.max(planets.length, 1);
  const ringStep = Math.min(36, 140 / maxOrbit);

  return (
    <div className="sys-schematic">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="sys-schematic-svg"
        role="img"
        aria-label={`Схема системы ${system.name}`}
      >
        <defs>
          <radialGradient id="sysVoid" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#121820" />
            <stop offset="100%" stopColor="#070a0f" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={size / 2 - 4} fill="url(#sysVoid)" />

        {planets.map((p, i) => {
          const r = 52 + (i + 1) * ringStep;
          return (
            <circle
              key={`ring-${p.id}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(201,162,39,0.18)"
              strokeWidth={1}
              strokeDasharray="3 5"
            />
          );
        })}

        {stations.length > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={52 + (planets.length + 1.2) * ringStep}
            fill="none"
            stroke="rgba(120,160,220,0.25)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        )}

        {renderStars(system.stars, cx, cy)}

        {planets.map((p, i) => {
          const r = 52 + (i + 1) * ringStep;
          const angle = -Math.PI / 2 + i * 0.85;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          const bodyR = 7 * (p.size ?? 1);
          const selected = p.id === selectedPlanetId;
          const habit = classifyPlanet(p);
          return (
            <g
              key={p.id}
              className="sys-planet-hit"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPlanet(p.id);
              }}
            >
              <circle
                cx={px}
                cy={py}
                r={bodyR + (selected ? 4 : 2)}
                fill="none"
                stroke={
                  selected
                    ? "#ffe08a"
                    : habit === "inhabited"
                      ? "#5cdb95"
                      : habit === "habitable"
                        ? "#f0c14a"
                        : "rgba(255,255,255,0.15)"
                }
                strokeWidth={selected ? 2 : 1}
              />
              <circle
                cx={px}
                cy={py}
                r={bodyR}
                fill={PLANET_TYPE_COLORS[p.type] ?? "#889"}
              />
              {(p.surfaceBuildings?.length || p.orbitalBuildings?.length) ? (
                <circle
                  cx={px + bodyR * 0.65}
                  cy={py - bodyR * 0.65}
                  r={3}
                  fill="#7aa2d4"
                  stroke="#0a0e14"
                  strokeWidth={1}
                />
              ) : null}
              <text
                x={px}
                y={py + bodyR + 12}
                textAnchor="middle"
                className="sys-planet-label"
              >
                {p.name}
              </text>
            </g>
          );
        })}

        {stations.map((st, i) => {
          const r = 52 + (planets.length + 1.2) * ringStep;
          const angle = (i / Math.max(stations.length, 1)) * Math.PI * 2;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          return (
            <g key={st.id}>
              <rect
                x={px - 5}
                y={py - 5}
                width={10}
                height={10}
                fill="#7aa2d4"
                stroke="#c9d8ef"
                strokeWidth={1}
                transform={`rotate(45 ${px} ${py})`}
              />
              <title>{st.name}</title>
            </g>
          );
        })}
      </svg>
      <p className="hint sys-schematic-hint">
        Схема орбит (не координаты галактики). Клик по планете — карточка.
      </p>
    </div>
  );
}

function renderStars(stars: StarBody[], cx: number, cy: number) {
  if (!stars.length) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={10} fill="#445" />
        <text x={cx} y={cy + 28} textAnchor="middle" className="sys-planet-label">
          коридор
        </text>
      </g>
    );
  }
  const offsets =
    stars.length === 1
      ? [[0, 0]]
      : stars.length === 2
        ? [
            [-14, 0],
            [14, 0],
          ]
        : [
            [-16, 6],
            [0, -14],
            [16, 6],
          ];
  return (
    <g>
      {stars.map((st, i) => {
        const [dx, dy] = offsets[i] ?? [0, 0];
        const r = 10 + Math.min(st.luminosity, 2) * 4;
        return (
          <g key={i}>
            <circle
              cx={cx + dx}
              cy={cy + dy}
              r={r + 6}
              fill={STAR_FILL[st.class] ?? "#ffd56a"}
              opacity={0.2}
            />
            <circle
              cx={cx + dx}
              cy={cy + dy}
              r={r}
              fill={STAR_FILL[st.class] ?? "#ffd56a"}
            />
            <title>
              {STAR_CLASS_LABELS[st.class] ?? st.class} · L={st.luminosity}
            </title>
          </g>
        );
      })}
    </g>
  );
}

export function planetAccent(p: Planet): string {
  return PLANET_TYPE_COLORS[p.type] ?? "#889";
}

export type { OrbitalStation };
