import { useWorldStore } from "../state/worldStore";
import { FloatingPopover } from "../ui/FloatingPopover";
import { SPACE_OBJECT_TYPES, type LinkType, type SystemActivity, type SystemPoiType } from "../state/types";
import { SYSTEM_POI_LABELS } from "../state/defaults";

const ACTIVITIES: { id: SystemActivity; label: string; icon: string }[] = [
  { id: "none", label: "Спокойно", icon: "🌌" },
  { id: "battle", label: "Бой", icon: "⚔" },
  { id: "trade", label: "Торговля", icon: "💰" },
  { id: "garrison", label: "Гарнизон", icon: "🛡" },
  { id: "repair", label: "Ремонт", icon: "🔧" },
  { id: "transit", label: "Транзит", icon: "🚀" },
];

const LINK_TYPES: { id: LinkType; label: string; icon: string }[] = [
  { id: "corridor", label: "Коридор", icon: "━" },
  { id: "gate", label: "Врата", icon: "🌀" },
  { id: "unstable", label: "Нестабильный", icon: "⚡" },
];

export function AltQuickInspector() {
  const target = useWorldStore((s) => s.altInspector);
  const setAltInspector = useWorldStore((s) => s.setAltInspector);
  const world = useWorldStore((s) => s.world);
  const st = useWorldStore.getState();

  if (!target) return null;

  const system = target.systemId
    ? world.systems.find((s) => s.id === target.systemId)
    : null;
  const fleet = target.fleetId
    ? world.fleets.find((f) => f.id === target.fleetId)
    : null;
  const legion = target.legionId
    ? world.legions.find((l) => l.id === target.legionId)
    : null;
  const link = target.linkId
    ? world.links.find((l) => l.id === target.linkId)
    : null;

  const close = () => setAltInspector(null);

  return (
    <FloatingPopover
      open
      onClose={close}
      x={target.screenX}
      y={target.screenY}
      className="alt-quick-inspector"
      role="dialog"
    >
      <div className="alt-inspector-shell" onClick={(e) => e.stopPropagation()}>
        {system && (
          <>
            <div className="alt-inspector-head">
              <span className="alt-inspector-icon">{system.isCapital ? "👑" : "🪐"}</span>
              <div className="alt-inspector-title">
                <strong>{system.name}</strong>
                <span className="alt-inspector-sub">
                  {system.kind === "corridor" ? "Узел" : "Система"} · ID: {system.id}
                </span>
              </div>
              <button type="button" className="btn tiny ghost" onClick={close}>✕</button>
            </div>

            {/* Faction Ownership Quick Selector */}
            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Владелец системы</label>
              <div className="alt-chips-row">
                <button
                  type="button"
                  className={`alt-chip-btn ${!system.ownerFactionId ? "is-selected" : ""}`}
                  onClick={() => {
                    st.selectSystem(system.id);
                    st.updateSelectedSystem({ ownerFactionId: null });
                  }}
                  title="Нейтральная система"
                >
                  <span className="alt-chip-dot" style={{ background: "#777" }} />
                  <span>Нейтрал</span>
                </button>
                {world.factions.map((f) => {
                  const isOwner = system.ownerFactionId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`alt-chip-btn ${isOwner ? "is-selected" : ""}`}
                      onClick={() => {
                        st.selectSystem(system.id);
                        st.updateSelectedSystem({ ownerFactionId: f.id });
                      }}
                      title={f.name}
                    >
                      <span className="alt-chip-dot" style={{ background: f.color }} />
                      <span className="alt-chip-name">{f.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Toggles: Capital & Contested */}
            <div className="alt-inspector-section alt-grid-2">
              <button
                type="button"
                className={`btn tiny ${system.isCapital ? "primary" : "ghost"}`}
                onClick={() => {
                  st.selectSystem(system.id);
                  st.updateSelectedSystem({ isCapital: !system.isCapital });
                }}
              >
                👑 {system.isCapital ? "Столица ✓" : "Сделать столицей"}
              </button>
              <button
                type="button"
                className={`btn tiny ${system.contested ? "warn" : "ghost"}`}
                onClick={() => {
                  st.selectSystem(system.id);
                  st.toggleContestedMany([system.id]);
                }}
              >
                ⚔ {system.contested ? "Спорная ✓" : "Пометить спорной"}
              </button>
            </div>

            {/* Quick Activity Selector */}
            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Активность сектора</label>
              <div className="alt-btn-group">
                {ACTIVITIES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`btn tiny ${system.activity === a.id ? "primary" : "ghost"}`}
                    onClick={() => {
                      st.selectSystem(system.id);
                      st.updateSelectedSystem({
                        activity: a.id,
                        tradeWithSystemId: a.id === "trade" ? system.tradeWithSystemId : null,
                      });
                    }}
                  >
                    <span>{a.icon}</span> {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Space Object / POI Quick Selector */}
            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Космический объект (POI)</label>
              <div className="alt-poi-grid">
                {([...SPACE_OBJECT_TYPES, "none"] as SystemPoiType[]).map((poi) => {
                  const hasPoi =
                    poi !== "none"
                      ? (system.spaceObjects ?? []).includes(poi) || system.poiType === poi
                      : (!system.spaceObjects?.length || system.spaceObjects.includes("none")) &&
                        (!system.poiType || system.poiType === "none");
                  return (
                    <button
                      key={poi}
                      type="button"
                      className={`btn tiny ${hasPoi ? "accent" : "ghost"}`}
                      onClick={() => st.applySystemPoiMany([system.id], poi)}
                    >
                      {SYSTEM_POI_LABELS[poi] ?? poi}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="alt-inspector-footer">
              <button
                type="button"
                className="btn tiny ghost"
                onClick={() => {
                  st.selectSystem(system.id);
                  st.openSystemView(system.id);
                  close();
                }}
              >
                🔍 Открыть досье
              </button>
              <button
                type="button"
                className="btn tiny ghost"
                onClick={() => {
                  st.revealSystem(system.id);
                }}
              >
                👁 Разведка
              </button>
            </div>
          </>
        )}

        {fleet && (
          <>
            <div className="alt-inspector-head">
              <span className="alt-inspector-icon">🚀</span>
              <div className="alt-inspector-title">
                <strong>{fleet.name}</strong>
                <span className="alt-inspector-sub">Флот · Стойка: {fleet.stance || "idle"}</span>
              </div>
              <button type="button" className="btn tiny ghost" onClick={close}>✕</button>
            </div>

            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Фракция флота</label>
              <div className="alt-chips-row">
                {world.factions.map((f) => {
                  const isOwner = fleet.factionId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`alt-chip-btn ${isOwner ? "is-selected" : ""}`}
                      onClick={() => st.updateFleet(fleet.id, { factionId: f.id })}
                    >
                      <span className="alt-chip-dot" style={{ background: f.color }} />
                      <span className="alt-chip-name">{f.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Боевая стойка</label>
              <div className="alt-btn-group">
                {(["idle", "defend", "attack", "repair", "fortify", "blockade"] as const).map((stc) => (
                  <button
                    key={stc}
                    type="button"
                    className={`btn tiny ${fleet.stance === stc ? "primary" : "ghost"}`}
                    onClick={() => st.updateFleet(fleet.id, { stance: stc })}
                  >
                    {stc}
                  </button>
                ))}
              </div>
            </div>

            <div className="alt-inspector-footer">
              <button
                type="button"
                className="btn tiny danger"
                onClick={() => {
                  if (!confirm(`Удалить флот «${fleet.name}»?`)) return;
                  st.deleteFleet(fleet.id);
                  close();
                }}
              >
                🗑 Удалить флот
              </button>
            </div>
          </>
        )}

        {legion && (
          <>
            <div className="alt-inspector-head">
              <span className="alt-inspector-icon">🛡</span>
              <div className="alt-inspector-title">
                <strong>{legion.name}</strong>
                <span className="alt-inspector-sub">Легион · Статус: {legion.status || "idle"}</span>
              </div>
              <button type="button" className="btn tiny ghost" onClick={close}>✕</button>
            </div>

            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Фракция легиона</label>
              <div className="alt-chips-row">
                {world.factions.map((f) => {
                  const isOwner = legion.factionId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`alt-chip-btn ${isOwner ? "is-selected" : ""}`}
                      onClick={() => st.updateLegion(legion.id, { factionId: f.id })}
                    >
                      <span className="alt-chip-dot" style={{ background: f.color }} />
                      <span className="alt-chip-name">{f.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Статус легиона</label>
              <div className="alt-btn-group">
                {(["idle", "garrison", "assault", "fortify"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn tiny ${legion.status === s ? "primary" : "ghost"}`}
                    onClick={() => st.updateLegion(legion.id, { status: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="alt-inspector-footer">
              <button
                type="button"
                className="btn tiny danger"
                onClick={() => {
                  if (!confirm(`Удалить легион «${legion.name}»?`)) return;
                  st.deleteLegion(legion.id);
                  close();
                }}
              >
                🗑 Удалить легион
              </button>
            </div>
          </>
        )}

        {link && (
          <>
            <div className="alt-inspector-head">
              <span className="alt-inspector-icon">🔗</span>
              <div className="alt-inspector-title">
                <strong>Гиперсвязь</strong>
                <span className="alt-inspector-sub">Тип: {link.type}</span>
              </div>
              <button type="button" className="btn tiny ghost" onClick={close}>✕</button>
            </div>

            <div className="alt-inspector-section">
              <label className="alt-inspector-label">Тип связи</label>
              <div className="alt-btn-group">
                {LINK_TYPES.map((lt) => (
                  <button
                    key={lt.id}
                    type="button"
                    className={`btn tiny ${link.type === lt.id ? "primary" : "ghost"}`}
                    onClick={() => st.updateLink(link.id, { type: lt.id })}
                  >
                    <span>{lt.icon}</span> {lt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="alt-inspector-footer">
              <button
                type="button"
                className="btn tiny danger"
                onClick={() => {
                  const a =
                    world.systems.find((s) => s.id === link.fromId)?.name ?? "?";
                  const b =
                    world.systems.find((s) => s.id === link.toId)?.name ?? "?";
                  if (!confirm(`Удалить связь «${a} ↔ ${b}»?`)) return;
                  st.deleteLink(link.id);
                  close();
                }}
              >
                🗑 Удалить связь
              </button>
            </div>
          </>
        )}
      </div>
    </FloatingPopover>
  );
}
