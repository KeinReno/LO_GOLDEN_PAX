/**
 * Belator court NPCs (02_История / II.23) + quest sourceNpcId links.
 * Run: node GMap/scripts/applyBelatorCourtNpcs.mjs
 * For draft→approve flow (no direct publish), use proposeCourtNpc.mjs instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FACTION_ID = "faction_belator";
const TARGETS = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

const LOC = {
  solis: {
    locationSystemId: "2fd393cd-bee8-4f84-ab82-6aad30ef33cd",
    locationSystemName: "Солис",
    locationPlanetName: "Домус Солис",
  },
  alioth: {
    locationSystemId: "2a366adf-20d1-439b-b2bf-d78fd0800c19",
    locationSystemName: "Алиот",
  },
};

const NPCS = [
  {
    id: "npc_bel_lucius_solar",
    name: "Луций Солар",
    title: "Император Белатора",
    role: "ruler",
    status: "active",
    publicNotes:
      "Персонаж игрока. Трон совета закреплён за Императором; советники и наместники — вокруг него.",
    gmNotes: "PC / isPlayerRuler. Не снимать с seat.ruler. Канон II–III.",
    tags: ["Император", "Солар"],
    traitIds: [],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: "seat.ruler",
    isPlayerRuler: true,
    blocId: null,
    ...LOC.solis,
  },
  {
    id: "npc_bel_astra",
    name: "Астра Солар (Кронхаймер)",
    title: "Императрица · гражданский наблюдатель ТИБ",
    role: "strategist",
    status: "active",
    publicNotes:
      "Гуманитарный контур, пакеты выживания, очередь аудиенций. Просит беречь Луция как человека.",
    gmNotes: "Канон II.23, III.02. Ждёт свадьбы.",
    tags: ["ТИБ", "гуманитария"],
    traitIds: ["npc_trait.humanitarian"],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: "seat.strategist",
    blocId: "bloc.boreal",
    isBlocLeader: true,
    raceLeadership: { raceId: "race_boreal", title: "Голос Бореала" },
    ...LOC.solis,
  },
  {
    id: "npc_bel_daya_china",
    name: "Дая-Чина",
    title: "Матриарх-Диктатор Норбурии · регент Торнклифа",
    role: "strategist",
    status: "active",
    publicNotes:
      "Племянница Императора. Реконструкция Торнклифа; усиленная охрана регента. Не на троне — у стола как советник при необходимости.",
    gmNotes: "Единственная (с Луцием), кто знает о Госте. Против титана Амальфее. II.23. Трон = Луций.",
    tags: ["Норбурия", "Торнклиф"],
    traitIds: ["npc_trait.regent_builder"],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: null,
    blocId: "bloc.norburia",
    isBlocLeader: true,
    raceLeadership: { raceId: "race_horn_narburi", title: "Матриарх Норбурии" },
    ...LOC.solis,
  },
  {
    id: "npc_bel_sai",
    name: "Сай (Раихим) Солис",
    title: "Племянник старого Корвуда · псионик",
    role: "agent",
    status: "active",
    publicNotes:
      "Вырос в Белаторе. Организовал оборону на площади. Знает правду о происхождении; хочет остаться.",
    gmNotes: "Секретный контур с Астрой и Лордами Праха. II.11, III.01 🔒.",
    tags: ["псионика", "наследие Турона"],
    traitIds: ["npc_trait.psion_agent"],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: "seat.agent",
    blocId: "bloc.lords_dust",
    ...LOC.solis,
  },
  {
    id: "npc_bel_tanet",
    name: "Танет",
    title: "Бывшая глава Элегантии · верховная жрица (погибла)",
    role: "priest",
    status: "dead",
    publicNotes:
      "Правила Домом Элегантия и каноном. Престол дома и место жреца — вакантны.",
    gmNotes: "Канон: умерла. Лидерство Элегантии vacant.",
    tags: ["Церковь Сула", "Элегантия"],
    traitIds: ["npc_trait.high_priest"],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: null,
    blocId: "bloc.elegantia",
    isBlocLeader: false,
    ...LOC.solis,
  },
  {
    id: "npc_bel_radimon_matriarch",
    name: "Матриарх Рэдимона",
    title: "Глава Дома Рэдимон",
    role: "strategist",
    status: "active",
    publicNotes:
      "Матриархат клинка. Поправляется после ранений; узел влияния в луннарской бюрократии.",
    gmNotes: "III.02: без смены. Имя личное — уточнить в каноне.",
    tags: ["Рэдимон", "матриархат"],
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: null,
    blocId: "bloc.radimon",
    isBlocLeader: true,
    raceLeadership: { raceId: "race_radimon", title: "Матриарх" },
    ...LOC.solis,
  },
  {
    id: "npc_bel_miron_kostrov",
    name: "Мирон Костров",
    title: "Атаман · военное управление Федерацией",
    role: "strategist",
    status: "active",
    publicNotes:
      "Доклады по жёсткой управе на федеральном направлении, коридоры, КТО.",
    gmNotes: "III.00–III.01.",
    tags: ["Федерация", "ТИБ"],
    blocId: "bloc.radimon",
    posting: { kind: "court", sinceTurn: 0 },
    councilSeat: "seat.warlord",
    ...LOC.solis,
  },
  {
    id: "npc_bel_grivs",
    name: "Гривс Айдалинский",
    title: "Лорды Праха",
    role: "agent",
    status: "active",
    publicNotes:
      "Редко поднимается ко двору. Ритм-Горн, следы братоубийства, провинции Балсагона.",
    gmNotes: "III.03: аудиенция по Ритм-Горну.",
    tags: ["Лорды Праха", "Балсагон"],
    blocId: "bloc.lords_dust",
    isBlocLeader: true,
    locationSystemId: "9bc829de-0b51-4ad3-ae53-7aea352efc24",
    locationSystemName: "Балсагон",
  },
  {
    id: "npc_bel_drazhko",
    name: "Дражко",
    title: "Воевода · герой «Горного Венца»",
    role: "strategist",
    status: "active",
    publicNotes: "Казаки и легионеры; удержал хребет на Алиоте. Наместник Алиота.",
    gmNotes: "II.09.",
    tags: ["Алиот", "легионы"],
    traitIds: ["npc_trait.warlord"],
    posting: {
      kind: "governor",
      systemId: "2a366adf-20d1-439b-b2bf-d78fd0800c19",
      sinceTurn: 0,
    },
    councilSeat: null,
    blocId: "bloc.radimon",
    ...LOC.alioth,
  },
  {
    id: "npc_bel_sancho",
    name: "Санчос Карволло Де Гюдон",
    title: "Синтетик · Орден Защиты Разума",
    role: "architect",
    status: "active",
    publicNotes:
      "350+ лет; лаборатория, график псайкера. Спас колыбель Кси'Тарры.",
    gmNotes: "II.15. Загадки пути — открытый узел.",
    tags: ["лаборатория", "союзник"],
    councilSeat: "seat.architect",
    blocId: "bloc.guest",
    ...LOC.solis,
  },
  {
    id: "npc_bel_ksi_tarra",
    name: "Кси'Тарра",
    title: "Королева роя (союзная) · свита Императора",
    role: "other",
    status: "active",
    publicNotes:
      "В имперской свите у Луция. Южные рубежи; мало пищи. Предупреждает о Северной Королеве.",
    gmNotes: "Союзная, не ОР. Контакт с Северной Королевой псионически. II.23.",
    tags: ["Рой", "союзник", "север"],
    blocId: "bloc.guest",
    ...LOC.solis,
  },
  {
    id: "npc_bel_sekvilon",
    name: "Секвилон Харул",
    title: "Представитель Совета Турона",
    role: "other",
    status: "active",
    publicNotes:
      "Перемирие, наследник Туранмала, обмен пленными. Гость у космопорта под караулом.",
    gmNotes: "II.10. Трубка, имплант глаза, белый волк на наплечниках.",
    tags: ["Турон", "дипломатия"],
    blocId: "bloc.guest",
    ...LOC.solis,
  },
  {
    id: "npc_bel_tormund",
    name: "Тормунд",
    title: "Бывший Корвуд Туранмала (плен)",
    role: "other",
    status: "busy",
    publicNotes: "Обездвижен; ждёт суда Турона. Без мыслевируса.",
    gmNotes: "II.14. Допросы Луция.",
    tags: ["плен", "Турон"],
    blocId: null,
    ...LOC.solis,
  },
  {
    id: "npc_bel_harn",
    name: "Харн",
    title: "Посол Караванной линии Амальфеи",
    role: "agent",
    status: "away",
    publicNotes:
      "Таурэн; маска Смотрящего, жезл Суда. Ждёт у ворот столицы; сделка титан ↔ карты.",
    gmNotes: "II.18, II.22.",
    tags: ["Амальфея", "гость"],
    blocId: "bloc.guest",
    ...LOC.solis,
  },
];

const BELATOR_BLOCS = [
  {
    id: "bloc.elegantia",
    name: "Дом Элегантия",
    kind: "house",
    color: "#c9a0dc",
    stance: "ambitious",
    agenda: "faith",
    raceIds: ["race_nagaar"],
    description: "Нагааритяне. Престол после Танет — вакантен.",
    leaderNpcId: null,
    homeSystemName: "Элегантия",
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.radimon",
    name: "Дом Рэдимон",
    kind: "house",
    color: "#b85c38",
    stance: "loyal",
    agenda: "militarize",
    raceIds: ["race_radimon"],
    description: "Матриархат клинка и строя.",
    leaderNpcId: "npc_bel_radimon_matriarch",
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.boreal",
    name: "Дом Бореал",
    kind: "house",
    color: "#5b8def",
    stance: "ambitious",
    agenda: "trade",
    raceIds: ["race_boreal"],
    description: "Кронхаймеры и рынок.",
    leaderNpcId: "npc_bel_astra",
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.norburia",
    name: "Норбурия",
    kind: "house",
    color: "#6b8f71",
    stance: "loyal",
    agenda: "stability",
    raceIds: ["race_horn_narburi"],
    description: "Дая-Чина и регентство.",
    leaderNpcId: "npc_bel_daya_china",
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.sul_canon",
    name: "Канон Сула",
    kind: "church",
    color: "#8b9cff",
    stance: "loyal",
    agenda: "faith",
    description: "Жречество Сула — место вакантно после Танет.",
    leaderNpcId: null,
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.lords_dust",
    name: "Лорды Праха",
    kind: "military",
    color: "#6a7a8a",
    stance: "ambitious",
    agenda: "intrigue",
    raceIds: ["race_lord_dust"],
    description: "Тень провинций.",
    leaderNpcId: "npc_bel_grivs",
    influence: 0,
    support: 0,
    threat: 0,
  },
  {
    id: "bloc.guest",
    name: "Гости",
    kind: "guest",
    color: "#7a9e7e",
    stance: "neutral",
    agenda: "trade",
    description: "Союзники и послы.",
    leaderNpcId: null,
    influence: 0,
    support: 0,
    threat: 0,
  },
];

const QUEST_NPC = {
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

function applyFaction(world) {
  const f = world.factions?.find((x) => x.id === FACTION_ID);
  if (!f) {
    console.warn("faction_belator not found");
    return false;
  }
  f.npcs = NPCS.map((n) => ({
    ...n,
    traitIds: Array.isArray(n.traitIds) ? n.traitIds : [],
    posting: n.posting || { kind: "court", sinceTurn: 0 },
    councilSeat: n.councilSeat ?? null,
    blocId: n.blocId ?? null,
    isBlocLeader: n.isBlocLeader === true,
    isPlayerRuler: n.isPlayerRuler === true,
    raceLeadership: n.raceLeadership ?? null,
  }));
  f.rulerNpcId = "npc_bel_lucius_solar";
  f.internalBlocs = BELATOR_BLOCS.map((b) => ({ ...b }));
  f.council = {
    unlockedSeatIds: [
      "seat.ruler",
      "seat.strategist",
      "seat.warlord",
      "seat.priest",
      "seat.agent",
      "seat.architect",
      "seat.at_large",
    ],
    lockedSeatIds: [],
  };
  if (!f.capitalSystemId) {
    f.capitalSystemId = LOC.solis.locationSystemId;
  }
  const courtNote =
    "Двор: трон = Луций Солар (PC); дома, наместники, слоты совета.";
  if (!f.gmNotes?.includes("трон = Луций")) {
    f.gmNotes = f.gmNotes ? `${f.gmNotes}\n${courtNote}` : courtNote;
  }
  return true;
}

function linkQuests(world) {
  let n = 0;
  for (const q of world.quests ?? []) {
    if (q.sourceFactionId !== FACTION_ID) continue;
    const npcId = QUEST_NPC[q.id];
    if (npcId) {
      q.sourceNpcId = npcId;
      n += 1;
    }
  }
  return n;
}

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("skip missing", filePath);
    return;
  }
  const world = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!applyFaction(world)) return;
  const linked = linkQuests(world);
  if (world.meta) {
    world.meta.updatedAt = new Date().toISOString();
    world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
  }
  fs.writeFileSync(filePath, JSON.stringify(world, null, 2) + "\n", "utf8");
  console.log(
    `${path.basename(filePath)}: ${NPCS.length} court NPCs, ${linked} quests linked`,
  );
}

for (const t of TARGETS) patchFile(t);
