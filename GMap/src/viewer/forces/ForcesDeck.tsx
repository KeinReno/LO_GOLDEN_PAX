import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { MapPin, Crosshair, Package, Plus } from "lucide-react";
import type { ShipGroup, ViewerPayload } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import { outfitResourceBag } from "../../state/resourceIndex";
import { UnitCard, type UnitCardModel } from "./UnitCard";
import { CardDetailStrip } from "./CardDetailStrip";
import { DropZones, canDropZone } from "./DropZones";
import { useForcesState } from "./useForcesState";
import {
  METAL_CURRENCY,
  STANCE_ICONS,
  STANCE_LABELS,
  type CatalogShip,
  type DropZoneId,
} from "./constants";
import {
  appendGroup,
  clearSlotAt,
  extractOneAt,
  fillSlotAt,
  mergeComposition,
  reorderComposition,
  toUnitModels,
  repairAt,
} from "./compositionOps";
import { hitDropZone } from "./useDeckGestures";
import { canOutfitUnit } from "./outfitRules";
import { ForceOutfitConstructor } from "./ForceOutfitConstructor";
import { ForceReadinessBar } from "./ForceReadinessBar";
import {
  compositionUpkeep,
  deckBattlePreview,
  empireForceTotals,
  engagementsForForce,
  findProductionHubs,
  formatUpkeepShort,
  groupMaxHp,
  resolveUnitDefId,
  systemHasBarracksForFaction,
  systemHasShipyardForFaction,
} from "../../state/forceReadiness";
import {
  disbandMetalRefundClient,
  forgeMetalCostClient,
} from "../../state/forceEconomy";
import type { ViewerEngagement } from "../PlayerEngagementPanel";
import { ForceDisbandRaised } from "./ForceDisbandRaised";
import type { ForceRecruitSession } from "../../state/forceRaiseClient";
import { isInputFocused } from "../hooks/isInputFocused";

export type ForcesMutateArgs = {
  kind: "fleet" | "legion";
  id: string;
  composition: ShipGroup[];
  stockDeltas: Record<string, number>;
  forceReserve: UnitCardModel[];
};

export type ForcesDeckProps = {
  payload: ViewerPayload;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectFleet?: (id: string) => void;
  onSelectLegion?: (id: string) => void;
  onFocusOnMap?: (systemId: string) => void;
  onOrderWithFleet?: (id: string) => void;
  onOrderWithLegion?: (id: string) => void;
  /** Persist deck mutation to server (composition + stocks + reserve). */
  onForcesMutate?: (
    args: ForcesMutateArgs,
  ) => Promise<boolean | { ok: boolean; error?: string }>;
  onToast?: (msg: string) => void;
  /** Highlight unit/ship defs (from Science unit_upgrade). */
  highlightDefIds?: string[] | null;
  password?: string;
  engagements?: ViewerEngagement[];
  onOpenEngagement?: (engagementId: string) => void;
  onOpenCardBattle?: (engagementId: string) => void;
  onOpenEconomy?: () => void;
  /** Jump to system dive with produce deck (верфь / казармы). */
  onOpenProduce?: (opts: {
    systemId: string;
    tab: "ships" | "units";
    fleetId?: string;
    legionId?: string;
  }) => void;
  /** Map pick: highlight yards/barracks, then produce (pop + metal/supply). */
  onBeginRecruit?: (tab: "ships" | "units") => void;
  /** Phone sheet: tighter list layout, larger tap targets. */
  compact?: boolean;
  onForceRecruitSession?: (data: ForceRecruitSession) => void;
};

function findCatalog(
  ships: CatalogShip[],
  units: CatalogShip[],
  group: UnitCardModel,
): CatalogShip | null {
  const key = group.defId || group.type;
  return (
    ships.find((s) => s.id === key || s.name === group.type) ||
    units.find((u) => u.id === key || u.name === group.type) ||
    null
  );
}

function metalFromStocks(stocks: Record<string, number> | undefined): number {
  if (!stocks) return 0;
  return (
    stocks[METAL_CURRENCY] ??
    stocks.metal ??
    stocks.zhelezo ??
    0
  );
}

