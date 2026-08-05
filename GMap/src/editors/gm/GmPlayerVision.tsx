import { useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { getVisibleSystemIdsWithFog } from "../../state/fog";
import { GmLocalPlayerPreview } from "./GmLocalPlayerPreview";

/**
 * GM: compare omniscient map vs what the active faction can see.
 */
export function GmPlayerVision({ compact = false }: { compact?: boolean }) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const showFogPreview = useWorldStore((s) => s.showFogPreview);
  const gmOmniscientView = useWorldStore((s) => s.gmOmniscientView);
  const fogMaskPreview = useWorldStore((s) => s.fogMaskPreview);
  const setShowFogPreview = useWorldStore((s) => s.setShowFogPreview);
  const setGmOmniscientView = useWorldStore((s) => s.setGmOmniscientView);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const setTool = useWorldStore((s) => s.setTool);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [showHidden, setShowHidden] = useState(false);

  const faction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;

  const vision = useMemo(() => {
    if (!activeFactionId) {
      return {
        visible: new Set<string>(),
        hidden: [] as { id: string; name: string }[],
        total: world.systems.length,
        fullMap: false,
      };
    }
    const visible = getVisibleSystemIdsWithFog(
      world,
      activeFactionId,
      fogMaskPreview,
    );
    const hidden = world.systems
      .filter((s) => !visible.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      visible,
      hidden,
      total: world.systems.length,
      fullMap: faction?.fullMapVision === true,
    };
  }, [world, activeFactionId, faction?.fullMapVision, fogMaskPreview]);

  const enablePlayerLens = () => {
    setGmOmniscientView(true);
    setShowFogPreview(true);
    setSyncMsg(
      faction
        ? `Линза игрока: ${faction.name} · скрытые системы затемнены`
        : "Выберите державу",
    );
  };

  const enableSliceMode = () => {
    setGmOmniscientView(false);
    setShowFogPreview(false);
    setSyncMsg("Режим среза: карта как у игрока (без полной карты ГМа)");
  };

  const revealSystem = async (systemId: string) => {
    if (!activeFactionId) return;
    try {
      const res = await fetch("/api/fog/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          factionId: activeFactionId,
          systemId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const fogRes = await fetch("/api/fog", {
        headers: { "X-Master-Token": masterToken },
      });
      if (fogRes.ok) {
        const fog = (await fogRes.json()) as {
          masks?: Record<string, string[]>;
        };
        useWorldStore
          .getState()
          .setFogMaskPreview(fog.masks?.[activeFactionId] ?? []);
      }
      setSyncMsg(`Открыто для ${faction?.name ?? activeFactionId}`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const focusHidden = (systemId: string) => {
    focusCameraOnSystem(systemId);
    setTool("fog_erase");
  };

  if (!faction) {
    return <p className="hint">Выберите державу в фокусе ГМа.</p>;
  }

  return (
    <div className={`gm-player-vision${compact ? " gm-player-vision--compact" : ""}`}>
      {!compact && (
        <>
          <h4 className="gm-player-vision__title">Видимость игрока</h4>
          <p className="hint">
            Сравнение карты ГМа с тем, что видит{" "}
            <strong>{faction.name}</strong>.
          </p>
        </>
      )}

      <div className="gm-player-vision__stats tabular">
        <span>
          видно <strong>{vision.visible.size}</strong> / {vision.total}
        </span>
        {vision.fullMap && (
          <span className="gm-player-vision__badge">полная карта</span>
        )}
        {vision.hidden.length > 0 && (
          <span className="gm-player-vision__warn">
            скрыто {vision.hidden.length}
          </span>
        )}
      </div>

      <div className="btn-col">
        <button
          type="button"
          className={`btn ${showFogPreview && gmOmniscientView ? "primary" : "ghost"} block`}
          onClick={enablePlayerLens}
        >
          Линза игрока · затемнить туман
        </button>
        <button
          type="button"
          className={`btn ${!gmOmniscientView ? "primary" : "ghost"} block`}
          onClick={enableSliceMode}
        >
          Срез как /view (без omniscient)
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={showFogPreview}
          onChange={(e) => setShowFogPreview(e.target.checked)}
        />
        Превью тумана на карте
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={gmOmniscientView}
          onChange={(e) => setGmOmniscientView(e.target.checked)}
        />
        Omniscient ГМ (вся карта)
      </label>

      {vision.hidden.length > 0 && (
        <div className="gm-player-vision__hidden">
          <button
            type="button"
            className="btn ghost block"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "Скрыть список" : `Скрытые системы (${vision.hidden.length})`}
          </button>
          {showHidden && (
            <ul className="gm-player-vision__list">
              {vision.hidden.slice(0, 24).map((s) => (
                <li key={s.id} className="gm-player-vision__row">
                  <span>{s.name}</span>
                  <div className="gm-player-vision__row-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      title="Центр + кисть туман−"
                      onClick={() => focusHidden(s.id)}
                    >
                      Фокус
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      title="Постоянно открыть для державы"
                      onClick={() => void revealSystem(s.id)}
                    >
                      Открыть
                    </button>
                  </div>
                </li>
              ))}
              {vision.hidden.length > 24 && (
                <li className="hint">…ещё {vision.hidden.length - 24}</li>
              )}
            </ul>
          )}
        </div>
      )}

      <GmLocalPlayerPreview compact={compact} />
    </div>
  );
}
