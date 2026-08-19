import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { MapCanvas } from "./renderers/MapCanvas";
import { EditorShellLayout } from "./ui/EditorShellLayout";
import { Toolbar } from "./editors/Toolbar";
import { Inspector } from "./editors/Inspector";
import { TopBar } from "./editors/TopBar";
import {
  CampaignSessionProvider,
} from "./editors/CampaignSessionContext";
import { DiplomacyPanel } from "./editors/DiplomacyPanel";
import { SystemDossier } from "./editors/SystemDossier";
import { PolityDossier } from "./editors/PolityDossier";
import { QuestPanel } from "./editors/QuestPanel";
import { MapContextMenu } from "./editors/MapContextMenu";
import { AltQuickInspector } from "./editors/AltQuickInspector";
import { GmLiveDock } from "./editors/GmLiveDock";
import { GmTickDialog } from "./editors/GmTickDialog";
import {
  GmWorkbench,
  GmAtelierPanel,
  GmLiveStage,
  GmFloatingDock,
  GmAttentionStrip,
  GmSessionNotch,
  domainByHotkey,
} from "./editors/gm";
import { GmSpotterModal } from "./editors/gm/GmSpotterModal";
import { RacesStudio } from "./editors/studios/RacesStudio";
import { TechStudio } from "./editors/studios/TechStudio";
import { UnitCardsStudio } from "./editors/studios/UnitCardsStudio";
import { BuildingStudio } from "./editors/studios/BuildingStudio";
import { BattleSimulator } from "./editors/studios/BattleSimulator";
import { PolityStudio } from "./editors/studios/PolityStudio";
import { GameRulesStudio } from "./editors/studios/GameRulesStudio";
import { RpStudio } from "./editors/studios/RpStudio";
import { ViewerPage } from "./viewer/ViewerPage";
import { DragCardDemo } from "./ui/DragCardDemo";
import { useWorldStore } from "./state/worldStore";
import { fetchContent } from "./state/contentCatalog";
import type { GmLiveDomainId } from "./state/types";
import { ErrorBoundary } from "./ui/ErrorBoundary";

function OrderTargetHint() {
  const pending = useWorldStore((s) => s.pendingUnitOrder);
  const cloneId = useWorldStore((s) => s.pendingFleetCloneId);
  const fleets = useWorldStore((s) => s.world.fleets);

  if (cloneId) {
    const name = fleets.find((f) => f.id === cloneId)?.name ?? "флот";
    return (
      <div className="order-target-banner">
        Клон «{name}» — кликните систему назначения (Esc — отмена)
      </div>
    );
  }

  if (!pending) return null;
  const label =
    pending.intent === "attack"
      ? "атаковать"
      : pending.intent === "blockade"
        ? "блокировать"
        : pending.intent === "fortify"
          ? "укрепиться в"
          : pending.intent === "move"
            ? "переместиться в"
            : pending.intent;
  return (
    <div className="order-target-banner">
      Приказ: {label} — кликните систему-цель (Esc — отмена)
    </div>
  );
}

