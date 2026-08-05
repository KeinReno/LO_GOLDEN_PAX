import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { resolveEditorViewWorld } from "../state/fog";
import { useWorldStore } from "../state/worldStore";

type Hit =
  | { kind: "system"; systemId: string; label: string; sub: string }
  | {
      kind: "planet";
      systemId: string;
      planetId: string;
      label: string;
      sub: string;
    };

export function MapSearch() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const gmOmniscientView = useWorldStore((s) => s.gmOmniscientView);
  const fogMaskPreview = useWorldStore((s) => s.fogMaskPreview);
  const selectSystem = useWorldStore((s) => s.selectSystem);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openPlanetView = useWorldStore((s) => s.openPlanetView);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const viewSystems = useMemo(
    () =>
      resolveEditorViewWorld(world, {
        activeFactionId,
        gmOmniscientView,
        fogMask: fogMaskPreview,
      }).systems,
    [world, activeFactionId, gmOmniscientView, fogMaskPreview],
  );

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 1) return [] as Hit[];
    const out: Hit[] = [];
    for (const s of viewSystems) {
      if (s.name.toLowerCase().includes(needle)) {
        out.push({
          kind: "system",
          systemId: s.id,
          label: s.name,
          sub: "система",
        });
      }
      for (const p of s.planets ?? []) {
        if (p.name.toLowerCase().includes(needle)) {
          out.push({
            kind: "planet",
            systemId: s.id,
            planetId: p.id,
            label: p.name,
            sub: `планета · ${s.name}`,
          });
        }
      }
      if (out.length >= 24) break;
    }
    return out.slice(0, 24);
  }, [q, viewSystems]);

  const go = (hit: Hit) => {
    selectSystem(hit.systemId);
    focusCameraOnSystem(hit.systemId);
    if (hit.kind === "planet") {
      openPlanetView(hit.systemId, hit.planetId);
    }
    setQ("");
    setOpen(false);
  };

  return (
    <div className={`map-search ${open || q ? "open" : ""}`}>
      <label className="map-search-field">
        <Search size={14} strokeWidth={2.25} aria-hidden />
        <input
          type="search"
          placeholder="Поиск системы / планеты…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click on hit registers
            window.setTimeout(() => setOpen(false), 160);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQ("");
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault();
              go(hits[0]);
            }
          }}
        />
      </label>
      {open && q.trim() && (
        <ul className="map-search-results" role="listbox">
          {hits.length === 0 && (
            <li className="map-search-empty">Ничего не найдено</li>
          )}
          {hits.map((h) => (
            <li key={`${h.kind}:${h.systemId}:${"planetId" in h ? h.planetId : ""}`}>
              <button
                type="button"
                className="map-search-hit"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
              >
                <strong>{h.label}</strong>
                <span className="hint">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
