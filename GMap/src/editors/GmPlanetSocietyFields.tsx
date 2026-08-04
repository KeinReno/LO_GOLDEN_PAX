import { useMemo } from "react";
import type { Planet } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import { listCultures, listFaiths } from "../state/societyRegistry";

type Props = {
  planet: Planet;
  onChange: (patch: Partial<Planet>) => void;
};

export function GmPlanetSocietyFields({ planet, onChange }: Props) {
  const cultures = listCultures();
  const faiths = listFaiths();
  const hybridLineages = useMemo(() => {
    const races = getCachedContent()?.races ?? {};
    return Object.values(races).filter(
      (r) => r.kind === "hybrid" || String(r.id).startsWith("race_hybrid."),
    );
  }, []);

  const faithId =
    planet.faithShare?.find((r) => (r.percent ?? 0) > 0)?.faithId ??
    "faith.secular";

  return (
    <>
      <div className="block-title">Общество (GM)</div>
      <div className="planet-detail-2col">
        <label className="field">
          <span>Культура</span>
          <select
            value={planet.cultureId ?? "culture.baseline"}
            onChange={(e) =>
              onChange({
                cultureId:
                  e.target.value === "culture.baseline"
                    ? undefined
                    : e.target.value,
              })
            }
          >
            {cultures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Доминирующая вера</span>
          <select
            value={faithId}
            onChange={(e) => {
              const id = e.target.value;
              onChange({
                faithShare:
                  id === "faith.secular"
                    ? undefined
                    : [{ faithId: id, percent: 100 }],
              });
            }}
          >
            {faiths.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Гибридный линейдж (опционально)</span>
        <select
          value={planet.lineageId ?? ""}
          onChange={(e) =>
            onChange({
              lineageId: e.target.value || undefined,
            })
          }
        >
          <option value="">— нет —</option>
          {hybridLineages.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name ?? r.id}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Культура и вера влияют на модификаторы тика; линейдж — для сюжета и
        гибрид-тех. Игрок может основать линейдж на смешанной планете.
      </p>
    </>
  );
}