export function ForcesDeck({
  payload,
  selectedFleetId,
  selectedLegionId,
  onSelectFleet,
  onSelectLegion,
  onFocusOnMap,
  onOrderWithFleet,
  onOrderWithLegion,
  onForcesMutate,
  onToast,
  highlightDefIds,
  engagements,
  onOpenEngagement,
  onOpenCardBattle,
  onOpenEconomy,
  onOpenProduce,
  onBeginRecruit,
  compact = false,
  password,
  onForceRecruitSession,
}: ForcesDeckProps) {
  const pendingStock = useRef<Record<string, number>>({});
  const mutateBusyRef = useRef(false);
  const hoverRafRef = useRef<number | null>(null);
  const hoverPointRef = useRef<{ x: number; y: number } | null>(null);
  const [mutateBusy, setMutateBusy] = useState(false);
  /** Optimistic composition while mutate is in flight / until payload catches up. */
  const [localComp, setLocalComp] = useState<ShipGroup[] | null>(null);

  const {
    mode,
    deckKind,
    activeFleetId,
    activeLegionId,
    selectedCardIndex,
    stripMode,
    isDragging,
    draggedCardIndex,
    hoveredZone,
    toast,
    reserve,
    openFleetDeck,
    openLegionDeck,
    selectCard,
    setStripMode,
    openEquip,
    openDisbandConfirm,
    startDrag,
    endDrag,
    setHoveredZone,
    setToast,
    clearToast,
    pushReserve,
    removeReserveAt,
  } = useForcesState();

  const [tab, setTab] = useState<"fleets" | "legions">("fleets");
  const fid = payload.factionId;
  const stocks = payload.economy?.stocks ?? {};

  const fleets = (payload.world.fleets ?? []).filter((f) => f.factionId === fid);
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === fid,
  );
  const firstFleetId = fleets[0]?.id ?? null;
  const firstLegionId = legions[0]?.id ?? null;

  useEffect(() => {
    if (tab === "fleets") {
      if (activeFleetId && fleets.some((f) => f.id === activeFleetId)) return;
      if (firstFleetId) openFleetDeck(firstFleetId);
      return;
    }
    if (activeLegionId && legions.some((l) => l.id === activeLegionId)) return;
    if (firstLegionId) openLegionDeck(firstLegionId);
  }, [tab, activeFleetId, activeLegionId, firstFleetId, firstLegionId]);

  const { ships, units, mapResources } = useMemo(() => {
    const c = getCachedContent();
    return {
      ships: Object.values(c?.ships || {}) as CatalogShip[],
      units: Object.values(c?.units || {}) as CatalogShip[],
      mapResources: outfitResourceBag(c),
    };
  }, []);

  const getSystemName = (id: string) =>
    payload.world.systems.find((s) => s.id === id)?.name ?? id;

  const metalStock =
    metalFromStocks(stocks) + (pendingStock.current[METAL_CURRENCY] ?? 0);

  const activeFleet =
    fleets.find((f) => f.id === activeFleetId) ??
    fleets.find((f) => f.id === selectedFleetId) ??
    null;
  const activeLegion =
    legions.find((l) => l.id === activeLegionId) ??
    legions.find((l) => l.id === selectedLegionId) ??
    null;

  const deckOpen =
    mode === "deck" &&
    ((deckKind === "fleet" && activeFleet) ||
      (deckKind === "legion" && activeLegion));

  useEffect(() => {
    if (!toast) return;
    onToast?.(toast);
    const t = window.setTimeout(() => clearToast(), 2800);
    return () => window.clearTimeout(t);
    // Intentionally omit onToast — parent passes inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, clearToast]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isInputFocused(e.target)) return;
      const s = useForcesState.getState();
      if (s.stripMode === "confirm-disband") {
        e.preventDefault();
        e.stopPropagation();
        s.setStripMode("summary");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const notify = (msg: string) => setToast(msg);

  // Drop optimistic override when server payload composition changes / deck switches.
  useEffect(() => {
    setLocalComp(null);
    pendingStock.current = {};
  }, [activeFleetId, activeLegionId, deckKind]);

  // Hydrate reserve from server economy slice (skip while a mutate is in flight)
  useEffect(() => {
    if (mutateBusy) return;
    const serverReserve = (
      payload.economy as { forceReserve?: UnitCardModel[] } | undefined
    )?.forceReserve;
    if (!Array.isArray(serverReserve)) return;
    useForcesState.setState({
      reserve: serverReserve.map((g) => {
        const type = g.type ?? g.defId ?? "unit";
        const defId = resolveUnitDefId({ defId: g.defId, type }) || g.defId;
        return {
          type,
          count: g.count ?? 1,
          defId,
          hp: g.hp,
          filledSlots: g.filledSlots,
          xp: g.xp,
          level: g.level,
        };
      }),
    });
  }, [payload.economy, mutateBusy]);

  const adjustStock = (currencyId: string, delta: number) => {
    if (!delta) return;
    pendingStock.current[currencyId] =
      (pendingStock.current[currencyId] ?? 0) + delta;
  };

  const flushMutate = async (next: ShipGroup[]) => {
    if (!onForcesMutate) {
      notify("Нет обработчика сохранения состава");
      return false;
    }
    if (mutateBusyRef.current) return false;
    const kind = deckKind;
    const id =
      kind === "fleet" ? activeFleet?.id : activeLegion?.id;
    if (!id) return false;
    const stockDeltas = { ...pendingStock.current };
    pendingStock.current = {};
    const forceReserve = useForcesState.getState().reserve;
    mutateBusyRef.current = true;
    setMutateBusy(true);
    try {
      const result = await onForcesMutate({
        kind,
        id,
        composition: next,
        stockDeltas,
        forceReserve,
      });
      const ok = typeof result === "boolean" ? result : result.ok;
      if (!ok) {
        const err =
          typeof result === "object" && result && "error" in result
            ? result.error
            : undefined;
        // restore pending deltas so retry can work after user fixes stocks
        for (const [k, v] of Object.entries(stockDeltas)) {
          pendingStock.current[k] = (pendingStock.current[k] ?? 0) + v;
        }
        notify(err ?? "Не удалось сохранить состав");
        return false;
      }
      return true;
    } finally {
      mutateBusyRef.current = false;
      setMutateBusy(false);
    }
  };

  const getComposition = (): UnitCardModel[] => {
    if (localComp) return toUnitModels(localComp);
    if (deckKind === "fleet" && activeFleet) {
      return toUnitModels(activeFleet.composition);
    }
    if (deckKind === "legion" && activeLegion) {
      return toUnitModels(activeLegion.composition);
    }
    return [];
  };

  const commitComposition = (next: ShipGroup[], successToast?: string) => {
    setLocalComp(next);
    void flushMutate(next).then((ok) => {
      if (!ok) {
        setLocalComp(null);
        return;
      }
      setLocalComp(null);
      if (successToast) notify(successToast);
    });
  };

  const catalogFor = (group: UnitCardModel) =>
    findCatalog(ships, units, group);

  const doRepair = (index: number) => {
    const comp = getComposition();
    const card = comp[index];
    if (!card) return;
    const cost = forgeMetalCostClient();
    const gate = canDropZone("forge", card, metalStock, catalogFor(card), deckKind);
    if (!gate.ok) {
      notify(gate.reason ?? "Недоступно");
      return;
    }
    const maxHp = groupMaxHp(card);
    const res = repairAt(comp, index, maxHp);
    if (!res.ok) {
      notify(res.reason);
      return;
    }
    adjustStock(METAL_CURRENCY, -cost);
    commitComposition(res.next, `Ремонт −${cost} мет. → ${maxHp} HP`);
  };

  const doDisband = (index: number) => {
    const comp = getComposition();
    const { next, extracted: removed } = extractOneAt(comp, index);
    if (!removed) return;
    const refund = disbandMetalRefundClient();
    adjustStock(METAL_CURRENCY, refund);
    const cat = catalogFor(removed);
    for (const [role, resId] of Object.entries(removed.filledSlots ?? {})) {
      if (typeof resId !== "string") continue;
      const slot = cat?.slots?.find((s) => s.role === role);
      adjustStock(resId, Math.max(1, slot?.count ?? 1));
    }
        commitComposition(next, `Лом · +${refund} мет.`);
    selectCard(null);
    setStripMode("summary");
  };

  const doReserve = (index: number) => {
    const comp = getComposition();
    const { next, extracted } = extractOneAt(comp, index);
    if (!extracted) return;
    pushReserve(extracted);
    commitComposition(next, "Выведено в резерв");
    selectCard(null);
    setStripMode("summary");
  };

  const doAttachFromReserve = (reserveIndex: number) => {
    if (!deckOpen) {
      notify("Откройте колоду, чтобы принять из резерва");
      return;
    }
    const taken = removeReserveAt(reserveIndex);
    if (!taken) return;
    const next = appendGroup(getComposition(), taken);
    commitComposition(next, "Принято из резерва в колоду");
  };

  const doFillSlot = (index: number, role: string, resourceId: string) => {
    const comp = getComposition();
    const card = comp[index];
    const cat = card ? catalogFor(card) : null;
    const slot = cat?.slots?.find((s) => s.role === role);
    const need = Math.max(1, slot?.count ?? 1);
    const have = stocks[resourceId] ?? 0;
    const previousId = card?.filledSlots?.[role] ?? null;
    const spend = previousId === resourceId ? 0 : need;
    if (spend > 0 && have < spend) {
      notify(`Нужно ${spend} на складе (есть ${Math.floor(have)})`);
      return;
    }
    const res = fillSlotAt(comp, index, role, resourceId);
    if (!res.ok) {
      notify(res.reason);
      return;
    }
    if (spend > 0) adjustStock(resourceId, -spend);
    if (res.previousId && res.previousId !== resourceId) {
      adjustStock(res.previousId, Math.max(1, slot?.count ?? 1));
    }
    commitComposition(
      res.next,
      spend > 0 ? `Слот оснащён (−${spend})` : "Слот оснащён",
    );
  };

  const doClearSlot = (index: number, role: string) => {
    const comp = getComposition();
    const card = comp[index];
    const cat = card ? catalogFor(card) : null;
    const slot = cat?.slots?.find((s) => s.role === role);
    const refund = Math.max(1, slot?.count ?? 1);
    const res = clearSlotAt(comp, index, role);
    if (!res.ok) {
      notify(res.reason);
      return;
    }
    if (res.clearedId) adjustStock(res.clearedId, refund);
    commitComposition(res.next, "Слот снят");
  };

  const handleZoneAction = (zone: DropZoneId, index: number) => {
    const comp = getComposition();
    const card = comp[index];
    if (!card) return;
    const cat = catalogFor(card);
    const gate = canDropZone(zone, card, metalStock, cat, deckKind);
    if (!gate.ok) {
      notify(gate.reason ?? "Недоступно");
      return;
    }
    if (zone === "disband") {
      openDisbandConfirm(index);
      return;
    }
    if (zone === "forge") {
      doRepair(index);
      return;
    }
    if (zone === "reserve") {
      doReserve(index);
      return;
    }
    if (zone === "equip") {
      if (!canOutfitUnit(cat, deckKind)) {
        notify(
          "Нет слотов оснащения",
        );
        return;
      }
      openEquip(index);
    }
  };

  const handleDragEnd = (
    index: number,
    result: { zone: DropZoneId | null; mergeIndex: number | null },
  ) => {
    endDrag();
    if (result.zone) {
      handleZoneAction(result.zone, index);
      return;
    }
    if (result.mergeIndex != null) {
      const comp = getComposition();
      const merged = mergeComposition(comp, index, result.mergeIndex);
      if (merged.ok) {
        commitComposition(merged.next, "Стопки объединены");
        selectCard(null);
        return;
      }
      if (merged.reason.includes("оснащение")) {
        notify(merged.reason);
        return;
      }
      commitComposition(
        reorderComposition(comp, index, result.mergeIndex),
        "Порядок развёртывания изменён",
      );
      selectCard(null);
    }
  };

  const composition = getComposition();
  const draggedCard =
    draggedCardIndex != null ? composition[draggedCardIndex] ?? null : null;
  const draggedCatalog = draggedCard ? catalogFor(draggedCard) : null;
  const selectedGroup =
    selectedCardIndex != null ? composition[selectedCardIndex] ?? null : null;
  const selectedCatalog = selectedGroup ? catalogFor(selectedGroup) : null;

  const hubs = useMemo(
    () => findProductionHubs(payload.world, fid),
    [payload.world, fid],
  );

  useEffect(() => {
    if (mode !== "deck") return;
    if (composition.length === 0) return;
    if (
      selectedCardIndex == null ||
      selectedCardIndex >= composition.length
    ) {
      selectCard(0);
    }
  }, [mode, activeFleetId, activeLegionId, composition.length, selectedCardIndex]);

  const buildProduceActions = (ctx?: {
    systemId?: string;
    fleetId?: string;
    legionId?: string;
  }) => {
    if (!onOpenProduce) return null;
    const sys =
      ctx?.systemId != null
        ? payload.world.systems.find((s) => s.id === ctx.systemId)
        : null;
    const shipyardSystemId =
      sys && systemHasShipyardForFaction(sys, fid)
        ? sys.id
        : hubs.shipyardSystemId;
    const barracksSystemId =
      sys && systemHasBarracksForFaction(sys, fid)
        ? sys.id
        : hubs.barracksSystemId;
    if (!shipyardSystemId && !barracksSystemId) {
      return (
        <p className="hint forces-produce-hint">
          {sys
            ? "В этой системе нет верфи/казарм — постройте или откройте другой мир."
            : "Нет верфи/казарм на своих мирах — постройте, чтобы пополнять состав."}
        </p>
      );
    }
    return (
      <div className="forces-produce-actions">
        {shipyardSystemId && (
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              onOpenProduce({
                systemId: shipyardSystemId,
                tab: "ships",
                fleetId: ctx?.fleetId,
              })
            }
          >
            Верфь
          </button>
        )}
        {barracksSystemId && (
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              onOpenProduce({
                systemId: barracksSystemId,
                tab: "units",
                legionId: ctx?.legionId,
              })
            }
          >
            Казармы
          </button>
        )}
      </div>
    );
  };

  const empire = empireForceTotals(payload);
  const title = deckOpen
    ? deckKind === "fleet"
      ? activeFleet!.name
      : activeLegion!.name
    : "Силы";
  const systemId = deckOpen
    ? deckKind === "fleet"
      ? activeFleet!.systemId
      : activeLegion!.systemId
    : "";
  const produceActions = deckOpen
    ? buildProduceActions({
        systemId,
        fleetId: deckKind === "fleet" ? activeFleet!.id : undefined,
        legionId: deckKind === "legion" ? activeLegion!.id : undefined,
      })
    : buildProduceActions();
  const stance = deckOpen
    ? deckKind === "fleet"
      ? activeFleet!.stance
      : activeLegion!.status
    : "idle";
  const StanceIcon = STANCE_ICONS[stance] ?? STANCE_ICONS.idle;
  const stanceLabel = STANCE_LABELS[stance] ?? stance;
  const deckEngagements = deckOpen
    ? deckKind === "fleet" && activeFleet
      ? engagementsForForce(engagements, {
          forceId: activeFleet.id,
          kind: "fleet",
          systemId: activeFleet.systemId,
          factionId: fid,
        })
      : deckKind === "legion" && activeLegion
        ? engagementsForForce(engagements, {
            forceId: activeLegion.id,
            kind: "legion",
            systemId: activeLegion.systemId,
            factionId: fid,
          })
        : []
    : [];

  return (
    <div
      className={`forces-dive${compact ? " forces-dive--compact" : ""}`}
    >
      <header className="forces-dive__sum">
        <div>
          <h2>{title}</h2>
          {deckOpen ? (
            <p className="hint forces-dive__rule">
              <StanceIcon size={14} aria-hidden /> {stanceLabel}
              {systemId ? ` · ${getSystemName(systemId)}` : ""}
              {" · карта сверху → слот в центре → модуль со склада"}
            </p>
          ) : (
            <p className="hint forces-dive__rule">
              Нет своей силы в зоне видимости — верфь и казармы справа.
            </p>
          )}
        </div>
        <div className="forces-dive__sum-side">
          <button
            type="button"
            className="forces-list-upkeep"
            title="Содержание всех сил / ход"
            onClick={() => onOpenEconomy?.()}
          >
            {formatUpkeepShort(empire.upkeep)}
          </button>
          {deckOpen && systemId ? (
            <div className="forces-dive__sum-actions">
              <button
                type="button"
                className="btn"
                onClick={() => onFocusOnMap?.(systemId)}
              >
                <MapPin size={14} aria-hidden /> На карту
              </button>
              {deckKind === "fleet" && onOrderWithFleet && activeFleet ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onOrderWithFleet(activeFleet.id)}
                >
                  <Crosshair size={14} aria-hidden /> Приказы
                </button>
              ) : null}
              {deckKind === "legion" && onOrderWithLegion && activeLegion ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onOrderWithLegion(activeLegion.id)}
                >
                  <Crosshair size={14} aria-hidden /> Приказы
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="forces-dive__queue">
        {deckOpen ? (
          <ForceReadinessBar
            preview={deckBattlePreview(composition)}
            upkeep={compositionUpkeep(
              composition,
              deckKind === "fleet" ? "fleet" : "legion",
            )}
            engagements={deckEngagements}
            onOpenEngagement={onOpenEngagement}
            onOpenCardBattle={onOpenCardBattle}
          />
        ) : null}
        <div className="forces-fan forces-fan--strip" role="list">
          {deckOpen && composition.length === 0 ? (
            <p className="hint">
              Состав пуст
              {reserve.length > 0
                ? " — примите юниты из резерва справа."
                : " — спустите со стапелей на верфи."}
            </p>
          ) : (
            composition.map((group, index) => (
              <div key={`${group.defId ?? group.type}-${index}`} role="listitem">
                <UnitCard
                  group={group}
                  catalogItem={catalogFor(group)}
                  isSelected={selectedCardIndex === index}
                  isDragging={isDragging && draggedCardIndex === index}
                  isHighlighted={
                    !!highlightDefIds?.length &&
                    highlightDefIds.some(
                      (id) =>
                        id === group.defId ||
                        id === group.type ||
                        id === catalogFor(group)?.id,
                    )
                  }
                  index={index}
                  showSlots={canOutfitUnit(catalogFor(group), deckKind)}
                  onTap={() => selectCard(index)}
                  onDragStart={() => startDrag(index)}
                  onDragMove={(point) => {
                    hoverPointRef.current = point;
                    if (hoverRafRef.current != null) return;
                    hoverRafRef.current = requestAnimationFrame(() => {
                      hoverRafRef.current = null;
                      const p = hoverPointRef.current;
                      if (!p) return;
                      setHoveredZone(hitDropZone(p.x, p.y));
                    });
                  }}
                  onDragEnd={(result) => handleDragEnd(index, result)}
                  onLongPress={() => {
                    openEquip(index);
                    notify("Конструктор · слоты в центре");
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <nav className="forces-dive__tasks" aria-label="Колоды">
        <div className="forces-tab-switch" role="tablist" aria-label="Тип сил">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fleets"}
            className={tab === "fleets" ? "on" : ""}
            onClick={() => setTab("fleets")}
          >
            Флоты · {fleets.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "legions"}
            className={tab === "legions" ? "on" : ""}
            onClick={() => setTab("legions")}
          >
            Легионы · {legions.length}
          </button>
        </div>
        {onBeginRecruit ? (
          <button
            type="button"
            className="forces-dive__new"
            onClick={() =>
              onBeginRecruit(tab === "fleets" ? "ships" : "units")
            }
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            {tab === "fleets" ? "Новый флот" : "Новый легион"}
          </button>
        ) : null}
        {tab === "fleets" && fleets.length === 0 ? (
          <p className="hint">Нет своих флотов.</p>
        ) : null}
        {tab === "fleets" &&
          fleets.map((fleet) => (
            <button
              key={fleet.id}
              type="button"
              className={activeFleetId === fleet.id ? "is-on" : ""}
              onClick={() => {
                onSelectFleet?.(fleet.id);
                openFleetDeck(fleet.id);
              }}
            >
              <span className="forces-dive__dir-dot" aria-hidden />
              {fleet.name}
              <span className="tabular forces-dive__dir-n">
                {(fleet.composition ?? []).reduce(
                  (s, g) => s + (g.count ?? 0),
                  0,
                )}
              </span>
            </button>
          ))}
        {tab === "legions" && legions.length === 0 ? (
          <p className="hint">Нет своих легионов.</p>
        ) : null}
        {tab === "legions" &&
          legions.map((legion) => (
            <button
              key={legion.id}
              type="button"
              className={activeLegionId === legion.id ? "is-on" : ""}
              onClick={() => {
                onSelectLegion?.(legion.id);
                openLegionDeck(legion.id);
              }}
            >
              <span className="forces-dive__dir-dot" aria-hidden />
              {legion.name}
              <span className="tabular forces-dive__dir-n">
                {(legion.composition ?? []).reduce(
                  (s, g) => s + (g.count ?? 0),
                  0,
                )}
              </span>
            </button>
          ))}
      </nav>

      <div className="forces-dive__canvas">
        <ForceOutfitConstructor
          key={`${activeFleetId ?? activeLegionId ?? "none"}-${selectedCardIndex ?? "x"}-${selectedGroup?.defId ?? selectedGroup?.type ?? ""}`}
          group={selectedGroup}
          catalogItem={selectedCatalog}
          deckKind={deckKind}
          mapResources={mapResources}
          stocks={stocks}
          unlockedProperties={payload.economy?.unlockedProperties}
          onFillSlot={(role, resourceId) => {
            if (selectedCardIndex == null) return;
            doFillSlot(selectedCardIndex, role, resourceId);
          }}
          onClearSlot={(role) => {
            if (selectedCardIndex == null) return;
            doClearSlot(selectedCardIndex, role);
          }}
        />
        <DropZones
          active={isDragging}
          deckKind={deckKind}
          draggedCard={draggedCard}
          catalogItem={draggedCatalog}
          hoveredZone={hoveredZone}
          metalStock={metalStock}
          onHover={setHoveredZone}
          canDrop={(zone, card) =>
            canDropZone(zone, card, metalStock, catalogFor(card), deckKind)
          }
        />
      </div>

      <aside className="forces-dive__deck" aria-live="polite">
        <AnimatePresence>
          {selectedGroup && selectedCardIndex != null && !isDragging ? (
            <CardDetailStrip
              key={`strip-${selectedCardIndex}-${stripMode}`}
              group={selectedGroup}
              catalogItem={selectedCatalog}
              mode={stripMode === "equip" ? "summary" : stripMode}
              deckKind={deckKind}
              mapResources={mapResources}
              stocks={stocks}
              unlockedProperties={payload.economy?.unlockedProperties}
              metalStock={metalStock}
              onClose={() => selectCard(0)}
              onRepair={() => doRepair(selectedCardIndex)}
              onRequestDisband={() => openDisbandConfirm(selectedCardIndex)}
              onConfirmDisband={() => doDisband(selectedCardIndex)}
              onCancelDisband={() => setStripMode("summary")}
              onOpenEquip={() => openEquip(selectedCardIndex)}
              onFillSlot={(role, resourceId) =>
                doFillSlot(selectedCardIndex, role, resourceId)
              }
              onClearSlot={(role) => doClearSlot(selectedCardIndex, role)}
              onToReserve={() => doReserve(selectedCardIndex)}
            />
          ) : (
            <p className="hint">Выберите карту в составе.</p>
          )}
        </AnimatePresence>
        {password &&
          onForceRecruitSession &&
          ((deckKind === "fleet" && activeFleet?.homePlanetId) ||
            (deckKind === "legion" && activeLegion?.homePlanetId)) && (
            <ForceDisbandRaised
              factionId={fid}
              password={password}
              kind={deckKind === "fleet" ? "fleet" : "legion"}
              id={deckKind === "fleet" ? activeFleet!.id : activeLegion!.id}
              maxCount={composition.reduce((s, g) => s + (g.count || 0), 0)}
              busy={mutateBusy}
              onSession={onForceRecruitSession}
              onToast={notify}
            />
          )}
        <section className="forces-reserve-rail" aria-label="Резерв и производство">
          <header className="forces-reserve-head">
            <Package size={14} aria-hidden />{" "}
            {reserve.length > 0 ? `Резерв · ${reserve.length}` : "Пополнение"}
          </header>
          {reserve.length > 0 && (
            <div className="forces-reserve-list">
              {reserve.map((card, i) => {
                const cat = catalogFor(card);
                return (
                  <button
                    key={`res-${card.defId ?? card.type}-${i}`}
                    type="button"
                    className="forces-reserve-chip"
                    onClick={() => doAttachFromReserve(i)}
                    title="Вернуть в колоду"
                  >
                    <strong>{cat?.name ?? card.type}</strong>
                    <span>×{card.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {produceActions}
        </section>
      </aside>

      {toast && (
        <div className="forces-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
