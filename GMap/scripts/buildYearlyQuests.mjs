/**
 * Regenerates content/core/yearly_quests.json — universal per-turn events
 * with distinct choices and consequences (no race-locked loyalty).
 *
 * Run: node scripts/buildYearlyQuests.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../content/core/yearly_quests.json");

const C = {
  bios: "currency.bios",
  supply: "currency.supply",
  metal: "currency.metal",
  cognitio: "currency.cognitio",
  energia: "currency.energia",
  extracta: "currency.extracta",
  materia: "currency.materia",
  industria: "currency.industria",
};

const spend = (resource, amount) => ({
  effect: "upkeep_flat",
  args: { resource, amount: -Math.abs(amount) },
});
const gain = (resource, amount) => ({
  effect: "production_flat",
  args: { resource, amount: Math.abs(amount) },
});
const loyalty = (amount) => ({
  effect: "loyalty_add",
  args: { amount },
});
const recipe = (recipeId) => ({
  effect: "grant_recipe",
  args: { recipeId },
});
function d20(threshold = 11, label = "d20 проверка") {
  return [{ count: 1, sides: 20, label, threshold }];
}

function quest(def) {
  return {
    id: def.id,
    name: def.name,
    summary: def.summary,
    detail: def.detail,
    category: def.category,
    filterBy: def.filterBy || {},
    choices: def.choices,
    neutral: def.neutral !== false,
  };
}

function choice(id, label, description, effects) {
  return { id, label, description, effects };
}

function gamble(id, label, description, threshold, onSuccess, onFail) {
  return {
    id,
    label,
    description,
    diceRequired: d20(threshold),
    onSuccess,
    onFail,
  };
}

/** @type {Record<string, object>} */
const catalog = {};

function add(def) {
  catalog[def.id] = quest(def);
}

// ─── HUNGER ───────────────────────────────────────────────
add({
  id: "yq.hunger_1",
  name: "Недород на окраине",
  summary: "Окраинная колония теряет урожай — склады пустеют к зиме.",
  detail:
    "Местные советы просят зерно и технику. Можно спасти людей, сжать пояс или устроить «добровольный» сбор.",
  category: "hunger",
  choices: [
    choice("relief", "Открыть запасы", "Потратить bios и supply — лояльность вырастет.", [
      spend(C.bios, 4),
      spend(C.supply, 3),
      loyalty(5),
    ]),
    choice("ration", "Ввести пайки", "Жёсткий учёт: supply +2, лояльность −3.", [
      gain(C.supply, 2),
      loyalty(-3),
    ]),
    gamble(
      "levy",
      "Чрезвычайный сбор",
      "Рискнуть: либо металл с окраин, либо бунт лояльности.",
      12,
      [gain(C.metal, 5), loyalty(1)],
      [loyalty(-6), spend(C.bios, 2)],
    ),
  ],
});

add({
  id: "yq.hunger_2",
  name: "Срыв поставок зерна",
  summary: "Конвой с зерном исчез на перегоне — голодные очереди у портов.",
  detail: "Флот винит пиратов, купцы — бюрократию. Нужно решить, чем платить за спокойствие.",
  category: "hunger",
  choices: [
    choice("escort", "Выслать эскорт и зерно", "Supply −5, лояльность +4, металл −2 на охрану.", [
      spend(C.supply, 5),
      spend(C.metal, 2),
      loyalty(4),
    ]),
    choice("blame", "Свалить на подрядчика", "Сэкономить, потерять доверие.", [
      gain(C.cognitio, 2),
      loyalty(-4),
    ]),
    choice("buyout", "Скупить у спекулянтов", "Дорогой bios, быстрый эффект.", [
      spend(C.bios, 8),
      gain(C.supply, 6),
      loyalty(2),
    ]),
  ],
});

add({
  id: "yq.hunger_3",
  name: "Засуха в колониях",
  summary: "Несколько миров теряют урожай из‑за аномальной засухи.",
  detail: "Инженеры предлагают перекачку воды и энергии; народ ждёт хлеба сейчас.",
  category: "hunger",
  filterBy: { minEra: 1 },
  choices: [
    choice("pipeline", "Аварийный водовод", "Energia −10, supply +4, лояльность +3.", [
      spend(C.energia, 10),
      gain(C.supply, 4),
      loyalty(3),
    ]),
    choice("migrate", "Эвакуировать рабочих", "Bios −3, extracta −2, лояльность −2 — но спасём кадры.", [
      spend(C.bios, 3),
      spend(C.extracta, 2),
      loyalty(-2),
      gain(C.cognitio, 3),
    ]),
    gamble(
      "cloudseed",
      "Засев облаков",
      "Эксперимент: успех даст bios, провал сожжёт energia.",
      13,
      [gain(C.bios, 6), loyalty(2)],
      [spend(C.energia, 8), loyalty(-3)],
    ),
  ],
});

add({
  id: "yq.hunger_4",
  name: "Порча хранилищ",
  summary: "Вредители и плесень уничтожили часть продовольственных запасов.",
  detail: "Склады либо чистить, либо списать и скрыть масштаб.",
  category: "hunger",
  choices: [
    choice("purge", "Санитарная чистка", "Supply −4, industria −1, лояльность +3.", [
      spend(C.supply, 4),
      spend(C.industria, 1),
      loyalty(3),
    ]),
    choice("cover", "Замять отчёт", "Ничего не тратим — лояльность −5, когда всплывёт.", [
      loyalty(-5),
    ]),
    gamble(
      "salvage",
      "Переработать порчу",
      "Алхимики обещают materia из отходов… или отравление.",
      11,
      [gain(C.materia, 4), gain(C.supply, 2)],
      [loyalty(-4), spend(C.bios, 3)],
    ),
  ],
});

add({
  id: "yq.hunger_5",
  name: "Голод в шахтёрском поясе",
  summary: "Шахтёрские поселения требуют экстренной помощи — иначе встанут рудники.",
  detail: "Extracta зависит от сытых рук. Можно кормить, давить или торговать пайками за руду.",
  category: "hunger",
  filterBy: { minEra: 1 },
  choices: [
    choice("feed", "Пайки шахтёрам", "Bios −5, extracta +3, лояльность +4.", [
      spend(C.bios, 5),
      gain(C.extracta, 3),
      loyalty(4),
    ]),
    choice("crackdown", "Военный надзор", "Лояльность −6, extracta +2 силой.", [
      loyalty(-6),
      gain(C.extracta, 2),
      spend(C.metal, 1),
    ]),
    choice("trade_food", "Еда за руду", "Supply −3 ↔ extracta +5, лояльность 0.", [
      spend(C.supply, 3),
      gain(C.extracta, 5),
    ]),
  ],
});

