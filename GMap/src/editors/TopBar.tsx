import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Dna,
  Factory,
  FlaskConical,
  FolderOpen,
  Globe2,
  Hammer,
  Landmark,
  Play,
  Rocket,
  Save,
  Scale,
  ScrollText,
  Swords,
} from "lucide-react";
import type { GmShellMode } from "../state/types";

const TABLE_MODES: {
  id: Extract<GmShellMode, "gm" | "rp" | "simulator">;
  label: string;
  hint: string;
  Icon: typeof Globe2;
}[] = [
  {
    id: "gm",
    label: "Карта",
    hint: "Карта галактики, кисти, домены F1–F4/F6–F9, тик",
    Icon: Globe2,
  },
  {
    id: "rp",
    label: "RP Стол",
    hint: "Ролевой стол: Хроники, каналы, маски NPC, дайсы",
    Icon: ScrollText,
  },
  {
    id: "simulator",
    label: "Симулятор",
    hint: "Боевой полигон (флот, легион, осада, бенчмарк)",
    Icon: Swords,
  },
];

const WORKSHOP_MODES: {
  id: Exclude<GmShellMode, "gm" | "rp" | "simulator">;
  label: string;
  hint: string;
  Icon: typeof Globe2;
  group: "build" | "data";
}[] = [
  {
    id: "tech",
    label: "Технологии",
    hint: "Конструктор техов, грейдов I–V, сокетов · вкладка JSON",
    Icon: FlaskConical,
    group: "build",
  },
  {
    id: "units",
    label: "Карты & Юниты",
    hint: "Конструктор кораблей и легионов с живой ККИ-карточкой",
    Icon: Rocket,
    group: "build",
  },
  {
    id: "buildings",
    label: "Сооружения",
    hint: "Конструктор: здания, станции, космо-объекты · вкладка JSON",
    Icon: Factory,
    group: "build",
  },
  {
    id: "races",
    label: "Расы",
    hint: "Конструктор рас и видовых признаков",
    Icon: Dna,
    group: "build",
  },
  {
    id: "polities",
    label: "Державы",
    hint: "Редактор государств и фракций",
    Icon: Landmark,
    group: "build",
  },
  {
    id: "rules",
    label: "Темп",
    hint: "Темп кампании (Блиц, Стандарт, Хардкор) и регуляторы",
    Icon: Scale,
    group: "build",
  },
  {
    id: "atelier",
    label: "Каталоги",
    hint: "Квесты, рецепты, совет — то, чему нет конструктора",
    Icon: FolderOpen,
    group: "data",
  },
];

