import { useMemo, useState } from "react";
import type { ViewerPayload, WorldState } from "../state/types";
import { formatHopTurns, hopDistance } from "../state/pathfinding";

export const ORDER_TYPE_LABELS: Record<string, string> = {
  move_fleet: "Переместить флот",
  claim_system: "Захватить / экспансия",
  attack_system: "Атака",
  move_legion: "Переместить легион",
};

function systemName(world: WorldState, id: string | null | undefined): string {
  if (!id) return "—";
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

export function PlayerHqHome({
  payload,
  reservedAp,
  apMax,
  rpUnread,
  pendingOrders,
  orderMsg,
  onSetIndustryTax,
  onOpenForces,
  onOpenOrders,
  onOpenRp,
  onOpenMap,
}: {
  payload: ViewerPayload;
  reservedAp: number;
  apMax: number;
  rpUnread: number;
  pendingOrders: number;
  orderMsg?: string | null;
  onSetIndustryTax: (tierId: string) => void;
  onOpenForces: () => void;
  onOpenOrders: () => void;
  onOpenRp: () => void;
  onOpenMap: () => void;
}) {
  const eco = payload.economy;
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Штаб</h2>
        <p className="hint">
          Казна и сводка. Флоты и легионы двигайте перетаскиванием по карте;
          остальные действия — ПКМ на объекте.
        </p>
      </header>

      <div className="hq-stat-grid">
        <div className="hq-stat">
          <span className="hq-stat-label">Ход</span>
          <strong>{payload.world.meta.turn}</strong>
        </div>
        <div className="hq-stat">
          <span className="hq-stat-label">AP</span>
          <strong>
            {reservedAp}/{apMax}
          </strong>
        </div>
        <div className="hq-stat">
          <span className="hq-stat-label">Видно систем</span>
          <strong>{payload.visibleSystemIds.length}</strong>
        </div>
        <div className="hq-stat">
          <span className="hq-stat-label">Держава</span>
          <strong style={{ color: fac?.color }}>{fac?.name ?? "—"}</strong>
        </div>
      </div>

      <section className="hq-card">
        <h3>Казна</h3>
        {eco ? (
          <>
            <p>
              Металл: <strong>{eco.stocks?.["currency.metal"] ?? "—"}</strong>
              {" · "}
              Обеспечение:{" "}
              <strong>{eco.stocks?.["currency.supply"] ?? "—"}</strong>
            </p>
            <p className="hint">
              Дефицит: {eco.deficit ?? "нет"} · давление: {eco.pressure ?? 0}
            </p>
            <label className="field">
              <span>Промышленный налог (1 AP, со следующего хода)</span>
              <select
                value={eco.taxes?.["tax.industry"] ?? "none"}
                onChange={(e) => onSetIndustryTax(e.target.value)}
              >
                <option value="none">0%</option>
                <option value="low">10%</option>
                <option value="mid">20%</option>
                <option value="high">35%</option>
              </select>
            </label>
            {eco.pendingPolicy?.taxes?.["tax.industry"] && (
              <p className="hint">
                В очереди: налог → {eco.pendingPolicy.taxes["tax.industry"]}
              </p>
            )}
          </>
        ) : (
          <p className="hint">Нет данных казны — перелогиньтесь после тика.</p>
        )}
        {orderMsg && <p className="hint">{orderMsg}</p>}
      </section>

      <section className="hq-card hq-actions">
        <button type="button" className="btn block" onClick={onOpenForces}>
          Силы (флоты / легионы)
        </button>
        <button type="button" className="btn block" onClick={onOpenOrders}>
          Приказы{pendingOrders > 0 ? ` · ${pendingOrders} в очереди` : ""}
        </button>
        <button type="button" className="btn block" onClick={onOpenRp}>
          Сцена{rpUnread > 0 ? ` · ${rpUnread} новых` : ""}
        </button>
        <button type="button" className="btn primary block" onClick={onOpenMap}>
          Открыть карту
        </button>
      </section>
    </div>
  );
}

