import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

type EngagementSide = {
  factionId: string;
  fleetIds?: string[];
  legionIds?: string[];
  stance?: string;
  locked?: boolean;
};

type EngagementPhase = "bombard" | "landing" | "ground" | "occupation";

type Engagement = {
  id: string;
  theater: string;
  systemId: string;
  planetId?: string | null;
  status: string;
  source?: string;
  phase?: EngagementPhase | string;
  roundsElapsed?: number;
  maxRounds?: number;
  mode?: string;
  sides: EngagementSide[];
  result?: {
    outcome?: string;
    powerA?: number;
    powerB?: number;
    phase?: string;
    lossesA?: { defId: string; lost: number; before: number; after: number }[];
    lossesB?: { defId: string; lost: number; before: number; after: number }[];
  } | null;
};

const STANCES = ["hold", "assault", "skirmish", "retreat", "bombard"];

const ASSAULT_PHASES: { id: EngagementPhase; label: string }[] = [
  { id: "bombard", label: "Обстрел" },
  { id: "landing", label: "Высадка" },
  { id: "ground", label: "Земля" },
  { id: "occupation", label: "Оккупация" },
];

function isOpen(e: Engagement) {
  return (
    e.status === "active" || e.status === "commit" || e.status === "contact"
  );
}

function lossLine(
  losses?: { defId: string; lost: number; before: number; after: number }[],
) {
  if (!losses?.length) return "—";
  return (
    losses
      .filter((l) => l.lost > 0)
      .map((l) => `${l.defId.replace(/^(ship|unit)\./, "")} −${l.lost}`)
      .join(", ") || "без потерь"
  );
}

function PhaseRibbon({ phase }: { phase?: string }) {
  const active = (phase || "bombard") as EngagementPhase;
  return (
    <ol className="combat-phase-ribbon" aria-label="Фазы штурма">
      {ASSAULT_PHASES.map((p, i) => {
        const idx = ASSAULT_PHASES.findIndex((x) => x.id === active);
        const state =
          p.id === active ? "active" : i < idx ? "done" : "pending";
        return (
          <li key={p.id} className={`combat-phase-step ${state}`}>
            <span className="combat-phase-idx">{i + 1}</span>
            <span className="combat-phase-label">{p.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CombatPanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [list, setList] = useState<Engagement[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/engagements", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setList(data.engagements || []);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  const setStance = async (engId: string, factionId: string, stance: string) => {
    try {
      const res = await fetch(`/api/engagements/${engId}/stance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ factionId, stance }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Поза ${stance} для ${factionId}`);
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const advancePhase = async (engId: string, fullResolve = false) => {
    try {
      const res = await fetch(`/api/engagements/${engId}/advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ fullResolve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(
        fullResolve
          ? `Engagement ${engId} форс-резолв`
          : `Фаза продвинута: ${data.engagement?.phase ?? "done"}`,
      );
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const open = list.filter(isOpen);
  const recent = list
    .filter((e) => e.status === "resolved")
    .slice(-8)
    .reverse();

  const nameOf = (id: string) =>
    world.factions.find((f) => f.id === id)?.name ?? id;
  const sysName = (id: string) =>
    world.systems.find((s) => s.id === id)?.name ?? id;

  return (
    <section>
      <h3>Бой · Engagement</h3>
      <p className="hint">
        Столкновения живут между тиками: стороны выбирают stance, затем резолв
        (или авто через maxRounds). Assault — 4 фазы.
      </p>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Обновить сражения
      </button>

      {open.length === 0 ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Нет открытых контактов (атака / war в системе создаёт на тике).
        </p>
      ) : (
        open.map((eng) => (
          <div key={eng.id} className="order-card combat-eng-card">
            <div>
              <strong>
                {eng.theater} · {sysName(eng.systemId)}
              </strong>
              <br />
              <span className="hint">
                {eng.status}
                {eng.mode && eng.mode !== "auto" ? ` · ${eng.mode}` : ""} ·
                раунд {eng.roundsElapsed ?? 0}/{eng.maxRounds ?? 3} · {eng.id}
              </span>
            </div>

            {eng.theater === "assault" && (
              <PhaseRibbon phase={eng.phase || "bombard"} />
            )}

            {(eng.sides ?? []).map((side) => (
              <label
                key={side.factionId}
                className="field"
                style={{ marginTop: 6 }}
              >
                <span>
                  {nameOf(side.factionId)}
                  {activeFactionId === side.factionId ? " (активная)" : ""}
                  {side.locked ? " · locked" : ""}
                </span>
                <select
                  value={side.stance || "hold"}
                  onChange={(e) =>
                    void setStance(eng.id, side.factionId, e.target.value)
                  }
                >
                  {STANCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <div className="combat-eng-actions">
              {eng.theater === "assault" && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void advancePhase(eng.id, false)}
                >
                  Следующая фаза
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void advancePhase(eng.id, true)}
              >
                Early resolve
              </button>
            </div>
          </div>
        ))
      )}

      {recent.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Последние resolve</h4>
          {recent.map((eng) => (
            <div key={eng.id} className="order-card" style={{ marginTop: 6 }}>
              <div>
                <strong>
                  {eng.theater} · {sysName(eng.systemId)} ·{" "}
                  {eng.result?.outcome ?? "?"}
                </strong>
                <br />
                <span className="hint">
                  {(eng.sides ?? []).map((s) => nameOf(s.factionId)).join(" vs ")}
                </span>
              </div>
              <ul className="hint" style={{ paddingLeft: 16, margin: "4px 0" }}>
                <li>
                  A: {lossLine(eng.result?.lossesA)} (pwr{" "}
                  {Math.round(eng.result?.powerA ?? 0)})
                </li>
                <li>
                  B: {lossLine(eng.result?.lossesB)} (pwr{" "}
                  {Math.round(eng.result?.powerB ?? 0)})
                </li>
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
