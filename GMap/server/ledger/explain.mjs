/**
 * Player-safe modifier-breakdown formatting (economy "explain" panel).
 * Extracted from ../ledger.mjs.
 */
const CURRENCY_LABELS = {
  "currency.metal": "Металл",
  "currency.supply": "Обеспечение",
  "currency.extracta": "Сырьё",
  "currency.materia": "Материалы",
  "currency.industria": "Промышленность",
  "currency.energia": "Энергия",
  "currency.bios": "Биомасса",
  "currency.cognitio": "Знание",
};

const STAT_LABELS = {
  defense: "оборона",
  attack: "атака",
  morale: "мораль",
  stability: "стабильность",
};

const CHANNEL_PLAYER_LABELS = {
  "tax_pressure": "Налоговое давление",
  ap: "Очки действия",
  stability: "Стабильность",
  move_cost: "Стоимость хода",
  "stat:defense": "Оборона",
  "stat:attack": "Атака",
  "loyalty:*": "Лояльность",
  "cost:diplomacy": "Дипломатия",
  "research:*": "Наука",
  "cost:*": "Затраты",
};

function roundNum(n, decimals = 2) {
  if (n == null || !Number.isFinite(Number(n))) return n;
  const f = 10 ** decimals;
  return Math.round(Number(n) * f) / f;
}

function currencyLabelFromChannel(channelKey) {
  const m = String(channelKey).match(/:([^:]+)$/);
  if (!m) return null;
  return CURRENCY_LABELS[m[1]] || null;
}

function explainChannelPlayerLabel(channelKey) {
  if (CHANNEL_PLAYER_LABELS[channelKey]) return CHANNEL_PLAYER_LABELS[channelKey];
  const [head, tail] = String(channelKey).split(":");
  if (head === "stat" && tail) {
    return STAT_LABELS[tail] ? `Показатель: ${STAT_LABELS[tail]}` : `Показатель: ${tail}`;
  }
  if (head === "production" || head === "upkeep") {
    const cur = currencyLabelFromChannel(channelKey);
    return cur ? `${head === "production" ? "Доход" : "Содержание"} · ${cur}` : channelKey;
  }
  if (head === "loyalty") return "Лояльность";
  if (head === "cost") return tail ? `Затраты · ${tail}` : "Затраты";
  if (head === "research") return "Наука";
  return channelKey.replace(/_/g, " ");
}

const EXPLAIN_CATEGORY_LABELS = {
  income: "Доход",
  upkeep: "Содержание",
  tax: "Налоги",
  race: "Расы",
  deficit: "Дефицит",
  other: "Прочее",
};

/** Hide internal/GM-only modifier sources from player explain. */
const PUBLIC_EXPLAIN_KINDS = new Set([
  "tax",
  "race",
  "faction",
  "deficit",
  "pressure",
  "depot",
  "culture",
  "faith",
  "faith_taboo",
]);

function explainChannelCategory(channelKey) {
  if (channelKey.startsWith("production:")) return "income";
  if (channelKey.startsWith("upkeep:")) return "upkeep";
  if (channelKey === "tax_pressure") return "tax";
  if (channelKey === "ap") return "deficit";
  if (channelKey.startsWith("pop_growth")) return "race";
  return "other";
}

function formatExplainModifier(flat, mult) {
  const parts = [];
  if (flat && flat !== 0) {
    const n = roundNum(flat);
    parts.push(n > 0 ? `+${n}` : String(n));
  }
  if (mult && mult !== 1) {
    parts.push(`×${roundNum(mult, 3)}`);
  }
  return parts.join(" ") || null;
}

function formatMult(mult) {
  return roundNum(mult, 3);
}

function formatEffectSnippet(effect, args = {}) {
  if (effect === "production_mult" && args.mult != null) {
    return `добыча ×${formatMult(args.mult)}`;
  }
  if (effect === "production_flat" && args.amount != null) {
    return `добыча +${roundNum(args.amount)}`;
  }
  if (effect === "upkeep_mult" && args.mult != null) {
    return `содержание ×${formatMult(args.mult)}`;
  }
  if (effect === "upkeep_flat" && args.amount != null) {
    return `содержание +${roundNum(args.amount)}`;
  }
  if (effect === "stat_mult" && args.stat != null && args.mult != null) {
    const stat =
      STAT_LABELS[args.stat] ?? String(args.stat).replace(/_/g, " ");
    return `${stat} ×${formatMult(args.mult)}`;
  }
  if (effect === "pop_growth_mult" && args.mult != null) {
    return `рост ×${formatMult(args.mult)}`;
  }
  if (effect === "tax_pressure" && args.amount != null) {
    return `давление +${roundNum(args.amount)}`;
  }
  if (effect === "ap_add" && args.amount != null) {
    return `ОД ${args.amount > 0 ? "+" : ""}${roundNum(args.amount)}`;
  }
  if (effect === "habitability_mult" && args.mult != null) {
    return `обитаемость ×${formatMult(args.mult)}`;
  }
  if (effect === "loyalty_add" && args.amount != null) {
    return `лояльность ${args.amount > 0 ? "+" : ""}${roundNum(args.amount)}`;
  }
  if (effect === "loyalty_mult" && args.mult != null) {
    return `лояльность ×${formatMult(args.mult)}`;
  }
  if (effect === "logistics_range_add" && (args.hops != null || args.amount != null)) {
    const h = args.hops ?? args.amount;
    return `логистика +${h} хоп`;
  }
  if (effect === "research_cost_mult" && args.mult != null) {
    return `наука ×${formatMult(args.mult)}`;
  }
  if (effect === "diplomacy_trust_decay_mult" && args.mult != null) {
    return `доверие ×${formatMult(args.mult)}`;
  }
  if (effect === "move_cost_mult" && args.mult != null) {
    return `ход ×${formatMult(args.mult)}`;
  }
  if (effect === "cost_mult" && args.mult != null) {
    return `стоимость ×${formatMult(args.mult)}`;
  }
  if (effect === "forbid_intent") {
    return "запрет действия";
  }
  if (effect === "unlock_property" && args.property) {
    return `свойство ${args.property}`;
  }
  if (effect === "stability_add" && args.amount != null) {
    return `стабильность ${args.amount > 0 ? "+" : ""}${args.amount}`;
  }
  if (effect === "pop_cap_flat" && args.amount != null) {
    return `лимит нас. +${args.amount}`;
  }
  return null;
}

