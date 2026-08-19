import { useEffect, useMemo, useRef, useState } from "react";
import type { Planet, PlanetBuildingZone } from "../state/types";
import { PLANET_BUILDING_KIND_LABELS } from "../state/defaults";
import type { BuildingDef, PlanetActionRequest } from "./PlayerPlanetManage";
import { canFactionBuildDef } from "../state/buildingAccess";
import { planetAllowsBuildingBiome } from "../state/biomeMatch";
import { canBuildWithTech, type TechEcoSlice } from "../state/techGate";
import {
  MAX_PLANET_GRADE,
  planetOrbitalGrade,
  planetSurfaceGrade,
} from "../state/planetGrade";
import { intentApCost } from "../state/contentCatalog";
import { GESTURE } from "../ui/gestureMap";
import { BuildingKindIcon, buildingKindColor } from "./BuildingKindIcon";
import { LaborPips, laborPipStyle } from "./LaborPips";
import {
  buildingStaffedUnits,
  consumesLabor,
} from "../state/planetLabor";
import { BuildDeck } from "./BuildDeck";
import { FloatingPanel } from "../ui/FloatingPanel";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import { createPortal } from "react-dom";

/**
 * Radial planet building UI.
 * Tap empty slot → build deck.
 * Drag card onto slot to build; hold card also commits.
 * Tap + on the ring to buy the next slot grade.
 * Long-press / RMB occupied → hold-to-demolish.
 */

type RingZone = "surface" | "orbital";
type PaletteZone = PlanetBuildingZone;

const ZONE_CHIP_LABEL: Record<PaletteZone, string> = {
  surface: "Поверхность",
  subsurface: "Недра",
  deep: "Глубина",
  orbital: "Орбита",
};

const ZONE_BADGE: Record<PaletteZone, string> = {
  surface: "П",
  orbital: "О",
  subsurface: "Н",
  deep: "Г",
};

/** Unlocked surface slots — grade-derived, set by the server. */
export function surfaceSlotsMax(planet: Planet): number {
  return planet.surfaceSlots ?? 8;
}

/** Unlocked orbital slots — grade-derived, set by the server. */
export function orbitalSlotsMax(planet: Planet): number {
  return planet.orbitalSlots ?? 4;
}

type SlotState = "occupied" | "empty-open" | "expandable" | "blocked";

interface Slot {
  zone: RingZone;
  index: number;
  state: SlotState;
  buildingId?: string;
  buildingName?: string;
  buildingKind?: string;
  buildingInstanceId?: string;
  contentZone?: PaletteZone;
}

function resolveContentZone(
  b: { zone?: string; name?: string; kind?: string },
  ring: RingZone,
  buildings: Record<string, BuildingDef>,
): PaletteZone {
  const z = b.zone as PaletteZone | undefined;
  if (z === "subsurface" || z === "deep" || z === "orbital" || z === "surface") {
    if (z !== "surface" || ring === "orbital") return z;
  }
  const byName = Object.values(buildings).find((d) => d.name === b.name);
  if (byName) return byName.zone;
  return ring;
}

export function buildPlanetRingSlots(
  planet: Planet,
  zone: RingZone,
  buildings: Record<string, BuildingDef>,
): Slot[] {
  const list =
    zone === "surface" ? planet.surfaceBuildings ?? [] : planet.orbitalBuildings ?? [];
  const unlocked =
    zone === "surface" ? planet.surfaceSlots ?? 8 : planet.orbitalSlots ?? 4;
  const grade =
    zone === "surface" ? planetSurfaceGrade(planet) : planetOrbitalGrade(planet);
  const canExpand = grade < MAX_PLANET_GRADE;
  const ringCount = Math.max(unlocked, list.length);
  const slots: Slot[] = [];
  for (let i = 0; i < ringCount; i++) {
    const b = list[i];
    if (b) {
      slots.push({
        zone,
        index: i,
        state: "occupied",
        buildingId: b.id,
        buildingName: b.name,
        buildingKind: b.kind,
        buildingInstanceId: b.id,
        contentZone: resolveContentZone(b, zone, buildings),
      });
    } else {
      slots.push({ zone, index: i, state: "empty-open" });
    }
  }
  if (canExpand) {
    slots.push({ zone, index: ringCount, state: "expandable" });
  }
  return slots;
}

