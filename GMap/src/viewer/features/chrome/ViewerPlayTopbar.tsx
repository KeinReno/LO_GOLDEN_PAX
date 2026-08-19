import { useMemo, type ReactNode } from "react";
import { Info, Layers, Menu, ScrollText, Settings } from "lucide-react";
import type { MapResourceDef } from "../../../state/contentCatalog";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { EmpireResourceStrip } from "../../EmpireResourceStrip";
import { PathsStrip } from "../../PathsStrip";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  showMapLayer: boolean;
  mapResourcesCatalog?: Record<string, MapResourceDef>;
  pendingCount: number;
  ordersPanel: ReactNode;
  isStale?: boolean;
};

export function ViewerPlayTopbar({
  payload,
  mobile,
  showMapLayer,
  mapResourcesCatalog,
  pendingCount,
  ordersPanel,
  isStale = false,
}: Props) {
  const queueOpen = useViewerChromeStore((s) => s.queueOpen);
  const mapFiltersOpen = useViewerChromeStore((s) => s.mapFiltersOpen);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setMenuOpen = useViewerChromeStore((s) => s.setMenuOpen);
  const setSettingsOpen = useViewerChromeStore((s) => s.setSettingsOpen);
  const setMapFiltersOpen = useViewerChromeStore((s) => s.setMapFiltersOpen);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const openMenuOnly = useViewerChromeStore((s) => s.openMenuOnly);
  const openSettingsOnly = useViewerChromeStore((s) => s.openSettingsOnly);
  const openMapFiltersOnly = useViewerChromeStore((s) => s.openMapFiltersOnly);

  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);

  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);
  const hasSheetTarget = useMemo(() => {
    const sys = payload.world.systems.find((s) => s.id === selectedSystemId);
    const fleet = (payload.world.fleets ?? []).find(
      (f) => f.id === selectedFleetId,
    );
    const legion = (payload.world.legions ?? []).find(
      (l) => l.id === selectedLegionId,
    );
    return Boolean(sys || fleet || legion);
  }, [payload, selectedSystemId, selectedFleetId, selectedLegionId]);

  const closeDrawersThen = (fn: () => void) => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setMapFiltersOpen(false);
    fn();
  };

  const setEconomyFocusCategory = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusCategory,
  );
  const setEconomyFocusSection = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusSection,
  );

  return (
    <>
      <header className="viewer-topbar viewer-topbar--empire">
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Меню"
          onClick={openMenuOnly}
        >
          <Menu size={18} strokeWidth={2} aria-hidden />
        </button>
        <div className="viewer-topbar-title">
          <span
            className="swatch"
            style={{ background: faction?.color ?? "#888" }}
          />
          <div>
            <strong>{faction?.name ?? "Игрок"}</strong>
            <span className="hint" aria-live="polite">
              {isStale
                ? "нет связи"
                : `ход ${payload.world.meta.turn} · видно ${payload.visibleSystemIds.length}`}
            </span>
          </div>
        </div>
        <EmpireResourceStrip
          compact={mobile}
          economy={payload.economy}
          flowData={flowData}
          world={payload.world}
          factionId={payload.factionId}
          reservedAp={reservedAp}
          apMax={apMax}
          reservedForceAp={reservedForceAp}
          forceApMax={forceApMax}
          fleetCount={(payload.world.fleets ?? []).filter(
            (f) => f.factionId === payload.factionId,
          ).length}
          legionCount={(payload.world.legions ?? []).filter(
            (l) => l.factionId === payload.factionId,
          ).length}
          mapResources={mapResourcesCatalog}
          onOpenForces={() =>
            closeDrawersThen(() => navigateViewerRoom("forces"))
          }
          onOpenCategory={(letter) => {
            closeDrawersThen(() => {
              setEconomyFocusCategory(letter);
              navigateViewerRoom("economy");
            });
          }}
          onOpenStockpile={() =>
            closeDrawersThen(() => {
              setEconomyFocusSection("stockpile");
              navigateViewerRoom("economy");
            })
          }
          trailing={
            mobile ? undefined : (
              <PathsStrip
                economy={payload.economy}
                onNavigate={(v) => navigateViewerRoom(v)}
              />
            )
          }
        />
        <div className="viewer-topbar-actions" style={{ position: "relative" }}>
          <button
            type="button"
            className={`viewer-icon-btn viewer-queue-btn ${queueOpen ? "active" : ""}`}
            aria-label="Очередь приказов"
            title="Очередь · Q"
            onClick={() =>
              closeDrawersThen(() => setQueueOpen((v) => !v))
            }
          >
            <ScrollText size={18} strokeWidth={2} aria-hidden />
            {pendingCount > 0 && (
              <span className="dock-badge">{pendingCount}</span>
            )}
          </button>
          {queueOpen && (
            <div
              className="viewer-queue-popover"
              role="dialog"
              aria-label="Очередь"
            >
              <div className="viewer-queue-popover-body">{ordersPanel}</div>
            </div>
          )}
        </div>
        {showMapLayer && viewMode === "map" && (
          <button
            type="button"
            className={`viewer-icon-btn ${mapFiltersOpen ? "active" : ""}`}
            aria-label="Фильтры карты"
            title="Фильтры · F4–F8, F10"
            aria-expanded={mapFiltersOpen}
            onClick={() => {
              setQueueOpen(false);
              openMapFiltersOnly();
            }}
          >
            <Layers size={18} strokeWidth={2} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Настройки карты"
          title="Настройки"
          onClick={() => {
            setQueueOpen(false);
            openSettingsOnly();
          }}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
        </button>
        {showMapLayer && (
          <button
            type="button"
            className="viewer-icon-btn"
            aria-label="Инфо"
            disabled={!hasSheetTarget}
            onClick={() => {
              navigateViewerRoom("map");
              setSheetOpen(true);
            }}
          >
            <Info size={18} strokeWidth={2} aria-hidden />
          </button>
        )}
      </header>

      {mobile && (
        <div className="viewer-paths-bar">
          <PathsStrip
            economy={payload.economy}
            compact
            onNavigate={(v) => navigateViewerRoom(v)}
          />
        </div>
      )}
    </>
  );
}
