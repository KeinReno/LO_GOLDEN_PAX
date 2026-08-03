import { useEffect, useMemo, useState } from "react";
import type { ViewerPayload } from "../state/types";
import type { TechnologyDef, EconomyCategory } from "../state/contentCatalog";
import { getCachedContent } from "../state/contentCatalog";
import { canBuildWithTech } from "../state/techGate";
import { StatefulButton } from "../ui/StatefulButton";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";
import { ResearchRadialTree } from "./ResearchRadialTree";

const CAT_ORDER: EconomyCategory[] = ["A", "B", "C", "D", "E", "F"];
const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};
const CAT_NAME = ECO_CATEGORY_NAMES;

export const RESEARCH_BRANCH_BY_DIGIT: Record<string, EconomyCategory> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
  "5": "E",
  "6": "F",
};

function cognitioCost(tech: TechnologyDef): number {
  return Number(tech.cost?.["currency.cognitio"] ?? 0);
}

function prereqNames(
  tech: TechnologyDef,
  byId: Map<string, TechnologyDef>,
): string {
  const ids = tech.prerequisites || [];
  if (!ids.length) return "—";
  return ids.map((id) => byId.get(id)?.name ?? id).join(", ");
}

function formatEffects(tech: TechnologyDef): string {
  const parts: string[] = [];
  for (const e of tech.effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = String(e.args.category ?? "");
      const to = e.args.to;
      const label = CAT_NAME[cat] ?? cat;
      parts.push(`${label} → T${to}`);
    } else if (e.effect === "unlock_property") {
      parts.push(`свойство «${e.args.property}»`);
    }
  }
  return parts.join(" · ") || "—";
}

function buildingsUnlockedByTech(
  tech: TechnologyDef,
  tiers: Record<string, number>,
  unlockedProperties: string[],
): string[] {
  const buildings = Object.values(getCachedContent()?.buildings || {});
  if (!buildings.length) return [];

  const nextTiers = { ...tiers };
  const nextProps = [...unlockedProperties];
  for (const e of tech.effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = String(e.args.category ?? "");
      const to = Number(e.args.to);
      if (cat) nextTiers[cat] = Math.max(Number(nextTiers[cat] ?? 1), to);
    } else if (e.effect === "unlock_property" && e.args.property) {
      const p = String(e.args.property);
      if (!nextProps.includes(p)) nextProps.push(p);
    }
  }

  const before = { techTiers: tiers, unlockedProperties };
  const after = { techTiers: nextTiers, unlockedProperties: nextProps };
  const names: string[] = [];
  for (const b of buildings) {
    if (canBuildWithTech(before, b).ok) continue;
    if (canBuildWithTech(after, b).ok) names.push(b.name);
  }
  return names;
}

type NextBuy = { tech: TechnologyDef; cost: number };

/**
 * Research room: radial tech wheel (6 spokes) + detail rail.
 */