function buildSlots(
  planet: Planet,
  zone: RingZone,
  buildings: Record<string, BuildingDef>,
): Slot[] {
  return buildPlanetRingSlots(planet, zone, buildings);
}

function slotBuilding(
  planet: Planet,
  slot: Slot,
) {
  const list =
    slot.zone === "orbital"
      ? planet.orbitalBuildings
      : planet.surfaceBuildings;
  return list?.[slot.index];
}

function slotBuildingDef(
  planet: Planet,
  slot: Slot,
  buildings: Record<string, BuildingDef>,
): BuildingDef | undefined {
  const b = slotBuilding(planet, slot);
  if (!b) return undefined;
  if (b.buildingId && buildings[b.buildingId]) return buildings[b.buildingId];
  return Object.values(buildings).find((d) => d.kind === b.kind);
}
const SLOT_R = 14;
const SLOT_GAP = 8;
const DISC_R = 44;
/** Surface sits on the world — closer to the disc. */
const SURFACE_R_MIN = 80;
/** Orbit wraps the world — further out than surface. */
const ORBITAL_R_MIN = 122;
const PAD = 22;

function ringRadius(minR: number, total: number): number {
  if (total <= 1) return minR;
  const need = (total * (2 * SLOT_R + SLOT_GAP)) / (2 * Math.PI);
  return Math.max(minR, need);
}

function layoutRadii(surfaceN: number, orbitalN: number) {
  const surfaceR = ringRadius(SURFACE_R_MIN, Math.max(surfaceN, 1));
  let orbitalR = ringRadius(ORBITAL_R_MIN, Math.max(orbitalN, 1));
  orbitalR = Math.max(orbitalR, surfaceR + 2 * SLOT_R + 18);
  const size = Math.ceil((orbitalR + SLOT_R + PAD) * 2);
  return { size, center: size / 2, surfaceR, orbitalR };
}

function slotPosition(
  zone: RingZone,
  index: number,
  total: number,
  center: number,
  surfaceR: number,
  orbitalR: number,
): { x: number; y: number } {
  const r = zone === "surface" ? surfaceR : orbitalR;
  const n = Math.max(total, 1);
  const a = (index / n) * Math.PI * 2 - Math.PI / 2;
  return { x: center + Math.cos(a) * r, y: center + Math.sin(a) * r };
}

function slotKey(zone: RingZone, index: number) {
  return `${zone}:${index}`;
}

export type PlanetRadialInspect = {
  instanceId: string;
  name: string;
  kind?: string;
  zone: RingZone;
};

