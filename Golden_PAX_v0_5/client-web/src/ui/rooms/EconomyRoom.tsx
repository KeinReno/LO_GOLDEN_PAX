import { useMemo, useState } from "react";
import { EvervaultCard } from "../../components/ui/aceternity/EvervaultCard";
import { NumberTicker } from "../../components/ui/aceternity/NumberTicker";
import type { ViewPayload } from "../../state/viewTypes";
import { useWorldStore } from "../../state/worldStore";
import { ActionError, PlayerOnlyNotice, RoomFrame } from "./RoomFrame";

function mapStocks(stocks: Record<string, number>): string[] {
  return Object.keys(stocks).filter((k) => k.startsWith("map.")).sort();
}

export function EconomyRoom({ view }: { view: ViewPayload }) {
  const sessionMode = useWorldStore((s) => s.sessionMode);
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const setTax = useWorldStore((s) => s.setTax);
  const setPeg = useWorldStore((s) => s.setPeg);
  const catalog = useWorldStore((s) => s.catalog);

  const stocks = view.self.economy.stocks ?? {};
  const taxes = (view.self.economy.taxes ?? {}) as Record<string, string>;
  const peg = view.self.faction.pegResourceId ?? null;
  const mapKeys = useMemo(() => mapStocks(stocks), [stocks]);
  const taxSlots = useMemo(() => {
    const fromView = Object.keys(taxes);
    if (fromView.length > 0) return fromView;
    return catalog?.taxes ? Object.keys(catalog.taxes) : [];
  }, [taxes, catalog]);

  const [dragStock, setDragStock] = useState<string | null>(null);

  if (sessionMode !== "player") {
    return (
      <RoomFrame label="Economy" title="Treasury & fiscal policy">
        <PlayerOnlyNotice />
      </RoomFrame>
    );
  }

  return (
    <RoomFrame label="Economy" title="Treasury & fiscal policy" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Stocks</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(stocks)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, val]) => (
                <div
                  key={key}
                  draggable={key.startsWith("map.")}
                  onDragStart={() => setDragStock(key)}
                  onDragEnd={() => setDragStock(null)}
                  className={`rounded-lg border px-3 py-2 ${
                    key.startsWith("map.")
                      ? "cursor-grab border-cyan-500/20 bg-slate-950/60 active:cursor-grabbing"
                      : "border-slate-800 bg-slate-950/50"
                  } ${dragStock === key ? "ring-1 ring-cyan-400/50" : ""}`}
                >
                  <dt className="truncate text-xs text-slate-500">{key}</dt>
                  <dd className="gp-mono text-slate-100">
                    <NumberTicker value={Number(val) || 0} />
                  </dd>
                </div>
              ))}
          </dl>
        </section>

        <div className="space-y-4">
          <EvervaultCard text="Currency peg" className="border-amber-500/20">
            <p className="text-xs text-slate-400">
              Drag a <span className="text-cyan-300">map.*</span> stock here or click a resource below.
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragStock) void setPeg(dragStock);
              }}
              className="mt-3 rounded-lg border border-dashed border-amber-500/30 bg-slate-950/40 px-3 py-4 text-center"
            >
              <p className="text-xs text-slate-500">Treasury peg</p>
              <p className="mt-1 text-sm font-medium text-amber-100">{peg ?? "— unset —"}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {mapKeys.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={loading}
                  onClick={() => void setPeg(id)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-300 hover:border-cyan-500/40 disabled:opacity-40"
                >
                  {id.replace("map.", "")}
                </button>
              ))}
            </div>
          </EvervaultCard>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Tax tiers</h3>
            <div className="space-y-3">
              {taxSlots.map((slot) => {
                const taxDef = catalog?.taxes?.[slot];
                const tiers = taxDef?.tiers ?? [];
                return (
                <div key={slot} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs text-slate-400">
                    {taxDef?.name ?? slot}
                    {taxes[slot] ? (
                      <span className="ml-2 text-cyan-300/80">· current {taxes[slot]}</span>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tiers.length === 0 ? (
                      <p className="text-[0.65rem] text-slate-500">No catalog tiers for this slot.</p>
                    ) : (
                    tiers.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        disabled={loading}
                        onClick={() => void setTax(slot, tier.id)}
                        className={`rounded px-2 py-1 text-xs ${
                          taxes[slot] === tier.id
                            ? "border border-cyan-500/50 bg-cyan-950/40 text-cyan-100"
                            : "border border-slate-700 text-slate-300 hover:border-cyan-500/30"
                        } disabled:opacity-40`}
                      >
                        {tier.label ?? tier.id}
                      </button>
                    ))
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <ActionError message={error} />
    </RoomFrame>
  );
}
