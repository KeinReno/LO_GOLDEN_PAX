import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  Flag,
  FlaskConical,
  Handshake,
  Landmark,
  Map as MapIcon,
  MessageSquare,
  MoreHorizontal,
  Store,
  Users,
} from "lucide-react";
import type { PlayerOrder } from "../state/types";
import { OrderTray } from "./OrderTray";
import type { AlertItem } from "./ViewerAlertFab";
import type { DiploOffer } from "./DealDesk";
import type { PlayerView } from "./viewerNavTypes";

export interface ViewerDockProps {
  mobile: boolean;
  viewMode: PlayerView;
  desktopGlass: boolean;
  dockCollapsed: boolean;
  dockMoreOpen: boolean;
  cardBattleId: string | null;
  cardBattleMinimized: boolean;
  reservedAp: number;
  apMax: number;
  reservedForceAp: number;
  forceApMax: number;
  activeOrders: PlayerOrder[];
  currentTurn: number;
  affordableResearch: number;
  rpUnread: number;
  diploIncoming: DiploOffer[];
  warCount: number;
  tradePartnerCount: number;
  activeQuestCount: number;
  viewerAlertItems: AlertItem[];
  onGoView: (v: PlayerView) => void;
  onToggleDockCollapsed: () => void;
  onToggleDockMore: () => void;
  onRpOpen: () => void;
}

