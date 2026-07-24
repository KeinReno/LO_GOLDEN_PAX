import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { MapCanvas } from "./renderers/MapCanvas";
import { Toolbar } from "./editors/Toolbar";
import { Inspector } from "./editors/Inspector";
import { TopBar } from "./editors/TopBar";
import { CampaignSessionProvider } from "./editors/CampaignSessionContext";
import { DiplomacyPanel } from "./editors/DiplomacyPanel";
import { SystemDossier } from "./editors/SystemDossier";
import { PolityDossier } from "./editors/PolityDossier";
import { QuestPanel } from "./editors/QuestPanel";
import { MapContextMenu } from "./editors/MapContextMenu";
import { ViewerPage } from "./viewer/ViewerPage";
import { useWorldStore } from "./state/worldStore";

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
}: {
  onToggleLeft: () => void;
  onToggleRight: () => void;
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
        st.clearPendingUnitOrder();
        st.clearPendingFleetClone();
        st.clearSystemSelection();
        st.setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggleLeft, onToggleRight]);
  return null;
}

function EditorPage() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <CampaignSessionProvider>
      <div
        className={`app-shell${leftOpen ? "" : " left-collapsed"}${
          rightOpen ? "" : " right-collapsed"
        }`}
      >
        <EditorHotkeys
          onToggleLeft={() => setLeftOpen((v) => !v)}
          onToggleRight={() => setRightOpen((v) => !v)}
        />
        <TopBar />
        {leftOpen ? (
          <Toolbar />
        ) : (
          <button
            type="button"
            className="panel-rail panel-rail-left"
            title="Показать инструменты ([)"
            onClick={() => setLeftOpen(true)}
          >
            ⚙
          </button>
        )}
        <main className="viewport">
          <div className="viewport-glow" />
          <MapCanvas mode="editor" />
          <OrderTargetHint />
          <div className="viewport-hint">
            Ctrl+клик / рамка — мультивыбор · перенос флотов · ПКМ — меню · Del —
            удалить · СКМ — пан
          </div>
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
              {rightOpen ? "Инсп. ⟩" : "⟨ Инсп."}
            </button>
          </div>
        </main>
        {rightOpen ? (
          <Inspector />
        ) : (
          <button
            type="button"
            className="panel-rail panel-rail-right"
            title="Показать инспектор (])"
            onClick={() => setRightOpen(true)}
          >
            ▣
          </button>
        )}
        <DiplomacyPanel />
        <SystemDossier />
        <PolityDossier />
        <QuestPanel />
        <MapContextMenu />
      </div>
    </CampaignSessionProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/view" element={<ViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
