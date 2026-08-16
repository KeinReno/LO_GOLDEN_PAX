import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { MapCanvas } from "./renderers/MapCanvas";
import { TurnStampHud } from "./ui/TurnStampHud";
import { StatusStrip } from "./ui/StatusStrip";
import { EditorShellLayout } from "./ui/EditorShellLayout";
import { Toolbar } from "./editors/Toolbar";
import { Inspector } from "./editors/Inspector";
import { TopBar } from "./editors/TopBar";
import {
  CampaignSessionProvider,
  useCampaignSessionCtx,
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
}: {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenRightDock?: () => void;
  onOpenSpotter?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
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
      /* Domains F1–F9 — always in GM session */
      if (/^F[1-9]$/.test(e.key) && !mod && !e.altKey) {
        const st = useWorldStore.getState();
        if (st.gmShellMode === "gm") {
          const n = Number(e.key.slice(1));
          const def = domainByHotkey(n);
          if (def) {
            e.preventDefault();
            if (def.id === "inbox") {
              st.setGmLiveDomain(null);
              onOpenRightDock?.();
            } else {
              st.toggleGmLiveDomain(def.id);
            }
          }
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const st = useWorldStore.getState();
        if (st.selectedSystemIds.length > 0) {
          e.preventDefault();
          st.deleteSystems(st.selectedSystemIds);
        } else if (st.selectedFleetId) {
          e.preventDefault();
          st.deleteFleet(st.selectedFleetId);
        } else if (st.selectedLegionId) {
          e.preventDefault();
          st.deleteLegion(st.selectedLegionId);
        }
      }
      if (e.key === "Escape") {
        const st = useWorldStore.getState();
        if (st.gmLiveDomain) {
          e.preventDefault();
          st.setGmLiveDomain(null);
          return;
        }
        st.clearPendingUnitOrder();
        st.clearPendingFleetClone();
        st.clearSystemSelection();
        st.setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleLeft, onToggleRight, onOpenRightDock]);
  return null;
}

function EditorChrome() {
  const { syncMsg, setSyncMsg } = useCampaignSessionCtx();
  return (
    <StatusStrip
      message={syncMsg}
      onDismiss={() => setSyncMsg(null)}
    />
  );
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
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const setGmLiveDomain = useWorldStore((s) => s.setGmLiveDomain);
  const gmGesturesEnabled = useWorldStore((s) => s.gmGesturesEnabled);
  const atelier = gmShellMode === "atelier";
  const gm = gmShellMode === "gm";

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

  return (
    <CampaignSessionProvider>
      <div
        className={`app-shell app-shell--panels app-shell--${gmShellMode}`}
      >
      <EditorHotkeys
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onOpenRightDock={() => {
          setRightPanel("inbox");
          setRightOpen(true);
        }}
        onOpenSpotter={() => setSpotterOpen(true)}
      />
        <TopBar onRequestTick={() => setTickOpen(true)} />
        {gm && (
          <GmSessionNotch
            onOpenInbox={() => {
              setRightPanel("inbox");
              setRightOpen(true);
            }}
            onOpenSpotter={() => setSpotterOpen(true)}
          />
        )}
        <EditorChrome />
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
                  onRequestTick={() => setTickOpen(true)}
                />
              }
              right={
                rightPanel === "inbox" ? (
                  <div className="gm-right-stack">
                    <div className="gm-right-stack__tabs">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setRightPanel("inspector")}
                      >
                        Инспектор
                      </button>
                      <button type="button" className="btn ghost active">
                        Очередь
                      </button>
                    </div>
                    <GmLiveDock onRequestTick={() => setTickOpen(true)} />
                  </div>
                ) : (
                  <div className="gm-right-stack">
                    <div className="gm-right-stack__tabs">
                      <button type="button" className="btn ghost active">
                        Инспектор
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
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
                  <TurnStampHud />
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
                      <p className="viewport-hint gm-live-hint">
                        F1–F9 домены · Attention снизу · Сессия слева · жесты —
                        опция в Сессии
                      </p>
                    </>
                  )}
                  <div className="viewport-panel-toggles">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setLeftOpen((v) => !v)}
                      title="Левая панель ([)"
                    >
                      {leftOpen ? "⟨ Инстр." : "Инстр. ⟩"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setRightOpen((v) => !v)}
                      title="Правая панель (])"
                    >
                      {rightOpen
                        ? rightPanel === "inbox"
                          ? "Очередь ⟩"
                          : "Инсп. ⟩"
                        : rightPanel === "inbox"
                          ? "⟨ Очередь"
                          : "⟨ Инсп."}
                    </button>
                  </div>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
