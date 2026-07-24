import { useWorldStore } from "../state/worldStore";
import { DIPLOMACY_LABELS } from "../state/defaults";
import type { DiplomacyRelation } from "../state/types";

const RELATIONS: DiplomacyRelation[] = [
  "neutral",
  "alliance",
  "trade",
  "war",
  "vassal",
  "truce",
];

export function DiplomacyPanel() {
  const world = useWorldStore((s) => s.world);
  const open = useWorldStore((s) => s.diplomacyPanelOpen);
  const setOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const showDiplomacy = useWorldStore((s) => s.showDiplomacy);
  const toggleShowDiplomacy = useWorldStore((s) => s.toggleShowDiplomacy);
  const setDiplomacy = useWorldStore((s) => s.setDiplomacy);

  if (!open) return null;

  const factions = world.factions;

  const getRelation = (a: string, b: string): DiplomacyRelation => {
    const [x, y] = a < b ? [a, b] : [b, a];
    return (
      world.diplomacy.find((d) => d.aId === x && d.bId === y)?.relation ??
      "neutral"
    );
  };

  return (
    <div className="diplo-overlay">
      <div className="diplo-card">
        <div className="diplo-head">
          <h2>Дипломатия</h2>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Закрыть
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showDiplomacy}
            onChange={toggleShowDiplomacy}
          />
          Показывать линии на карте
        </label>
        <p className="hint">
          Союз — зелёный, торговля — жёлтый, война — красный, вассал — фиолетовый.
        </p>
        <div className="diplo-table-wrap">
          <table className="diplo-table">
            <thead>
              <tr>
                <th />
                {factions.map((f) => (
                  <th key={f.id}>
                    <span className="swatch" style={{ background: f.color }} />
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {factions.map((row) => (
                <tr key={row.id}>
                  <th>
                    <span className="swatch" style={{ background: row.color }} />
                    {row.name}
                  </th>
                  {factions.map((col) => {
                    if (row.id === col.id) {
                      return (
                        <td key={col.id} className="diplo-self">
                          —
                        </td>
                      );
                    }
                    const rel = getRelation(row.id, col.id);
                    return (
                      <td key={col.id}>
                        <select
                          value={rel}
                          onChange={(e) =>
                            setDiplomacy(
                              row.id,
                              col.id,
                              e.target.value as DiplomacyRelation,
                            )
                          }
                        >
                          {RELATIONS.map((r) => (
                            <option key={r} value={r}>
                              {DIPLOMACY_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