// ─── REVOLT ───────────────────────────────────────────────
add({
  id: "yq.revolt_1",
  name: "Брожение на заводах",
  summary: "Цеховые советы грозят остановить конвейеры.",
  detail: "Индустрия стоит на волоске. Уступки, штрейкбрехеры или риск переговоров.",
  category: "revolt",
  filterBy: {},
  choices: [
    choice("raise", "Повысить пайки", "Bios −6, industria +2, лояльность +5.", [
      spend(C.bios, 6),
      gain(C.industria, 2),
      loyalty(5),
    ]),
    choice("scabs", "Ввести штрейкбрехеров", "Лояльность −5, industria +3 сейчас.", [
      loyalty(-5),
      gain(C.industria, 3),
    ]),
    gamble(
      "talks",
      "Арбитраж",
      "Успех: мир без трат. Провал: простой и злость.",
      12,
      [loyalty(3), gain(C.cognitio, 2)],
      [loyalty(-4), spend(C.industria, 2)],
    ),
  ],
});

add({
  id: "yq.revolt_2",
  name: "Уличные беспорядки",
  summary: "В столичном секторе жгут склады и блокируют трассы.",
  detail: "Силы порядка просят металл и патроны; политики — амнистию.",
  category: "revolt",
  choices: [
    choice("police", "Жёсткий порядок", "Metal −4, лояльность −2, supply сохранён (+2).", [
      spend(C.metal, 4),
      loyalty(-2),
      gain(C.supply, 2),
    ]),
    choice("amnesty", "Амнистия и хлеб", "Bios −5, лояльность +6.", [
      spend(C.bios, 5),
      loyalty(6),
    ]),
    choice("curfew", "Комендантский час", "Energia −3 на патрули, лояльность −3, metal +2 конфискат.", [
      spend(C.energia, 3),
      loyalty(-3),
      gain(C.metal, 2),
    ]),
  ],
});

add({
  id: "yq.revolt_3",
  name: "Саботаж логистики",
  summary: "Кто‑то режет кабели и поджигает депо — потоки рвутся.",
  detail: "Можно чинить, запугивать или ловить диверсантов наудачу.",
  category: "revolt",
  choices: [
    choice("repair", "Аварийный ремонт", "Materia −3, energia −4, supply +3, лояльность +2.", [
      spend(C.materia, 3),
      spend(C.energia, 4),
      gain(C.supply, 3),
      loyalty(2),
    ]),
    choice("terror", "Показательные аресты", "Лояльность −7, cognitio +2 (досье).", [
      loyalty(-7),
      gain(C.cognitio, 2),
    ]),
    gamble(
      "hunt",
      "Охота на саботажников",
      "Успех: extracta трофеи. Провал: ещё один склад горит.",
      14,
      [gain(C.extracta, 4), loyalty(2)],
      [spend(C.supply, 5), loyalty(-3)],
    ),
  ],
});

add({
  id: "yq.revolt_4",
  name: "Мятеж гарнизона",
  summary: "Часть гарнизона отказывается выполнять приказы.",
  detail: "Жалование, расформирование или рискованный поединок командиров.",
  category: "revolt",
  filterBy: { minEra: 1 },
  choices: [
    choice("pay", "Выплатить жалование", "Bios −7, metal −2, лояльность +4.", [
      spend(C.bios, 7),
      spend(C.metal, 2),
      loyalty(4),
    ]),
    choice("disband", "Расформировать роты", "Metal +3 со складов, лояльность −5, industria −1.", [
      gain(C.metal, 3),
      loyalty(-5),
      spend(C.industria, 1),
    ]),
    gamble(
      "duel",
      "Суд чести",
      "Командиры решают спор. Успех — дисциплина, провал — кровь.",
      11,
      [loyalty(5), gain(C.cognitio, 1)],
      [loyalty(-6), spend(C.bios, 3)],
    ),
  ],
});

add({
  id: "yq.revolt_5",
  name: "Пропаганда сепаратистов",
  summary: "В сетях гуляет манифест «свободных миров».",
  detail: "Контрпропаганда, цензура или ставка на правду с риском.",
  category: "revolt",
  choices: [
    choice("broadcast", "Контрпропаганда", "Cognitio −5, energia −2, лояльность +4.", [
      spend(C.cognitio, 5),
      spend(C.energia, 2),
      loyalty(4),
    ]),
    choice("censor", "Глушить каналы", "Лояльность −3, cognitio +3 (контроль).", [
      loyalty(-3),
      gain(C.cognitio, 3),
    ]),
    gamble(
      "debate",
      "Публичный диспут",
      "Успех: лояльность +5. Провал: манифест становится хитом (−4).",
      12,
      [loyalty(5), gain(C.cognitio, 2)],
      [loyalty(-4)],
    ),
  ],
});

// ─── TRADE ────────────────────────────────────────────────
add({
  id: "yq.trade_1",
  name: "Выгодный караван",
  summary: "Нейтральный караван предлагает редкий груз по завышенной цене.",
  detail: "Купить, обложить пошлиной или рискнуть контрактом «на честном слове».",
  category: "trade",
  choices: [
    choice("buy", "Купить всё", "Bios −8 → materia +5, supply +3.", [
      spend(C.bios, 8),
      gain(C.materia, 5),
      gain(C.supply, 3),
    ]),
    choice("tariff", "Пошлина и досмотр", "Bios +4, лояльность купцов −2 (фракция −2).", [
      gain(C.bios, 4),
      loyalty(-2),
    ]),
    gamble(
      "handshake",
      "Сделка на слово",
      "Успех: дёшево. Провал: пустые контейнеры.",
      10,
      [spend(C.bios, 3), gain(C.materia, 6), gain(C.extracta, 2)],
      [spend(C.bios, 3), loyalty(-2)],
    ),
  ],
});

add({
  id: "yq.trade_2",
  name: "Контрабандный маршрут",
  summary: "Разведка нашла «серый» коридор мимо таможен.",
  detail: "Легализовать, закрыть или самим сесть на поток.",
  category: "trade",
  filterBy: { minEra: 1 },
  choices: [
    choice("legalize", "Легализовать и обложить", "Cognitio −2, bios +6, лояльность +1.", [
      spend(C.cognitio, 2),
      gain(C.bios, 6),
      loyalty(1),
    ]),
    choice("shut", "Перекрыть коридор", "Лояльность +2 (закон), metal −1 на блокпосты.", [
      spend(C.metal, 1),
      loyalty(2),
      spend(C.energia, 2),
    ]),
    gamble(
      "skim",
      "Сесть на поток",
      "Успех: bios и extracta. Провал: скандал и штраф лояльности.",
      13,
      [gain(C.bios, 10), gain(C.extracta, 3)],
      [loyalty(-6), spend(C.cognitio, 3)],
    ),
  ],
});

