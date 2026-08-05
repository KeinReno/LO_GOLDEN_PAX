/**
 * Seed Imperial Belator quests from 02_История (canon + chat context).
 * Run: node GMap/scripts/seedBelatorQuests.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA = path.join(import.meta.dirname, "..", "data");
const FILES = ["published.json", "campaign-draft.json"];

const FACTION = "faction_belator";
const QUEST_SOURCE_NPC = {
  q_bel_north_queen: "npc_bel_ksi_tarra",
  q_bel_federation_rule: "npc_bel_miron_kostrov",
  q_bel_turon_truce: "npc_bel_sekvilon",
  q_bel_genome_lucius: "npc_bel_astra",
  q_bel_balsagon_audience: "npc_bel_astra",
  q_bel_rhythm_horn: "npc_bel_grivs",
  q_bel_tornklif_daya: "npc_bel_daya_china",
  q_bel_amalfeya_gate: "npc_bel_harn",
  q_bel_thought_virus: "npc_bel_sancho",
  q_bel_fratricide_witness: "npc_bel_grivs",
  q_bel_astra_package: "npc_bel_astra",
};
const SYS = {
  solis: "2fd393cd-bee8-4f84-ab82-6aad30ef33cd",
  alioth: "2a366adf-20d1-439b-b2bf-d78fd0800c19",
  balsagon: "9bc829de-0b51-4ad3-ae53-7aea352efc24",
  elegantia: "c6eda3fe-2227-4015-ae2b-f791c6d8ceaa",
  fedNorth: "46696198-f78f-4048-9add-55cdc99fc307",
};

function canonMsg(turn, body) {
  return {
    at: new Date().toISOString(),
    turn,
    kind: "message",
    authorName: "Канон",
    body,
  };
}

function q(partial, turn) {
  const systemId = partial.systemId ?? partial.sourceSystemId ?? null;
  return {
    id: partial.id ?? randomUUID(),
    name: partial.name,
    summary: partial.summary,
    detail: partial.detail ?? "",
    systemId,
    status: "active",
    type: partial.type ?? "side",
    history: partial.history ?? [canonMsg(turn, partial.canonNote ?? partial.summary)],
    sourceNpcId: partial.sourceNpcId ?? null,
    sourceFactionId: FACTION,
    sourceSystemId: partial.sourceSystemId ?? systemId,
    expiresTurn: partial.expiresTurn ?? null,
    catalogId: null,
    choices: partial.choices,
    arc: partial.arc,
    diceRequired: partial.diceRequired,
  };
}

function buildQuests(turn) {
  return [
    q(
      {
        id: "q_bel_north_queen",
        name: "Северная Королева",
        type: "main",
        systemId: SYS.fedNorth,
        sourceSystemId: SYS.fedNorth,
        summary:
          "Автономный Рой на федеральном направлении: пять систем, флот уничтожен. Королева идёт за пищей и новым генокодом — чует «странность» в империи.",
        detail:
          "Канон: II.07, II.22.\nНе ОР и не машинная сетка. Учится обходить укрепления. Контакт с Кси'Таррой. Ликвидация — личная задача Луция; стандарт против ОР слаб.",
        canonNote: "Открытый узел «Северная Королева» (II.22).",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_federation_rule",
        name: "Федерация под управой",
        type: "main",
        systemId: SYS.elegantia,
        sourceSystemId: SYS.solis,
        summary:
          "Жёсткое военное управление на федеральном направлении: коридор Элегантия → Калис-9, КТО, информработа, ротации полков.",
        detail:
          "Канон: III.00.\n17 задержаний за сутки; комендант Калис-9 просил гуманитарный коридор. Портал под ПРО и свежими силами; лидеров ячеек — живьём на раскрутку.",
        canonNote: "Эпизод III.00 закрыт; коридор и КТО в исполнении.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_turon_truce",
        name: "Перемирие и наследник Туранмала",
        type: "faction",
        systemId: SYS.alioth,
        sourceSystemId: SYS.solis,
        summary:
          "Секвилон в столице: срок перемирия, суд над Тормундом, решение наследника за три дня. Гостям — постой у космопорта под караулом от мстителей.",
        detail:
          "Канон: II.10, II.22; чат 02_История.\nДо совершеннолетия наследник под протекцией; иначе кровная месть и традиции кланов. Запрос: полная картина с севера — материалы на изучение.",
        canonNote:
          "Чат: представитель даёт наследнику три дня; Император обеспечивает безопасность гостей у космопорта.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_genome_lucius",
        name: "Геном императора",
        type: "faction",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "Тройной контур (Норбурия, Лорды Праха, Щит Сула): анализ «пустой», но организм меняется. Самосканирование и запись для специалистов; риск интереса Северной Королевы.",
        detail:
          "Канон: II.16; чат.\nНовая ветка экспрессии после войны с Балсагоном. Гипотеза: маскировка генофона или эволюционный ответ на псионическое сращение. Соляриевые чернила на спине — след в клеточной памяти.",
        canonNote:
          "Чат: после документов — совещание с Астрой; попытка прочувствовать клетки и задокументировать.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_balsagon_audience",
        name: "Аудиенция балсагонского правительства",
        type: "faction",
        systemId: SYS.balsagon,
        sourceSystemId: SYS.solis,
        summary:
          "Новое имперское правительство протектората просит аудиенцию. Астра изучает мрачный доклад делегации — за окном поминальный перезвон.",
        detail:
          "Канон: III.02; чат (тронный зал).\nОчередь приёма: после Гривса — балсагонская администрация. Дая-Чина у окна; тишина в зале.",
        canonNote: "Чат: совещание в тронном зале, доклад из Балсагона.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_rhythm_horn",
        name: "Ритм-Горн",
        type: "faction",
        systemId: SYS.balsagon,
        sourceSystemId: SYS.balsagon,
        summary:
          "Гривс Айдалинский: промышленный узел Т11 в поясе Балсагона. Запуск под ТИБ и «Звёздной Кузницей» — ускорение ремонта флота.",
        detail:
          "Канон: III.03.\nНе «Кузница» ОР. Риск: утечка к частникам или повторное поглощение residual. Условие: Сула-Код, Лорды на первой вахте.",
        canonNote: "Аудиенция Гривса — в ходе; решение Императора по рамке запуска.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_tornklif_daya",
        name: "Торнклиф и регент",
        type: "faction",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "Реконструкция Торнклифа с Дая-Чиной; молодёжь требует отставки правительства. Усилить охрану регента, шаттл в резерве.",
        detail:
          "Канон: III.02.\nДая-Чина — щит воли Императора; протесты = против имперской власти. Параллельно — подготовка визита на Торнклиф.",
        canonNote: "Чат: совещание с Астрой и Дая-Чиной по реконструкции Торнклифа.",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_amalfeya_gate",
        name: "Амальфея у ворот",
        type: "side",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "Харн ждёт у столицы; сделка (титан ↔ карты и провиант) отсрочена. Астра готовит внешний контур титана без резерва флота.",
        detail:
          "Канон: II.22, III.03.\nКаналы: Секвилон/репарации, Ханство, северные порты, Гничи. Визит на Амальфею — отложен, но состоится.",
        canonNote: "Открытый узел «Амальфея» (II.22).",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_thought_virus",
        name: "Мыслевирус ОР",
        type: "faction",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "Разработка контрмер; пси-корпус изучает останки Верещагина. Записка с признаками ушла союзникам — утечка опасна.",
        detail:
          "Канон: II.22, III.01.\n«Тихий носитель» в Совете; рамки проверки vs комиссия Вольфа и имя Верещагина на допросе.",
        canonNote: "Открытый узел «Мыслевирус ОР» (II.22).",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_fratricide_witness",
        name: "Свидетель братоубийства",
        type: "side",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "След сужен; ТИБ и Лорды Праха на торговых постах. Посредник исчез — печать третьей стороны, не Туранмал.",
        detail: "Канон: II.22, III.01 (узел «Печать третьей стороны»).",
        canonNote: "Открытый узел №10 (II.22).",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_et_gilmir",
        name: "Флот Эт Гильмир Сахале",
        type: "side",
        systemId: SYS.fedNorth,
        sourceSystemId: SYS.fedNorth,
        summary:
          "Странный флот золотой луны на севере бьёт Роя; контакт не установлен, помощь продолжается без поводка.",
        detail: "Канон: II.08, II.22.",
        canonNote: "Открытый узел «Флот Эт Гильмир» (II.22).",
      },
      turn,
    ),
    q(
      {
        id: "q_bel_astra_package",
        name: "Пакет выживания Астры",
        type: "faction",
        systemId: SYS.solis,
        sourceSystemId: SYS.solis,
        summary:
          "Печати на радикальный экономический пакет; ротации правительств; «хозяйственный час» с домами и верфями.",
        detail:
          "Канон: III.02.\nЗолотой Банк, Звёздная Кузница, консорциум снабжения, Тихий Огонь, порты дамильских врат — очередь аудиенций.",
        canonNote: "III.02: пакет одобрен, порядок приёма зафиксирован.",
      },
      turn,
    ),
  ].map((quest) => ({
    ...quest,
    sourceNpcId: QUEST_SOURCE_NPC[quest.id] ?? quest.sourceNpcId ?? null,
  }));
}

for (const name of FILES) {
  const filePath = path.join(DATA, name);
  const world = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const turn = world.meta?.turn ?? 15;
  const existing = world.quests?.length ?? 0;
  if (existing > 0) {
    console.warn(`${name}: already has ${existing} quests — replacing all with Belator set`);
  }
  world.quests = buildQuests(turn);
  world.meta.updatedAt = new Date().toISOString();
  if (typeof world.meta.tableRevision === "number") {
    world.meta.tableRevision += 1;
  }
  fs.writeFileSync(filePath, JSON.stringify(world, null, 2) + "\n", "utf8");
  console.log(`${name}: ${world.quests.length} quests for ${FACTION} (turn ${turn})`);
}
