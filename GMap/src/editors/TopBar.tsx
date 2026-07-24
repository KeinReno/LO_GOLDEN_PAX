import { Link } from "react-router-dom";
import { useWorldStore } from "../state/worldStore";
import { resolvePolityKind } from "../state/territory";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { fmtTime } from "./useCampaignSession";

import { MapSearch } from "./MapSearch";
import { DesktopHostBadge } from "./DesktopHostBadge";

export function TopBar() {
  const {
    world,
    dirty,
    draftMeta,
    lastSaved,
    syncMsg,
    onSaveToServer,
    onAdvanceTurn,
    onDownloadMap,
    shareBusy,
    shareViewUrl,
    shareProvider,
    shareEndpointIp,
    shareHint,
    shareError,
    shareCopied,
    shareOpen,
    setShareOpen,
    shareAbortRef,
    openForPlayers,
    copyShareLink,
    stopShare,
    setShareBusy,
    hasCloudPubToken,
    hasCloudPubCli,
    cloudpubTokenInput,
    setCloudpubTokenInput,
  } = useCampaignSessionCtx();

  const undo = useWorldStore((s) => s.undo);
  const redo = useWorldStore((s) => s.redo);
  const undoPastLen = useWorldStore((s) => s.undoPast.length);
  const undoFutureLen = useWorldStore((s) => s.undoFuture.length);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const activeFaction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;

  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        <span className="brand-mark">LO PAX</span>
        <span className="top-bar-campaign" title={world.meta.name}>
          {world.meta.name}
        </span>
        <span
          className="hint"
          title="Ход / tableRevision"
          style={{ opacity: 0.75, fontSize: 12 }}
        >
          ход {world.meta.turn}
          {world.meta.tableRevision != null
            ? ` · rev ${world.meta.tableRevision}`
            : ""}
        </span>
        <DesktopHostBadge />
        {dirty ? (
          <span className="save-pill dirty" title="Черновик пишется…">
            ●
          </span>
        ) : (
          <span className="save-pill ok" title="Черновик актуален">
            ✓
          </span>
        )}
      </div>

      <MapSearch />

      <div className="top-bar-actions">
        <button
          type="button"
          className="btn ghost top-icon-btn"
          disabled={undoPastLen === 0}
          title="Отмена (Ctrl+Z)"
          onClick={() => undo()}
        >
          ↶
        </button>
        <button
          type="button"
          className="btn ghost top-icon-btn"
          disabled={undoFutureLen === 0}
          title="Повтор (Ctrl+Y)"
          onClick={() => redo()}
        >
          ↷
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void onSaveToServer()}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="btn ghost"
          title="Закрыть ход на сервере (processTurn)"
          onClick={() => {
            if (
              window.confirm(
                `Закрыть ход ${world.meta.turn} и применить pending intents?`,
              )
            ) {
              void onAdvanceTurn();
            }
          }}
        >
          Тик хода
        </button>
        <button type="button" className="btn ghost" onClick={onDownloadMap}>
          JSON
        </button>
      </div>

      <div className="top-bar-polity">
        {activeFaction?.emblemPath ? (
          <img
            className="faction-emblem-thumb"
            src={activeFaction.emblemPath}
            alt=""
          />
        ) : (
          <span
            className="swatch"
            style={{ background: activeFaction?.color ?? "#666" }}
          />
        )}
        <select
          value={activeFactionId ?? ""}
          onChange={(e) => setActiveFaction(e.target.value || null)}
          title="Активная держава для кистей"
        >
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {resolvePolityKind(f) === "state" ? "◆ " : "◇ "}
              {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn ghost"
          onClick={() => openPolityEditor(activeFactionId)}
        >
          Державы
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDiplomacyPanelOpen(true)}
        >
          Дипломатия
        </button>
      </div>

      <div className="top-bar-share">
        <button
          type="button"
          className={`btn ${shareViewUrl ? "primary" : "ghost"}`}
          disabled={shareBusy}
          onClick={() => {
            if (shareViewUrl) setShareOpen((o) => !o);
            else void openForPlayers();
          }}
        >
          {shareBusy
            ? "Открываю…"
            : shareViewUrl
              ? "Игроки ●"
              : "Для игроков"}
        </button>
        <Link
          className="view-link-inline"
          to="/view"
          target="_blank"
          rel="noreferrer"
        >
          /view
        </Link>
      </div>

      {shareOpen && (
        <div className="share-popover">
          <div className="share-popover-head">
            <strong>Доступ для игроков</strong>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setShareOpen(false)}
            >
              ✕
            </button>
          </div>
          {!shareViewUrl && (
            <>
              {(!hasCloudPubToken || !hasCloudPubCli) && (
                <div className="share-cloudpub-setup">
                  {!hasCloudPubCli && (
                    <p className="share-hint">
                      Нужен CloudPub CLI:{" "}
                      <code>GMap/tools/cloudpub/clo.exe</code> (скачай с
                      cloudpub.ru).
                    </p>
                  )}
                  {!hasCloudPubToken && (
                    <>
                      <p className="share-hint">
                        API-ключ CloudPub (кабинет cloudpub.ru) — один раз:
                      </p>
                      <input
                        className="share-url"
                        type="password"
                        autoComplete="off"
                        placeholder="CloudPub API key"
                        value={cloudpubTokenInput}
                        onChange={(e) => setCloudpubTokenInput(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn primary block"
                disabled={shareBusy}
                onClick={() => void openForPlayers()}
              >
                {shareBusy ? "Открываю CloudPub…" : "Открыть доступ"}
              </button>
            </>
          )}
          {shareBusy && (
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                shareAbortRef.current?.abort();
                setShareBusy(false);
              }}
            >
              Отмена
            </button>
          )}
          {shareViewUrl && (
            <>
              <p className="hint">
                Ссылка{shareProvider ? ` · ${shareProvider}` : ""}
              </p>
              <textarea
                className="share-url share-url-area"
                readOnly
                rows={2}
                value={shareViewUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              {shareEndpointIp ? (
                <p className="share-ip">
                  IP для loca.lt: <code>{shareEndpointIp}</code>
                </p>
              ) : (
                shareHint && <p className="share-hint">{shareHint}</p>
              )}
              {shareProvider === "cloudpub" && (
                <p className="hint">
                  CloudPub (РФ) — дай игрокам ссылку как есть.
                </p>
              )}
              {shareProvider === "cloudflare" && (
                <p className="hint">
                  Cloudflare: на МТС может не открыться. Стоп → снова «Открыть
                  доступ».
                </p>
              )}
              {shareProvider === "localtunnel" && !shareEndpointIp && (
                <p className="share-hint">
                  loca.lt часто ломается. Стоп и снова «Открыть доступ» —
                  предпочтителен CloudPub.
                </p>
              )}
              <div className="share-actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void copyShareLink()}
                >
                  {shareCopied ? "Скопировано" : "Копировать"}
                </button>
                <a
                  className="btn ghost"
                  href={shareViewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть
                </a>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void stopShare()}
                >
                  Стоп
                </button>
              </div>
            </>
          )}
          {shareError && <p className="hint share-error">{shareError}</p>}
        </div>
      )}

      {(syncMsg || draftMeta || lastSaved) && (
        <p className="top-bar-status" title={syncMsg ?? undefined}>
          {syncMsg ??
            `черновик ${draftMeta ? fmtTime(draftMeta.savedAt) : "—"}${
              lastSaved ? ` · ок ${fmtTime(lastSaved)}` : ""
            }`}
        </p>
      )}
    </header>
  );
}
