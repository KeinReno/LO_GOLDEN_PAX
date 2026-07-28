import { Link } from "react-router-dom";
import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { resolvePolityKind } from "../state/territory";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { fmtTime } from "./useCampaignSession";
import { MapSearch } from "./MapSearch";
import { DesktopHostBadge } from "./DesktopHostBadge";
import {
  FloatingRpWindow,
  RpFloatLauncher,
} from "./FloatingRpWindow";
import { usePendingIntents } from "./IntentsInbox";

export function TopBar({ onRequestTick }: { onRequestTick: () => void }) {
  const {
    world,
    dirty,
    draftMeta,
    lastSaved,
    syncMsg,
    onSaveToServer,
    onDownloadMap,
    shareBusy,
    shareViewUrl,
    shareLastViewUrl,
    shareProvider,
    shareEndpointIp,
    shareHint,
    shareError,
    shareCopied,
    shareOpen,
    setShareOpen,
    shareStatus,
    shareLastHealthAt,
    shareLastHealthError,
    shareDownSince,
    shareLinkChanged,
    shareWanIp,
    shareDirectViewUrl,
    shareDirectHint,
    shareDirectCopied,
    shareAbortRef,
    openForPlayers,
    restartShare,
    copyShareLink,
    copyDirectLink,
    stopShare,
    setShareBusy,
    hasCloudPubToken,
    hasCloudPubCli,
    cloudpubTokenInput,
    setCloudpubTokenInput,
    masterToken,
    setMasterToken,
    setSyncMsg,
  } = useCampaignSessionCtx();

  const undo = useWorldStore((s) => s.undo);
  const redo = useWorldStore((s) => s.redo);
  const undoPastLen = useWorldStore((s) => s.undoPast.length);
  const undoFutureLen = useWorldStore((s) => s.undoFuture.length);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const gmOmniscientView = useWorldStore((s) => s.gmOmniscientView);
  const setGmOmniscientView = useWorldStore((s) => s.setGmOmniscientView);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const rpFloatOpen = useWorldStore((s) => s.rpFloatOpen);
  const rpFocusFactionId = useWorldStore((s) => s.rpFocusFactionId);
  const setRpFloatOpen = useWorldStore((s) => s.setRpFloatOpen);
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const setGmShellMode = useWorldStore((s) => s.setGmShellMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeFaction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;

  const displayShareUrl = shareViewUrl || shareLastViewUrl;
  const shareSession =
    shareStatus === "online" ||
    shareStatus === "degraded" ||
    shareStatus === "down" ||
    shareStatus === "starting" ||
    !!displayShareUrl;

  const shareBtnLabel = shareBusy
    ? "Открываю…"
    : shareStatus === "online"
      ? "Игроки ● online"
      : shareStatus === "degraded" || shareStatus === "starting"
        ? "Игроки ● reconnect…"
        : shareStatus === "down"
          ? "Игроки ● DOWN"
          : "Для игроков";

  const shareBtnClass =
    shareStatus === "online"
      ? "btn primary share-status-btn share-status-online"
      : shareStatus === "degraded" || shareStatus === "starting"
        ? "btn share-status-btn share-status-degraded"
        : shareStatus === "down"
          ? "btn share-status-btn share-status-down"
          : shareViewUrl
            ? "btn primary"
            : "btn ghost";

  const live = gmShellMode === "live";
  const { pending } = usePendingIntents();

  const modeSwitch = (
    <div className="gm-mode-switch" role="group" aria-label="Режим ГМа">
      <button
        type="button"
        className={`gm-mode-btn ${!live ? "on" : ""}`}
        onClick={() => setGmShellMode("prep")}
        title="Картостроение, кисти, ресурсы"
      >
        Подготовка
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${live ? "on" : ""}`}
        onClick={() => setGmShellMode("live")}
        title="Стол: приказы, тик, игроки"
      >
        Стол
      </button>
    </div>
  );

  const sharePopover = shareOpen ? (
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

      {shareSession && (
        <p className={`share-status-line share-status-line--${shareStatus}`}>
          {shareStatus === "online" && "Соединение: online"}
          {shareStatus === "degraded" && "Соединение: переподключение…"}
          {shareStatus === "starting" && "Соединение: запуск…"}
          {shareStatus === "down" && "Соединение: DOWN"}
          {shareStatus === "idle" && "Соединение: выкл"}
          {shareLastHealthAt
            ? ` · проверка ${fmtTime(shareLastHealthAt)}`
            : ""}
        </p>
      )}
      {shareLastHealthError && shareStatus !== "online" && (
        <p className="hint share-error">{shareLastHealthError}</p>
      )}
      {shareDownSince && shareStatus === "down" && (
        <p className="hint">Упал с {fmtTime(shareDownSince)}</p>
      )}

      {!displayShareUrl && (
        <>
          {(!hasCloudPubToken || !hasCloudPubCli) && (
            <div className="share-cloudpub-setup">
              {!hasCloudPubCli && (
                <p className="share-hint">
                  Нужен CloudPub CLI:{" "}
                  <code>GMap/tools/cloudpub/clo.exe</code>
                </p>
              )}
              {!hasCloudPubToken && (
                <>
                  <p className="share-hint">API-ключ CloudPub — один раз:</p>
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
      {displayShareUrl && (
        <>
          <p className="hint">
            Ссылка{shareProvider ? ` · ${shareProvider}` : ""}
            {shareLinkChanged ? " · новая ссылка" : ""}
          </p>
          <textarea
            className={`share-url share-url-area${shareLinkChanged ? " share-url-new" : ""}`}
            readOnly
            rows={2}
            value={displayShareUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          {shareEndpointIp ? (
            <p className="share-ip">
              IP для loca.lt: <code>{shareEndpointIp}</code>
            </p>
          ) : (
            shareHint && <p className="share-hint">{shareHint}</p>
          )}
          {shareDirectViewUrl && (
            <>
              <p className="hint">
                Прямой доступ
                {shareWanIp ? ` · WAN ${shareWanIp}` : ""}
              </p>
              <textarea
                className="share-url share-url-area"
                readOnly
                rows={2}
                value={shareDirectViewUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              {shareDirectHint && (
                <p className="share-hint">{shareDirectHint}</p>
              )}
              <div className="share-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void copyDirectLink()}
                >
                  {shareDirectCopied ? "IP скопирован" : "Копировать IP"}
                </button>
              </div>
            </>
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
              href={displayShareUrl}
              target="_blank"
              rel="noreferrer"
            >
              Открыть
            </a>
            <button
              type="button"
              className="btn ghost"
              disabled={shareBusy}
              onClick={() => void restartShare()}
            >
              Перезапустить
            </button>
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
  ) : null;

  const rpWindow = (
    <FloatingRpWindow
      open={rpFloatOpen}
      onOpenChange={setRpFloatOpen}
      mode="master"
      masterToken={masterToken}
      onMsg={setSyncMsg}
      storageKey="gmap-rp-float-geom-gm"
      title="Сцена · мастер"
      focusFactionId={rpFocusFactionId}
    />
  );

  if (live) {
    return (
      <header className="top-bar top-bar--live">
        <div className="top-bar-live-left">
          <span className="brand-mark">LO PAX</span>
          <span className="top-bar-turn">ход {world.meta.turn}</span>
          {modeSwitch}
        </div>
        <div className="top-bar-live-right">
          <button
            type="button"
            className={`live-status-pill live-status-pill--${shareStatus}`}
            title={shareLastHealthError || "Доступ для игроков"}
            onClick={() => {
              if (shareSession) setShareOpen((o) => !o);
              else void openForPlayers();
            }}
          >
            <span
              className={`share-status-dot share-status-dot--${shareStatus}`}
              aria-hidden
            />
            {shareStatus === "online"
              ? "online"
              : shareStatus === "idle"
                ? "туннель выкл"
                : shareStatus}
          </button>
          {pending.length > 0 && (
            <span className="live-inbox-badge" title="Pending приказы в доке справа">
              Inbox {pending.length}
            </span>
          )}
          <button
            type="button"
            className={`btn ghost ${rpFloatOpen ? "active" : ""}`}
            onClick={() => setRpFloatOpen(!rpFloatOpen)}
            title="Отыгрыш с фракциями"
          >
            Сцена
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Сохранить, ссылка, державы…"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ···
          </button>
        </div>

        {menuOpen && (
          <div className="gm-table-menu">
            <div className="share-popover-head">
              <strong>Стол…</strong>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <DesktopHostBadge />
            <button
              type="button"
              className="btn primary block"
              onClick={() => {
                onRequestTick();
                setMenuOpen(false);
              }}
            >
              Закрыть ход · превью
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                void onSaveToServer();
                setMenuOpen(false);
              }}
            >
              Сохранить / опубликовать
            </button>
            <label className="field">
              <span>Мастер-токен</span>
              <input
                value={masterToken}
                onChange={(e) => setMasterToken(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={gmOmniscientView}
                onChange={(e) => setGmOmniscientView(e.target.checked)}
              />
              Видимость ГМа (вся карта)
            </label>
            <div className="btn-col">
              <button
                type="button"
                className="btn ghost block"
                onClick={() => {
                  openPolityEditor(activeFactionId);
                  setMenuOpen(false);
                }}
              >
                Державы…
              </button>
              <button
                type="button"
                className="btn ghost block"
                onClick={() => {
                  setDiplomacyPanelOpen(true);
                  setMenuOpen(false);
                }}
              >
                Дипломатия…
              </button>
              <button
                type="button"
                className="btn ghost block"
                onClick={() => {
                  onDownloadMap();
                  setMenuOpen(false);
                }}
              >
                Скачать JSON
              </button>
              <Link
                className="btn ghost block"
                to="/view"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                Превью /view
              </Link>
            </div>
            <p className="hint">
              Ресурсы: слева «Инструменты» (кнопка ⟨ Инстр.).
            </p>
          </div>
        )}

        {sharePopover}

        {syncMsg && (
          <p className="top-bar-status top-bar-status--live" title={syncMsg}>
            {syncMsg}
          </p>
        )}

        {rpWindow}
      </header>
    );
  }

  return (
    <header className={`top-bar top-bar--${gmShellMode}`}>
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
        {modeSwitch}
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
          title="Закрыть ход на сервере"
          onClick={onRequestTick}
        >
          Тик
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
          title="Активная держава для кистей / превью тумана"
        >
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {resolvePolityKind(f) === "state" ? "◆ " : "◇ "}
              {f.name}
            </option>
          ))}
        </select>
        <label
          className="check top-bar-gm-vision"
          title="Вкл — вся карта. Выкл — как у выбранной державы"
        >
          <input
            type="checkbox"
            checked={gmOmniscientView}
            onChange={(e) => setGmOmniscientView(e.target.checked)}
          />
          Видимость ГМа
        </label>
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
        <RpFloatLauncher
          open={rpFloatOpen}
          onToggle={() => setRpFloatOpen(!rpFloatOpen)}
          label="Сцена"
        />
        <button
          type="button"
          className="btn ghost"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Стол…
        </button>
      </div>

      <div className="top-bar-share">
        <button
          type="button"
          className={shareBtnClass}
          disabled={shareBusy}
          title={
            shareStatus === "down"
              ? shareLastHealthError || "Туннель недоступен"
              : shareStatus === "online"
                ? "Туннель онлайн"
                : undefined
          }
          onClick={() => {
            if (shareSession) setShareOpen((o) => !o);
            else void openForPlayers();
          }}
        >
          <span
            className={`share-status-dot share-status-dot--${shareStatus}`}
            aria-hidden
          />
          {shareBtnLabel}
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

      {menuOpen && (
        <div className="gm-table-menu">
          <div className="share-popover-head">
            <strong>Стол…</strong>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setMenuOpen(false)}
            >
              ✕
            </button>
          </div>
          <DesktopHostBadge />
          <label className="field">
            <span>Мастер-токен</span>
            <input
              value={masterToken}
              onChange={(e) => setMasterToken(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={gmOmniscientView}
              onChange={(e) => setGmOmniscientView(e.target.checked)}
            />
            Видимость ГМа (вся карта)
          </label>
          <div className="btn-col">
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                openPolityEditor(activeFactionId);
                setMenuOpen(false);
              }}
            >
              Державы…
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                setDiplomacyPanelOpen(true);
                setMenuOpen(false);
              }}
            >
              Дипломатия…
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                onDownloadMap();
                setMenuOpen(false);
              }}
            >
              Скачать JSON
            </button>
            <Link
              className="btn ghost block"
              to="/view"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              Превью /view
            </Link>
          </div>
          <p className="hint">
            Ресурсы и кисти — вкладка «Инструменты» слева (оба режима).
          </p>
        </div>
      )}

      {sharePopover}

      {(syncMsg || draftMeta || lastSaved) && (
        <p className="top-bar-status" title={syncMsg ?? undefined}>
          {syncMsg ??
            `черновик ${draftMeta ? fmtTime(draftMeta.savedAt) : "—"}${
              lastSaved ? ` · ок ${fmtTime(lastSaved)}` : ""
            }`}
        </p>
      )}

      {rpWindow}
    </header>
  );
}