add({
  id: "yq.trade_3",
  name: "Дефицит металла",
  summary: "Верфи и арсеналы жалуются: металл дорожает с каждым ходом.",
  detail: "Импорт, замена сплавами или азартная ставка на старый склад.",
  category: "trade",
  choices: [
    choice("import", "Экстренный импорт", "Bios −6 → metal +8.", [
      spend(C.bios, 6),
      gain(C.metal, 8),
    ]),
    choice("substitute", "Сплавы-заменители", "Materia −4, metal +5, industria −1.", [
      spend(C.materia, 4),
      gain(C.metal, 5),
      spend(C.industria, 1),
    ]),
    gamble(
      "cache",
      "Вскрыть старый склад",
      "Успех: metal +12. Провал: пусто и −лояльность у интендантов.",
      11,
      [gain(C.metal, 12)],
      [loyalty(-3)],
    ),
  ],
});

add({
  id: "yq.trade_4",
  name: "Ярмарка на границе",
  summary: "Пограничная ярмарка обещает прибыль — и шпионов в придачу.",
  detail: "Открыть, обложить охраной или сорвать как угрозу.",
  category: "trade",
  choices: [
    choice("open", "Открыть ярмарку", "Supply −2, bios +5, лояльность +2.", [
      spend(C.supply, 2),
      gain(C.bios, 5),
      loyalty(2),
    ]),
    choice("secure", "Ярмарка под охраной", "Metal −3, bios +7, лояльность +1.", [
      spend(C.metal, 3),
      gain(C.bios, 7),
      loyalty(1),
    ]),
    choice("ban", "Запретить сбор", "Лояльность −4, cognitio +2 (меньше шпионов).", [
      loyalty(-4),
      gain(C.cognitio, 2),
    ]),
  ],
});

add({
  id: "yq.trade_5",
  name: "Срыв биржевой сделки",
  summary: "Контрагент сорвал поставку — биржа требует компенсации.",
  detail: "Платить, судиться или блефовать.",
  category: "trade",
  filterBy: { minEra: 1 },
  choices: [
    choice("pay", "Выплатить неустойку", "Bios −9, лояльность +2 (репутация).", [
      spend(C.bios, 9),
      loyalty(2),
    ]),
    choice("sue", "Судебная война", "Cognitio −4, bios +3 через год… сейчас −лояльность 0, metal −1.", [
      spend(C.cognitio, 4),
      spend(C.metal, 1),
      gain(C.bios, 3),
    ]),
    gamble(
      "bluff",
      "Блеф на бирже",
      "Успех: bios +8. Провал: bios −5 и лояльность −3.",
      14,
      [gain(C.bios, 8)],
      [spend(C.bios, 5), loyalty(-3)],
    ),
  ],
});

// ─── PIRATES ──────────────────────────────────────────────
add({
  id: "yq.pirates_1",
  name: "Рейд пиратов",
  summary: "Пиратская флотилия ударила по конвою у ваших границ.",
  detail: "Контратака, выкуп груза или ловушка.",
  category: "pirates",
  choices: [
    choice("hunt", "Карательный рейд", "Metal −5, energia −3, лояльность +3, extracta +2 трофеи.", [
      spend(C.metal, 5),
      spend(C.energia, 3),
      loyalty(3),
      gain(C.extracta, 2),
    ]),
    choice("ransom", "Выкупить груз", "Bios −6, supply +4.", [
      spend(C.bios, 6),
      gain(C.supply, 4),
    ]),
    gamble(
      "ambush",
      "Устроить засаду",
      "Успех: metal +6. Провал: ещё один конвой потерян.",
      12,
      [gain(C.metal, 6), loyalty(2)],
      [spend(C.supply, 4), loyalty(-2)],
    ),
  ],
});

add({
  id: "yq.pirates_2",
  name: "Выкуп за конвой",
  summary: "Пираты держат гражданский конвой и требуют выкуп.",
  detail: "Платить, штурмовать или тянуть время переговорами.",
  category: "pirates",
  choices: [
    choice("pay", "Заплатить выкуп", "Bios −10, лояльность +4 (спасли людей).", [
      spend(C.bios, 10),
      loyalty(4),
    ]),
    choice("storm", "Штурм", "Metal −4, bios −2 потери, лояльность +2, metal +3 трофеи.", [
      spend(C.metal, 4),
      spend(C.bios, 2),
      loyalty(2),
      gain(C.metal, 3),
    ]),
    gamble(
      "stall",
      "Тянуть переговоры",
      "Успех: освобождение дёшево. Провал: казнь заложников (−лояльность).",
      13,
      [spend(C.bios, 3), loyalty(3)],
      [loyalty(-7)],
    ),
  ],
});

add({
  id: "yq.pirates_3",
  name: "База в поясе",
  summary: "Разведка нашла пиратскую базу в астероидном поясе.",
  detail: "Ударить, обложить данью или завербовать.",
  category: "pirates",
  filterBy: { minEra: 1 },
  choices: [
    choice("strike", "Уничтожить базу", "Metal −6, energia −4, лояльность +3, extracta +4.", [
      spend(C.metal, 6),
      spend(C.energia, 4),
      loyalty(3),
      gain(C.extracta, 4),
    ]),
    choice("tribute", "Дань за проход", "Bios +5 каждый «раз», лояльность −3 (позор).", [
      gain(C.bios, 5),
      loyalty(-3),
    ]),
    choice("recruit", "Вербовать корсаров", "Bios −4, metal +2, лояльность −1.", [
      spend(C.bios, 4),
      gain(C.metal, 2),
      loyalty(-1),
    ]),
  ],
});

add({
  id: "yq.pirates_4",
  name: "Корсары у врат",
  summary: "Корсары блокируют один из ваших звёздных врат.",
  detail: "Прорыв, пошлина или обходной маршрут.",
  category: "pirates",
  choices: [
    choice("break", "Пробить блокаду", "Metal −5, energia −5, лояльность +3.", [
      spend(C.metal, 5),
      spend(C.energia, 5),
      loyalty(3),
    ]),
    choice("toll", "Заплатить пошлину", "Bios −7, supply проходит (+3).", [
      spend(C.bios, 7),
      gain(C.supply, 3),
    ]),
    choice("detour", "Обходной маршрут", "Energia −6, supply −1, лояльность −1.", [
      spend(C.energia, 6),
      spend(C.supply, 1),
      loyalty(-1),
    ]),
  ],
});

