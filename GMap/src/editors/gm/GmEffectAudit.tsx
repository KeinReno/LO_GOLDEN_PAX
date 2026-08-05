import { useMemo } from "react";
import { useWorldStore } from "../../state/worldStore";
import { getCachedContent } from "../../state/contentCatalog";
import {
  auditFactionEffects,
  effectSourceKindLabel,
} from "./effectAudit";

/**
 * GM: who gives what modifiers to the active faction.
 */
export function GmEffectAudit({ compact = false }: { compact?: boolean }) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const content = getCachedContent();

  const faction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;

  const rows = useMemo(
    () => auditFactionEffects(faction, content),
    [faction, content, world.meta.tableRevision],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.sourceKind;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  if (!faction) {
    return <p className="hint">Выберите державу.</p>;
  }

  return (
    <div className={`gm-effect-audit${compact ? " gm-effect-audit--compact" : ""}`}>
      {!compact && (
        <>
          <h4 className="gm-effect-audit__title">Аудит эффектов</h4>
          <p className="hint">
            Пассивы <strong>{faction.name}</strong> — стол, NPC, activeEffects.
          </p>
        </>
      )}

      {!rows.length && (
        <p className="hint gmsys-empty">Нет записанных модификаторов.</p>
      )}

      {grouped.map(([kind, list]) => (
        <div key={kind} className="gm-effect-audit__group">
          <p className="gm-effect-audit__group-title">
            {effectSourceKindLabel(kind)}{" "}
            <span className="tabular">({list.length})</span>
          </p>
          <ul className="gm-effect-audit__list">
            {list.map((r) => (
              <li key={r.id} className="gm-effect-audit__row">
                <span className="gm-effect-audit__source">{r.sourceLabel}</span>
                <span className="gm-effect-audit__summary">{r.summary}</span>
                {r.scope !== "faction" && (
                  <span className="gm-effect-audit__scope hint">
                    {r.scope}
                    {r.targetId ? ` · ${r.targetId}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
