/**
 * Tech alchemy laboratory: combine unlocked techs via recipes.
 * See GMap/docs/TECH_ALCHEMY_SPEC.md
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
  ensureAllFactions,
} from "./ledger.mjs";
import { readLiveBoard } from "./tableStore.mjs";
import { applyUnlockEffects, resolveTechDef } from "./techActions.mjs";
import { applyUnitUpgradeEffectsToWorld } from "./combatResolve.mjs";

const RING = ["A", "B", "C", "D", "E", "F"];
const ADJACENT = new Set();
for (let i = 0; i < RING.length; i++) {
  const a = RING[i];
  const b = RING[(i + 1) % RING.length];
  ADJACENT.add(`${a}|${a}`);
  ADJACENT.add(`${a}|${b}`);
  ADJACENT.add(`${b}|${a}`);
}

function alchemyRules(content = getContent()) {
  const a = content?.rules?.alchemy || {};
  const bal = content?.economy_balance?.alchemy || {};
  return {
    attemptsPerTurn: Number(a.attemptsPerTurn ?? bal.attemptsPerTurn ?? 2),
    baseCost: Number(a.baseCost ?? bal.baseCost ?? 6),
    eraGapCost: Number(a.eraGapCost ?? bal.eraGapCost ?? 3),
    blindHit: Number(a.blindHit ?? 0.25),
    duplicateRefund: Number(a.duplicateRefund ?? 0.5),
  };
}

export function ensureAlchemyState(eco) {
  if (!eco.alchemy || typeof eco.alchemy !== "object") {
    eco.alchemy = {
      attemptsUsedThisTurn: 0,
      discoveredRecipes: [],
      lastExperimentTurn: null,
      journal: [],
    };
  }
  if (!Array.isArray(eco.alchemy.discoveredRecipes)) {
    eco.alchemy.discoveredRecipes = [];
  }
  if (!Number.isFinite(eco.alchemy.attemptsUsedThisTurn)) {
    eco.alchemy.attemptsUsedThisTurn = 0;
  }
  if (!Array.isArray(eco.alchemy.journal)) eco.alchemy.journal = [];
  return eco.alchemy;
}

/** Reset per-turn attempt counters for all factions (call on tick). */
export function resetAlchemyAttemptsForAll(world) {
  const ledger = ensureAllFactions(readLedger(), world || readLiveBoard());
  for (const fac of world?.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    const al = ensureAlchemyState(eco);
    al.attemptsUsedThisTurn = 0;
  }
  writeLedger(ledger);
}

export function categoriesAdjacent(catA, catB) {
  if (!catA || !catB) return false;
  return ADJACENT.has(`${catA}|${catB}`);
}

export function sortPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function findRecipeForPair(techA, techB, content = getContent()) {
  const [a, b] = sortPair(techA, techB);
  const recipes = content.tech_recipes || {};
  for (const def of Object.values(recipes)) {
    const ings = def.ingredients || [];
    if (ings.length !== 2) continue;
    const [x, y] = sortPair(ings[0], ings[1]);
    if (x === a && y === b) return def;
  }
  return null;
}

function experimentCost(defA, defB, rules) {
  const eraA = Number(defA?.era || 1);
  const eraB = Number(defB?.era || 1);
  const gap = Math.abs(eraA - eraB);
  return Math.max(1, rules.baseCost + gap * rules.eraGapCost);
}

function appendJournal(al, entry) {
  al.journal.push({
    at: new Date().toISOString(),
    ...entry,
  });
  if (al.journal.length > 40) al.journal = al.journal.slice(-40);
}

/**
 * Preview without mutating.
 */