const WORKSHOP_GROUPS: { id: "build" | "data"; label: string }[] = [
  { id: "build", label: "Конструкторы" },
  { id: "data", label: "Без конструктора" },
];
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
import { useGmRpUnread } from "../viewer/useGmRpUnread";
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
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const workshopRef = useRef<HTMLDivElement>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [rpUnread, setRpUnread] = useState(0);
  useGmRpUnread(masterToken, setRpUnread);

  useEffect(() => {
    if (!workshopOpen) return;
    const onDoc = (e: MouseEvent) => {
      const node = workshopRef.current;
      if (node && !node.contains(e.target as Node)) setWorkshopOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [workshopOpen]);
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

  const workshopCurrent =
    WORKSHOP_MODES.find((m) => m.id === gmShellMode) ?? null;

  const modeSwitch = (
    <div className="gm-chrome-modes">
      <div
        className="gm-mode-switch gm-mode-switch--studios"
        role="group"
        aria-label="Стол GM"
      >
        {TABLE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`gm-mode-btn ${gmShellMode === m.id ? "on" : ""}`}
            onClick={() => {
              setWorkshopOpen(false);
              setGmShellMode(m.id);
            }}
            title={m.hint}
          >
            <span className="gm-mode-icon">
              <m.Icon size={13} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <div className="gm-workshop" ref={workshopRef}>
        <button
          type="button"
          className={`gm-mode-btn ${workshopCurrent ? "on" : ""}`}
          aria-haspopup="menu"
          aria-expanded={workshopOpen}
          title="Конструкторы и каталоги без конструктора"
          onClick={() => {
            setMenuOpen(false);
            setWorkshopOpen((o) => !o);
          }}
        >
          <span className="gm-mode-icon">
            <FolderOpen size={13} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span>{workshopCurrent?.label ?? "Мастерская"}</span>
        </button>
        {workshopOpen && (
          <div className="gm-workshop-menu" role="menu" aria-label="Мастерская">
            {WORKSHOP_GROUPS.map((g) => (
              <div
                key={g.id}
                className="gm-workshop-cluster"
                role="group"
                aria-label={g.label}
              >
                <p className="gm-workshop-group">{g.label}</p>
                {WORKSHOP_MODES.filter((m) => m.group === g.id).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    className={`gm-mode-btn ${gmShellMode === m.id ? "on" : ""}`}
                    title={m.hint}
                    onClick={() => {
                      setGmShellMode(m.id);
                      setWorkshopOpen(false);
                    }}
                  >
                    <span className="gm-mode-icon">
                      <m.Icon size={13} strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
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
      open={rpFloatOpen && gmShellMode !== "rp"}
      onOpenChange={setRpFloatOpen}
      storageKey="gmap-rp-float-geom-gm"
      title="RP-чат поверх карты"
      unread={rpUnread}
      zIndex={520}
    >
      <RpGmDesk
        masterToken={masterToken}
        onMsg={setSyncMsg}
        focusFactionId={rpFocusFactionId}
        onUnreadChange={setRpUnread}
      />
    </FloatingRpWindow>
  );

  const onMap = gmShellMode === "gm";

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

      {onMap && <MapSearch />}

      <div
        className="gm-mode-switch gm-mode-switch--ops"
        role="group"
        aria-label="Стол"
      >
        {onMap && (
          <>
            <button
              type="button"
              className="gm-mode-btn"
              disabled={undoPastLen === 0}
              title="Отмена (Ctrl+Z)"
              aria-label="Отмена"
              onClick={() => undo()}
            >
              ↶
            </button>
            <button
              type="button"
              className="gm-mode-btn"
              disabled={undoFutureLen === 0}
              title="Повтор (Ctrl+Y)"
              aria-label="Повтор"
              onClick={() => redo()}
            >
              ↷
            </button>
          </>
        )}
        <button
          type="button"
          className="gm-mode-btn"
          title="Сохранить черновик"
          onClick={() => void onSaveToServer()}
        >
          <span className="gm-mode-icon">
            <Save size={13} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span>Сохранить</span>
        </button>
        <button
          type="button"
          className="gm-mode-btn"
          disabled={applyBusy}
          title="Сохранить стол + перечитать content + обновить игроков"
          onClick={() => {
            setApplyBusy(true);
            void onApplyBuild().finally(() => setApplyBusy(false));
          }}
        >
          <span className="gm-mode-icon">
            <Hammer size={13} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span>{applyBusy ? "Билд…" : "Билд"}</span>
        </button>
        <button
          type="button"
          className="gm-mode-btn"
          title="Закрыть ход на сервере"
          onClick={onRequestTick}
        >
          <span className="gm-mode-icon">
            <Play size={13} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span>Тик</span>
        </button>
      </div>

      {onMap && (
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
            <option value="">— держава —</option>
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
          <RpFloatLauncher
            open={rpFloatOpen}
            onToggle={() => setRpFloatOpen(!rpFloatOpen)}
            label="Чат"
            unread={rpUnread}
          />
        </div>
      )}

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
        <button
          type="button"
          className="gm-mode-btn"
          onClick={() => {
            setWorkshopOpen(false);
            setMenuOpen((o) => !o);
          }}
          title="Плакаты, JSON, досье, дипло"
        >
          Стол…
        </button>
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
          <div className="btn-col">
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                openPolityEditor(activeFactionId);
                setGmShellMode("polities");
                setMenuOpen(false);
              }}
            >
              Державы
            </button>
            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                setDiplomacyPanelOpen(true);
                setMenuOpen(false);
              }}
            >
              Дипломатия
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
          <p className="hint">
            Ресурсы и кисти — вкладка «Инструменты» слева (оба режима).
          </p>
        </div>
      )}

      {sharePopover}

      {syncMsg ? (
        <p className="top-bar-status" title={syncMsg}>
          {syncMsg}
        </p>
      ) : null}

      {rpWindow}
    </header>
  );
}
