import { useRef, type MutableRefObject } from "react";
import type {
  Faction,
  Fleet,
  Legion,
  Planet,
  StarBody,
  StarSystem,
  OrbitalStation,
  StationKind,
  SystemPoiType,
} from "../state/types";
import {
  PLANET_TYPE_COLORS,
  classifyPlanet,
  planetsByOrbit,
} from "../state/planets";
import { STAR_CLASS_LABELS, SYSTEM_POI_LABELS } from "../state/defaults";
import { stationKindLabel } from "../state/displayLabels";
import { systemSpaceObjects } from "../state/spaceObjects";
import { mapIconUrl, poiIconId } from "../renderers/mapIconAssets";
import { resolveResourceDisplay } from "../ui/ResourceIcon";
import { fromIso, toIso } from "../renderers/iso";
import { systemMineInfo } from "../viewer/depositMining";
import { GESTURE } from "../ui/gestureMap";

export type SchematicFeature =
  | { kind: "poi"; tag: SystemPoiType; index: number }
  | { kind: "deposit"; resourceId: string }
  | { kind: "station"; stationId: string };

interface SystemSchematicProps {
  system: StarSystem;
  selectedPlanetId: string | null;
  onSelectPlanet: (planetId: string | null) => void;
  /** Forces present in-system, drawn on an outer ring. */
  fleets?: Fleet[];
  legions?: Legion[];
  factions?: Faction[];
  playerFactionId?: string | null;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectFleet?: (fleetId: string) => void;
  onSelectLegion?: (legionId: string) => void;
  selectedStationId?: string | null;
  onSelectStation?: (stationId: string | null) => void;
  selectedFeature?: SchematicFeature | null;
  onSelectFeature?: (feature: SchematicFeature | null) => void;
  mapResourceNames?: Record<string, string>;
  /** Drop target / build-mode highlight for system belt. */
  systemBeltHot?: boolean;
  /** Player can place stations on the belt (owned system). */
  canBuildBelt?: boolean;
  /** Ghost marker angle while placing. */
  pendingBeltAngle?: number | null;
  /** Kind being placed (ghost label). */
  placingKind?: StationKind | null;
  /**
   * Tap belt → orbital angle (radians).
   * Place mode: commit / set point. Idle: enter place mode.
   */
  onBeltTap?: (angle: number) => void;
  /** Long-press deposit → start mining place flow. */
  onDepositBuildMining?: (resourceId: string) => void;
  /**
   * Tap planet = soft select (preview). Double-tap = drill.
   * If omitted, falls back to onSelectPlanet for both.
   */
  onPlanetPreview?: (planetId: string) => void;
  onPlanetDrill?: (planetId: string) => void;
  /** Soft-selected planet (preview), may differ from drilled selectedPlanetId. */
  previewPlanetId?: string | null;
  /** RMB / context at source — viewport coords + target. */
  onSchematicContext?: (ev: SchematicContextEvent) => void;
}

export type SchematicContextEvent = {
  clientX: number;
  clientY: number;
  target:
    | { kind: "planet"; planetId: string }
    | { kind: "deposit"; resourceId: string; beltAngle: number }
    | { kind: "station"; stationId: string }
    | { kind: "poi"; tag: SystemPoiType; index: number }
    | { kind: "belt"; beltAngle: number };
};

const STAR_FILL: Record<string, string> = {
  O: "#9db4ff",
  B: "#a8c8ff",
  A: "#e8f0ff",
  F: "#fff4c8",
  G: "#ffd56a",
  K: "#ffaa55",
  M: "#ff6b4a",
};

/** Iso extent of a unit circle (max |ix|, |iy|). Same AX/AY as galaxy map. */
const ISO_EXT_X = 0.92 * Math.SQRT2;
const ISO_EXT_Y = 0.48 * Math.SQRT2;
/** Vertical squash for circular bodies on the ecliptic. */
const BODY_RY = 0.52;

type Pt = { x: number; y: number };

/** Orbital-plane polar → screen via galaxy `toIso`. */
function orbitToScreen(
  angle: number,
  radius: number,
  cx: number,
  cy: number,
): Pt {
  const iso = toIso(Math.cos(angle) * radius, Math.sin(angle) * radius);
  return { x: cx + iso.x, y: cy + iso.y };
}

/** Closed path of an orbital circle projected to iso (ecliptic ellipse). */
function isoOrbitPath(
  cx: number,
  cy: number,
  radius: number,
  segments = 72,
): string {
  if (radius <= 0) return "";
  const parts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const p = orbitToScreen(a, radius, cx, cy);
    parts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `${parts.join(" ")} Z`;
}

function planetAngle(index: number): number {
  return -Math.PI / 2 + index * 0.85;
}

/** Pointer hold tracking for deposit long-press → build mining. */
const depositHold = new Map<string, { t: number; x: number; y: number }>();

function pointerToBeltAngle(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  cx: number,
  cy: number,
): number {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return 0;
  const local = pt.matrixTransform(ctm.inverse());
  const world = fromIso(local.x - cx, local.y - cy);
  return Math.atan2(world.y, world.x);
}

/**
 * Isometric system stage — same 2:1 projection as the galaxy map (`toIso`).
 * Orbital plane is the ecliptic; star sits as a vertical pillar above the floor.
 */
