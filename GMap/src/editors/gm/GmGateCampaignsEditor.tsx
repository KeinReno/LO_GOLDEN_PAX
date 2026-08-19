import { useCallback, useEffect, useRef, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import type { GateCampaign } from "../../viewer/login/gateCatalog";
import { FALLBACK_GATE_CAMPAIGNS } from "../../viewer/login/gateCatalog";

function gmHeaders(token: string): HeadersInit {
  return { "X-Master-Token": token, "Content-Type": "application/json" };
}

export function GmGateCampaignsEditor() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [rows, setRows] = useState<GateCampaign[]>(FALLBACK_GATE_CAMPAIGNS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gate-campaigns");
      const data = (await res.json()) as { campaigns?: GateCampaign[] };
      if (Array.isArray(data.campaigns) && data.campaigns.length) {
        setRows(data.campaigns);
      }
    } catch {
      /* keep fallback */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRow = async (row: GateCampaign) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/gm/gate-campaigns", {
        method: "POST",
        headers: gmHeaders(masterToken),
        body: JSON.stringify({
          id: row.id,
          title: row.title,
          kicker: row.kicker,
          blurb: row.blurb,
          live: row.live,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: GateCampaign[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.campaigns) setRows(data.campaigns);
      setSyncMsg(`Карточка «${row.title}» сохранена`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const uploadArt = async (id: string, file: File) => {
    setBusyId(id);
    try {
      const data = await fileToDataUrl(file);
      const res = await fetch("/api/gm/gate-campaigns/art", {
        method: "POST",
        headers: gmHeaders(masterToken),
        body: JSON.stringify({ id, mime: file.type, data }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaigns?: GateCampaign[];
      };
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.campaigns) setRows(body.campaigns);
      setSyncMsg("Постер обновлён");
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="gm-gate-campaigns">
      <p className="hint">
        Карточки на входе игрока (`/view`). Описание и постер видны в
        карусели STRATEGIA / RPG / SAGA.
      </p>
      {rows.map((row) => (
        <article key={row.id} className="gm-gate-card">
          <div className="gm-gate-card-art">
            {row.image ? (
              <img src={row.image} alt="" />
            ) : (
              <span className="gm-gate-card-art-empty">Нет постера</span>
            )}
            <GateArtUpload
              disabled={busyId === row.id}
              onFile={(file) => void uploadArt(row.id, file)}
            />
          </div>
          <div className="gm-gate-card-fields">
            <label className="field">
              <span>Название</span>
              <input
                value={row.title}
                onChange={(e) =>
                  setRows((cur) =>
                    cur.map((c) =>
                      c.id === row.id ? { ...c, title: e.target.value } : c,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              <span>Подпись</span>
              <input
                value={row.kicker}
                onChange={(e) =>
                  setRows((cur) =>
                    cur.map((c) =>
                      c.id === row.id ? { ...c, kicker: e.target.value } : c,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea
                rows={5}
                value={row.blurb}
                onChange={(e) =>
                  setRows((cur) =>
                    cur.map((c) =>
                      c.id === row.id ? { ...c, blurb: e.target.value } : c,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={busyId === row.id}
              onClick={() => void saveRow(row)}
            >
              {busyId === row.id ? "Сохранение…" : "Сохранить карточку"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function GateArtUpload({
  disabled,
  onFile,
}: {
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        className="btn ghost gm-gate-upload"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Заменить изображение
      </button>
    </>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