function EditorHotkeys({
  onToggleLeft,
  onToggleRight,
  onOpenRightDock,
  onOpenSpotter,
  onCloseTick,
  onToggleMapOnly,
}: {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenRightDock?: () => void;
  onOpenSpotter?: () => void;
  onCloseTick?: () => void;
  onToggleMapOnly?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!t?.isContentEditable;
      if (e.key === "Escape") {
        const st = useWorldStore.getState();
        if (onCloseTick) {
          e.preventDefault();
          onCloseTick();
          return;
        }
        if (st.gmLiveDomain) {
          e.preventDefault();
          st.setGmLiveDomain(null);
          return;
        }
        if (st.diplomacyPanelOpen) {
          e.preventDefault();
          st.setDiplomacyPanelOpen(false);
          return;
        }
        if (st.dossierFactionId != null) {
          e.preventDefault();
          st.closePolityEditor();
          return;
        }
        if (st.dossierSystemId != null) {
          e.preventDefault();
          st.setDossierSystem(null);
          return;
        }
        if (typing) return;
        st.clearPendingUnitOrder();
        st.clearPendingFleetClone();
        st.clearSystemSelection();
        st.setContextMenu(null);
        return;
      }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "k" || key === "л") {
          e.preventDefault();
          onOpenSpotter?.();
          return;
        }
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          useWorldStore.getState().undo();
          return;
        }
        if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          useWorldStore.getState().redo();
          return;
        }
      }
      if (e.key === "[") {
        e.preventDefault();
        onToggleLeft();
      }
      if (e.key === "]") {
        e.preventDefault();
        onToggleRight();
      }
      if (e.code === "Backslash" || e.code === "IntlBackslash") {
        e.preventDefault();
        onToggleMapOnly?.();
        return;
      }
      /* F1–F4 / F6–F9 open GM domains. Bare F5 is browser refresh. */
      if (/^F[1-46-9]$/.test(e.key) && !mod && !e.altKey && !e.shiftKey) {
        const st = useWorldStore.getState();
        if (st.gmShellMode !== "gm") return;
        const n = Number(e.key.slice(1));
        const def = domainByHotkey(n);
        if (!def) return;
        e.preventDefault();
        if (def.id === "inbox") {
          st.setGmLiveDomain(null);
          onOpenRightDock?.();
        } else {
          st.toggleGmLiveDomain(def.id);
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const st = useWorldStore.getState();
        if (st.gmShellMode !== "gm") return;
        if (st.selectedSystemIds.length > 0) {
          e.preventDefault();
          const ids = st.selectedSystemIds;
          const ok =
            ids.length > 1
              ? confirm(`Удалить ${ids.length} систем?`)
              : confirm(
                  `Удалить «${st.world.systems.find((s) => s.id === ids[0])?.name ?? ids[0]}»?`,
                );
          if (ok) st.deleteSystems(ids);
        } else if (st.selectedFleetId) {
          e.preventDefault();
          const fleet = st.world.fleets.find((f) => f.id === st.selectedFleetId);
          if (confirm(`Удалить флот «${fleet?.name ?? st.selectedFleetId}»?`)) {
            st.deleteFleet(st.selectedFleetId);
          }
        } else if (st.selectedLegionId) {
          e.preventDefault();
          const legion = st.world.legions.find(
            (l) => l.id === st.selectedLegionId,
          );
          if (confirm(`Удалить легион «${legion?.name ?? st.selectedLegionId}»?`)) {
            st.deleteLegion(st.selectedLegionId);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    onToggleLeft,
    onToggleRight,
    onOpenRightDock,
    onOpenSpotter,
    onCloseTick,
    onToggleMapOnly,
  ]);
  return null;
}

function EditorPage() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [tickOpen, setTickOpen] = useState(false);
  const [spotterOpen, setSpotterOpen] = useState(false);
  /** Right rail: inspector by default; F1 / notch → inbox dock. */
  const [rightPanel, setRightPanel] = useState<"inspector" | "inbox">(
    "inspector",
  );
  const [mapOnly, setMapOnly] = useState(false);
  const chromeBackup = useRef({ left: true, right: true });
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const setGmLiveDomain = useWorldStore((s) => s.setGmLiveDomain);
  const gmGesturesEnabled = useWorldStore((s) => s.gmGesturesEnabled);
  const atelier = gmShellMode === "atelier";
  const gm = gmShellMode === "gm";

  const toggleMapOnly = () => {
    if (gmShellMode !== "gm") return;
    if (!mapOnly) {
      chromeBackup.current = { left: leftOpen, right: rightOpen };
      setLeftOpen(false);
      setRightOpen(false);
      setGmLiveDomain(null);
      setMapOnly(true);
      return;
    }
    setLeftOpen(chromeBackup.current.left);
    setRightOpen(chromeBackup.current.right);
    setMapOnly(false);
  };

  const openDomain = (id: GmLiveDomainId) => {
    if (id === "inbox") {
      setGmLiveDomain(null);
      setRightPanel("inbox");
      setRightOpen(true);
      return;
    }
    setGmLiveDomain(id);
  };

  useEffect(() => {
    void fetchContent();
  }, []);

  useEffect(() => {
    if (atelier) {
      setLeftOpen(false);
      setRightOpen(false);
      setGmLiveDomain(null);
    } else {
      setLeftOpen(true);
      setRightOpen(true);
    }
  }, [atelier, setGmLiveDomain]);

  useEffect(() => {
    if (!gm) setMapOnly(false);
  }, [gm]);

  return (
    <CampaignSessionProvider>
      <div
        className={`app-shell app-shell--panels app-shell--${gmShellMode}${
          mapOnly ? " app-shell--map-only" : ""
        }`}
      >
      <EditorHotkeys
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onOpenRightDock={() => {
          setRightPanel("inbox");
          setRightOpen(true);
        }}
        onOpenSpotter={() => setSpotterOpen(true)}
        onCloseTick={tickOpen ? () => setTickOpen(false) : undefined}
        onToggleMapOnly={toggleMapOnly}
      />
        <TopBar onRequestTick={() => setTickOpen(true)} />
        {gm && (
          <GmSessionNotch
            onOpenInbox={() => {
              setRightPanel("inbox");
              setRightOpen(true);
            }}
            onOpenSpotter={() => setSpotterOpen(true)}
            onRequestTick={() => setTickOpen(true)}
          />
        )}
        {gmShellMode === "rp" && (
          <div className="app-shell-body gm-studio-shell">
            <RpStudio />
          </div>
        )}
        {gmShellMode === "simulator" && (
          <div className="app-shell-body gm-studio-shell">
            <BattleSimulator />
          </div>
        )}
        {gmShellMode === "tech" && (
          <div className="app-shell-body gm-studio-shell">
            <TechStudio />
          </div>
        )}
        {gmShellMode === "units" && (
          <div className="app-shell-body gm-studio-shell">
            <UnitCardsStudio />
          </div>
        )}
        {gmShellMode === "buildings" && (
          <div className="app-shell-body gm-studio-shell">
            <BuildingStudio />
          </div>
        )}
        {gmShellMode === "races" && (
          <div className="app-shell-body gm-studio-shell">
            <RacesStudio />
          </div>
        )}
        {gmShellMode === "polities" && (
          <div className="app-shell-body gm-studio-shell">
            <PolityStudio />
          </div>
        )}
        {gmShellMode === "rules" && (
          <div className="app-shell-body gm-studio-shell">
            <GameRulesStudio />
          </div>
        )}
        {atelier && (
          <div className="app-shell-body gm-atelier-shell">
            <GmAtelierPanel />
          </div>
        )}
        {gm && (
          <div className="app-shell-body">
            <EditorShellLayout
              mode="prep"
              leftOpen={leftOpen}
              rightOpen={rightOpen}
              onLeftOpenChange={setLeftOpen}
              onRightOpenChange={setRightOpen}
              leftRailTitle="Показать инструменты ([)"
              rightRailTitle={
                rightPanel === "inbox"
                  ? "Показать очередь (])"
                  : "Показать инспектор (])"
              }
              left={
                <Toolbar
                  onOpenDomain={openDomain}
                />
              }
              right={
                rightPanel === "inbox" ? (
                  <div className="gm-right-stack">
                    <div
                      className="gm-right-stack__tabs gm-mode-switch gm-mode-switch--studios"
                      role="tablist"
                      aria-label="Правая панель"
                    >
                      <button
                        type="button"
                        className="gm-mode-btn"
                        onClick={() => setRightPanel("inspector")}
                      >
                        Инспектор
                      </button>
                      <button type="button" className="gm-mode-btn on">
                        Очередь
                      </button>
                    </div>
                    <GmLiveDock onRequestTick={() => setTickOpen(true)} />
                  </div>
                ) : (
                  <div className="gm-right-stack">
                    <div
                      className="gm-right-stack__tabs gm-mode-switch gm-mode-switch--studios"
                      role="tablist"
                      aria-label="Правая панель"
                    >
                      <button type="button" className="gm-mode-btn on">
                        Инспектор
                      </button>
                      <button
                        type="button"
                        className="gm-mode-btn"
                        onClick={() => setRightPanel("inbox")}
                      >
                        Очередь
                      </button>
                    </div>
                    <Inspector />
                  </div>
                )
              }
              main={
                <main className="viewport">
                  <div className="viewport-glow" />
                  <MapCanvas mode="editor" />
                  {mapOnly && (
                    <button
                      type="button"
                      className="gm-map-only-restore"
                      onClick={toggleMapOnly}
                      aria-label="Показать интерфейс ГМа"
                      title="Показать интерфейс (\)"
                    >
                      UI · \
                    </button>
                  )}
                  <OrderTargetHint />
                  {gmGesturesEnabled ? (
                    <GmLiveStage
                      onOpenDomain={openDomain}
                      onOpenRightDock={() => {
                        setRightPanel("inbox");
                        setRightOpen(true);
                      }}
                    />
                  ) : (
                    <>
                      <div className="gm-map-chrome">
                        <GmAttentionStrip
                          onOpenDomain={openDomain}
                          onOpenRightDock={() => {
                            setRightPanel("inbox");
                            setRightOpen(true);
                          }}
                        />
                        <GmFloatingDock
                          onOpenDomain={openDomain}
                          onOpenRightDock={() => {
                            setRightPanel("inbox");
                            setRightOpen(true);
                          }}
                        />
                      </div>
                    </>
                  )}
                  {(!leftOpen || !rightOpen) && (
                    <div className="viewport-panel-toggles">
                      {!leftOpen && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setLeftOpen(true)}
                          title="Левая панель ([)"
                        >
                          Инстр. ⟩
                        </button>
                      )}
                      {!rightOpen && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setRightOpen(true)}
                          title="Правая панель (])"
                        >
                          {rightPanel === "inbox" ? "⟨ Очередь" : "⟨ Инсп."}
                        </button>
                      )}
                    </div>
                  )}
                </main>
              }
            />
          </div>
        )}
        {gm && <GmWorkbench />}
        <DiplomacyPanel />
        <SystemDossier />
        <PolityDossier />
        <QuestPanel />
        <MapContextMenu />
        <AltQuickInspector />
        <GmTickDialog open={tickOpen} onClose={() => setTickOpen(false)} />
        <GmSpotterModal
          open={spotterOpen}
          onClose={() => setSpotterOpen(false)}
          onOpenDomain={openDomain}
          onRequestTick={() => setTickOpen(true)}
        />
      </div>
    </CampaignSessionProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/view" element={<ViewerPage />} />
          <Route path="/demo/cards" element={<DragCardDemo />} />
          <Route path="*" element={<Navigate to="/view" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
