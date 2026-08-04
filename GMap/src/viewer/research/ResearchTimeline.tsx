import { getCachedContent } from "../../state/contentCatalog";
import { ECO_CATEGORY_NAMES } from "../economyFlowTypes";

type RecentEntry = {
  currencyId: string;
  delta: number;
  turn: number | null;
  reason: string;
  intentId?: string | null;
};

export function ResearchTimeline({
  recent,
}: {
  recent: RecentEntry[] | undefined;
}) {
  const content = getCachedContent();
  const techs = content?.technologies || {};

  const events: { turn: number; label: string; kind: string }[] = [];
  const seen = new Set<string>();

  for (const e of recent || []) {
    if (
      e.reason !== "research" &&
      e.reason !== "research_upgrade" &&
      e.reason !== "research_rush"
    ) {
      continue;
    }
    if (e.turn == null) continue;
    let id = e.intentId || "";
    // legacy auto-queue entries used queue:factionId
    if (id.startsWith("queue:")) continue;
    const key = `${e.turn}:${e.reason}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let label = id;
    if (e.reason === "research" || e.reason === "research_rush") {
      const tech = techs[id];
      label = tech
        ? `${tech.name} (${ECO_CATEGORY_NAMES[tech.category] ?? tech.category} · эра ${tech.era})${e.reason === "research_rush" ? " · ускор." : ""}`
        : id || "технология";
    } else {
      // upgrade id may be intentId
      let found = id;
      for (const t of Object.values(techs)) {
        const u = (t.upgrades || []).find((x) => x.id === id);
        if (u) {
          found = `${u.name} ★`;
          break;
        }
      }
      label = found;
    }
    events.push({ turn: e.turn, label, kind: e.reason });
  }

  events.sort((a, b) => b.turn - a.turn);
  const slice = events.slice(0, 12);

  if (!slice.length) {
    return (
      <div className="research-timeline">
        <h4>История</h4>
        <p className="hint">Пока нет изученных технологий в журнале.</p>
      </div>
    );
  }

  return (
    <div className="research-timeline" aria-label="История исследований">
      <h4>История</h4>
      <ol>
        {slice.map((ev) => (
          <li key={`${ev.turn}-${ev.label}`}>
            <span className="tabular">Ход {ev.turn}</span>
            <span>
              {ev.kind === "research_upgrade" ? "★ " : ""}
              {ev.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
