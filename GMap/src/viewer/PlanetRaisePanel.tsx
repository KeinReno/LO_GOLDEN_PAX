import { useEffect, useMemo, useState } from "react";
import type { Planet, StarSystem } from "../state/types";
import { formatPlayerCost } from "../state/economyLabels";
import {
  listRaiseDefs,
  mobilizationCeiling,
  pickHomeForceId,
  postForceRaise,
  raiseCurrencyCost,
  raisePopulationCost,
  raisePropertyGate,
  type ForceRecruitSession,
  type RaiseDef,
} from "../state/forceRaiseClient";
import {
  systemHasBarracksForFaction,
  systemHasShipyardForFaction,
} from "../state/forceReadiness";
import { useWorldStore } from "../state/worldStore";
import type { TechEcoSlice } from "../state/techGate";

export function PlanetRaisePanel({
  system,
  planet,
  factionId,
  password,
  stocks,
  busy,
  techEco,
  onSession,
}: {
  system: StarSystem;
  planet: Planet;
  factionId: string;
  password: string;
  stocks: Record<string, number>;
  busy?: boolean;
  techEco?: TechEcoSlice;
  onSession: (data: ForceRecruitSession) => void;
}) {
  const fleets = useWorldStore((s) => s.world.fleets);
  const legions = useWorldStore((s) => s.world.legions);
  const barracks = systemHasBarracksForFaction(system, factionId);
  const shipyard = systemHasShipyardForFaction(system, factionId);
  const defs = useMemo(
    () => listRaiseDefs(factionId, { barracks, shipyard }),
    [factionId, barracks, shipyard],
  );
  const [defId, setDefId] = useState<string>(() => defs[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (defs.length === 0) return;
    if (!defs.some((d) => d.id === defId)) setDefId(defs[0].id);
  }, [defs, defId]);

  const selected: RaiseDef | undefined =
    defs.find((d) => d.id === defId) ?? defs[0];
  const pop = Number(planet.population) || 0;
  const ceiling = mobilizationCeiling(pop);
  const n = Math.max(1, Math.floor(count) || 1);
  const popCost = selected ? raisePopulationCost(selected.kind, selected, n) : n;
  const currency = selected ? raiseCurrencyCost(selected, n) : {};
  const shortStock = Object.entries(currency).find(
    ([id, amount]) => (Number(stocks[id]) || 0) < amount,
  );
  const propGate = selected ? raisePropertyGate(selected, techEco) : { ok: true };
  const locked = busy || pending || !password || !selected || !propGate.ok;

  const raise = async () => {
    if (!selected || locked) return;
    setPending(true);
    setError(null);
    setOkMsg(null);
    const forceId = pickHomeForceId({
      kind: selected.kind,
      defId: selected.id,
      factionId,
      systemId: system.id,
      planetId: planet.id,
      fleets,
      legions,
    });
    const result = await postForceRaise({
      factionId,
      password,
      systemId: system.id,
      planetId: planet.id,
      kind: selected.kind,
      defId: selected.id,
      count: n,
      ...(forceId ? { forceId } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSession(result.data);
    const popSpent = result.data.popCost ?? popCost;
    setOkMsg(
      `Набрано ${n} · ${selected.name} · −${popSpent} нас. · ${formatPlayerCost(result.data.cost ?? currency)}`,
    );
  };

  if (defs.length === 0) {
    return (
      <section className="planet-manage-block" aria-label="Набор войск">
        <h4>Набор</h4>
        <p className="hint">Нет доступных типов — проверьте каталог.</p>
      </section>
    );
  }

  return (
    <section className="planet-manage-block" aria-label="Набор войск">
      <h4>Набор</h4>
      <p className="hint">
        Потолок мобилизации {ceiling} из {pop} нас. Ополчение — без казарм.
        {barracks ? " Казармы открывают прочие войска." : ""}
        {shipyard ? " Верфь открывает корабли." : ""}
      </p>
      <div className="order-type-chips">
        {defs.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`order-type-chip ${selected?.id === d.id ? "on" : ""}`}
            disabled={pending || !raisePropertyGate(d, techEco).ok}
            onClick={() => {
              setDefId(d.id);
              setError(null);
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
      <label className="system-cmd-count">
        Кол-во
        <input
          type="number"
          min={1}
          max={Math.max(1, ceiling || 1)}
          value={n}
          disabled={pending}
          onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <p className="hint" style={{ fontFamily: "var(--font-mono)" }}>
        Стоимость: {popCost} нас. · {formatPlayerCost(currency)}
        {" · "}остаток потолка {Math.max(0, ceiling - popCost)}
      </p>
      {popCost > ceiling && (
        <p className="hint" role="status">
          Запрос выше потолка — сервер отклонит набор.
        </p>
      )}
      {shortStock && (
        <p className="hint" role="status">
          На складе не хватает {shortStock[0].replace(/^currency\./, "")} (
          {shortStock[1]}).
        </p>
      )}
      {!propGate.ok && propGate.error && (
        <p className="hint" role="status">
          {propGate.error}
        </p>
      )}
      <button
        type="button"
        className="btn"
        disabled={locked}
        onClick={() => void raise()}
      >
        {pending ? "Набор…" : "Набрать"}
      </button>
      {error && (
        <p className="hint planet-manage-msg" role="alert">
          {error}
        </p>
      )}
      {okMsg && !error && (
        <p className="hint planet-manage-msg" role="status">
          {okMsg}
        </p>
      )}
    </section>
  );
}