add({
  id: "yq.pirates_5",
  name: "Чёрный флаг",
  summary: "Известный капер предлагает «охранный контракт» — или войну.",
  detail: "Нанять, отвергнуть с честью или кинуть на встрече.",
  category: "pirates",
  choices: [
    choice("hire", "Нанять капера", "Bios −8, metal +3 (рейды), лояльность −2.", [
      spend(C.bios, 8),
      gain(C.metal, 3),
      loyalty(-2),
    ]),
    choice("refuse", "Отвергнуть с честью", "Лояльность +3, metal −2 на усиление патрулей.", [
      loyalty(3),
      spend(C.metal, 2),
    ]),
    gamble(
      "betray",
      "Засада на встрече",
      "Успех: трофеи. Провал: месть по торговым линиям.",
      12,
      [gain(C.metal, 7), gain(C.bios, 4)],
      [spend(C.supply, 6), loyalty(-4)],
    ),
  ],
});

// ─── ANOMALY ──────────────────────────────────────────────
add({
  id: "yq.anomaly_1",
  name: "Сигнал из пустоты",
  summary: "С дальнего сектора идёт нерасшифрованный сигнал.",
  detail: "Исследовать, глушить или ответить — с риском.",
  category: "anomaly",
  filterBy: { minEra: 1 },
  choices: [
    choice("probe", "Послать зонд", "Energia −4, cognitio +5.", [
      spend(C.energia, 4),
      gain(C.cognitio, 5),
    ]),
    choice("jam", "Заглушить", "Energia −2, лояльность +1 (спокойствие).", [
      spend(C.energia, 2),
      loyalty(1),
    ]),
    gamble(
      "answer",
      "Ответить в эфир",
      "Успех: cognitio +8. Провал: паника (−лояльность) и расход energia.",
      14,
      [gain(C.cognitio, 8), loyalty(1)],
      [loyalty(-4), spend(C.energia, 3)],
    ),
  ],
});

add({
  id: "yq.anomaly_2",
  name: "Искажение гиперполосы",
  summary: "Гиперкоридор «плывёт» — караваны опаздывают на ходы.",
  detail: "Стабилизаторы, запрет полётов или слепой проход.",
  category: "anomaly",
  choices: [
    choice("stabilize", "Стабилизаторы", "Materia −3, energia −6, supply +2, лояльность +2.", [
      spend(C.materia, 3),
      spend(C.energia, 6),
      gain(C.supply, 2),
      loyalty(2),
    ]),
    choice("ground", "Запрет перелётов", "Bios −2 простой, лояльность −3, energia сэкономлена (+3).", [
      spend(C.bios, 2),
      loyalty(-3),
      gain(C.energia, 3),
    ]),
    gamble(
      "blind",
      "Слепой проход",
      "Успех: supply +5. Провал: потеря конвоя.",
      13,
      [gain(C.supply, 5), gain(C.bios, 2)],
      [spend(C.supply, 5), loyalty(-2)],
    ),
  ],
});

add({
  id: "yq.anomaly_3",
  name: "Артефакт в обломках",
  summary: "В обломках чужого корабля нашли странный артефакт.",
  detail: "Изучить, продать или уничтожить как угрозу.",
  category: "anomaly",
  choices: [
    choice("study", "Изучить в лаборатории", "Cognitio −3, materia +2, cognitio +6 итог.", [
      spend(C.cognitio, 3),
      gain(C.materia, 2),
      gain(C.cognitio, 6),
    ]),
    choice("sell", "Продать коллекционерам", "Bios +8, лояльность учёных −2.", [
      gain(C.bios, 8),
      loyalty(-2),
    ]),
    choice("destroy", "Уничтожить", "Metal −1, лояльность +2 (безопасность).", [
      spend(C.metal, 1),
      loyalty(2),
    ]),
  ],
});

add({
  id: "yq.anomaly_4",
  name: "Теневой шторм",
  summary: "Теневой шторм рвёт щиты и глушит связь на окраине.",
  detail: "Укрепить щиты, эвакуировать или «оседлать» бурю.",
  category: "anomaly",
  filterBy: { minEra: 1 },
  choices: [
    choice("shields", "Укрепить щиты", "Energia −8, materia −2, лояльность +3.", [
      spend(C.energia, 8),
      spend(C.materia, 2),
      loyalty(3),
    ]),
    choice("evac", "Эвакуация окраины", "Bios −4, supply −2, лояльность +1.", [
      spend(C.bios, 4),
      spend(C.supply, 2),
      loyalty(1),
    ]),
    gamble(
      "ride",
      "Оседлать бурю",
      "Успех: energia +10. Провал: потеря флота (metal −6).",
      15,
      [gain(C.energia, 10), gain(C.cognitio, 3)],
      [spend(C.metal, 6), loyalty(-3)],
    ),
  ],
});

add({
  id: "yq.anomaly_5",
  name: "Зеркальный маяк",
  summary: "Маяк отражает ваши же сигналы — кто‑то слушает.",
  detail: "Замаскировать, выключить или провести контрразведку.",
  category: "anomaly",
  choices: [
    choice("mask", "Маскировка эфира", "Cognitio −4, energia −2, лояльность +1.", [
      spend(C.cognitio, 4),
      spend(C.energia, 2),
      loyalty(1),
    ]),
    choice("off", "Выключить маяк", "Supply −1 логистика, лояльность −1.", [
      spend(C.supply, 1),
      loyalty(-1),
    ]),
    gamble(
      "counter",
      "Контрразведка",
      "Успех: cognitio +7. Провал: утечка (−лояльность).",
      12,
      [gain(C.cognitio, 7)],
      [loyalty(-5), spend(C.cognitio, 2)],
    ),
  ],
});

// ─── DIPLO ────────────────────────────────────────────────
add({
  id: "yq.diplo_1",
  name: "Дипломатический инцидент",
  summary: "Посол другой державы публично оскорблён вашим офицером.",
  detail: "Извинения, выдача виновного или гордый отказ.",
  category: "diplo",
  choices: [
    choice("apology", "Официальные извинения", "Bios −3 (дары), лояльность +1, cognitio +2.", [
      spend(C.bios, 3),
      loyalty(1),
      gain(C.cognitio, 2),
    ]),
    choice("extradite", "Выдать офицера", "Лояльность армии −5, bios +2 (закрыли дело).", [
      loyalty(-5),
      gain(C.bios, 2),
    ]),
    choice("defiant", "Гордый отказ", "Лояльность +3, cognitio −2 (напряжение).", [
      loyalty(3),
      spend(C.cognitio, 2),
    ]),
  ],
});

