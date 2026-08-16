import { useEffect, useMemo, useRef, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { GM_LIVE_DOMAINS } from "./gmDomains";
import type { GmLiveDomainId } from "../../state/types";

export type SpotterCategory = "system" | "faction" | "fleet" | "legion" | "command";

export type SpotterItem = {
  id: string;
  category: SpotterCategory;
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: string;
  badgeTone?: "accent" | "good" | "bad" | "warn" | "neutral";
  action: () => void;
};

export function GmSpotterModal({
  open,
  onClose,
  onOpenDomain,
  onRequestTick,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDomain?: (id: GmLiveDomainId) => void;
  onRequestTick?: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const selectSystem = useWorldStore((s) => s.selectSystem);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const selectFleet = useWorldStore((s) => s.selectFleet);
  const selectLegion = useWorldStore((s) => s.selectLegion);
  const setShowFogPreview = useWorldStore((s) => s.setShowFogPreview);
  const showFogPreview = useWorldStore((s) => s.showFogPreview);
  const setTool = useWorldStore((s) => s.setTool);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const allItems = useMemo<SpotterItem[]>(() => {
    const items: SpotterItem[] = [];

    // 1. Systems
    for (const sys of world.systems) {
      const owner = sys.ownerFactionId
        ? world.factions.find((f) => f.id === sys.ownerFactionId)
        : null;
      items.push({
        id: `sys:${sys.id}`,
        category: "system",
        title: sys.name,
        subtitle: `${sys.kind === "corridor" ? "Узел" : "Система"} · ${owner ? owner.name : "Нейтральная"}${sys.isCapital ? " ★ Столица" : ""}`,
        icon: sys.isCapital ? "👑" : sys.kind === "corridor" ? "💠" : "🪐",
        badge: owner?.name || "Нейтрал",
        badgeTone: owner ? "accent" : "neutral",
        action: () => {
          selectSystem(sys.id);
          focusCameraOnSystem(sys.id);
          openSystemView(sys.id);
        },
      });
    }

    // 2. Factions
    for (const fac of world.factions) {
      const planets = world.systems.filter((s) => s.ownerFactionId === fac.id);
      const planetsCount = planets.length;
      const capital = planets.find((s) => s.isCapital) || planets[0];
      items.push({
        id: `fac:${fac.id}`,
        category: "faction",
        title: fac.name,
        subtitle: `Держава · Систем под контролем: ${planetsCount}${fac.kind ? ` · ${fac.kind}` : ""}`,
        icon: "🏛",
        badge: `Цвет ${fac.color || "—"}`,
        badgeTone: "accent",
        action: () => {
          setActiveFaction(fac.id);
          if (capital) {
            selectSystem(capital.id);
            focusCameraOnSystem(capital.id);
          }
          openPolityEditor(fac.id);
        },
      });
    }

    // 3. Fleets
    for (const fleet of world.fleets) {
      const sys = world.systems.find((s) => s.id === fleet.systemId);
      const fac = world.factions.find((f) => f.id === fleet.factionId);
      items.push({
        id: `flt:${fleet.id}`,
        category: "fleet",
        title: fleet.name,
        subtitle: `Флот · ${fac?.name || "—"} @ ${sys?.name || "космос"}`,
        icon: "🚀",
        badge: fleet.stance || "idle",
        badgeTone: "warn",
        action: () => {
          selectFleet(fleet.id);
          if (fleet.systemId) {
            selectSystem(fleet.systemId);
            focusCameraOnSystem(fleet.systemId);
          }
        },
      });
    }

    // 4. Legions
    for (const legion of world.legions) {
      const sys = world.systems.find((s) => s.id === legion.systemId);
      const fac = world.factions.find((f) => f.id === legion.factionId);
      items.push({
        id: `leg:${legion.id}`,
        category: "legion",
        title: legion.name,
        subtitle: `Легион · ${fac?.name || "—"} @ ${sys?.name || "космос"}`,
        icon: "🛡",
        badge: legion.status || "idle",
        badgeTone: "good",
        action: () => {
          selectLegion(legion.id);
          if (legion.systemId) {
            selectSystem(legion.systemId);
            focusCameraOnSystem(legion.systemId);
          }
        },
      });
    }

    // 5. GM Commands & Domain shortcuts
    for (const domain of GM_LIVE_DOMAINS) {
      items.push({
        id: `cmd:domain:${domain.id}`,
        category: "command",
        title: `Открыть домен: ${domain.label}`,
        subtitle: `${domain.hint} (горячая клавиша F${domain.hotkey})`,
        icon: "⚡",
        badge: `F${domain.hotkey}`,
        badgeTone: "accent",
        action: () => {
          onOpenDomain?.(domain.id);
        },
      });
    }

    // Special commands
    if (onRequestTick) {
      items.push({
        id: "cmd:tick",
        category: "command",
        title: "Запустить / проверить расчет хода (Тик)",
        subtitle: "Открыть диалог проведения хода и симуляции",
        icon: "⏱",
        badge: "Тик",
        badgeTone: "good",
        action: () => {
          onRequestTick();
        },
      });
    }

    items.push({
      id: "cmd:fog",
      category: "command",
      title: showFogPreview ? "Отключить туман войны (Режим всеведения)" : "Включить туман войны активной державы",
      subtitle: "Переключить отображение видимости карты",
      icon: "👁",
      badge: "Туман",
      badgeTone: "warn",
      action: () => {
        setShowFogPreview(!showFogPreview);
      },
    });

    items.push({
      id: "cmd:tool_select",
      category: "command",
      title: "Инструмент: Выбор (Select)",
      subtitle: "Сбросить активную кисть на стандартный курсор",
      icon: "↖",
      badge: "Курсор",
      badgeTone: "neutral",
      action: () => {
        setTool("select");
      },
    });

    return items;
  }, [
    world,
    selectSystem,
    focusCameraOnSystem,
    openSystemView,
    setActiveFaction,
    openPolityEditor,
    selectFleet,
    selectLegion,
    onOpenDomain,
    onRequestTick,
    setShowFogPreview,
    showFogPreview,
    setTool,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 15);

    // Prefix filtering e.g. "!cmd", "@faction", "#system"
    let catFilter: SpotterCategory | null = null;
    let textQuery = q;

    if (q.startsWith("!")) {
      catFilter = "command";
      textQuery = q.slice(1).trim();
    } else if (q.startsWith("@")) {
      catFilter = "faction";
      textQuery = q.slice(1).trim();
    } else if (q.startsWith("#") || q.startsWith("sys:")) {
      catFilter = "system";
      textQuery = q.replace(/^#|sys:/, "").trim();
    }

    return allItems
      .filter((item) => {
        if (catFilter && item.category !== catFilter) return false;
        if (!textQuery) return true;
        return (
          item.title.toLowerCase().includes(textQuery) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(textQuery)) ||
          (item.badge && item.badge.toLowerCase().includes(textQuery))
        );
      })
      .slice(0, 25);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selectedEl = list.children[selectedIndex] as HTMLElement | undefined;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        target.action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="gm-spotter-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Быстрый поиск">
      <div className="gm-spotter-panel" onClick={(e) => e.stopPropagation()}>
        <header className="gm-spotter-header">
          <span className="gm-spotter-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="gm-spotter-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск систем, держав, флотов или команд (!команда, @держава, #система)..."
            aria-autocomplete="list"
          />
          <kbd className="gm-spotter-esc" onClick={onClose}>ESC</kbd>
        </header>

        <ul ref={listRef} className="gm-spotter-list" role="listbox">
          {filteredItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <li
                key={item.id}
                className={`gm-spotter-item${isSelected ? " is-selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  item.action();
                  onClose();
                }}
              >
                <span className="gm-spotter-item-icon">{item.icon || "•"}</span>
                <div className="gm-spotter-item-body">
                  <span className="gm-spotter-item-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="gm-spotter-item-sub">{item.subtitle}</span>
                  )}
                </div>
                {item.badge && (
                  <span className={`gm-spotter-badge is-${item.badgeTone || "neutral"}`}>
                    {item.badge}
                  </span>
                )}
              </li>
            );
          })}
          {filteredItems.length === 0 && (
            <li className="gm-spotter-empty">Ничего не найдено по запросу «{query}»</li>
          )}
        </ul>

        <footer className="gm-spotter-footer">
          <span>↑↓ Навигация</span>
          <span>↵ Выбрать</span>
          <span>ESC Закрыть</span>
          <span>@ Державы</span>
          <span>! Команды GM</span>
        </footer>
      </div>
    </div>
  );
}
