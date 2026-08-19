import { useMemo, useState } from "react";
import { CardBoard } from "../../ui/cardBoardContext";
import { DragCard } from "../../ui/DragCard";
import { DropZone } from "../../ui/DropZone";
import { ActionRing, type ActionRingItem } from "../../ui/ActionRing";
import {
  mergeGestureBindProps,
  useLongPress,
} from "../../ui/useLongPress";
import { useWorldStore } from "../../state/worldStore";
import type { GmLiveDomainId } from "../../state/types";
import { GM_LIVE_DOMAINS, domainHotkeyLabel } from "./gmDomains";
import { GmAttentionStrip } from "./GmAttentionStrip";
import { parseAttentionCard } from "./gmAttentionCard";

const VERB_DOMAINS = GM_LIVE_DOMAINS.filter((d) => d.id !== "health");

function parseDomainCard(cardId: string): GmLiveDomainId | null {
  if (!cardId.startsWith("gm-domain:")) return null;
  return cardId.slice("gm-domain:".length) as GmLiveDomainId;
}

/**
 * Live GM gesture stage — map stays primary.
 * Drag verb cards onto faction/system wells; long-press target → ActionRing.
 */
export function GmLiveStage({
  onOpenDomain,
  onOpenRightDock,
}: {
  onOpenDomain: (id: GmLiveDomainId) => void;
  onOpenRightDock?: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const openRpForFaction = useWorldStore((s) => s.openRpForFaction);
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);

  const faction = world.factions.find((f) => f.id === activeFactionId) ?? null;
  const system =
    world.systems.find((s) => s.id === selectedSystemId) ?? null;

  const [ring, setRing] = useState<{
    x: number;
    y: number;
    kind: "faction" | "system";
  } | null>(null);

  const applyVerbToFaction = (domain: GmLiveDomainId) => {
    if (domain === "inbox") {
      onOpenRightDock?.();
      onOpenDomain("inbox");
      return;
    }
    if (domain === "diplo") {
      setDiplomacyPanelOpen(true);
      onOpenDomain("diplo");
      return;
    }
    onOpenDomain(domain);
  };

  const applyVerbToSystem = (domain: GmLiveDomainId) => {
    if (domain === "inbox") {
      onOpenRightDock?.();
      return;
    }
    if (domain === "diplo") {
      setDiplomacyPanelOpen(true);
      return;
    }
    onOpenDomain(domain);
  };

  const onCardDrop = (cardId: string, target: "faction" | "system") => {
    const attn = parseAttentionCard(cardId);
    if (attn) {
      if (attn.factionId) setActiveFaction(attn.factionId);
      if (attn.systemId) {
        useWorldStore.getState().focusCameraOnSystem(attn.systemId);
      }
      if (attn.domain === "inbox") {
        onOpenRightDock?.();
        onOpenDomain("inbox");
        return;
      }
      onOpenDomain(attn.domain);
      return;
    }
    const domain = parseDomainCard(cardId);
    if (!domain) return;
    if (target === "faction") applyVerbToFaction(domain);
    else applyVerbToSystem(domain);
  };

  const factionRingItems = useMemo((): ActionRingItem[] => {
    if (!faction) return [];
    return [
      {
        id: "dossier",
        label: "Досье",
        onSelect: () => openPolityEditor(faction.id),
      },
      {
        id: "scene",
        label: "Сцена",
        onSelect: () => openRpForFaction(faction.id),
      },
      {
        id: "economy",
        label: "Казна",
        onSelect: () => onOpenDomain("economy"),
      },
      {
        id: "science",
        label: "Выдача техов",
        onSelect: () => onOpenDomain("science"),
      },
      {
        id: "court",
        label: "Двор",
        onSelect: () => onOpenDomain("court"),
      },
      {
        id: "intel",
        label: "Intel",
        onSelect: () => onOpenDomain("intel"),
      },
      {
        id: "diplo",
        label: "Дипло",
        onSelect: () => setDiplomacyPanelOpen(true),
      },
    ];
  }, [
    faction,
    onOpenDomain,
    openPolityEditor,
    openRpForFaction,
    setDiplomacyPanelOpen,
  ]);

  const systemRingItems = useMemo((): ActionRingItem[] => {
    if (!system) return [];
    return [
      {
        id: "dossier",
        label: "Система",
        onSelect: () => openSystemView(system.id),
      },
      {
        id: "ops",
        label: "Ops",
        onSelect: () => onOpenDomain("ops"),
      },
      {
        id: "quests",
        label: "Сессия",
        onSelect: () => onOpenDomain("quests"),
      },
      {
        id: "court",
        label: "Двор",
        onSelect: () => onOpenDomain("court"),
      },
      {
        id: "owner",
        label: "Владелец",
        disabled: !system.ownerFactionId,
        onSelect: () => {
          if (system.ownerFactionId) setActiveFaction(system.ownerFactionId);
        },
      },
    ];
  }, [system, onOpenDomain, openSystemView, setActiveFaction]);

  const factionPress = useLongPress({
    enabled: !!faction,
    onLongPress: ({ x, y }) => setRing({ x, y, kind: "faction" }),
    onTap: () => {
      if (faction) openPolityEditor(faction.id);
    },
  });

  const systemPress = useLongPress({
    enabled: !!system,
    onLongPress: ({ x, y }) => setRing({ x, y, kind: "system" }),
    onTap: () => {
      if (system) openSystemView(system.id);
    },
  });

  const npcs = faction?.npcs?.length ?? 0;
  const seated =
    faction?.npcs?.filter((n) => n.councilSeat != null && n.councilSeat !== "")
      .length ?? 0;

  const loyaltyHint = (() => {
    if (!system) return "";
    const loyals = (system.planets ?? [])
      .map((p) => p.loyalty)
      .filter((n): n is number => typeof n === "number");
    if (!loyals.length) return "";
    const avg = loyals.reduce((a, b) => a + b, 0) / loyals.length;
    return ` · лояльность ~${Math.round(avg)}`;
  })();

  return (
    <div className="gm-live-stage">
      <CardBoard>
        <div className="gm-live-stage__targets" aria-label="Цели мастера">
          {faction ? (
            <DropZone
              zoneId="gm-target-faction"
              accepts={["*"]}
              armWhileDragging
              className="gm-target-well gm-target-well--faction"
              label="Держава"
              onDrop={(cardId) => onCardDrop(cardId, "faction")}
            >
              <button
                type="button"
                className="gm-target-well__hit"
                {...(mergeGestureBindProps(factionPress()) as object)}
              >
                <span
                  className="gm-command-swatch"
                  style={{ background: faction.color }}
                />
                <span className="gm-target-well__body">
                  <strong>{faction.name}</strong>
                  <span className="hint">
                    NPC {npcs} · стол {seated}
                  </span>
                </span>
              </button>
            </DropZone>
          ) : (
            <div className="gm-target-well gm-target-well--empty">
              <p className="hint">Выберите державу сверху</p>
            </div>
          )}

          {system ? (
            <DropZone
              zoneId="gm-target-system"
              accepts={["*"]}
              armWhileDragging
              className="gm-target-well gm-target-well--system"
              label="Система"
              onDrop={(cardId) => onCardDrop(cardId, "system")}
            >
              <button
                type="button"
                className="gm-target-well__hit"
                {...(mergeGestureBindProps(systemPress()) as object)}
              >
                <span className="gm-target-well__body">
                  <strong>{system.name}</strong>
                  <span className="hint">
                    {system.ownerFactionId
                      ? world.factions.find(
                          (f) => f.id === system.ownerFactionId,
                        )?.name ?? system.ownerFactionId
                      : "нейтральная"}
                    {loyaltyHint}
                  </span>
                </span>
              </button>
            </DropZone>
          ) : (
            <div className="gm-target-well gm-target-well--empty">
              <p className="hint">Клик по системе на карте</p>
            </div>
          )}
        </div>

        <GmAttentionStrip
          onOpenDomain={onOpenDomain}
          onOpenRightDock={onOpenRightDock}
          gestureMode
        />

        <div className="gm-verb-deck" aria-label="Глаголы стола">
          <p className="gm-verb-deck__hint">
            Перетащите глагол на цель · удержание цели — кольцо · F1–F4, F6–F9
          </p>
          <div className="gm-verb-deck__hand">
            {VERB_DOMAINS.map((d) => (
              <DragCard
                key={d.id}
                cardId={`gm-domain:${d.id}`}
                title={d.label}
                subtitle={domainHotkeyLabel(d.hotkey) ?? "клик"}
                accent="var(--accent)"
                tilt
                className="gm-verb-card"
              />
            ))}
          </div>
        </div>
      </CardBoard>

      <ActionRing
        open={!!ring}
        x={ring?.x ?? 0}
        y={ring?.y ?? 0}
        onClose={() => setRing(null)}
        items={ring?.kind === "system" ? systemRingItems : factionRingItems}
        radius={72}
      />
    </div>
  );
}