export function ResearchPanel({
  eco,
  onResearch,
  busy,
  msg,
  asRoom,
  branch: branchProp,
  onBranchChange,
}: {
  eco: ViewerPayload["economy"];
  onResearch: (techId: string) => void;
  busy?: boolean;
  msg?: string | null;
  asRoom?: boolean;
  branch?: EconomyCategory | null;
  onBranchChange?: (c: EconomyCategory | null) => void;
}) {
  const [branchLocal, setBranchLocal] = useState<EconomyCategory | null>(null);
  const focusBranch =
    branchProp !== undefined ? branchProp : branchLocal;
  const setFocusBranch = (c: EconomyCategory | null) => {
    setBranchLocal(c);
    onBranchChange?.(c);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const { byCat, byId } = useMemo(() => {
    const dict = getCachedContent()?.technologies || {};
    const list = Object.values(dict);
    const idMap = new Map(list.map((t) => [t.id, t]));
    const map = new Map<EconomyCategory, TechnologyDef[]>();
    for (const c of CAT_ORDER) map.set(c, []);
    for (const t of list) {
      const cat = (CAT_ORDER.includes(t.category as EconomyCategory)
        ? t.category
        : "A") as EconomyCategory;
      map.get(cat)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) => a.era - b.era || a.name.localeCompare(b.name, "ru"),
      );
    }
    return { byCat: map, byId: idMap };
  }, []);

  const unlocked = useMemo(
    () => new Set(eco?.unlockedTechs || []),
    [eco?.unlockedTechs],
  );
  const cognitio = eco?.stocks?.["currency.cognitio"] ?? 0;
  const tiers = eco?.techTiers || {};
  const unlockedProps = eco?.unlockedProperties || [];

  useEffect(() => {
    if (busy) return;
    if (!pendingId) return;
    if (msg?.startsWith("Исследовано")) {
      setSuccessId(pendingId);
    }
    setPendingId(null);
  }, [busy, pendingId, msg]);

  // Auto-select first affordable / next in focus branch
  useEffect(() => {
    if (selectedId && byId.has(selectedId)) return;
    const pool = focusBranch
      ? byCat.get(focusBranch) ?? []
      : CAT_ORDER.flatMap((c) => byCat.get(c) ?? []);
    const next =
      pool.find(
        (t) =>
          !unlocked.has(t.id) &&
          (t.prerequisites || []).every((p) => unlocked.has(p)),
      ) ?? pool[0];
    if (next) setSelectedId(next.id);
  }, [selectedId, byId, byCat, unlocked, focusBranch]);

  const affordable = useMemo(() => {
    const list: NextBuy[] = [];
    for (const t of Object.values(getCachedContent()?.technologies || {})) {
      if (unlocked.has(t.id)) continue;
      if (!(t.prerequisites || []).every((p) => unlocked.has(p))) continue;
      const cost = cognitioCost(t);
      if (cognitio >= cost) list.push({ tech: t, cost });
    }
    list.sort(
      (a, b) =>
        a.cost - b.cost ||
        a.tech.era - b.tech.era ||
        a.tech.name.localeCompare(b.tech.name, "ru"),
    );
    return list;
  }, [unlocked, cognitio]);

  const nextBuy = affordable[0] ?? null;
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const selectedState = useMemo(() => {
    if (!selected) return null;
    const done = unlocked.has(selected.id);
    const prereqOk = (selected.prerequisites || []).every((p) =>
      unlocked.has(p),
    );
    const cost = cognitioCost(selected);
    const canBuy = !done && prereqOk && cognitio >= cost && !busy;
    let status = "доступно";
    if (done) status = "исследовано";
    else if (!prereqOk) status = "закрыто";
    else if (cognitio < cost) status = "мало Знания";
    const buildings = buildingsUnlockedByTech(
      selected,
      tiers,
      unlockedProps,
    );
    return { done, prereqOk, cost, canBuy, status, buildings };
  }, [selected, unlocked, cognitio, busy, tiers, unlockedProps]);

  const requestResearch = (techId: string) => {
    setPendingId(techId);
    setSuccessId(null);
    onResearch(techId);
  };

  const jumpToNextBuy = () => {
    if (!nextBuy) return;
    const cat = nextBuy.tech.category as EconomyCategory;
    if (CAT_ORDER.includes(cat)) setFocusBranch(cat);
    setSelectedId(nextBuy.tech.id);
  };

  const body = (
    <>
      <header className={asRoom === false ? undefined : "hq-panel-head"}>
        {asRoom !== false && <h2>Наука</h2>}
        {asRoom === false && <h3>Исследования</h3>}
        <div className="research-stock-row">
          <p className="hint research-stock">
            Знание: <strong className="tabular">{cognitio}</strong>
            {affordable.length > 0 ? (
              <span className="research-stock-hot">
                {" "}
                · доступно: {affordable.length}
              </span>
            ) : null}
          </p>
          <ul className="research-tier-pills" aria-label="Тиры категорий">
            {CAT_ORDER.map((c) => (
              <li
                key={c}
                style={{ color: CAT_COLOR[c], borderColor: CAT_COLOR[c] }}
                title={`${CAT_NAME[c]} · T${tiers[c] ?? 1}`}
              >
                <span>{c}</span>
                <strong className="tabular">{tiers[c] ?? 1}</strong>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {nextBuy && (
        <button
          type="button"
          className="research-next-buy"
          onClick={jumpToNextBuy}
        >
          <span className="hint">Лучший шаг</span>
          <strong style={{ color: CAT_COLOR[nextBuy.tech.category] }}>
            {nextBuy.tech.name}
          </strong>
          <span className="hint">
            {CAT_NAME[nextBuy.tech.category] ?? nextBuy.tech.category} ·{" "}
            <span className="tabular">
              {nextBuy.cost}/{cognitio}
            </span>
          </span>
        </button>
      )}

      <div
        className="research-branch-tabs anim-tabs"
        role="tablist"
        aria-label="Ветви науки"
      >
        <button
          type="button"
          role="tab"
          aria-selected={focusBranch == null}
          className={`research-branch-tab research-branch-tab--all ${focusBranch == null ? "on" : ""}`}
          onClick={() => setFocusBranch(null)}
          title="Все ветви"
        >
          <strong>Все</strong>
          <span className="hint">колесо</span>
        </button>
        {CAT_ORDER.map((c, i) => {
          const techs = byCat.get(c) ?? [];
          const done = techs.filter((t) => unlocked.has(t.id)).length;
          const branchAffordable = techs.some(
            (t) =>
              !unlocked.has(t.id) &&
              (t.prerequisites || []).every((p) => unlocked.has(p)) &&
              cognitio >= cognitioCost(t),
          );
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={focusBranch === c}
              className={`research-branch-tab ${focusBranch === c ? "on" : ""} ${branchAffordable ? "is-hot" : ""}`}
              style={{ borderColor: CAT_COLOR[c] }}
              onClick={() => {
                setFocusBranch(c);
                const next = techs.find(
                  (t) =>
                    !unlocked.has(t.id) &&
                    (t.prerequisites || []).every((p) => unlocked.has(p)),
                );
                if (next) setSelectedId(next.id);
              }}
              title={`${CAT_NAME[c]} · ${i + 1}`}
            >
              <span className="research-tab-hotkey">{i + 1}</span>
              <span style={{ color: CAT_COLOR[c] }}>{c}</span>
              <strong>{CAT_NAME[c]}</strong>
              <span className="hint">
                T{tiers[c] ?? 1}
                {done === techs.length && techs.length ? " · ✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="research-workbench">
        <ResearchRadialTree
          byCat={byCat}
          unlocked={unlocked}
          cognitio={cognitio}
          selectedId={selectedId}
          focusBranch={focusBranch}
          busy={busy}
          onSelect={setSelectedId}
        />

        <aside className="research-detail" aria-live="polite">
          {!selected || !selectedState ? (
            <p className="hint">Выберите технологию на колесе.</p>
          ) : (
            <>
              <header className="research-detail-head">
                <span
                  className="research-cat"
                  style={{ color: CAT_COLOR[selected.category] }}
                >
                  {selected.category} · {CAT_NAME[selected.category]} · эра{" "}
                  {selected.era}
                </span>
                <h3>{selected.name}</h3>
                <span className="research-focus-status">
                  {selectedState.status}
                </span>
              </header>

              <p className="research-detail-effect">
                {formatEffects(selected)}
              </p>

              <dl className="research-detail-meta">
                <div>
                  <dt>Стоимость</dt>
                  <dd
                    className={`tabular ${!selectedState.done && cognitio < selectedState.cost ? "is-short" : ""}`}
                  >
                    {selectedState.cost}
                    {!selectedState.done ? ` / ${cognitio}` : ""} Знание
                  </dd>
                </div>
                <div>
                  <dt>Требования</dt>
                  <dd>
                    {selectedState.prereqOk || selectedState.done
                      ? "выполнены"
                      : prereqNames(selected, byId)}
                  </dd>
                </div>
              </dl>

              {selectedState.buildings.length > 0 ? (
                <p className="hint research-impact">
                  Откроет: {selectedState.buildings.join(", ")}
                </p>
              ) : (
                <p className="hint">
                  Прямых зданий нет — повышает тир ветки / свойства.
                </p>
              )}

              <div className="research-detail-cta">
                <StatefulButton
                  className={`btn ${selectedState.canBuy ? "primary" : ""}`}
                  disabled={!selectedState.canBuy}
                  busy={busy && pendingId === selected.id}
                  success={successId === selected.id}
                  successLabel="Исследовано"
                  onClick={() => {
                    if (!selectedState.canBuy) return;
                    requestResearch(selected.id);
                  }}
                >
                  {selectedState.done ? "Исследовано" : "Исследовать"}
                </StatefulButton>
              </div>
            </>
          )}
          {msg && (
            <p
              className={`hint research-msg ${msg.startsWith("Исследовано") ? "is-ok" : "is-err"}`}
              role="status"
            >
              {msg}
            </p>
          )}
        </aside>
      </div>
    </>
  );

  if (asRoom === false) {
    return <section className="hq-card research-panel">{body}</section>;
  }

  return (
    <div className="hq-panel research-panel research-panel--room research-panel--radial">
      {body}
    </div>
  );
}

/** Count techs the player can buy right now (for dock badge). */
export function countAffordableResearch(
  eco: ViewerPayload["economy"],
): number {
  if (!eco) return 0;
  const unlocked = new Set(eco.unlockedTechs || []);
  const cognitio = eco.stocks?.["currency.cognitio"] ?? 0;
  let n = 0;
  for (const t of Object.values(getCachedContent()?.technologies || {})) {
    if (unlocked.has(t.id)) continue;
    if (!(t.prerequisites || []).every((p) => unlocked.has(p))) continue;
    if (cognitio >= cognitioCost(t)) n += 1;
  }
  return n;
}