add({
  id: "yq.diplo_2",
  name: "Просьба о посредничестве",
  summary: "Две державы просят вас рассудить спор о коридоре.",
  detail: "Посредничать дорого, отказаться — упустить влияние, встать на сторону — риск.",
  category: "diplo",
  filterBy: { minEra: 1 },
  choices: [
    choice("mediate", "Стать посредником", "Cognitio −3, bios −2, лояльность +2, cognitio +5 влиянием.", [
      spend(C.cognitio, 3),
      spend(C.bios, 2),
      loyalty(2),
      gain(C.cognitio, 5),
    ]),
    choice("refuse", "Отказаться", "Без эффектов — упущенный шанс (лояльность 0).", []),
    gamble(
      "pick_side",
      "Встать на сторону",
      "Успех: bios +6 от благодарных. Провал: скандал (−лояльность).",
      11,
      [gain(C.bios, 6), loyalty(1)],
      [loyalty(-4), spend(C.cognitio, 2)],
    ),
  ],
});

add({
  id: "yq.diplo_3",
  name: "Утечка архивов",
  summary: "В сеть утекли фрагменты ваших дипломатических архивов.",
  detail: "Зачистка, отрицание или контролируемый слив дезы.",
  category: "diplo",
  choices: [
    choice("scrub", "Зачистить следы", "Cognitio −6, energia −2, лояльность +1.", [
      spend(C.cognitio, 6),
      spend(C.energia, 2),
      loyalty(1),
    ]),
    choice("deny", "Отрицать всё", "Лояльность −3, когда уличат сильнее.", [loyalty(-3)]),
    gamble(
      "dez",
      "Слить дезу",
      "Успех: cognitio +4. Провал: ещё больший скандал.",
      13,
      [gain(C.cognitio, 4), loyalty(1)],
      [loyalty(-6)],
    ),
  ],
});

add({
  id: "yq.diplo_4",
  name: "Визит делегации",
  summary: "Иностранная делегация просит аудиенцию и банкет.",
  detail: "Пышный приём, скромный стол или отказ.",
  category: "diplo",
  choices: [
    choice("banquet", "Пышный приём", "Bios −5, supply −2, лояльность +2, cognitio +3.", [
      spend(C.bios, 5),
      spend(C.supply, 2),
      loyalty(2),
      gain(C.cognitio, 3),
    ]),
    choice("modest", "Скромный стол", "Bios −2, лояльность +1.", [
      spend(C.bios, 2),
      loyalty(1),
    ]),
    choice("snub", "Отказать в визите", "Лояльность двора +1, cognitio −3 (обида соседей).", [
      loyalty(1),
      spend(C.cognitio, 3),
    ]),
  ],
});

add({
  id: "yq.diplo_5",
  name: "Срыв протокола",
  summary: "На переговорах нарушен протокол — стороны требуют сатисфакции.",
  detail: "Компенсация, отставка чиновника или жёсткая линия.",
  category: "diplo",
  filterBy: { minEra: 1 },
  choices: [
    choice("gift", "Компенсация дарами", "Materia −2, bios −4, лояльность +2.", [
      spend(C.materia, 2),
      spend(C.bios, 4),
      loyalty(2),
    ]),
    choice("fire", "Отставить чиновника", "Лояльность −2, cognitio +2 (порядок).", [
      loyalty(-2),
      gain(C.cognitio, 2),
    ]),
    choice("hardline", "Жёсткая линия", "Лояльность +3, bios −1 на охрану.", [
      loyalty(3),
      spend(C.bios, 1),
      spend(C.metal, 1),
    ]),
  ],
});

// ─── SCIENCE ──────────────────────────────────────────────
add({
  id: "yq.science_1",
  name: "Сбой лаборатории",
  summary: "В главной лаборатории сгорел контур — эксперименты встали.",
  detail: "Ремонт, консервация или опасный перезапуск.",
  category: "science",
  choices: [
    choice("repair", "Полный ремонт", "Materia −3, energia −5, cognitio +4, лояльность +1.", [
      spend(C.materia, 3),
      spend(C.energia, 5),
      gain(C.cognitio, 4),
      loyalty(1),
    ]),
    choice("mothball", "Законсервировать", "Cognitio −2 (простой), energia +2 сэкономлено.", [
      spend(C.cognitio, 2),
      gain(C.energia, 2),
    ]),
    gamble(
      "restart",
      "Перезапуск под нагрузкой",
      "Успех: cognitio +8. Провал: ещё один пожар.",
      12,
      [gain(C.cognitio, 8)],
      [spend(C.materia, 4), spend(C.energia, 4), loyalty(-2)],
    ),
  ],
});

add({
  id: "yq.science_2",
  name: "Прорыв гипотезы",
  summary: "Группа учёных клянётся, что на пороге прорыва — нужны ресурсы.",
  detail: "Финансировать, отклонить или дать минимум и надеяться.",
  category: "science",
  choices: [
    choice("fund", "Полное финансирование", "Cognitio −2 уже вложено… Bios −6, cognitio +10.", [
      spend(C.bios, 6),
      gain(C.cognitio, 10),
      loyalty(1),
    ]),
    choice("reject", "Отклонить", "Лояльность учёных −3.", [loyalty(-3)]),
    gamble(
      "seed",
      "Минимальный грант",
      "Успех: cognitio +6. Провал: деньги на ветер (bios −3).",
      11,
      [spend(C.bios, 3), gain(C.cognitio, 6)],
      [spend(C.bios, 3), loyalty(-1)],
    ),
  ],
});

add({
  id: "yq.science_3",
  name: "Утечка образцов",
  summary: "Биообразцы исчезли из карантинного блока.",
  detail: "Карантин, охота или замалчивание.",
  category: "science",
  filterBy: { minEra: 1 },
  choices: [
    choice("quarantine", "Жёсткий карантин", "Bios −3, supply −2, лояльность −1, cognitio +2.", [
      spend(C.bios, 3),
      spend(C.supply, 2),
      loyalty(-1),
      gain(C.cognitio, 2),
    ]),
    choice("hunt", "Охота за образцами", "Metal −2, cognitio +4.", [
      spend(C.metal, 2),
      gain(C.cognitio, 4),
    ]),
    choice("silence", "Замолчать", "Лояльность −5, когда всплывёт.", [loyalty(-5)]),
  ],
});

add({
  id: "yq.science_4",
  name: "Запрос экспедиции",
  summary: "Учёные просят снарядить экспедицию к аномалии.",
  detail: "Снарядить, отказать или послать зонд вместо людей.",
  category: "science",
  choices: [
    choice("launch", "Снарядить экспедицию", "Supply −4, energia −4, bios −3, cognitio +7.", [
      spend(C.supply, 4),
      spend(C.energia, 4),
      spend(C.bios, 3),
      gain(C.cognitio, 7),
      loyalty(2),
    ]),
    choice("deny", "Отказать", "Лояльность −2.", [loyalty(-2)]),
    choice("drone", "Только зонды", "Energia −3, cognitio +3.", [
      spend(C.energia, 3),
      gain(C.cognitio, 3),
    ]),
  ],
});