function summarizeExplainLines(lines, maxLines = 20) {
  if (lines.length <= maxLines) return lines;
  const byCat = new Map();
  for (const line of lines) {
    if (!byCat.has(line.category)) byCat.set(line.category, []);
    byCat.get(line.category).push(line);
  }
  const out = [];
  for (const [category, group] of byCat) {
    if (group.length <= 3) {
      out.push(...group);
      continue;
    }
    out.push({
      category,
      label: EXPLAIN_CATEGORY_LABELS[category] || category,
      modifier: `${group.length} эфф.`,
      sources: group.slice(0, 2).map((g) => g.label),
    });
  }
  return out.slice(0, maxLines);
}

/**
 * Compact, player-safe modifier breakdown (no GM poi/system ids).
 * @param {Array<{ channel: string, flat?: number, mult?: number, sources?: object[] }>} explainRows
 * @param {{ channels?: Record<string, { taxRate?: number, tax?: number }>, deficit?: string }} [opts]
 */
export function sanitizeEconomyExplain(explainRows, opts = {}) {
  const lines = [];
  const raceTraits = new Map();
  const factionTraits = new Map();

  for (const row of explainRows || []) {
    const { channel, flat, mult, sources } = row;
    const modifier = formatExplainModifier(flat ?? 0, mult ?? 1);
    if (!modifier) continue;

    const category = explainChannelCategory(channel);
    const currency = currencyLabelFromChannel(channel);
    let label;
    switch (category) {
      case "income":
        label = currency ? `Доход · ${currency}` : "Доход";
        break;
      case "upkeep":
        label = currency ? `Содержание · ${currency}` : "Содержание";
        break;
      case "tax":
        label = "Налоговое давление";
        break;
      case "deficit":
        label = "Дефицит казны";
        break;
      case "race":
        label = currency ? `Рост · ${currency}` : "Рост населения";
        break;
      default:
        label = explainChannelPlayerLabel(channel);
        break;
    }

    const publicSources = (sources || []).filter((s) => {
      const kind = s.source?.kind;
      if (!kind) return category !== "other";
      return PUBLIC_EXPLAIN_KINDS.has(kind);
    });

    for (const s of sources || []) {
      if (s.source?.kind !== "race") continue;
      const key = s.source.id || s.source.label || "race";
      const snippet = formatEffectSnippet(s.effect, s.args);
      if (!snippet) continue;
      if (!raceTraits.has(key)) {
        raceTraits.set(key, {
          label: s.source.label || "Раса",
          effects: [],
        });
      }
      const bucket = raceTraits.get(key);
      if (!bucket.effects.includes(snippet)) bucket.effects.push(snippet);
    }

    for (const s of sources || []) {
      if (s.source?.kind !== "faction") continue;
      const key = s.source.id || s.source.label || "faction";
      const snippet = formatEffectSnippet(s.effect, s.args);
      if (!snippet) continue;
      if (!factionTraits.has(key)) {
        factionTraits.set(key, {
          label: s.source.label || "Держава",
          effects: [],
        });
      }
      const bucket = factionTraits.get(key);
      if (!bucket.effects.includes(snippet)) bucket.effects.push(snippet);
    }

    const sourceLabels = [
      ...new Set(
        publicSources.map((s) => s.source?.label).filter(Boolean),
      ),
    ].slice(0, 3);

    if (category === "other" && sourceLabels.length === 0) continue;

    lines.push({
      category,
      label,
      modifier,
      sources: sourceLabels.length ? sourceLabels : undefined,
    });
  }

  for (const [cur, ch] of Object.entries(opts.channels || {})) {
    if (!ch || !(ch.taxRate > 0) || !(ch.tax > 0)) continue;
    const currency = CURRENCY_LABELS[cur] || cur;
    lines.push({
      category: "tax",
      label: `Сбор · ${currency}`,
      modifier: `−${Math.floor(ch.tax)} (${Math.round(ch.taxRate * 100)}%)`,
    });
  }

  const deficit = opts.deficit;
  if (deficit && deficit !== "ok") {
    lines.push({
      category: "deficit",
      label: deficit === "empty" ? "Пустая казна" : "Низкие запасы",
      modifier: deficit === "empty" ? "штрафы" : "−1 ОД",
    });
  }

  return {
    lines: summarizeExplainLines(lines, 20),
    raceTraits: [...raceTraits.values()]
      .map((r) => ({
        label: r.label,
        summary: r.effects.slice(0, 4).join(", "),
      }))
      .filter((r) => r.summary)
      .slice(0, 6),
    factionTraits: [...factionTraits.values()]
      .map((r) => ({
        label: r.label,
        summary: r.effects.slice(0, 4).join(", "),
      }))
      .filter((r) => r.summary)
      .slice(0, 6),
  };
}
