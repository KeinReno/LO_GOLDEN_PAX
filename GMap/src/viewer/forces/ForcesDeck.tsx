import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, MapPin, Crosshair, Package } from "lucide-react";
import type { ShipGroup, ViewerPayload } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import type { MapResourceDef } from "../../state/contentCatalog";
import { FleetCover } from "./FleetCover";
import { LegionCover } from "./LegionCover";
import { UnitCard, type UnitCardModel } from "./UnitCard";
import { CardDetailStrip } from "./CardDetailStrip";
import { DropZones, canDropZone } from "./DropZones";
import { useForcesState } from "./useForcesState";
import {
  DISBAND_METAL_REFUND,
  FORGE_METAL_COST,
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
  upgradeAt,
} from "./compositionOps";
import { hitDropZone } from "./useDeckGestures";
import { canOutfitUnit } from "./outfitRules";

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
  onForcesMutate?: (args: ForcesMutateArgs) => Promise<boolean>;
  onToast?: (msg: string) => void;
  /** Highlight unit/ship defs (from Science unit_upgrade). */
  highlightDefIds?: string[] | null;
  password?: string;
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
}: ForcesDeckProps) {
  const reduce = useReducedMotion();
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
    closeDeck,
    toggleCard,
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

  const { ships, units, mapResources } = useMemo(() => {
    const c = getCachedContent();
    return {
      ships: Object.values(c?.ships || {}) as CatalogShip[],
      units: Object.values(c?.units || {}) as CatalogShip[],
      mapResources: (c?.map_resources || {}) as Record<string, MapResourceDef>,
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

  const notify = (msg: string) => setToast(msg);

  // Drop optimistic override when server payload composition changes / deck switches.
  useEffect(() => {
    setLocalComp(null);
    pendingStock.current = {};
  }, [activeFleetId, activeLegionId, deckKind]);

  useEffect(() => {
    if (mutateBusy) return;
    setLocalComp(null);
  }, [activeFleet?.composition, activeLegion?.composition, mutateBusy]);

  // Hydrate reserve from server economy slice (skip while a mutate is in flight)
  useEffect(() => {
    if (mutateBusy) return;
    const serverReserve = (
      payload.economy as { forceReserve?: UnitCardModel[] } | undefined
    )?.forceReserve;
    if (!Array.isArray(serverReserve)) return;
    useForcesState.setState({
      reserve: serverReserve.map((g) => ({
        type: g.type ?? g.defId ?? "unit",
        count: g.count ?? 1,
        defId: g.defId,
        hp: g.hp,
        filledSlots: g.filledSlots,
        xp: g.xp,
        level: g.level,
      })),
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
      const ok = await onForcesMutate({
        kind,
        id,
        composition: next,
        stockDeltas,
        forceReserve,
      });
      if (!ok) {
        // restore pending deltas so retry can work after user fixes stocks
        for (const [k, v] of Object.entries(stockDeltas)) {
          pendingStock.current[k] = (pendingStock.current[k] ?? 0) + v;
        }
        notify("Не удалось сохранить состав");
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
      if (successToast) notify(successToast);
    });
  };

  const catalogFor = (group: UnitCardModel) =>
    findCatalog(ships, units, group);

  const doForge = (index: number) => {
    const comp = getComposition();
    const card = comp[index];
    if (!card) return;
    const gate = canDropZone("forge", card, metalStock, catalogFor(card), deckKind);
    if (!gate.ok) {
      notify(gate.reason ?? "Недоступно");
      return;
    }
    const res = upgradeAt(comp, index);
    if (!res.ok) {
      notify(res.reason);
      return;
    }
    adjustStock(METAL_CURRENCY, -FORGE_METAL_COST);
    commitComposition(res.next, `Модернизация −${FORGE_METAL_COST} мет.`);
  };

  const doDisband = (index: number) => {
    const comp = getComposition();
    const { next, extracted: removed } = extractOneAt(comp, index);
    if (!removed) return;
    // Refund metal + return equipped resources (slot.count units each)
    adjustStock(METAL_CURRENCY, DISBAND_METAL_REFUND);
    const cat = catalogFor(removed);
    for (const [role, resId] of Object.entries(removed.filledSlots ?? {})) {
      if (typeof resId !== "string") continue;
      const slot = cat?.slots?.find((s) => s.role === role);
      adjustStock(resId, Math.max(1, slot?.count ?? 1));
    }
    commitComposition(next, `Утиль · +${DISBAND_METAL_REFUND} мет.`);
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
      doForge(index);
      return;
    }
    if (zone === "reserve") {
      doReserve(index);
      return;
    }
    if (zone === "equip") {
      if (!canOutfitUnit(cat, deckKind)) {
        notify(
          deckKind === "legion"
            ? "Пехоте оснащение не нужно"
            : "Нет модульных слотов",
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
      commitComposition(
        reorderComposition(comp, index, result.mergeIndex),
        "Боевой порядок изменён",
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

  if (deckOpen) {
    const title =
      deckKind === "fleet" ? activeFleet!.name : activeLegion!.name;
    const systemId =
      deckKind === "fleet" ? activeFleet!.systemId : activeLegion!.systemId;
    const stance =
      deckKind === "fleet" ? activeFleet!.stance : activeLegion!.status;
    const StanceIcon = STANCE_ICONS[stance] ?? STANCE_ICONS.idle;
    const stanceLabel = STANCE_LABELS[stance] ?? stance;

    return (
      <motion.div
        className="forces-deck forces-deck--open"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <header className="forces-deck-bar">
          <button
            type="button"
            className="btn ghost forces-back"
            onClick={() => closeDeck()}
          >
            <ArrowLeft size={16} aria-hidden /> Назад
          </button>
          <div className="forces-deck-title">
            <h2>{title}</h2>
            <span className="forces-deck-stance">
              <StanceIcon size={14} aria-hidden /> {stanceLabel}
            </span>
            <span className="hint">{getSystemName(systemId)}</span>
          </div>
          <div className="forces-deck-actions">
            <button
              type="button"
              className="btn"
              onClick={() => onFocusOnMap?.(systemId)}
            >
              <MapPin size={14} aria-hidden /> На карту
            </button>
            {deckKind === "fleet" && onOrderWithFleet && activeFleet && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onOrderWithFleet(activeFleet.id)}
              >
                <Crosshair size={14} aria-hidden /> Приказы
              </button>
            )}
            {deckKind === "legion" && onOrderWithLegion && activeLegion && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => onOrderWithLegion(activeLegion.id)}
              >
                <Crosshair size={14} aria-hidden /> Приказы
              </button>
            )}
          </div>
        </header>

        <div className="forces-fan" role="list">
          {composition.length === 0 ? (
            <div className="hq-empty">
              <span className="hq-empty-reveal" aria-hidden />
              <p className="hint">
                Колода пуста
                {reserve.length > 0
                  ? " — можно принять юниты из резерва ниже."
                  : " — состав не указан."}
              </p>
            </div>
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
                  onTap={() => toggleCard(index)}
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
                    // Stay in the deck — never navigate mid-gesture (was freezing the tab).
                    openEquip(index);
                    notify("Оснащение · долгий тап");
                  }}
                />
              </div>
            ))
          )}
        </div>

        <AnimatePresence>
          {selectedGroup && selectedCardIndex != null && !isDragging && (
            <CardDetailStrip
              key={`strip-${selectedCardIndex}-${stripMode}`}
              group={selectedGroup}
              catalogItem={selectedCatalog}
              mode={stripMode}
              deckKind={deckKind}
              mapResources={mapResources}
              stocks={stocks}
              unlockedProperties={payload.economy?.unlockedProperties}
              metalStock={metalStock}
              onClose={() => {
                selectCard(null);
                setStripMode("summary");
              }}
              onUpgrade={() => doForge(selectedCardIndex)}
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
          )}
        </AnimatePresence>

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

        {reserve.length > 0 && (
          <section className="forces-reserve-rail" aria-label="Резерв">
            <header className="forces-reserve-head">
              <Package size={14} aria-hidden /> Резерв · {reserve.length}
            </header>
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
          </section>
        )}

        {toast && (
          <div className="forces-toast" role="status">
            {toast}
          </div>
        )}
      </motion.div>
    );
  }

  const deckCount = tab === "fleets" ? fleets.length : legions.length;

  return (
    <div className="forces-deck forces-deck--list">
      <header className="forces-list-head">
        <h2>СИЛЫ ИМПЕРИИ</h2>
        <span className="forces-list-count">{deckCount} колод</span>
      </header>

      <div className="forces-tab-switch" role="tablist">
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

      <div className="forces-covers-grid">
        {tab === "fleets" && fleets.length === 0 && (
          <div className="hq-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">Нет своих флотов в зоне видимости.</p>
          </div>
        )}
        {tab === "fleets" &&
          fleets.map((fleet) => (
            <FleetCover
              key={fleet.id}
              fleet={fleet}
              systemName={getSystemName(fleet.systemId)}
              onOpen={() => {
                onSelectFleet?.(fleet.id);
                openFleetDeck(fleet.id);
              }}
            />
          ))}
        {tab === "legions" && legions.length === 0 && (
          <div className="hq-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">Нет своих легионов в зоне видимости.</p>
          </div>
        )}
        {tab === "legions" &&
          legions.map((legion) => (
            <LegionCover
              key={legion.id}
              legion={legion}
              systemName={getSystemName(legion.systemId)}
              onOpen={() => {
                onSelectLegion?.(legion.id);
                openLegionDeck(legion.id);
              }}
            />
          ))}
      </div>

      {reserve.length > 0 && (
        <section className="forces-reserve-rail" aria-label="Резерв">
          <header className="forces-reserve-head">
            <Package size={14} aria-hidden /> Резерв · {reserve.length}
            <span className="hint"> — откройте колоду, чтобы вернуть</span>
          </header>
          <div className="forces-reserve-list">
            {reserve.map((card, i) => {
              const cat = catalogFor(card);
              return (
                <div
                  key={`res-list-${card.defId ?? card.type}-${i}`}
                  className="forces-reserve-chip is-static"
                >
                  <strong>{cat?.name ?? card.type}</strong>
                  <span>×{card.count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {toast && (
        <div className="forces-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
