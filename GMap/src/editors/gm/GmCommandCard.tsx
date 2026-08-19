import { useWorldStore } from "../../state/worldStore";
import type { GmLiveDomainId } from "../../state/types";

/**
 * Action-at-source card for Live: verbs for active faction + selected system.
 */
export function GmCommandCard({
  onOpenDomain,
}: {
  onOpenDomain: (id: GmLiveDomainId) => void;
}) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const openRpForFaction = useWorldStore((s) => s.openRpForFaction);
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);

  const faction = world.factions.find((f) => f.id === activeFactionId) ?? null;
  const system =
    world.systems.find((s) => s.id === selectedSystemId) ?? null;

  if (!faction && !system) return null;

  const npcs = faction?.npcs?.length ?? 0;
  const seated =
    faction?.npcs?.filter((n) => n.councilSeat != null && n.councilSeat !== "")
      .length ?? 0;

  return (
    <div className="gm-command-card" role="region" aria-label="Команды мастера">
      {faction && (
        <div className="gm-command-block">
          <div className="gm-command-head">
            <span
              className="gm-command-swatch"
              style={{ background: faction.color }}
            />
            <div>
              <p className="gm-command-kicker">Держава</p>
              <strong>{faction.name}</strong>
            </div>
          </div>
          <p className="hint">
            NPC {npcs} · за столом {seated}
          </p>
          <div className="gm-command-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => openPolityEditor(faction.id)}
            >
              Досье
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => openRpForFaction(faction.id)}
            >
              Сцена
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("economy")}
            >
              Казна
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("science")}
            >
              Наука
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("court")}
            >
              Двор
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("intel")}
            >
              Intel
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setDiplomacyPanelOpen(true)}
            >
              Дипло
            </button>
          </div>
        </div>
      )}
      {system && (
        <div className="gm-command-block">
          <div className="gm-command-head">
            <div>
              <p className="gm-command-kicker">Система</p>
              <strong>{system.name}</strong>
            </div>
          </div>
          <p className="hint">
            {system.ownerFactionId
              ? world.factions.find((f) => f.id === system.ownerFactionId)
                  ?.name ?? system.ownerFactionId
              : "нейтральная"}
            {(() => {
              const loyals = (system.planets ?? [])
                .map((p) => p.loyalty)
                .filter((n): n is number => typeof n === "number");
              if (!loyals.length) return "";
              const avg = loyals.reduce((a, b) => a + b, 0) / loyals.length;
              return ` · лояльность ~${Math.round(avg)}`;
            })()}
          </p>
          <div className="gm-command-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => openSystemView(system.id)}
            >
              Досье системы
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("ops")}
            >
              Ops / таймер
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenDomain("quests")}
            >
              Сессия
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
