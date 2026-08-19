import type { Faction, ViewerPayload } from "../state/types";

/** Soft power compare for GC-style diplomacy dossier (bento cells). */
export function DiploCompareStrip({
  payload,
  me,
  other,
}: {
  payload: ViewerPayload;
  me: Faction;
  other: Faction;
}) {
  const count = (factionId: string) => {
    const systems = (payload.world.systems ?? []).filter(
      (s) => s.ownerFactionId === factionId,
    ).length;
    const fleets = (payload.world.fleets ?? []).filter(
      (f) => f.factionId === factionId,
    ).length;
    const legions = (payload.world.legions ?? []).filter(
      (l) => l.factionId === factionId,
    ).length;
    let pop = 0;
    for (const s of payload.world.systems ?? []) {
      if (s.ownerFactionId !== factionId) continue;
      for (const p of s.planets ?? []) pop += p.population ?? 0;
    }
    return { systems, fleets, legions, pop: Math.round(pop) };
  };

  const intelLevel = Number(payload.intel?.knownFactions?.[other.id] ?? 1);

  const a = count(me.id);
  const b = count(other.id);

  const cells: { label: string; left: number; right: number }[] = [
    { label: "Системы", left: a.systems, right: b.systems },
    { label: "Флоты", left: a.fleets, right: b.fleets },
    { label: "Легионы", left: a.legions, right: b.legions },
    { label: "Население", left: a.pop, right: b.pop },
  ];

  return (
    <div className="gc-compare" aria-label={`Сравнение сил по разведке ${intelLevel}/4`}>
      <p className="hint gc-compare__intel">
        По разведке {intelLevel}/4 · только видимые системы и силы
      </p>
      {cells.map((c) => {
        const total = c.left + c.right || 1;
        const pctL = Math.round((c.left / total) * 100);
        const lead =
          c.left === c.right ? "tie" : c.left > c.right ? "you" : "them";
        return (
          <div key={c.label} className={`gc-compare__cell gc-compare__cell--${lead}`}>
            <div className="gc-compare__nums">
              <span className="gc-compare__you">{c.left}</span>
              <span className="gc-compare__label">{c.label}</span>
              <span className="gc-compare__them">{c.right}</span>
            </div>
            <div className="gc-compare__bar" aria-hidden>
              <span style={{ width: `${pctL}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
