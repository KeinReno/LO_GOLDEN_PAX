import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { apPerTurn, fetchContent } from "../state/contentCatalog";

type IntentRow = {
  id: string;
  defId: string;
  factionId: string;
  turn: number;
  status: string;
  apCost?: number;
  payload?: { toSystemId?: string; fleetId?: string };
  note?: string;
  submittedAt?: string;
};

export function IntentsInbox() {
  const world = useWorldStore((s) => s.world);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [apCap, setApCap] = useState(3);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await fetchContent();
      setApCap(apPerTurn());
      const res = await fetch("/api/intents", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as IntentRow[];
      setIntents(Array.isArray(data) ? data : []);
      setSyncMsg(`Intents: ${data.filter((i) => i.status === "pending").length} pending`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  const pending = intents.filter((i) => i.status === "pending");
  const byFaction = new Map<string, IntentRow[]>();
  for (const i of pending) {
    const list = byFaction.get(i.factionId) ?? [];
    list.push(i);
    byFaction.set(i.factionId, list);
  }

  return (
    <section>
      <h3>Inbox intents · ход {world.meta.turn}</h3>
      <p className="hint">AP/ход (rules): {apCap}. Тик применяет pending автоматически.</p>
      <div className="btn-col">
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Обновить inbox
        </button>
      </div>
      {world.factions.map((f) => {
        const list = byFaction.get(f.id) ?? [];
        const used = list.reduce((s, i) => s + (i.apCost ?? 0), 0);
        return (
          <div key={f.id} className="order-card" style={{ marginTop: 8 }}>
            <div>
              <strong style={{ color: f.color }}>{f.name}</strong>
              <br />
              <span className="hint">
                AP reserved {used}/{apCap} · pending {list.length}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="hint">нет приказов</p>
            ) : (
              <ul className="hint" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                {list.map((i) => {
                  const toName =
                    world.systems.find((s) => s.id === i.payload?.toSystemId)
                      ?.name ?? i.payload?.toSystemId ?? "—";
                  return (
                    <li key={i.id}>
                      {i.defId.replace(/^intent\./, "")} → {toName} · {i.apCost ?? "?"} AP
                      {i.note ? ` · ${i.note}` : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {pending.length === 0 && (
        <p className="hint">Нет pending intents на этот ход.</p>
      )}
    </section>
  );
}
