import { useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { intentLabel } from "./intentLabels";
import type { IntentRow } from "./IntentsInbox";

/** Confirm dialog with pending-intent preview before server tick. */
export function GmTickDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const { masterToken, onAdvanceTurn, setSyncMsg } = useCampaignSessionCtx();
  const [pending, setPending] = useState<IntentRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/intents", {
          headers: { "X-Master-Token": masterToken },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as IntentRow[];
        if (!cancelled) {
          setPending(
            (Array.isArray(data) ? data : []).filter(
              (i) => i.status === "pending",
            ),
          );
        }
      } catch {
        if (!cancelled) setPending([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, masterToken]);

  if (!open) return null;

  const lines = pending.map((i) => {
    const fac =
      world.factions.find((f) => f.id === i.factionId)?.name ?? i.factionId;
    const toId = i.payload?.toSystemId || i.payload?.systemId;
    const toName = toId
      ? (world.systems.find((s) => s.id === toId)?.name ?? toId)
      : null;
    const fleet = i.payload?.fleetId
      ? world.fleets.find((f) => f.id === i.payload?.fleetId)?.name
      : null;
    const bits = [
      intentLabel(i.defId),
      fleet,
      toName ? `→ ${toName}` : null,
      i.apCost != null ? `${i.apCost} AP` : null,
    ].filter(Boolean);
    return `${fac}: ${bits.join(" · ")}`;
  });

  return (
    <div className="gm-tick-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gm-tick-dialog"
        role="dialog"
        aria-labelledby="gm-tick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gm-tick-title">Закрыть ход {world.meta.turn}?</h2>
        <p className="hint">
          Pending применится и запишется в журнал. Игроки увидят ход{" "}
          {world.meta.turn + 1}.
        </p>
        <div className="gm-tick-preview">
          <p className="hq-stat-label">Применится</p>
          {lines.length === 0 ? (
            <p className="hint">Нет pending — тик всё равно сдвинет ход.</p>
          ) : (
            <ul>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="gm-tick-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await onAdvanceTurn();
                  onClose();
                } catch (e) {
                  setSyncMsg(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Тик…" : "Применить тик"}
          </button>
        </div>
      </div>
    </div>
  );
}
