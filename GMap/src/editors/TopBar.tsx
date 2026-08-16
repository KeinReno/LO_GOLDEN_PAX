import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Dna,
  Factory,
  FlaskConical,
  FolderOpen,
  Globe2,
  Landmark,
  Rocket,
  Scale,
  ScrollText,
  Swords,
} from "lucide-react";
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
import { RpGmDesk } from "../viewer/RpGmDesk";
import { exportMapPosterPng, exportMapPlayerPosterPng } from "../io/exportExtras";
import type { WorldState } from "../state/types";
import { GmLocalPlayerPreview } from "./gm";

function posterFilename(name: string, turn: number): string {
  const slug = (name || "campaign").replace(/\s+/g, "_");
  return `${slug}_ход${turn}.png`;
}

async function downloadPoster(world: WorldState): Promise<void> {
  const ok = await exportMapPosterPng(world, {
    filename: posterFilename(world.meta.name, world.meta.turn),
  });
  if (!ok) {
    alert("Карта ещё не готова — подождите кадр и повторите");
  }
}

async function downloadPlayerPoster(
  world: WorldState,
  factionId: string | null,
  factionName?: string,
): Promise<void> {
  const ok = await exportMapPlayerPosterPng(world, {
    factionId,
    factionName,
  });
  if (!ok) {
    alert(
      factionId
        ? "Нет видимых систем для этой державы — или карта ещё не готова"
        : "Выберите державу в выпадающем списке",
    );
  }
}