add({
  id: "yq.science_5",
  name: "Конкурирующий патент",
  summary: "Соседи регистрируют патент на технологию, близкую к вашей.",
  detail: "Выкупить, оспорить или украсть наработки.",
  category: "science",
  filterBy: { minEra: 1 },
  choices: [
    choice("buy", "Выкупить патент", "Bios −10, cognitio +5.", [
      spend(C.bios, 10),
      gain(C.cognitio, 5),
    ]),
    choice("challenge", "Оспорить в суде", "Cognitio −5, bios −2.", [
      spend(C.cognitio, 5),
      spend(C.bios, 2),
      loyalty(1),
    ]),
    gamble(
      "steal",
      "Промышленный шпионаж",
      "Успех: cognitio +9. Провал: скандал.",
      14,
      [gain(C.cognitio, 9)],
      [loyalty(-5), spend(C.cognitio, 3)],
    ),
  ],
});

// ─── MILITARY ─────────────────────────────────────────────
add({
  id: "yq.military_1",
  name: "Учения на границе",
  summary: "Генштаб предлагает крупные учения у спорной границы.",
  detail: "Провести, урезать или отменить под давлением дипломатов.",
  category: "military",
  filterBy: { minEra: 1 },
  choices: [
    choice("full", "Полные учения", "Metal −4, supply −3, energia −3, лояльность +3, cognitio +2.", [
      spend(C.metal, 4),
      spend(C.supply, 3),
      spend(C.energia, 3),
      loyalty(3),
      gain(C.cognitio, 2),
    ]),
    choice("lite", "Урезанные манёвры", "Metal −2, лояльность +1.", [
      spend(C.metal, 2),
      loyalty(1),
    ]),
    choice("cancel", "Отменить", "Лояльность армии −3, bios +2 (экономия).", [
      loyalty(-3),
      gain(C.bios, 2),
    ]),
  ],
});

add({
  id: "yq.military_2",
  name: "Дезертирство",
  summary: "С линии фронта / гарнизона бегут солдаты.",
  detail: "Амнистия, трибунал или облавы.",
  category: "military",
  choices: [
    choice("amnesty", "Амнистия и пайки", "Bios −4, лояльность +4.", [
      spend(C.bios, 4),
      loyalty(4),
    ]),
    choice("tribunal", "Показательный трибунал", "Лояльность −4, metal +1 конфискат.", [
      loyalty(-4),
      gain(C.metal, 1),
    ]),
    choice("roundup", "Облавы", "Metal −2, supply −1, лояльность −2, extracta +1 труд.", [
      spend(C.metal, 2),
      spend(C.supply, 1),
      loyalty(-2),
      gain(C.extracta, 1),
    ]),
  ],
});

add({
  id: "yq.military_3",
  name: "Запрос подкреплений",
  summary: "Командир на окраине требует срочных подкреплений.",
  detail: "Послать, отказать или ограничиться снабжением.",
  category: "military",
  filterBy: { borderWithWar: true },
  neutral: false,
  choices: [
    choice("send", "Послать силы", "Metal −5, supply −3, bios −2, лояльность +4.", [
      spend(C.metal, 5),
      spend(C.supply, 3),
      spend(C.bios, 2),
      loyalty(4),
    ]),
    choice("deny", "Отказать", "Лояльность −5.", [loyalty(-5)]),
    choice("supply_only", "Только снабжение", "Supply −4, лояльность +1.", [
      spend(C.supply, 4),
      loyalty(1),
    ]),
  ],
});

add({
  id: "yq.military_4",
  name: "Потеря патруля",
  summary: "Патруль не вышел на связь — сектор «серый».",
  detail: "Поиски, списание или рискованная вылазка.",
  category: "military",
  choices: [
    choice("search", "Поисковая операция", "Energia −4, metal −2, supply −2, лояльность +2.", [
      spend(C.energia, 4),
      spend(C.metal, 2),
      spend(C.supply, 2),
      loyalty(2),
      gain(C.cognitio, 2),
    ]),
    choice("writeoff", "Списать состав", "Лояльность −4, metal −3 потеря техники.", [
      loyalty(-4),
      spend(C.metal, 3),
    ]),
    gamble(
      "raid",
      "Вылазка наудачу",
      "Успех: спасли и трофеи. Провал: ещё потери.",
      12,
      [gain(C.metal, 3), loyalty(3)],
      [spend(C.metal, 4), spend(C.bios, 2), loyalty(-2)],
    ),
  ],
});

add({
  id: "yq.military_5",
  name: "Мобилизация резерва",
  summary: "Штаб предлагает частичную мобилизацию резервистов.",
  detail: "Мобилизовать, ограничить или отложить.",
  category: "military",
  filterBy: { minEra: 1 },
  choices: [
    choice("mobilize", "Частичная мобилизация", "Bios −5, supply −3, metal +2, лояльность −2, industria −1.", [
      spend(C.bios, 5),
      spend(C.supply, 3),
      gain(C.metal, 2),
      loyalty(-2),
      spend(C.industria, 1),
    ]),
    choice("limited", "Только специалисты", "Cognitio −2, metal +1, лояльность −1.", [
      spend(C.cognitio, 2),
      gain(C.metal, 1),
      loyalty(-1),
    ]),
    choice("delay", "Отложить", "Лояльность штаба −2.", [loyalty(-2)]),
  ],
});

// ─── MIGRATION ────────────────────────────────────────────
add({
  id: "yq.migration_1",
  name: "Волна беженцев",
  summary: "К границам идут колонны беженцев с соседнего театра.",
  detail: "Принять, квоты или закрыть врата.",
  category: "migration",
  choices: [
    choice("accept", "Принять и расселить", "Bios −6, supply −4, лояльность +3, industria +1 труд.", [
      spend(C.bios, 6),
      spend(C.supply, 4),
      loyalty(3),
      gain(C.industria, 1),
    ]),
    choice("quota", "Жёсткие квоты", "Bios −2, лояльность −1, cognitio +1.", [
      spend(C.bios, 2),
      loyalty(-1),
      gain(C.cognitio, 1),
    ]),
    choice("seal", "Закрыть врата", "Лояльность −4, metal −1 на блокпосты, bios +2 (не тратим).", [
      loyalty(-4),
      spend(C.metal, 1),
      gain(C.bios, 2),
    ]),
  ],
});