export function ViewerDock({
  mobile,
  viewMode,
  desktopGlass,
  dockCollapsed,
  dockMoreOpen,
  cardBattleId,
  cardBattleMinimized,
  reservedAp,
  apMax,
  reservedForceAp,
  forceApMax,
  activeOrders,
  currentTurn,
  affordableResearch,
  rpUnread,
  diploIncoming,
  warCount,
  tradePartnerCount,
  activeQuestCount,
  viewerAlertItems,
  onGoView,
  onToggleDockCollapsed,
  onToggleDockMore,
  onRpOpen,
}: ViewerDockProps) {
  return (
    <nav
      className={`viewer-dock viewer-dock--float ${
        mobile ? "viewer-dock--mobile viewer-dock--v2" : "viewer-dock--desktop"
      }${dockCollapsed ? " viewer-dock--collapsed" : ""}${
        cardBattleId && !cardBattleMinimized ? " viewer-dock--battle-hidden" : ""
      }`}
      aria-label="Навигация игрока"
      aria-expanded={!dockCollapsed}
      aria-hidden={Boolean(cardBattleId && !cardBattleMinimized)}
    >
      <OrderTray
        apUsed={reservedAp}
        apMax={apMax}
        forceApUsed={reservedForceAp}
        forceApMax={forceApMax}
        activeOrders={activeOrders}
        currentTurn={currentTurn}
      />
      <button
        type="button"
        className="viewer-dock-toggle"
        aria-label={dockCollapsed ? "Показать панель" : "Скрыть панель"}
        title={dockCollapsed ? "Показать панель · B" : "Скрыть панель · B"}
        onClick={onToggleDockCollapsed}
      >
        {dockCollapsed ? (
          <ChevronUp size={16} strokeWidth={2.2} aria-hidden />
        ) : (
          <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
        )}
        {dockCollapsed && <span className="viewer-dock-toggle__hint">Меню</span>}
      </button>
      <div className="viewer-dock__body">
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "map" && !desktopGlass ? "active" : ""}`}
          onClick={() => onGoView("map")}
          title={mobile ? "Карта · 1" : "Карта · 1"}
          aria-label="Карта"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <MapIcon size={18} strokeWidth={2} />
          </span>
          Карта
          {!mobile && <kbd className="viewer-dock-kbd">1</kbd>}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "forces" ? "active" : ""}`}
          onClick={() => onGoView("forces")}
          title={mobile ? "Силы · 2" : "Силы · 2"}
          aria-label="Силы"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Flag size={18} strokeWidth={2} />
          </span>
          Силы
          {!mobile && <kbd className="viewer-dock-kbd">2</kbd>}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "economy" ? "active" : ""}`}
          onClick={() => onGoView("economy")}
          title={mobile ? "Экономика · 3" : "Экономика · 3"}
          aria-label="Экономика"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Coins size={18} strokeWidth={2} />
          </span>
          {mobile ? "Эконом" : "Эконом"}
          {!mobile && <kbd className="viewer-dock-kbd">3</kbd>}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "research" ? "active" : ""}`}
          onClick={() => onGoView("research")}
          title={mobile ? "Наука · 4" : "Наука · 4"}
          aria-label="Наука"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <FlaskConical size={18} strokeWidth={2} />
          </span>
          Наука
          {!mobile && <kbd className="viewer-dock-kbd">4</kbd>}
          {affordableResearch > 0 && (
            <span className="dock-badge dock-badge--hot">
              {affordableResearch > 9 ? "9+" : affordableResearch}
            </span>
          )}
        </button>
        {mobile ? (
          <button
            type="button"
            className={`viewer-dock-btn ${viewMode === "rp" ? "active" : ""}`}
            onClick={onRpOpen}
            title="RP · 5"
            aria-label="RP · ролевой чат"
          >
            <span className="viewer-dock-icon" aria-hidden>
              <MessageSquare size={18} strokeWidth={2} />
            </span>
            RP
            {rpUnread > 0 && viewMode !== "rp" && (
              <span className="dock-badge dock-badge--hot">
                {rpUnread > 9 ? "9+" : rpUnread}
              </span>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`viewer-dock-btn ${viewMode === "diplomacy" ? "active" : ""} ${diploIncoming.length > 0 ? "is-alert" : ""}`}
              onClick={() => onGoView("diplomacy")}
              title="Дипломатия · 5"
              aria-label="Дипломатия"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <Handshake size={18} strokeWidth={2} />
              </span>
              Дипло
              <kbd className="viewer-dock-kbd">5</kbd>
              {(warCount > 0 || diploIncoming.length > 0) && (
                <span
                  className={`dock-badge ${diploIncoming.length > 0 ? "dock-badge--hot" : ""}`}
                >
                  {diploIncoming.length > 0
                    ? diploIncoming.length > 9
                      ? "9+"
                      : diploIncoming.length
                    : warCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`viewer-dock-btn viewer-dock-btn--secondary ${viewMode === "market" ? "active" : ""}`}
              onClick={() => onGoView("market")}
              title="Биржа · 6"
              aria-label="Биржа"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <Store size={18} strokeWidth={2} />
              </span>
              Биржа
              <kbd className="viewer-dock-kbd">6</kbd>
              {tradePartnerCount > 0 && (
                <span className="dock-badge">
                  {tradePartnerCount > 9 ? "9+" : tradePartnerCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`viewer-dock-btn viewer-dock-btn--secondary ${viewMode === "quests" ? "active" : ""}`}
              onClick={() => onGoView("quests")}
              title="Квесты · 7"
              aria-label="Квесты"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <BookMarked size={18} strokeWidth={2} />
              </span>
              Квесты
              <kbd className="viewer-dock-kbd">7</kbd>
              {activeQuestCount > 0 && (
                <span className="dock-badge">
                  {activeQuestCount > 9 ? "9+" : activeQuestCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`viewer-dock-btn viewer-dock-btn--secondary ${viewMode === "court" ? "active" : ""}`}
              onClick={() => onGoView("court")}
              title="Двор · 8"
              aria-label="Двор"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <Users size={18} strokeWidth={2} />
              </span>
              Двор
              <kbd className="viewer-dock-kbd">8</kbd>
            </button>
            <button
              type="button"
              className={`viewer-dock-btn viewer-dock-btn--hub ${viewMode === "hq" ? "active" : ""}`}
              onClick={() => onGoView("hq")}
              title="Штаб · H"
              aria-label="Штаб"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <Landmark size={18} strokeWidth={2} />
              </span>
              Штаб
              <kbd className="viewer-dock-kbd">H</kbd>
              {viewerAlertItems.length > 0 && viewMode !== "hq" && (
                <span className="dock-badge dock-badge--hot">
                  {viewerAlertItems.length > 9 ? "9+" : viewerAlertItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`viewer-dock-btn ${viewMode === "rp" ? "active" : ""}`}
              onClick={onRpOpen}
              title="RP"
              aria-label="RP"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <MessageSquare size={18} strokeWidth={2} />
              </span>
              RP
              <kbd className="viewer-dock-kbd viewer-dock-kbd--spacer" aria-hidden>
                ·
              </kbd>
              {rpUnread > 0 && viewMode !== "rp" && (
                <span className="dock-badge dock-badge--hot">
                  {rpUnread > 9 ? "9+" : rpUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`viewer-dock-btn viewer-dock-btn--hub ${viewMode === "codex" ? "active" : ""}`}
              onClick={() => onGoView("codex")}
              title="Справочник · 9"
              aria-label="Справочник"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <BookOpen size={18} strokeWidth={2} />
              </span>
              Справ.
              <kbd className="viewer-dock-kbd">9</kbd>
            </button>
          </>
        )}
        {mobile && (
          <div className="viewer-dock-more">
            <button
              type="button"
              className={`viewer-dock-btn ${
                dockMoreOpen ||
                viewMode === "hq" ||
                viewMode === "market" ||
                viewMode === "diplomacy" ||
                viewMode === "quests" ||
                viewMode === "court" ||
                viewMode === "codex"
                  ? "active"
                  : ""
              } ${diploIncoming.length > 0 ? "is-alert" : ""}`}
              onClick={onToggleDockMore}
              title="Ещё"
              aria-label="Ещё разделы"
              aria-expanded={dockMoreOpen}
            >
              <span className="viewer-dock-icon" aria-hidden>
                <MoreHorizontal size={18} strokeWidth={2} />
              </span>
              Ещё
              {(viewerAlertItems.length > 0 ||
                diploIncoming.length > 0 ||
                (activeQuestCount > 0 && viewMode !== "quests")) && (
                <span className="dock-badge dock-badge--hot">
                  {Math.min(
                    9,
                    viewerAlertItems.length +
                      diploIncoming.length +
                      (activeQuestCount > 0 && viewMode !== "quests" ? 1 : 0),
                  ) > 9
                    ? "9+"
                    : viewerAlertItems.length +
                      diploIncoming.length +
                      (activeQuestCount > 0 && viewMode !== "quests" ? 1 : 0)}
                </span>
              )}
            </button>
            {dockMoreOpen && (
              <div className="viewer-dock-more-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "hq" ? "active" : ""}`}
                  onClick={() => onGoView("hq")}
                >
                  <Landmark size={16} strokeWidth={2} aria-hidden />
                  Штаб
                  {viewerAlertItems.length > 0 && (
                    <span className="dock-badge dock-badge--hot">
                      {viewerAlertItems.length > 9 ? "9+" : viewerAlertItems.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "diplomacy" ? "active" : ""}`}
                  onClick={() => onGoView("diplomacy")}
                >
                  <Handshake size={16} strokeWidth={2} aria-hidden />
                  Дипломатия
                  {diploIncoming.length > 0 && (
                    <span className="dock-badge dock-badge--hot">
                      {diploIncoming.length > 9 ? "9+" : diploIncoming.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "market" ? "active" : ""}`}
                  onClick={() => onGoView("market")}
                >
                  <Store size={16} strokeWidth={2} aria-hidden />
                  Биржа
                  {tradePartnerCount > 0 && (
                    <span className="dock-badge">
                      {tradePartnerCount > 9 ? "9+" : tradePartnerCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "quests" ? "active" : ""}`}
                  onClick={() => onGoView("quests")}
                >
                  <BookMarked size={16} strokeWidth={2} aria-hidden />
                  Квесты
                  {activeQuestCount > 0 && (
                    <span className="dock-badge">
                      {activeQuestCount > 9 ? "9+" : activeQuestCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "court" ? "active" : ""}`}
                  onClick={() => onGoView("court")}
                >
                  <Users size={16} strokeWidth={2} aria-hidden />
                  Двор
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`viewer-dock-more-item ${viewMode === "codex" ? "active" : ""}`}
                  onClick={() => onGoView("codex")}
                >
                  <BookOpen size={16} strokeWidth={2} aria-hidden />
                  Справочник
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