export function previewAlchemyExperiment(factionId, techA, techB, opts = {}) {
  const content = opts.content || getContent();
  const rules = alchemyRules(content);
  const ledger = opts.ledger || readLedger();
  const eco = opts.eco || ensureFactionEco(ledger, factionId);
  const al = ensureAlchemyState(eco);
  const unlocked = new Set(eco.unlockedTechs || []);

  if (!techA || !techB || techA === techB) {
    return { ok: false, error: "Нужны две разные технологии" };
  }
  if (!unlocked.has(techA) || !unlocked.has(techB)) {
    return { ok: false, error: "Обе технологии должны быть изучены" };
  }

  const defA = resolveTechDef(content, techA);
  const defB = resolveTechDef(content, techB);
  if (!defA || !defB) {
    return { ok: false, error: "Неизвестная технология-ингредиент" };
  }
  if (!categoriesAdjacent(defA.category, defB.category)) {
    return {
      ok: false,
      error: `Категории ${defA.category}+${defB.category} не смежные`,
    };
  }

  const recipe = findRecipeForPair(techA, techB, content);
  const discovered = recipe
    ? (al.discoveredRecipes || []).includes(recipe.id)
    : false;
  const cost = experimentCost(defA, defB, rules);
  const attemptsLeft = Math.max(0, rules.attemptsPerTurn - al.attemptsUsedThisTurn);
  const cognitio = Number(eco.stocks?.["currency.cognitio"] ?? 0);

  let mode = opts.mode || "auto";
  if (mode === "auto") mode = discovered ? "known" : "blind";

  const resultIds = recipe?.results || [];
  const resultDefs = resultIds.map((id) => resolveTechDef(content, id)).filter(Boolean);
  const alreadyHave = resultIds.length
    ? resultIds.every((id) => unlocked.has(id))
    : false;

  const blocked =
    attemptsLeft <= 0
      ? "Нет попыток в этом ходу"
      : cognitio < cost
        ? "Мало cognitio"
        : mode === "known" && !discovered
          ? "Рецепт ещё не открыт (нужен blind или discover)"
          : mode === "known" && recipe && Number(recipe.era || 0) >= 5 && !discovered
            ? "Era 5 только через известный рецепт"
            : null;

  return {
    ok: !blocked,
    error: blocked || undefined,
    mode,
    cost,
    attemptsLeft,
    attemptsPerTurn: rules.attemptsPerTurn,
    recipe: recipe
      ? {
          id: recipe.id,
          name: recipe.name,
          discovered,
          discoverableBlind: Boolean(recipe.discoverableBlind),
          era: recipe.era,
        }
      : null,
    results: resultDefs.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      era: d.era,
      alreadyUnlocked: unlocked.has(d.id),
    })),
    alreadyHave,
    blindHit: rules.blindHit,
    ingredients: [
      { id: defA.id, name: defA.name, category: defA.category, era: defA.era },
      { id: defB.id, name: defB.name, category: defB.category, era: defB.era },
    ],
  };
}

/**
 * Run an alchemy experiment.
 * @returns {{ ok, error?, outcome?, eco?, tech?, recipe?, refund? }}
 */