add({
  id: "yq.migration_2",
  name: "Исход колонистов",
  summary: "С окраинной колонии уезжают лучшие специалисты.",
  detail: "Удержать льготами, отпустить или запретить выезд.",
  category: "migration",
  filterBy: { minEra: 1 },
  choices: [
    choice("retain", "Льготы и жильё", "Bios −5, materia −2, лояльность +4, cognitio +2.", [
      spend(C.bios, 5),
      spend(C.materia, 2),
      loyalty(4),
      gain(C.cognitio, 2),
    ]),
    choice("letgo", "Отпустить с миром", "Лояльность −2, bios +1 экономия.", [
      loyalty(-2),
      gain(C.bios, 1),
    ]),
    choice("forbid", "Запрет выезда", "Лояльность −6, extracta +2 (остались рабочие).", [
      loyalty(-6),
      gain(C.extracta, 2),
    ]),
  ],
});

add({
  id: "yq.migration_3",
  name: "Трудовой транзит",
  summary: "Корпорации просят открыть коридор сезонных рабочих.",
  detail: "Открыть, обложить или запретить.",
  category: "migration",
  choices: [
    choice("open", "Открыть коридор", "Supply −2, industria +3, лояльность +1.", [
      spend(C.supply, 2),
      gain(C.industria, 3),
      loyalty(1),
    ]),
    choice("tax", "Налог на транзит", "Bios +5, лояльность −1.", [
      gain(C.bios, 5),
      loyalty(-1),
    ]),
    choice("ban", "Запретить", "Лояльность корпораций −3.", [loyalty(-3)]),
  ],
});

add({
  id: "yq.migration_4",
  name: "Переселение клана",
  summary: "Крупный клан просит землю и статус под вашим флагом.",
  detail: "Дать землю, отказать или принять как вассалов с риском.",
  category: "migration",
  filterBy: { minEra: 1 },
  choices: [
    choice("land", "Выделить земли", "Supply −3, bios −3, лояльность +5, extracta +2.", [
      spend(C.supply, 3),
      spend(C.bios, 3),
      loyalty(5),
      gain(C.extracta, 2),
    ]),
    choice("refuse", "Отказать", "Лояльность −2.", [loyalty(-2)]),
    gamble(
      "vassal",
      "Вассальный договор",
      "Успех: metal +4 дань. Провал: внутренний конфликт.",
      12,
      [gain(C.metal, 4), loyalty(2)],
      [loyalty(-5), spend(C.bios, 2)],
    ),
  ],
});

add({
  id: "yq.migration_5",
  name: "Карантинный коридор",
  summary: "Беженцы идут через зону с подозрением на заразу.",
  detail: "Карантин, быстрый пропуск или сожжение лагеря (жёстко).",
  category: "migration",
  choices: [
    choice("quarantine", "Карантинные лагеря", "Bios −4, supply −3, лояльность +2.", [
      spend(C.bios, 4),
      spend(C.supply, 3),
      loyalty(2),
      gain(C.cognitio, 1),
    ]),
    choice("fast", "Быстрый пропуск", "Лояльность +1, риск (−cognitio медконтроль).", [
      loyalty(1),
      spend(C.cognitio, 1),
    ]),
    choice("burn", "Сжечь лагерь", "Лояльность −8, metal −1.", [
      loyalty(-8),
      spend(C.metal, 1),
    ]),
  ],
});

// ─── EPIDEMIC ─────────────────────────────────────────────
add({
  id: "yq.epidemic_1",
  name: "Вспышка лихорадки",
  summary: "В портовом мире вспыхнула лихорадка.",
  detail: "Лечение, изоляция или игнор «сезонной хвори».",
  category: "epidemic",
  choices: [
    choice("treat", "Массовое лечение", "Bios −5, supply −2, лояльность +5.", [
      spend(C.bios, 5),
      spend(C.supply, 2),
      loyalty(5),
    ]),
    choice("isolate", "Изоляция кварталов", "Energia −3, лояльность −2, cognitio +2.", [
      spend(C.energia, 3),
      loyalty(-2),
      gain(C.cognitio, 2),
    ]),
    choice("ignore", "«Сезонная хворь»", "Лояльность −6.", [loyalty(-6)]),
  ],
});

add({
  id: "yq.epidemic_2",
  name: "Карантинный спор",
  summary: "Губернаторы спорят: закрывать ли всю систему.",
  detail: "Полный карантин, частичный или открытые врата.",
  category: "epidemic",
  choices: [
    choice("full", "Полный карантин", "Bios −3, supply −4, energia −2, лояльность −1, cognitio +3.", [
      spend(C.bios, 3),
      spend(C.supply, 4),
      spend(C.energia, 2),
      loyalty(-1),
      gain(C.cognitio, 3),
    ]),
    choice("partial", "Частичный", "Supply −2, лояльность +1.", [
      spend(C.supply, 2),
      loyalty(1),
    ]),
    choice("open", "Врата открыты", "Bios +2 торговля, лояльность −4.", [
      gain(C.bios, 2),
      loyalty(-4),
    ]),
  ],
});

add({
  id: "yq.epidemic_3",
  name: "Заражённый груз",
  summary: "На таможне нашли контейнер с заражённой органикой.",
  detail: "Уничтожить, изучить или «accidentally» продать дальше.",
  category: "epidemic",
  filterBy: { minEra: 1 },
  choices: [
    choice("burn", "Уничтожить груз", "Supply −3, лояльность +2.", [
      spend(C.supply, 3),
      loyalty(2),
    ]),
    choice("lab", "В лабораторию", "Cognitio +5, bios −2 на охрану, лояльность −1.", [
      gain(C.cognitio, 5),
      spend(C.bios, 2),
      loyalty(-1),
    ]),
    gamble(
      "resell",
      "Сбыть тихий груз",
      "Успех: bios +7. Провал: эпидемия и скандал.",
      15,
      [gain(C.bios, 7)],
      [loyalty(-8), spend(C.bios, 4)],
    ),
  ],
});

add({
  id: "yq.epidemic_4",
  name: "Эпидемия на станции",
  summary: "Орбитальная станция закрыта — экипаж болеет.",
  detail: "Медбригада, эвакуация или герметизация.",
  category: "epidemic",
  choices: [
    choice("medics", "Медбригада", "Bios −4, materia −1, лояльность +4.", [
      spend(C.bios, 4),
      spend(C.materia, 1),
      loyalty(4),
    ]),
    choice("evac", "Эвакуация", "Energia −4, supply −2, лояльность +2.", [
      spend(C.energia, 4),
      spend(C.supply, 2),
      loyalty(2),
    ]),
    choice("seal", "Герметизация", "Лояльность −5, industria −1 (станция мертва).", [
      loyalty(-5),
      spend(C.industria, 1),
    ]),
  ],
});