export function PlayerForcesPanel({
  payload,
  selectedFleetId,
  selectedLegionId,
  onSelectFleet,
  onSelectLegion,
  onSelectSystem,
  onOrderWithFleet,
  onOrderWithLegion,
  onOpenMap,
}: {
  payload: ViewerPayload;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectFleet?: (fleetId: string) => void;
  onSelectLegion?: (legionId: string) => void;
  onSelectSystem?: (systemId: string) => void;
  /** Jump to orders with this fleet already selected. */
  onOrderWithFleet?: (fleetId: string) => void;
  onOrderWithLegion?: (legionId: string) => void;
  onOpenMap?: () => void;
}) {
  const fid = payload.factionId;
  const fleets = (payload.world.fleets ?? []).filter((f) => f.factionId === fid);
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === fid,
  );

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Силы</h2>
        <p className="hint">
          Флоты: {fleets.length} · Легионы: {legions.length}. На карте —
          перетащите иконку на систему (покажет ходы).
        </p>
        {onOpenMap && (
          <button type="button" className="btn ghost" onClick={onOpenMap}>
            На карту
          </button>
        )}
      </header>

      <section className="hq-card">
        <h3>Флоты</h3>
        {fleets.length === 0 && (
          <div className="hq-empty">
            <p className="hint">Нет своих флотов в зоне видимости.</p>
            {onOpenMap && (
              <button type="button" className="btn ghost" onClick={onOpenMap}>
                На карту
              </button>
            )}
          </div>
        )}
        <ul className="hq-list">
          {fleets.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`hq-list-item ${selectedFleetId === f.id ? "on" : ""}`}
                onClick={() => {
                  onSelectFleet?.(f.id);
                  onSelectSystem?.(f.systemId);
                }}
              >
                <strong>{f.name}</strong>
                <span className="hint">
                  {systemName(payload.world, f.systemId)} · {f.stance}
                </span>
                <span className="hint">
                  {(f.composition ?? [])
                    .map((c) => `${c.type}×${c.count}`)
                    .join(", ") || "состав —"}
                </span>
              </button>
              {onOrderWithFleet && (
                <button
                  type="button"
                  className="btn ghost block"
                  style={{ marginTop: 4 }}
                  onClick={() => onOrderWithFleet(f.id)}
                >
                  Приказ для этого флота…
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="hq-card">
        <h3>Легионы</h3>
        {legions.length === 0 && (
          <div className="hq-empty">
            <p className="hint">Нет своих легионов в зоне видимости.</p>
            {onOpenMap && (
              <button type="button" className="btn ghost" onClick={onOpenMap}>
                На карту
              </button>
            )}
          </div>
        )}
        <ul className="hq-list">
          {legions.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`hq-list-item ${selectedLegionId === l.id ? "on" : ""}`}
                onClick={() => {
                  onSelectLegion?.(l.id);
                  onSelectSystem?.(l.systemId);
                }}
              >
                <strong>{l.name}</strong>
                <span className="hint">
                  {systemName(payload.world, l.systemId)} · {l.status}
                </span>
                <span className="hint">сила {l.strength ?? "—"}</span>
              </button>
              {onOrderWithLegion && (
                <button
                  type="button"
                  className="btn ghost block"
                  style={{ marginTop: 4 }}
                  onClick={() => onOrderWithLegion(l.id)}
                >
                  Приказ для этого легиона…
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Orders form + pending list — synced with map selection. */
export function PlayerOrdersPanel({
  payload,
  orderType,
  setOrderType,
  orderNote,
  setOrderNote,
  orderMsg,
  selectedFleetId,
  setSelectedFleetId,
  selectedFleetName,
  selectedLegionId,
  setSelectedLegionId,
  selectedLegionName,
  targetSystemId,
  setTargetSystemId,
  onSubmit,
  onCancelOrder,
  onPickTargetOnMap,
}: {
  payload: ViewerPayload;
  orderType: string;
  setOrderType: (t: string) => void;
  orderNote: string;
  setOrderNote: (n: string) => void;
  orderMsg: string | null;
  selectedFleetId: string | null;
  setSelectedFleetId: (id: string | null) => void;
  selectedFleetName: string | null;
  selectedLegionId: string | null;
  setSelectedLegionId: (id: string | null) => void;
  selectedLegionName: string | null;
  targetSystemId: string | null;
  setTargetSystemId: (id: string | null) => void;
  onSubmit: () => void;
  onCancelOrder: (orderId: string) => void;
  onPickTargetOnMap?: () => void;
}) {
  const [query, setQuery] = useState("");
  const systems = payload.world.systems;
  const fleets = (payload.world.fleets ?? []).filter(
    (f) => f.factionId === payload.factionId,
  );
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === payload.factionId,
  );
  const q = query.trim().toLowerCase();
  const matches = q
    ? systems
        .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
        .slice(0, 40)
    : [];

  const targetName =
    systems.find((s) => s.id === targetSystemId)?.name ?? null;

  const fromSystemId =
    orderType === "move_legion"
      ? (legions.find((l) => l.id === selectedLegionId)?.systemId ?? null)
      : (fleets.find((f) => f.id === selectedFleetId)?.systemId ?? null);

  const hops = useMemo(
    () => hopDistance(payload.world, fromSystemId, targetSystemId),
    [payload.world, fromSystemId, targetSystemId],
  );

  const needsFleet =
    orderType === "move_fleet" || orderType === "attack_system";
  const needsLegion = orderType === "move_legion";
  const canSubmit =
    !!targetSystemId &&
    (orderType === "claim_system"
      ? true
      : needsLegion
        ? !!selectedLegionId && Number.isFinite(hops) && hops > 0
        : !!selectedFleetId &&
          (orderType !== "move_fleet" ||
            (Number.isFinite(hops) && hops > 0)));

  const unitLabel =
    orderType === "move_legion"
      ? (selectedLegionName ?? "не выбран")
      : (selectedFleetName ?? "не выбран");

  const pending = payload.world.orders.filter((o) => o.status === "pending");

  const orderTypes: { id: string; label: string }[] = [
    { id: "move_fleet", label: "Флот" },
    { id: "move_legion", label: "Легион" },
    { id: "claim_system", label: "Захват" },
    { id: "attack_system", label: "Атака" },
  ];

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Приказы</h2>
        <p className="hint">
          Ход — перетаскиванием на карте. Ниже очередь и запасной черновик.
        </p>
      </header>

      <section className="hq-card hq-outliner">
        <h3>Очередь · {pending.length}</h3>
        {pending.length === 0 && (
          <p className="hint">Пусто — перетащите флот/легион на карте.</p>
        )}
        <ul className="hq-list">
          {pending.map((o) => {
            const fleetName =
              payload.world.fleets.find((f) => f.id === o.fleetId)?.name ??
              null;
            const legionName =
              payload.world.legions.find((l) => l.id === o.legionId)?.name ??
              null;
            return (
              <li key={o.id} className="hq-order-row">
                <span>
                  <strong>{ORDER_TYPE_LABELS[o.type] || o.type}</strong>
                  <br />
                  <span className="hint">
                    {fleetName || legionName
                      ? `${fleetName ?? legionName} · `
                      : ""}
                    {systemName(payload.world, o.toSystemId)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onCancelOrder(o.id)}
                >
                  Отменить
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="hq-card order-draft-card">
        <div className="order-draft-summary">
          <div>
            <span className="hq-stat-label">
              {orderType === "move_legion" ? "Легион" : "Флот"}
            </span>
            <strong>{unitLabel}</strong>
          </div>
          <div>
            <span className="hq-stat-label">Цель</span>
            <strong>{targetName ?? "—"}</strong>
          </div>
          <div>
            <span className="hq-stat-label">Путь</span>
            <strong>
              {targetSystemId && fromSystemId
                ? formatHopTurns(hops)
                : "—"}
            </strong>
          </div>
          <div>
            <span className="hq-stat-label">AP</span>
            <strong>1</strong>
          </div>
        </div>

        <div className="order-type-chips" role="group" aria-label="Тип приказа">
          {orderTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`order-type-chip ${orderType === t.id ? "on" : ""}`}
              onClick={() => setOrderType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {needsLegion ? (
          <label className="field">
            <span>Легион</span>
            <select
              value={selectedLegionId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedLegionId(id);
                if (id) setSelectedFleetId(null);
              }}
            >
              <option value="">— выберите легион —</option>
              {legions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {systemName(payload.world, l.systemId)}
                </option>
              ))}
            </select>
          </label>
        ) : orderType !== "claim_system" ? (
          <label className="field">
            <span>Флот</span>
            <select
              value={selectedFleetId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedFleetId(id);
                if (id) setSelectedLegionId(null);
              }}
            >
              <option value="">— выберите флот —</option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {systemName(payload.world, f.systemId)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="order-target-row">
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span>Цель</span>
            <input
              value={query || targetName || ""}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя системы…"
            />
          </label>
          {onPickTargetOnMap && (
            <button
              type="button"
              className="btn ghost"
              onClick={onPickTargetOnMap}
            >
              На карте
            </button>
          )}
        </div>
        {matches.length > 0 && (
          <ul className="hq-list hq-list-compact">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`hq-list-item ${targetSystemId === s.id ? "on" : ""}`}
                  onClick={() => {
                    setTargetSystemId(s.id);
                    setQuery(s.name);
                  }}
                >
                  <strong>{s.name}</strong>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="field">
          <span>Заметка</span>
          <input
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="по желанию"
          />
        </label>
        <button
          type="button"
          className="btn primary block"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          Заверить · 1 AP
          {needsFleet || needsLegion ? ` · ${formatHopTurns(hops)}` : ""}
        </button>
        {!canSubmit && (
          <p className="hint">
            {needsLegion
              ? "Нужны легион и достижимая система-цель."
              : orderType === "claim_system"
                ? "Нужна система-цель."
                : "Нужны флот и достижимая система-цель."}
          </p>
        )}
        {orderMsg && <p className="hint">{orderMsg}</p>}
      </section>
    </div>
  );
}