export function alchemyExperiment(factionId, techA, techB, meta = {}) {
  const content = meta.content || getContent();
  const rules = alchemyRules(content);
  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const al = ensureAlchemyState(eco);
  const turn = meta.turn ?? world?.meta?.turn ?? null;

  const preview = previewAlchemyExperiment(factionId, techA, techB, {
    content,
    ledger,
    eco,
    mode: meta.mode || "auto",
  });
  if (!preview.ok) return { ok: false, error: preview.error, preview };

  // Known mode requires discovered recipe; auto already mapped.
  let mode = preview.mode;
  if (mode === "known" && !preview.recipe?.discovered) {
    // Allow known if recipe exists and GM/force, else fall to blind
    if (meta.forceKnown && preview.recipe) {
      mode = "known";
    } else {
      mode = "blind";
    }
  }

  // Era 5: blind cannot grant
  const recipe = findRecipeForPair(techA, techB, content);
  if (mode === "blind" && recipe && Number(recipe.era || 0) >= 5) {
    // Still spend? Spec: Era 5 only via known/GM/quest/market — treat as flavor fail without grant
  }

  const cost = preview.cost;
  const affordCogn = Number(eco.stocks?.["currency.cognitio"] ?? 0);
  if (affordCogn < cost) {
    return { ok: false, error: `Не хватает currency.cognitio (нужно ${cost})` };
  }

  adjustStock(ledger, factionId, "currency.cognitio", -cost, {
    turn,
    reason: "alchemy_experiment",
    intentId: meta.intentId || `${techA}+${techB}`,
  });
  al.attemptsUsedThisTurn = Number(al.attemptsUsedThisTurn || 0) + 1;
  al.lastExperimentTurn = turn;

  const unlocked = new Set(eco.unlockedTechs || []);
  let outcome = "fail";
  let granted = [];
  let refund = 0;
  let discoveredNow = false;

  const roll = Math.random();

  if (mode === "known" && recipe && (al.discoveredRecipes || []).includes(recipe.id)) {
    outcome = "success";
  } else if (mode === "blind") {
    if (!recipe) {
      outcome = roll < 0.35 ? "flavor" : "fail";
    } else if (Number(recipe.era || 0) >= 5) {
      outcome = "fail";
    } else if (recipe.discoverableBlind === false) {
      outcome = roll < 0.35 ? "flavor" : "fail";
    } else if (roll < rules.blindHit) {
      outcome = "success";
      discoveredNow = true;
    } else if (roll < rules.blindHit + 0.35) {
      outcome = "flavor";
    } else {
      outcome = "fail";
    }
  } else {
    outcome = "fail";
  }

  if (outcome === "success" && recipe) {
    if (discoveredNow || !(al.discoveredRecipes || []).includes(recipe.id)) {
      if (!al.discoveredRecipes.includes(recipe.id)) {
        al.discoveredRecipes.push(recipe.id);
        discoveredNow = true;
      }
    }
    for (const rid of recipe.results || []) {
      const def = resolveTechDef(content, rid);
      if (!def) continue;
      if (unlocked.has(rid)) {
        // duplicate
        continue;
      }
      if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
      eco.unlockedTechs.push(rid);
      unlocked.add(rid);
      applyUnlockEffects(eco, def.effects || []);
      granted.push(def);
      if (world) {
        applyUnitUpgradeEffectsToWorld(world, factionId, def.effects || [], content);
      }
    }
    if (granted.length === 0 && (recipe.results || []).length) {
      // all duplicates → refund
      refund = Math.floor(cost * rules.duplicateRefund);
      if (refund > 0) {
        adjustStock(ledger, factionId, "currency.cognitio", refund, {
          turn,
          reason: "alchemy_duplicate_refund",
          intentId: recipe.id,
        });
      }
      outcome = "duplicate";
    }
  } else if (outcome === "flavor") {
    refund = Math.floor(cost * 0.25);
    if (refund > 0) {
      adjustStock(ledger, factionId, "currency.cognitio", refund, {
        turn,
        reason: "alchemy_flavor_refund",
        intentId: `${techA}+${techB}`,
      });
    }
  }

  appendJournal(al, {
    turn,
    techA,
    techB,
    mode,
    outcome,
    recipeId: recipe?.id || null,
    granted: granted.map((g) => g.id),
    cost,
    refund,
  });

  writeLedger(ledger);

  return {
    ok: true,
    outcome,
    mode,
    cost,
    refund,
    discoveredRecipe: discoveredNow ? recipe?.id : null,
    recipe: recipe
      ? { id: recipe.id, name: recipe.name, flavor: recipe.flavor }
      : null,
    techs: granted,
    tech: granted[0] || null,
    alchemy: { ...al, discoveredRecipes: [...al.discoveredRecipes] },
    eco: {
      unlockedTechs: [...(eco.unlockedTechs || [])],
      unlockedProperties: [...(eco.unlockedProperties || [])],
      techTiers: { ...eco.techTiers },
      stocks: { ...eco.stocks },
      alchemy: {
        attemptsUsedThisTurn: al.attemptsUsedThisTurn,
        discoveredRecipes: [...al.discoveredRecipes],
        lastExperimentTurn: al.lastExperimentTurn,
        journal: al.journal.slice(-10),
      },
    },
    worldMutated: granted.some((d) =>
      (d.effects || []).some((e) => e?.effect === "unit_upgrade"),
    ),
    message:
      outcome === "success"
        ? `Открыто: ${granted.map((g) => g.name).join(", ") || "—"}`
        : outcome === "duplicate"
          ? "Результат уже известен — частичный возврат cognitio"
          : outcome === "flavor"
            ? "Интересные наблюдения, но новой технологии нет"
            : "Эксперимент не дал результата",
  };
}