export function PlanetRadialSlots({
  planet,
  systemId,
  planetId,
  factionId,
  raceIds,
  buildings,
  stocks,
  reservedAp,
  apMax,
  techEco,
  busy,
  onAction,
  onInspect,
  onOpenResearch,
  highlightCategory,
  highlightBuildingIds,
  onSelectBuilding,
  laborPickFrom,
  laborDragging,
  onLaborPickBuilding,
  onLaborDragBuilding,
  onLaborTapBuilding,
  gmFree = false,
  deckMode = "float",
}: {
  planet: Planet;
  systemId: string;
  planetId: string;
  factionId?: string;
  raceIds?: string[];
  buildings: Record<string, BuildingDef>;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  techEco?: TechEcoSlice;
  busy?: boolean;
  onAction: (req: PlanetActionRequest) => void;
  onInspect?: (info: PlanetRadialInspect | null) => void;
  onOpenResearch?: (techId: string) => void;
  highlightCategory?: string | null;
  highlightBuildingIds?: string[];
  onSelectBuilding?: (buildingId: string) => void;
  laborPickFrom?: string | null;
  laborDragging?: boolean;
  onLaborPickBuilding?: (instanceId: string, amount: number) => void;
  onLaborDragBuilding?: (
    instanceId: string,
    x: number,
    y: number,
    amount: number,
  ) => void;
  onLaborTapBuilding?: (instanceId: string) => void;
  /** GM: no tech/AP/biome gate, full live catalog. */
  gmFree?: boolean;
  /** float = overlay deck; dock = right column; none = rings only. */
  deckMode?: "float" | "dock" | "none";
}) {
  const surfaceSlots = buildSlots(planet, "surface", buildings);
  const orbitalSlots = buildSlots(planet, "orbital", buildings);
  const layout = useMemo(
    () => layoutRadii(surfaceSlots.length, orbitalSlots.length),
    [surfaceSlots.length, orbitalSlots.length],
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [openSlot, setOpenSlot] = useState<{ zone: RingZone; index: number } | null>(
    null,
  );
  const [inspectKey, setInspectKey] = useState<string | null>(null);
  const [paletteZone, setPaletteZone] = useState<PaletteZone>("surface");
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [demolishSlot, setDemolishSlot] = useState<Slot | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    name: string;
    meta: string;
  } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const dragActive = useRef(false);

  useEffect(() => {
    setOpenSlot(null);
    setInspectKey(null);
    setSelectedBuildId(null);
    setDemolishSlot(null);
    setHoverTip(null);
    onInspect?.(null);
  }, [planetId]);

  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || layout.size <= 0) return;
      const byW = w / layout.size;
      const byH = h > 0 ? h / layout.size : byW;
      setFitScale(Math.min(1, byW, byH));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.size]);

  useEffect(() => {
    const id = highlightBuildingIds?.[0];
    if (id && buildings[id]) {
      setSelectedBuildId(id);
      const zone = buildings[id].zone;
      if (zone === "orbital") setPaletteZone("orbital");
      else setPaletteZone("surface");
    }
  }, [highlightBuildingIds, buildings]);

  const catalog = useMemo(() => {
    const fid = factionId ?? "";
    return (zone: PaletteZone) =>
      Object.values(buildings).filter((b) => {
        if (b.zone !== zone) return false;
        const row = b as BuildingDef & { catalogPending?: boolean; stub?: boolean };
        if (row.catalogPending || row.stub) return false;
        if (gmFree) return true;
        return (
          canFactionBuildDef(b, fid, { raceIds }) &&
          canBuildWithTech(techEco, b).ok &&
          planetAllowsBuildingBiome(planet, b.biome_restrictions)
        );
      });
  }, [buildings, factionId, raceIds, techEco, planet, gmFree]);

  const apLeft = Math.max(0, apMax - reservedAp);

  const deckDefs = useMemo(() => {
    if (deckMode === "none") return [];
    if (deckMode === "float" && !openSlot) return [];
    const zoneForCatalog: PaletteZone =
      openSlot?.zone === "orbital" ? "orbital" : paletteZone;
    return catalog(zoneForCatalog);
  }, [deckMode, openSlot, paletteZone, catalog]);

  const zoneForDeck: PaletteZone =
    openSlot?.zone === "orbital" ? "orbital" : paletteZone;

  useEffect(() => {
    setSelectedBuildId(null);
  }, [openSlot, paletteZone]);

  useEffect(() => {
    if (!openSlot && !inspectKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenSlot(null);
        setSelectedBuildId(null);
        setInspectKey(null);
        onInspect?.(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSlot, inspectKey, onInspect]);

  const canAfford = (def: BuildingDef) => {
    if (gmFree) return true;
    const needAp = intentApCost("intent.build");
    const needM = def.cost?.["currency.metal"] ?? 0;
    const needS = def.cost?.["currency.supply"] ?? 0;
    return (
      (needAp <= 0 || apLeft >= needAp) &&
      (stocks["currency.metal"] ?? 0) >= needM &&
      (stocks["currency.supply"] ?? 0) >= needS
    );
  };

  const tryBuild = (defId: string): boolean => {
    if (busy && !gmFree) return false;
    const def = buildings[defId];
    if (!def || !canAfford(def)) return false;
    onAction({
      action: "build",
      systemId,
      planetId,
      buildingId: defId,
    });
    setOpenSlot(null);
    setSelectedBuildId(null);
    setDrag(null);
    setDropHoverKey(null);
    return true;
  };

  const findSlotAtPoint = (clientX: number, clientY: number): Slot | null => {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      const node = el.closest("[data-slot-key]") as HTMLElement | null;
      if (!node) continue;
      const key = node.getAttribute("data-slot-key");
      if (!key) continue;
      const [zone, idx] = key.split(":");
      const index = Number(idx);
      const list = zone === "orbital" ? orbitalSlots : surfaceSlots;
      const slot = list.find((s) => s.index === index);
      if (slot) return slot;
    }
    return null;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      dragActive.current = true;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : null));
      const slot = findSlotAtPoint(e.clientX, e.clientY);
      if (slot?.state === "empty-open") {
        setDropHoverKey(slotKey(slot.zone, slot.index));
      } else {
        setDropHoverKey(null);
      }
    };
    const onUp = (e: PointerEvent) => {
      const slot = findSlotAtPoint(e.clientX, e.clientY);
      const defId = drag.id;
      setDrag(null);
      setDropHoverKey(null);
      if (slot?.state === "empty-open" && dragActive.current) {
        if (!tryBuild(defId)) {
          setOpenSlot({ zone: slot.zone, index: slot.index });
          setSelectedBuildId(defId);
          setPaletteZone(slot.zone === "orbital" ? "orbital" : "surface");
        }
      }
      dragActive.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot lists stable enough per render
  }, [drag?.id]);

  const handleSlotTap = (slot: Slot, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (slot.state === "empty-open") {
      setOpenSlot({ zone: slot.zone, index: slot.index });
      setPaletteZone(slot.zone === "orbital" ? "orbital" : "surface");
      setDemolishSlot(null);
      setInspectKey(null);
      onInspect?.(null);
      /* Drop commits immediately; tap still opens the deck. */
    } else if (slot.state === "expandable") {
      if (busy && !gmFree) return;
      onAction({
        action: "upgrade_grade",
        systemId,
        planetId,
        zone: slot.zone,
      });
    } else if (slot.state === "occupied" && slot.buildingInstanceId) {
      if (laborPickFrom && onLaborTapBuilding) {
        onLaborTapBuilding(slot.buildingInstanceId);
        return;
      }
      const key = slotKey(slot.zone, slot.index);
      setInspectKey(key);
      setOpenSlot(null);
      setSelectedBuildId(null);
      onInspect?.({
        instanceId: slot.buildingInstanceId,
        name: slot.buildingName ?? "Постройка",
        kind: slot.buildingKind,
        zone: slot.zone,
      });
    }
  };

  const cancelLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (slot: Slot) => {
    if (slot.state !== "occupied") return;
    longPressTimer.current = window.setTimeout(() => {
      setDemolishSlot(slot);
      setOpenSlot(null);
      setInspectKey(null);
      onInspect?.(null);
    }, GESTURE.longPressMs);
  };

  const focusActive = !!openSlot || !!inspectKey || !!drag;

  const occSurface = surfaceSlots.filter((s) => s.state === "occupied").length;
  const openSurface = surfaceSlots.filter((s) => s.state === "empty-open").length;
  const occOrbital = orbitalSlots.filter((s) => s.state === "occupied").length;
  const openOrbital = orbitalSlots.filter((s) => s.state === "empty-open").length;

  const renderSlot = (slot: Slot) => {
    const pos = slotPosition(
      slot.zone,
      slot.index,
      slot.zone === "surface" ? surfaceSlots.length : orbitalSlots.length,
      layout.center,
      layout.surfaceR,
      layout.orbitalR,
    );
    const key = slotKey(slot.zone, slot.index);
    const isTarget =
      openSlot?.zone === slot.zone && openSlot.index === slot.index;
    const isInspect = inspectKey === key;
    const isArmedPick =
      !!laborPickFrom && slot.buildingInstanceId === laborPickFrom;
    const laborDef = slotBuildingDef(planet, slot, buildings);
    const laborTarget =
      slot.state === "occupied" && consumesLabor(laborDef);
    const isDrop =
      dropHoverKey === key || (!!laborDragging && laborTarget && !isArmedPick);
    const dim =
      focusActive &&
      !isTarget &&
      !isInspect &&
      !isDrop &&
      !isArmedPick &&
      slot.state !== "empty-open";

    let fill = "transparent";
    let stroke = "#2a3548";
    let strokeDash: string | undefined;
    const color = buildingKindColor(slot.buildingKind);

    if (slot.state === "occupied") {
      fill = "rgba(16,22,31,0.95)";
      stroke = isInspect ? "#e8c547" : "#c9a227";
    } else if (slot.state === "empty-open") {
      fill = isDrop || isTarget ? "rgba(232,197,71,0.16)" : "rgba(16,24,36,0.72)";
      stroke = isDrop || isTarget ? "#e8c547" : "#8fb4cc";
    } else if (slot.state === "expandable") {
      fill = "rgba(10,14,22,0.3)";
      stroke = "#5cdb95";
      strokeDash = "3 3";
    } else {
      fill = "rgba(8,10,14,0.5)";
      stroke = "#2a3548";
    }

    const showZoneBadge =
      slot.state === "occupied" &&
      slot.contentZone &&
      (slot.contentZone === "subsurface" || slot.contentZone === "deep");

    return (
      <g
        key={key}
        data-slot-key={key}
        {...(slot.buildingInstanceId && laborTarget
          ? { "data-labor-drop": slot.buildingInstanceId }
          : {})}
        opacity={dim ? 0.35 : 1}
        className={isDrop ? "planet-slot-drop" : undefined}
      >
        <circle
          cx={pos.x}
          cy={pos.y}
          r={SLOT_R}
          fill={fill}
          stroke={stroke}
          strokeWidth={isTarget || isInspect || isDrop || isArmedPick ? 2.4 : 1.5}
          strokeDasharray={strokeDash}
          data-slot-key={key}
          {...(slot.buildingInstanceId && laborTarget
            ? { "data-labor-drop": slot.buildingInstanceId }
            : {})}
          style={{
            cursor:
              slot.state === "empty-open" ||
              slot.state === "occupied" ||
              slot.state === "expandable"
                ? "pointer"
                : "default",
          }}
          onClick={(e) => handleSlotTap(slot, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy || slot.state !== "occupied" || !slot.buildingInstanceId) return;
            setDemolishSlot(slot);
            setOpenSlot(null);
          }}
          onPointerDown={() => startLongPress(slot)}
          onPointerUp={cancelLongPress}
          onPointerLeave={() => {
            cancelLongPress();
            setHoverTip(null);
          }}
          onPointerEnter={() => {
            if (slot.state === "occupied") {
              setHoverTip({
                name: slot.buildingName ?? "Постройка",
                meta: laborDragging && laborTarget
                  ? "отпусти — назначить рабочих"
                  : laborPickFrom
                    ? "тап — перевести рабочих сюда"
                    : "тап — слоты · удерж./ПКМ — снос",
              });
            } else if (slot.state === "empty-open") {
              setHoverTip({
                name: "Свободный слот",
                meta: "тап — колода · перетащи карту — построить",
              });
            } else if (slot.state === "expandable") {
              setHoverTip({
                name: "Расширить кольцо",
                meta: gmFree ? "тап — грейд слотов" : "тап — купить грейд",
              });
            } else {
              setHoverTip({ name: "Заблокирован", meta: "нужна разблокировка" });
            }
          }}
        />
        {slot.state === "expandable" && (
          <text
            x={pos.x}
            y={pos.y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="13"
            fontWeight="700"
            fill="#5cdb95"
            style={{ pointerEvents: "none" }}
          >
            +
          </text>
        )}
        {(slot.state === "blocked" || slot.state === "expandable") && (
          <g aria-hidden className="slot-reveal-dots" style={{ pointerEvents: "none" }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
              const rr = SLOT_R * 0.42;
              return (
                <circle
                  key={i}
                  cx={pos.x + Math.cos(a) * rr}
                  cy={pos.y + Math.sin(a) * rr}
                  r={1.1}
                  fill={
                    slot.state === "expandable"
                      ? "rgba(92,219,149,0.55)"
                      : "rgba(122,155,184,0.4)"
                  }
                />
              );
            })}
          </g>
        )}
        {showZoneBadge && (
          <text
            x={pos.x + 10}
            y={pos.y - 10}
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fill="#8a96a8"
            style={{ pointerEvents: "none" }}
          >
            {ZONE_BADGE[slot.contentZone!]}
          </text>
        )}
        {slot.state === "occupied" && (
          <circle
            cx={pos.x}
            cy={pos.y}
            r={SLOT_R - 3}
            fill="none"
            stroke={color}
            strokeWidth={0.8}
            opacity={0.35}
            style={{ pointerEvents: "none" }}
          />
        )}
      </g>
    );
  };

  const ringArc = (
    r: number,
    occupied: number,
    open: number,
    total: number,
  ) => {
    const circ = 2 * Math.PI * r;
    const occLen = total > 0 ? (occupied / total) * circ : 0;
    const openLen = total > 0 ? (open / total) * circ : 0;
    return (
      <>
        <circle
          cx={layout.center}
          cy={layout.center}
          r={r}
          fill="none"
          stroke="rgba(120,140,170,0.28)"
          strokeWidth={2.4}
        />
        {occLen > 0 && (
          <circle
            cx={layout.center}
            cy={layout.center}
            r={r}
            fill="none"
            stroke="rgba(201,162,39,0.78)"
            strokeWidth={2.6}
            strokeDasharray={`${occLen} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${layout.center} ${layout.center})`}
          />
        )}
        {openLen > 0 && (
          <circle
            cx={layout.center}
            cy={layout.center}
            r={r}
            fill="none"
            stroke="rgba(143,180,204,0.62)"
            strokeWidth={2.2}
            strokeDasharray={`${openLen} ${circ}`}
            strokeDashoffset={-occLen}
            strokeLinecap="round"
            transform={`rotate(-90 ${layout.center} ${layout.center})`}
          />
        )}
      </>
    );
  };

  const surfacePaletteOpen =
    openSlot?.zone === "surface" ||
    (deckMode === "dock" && zoneForDeck !== "orbital");
  const groundChips: PaletteZone[] = ["surface", "subsurface", "deep"];
  const zoneChipBar =
    surfacePaletteOpen ? (
      <div
        className="order-type-chips planet-zone-chips"
        role="group"
        aria-label="Зона строительства"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {groundChips.map((z) => {
          const count = catalog(z).length;
          return (
            <button
              key={z}
              type="button"
              className={`order-type-chip ${paletteZone === z ? "on" : ""}`}
              disabled={count === 0}
              title={count > 0 ? ZONE_CHIP_LABEL[z] : "Нет доступных зданий"}
              onClick={() => setPaletteZone(z)}
            >
              {ZONE_CHIP_LABEL[z]}
              {count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>
    ) : null;

  const deckNode = (
        <BuildDeck
          embedded
          defs={deckDefs}
          stocks={stocks}
          apLeft={apLeft}
          techEco={techEco}
          busy={busy}
          selectedId={selectedBuildId}
          dragId={drag?.id ?? null}
          zoneLabel={ZONE_CHIP_LABEL[zoneForDeck]}
          slotArmed={!!openSlot}
          highlightCategory={highlightCategory}
          highlightBuildingIds={highlightBuildingIds}
          onSelect={(id) => {
            setSelectedBuildId(id);
            onSelectBuilding?.(id);
          }}
          onHoldBuild={(id) => tryBuild(id)}
          onDragStart={(id, x, y) => {
            dragActive.current = false;
            setSelectedBuildId(id);
            onSelectBuilding?.(id);
            setDrag({ id, x, y });
          }}
          onClose={() => {
            setOpenSlot(null);
            setSelectedBuildId(null);
          }}
          onOpenResearch={onOpenResearch}
          freeBuild={gmFree}
        />
  );

  return (
    <>
    <div className={`planet-radial planet-radial--deck${deckMode === "dock" ? " planet-radial--lcr" : ""}`}>
      {deckMode !== "dock" && zoneChipBar}

      {deckMode === "float" && (
      <FloatingPanel
        open={!!openSlot}
        onClose={() => {
          setOpenSlot(null);
          setSelectedBuildId(null);
        }}
        title={`Колода · ${ZONE_CHIP_LABEL[zoneForDeck]}`}
        storageKey="gmap-planet-build-deck"
        defaultGeom={{ x: 20, y: 120, w: 270, h: 420 }}
        minW={220}
        minH={200}
        zIndex={gmFree ? 440 : 370}
        className="gmap-float-panel--build-deck"
      >
        {deckNode}
      </FloatingPanel>
      )}

      <div className="planet-radial-fit" ref={fitRef}>
        <div
          className="planet-radial-stage"
          style={{
            width: layout.size * fitScale,
            height: layout.size * fitScale,
          }}
        >
          <div
            className="planet-radial-ring-wrap"
            style={{
              width: layout.size,
              height: layout.size,
              transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
              transformOrigin: "top left",
            }}
          >
        <svg
          ref={svgRef}
          width={layout.size}
          height={layout.size}
          viewBox={`0 0 ${layout.size} ${layout.size}`}
          className="planet-radial-svg"
        >
          {ringArc(
            layout.orbitalR,
            occOrbital,
            openOrbital,
            orbitalSlots.length,
          )}
          {ringArc(
            layout.surfaceR,
            occSurface,
            openSurface,
            surfaceSlots.length,
          )}
          <circle
            cx={layout.center}
            cy={layout.center}
            r={DISC_R + 28}
            fill="rgba(201,162,39,0.07)"
            stroke="none"
          />
          <circle
            cx={layout.center}
            cy={layout.center}
            r={DISC_R + 14}
            fill="none"
            stroke="rgba(201,162,39,0.22)"
            strokeWidth={10}
          />
          <circle
            cx={layout.center}
            cy={layout.center}
            r={DISC_R + 6}
            fill="rgba(61,206,168,0.08)"
            stroke="none"
          />
          <circle
            cx={layout.center}
            cy={layout.center}
            r={DISC_R}
            fill="rgba(14, 20, 30, 0.96)"
            stroke="rgba(232, 197, 71, 0.78)"
            strokeWidth={1.7}
          />
          <text
            x={layout.center}
            y={layout.center - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fontWeight="600"
            fill="#c9a227"
            style={{ pointerEvents: "none", fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {planet.type}
          </text>
          <text
            x={layout.center}
            y={layout.center + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="#8a96a8"
            style={{ pointerEvents: "none" }}
          >
            {planet.climate}
          </text>
          <text
            x={layout.center}
            y={layout.center - layout.surfaceR - 10}
            textAnchor="middle"
            fontSize="9"
            fill="#c9a227"
            style={{ pointerEvents: "none" }}
          >
            поверхность
          </text>
          <text
            x={layout.center}
            y={layout.center - layout.orbitalR - 10}
            textAnchor="middle"
            fontSize="9"
            fill="#6ec8d9"
            style={{ pointerEvents: "none" }}
          >
            орбита
          </text>
          {surfaceSlots.map(renderSlot)}
          {orbitalSlots.map(renderSlot)}
        </svg>
          <div className="planet-radial-icons">
            {[...surfaceSlots, ...orbitalSlots]
              .filter((s) => s.state === "occupied")
              .map((slot) => {
                const pos = slotPosition(
                  slot.zone,
                  slot.index,
                  slot.zone === "surface"
                    ? surfaceSlots.length
                    : orbitalSlots.length,
                  layout.center,
                  layout.surfaceR,
                  layout.orbitalR,
                );
                const key = slotKey(slot.zone, slot.index);
                const laborInst = slotBuilding(planet, slot);
                const laborDef = slotBuildingDef(planet, slot, buildings);
                const laborInfo =
                  laborInst && laborDef
                    ? buildingStaffedUnits(planet, laborInst, buildings)
                    : { staffed: 0, slots: 0, pinned: false, free: 0 };
                const dim =
                  focusActive &&
                  inspectKey !== key &&
                  !(
                    openSlot?.zone === slot.zone &&
                    openSlot.index === slot.index
                  );
                return (
                  <span
                    key={key}
                    className="planet-radial-icon"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      opacity: dim ? 0.35 : 1,
                    }}
                  >
                    <BuildingKindIcon kind={slot.buildingKind} size={14} />
                    {laborInst && laborDef && consumesLabor(laborDef) ? (
                      <span
                        className="planet-radial-pips"
                        data-labor-drop={laborInst.id}
                        style={laborPipStyle(buildingKindColor(slot.buildingKind))}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (busy || e.button !== 0) return;
                          const amount = e.shiftKey ? 5 : 1;
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const onMove = (ev: PointerEvent) => {
                            if (
                              Math.hypot(ev.clientX - startX, ev.clientY - startY) <
                              GESTURE.dragThresholdPx
                            )
                              return;
                            window.removeEventListener("pointermove", onMove);
                            window.removeEventListener("pointerup", onUp);
                            onLaborDragBuilding?.(
                              laborInst.id,
                              ev.clientX,
                              ev.clientY,
                              amount,
                            );
                          };
                          const onUp = () => {
                            window.removeEventListener("pointermove", onMove);
                            window.removeEventListener("pointerup", onUp);
                            if (laborPickFrom && laborPickFrom !== laborInst.id) {
                              onLaborTapBuilding?.(laborInst.id);
                              return;
                            }
                            onLaborPickBuilding?.(laborInst.id, amount);
                          };
                          window.addEventListener("pointermove", onMove);
                          window.addEventListener("pointerup", onUp);
                        }}
                      >
                        <LaborPips
                          staffed={laborInfo.staffed}
                          slots={laborInfo.slots}
                          pinned={laborInfo.pinned}
                          compact
                        />
                      </span>
                    ) : null}
                  </span>
                );
              })}
          </div>
          {hoverTip && (
            <div className="planet-radial-tip" role="tooltip">
              <strong>{hoverTip.name}</strong>
              <span>{hoverTip.meta}</span>
            </div>
          )}
        </div>
        </div>
      </div>

      {openSlot && (
        <p className="hint planet-radial-pick-hint">
          {gmFree
            ? "Слот выбран — зажми карту или перетащи её на кольцо"
            : "Слот выбран — зажми карту или перетащи её на свободный слот"}
        </p>
      )}

      <div className="planet-radial-legend">
        <span>
          <i className="dot occupied" /> занят
        </span>
        <span>
          <i className="dot open" /> свободен
        </span>
        <span>
          <i className="dot expand" /> + грейд
        </span>
      </div>

      {demolishSlot?.buildingInstanceId && (
        <div className="planet-radial-demolish">
          <span>
            Снести «
            {demolishSlot.buildingName ??
              PLANET_BUILDING_KIND_LABELS[demolishSlot.buildingKind ?? "custom"] ??
              "постройку"}
            »?
          </span>
          <div className="planet-radial-demolish-actions">
            <HoldRevealButton
              className="btn ghost"
              danger
              holdMs={850}
              disabled={busy}
              title="Зажми, чтобы снести"
              onHoldComplete={() => {
                const instanceId = demolishSlot.buildingInstanceId!;
                onAction({
                  action: "demolish",
                  systemId,
                  planetId,
                  instanceId,
                });
                // Close after dispatch; world refresh removes the building.
                window.setTimeout(() => setDemolishSlot(null), 80);
              }}
            >
              Зажми · снести
            </HoldRevealButton>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setDemolishSlot(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {drag &&
        createPortal(
          <div
            className="build-deck-ghost"
            style={{ left: drag.x, top: drag.y }}
          >
            <BuildingKindIcon
              kind={buildings[drag.id]?.kind}
              size={20}
            />
            <span>{buildings[drag.id]?.name ?? "…"}</span>
          </div>,
          document.body,
        )}
    </div>
    {deckMode === "dock" && (
      <aside className="planet-dive-deck" aria-label="Колода строительства">
        {zoneChipBar}
        {!openSlot ? (
          <p className="hint planet-dive-deck__hint">
            Слот не выбран — перетащи карту на кольцо или нажми пустой слот.
          </p>
        ) : (
          <p className="hint planet-dive-deck__hint">
            Слот взят. Зажми карту или перетащи.
          </p>
        )}
        {deckNode}
      </aside>
    )}
    </>
  );
}
