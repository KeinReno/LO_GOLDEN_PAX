import { useCallback, useEffect, useRef, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { usePendingIntents } from "../IntentsInbox";
import {
  getHostStatus,
  isDesktopApp,
  startHost,
  type HostStatus,
} from "../../desktop/tauriHost";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { FloatingPanel } from "../../ui/FloatingPanel";
import { SessionBriefSection } from "./GmHealthExtras";
import { GmBeatSheet } from "./GmBeatSheet";

/**
 * Session notch: turn · rev · pending · share · host · brief.
 * Click turn chip to set calendar turn (no tick simulation).
 */
export function GmSessionNotch({
  onOpenInbox,
  onOpenSpotter,
  onRequestTick,
}: {
  onOpenInbox?: () => void;
  onOpenSpotter?: () => void;
  onRequestTick?: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const setCampaignTurn = useWorldStore((s) => s.setCampaignTurn);
  const { pending } = usePendingIntents();
  const {
    shareStatus,
    shareLinkChanged,
    shareBusy,
    restartShare,
    setShareOpen,
    copyShareLink,
  } = useCampaignSessionCtx();
  const [host, setHost] = useState<HostStatus | null>(null);
  const [editingTurn, setEditingTurn] = useState(false);
  const [turnDraft, setTurnDraft] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const turnInputRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktopApp();

  const refreshHost = useCallback(async () => {
    if (!desktop) return;
    setHost(await getHostStatus());
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    void refreshHost();
    const id = window.setInterval(() => void refreshHost(), 10000);
    return () => window.clearInterval(id);
  }, [desktop, refreshHost]);

  useEffect(() => {
    if (!editingTurn) return;
    turnInputRef.current?.focus();
    turnInputRef.current?.select();
  }, [editingTurn]);

  const commitTurn = () => {
    const n = Number(turnDraft.trim());
    if (Number.isFinite(n) && n >= 0) {
      setCampaignTurn(n);
    }
    setEditingTurn(false);
  };

  const hostBad =
    desktop &&
    host &&
    !host.running &&
    (!host.root ||
      host.root === "." ||
      !host.root.toLowerCase().includes("gmap"));

  const shareWarn =
    shareStatus === "down" ||
    shareStatus === "degraded" ||
    shareLinkChanged;

  return (
    <>
      <div className="gm-session-notch" role="status" aria-label="Статус сессии">
        {editingTurn ? (
          <span className="gm-session-notch__chip gm-session-notch__chip--edit tabular">
            ход{" "}
            <input
              ref={turnInputRef}
              className="gm-session-notch__turn-input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={turnDraft}
              aria-label="Номер хода"
              onChange={(e) => setTurnDraft(e.target.value)}
              onBlur={commitTurn}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTurn();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingTurn(false);
                }
              }}
            />
            {world.meta.tableRevision != null
              ? ` · rev ${world.meta.tableRevision}`
              : ""}
          </span>
        ) : (
          <button
            type="button"
            className="gm-session-notch__chip gm-session-notch__chip--btn tabular"
            title="Сменить номер хода (без симуляции тика)"
            onClick={() => {
              setTurnDraft(String(world.meta.turn));
              setEditingTurn(true);
            }}
          >
            ход {world.meta.turn}
            {world.meta.tableRevision != null
              ? ` · rev ${world.meta.tableRevision}`
              : ""}
          </button>
        )}

        <button
          type="button"
          className={`gm-session-notch__chip gm-session-notch__chip--btn ${
            pending.length > 0 ? "warn" : ""
          }`}
          onClick={onOpenInbox}
          title="Очередь приказов (F1)"
        >
          очередь {pending.length}
        </button>

        <GmBeatSheet
          variant="notch"
          onRequestTick={onRequestTick}
          onOpenInbox={onOpenInbox}
        />

        <button
          type="button"
          className="gm-session-notch__chip gm-session-notch__chip--btn"
          title="Быстрый поиск систем, держав и команд (Ctrl+K)"
          onClick={onOpenSpotter}
        >
          🔍 споттер
        </button>

        <button
          type="button"
          className="gm-session-notch__chip gm-session-notch__chip--btn"
          title="Бриф сессии по снимкам data/turns/"
          onClick={() => setBriefOpen(true)}
        >
          бриф
        </button>

        <button
          type="button"
          className={`gm-session-notch__chip gm-session-notch__chip--btn ${
            shareWarn ? "warn" : ""
          }`}
          title="Доступ для игроков"
          onClick={() => setShareOpen(true)}
        >
          {shareStatus === "online" && !shareLinkChanged
            ? "игроки ●"
            : shareLinkChanged
              ? "новая ссылка!"
              : shareStatus === "idle"
                ? "туннель выкл"
                : shareStatus}
        </button>

        {shareWarn && (
          <button
            type="button"
            className="gm-session-notch__chip gm-session-notch__chip--btn warn"
            disabled={shareBusy}
            title={
              shareLinkChanged
                ? "Скопировать новую ссылку"
                : "Обновить туннель / ссылку"
            }
            onClick={() => {
              if (shareLinkChanged) void copyShareLink();
              else void restartShare();
            }}
          >
            {shareBusy
              ? "…"
              : shareLinkChanged
                ? "копировать URL"
                : "обновить ссылку"}
          </button>
        )}

        {desktop && (
          <span
            className={`gm-session-notch__chip ${host?.running ? "ok" : "warn"}`}
            title={host?.root || host?.lastError || "Desktop host"}
          >
            {host?.running ? `хост :${host.port}` : "хост выкл"}
            {hostBad && " · корень?"}
            {!host?.running && (
              <button
                type="button"
                className="btn ghost gm-session-notch__start"
                onClick={() => void startHost().then(() => refreshHost())}
              >
                Старт
              </button>
            )}
          </span>
        )}
      </div>

      <FloatingPanel
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        title="ГМ · Бриф сессии"
        storageKey="gm-session-brief"
        defaultGeom={{ x: 72, y: 96, w: 440, h: 520 }}
        minW={280}
        minH={240}
        resizable
        zIndex={390}
        className="gm-workbench-panel"
      >
        <SessionBriefSection compact />
      </FloatingPanel>
    </>
  );
}