/** Mutate eco only — discover a recipe if unknown. */
export function discoverRecipeOnEco(eco, recipeId) {
  const al = ensureAlchemyState(eco);
  if (!al.discoveredRecipes.includes(recipeId)) {
    al.discoveredRecipes.push(recipeId);
    return true;
  }
  return false;
}

/** GM / quest / market: unlock a recipe without experimenting. */
export function grantRecipe(factionId, recipeId, meta = {}) {
  const content = meta.content || getContent();
  const recipe = content.tech_recipes?.[recipeId];
  if (!recipe) return { ok: false, error: "Неизвестный рецепт" };
  const ledger = meta.ledger || readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const added = discoverRecipeOnEco(eco, recipeId);
  if (!meta.ledger) writeLedger(ledger);
  const al = ensureAlchemyState(eco);
  return {
    ok: true,
    added,
    recipe: { id: recipe.id, name: recipe.name },
    alchemy: {
      attemptsUsedThisTurn: al.attemptsUsedThisTurn,
      discoveredRecipes: [...al.discoveredRecipes],
    },
  };
}

/**
 * Diplo / trade: copy a discovered recipe from one faction to another.
 * Does not remove it from the sender.
 */
export function transferRecipe(fromEco, toEco, recipeId, content = getContent()) {
  const recipe = content?.tech_recipes?.[recipeId];
  if (!recipe) return { ok: false, error: "Неизвестный рецепт" };
  const fromAl = ensureAlchemyState(fromEco);
  if (!(fromAl.discoveredRecipes || []).includes(recipeId)) {
    return { ok: false, error: "У отправителя нет этого рецепта" };
  }
  const added = discoverRecipeOnEco(toEco, recipeId);
  return {
    ok: true,
    added,
    recipe: { id: recipe.id, name: recipe.name },
  };
}

/**
 * Buy a market listing: tech and/or recipe.
 * Listing shape: { techId?, recipeId?, price: { currency.*: n }, minRelation? }
 */
export function purchaseTechMarketListing(factionId, listing, meta = {}) {
  const content = meta.content || getContent();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const price = listing?.price || {};
  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (n <= 0) continue;
    if (Number(eco.stocks?.[cur] ?? 0) < n) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${n})` };
    }
  }
  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "tech_market_buy",
      intentId: listing.recipeId || listing.techId || "listing",
    });
  }

  const notes = [];
  if (listing.recipeId) {
    const gr = grantRecipe(factionId, listing.recipeId, { content, ledger });
    if (!gr.ok) return gr;
    notes.push(`рецепт: ${gr.recipe.name}`);
  }
  if (listing.techId) {
    const def =
      content.technologies?.[listing.techId] ||
      content.tech_combos?.[listing.techId];
    if (!def) return { ok: false, error: "Неизвестная технология листинга" };
    if (!(eco.unlockedTechs || []).includes(listing.techId)) {
      if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
      eco.unlockedTechs.push(listing.techId);
      applyUnlockEffects(eco, def.effects || []);
      if (!Array.isArray(eco.acquiredTechs)) eco.acquiredTechs = [];
      eco.acquiredTechs.push({
        techId: listing.techId,
        source: "market",
        acquiredTurn: turn,
        transferable: true,
      });
      notes.push(`tech: ${def.name}`);
    } else {
      notes.push(`tech уже есть: ${def.name}`);
    }
  }
  writeLedger(ledger);
  return {
    ok: true,
    notes,
    economy: {
      stocks: { ...eco.stocks },
      unlockedTechs: [...(eco.unlockedTechs || [])],
      alchemy: { ...ensureAlchemyState(eco) },
    },
  };
}
