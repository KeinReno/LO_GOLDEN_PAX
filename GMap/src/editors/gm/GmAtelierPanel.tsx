import { useState } from "react";
import { getCachedContent } from "../../state/contentCatalog";
import { GmBalancePanel } from "./GmBalancePanel";
import { GmYearlyQuestEditor } from "./atelier/GmYearlyQuestEditor";
import { GmStoryQuestEditor } from "./atelier/GmStoryQuestEditor";
import { GmRulesKnobEditor } from "./GmRulesKnobEditor";
import { GmCatalogEditor, type AtelierCatalogId } from "./GmCatalogEditor";

const CATALOGS: { id: AtelierCatalogId; label: string; hint: string }[] = [
  { id: "technologies", label: "Технологии", hint: "technologies.json" },
  { id: "tech_recipes", label: "Рецепты алхимии", hint: "tech_recipes.json" },
  { id: "tech_combos", label: "Combo-tech", hint: "tech_combos.json" },
  { id: "economy_balance", label: "Баланс экономики", hint: "economy_balance.json" },
  { id: "council_seats", label: "Места совета", hint: "council_seats.json" },
  { id: "court_tasks", label: "Поручения двора", hint: "court_tasks.json" },
  { id: "npc_traits", label: "Трейты NPC", hint: "npc_traits.json" },
  { id: "yearly_quests", label: "Ежходные квесты", hint: "yearly_quests.json · форма" },
  { id: "story_quests", label: "Сюжетные квесты", hint: "story_quests.json · выдача игрокам" },
  { id: "buildings", label: "Здания", hint: "buildings.json" },
  { id: "rules", label: "Правила", hint: "rules.json · alchemy/intel" },
];

function pickCatalog(content: ReturnType<typeof getCachedContent>, id: AtelierCatalogId): unknown {
  if (!content) return null;
  switch (id) {
    case "technologies":
      return content.technologies;
    case "tech_recipes":
      return content.tech_recipes;
    case "tech_combos":
      return content.tech_combos;
    case "economy_balance":
      return content.economy_balance;
    case "council_seats":
      return content.council_seats;
    case "court_tasks":
      return content.court_tasks;
    case "npc_traits":
      return content.npc_traits;
    case "yearly_quests":
      return content.yearly_quests;
    case "story_quests":
      return content.story_quests?.quests;
    case "buildings":
      return content.buildings;
    case "rules":
      return content.rules;
    default:
      return null;
  }
}

function countEntries(bag: unknown): number {
  if (!bag || typeof bag !== "object") return 0;
  if (Array.isArray(bag)) return bag.length;
  const o = bag as Record<string, unknown>;
  if (o.seats && typeof o.seats === "object")
    return (
      Object.keys(o.seats as object).length +
      (o.portfolios ? Object.keys(o.portfolios as object).length : 0)
    );
  if (o.tasks && typeof o.tasks === "object")
    return Object.keys(o.tasks as object).length;
  if (o.traits && typeof o.traits === "object")
    return Object.keys(o.traits as object).length;
  if (o.quests && typeof o.quests === "object")
    return Object.keys(o.quests as object).length;
  return Object.keys(o).filter((k) => k !== "meta").length;
}

/**
 * Atelier — content / balance editor for GM (form + JSON).
 */
export function GmAtelierPanel() {
  const content = getCachedContent();
  const [cat, setCat] = useState<AtelierCatalogId>("yearly_quests");

  const n = countEntries(pickCatalog(content, cat));

  return (
    <div className="gm-atelier">
      <header className="gm-atelier-head">
        <div>
          <p className="panel-kicker">GM · Atelier</p>
          <h3>Контент и баланс</h3>
        </div>
        <p className="hint">
          Редактирование через формы или JSON. Ежходные и сюжетные квесты — с
          конструктором выборов и последствий.
        </p>
      </header>

      <div className="gm-atelier-layout gm-atelier-layout--wide">
        <nav className="gm-atelier-nav" aria-label="Каталоги">
          {CATALOGS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`btn ghost gm-atelier-nav-btn ${cat === c.id ? "active" : ""}`}
              title={c.hint}
              onClick={() => setCat(c.id)}
            >
              <span>{c.label}</span>
              <span className="gm-atelier-count tabular">
                {content ? countEntries(pickCatalog(content, c.id)) : "—"}
              </span>
            </button>
          ))}
        </nav>

        <section className="gm-atelier-main">
          <h4>
            {CATALOGS.find((c) => c.id === cat)?.label} · {n}
          </h4>
          <p className="hint">{CATALOGS.find((c) => c.id === cat)?.hint}</p>

          {cat === "economy_balance" && <GmBalancePanel />}
          {cat === "rules" && <GmRulesKnobEditor />}
          {cat === "yearly_quests" && <GmYearlyQuestEditor />}
          {cat === "story_quests" && <GmStoryQuestEditor />}

          {cat !== "yearly_quests" &&
            cat !== "story_quests" && (
              <GmCatalogEditor
                key={cat}
                catalog={cat}
                showDocumentEditor={cat === "rules" || cat === "economy_balance"}
                defaultView="form"
              />
            )}
        </section>
      </div>
    </div>
  );
}