add({
  id: "yq.epidemic_5",
  name: "Паника в колонии",
  summary: "Слухи о чуме вызвали панику — ещё до подтверждения диагноза.",
  detail: "Успокоить фактами, ввести военное положение или усилить слух.",
  category: "epidemic",
  choices: [
    choice("facts", "Брифинг и факты", "Cognitio −3, energia −1, лояльность +3.", [
      spend(C.cognitio, 3),
      spend(C.energia, 1),
      loyalty(3),
    ]),
    choice("martial", "Военное положение", "Metal −2, лояльность −3, supply +1 порядок.", [
      spend(C.metal, 2),
      loyalty(-3),
      gain(C.supply, 1),
    ]),
    choice("stoke", "Подогреть слух", "Лояльность −4, bios +3 на спекуляции складов.", [
      loyalty(-4),
      gain(C.bios, 3),
    ]),
  ],
});

// ─── NEUTRAL filler ───────────────────────────────────────
for (let i = 1; i <= 5; i++) {
  const variants = [
    {
      name: "Случай на рубеже: потерянный груз",
      summary: "На рубеже нашли бесхозный контейнер без пломб.",
      choices: [
        choice("claim", "Присвоить казне", "Bios +4, лояльность −1.", [
          gain(C.bios, 4),
          loyalty(-1),
        ]),
        choice("return", "Вернуть владельцу", "Лояльность +3.", [loyalty(3)]),
        gamble(
          "open",
          "Вскрыть на месте",
          "Успех: materia +3. Провал: ловушка (−bios).",
          11,
          [gain(C.materia, 3)],
          [spend(C.bios, 2), loyalty(-1)],
        ),
      ],
    },
    {
      name: "Случай на рубеже: странный курьер",
      summary: "Курьер без документов просит пропуск «по срочному делу».",
      choices: [
        choice("pass", "Пропустить", "Cognitio +2, лояльность −1 у пограничников.", [
          gain(C.cognitio, 2),
          loyalty(-1),
        ]),
        choice("hold", "Задержать", "Metal −1, cognitio +3.", [
          spend(C.metal, 1),
          gain(C.cognitio, 3),
        ]),
        choice("bribe", "Взять «пошлину»", "Bios +3, лояльность −2.", [
          gain(C.bios, 3),
          loyalty(-2),
        ]),
      ],
    },
    {
      name: "Случай на рубеже: обвал шахты",
      summary: "Небольшая шахта обвалилась — семьи ждут решения.",
      choices: [
        choice("rescue", "Спасательная операция", "Bios −3, energia −2, лояльность +4.", [
          spend(C.bios, 3),
          spend(C.energia, 2),
          loyalty(4),
        ]),
        choice("seal", "Запечатать шахту", "Extracta −2, лояльность −3.", [
          spend(C.extracta, 2),
          loyalty(-3),
        ]),
        choice("comp", "Компенсации семьям", "Bios −4, лояльность +2.", [
          spend(C.bios, 4),
          loyalty(2),
        ]),
      ],
    },
    {
      name: "Случай на рубеже: праздник цеха",
      summary: "Цех просит разрешить праздник и паёк сверхурочно.",
      choices: [
        choice("fund", "Оплатить праздник", "Bios −3, supply −1, лояльность +3, industria +1.", [
          spend(C.bios, 3),
          spend(C.supply, 1),
          loyalty(3),
          gain(C.industria, 1),
        ]),
        choice("deny", "Отказать", "Лояльность −2.", [loyalty(-2)]),
        choice("half", "Полпайка", "Bios −1, лояльность +1.", [
          spend(C.bios, 1),
          loyalty(1),
        ]),
      ],
    },
    {
      name: "Случай на рубеже: ложный маяк",
      summary: "Навигаторы спорят: маяк врёт или это помехи.",
      choices: [
        choice("fix", "Починить маяк", "Energia −3, materia −1, лояльность +2.", [
          spend(C.energia, 3),
          spend(C.materia, 1),
          loyalty(2),
        ]),
        choice("ignore", "Игнорировать", "Supply −2 (срывы маршрутов).", [
          spend(C.supply, 2),
        ]),
        gamble(
          "trust",
          "Довериться старым картам",
          "Успех: без потерь +cognitio. Провал: потеря конвоя.",
          12,
          [gain(C.cognitio, 2)],
          [spend(C.supply, 4), loyalty(-1)],
        ),
      ],
    },
  ];
  const v = variants[i - 1];
  add({
    id: `yq.neutral_${i}`,
    name: v.name,
    summary: v.summary,
    detail: "Универсальный рубежный случай. Три разных цены за спокойствие.",
    category: "neutral",
    choices: v.choices,
    neutral: true,
  });
}

// ─── ALCHEMY bridges (keep recipe grants) ─────────────────
add({
  id: "yq.alchemy_archive",
  name: "Чертежи из архива",
  summary: "В старом архиве нашли протокол синтеза технологий.",
  detail:
    "Можно вложить cognitio и получить рецепт «Гео-материалы», продать посредникам или отложить.",
  category: "science",
  choices: [
    choice(
      "study",
      "Изучить протокол",
      "Cognitio −8 → рецепт live_geo_materials.",
      [spend(C.cognitio, 8), recipe("recipe.live_geo_materials"), loyalty(1)],
    ),
    choice("sell", "Продать посредникам", "Cognitio +6, рецепт не получить.", [
      gain(C.cognitio, 6),
    ]),
    choice("wait", "Отложить", "Без эффекта — окно может закрыться.", []),
  ],
});

add({
  id: "yq.alchemy_field_notes",
  name: "Полевые заметки лаборатории",
  summary: "Полевой отряд привёз записи о связке энергосети и теплиц.",
  detail: "Каталогизация даёт рецепт Энерго-теплицы; можно продать или игнор.",
  category: "science",
  choices: [
    choice("catalog", "Каталогизировать", "Рецепт live_grid_hydro, лояльность +2.", [
      recipe("recipe.live_grid_hydro"),
      loyalty(2),
    ]),
    choice("sell", "Продать записи", "Bios +5.", [gain(C.bios, 5)]),
    choice("ignore", "Игнорировать", "Без эффекта.", []),
  ],
});

// Strip internal hints if any
for (const q of Object.values(catalog)) {
  for (const c of q.choices) {
    for (const e of c.effects || []) delete e._turnsHint;
    for (const e of c.onSuccess || []) delete e._turnsHint;
    for (const e of c.onFail || []) delete e._turnsHint;
  }
}

writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
const n = Object.keys(catalog).length;
const withDice = Object.values(catalog).filter((q) =>
  q.choices.some((c) => c.diceRequired?.length),
).length;
console.log(`Wrote ${n} yearly quests → ${OUT}`);
console.log(`With dice branch: ${withDice}`);