export function SystemSchematic({
  system,
  selectedPlanetId,
  onSelectPlanet,
  fleets = [],
  legions = [],
  factions = [],
  playerFactionId = null,
  selectedFleetId = null,
  selectedLegionId = null,
  onSelectFleet,
  onSelectLegion,
  selectedStationId = null,
  onSelectStation,
  selectedFeature = null,
  onSelectFeature,
  mapResourceNames,
  systemBeltHot = false,
  canBuildBelt = false,
  pendingBeltAngle = null,
  placingKind = null,
  onBeltTap,
  onDepositBuildMining,
  onPlanetPreview,
  onPlanetDrill,
  previewPlanetId = null,
  onSchematicContext,
}: SystemSchematicProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastPlanetTap = useRef<{ id: string; t: number } | null>(null);
  const planets = planetsByOrbit(system.planets);
  const mineInfo = systemMineInfo(system, playerFactionId);
  const stations = system.stations ?? [];
  const spaceObjs = systemSpaceObjects(system);
  const systemRes = system.resources ?? [];
  const maxOrbit = Math.max(planets.length, 1);
  const ringStep = Math.min(32, 120 / maxOrbit);
  const stationR = 48 + (planets.length + 1.15) * ringStep;
  const forceR = stationR + 26;
  const edgePadX = 56;
  const edgePadY = 64;
  const pillarHeadroom = 36;
  const width = Math.max(
    480,
    Math.ceil(forceR * ISO_EXT_X * 2 + edgePadX * 2),
  );
  const height = Math.max(
    360,
    Math.ceil(forceR * ISO_EXT_Y * 2 + edgePadY * 2 + pillarHeadroom),
  );
  const cx = width / 2;
  const cy = height / 2 + pillarHeadroom * 0.15;
  const voidGradId = `sysVoid-${system.id}`;
  const starGlowId = `sysStarGlow-${system.id}`;
  const floorGradId = `sysFloor-${system.id}`;
  const pillarGradId = `sysPillar-${system.id}`;

  const factionColor = (id: string | null | undefined) =>
    (id && factions.find((f) => f.id === id)?.color) || "#8a96a8";

  const colonyGlyph = (ct: string | undefined): string => {
    switch (ct) {
      case "outpost":
        return "О";
      case "colony":
        return "К";
      case "core":
        return "Ц";
      case "fortress":
        return "Ф";
      case "mining":
        return "М";
      case "research":
        return "Р";
      default:
        return "";
    }
  };

  const stationColor = (kind: string): string => {
    switch (kind) {
      case "science":
        return "#6ec8d9";
      case "mining":
        return "#c4a882";
      case "military":
        return "#e85d4c";
      case "trade":
        return "#f0c14a";
      case "relay":
        return "#7a9bb8";
      default:
        return "#7aa2d4";
    }
  };

  const floorR = forceR + 8;
  const beltLabel = orbitToScreen(-Math.PI / 2, stationR + 6, cx, cy);

  /** Painter order: farther (smaller screen-y) first. */
  type DrawItem =
    | { kind: "planet"; id: string; y: number; index: number; planet: Planet }
    | {
        kind: "deposit";
        id: string;
        y: number;
        resId: string;
        px: number;
        py: number;
      }
    | {
        kind: "poi";
        id: string;
        y: number;
        tag: SystemPoiType;
        index: number;
        px: number;
        py: number;
      }
    | {
        kind: "station";
        id: string;
        y: number;
        station: OrbitalStation;
        px: number;
        py: number;
        anchored: Planet | null;
      };

  const drawItems: DrawItem[] = [];

  planets.forEach((p, i) => {
    const r = 52 + (i + 1) * ringStep;
    const pos = orbitToScreen(planetAngle(i), r, cx, cy);
    drawItems.push({
      kind: "planet",
      id: p.id,
      y: pos.y,
      index: i,
      planet: p,
    });
  });

  systemRes.forEach((resId, i) => {
    const n = Math.max(systemRes.length, 1);
    const angle = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
    const pos = orbitToScreen(angle, stationR - 10, cx, cy);
    drawItems.push({
      kind: "deposit",
      id: `res:${resId}`,
      y: pos.y,
      resId,
      px: pos.x,
      py: pos.y,
    });
  });

  spaceObjs.forEach((tag, i) => {
    const n = Math.max(spaceObjs.length, 1);
    const angle = Math.PI / 2 + ((i + 0.35) / n) * Math.PI * 2;
    const pos = orbitToScreen(angle, stationR + 14, cx, cy);
    drawItems.push({
      kind: "poi",
      id: `poi:${tag}:${i}`,
      y: pos.y,
      tag,
      index: i,
      px: pos.x,
      py: pos.y,
    });
  });

  stations.forEach((st) => {
    const anchored = st.anchorPlanetId
      ? planets.find((p) => p.id === st.anchorPlanetId)
      : null;
    let pos: Pt;
    if (typeof st.beltAngle === "number" && Number.isFinite(st.beltAngle)) {
      pos = orbitToScreen(st.beltAngle, stationR, cx, cy);
    } else if (anchored) {
      const pi = planets.findIndex((p) => p.id === anchored.id);
      const r = 52 + (Math.max(pi, 0) + 1) * ringStep;
      const angle = planetAngle(Math.max(pi, 0)) + 0.35;
      pos = orbitToScreen(angle, r + 16, cx, cy);
    } else {
      const free = stations.filter(
        (s) => !s.anchorPlanetId && typeof s.beltAngle !== "number",
      );
      const fi = free.findIndex((s) => s.id === st.id);
      const angle = (fi / Math.max(free.length, 1)) * Math.PI * 2;
      pos = orbitToScreen(angle, stationR, cx, cy);
    }
    drawItems.push({
      kind: "station",
      id: st.id,
      y: pos.y,
      station: st,
      px: pos.x,
      py: pos.y,
      anchored: anchored ?? null,
    });
  });

  drawItems.sort((a, b) => a.y - b.y);

  return (
    <div className="sys-schematic sys-schematic--iso">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="sys-schematic-svg"
        role="img"
        aria-label={`Изометрическая схема системы ${system.name}`}
        data-station-r={stationR}
        data-cx={cx}
        data-cy={cy}
      >
        <defs>
          <radialGradient id={voidGradId} cx="50%" cy="42%" r="65%">
            <stop offset="0%" stopColor="#1a2234" />
            <stop offset="28%" stopColor="#141a24" />
            <stop offset="72%" stopColor="#0e1218" />
            <stop offset="100%" stopColor="#070a0f" />
          </radialGradient>
          <radialGradient id={floorGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(32,42,58,0.55)" />
            <stop offset="55%" stopColor="rgba(18,24,34,0.35)" />
            <stop offset="100%" stopColor="rgba(8,10,14,0.05)" />
          </radialGradient>
          <radialGradient id={starGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff8e8" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#ffd56a" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#ffaa55" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ff6b4a" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={pillarGradId}
            x1="0%"
            y1="100%"
            x2="0%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#ffd56a" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#ffe08a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#fff8e8" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={`url(#${voidGradId})`}
          rx={6}
        />

        {/* Ecliptic floor plate */}
        <path
          d={isoOrbitPath(cx, cy, floorR)}
          className="sys-iso-floor"
          fill={`url(#${floorGradId})`}
          stroke="rgba(201,162,39,0.14)"
          strokeWidth={1}
        />
        {/* Soft grid rings on the floor */}
        {[0.35, 0.62, 0.88].map((t) => (
          <path
            key={`grid-${t}`}
            d={isoOrbitPath(cx, cy, floorR * t)}
            fill="none"
            stroke="rgba(122,155,184,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Planet orbits */}
        {planets.map((p, i) => {
          const r = 52 + (i + 1) * ringStep;
          const ringSelected = p.id === selectedPlanetId;
          const ringDimmed = selectedPlanetId !== null && !ringSelected;
          const ringStroke = ringSelected
            ? "rgba(255,224,138,0.55)"
            : ringDimmed
              ? "rgba(201,162,39,0.07)"
              : "rgba(201,162,39,0.22)";
          return (
            <path
              key={`ring-${p.id}`}
              d={isoOrbitPath(cx, cy, r)}
              fill="none"
              stroke={ringStroke}
              strokeWidth={ringSelected ? 1.6 : 1}
              strokeDasharray="4 6"
              className="sys-iso-orbit"
            />
          );
        })}

        {/* System belt — wide invisible hit for gesture place */}
        <path
          d={isoOrbitPath(cx, cy, stationR)}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          className="sys-iso-belt-hit"
          style={{
            cursor: canBuildBelt || onBeltTap ? "crosshair" : "default",
            pointerEvents: canBuildBelt || onBeltTap ? "stroke" : "none",
          }}
          onClick={(e) => {
            if (!onBeltTap || !svgRef.current) return;
            e.stopPropagation();
            const angle = pointerToBeltAngle(
              svgRef.current,
              e.clientX,
              e.clientY,
              cx,
              cy,
            );
            onBeltTap(angle);
          }}
          onContextMenu={(e) => {
            if (!onSchematicContext || !svgRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            const angle = pointerToBeltAngle(
              svgRef.current,
              e.clientX,
              e.clientY,
              cx,
              cy,
            );
            onSchematicContext({
              clientX: e.clientX,
              clientY: e.clientY,
              target: { kind: "belt", beltAngle: angle },
            });
          }}
        />
        <path
          d={isoOrbitPath(cx, cy, stationR)}
          fill="none"
          stroke={
            systemBeltHot
              ? "rgba(232,197,71,0.75)"
              : mineInfo.status === "own"
                ? "rgba(92,219,149,0.45)"
                : "rgba(122,155,184,0.4)"
          }
          strokeWidth={systemBeltHot ? 2.4 : 1.35}
          strokeDasharray="3 5"
          className={`sys-iso-belt${systemBeltHot ? " is-hot" : ""}`}
          style={{ pointerEvents: "none" }}
        />
        <text
          x={beltLabel.x}
          y={beltLabel.y - 10}
          textAnchor="middle"
          className="sys-layer-label"
          fill={
            systemBeltHot
              ? "rgba(232,197,71,0.9)"
              : "rgba(122,155,184,0.75)"
          }
        >
          {systemBeltHot
            ? placingKind
              ? `пояс · тапни куда · ${placingKind}`
              : "пояс · выбери точку"
            : "пояс системы"}
        </text>

        {/* Belt mining status — icon only (pickaxe / idle ring) */}
        {systemRes.length > 0 && (
          <g className="sys-mine-badge" style={{ pointerEvents: "none" }}>
            {(() => {
              const p = orbitToScreen(Math.PI * 0.15, stationR + 22, cx, cy);
              const col =
                mineInfo.status === "own"
                  ? "#5cdb95"
                  : mineInfo.status === "other"
                    ? "#8a96a8"
                    : "#c4a882";
              const title =
                mineInfo.status === "own"
                  ? "Пояс добывается"
                  : mineInfo.status === "other"
                    ? "Чужая добыча"
                    : "Пояс без добычи";
              return (
                <g transform={`translate(${p.x}, ${p.y})`}>
                  <title>{title}</title>
                  <circle
                    r={9}
                    fill="rgba(10,14,20,0.88)"
                    stroke={col}
                    strokeWidth={1.2}
                    strokeDasharray={
                      mineInfo.status === "none" ? "2.5 2" : undefined
                    }
                  />
                  {mineInfo.status === "none" ? (
                    <>
                      <circle r={3.2} fill="none" stroke={col} strokeWidth={1.1} />
                      <line
                        x1={-5}
                        y1={5}
                        x2={5}
                        y2={-5}
                        stroke={col}
                        strokeWidth={1.2}
                      />
                    </>
                  ) : (
                    <g
                      transform="translate(-5,-5) scale(0.42)"
                      fill={col}
                      stroke="none"
                    >
                      {/* pickaxe glyph */}
                      <path d="M14 2l-2 2 4 4 2-2-4-4zm-3 3L4 12l-1 5 5-1 7-7-4-4z" />
                    </g>
                  )}
                </g>
              );
            })()}
          </g>
        )}

        {/* Ghost place marker */}
        {pendingBeltAngle != null && (
          <g className="sys-place-ghost" style={{ pointerEvents: "none" }}>
            {(() => {
              const g = orbitToScreen(pendingBeltAngle, stationR, cx, cy);
              return (
                <>
                  <ellipse
                    cx={g.x}
                    cy={g.y}
                    rx={14}
                    ry={14 * BODY_RY}
                    fill="none"
                    stroke="#e8c547"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <circle cx={g.x} cy={g.y} r={4} fill="#e8c547" opacity={0.85} />
                </>
              );
            })()}
          </g>
        )}

        {renderStarsIso(system.stars, cx, cy, starGlowId, pillarGradId)}

        {drawItems.map((item) => {
          if (item.kind === "planet") {
            return renderPlanetIso({
              planet: item.planet,
              index: item.index,
              ringStep,
              cx,
              cy,
              selectedPlanetId,
              previewPlanetId,
              playerFactionId,
              systemOwnerId: system.ownerFactionId,
              factionColor,
              colonyGlyph,
              lastPlanetTap,
              onSelectPlanet,
              onPlanetPreview,
              onPlanetDrill,
              onSelectStation,
              onSchematicContext,
            });
          }
          if (item.kind === "deposit") {
            const n = Math.max(systemRes.length, 1);
            const di = systemRes.indexOf(item.resId);
            const depositAngle =
              -Math.PI / 2 + ((Math.max(di, 0) + 0.5) / n) * Math.PI * 2;
            return renderDepositIso({
              resId: item.resId,
              px: item.px,
              py: item.py,
              beltAngle: depositAngle,
              selectedFeature,
              highlightId: previewPlanetId ?? selectedPlanetId,
              mapResourceNames,
              beltMined: mineInfo.status !== "none",
              canOfferMining: mineInfo.status === "none" && !!onDepositBuildMining,
              onSelectStation,
              onSelectFeature,
              onDepositBuildMining,
              onSchematicContext,
            });
          }
          if (item.kind === "poi") {
            return renderPoiIso({
              tag: item.tag,
              index: item.index,
              px: item.px,
              py: item.py,
              selectedFeature,
              onSelectStation,
              onSelectFeature,
              onSchematicContext,
            });
          }
          return renderStationIso({
            st: item.station,
            px: item.px,
            py: item.py,
            anchored: item.anchored,
            selectedStationId,
            stationColor,
            onSelectStation,
            onSelectFeature,
            onSchematicContext,
          });
        })}

        {renderForcesIso(
          fleets,
          legions,
          factions,
          forceR,
          cx,
          cy,
          playerFactionId,
          selectedFleetId,
          selectedLegionId,
          onSelectFleet,
          onSelectLegion,
        )}
      </svg>
      <div className="sys-schematic-legend">
        <span>
          <i className="layer-dot layer-dot--planet" /> поверхность
        </span>
        <span>
          <i className="layer-dot layer-dot--orbit" /> орбита мира
        </span>
        <span>
          <i className="layer-dot layer-dot--system" /> пояс системы
        </span>
        <span className="hint">iso · как на карте галактики</span>
      </div>
      <p className="hint sys-schematic-hint">
        {onPlanetDrill
          ? "Тап планеты — осмотр · двойной тап — управление · ПКМ — действия на месте."
          : "Клик по планете — карточка. «Полная правка» внизу — звёзды, станции, владение."}
      </p>
    </div>
  );
}

function renderPlanetIso({
  planet: p,
  index: i,
  ringStep,
  cx,
  cy,
  selectedPlanetId,
  previewPlanetId,
  playerFactionId,
  systemOwnerId,
  factionColor,
  colonyGlyph,
  lastPlanetTap,
  onSelectPlanet,
  onPlanetPreview,
  onPlanetDrill,
  onSelectStation,
  onSchematicContext,
}: {
  planet: Planet;
  index: number;
  ringStep: number;
  cx: number;
  cy: number;
  selectedPlanetId: string | null;
  previewPlanetId: string | null;
  playerFactionId: string | null;
  systemOwnerId: string | null;
  factionColor: (id: string | null | undefined) => string;
  colonyGlyph: (ct: string | undefined) => string;
  lastPlanetTap: MutableRefObject<{ id: string; t: number } | null>;
  onSelectPlanet: (id: string | null) => void;
  onPlanetPreview?: (id: string) => void;
  onPlanetDrill?: (id: string) => void;
  onSelectStation?: (id: string | null) => void;
  onSchematicContext?: (ev: SchematicContextEvent) => void;
}) {
  const r = 52 + (i + 1) * ringStep;
  const { x: px, y: py } = orbitToScreen(planetAngle(i), r, cx, cy);
  const bodyR = 7 * (p.size ?? 1);
  const rx = bodyR;
  const ry = bodyR * BODY_RY;
  const drilled = p.id === selectedPlanetId;
  const previewed = p.id === previewPlanetId;
  const selected = drilled || previewed;
  const focusId = selectedPlanetId ?? previewPlanetId;
  const dimmed = focusId !== null && !selected;
  const planetFill = PLANET_TYPE_COLORS[p.type] ?? "#889";
  const habit = classifyPlanet(p);
  const effectiveOwner = p.ownerFactionId || systemOwnerId;
  const ownerColor = effectiveOwner
    ? factionColor(effectiveOwner)
    : null;
  const isOwnColony =
    !!playerFactionId &&
    effectiveOwner === playerFactionId &&
    (habit === "inhabited" ||
      (p.population ?? 0) > 0 ||
      (!!p.colonyType && p.colonyType !== "none"));
  const ringColor = selected
    ? "#ffe08a"
    : isOwnColony
      ? ownerColor || "#5cdb95"
      : (ownerColor ??
        (habit === "inhabited"
          ? "#5cdb95"
          : habit === "habitable"
            ? "#f0c14a"
            : "rgba(255,255,255,0.15)"));
  const glyph = colonyGlyph(p.colonyType);
  const nSurf = p.surfaceBuildings?.length ?? 0;
  const nOrb = p.orbitalBuildings?.length ?? 0;
  const nRes = p.resources?.length ?? 0;
  const planetClass = [
    "sys-planet-hit",
    "sys-planet-hit--iso",
    selected && "is-selected",
    drilled && "is-drilled",
    isOwnColony && "is-own-colony",
    dimmed && "is-dimmed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      key={p.id}
      className={planetClass}
      opacity={dimmed ? 0.35 : 1}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectStation?.(null);
        const now = performance.now();
        const prev = lastPlanetTap.current;
        const isDouble =
          prev &&
          prev.id === p.id &&
          now - prev.t <= GESTURE.doubleTapMs;
        lastPlanetTap.current = { id: p.id, t: now };
        if (isDouble && onPlanetDrill) {
          onPlanetDrill(p.id);
          return;
        }
        if (onPlanetPreview) {
          onPlanetPreview(p.id);
          return;
        }
        onSelectPlanet(p.id);
      }}
      onContextMenu={(e) => {
        if (!onSchematicContext) return;
        e.preventDefault();
        e.stopPropagation();
        onSchematicContext({
          clientX: e.clientX,
          clientY: e.clientY,
          target: { kind: "planet", planetId: p.id },
        });
      }}
    >
      {/* Floor contact shadow */}
      <ellipse
        cx={px}
        cy={py + ry * 0.35}
        rx={rx * (isOwnColony ? 1.35 : 1.15)}
        ry={ry * (isOwnColony ? 0.7 : 0.55)}
        fill={
          isOwnColony
            ? "rgba(201,162,39,0.22)"
            : "rgba(0,0,0,0.35)"
        }
        style={{ pointerEvents: "none" }}
      />
      {isOwnColony && (
        <ellipse
          cx={px}
          cy={py}
          rx={rx + 14}
          ry={(rx + 14) * BODY_RY}
          fill="none"
          stroke={ownerColor || "#c9a227"}
          strokeWidth={2.2}
          opacity={0.85}
          className="sys-own-colony-ring"
        />
      )}
      {/* Orbital buildings micro-ring */}
      <ellipse
        cx={px}
        cy={py}
        rx={rx + 9}
        ry={(rx + 9) * BODY_RY}
        fill="none"
        stroke={
          isOwnColony
            ? "rgba(232,197,71,0.55)"
            : "rgba(126,200,217,0.35)"
        }
        strokeWidth={isOwnColony ? 1.4 : 1}
        strokeDasharray="2 3"
      />
      {selected && (
        <ellipse
          cx={px}
          cy={py}
          rx={rx + 6}
          ry={(rx + 6) * BODY_RY}
          fill={planetFill}
          opacity={0.18}
        />
      )}
      <ellipse
        cx={px}
        cy={py}
        rx={rx + (selected ? 5 : isOwnColony ? 3.5 : 2)}
        ry={(rx + (selected ? 5 : isOwnColony ? 3.5 : 2)) * BODY_RY}
        fill="none"
        stroke={ringColor}
        strokeWidth={selected ? 2.5 : isOwnColony ? 2 : 1}
        opacity={selected ? 1 : dimmed ? 0.6 : 1}
      />
      <ellipse cx={px} cy={py} rx={rx} ry={ry} fill={planetFill} />
      {/* Soft top highlight — sphere read */}
      <ellipse
        cx={px - rx * 0.2}
        cy={py - ry * 0.35}
        rx={rx * 0.35}
        ry={ry * 0.28}
        fill="rgba(255,255,255,0.22)"
        style={{ pointerEvents: "none" }}
      />
      {glyph && (
        <text
          x={px}
          y={py + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={bodyR * (isOwnColony ? 1.15 : 1.05)}
          fontWeight="700"
          fill="#0a0e14"
          style={{
            pointerEvents: "none",
            fontFamily: "Rajdhani, Segoe UI, sans-serif",
          }}
        >
          {glyph}
        </text>
      )}
      {isOwnColony && (
        <text
          x={px}
          y={py + ry + 22}
          textAnchor="middle"
          className="sys-own-colony-tag"
          fill={ownerColor || "#c9a227"}
          fontSize="8"
          fontWeight="700"
          style={{
            pointerEvents: "none",
            fontFamily: "Rajdhani, Segoe UI, sans-serif",
          }}
        >
          ваш мир
        </text>
      )}
      {nSurf > 0 && (
        <circle
          cx={px + rx * 0.75}
          cy={py - ry * 0.7}
          r={2.6}
          fill="#c9a227"
          stroke="#0a0e14"
          strokeWidth={0.8}
        >
          <title>Поверхность: {nSurf}</title>
        </circle>
      )}
      {nOrb > 0 && (
        <circle
          cx={px + rx * 0.9}
          cy={py + ry * 0.2}
          r={2.6}
          fill="#6ec8d9"
          stroke="#0a0e14"
          strokeWidth={0.8}
        >
          <title>Орбита мира: {nOrb}</title>
        </circle>
      )}
      {nRes > 0 && (
        <text
          x={px - rx - 2}
          y={py - ry - 2}
          fontSize="8"
          fill="#c4a882"
          style={{ pointerEvents: "none" }}
        >
          ◆{nRes}
        </text>
      )}
      <text
        x={px}
        y={py + ry + 12}
        textAnchor="middle"
        className="sys-planet-label"
        fillOpacity={dimmed ? 0.45 : 1}
      >
        {p.name}
      </text>
    </g>
  );
}

function renderDepositIso({
  resId,
  px,
  py,
  beltAngle,
  selectedFeature,
  highlightId,
  mapResourceNames,
  beltMined,
  canOfferMining,
  onSelectStation,
  onSelectFeature,
  onDepositBuildMining,
  onSchematicContext,
}: {
  resId: string;
  px: number;
  py: number;
  beltAngle: number;
  selectedFeature: SchematicFeature | null;
  highlightId: string | null;
  mapResourceNames?: Record<string, string>;
  beltMined: boolean;
  canOfferMining: boolean;
  onSelectStation?: (id: string | null) => void;
  onSelectFeature?: (f: SchematicFeature | null) => void;
  onDepositBuildMining?: (resourceId: string) => void;
  onSchematicContext?: (ev: SchematicContextEvent) => void;
}) {
  const disp = resolveResourceDisplay(resId);
  const label = mapResourceNames?.[resId] ?? disp.name;
  const short = label.length > 10 ? `${label.slice(0, 9)}…` : label;
  const iconHref = disp.iconUrl ?? mapIconUrl("ore");
  const selected =
    selectedFeature?.kind === "deposit" &&
    selectedFeature.resourceId === resId;
  const planetFocus = highlightId !== null && !selected;
  const stroke = beltMined ? "rgba(196,168,130,0.55)" : "#c4a882";

  return (
    <g
      key={`res:${resId}`}
      className={[
        "sys-deposit-hit",
        selected && "is-selected",
        planetFocus && "is-recessed",
        !beltMined && "is-idle",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ cursor: "pointer" }}
      opacity={planetFocus ? 0.28 : selected ? 1 : 0.55}
      onPointerDown={(e) => {
        depositHold.set(resId, {
          t: performance.now(),
          x: e.clientX,
          y: e.clientY,
        });
      }}
      onPointerUp={(e) => {
        const start = depositHold.get(resId);
        depositHold.delete(resId);
        if (!start) return;
        const dt = performance.now() - start.t;
        const moved =
          Math.hypot(e.clientX - start.x, e.clientY - start.y) >
          GESTURE.longPressMoveTolerancePx;
        if (
          !moved &&
          dt >= GESTURE.longPressMs &&
          canOfferMining &&
          onDepositBuildMining
        ) {
          e.stopPropagation();
          onDepositBuildMining(resId);
        }
      }}
      onPointerLeave={() => depositHold.delete(resId)}
      onClick={(e) => {
        e.stopPropagation();
        onSelectStation?.(null);
        const next: SchematicFeature = {
          kind: "deposit",
          resourceId: resId,
        };
        onSelectFeature?.(selected ? null : next);
      }}
      onContextMenu={(e) => {
        if (!onSchematicContext) return;
        e.preventDefault();
        e.stopPropagation();
        onSchematicContext({
          clientX: e.clientX,
          clientY: e.clientY,
          target: { kind: "deposit", resourceId: resId, beltAngle },
        });
      }}
    >
      <ellipse
        cx={px}
        cy={py + 3}
        rx={7}
        ry={2.8}
        fill="rgba(0,0,0,0.28)"
        style={{ pointerEvents: "none" }}
      />
      <circle cx={px} cy={py} r={14} fill="transparent" />
      {selected && (
        <ellipse
          cx={px}
          cy={py}
          rx={11}
          ry={11 * BODY_RY}
          fill="none"
          stroke="#e8c547"
          strokeWidth={1.3}
        />
      )}
      <circle
        cx={px}
        cy={py}
        r={6}
        fill="rgba(10,14,20,0.9)"
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={!beltMined ? "2 2" : undefined}
      />
      {iconHref && (
        <image
          href={iconHref}
          x={px - 4.5}
          y={py - 4.5}
          width={9}
          height={9}
          style={{ pointerEvents: "none" }}
          opacity={0.8}
        />
      )}
      {/* Mining status mark — icon only */}
      <g
        transform={`translate(${px + 7}, ${py - 7})`}
        style={{ pointerEvents: "none" }}
      >
        <circle
          r={5}
          fill="rgba(8,12,18,0.92)"
          stroke={beltMined ? "rgba(92,219,149,0.75)" : "rgba(196,168,130,0.7)"}
          strokeWidth={0.9}
        />
        {beltMined ? (
          <g transform="translate(-3.2,-3.2) scale(0.27)" fill="#5cdb95">
            <path d="M14 2l-2 2 4 4 2-2-4-4zm-3 3L4 12l-1 5 5-1 7-7-4-4z" />
          </g>
        ) : (
          <>
            <circle r={1.8} fill="none" stroke="#c4a882" strokeWidth={0.8} />
            <line
              x1={-2.6}
              y1={2.6}
              x2={2.6}
              y2={-2.6}
              stroke="#c4a882"
              strokeWidth={0.9}
            />
          </>
        )}
      </g>
      {selected && (
        <text
          x={px}
          y={py + 16}
          textAnchor="middle"
          className="sys-feature-label"
        >
          {short}
        </text>
      )}
      <title>
        {label}
        {beltMined ? " · добывается" : " · без добычи"}
        {canOfferMining ? " · ПКМ / зажми → mining" : ""}
      </title>
    </g>
  );
}

function renderPoiIso({
  tag,
  index,
  px,
  py,
  selectedFeature,
  onSelectStation,
  onSelectFeature,
  onSchematicContext,
}: {
  tag: SystemPoiType;
  index: number;
  px: number;
  py: number;
  selectedFeature: SchematicFeature | null;
  onSelectStation?: (id: string | null) => void;
  onSelectFeature?: (f: SchematicFeature | null) => void;
  onSchematicContext?: (ev: SchematicContextEvent) => void;
}) {
  const full = SYSTEM_POI_LABELS[tag] ?? tag;
  const short = poiShortLabel(tag);
  const selected =
    selectedFeature?.kind === "poi" &&
    selectedFeature.tag === tag &&
    selectedFeature.index === index;
  return (
    <g
      key={`poi:${tag}:${index}`}
      className={`sys-poi-hit${selected ? " is-selected" : ""}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectStation?.(null);
        const next: SchematicFeature = { kind: "poi", tag, index };
        onSelectFeature?.(selected ? null : next);
      }}
      onContextMenu={(e) => {
        if (!onSchematicContext) return;
        e.preventDefault();
        e.stopPropagation();
        onSchematicContext({
          clientX: e.clientX,
          clientY: e.clientY,
          target: { kind: "poi", tag, index },
        });
      }}
    >
      <ellipse
        cx={px}
        cy={py + 5}
        rx={11}
        ry={4}
        fill="rgba(0,0,0,0.28)"
        style={{ pointerEvents: "none" }}
      />
      <circle cx={px} cy={py} r={18} fill="transparent" />
      {selected && (
        <ellipse
          cx={px}
          cy={py}
          rx={14}
          ry={14 * BODY_RY}
          fill="none"
          stroke="#e8c547"
          strokeWidth={1.4}
        />
      )}
      {renderPoiGlyph(tag, px, py)}
      <text
        x={px}
        y={py + 20}
        textAnchor="middle"
        className="sys-feature-label sys-feature-label--poi"
      >
        {short}
      </text>
      <title>{full}</title>
    </g>
  );
}

function renderStationIso({
  st,
  px,
  py,
  anchored,
  selectedStationId,
  stationColor,
  onSelectStation,
  onSelectFeature,
  onSchematicContext,
}: {
  st: OrbitalStation;
  px: number;
  py: number;
  anchored: Planet | null;
  selectedStationId: string | null;
  stationColor: (kind: string) => string;
  onSelectStation?: (id: string | null) => void;
  onSelectFeature?: (f: SchematicFeature | null) => void;
  onSchematicContext?: (ev: SchematicContextEvent) => void;
}) {
  const col = stationColor(st.kind);
  const selected = st.id === selectedStationId;
  /** Iso tile: diamond footprint + short pillar. */
  const tile = 7;
  return (
    <g
      key={st.id}
      className="sys-station-hit sys-station-hit--iso"
      style={{ cursor: onSelectStation ? "pointer" : "default" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectFeature?.(null);
        onSelectStation?.(selected ? null : st.id);
      }}
      onContextMenu={(e) => {
        if (!onSchematicContext) return;
        e.preventDefault();
        e.stopPropagation();
        onSchematicContext({
          clientX: e.clientX,
          clientY: e.clientY,
          target: { kind: "station", stationId: st.id },
        });
      }}
    >
      <ellipse
        cx={px}
        cy={py + 5}
        rx={9}
        ry={3.5}
        fill="rgba(0,0,0,0.32)"
        style={{ pointerEvents: "none" }}
      />
      {selected && (
        <ellipse
          cx={px}
          cy={py}
          rx={12}
          ry={12 * BODY_RY}
          fill="none"
          stroke="#e8c547"
          strokeWidth={1.5}
        />
      )}
      {/* Tile top (iso diamond) */}
      <path
        d={`M ${px} ${py - tile * 0.55}
            L ${px + tile} ${py}
            L ${px} ${py + tile * 0.55}
            L ${px - tile} ${py} Z`}
        fill={col}
        stroke="#0a0e14"
        strokeWidth={1.1}
      />
      {/* Short pillar face */}
      <path
        d={`M ${px - tile} ${py}
            L ${px} ${py + tile * 0.55}
            L ${px} ${py + tile * 0.55 + 5}
            L ${px - tile} ${py + 5} Z`}
        fill={col}
        opacity={0.55}
        stroke="#0a0e14"
        strokeWidth={0.8}
      />
      <path
        d={`M ${px + tile} ${py}
            L ${px} ${py + tile * 0.55}
            L ${px} ${py + tile * 0.55 + 5}
            L ${px + tile} ${py + 5} Z`}
        fill={col}
        opacity={0.35}
        stroke="#0a0e14"
        strokeWidth={0.8}
      />
      <title>
        {st.name} · {stationKindLabel(st.kind)}
        {anchored ? ` · ось ${anchored.name}` : " · пояс системы"}
      </title>
    </g>
  );
}

function poiShortLabel(tag: SystemPoiType): string {
  const full = SYSTEM_POI_LABELS[tag] ?? tag;
  const first = full.split(/[|/]/)[0]?.trim() ?? full;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

function poiColor(tag: SystemPoiType): string {
  switch (tag) {
    case "anomaly":
    case "wormhole":
    case "storm":
      return "#b388ff";
    case "pirate":
    case "frontline":
    case "minefield":
      return "#e85d4c";
    case "asteroid":
    case "debris":
    case "mining_platform":
      return "#c4a882";
    case "hub":
    case "beacon":
    case "quest":
      return "#e8c547";
    case "nebula":
    case "sanctuary":
    case "agronomy":
      return "#5cdb95";
    case "shipyard":
    case "relay":
    case "science_arch":
      return "#6ec8d9";
    default:
      return "#a8c0e0";
  }
}

function renderPoiGlyph(tag: SystemPoiType, px: number, py: number) {
  const col = poiColor(tag);
  const href = mapIconUrl(poiIconId(tag) ?? "vortex");
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle
        cx={px}
        cy={py}
        r={10}
        fill="rgba(10,14,20,0.9)"
        stroke={col}
        strokeWidth={1.5}
      />
      {href ? (
        <image href={href} x={px - 8} y={py - 8} width={16} height={16} />
      ) : (
        <circle cx={px} cy={py} r={3.5} fill={col} />
      )}
    </g>
  );
}

function renderForcesIso(
  fleets: Fleet[],
  legions: Legion[],
  factions: Faction[],
  forceR: number,
  cx: number,
  cy: number,
  playerFactionId: string | null,
  selectedFleetId: string | null,
  selectedLegionId: string | null,
  onSelectFleet?: (id: string) => void,
  onSelectLegion?: (id: string) => void,
) {
  const total = fleets.length + legions.length;
  if (total === 0) return null;
  const col = (id: string | null | undefined) =>
    (id && factions.find((f) => f.id === id)?.color) || "#8a96a8";
  const items: {
    kind: "fleet" | "legion";
    id: string;
    factionId: string;
    name: string;
  }[] = [
    ...fleets.map((f) => ({
      kind: "fleet" as const,
      id: f.id,
      factionId: f.factionId,
      name: f.name,
    })),
    ...legions.map((l) => ({
      kind: "legion" as const,
      id: l.id,
      factionId: l.factionId,
      name: l.name,
    })),
  ];

  const placed = items.map((it, i) => {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    const pos = orbitToScreen(angle, forceR, cx, cy);
    return { ...it, px: pos.x, py: pos.y };
  });
  placed.sort((a, b) => a.py - b.py);

  return (
    <g className="sys-forces-iso">
      <path
        d={isoOrbitPath(cx, cy, forceR)}
        fill="none"
        stroke="rgba(120,140,170,0.14)"
        strokeWidth={1}
        strokeDasharray="1 5"
      />
      {placed.map((it) => {
        const color = col(it.factionId);
        const isOwn = playerFactionId && it.factionId === playerFactionId;
        const selected =
          it.kind === "fleet"
            ? it.id === selectedFleetId
            : it.id === selectedLegionId;
        const interactive =
          isOwn &&
          ((it.kind === "fleet" && onSelectFleet) ||
            (it.kind === "legion" && onSelectLegion));
        const { px, py } = it;
        return (
          <g
            key={`${it.kind}:${it.id}`}
            style={{ cursor: interactive ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              if (it.kind === "fleet" && interactive && onSelectFleet)
                onSelectFleet(it.id);
              else if (it.kind === "legion" && interactive && onSelectLegion)
                onSelectLegion(it.id);
            }}
          >
            <ellipse
              cx={px}
              cy={py + 5}
              rx={7}
              ry={2.8}
              fill="rgba(0,0,0,0.3)"
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={px}
              cy={py}
              r={selected ? 8 : 6}
              fill={color}
              stroke={selected ? "#ffe08a" : "#0a0e14"}
              strokeWidth={selected ? 2 : 1.2}
            />
            <text
              x={px}
              y={py + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="700"
              fill="#0a0e14"
              style={{
                pointerEvents: "none",
                fontFamily: "Rajdhani, Segoe UI, sans-serif",
              }}
            >
              {it.kind === "fleet" ? "✦" : "⚑"}
            </text>
            <text
              x={px}
              y={py + 14}
              textAnchor="middle"
              className="sys-feature-label"
              style={{ pointerEvents: "none" }}
            >
              {it.name.length > 12 ? `${it.name.slice(0, 11)}…` : it.name}
            </text>
            <title>
              {it.name} · {it.kind === "fleet" ? "флот" : "легион"}
              {interactive ? "" : " (чужой)"}
            </title>
          </g>
        );
      })}
    </g>
  );
}

function renderStarsIso(
  stars: StarBody[],
  cx: number,
  cy: number,
  starGlowId: string,
  pillarGradId: string,
) {
  if (!stars.length) {
    return (
      <g>
        <ellipse
          cx={cx}
          cy={cy}
          rx={14}
          ry={14 * BODY_RY}
          fill="#445"
        />
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          className="sys-planet-label"
        >
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
            [-12, 2],
            [12, -2],
          ]
        : [
            [-14, 4],
            [0, -8],
            [14, 4],
          ];

  return (
    <g className="sys-star-pillar">
      {/* Ecliptic light pool */}
      <ellipse
        cx={cx}
        cy={cy + 2}
        rx={28}
        ry={28 * BODY_RY}
        fill={`url(#${starGlowId})`}
        opacity={0.85}
      />
      {/* Vertical pillar of light */}
      <rect
        x={cx - 7}
        y={cy - 48}
        width={14}
        height={50}
        fill={`url(#${pillarGradId})`}
        className="sys-star-pillar__beam"
        style={{ pointerEvents: "none" }}
      />
      {stars.map((st, i) => {
        const [dx, dy] = offsets[i] ?? [0, 0];
        const r = 10 + Math.min(st.luminosity, 2) * 4;
        const starColor = STAR_FILL[st.class] ?? "#ffd56a";
        const sx = cx + dx;
        const sy = cy + dy - 6;
        return (
          <g key={i}>
            <ellipse
              cx={sx}
              cy={cy + 3}
              rx={r * 0.9}
              ry={r * 0.35}
              fill="rgba(0,0,0,0.35)"
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={sx}
              cy={sy}
              r={r + 12}
              fill={`url(#${starGlowId})`}
            />
            <circle
              cx={sx}
              cy={sy}
              r={r + 4}
              fill={starColor}
              opacity={0.28}
            />
            <circle cx={sx} cy={sy} r={r} fill={starColor} />
            <ellipse
              cx={sx - r * 0.22}
              cy={sy - r * 0.28}
              rx={r * 0.28}
              ry={r * 0.18}
              fill="rgba(255,255,255,0.35)"
              style={{ pointerEvents: "none" }}
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