export function TopBar({ onRequestTick }: { onRequestTick: () => void }) {
  const {
    world,
    dirty,
    draftMeta,
    lastSaved,
    syncMsg,
    onSaveToServer,
    onApplyBuild,
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
    shareAutoRefresh,
    setShareAutoRefresh,
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
  const [applyBusy, setApplyBusy] = useState(false);
  const [rpUnread, setRpUnread] = useState(0);
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

  const modeSwitch = (
    <div className="gm-mode-switch gm-mode-switch--studios" role="group" aria-label="Режимы и студии GM">
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "gm" ? "on" : ""}`}
        onClick={() => setGmShellMode("gm")}
        title="Карта галактики, кисти, домены F1–F9, тик"
      >
        <span className="gm-mode-icon">
          <Globe2 size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Карта</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "rp" ? "on" : ""}`}
        onClick={() => setGmShellMode("rp")}
        title="Ролевой стол: Хроники, каналы, маски NPC, дайсы"
      >
        <span className="gm-mode-icon">
          <ScrollText size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>RP Стол</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "simulator" ? "on" : ""}`}
        onClick={() => setGmShellMode("simulator")}
        title="Боевой полигон & Тир (флот, легион, осада, бенчмарк)"
      >
        <span className="gm-mode-icon">
          <Swords size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Симулятор</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "tech" ? "on" : ""}`}
        onClick={() => setGmShellMode("tech")}
        title="Конструктор технологий, грейдов I–V, сокетов"
      >
        <span className="gm-mode-icon">
          <FlaskConical size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Наука</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "units" ? "on" : ""}`}
        onClick={() => setGmShellMode("units")}
        title="Конструктор кораблей и легионов с живой ККИ-карточкой"
      >
        <span className="gm-mode-icon">
          <Rocket size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Карты & Юниты</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "buildings" ? "on" : ""}`}
        onClick={() => setGmShellMode("buildings")}
        title="Конструктор зданий, станций и космо-объектов"
      >
        <span className="gm-mode-icon">
          <Factory size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Сооружения</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "races" ? "on" : ""}`}
        onClick={() => setGmShellMode("races")}
        title="Конструктор рас и видовых признаков"
      >
        <span className="gm-mode-icon">
          <Dna size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Расы</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "polities" ? "on" : ""}`}
        onClick={() => setGmShellMode("polities")}
        title="Редактор государств и фракций"
      >
        <span className="gm-mode-icon">
          <Landmark size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Державы</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "rules" ? "on" : ""}`}
        onClick={() => setGmShellMode("rules")}
        title="Настройки темпа игры (Блиц, Стандарт, Хардкор) и правил"
      >
        <span className="gm-mode-icon">
          <Scale size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Баланс</span>
      </button>
      <button
        type="button"
        className={`gm-mode-btn ${gmShellMode === "atelier" ? "on" : ""}`}
        onClick={() => setGmShellMode("atelier")}
        title="Сырые каталоги контента (JSON)"
      >
        <span className="gm-mode-icon">
          <FolderOpen size={13} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span>Ателье</span>
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
                    type="text"
                    name="username"
                    autoComplete="username"
                    style={{ display: "none" }}
                    value="cloudpub_user"
                    readOnly
                  />
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
            {(shareStatus === "down" ||
              shareStatus === "degraded" ||
              shareLinkChanged) && (
              <button
                type="button"
                className="btn primary block"
                disabled={shareBusy}
                onClick={() => void restartShare()}
                title="Пересоздать туннель и получить актуальную ссылку"
              >
                {shareBusy
                  ? "Обновляю…"
                  : shareLinkChanged
                    ? "Ссылка новая — скопируй"
                    : "Обновить ссылку"}
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() => void copyShareLink()}
            >
              {shareCopied
                ? "Скопировано"
                : shareLinkChanged
                  ? "Копировать новую"
                  : "Копировать"}
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
          <label className="check">
            <input
              type="checkbox"
              checked={shareAutoRefresh}
              onChange={(e) => setShareAutoRefresh(e.target.checked)}
            />
            Автообновление при 503 / падении (~10с)
          </label>
        </>
      )}
      {shareError && <p className="hint share-error">{shareError}</p>}
      <div className="share-local-preview">
        <GmLocalPlayerPreview />
      </div>
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
      title="RP · мастер"
      focusFactionId={rpFocusFactionId}
      unread={rpUnread}
    >
      <RpGmDesk
        masterToken={masterToken}
        onMsg={setSyncMsg}
        focusFactionId={rpFocusFactionId}
        onUnreadChange={setRpUnread}
      />
    </FloatingRpWindow>
  );

  return (
    <header className={`top-bar top-bar--${gmShellMode}`}>
      <div className="top-bar-brand">
        <span className="brand-mark">LO PAX</span>
        <span className="top-bar-campaign" title={world.meta.name}>
          {world.meta.name}
        </span>
        {modeSwitch}
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
          disabled={applyBusy}
          title="Сохранить стол + перечитать content + обновить игроков"
          onClick={() => {
            setApplyBusy(true);
            void onApplyBuild().finally(() => setApplyBusy(false));
          }}
        >
          {applyBusy ? "Билд…" : "Применить билд"}
        </button>
        <button
          type="button"
          className="btn ghost"
          title="Закрыть ход на сервере"
          onClick={onRequestTick}
        >
          Тик
        </button>
        <button
          type="button"
          className="btn ghost"
          title="PNG-плакат с названием кампании и ходом"
          onClick={() => void downloadPoster(world)}
        >
          Плакат PNG
        </button>
        <button
          type="button"
          className="btn ghost"
          title="Плакат только по видимой игроку области"
          onClick={() =>
            void downloadPlayerPoster(
              world,
              activeFactionId,
              activeFaction?.name,
            )
          }
        >
          Плакат · игрок
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
          label="RP"
          unread={rpUnread}
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
        <GmLocalPlayerPreview compact />
      </div>

      {menuOpen && (
        <div className="gm-table-menu">
          <div className="share-popover-head">
            <strong>Ещё…</strong>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setMenuOpen(false)}
            >
              ✕
            </button>
          </div>
          <DesktopHostBadge />
          <p className="hint">
            Мастер-токен настраивается в Toolbar → Сессия.
          </p>
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
                void downloadPoster(world);
                setMenuOpen(false);
              }}
            >
              Плакат PNG
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                void downloadPlayerPoster(
                  world,
                  activeFactionId,
                  activeFaction?.name,
                );
                setMenuOpen(false);
              }}
            >
              Плакат · вид игрока
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
              /view (без входа)
            </Link>
          </div>
          <GmLocalPlayerPreview />
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
