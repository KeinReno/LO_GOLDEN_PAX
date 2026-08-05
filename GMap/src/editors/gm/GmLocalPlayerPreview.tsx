import { useEffect, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import {
  buildPlayerViewUrl,
  fetchLanIps,
  openPlayerPreview,
  resolveLanOrigin,
} from "./playerPreview";

/**
 * GM: open localhost / LAN /view as a chosen faction (browser or phone).
 */
export function GmLocalPlayerPreview({ compact = false }: { compact?: boolean }) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const {
    shareDirectViewUrl,
    shareEndpointIp,
    setSyncMsg,
  } = useCampaignSessionCtx();
  const [factionId, setFactionId] = useState(
    () => activeFactionId ?? world.factions[0]?.id ?? "",
  );
  const [open, setOpen] = useState(false);
  const [lanIps, setLanIps] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchLanIps().then((ips) => {
      if (!cancelled) setLanIps(ips);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeFactionId) setFactionId(activeFactionId);
  }, [activeFactionId]);

  const faction =
    world.factions.find((f) => f.id === factionId) ?? world.factions[0] ?? null;
  const lanOrigin = resolveLanOrigin(
    shareDirectViewUrl,
    shareEndpointIp,
    lanIps,
  );

  const openAs = (mode: "local" | "lan") => {
    if (!faction?.password) {
      setSyncMsg("У державы нет кода доступа (password)");
      return;
    }
    if (mode === "lan" && !lanOrigin) {
      setSyncMsg(
        "LAN-адрес не найден — проверь Wi‑Fi /api/lan или открой «Для игроков»",
      );
      return;
    }
    openPlayerPreview({
      factionId: faction.id,
      password: faction.password,
      mode,
      lanOrigin,
    });
    setSyncMsg(
      mode === "lan"
        ? `Превью ${faction.name} · LAN ${lanOrigin}`
        : `Превью ${faction.name} · ${window.location.origin}/view`,
    );
    setOpen(false);
  };

  const copyLan = async () => {
    if (!faction?.password || !lanOrigin) return;
    const url = buildPlayerViewUrl(faction.id, faction.password, lanOrigin);
    try {
      await navigator.clipboard.writeText(url);
      setSyncMsg(`Скопировано для телефона: ${url}`);
    } catch {
      setSyncMsg(url);
    }
  };

  const body = (
    <>
      <label className="field">
        <span>Игрок / держава</span>
        <select
          value={faction?.id ?? ""}
          onChange={(e) => setFactionId(e.target.value)}
        >
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-col">
        <button
          type="button"
          className="btn primary block"
          disabled={!faction}
          onClick={() => openAs("local")}
        >
          Localhost · браузер
        </button>
        <button
          type="button"
          className="btn ghost block"
          disabled={!faction || !lanOrigin}
          title={
            lanOrigin
              ? lanOrigin
              : "Нужен LAN IP хоста (тот же Wi‑Fi)"
          }
          onClick={() => openAs("lan")}
        >
          {lanOrigin
            ? `Телефон · ${lanOrigin.replace(/^https?:\/\//, "")}`
            : "Телефон · нет LAN"}
        </button>
        {lanOrigin && (
          <button
            type="button"
            className="btn ghost block"
            disabled={!faction}
            onClick={() => void copyLan()}
          >
            Копировать LAN‑ссылку
          </button>
        )}
      </div>
    </>
  );

  if (compact) {
    return (
      <div className="gm-local-preview gm-local-preview--compact">
        <button
          type="button"
          className="btn ghost gm-local-preview__trigger"
          title="Открыть /view от лица державы (localhost / телефон)"
          onClick={() => setOpen((v) => !v)}
        >
          Localhost
        </button>
        {open && (
          <div className="gm-local-preview__pop">
            <p className="hint">Превью как игрок · авто-вход</p>
            {body}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="gm-local-preview">
      <h4 className="gm-local-preview__title">Превью как игрок</h4>
      <p className="hint">
        Локальный /view с авто-входом. Для телефона — тот же Wi‑Fi (LAN).
      </p>
      {body}
    </div>
  );
}
