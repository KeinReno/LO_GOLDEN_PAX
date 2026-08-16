/**
 * Apply RP session intel (Kai/Artemis ↔ Northern Swarm) onto published.json map.
 * Run: node scripts/applyNorthSwarmRpSession.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLISHED = path.join(ROOT, "data", "published.json");
const INTERVENTIONS = path.join(ROOT, "data", "gm-interventions.json");
const TABLE_META = path.join(ROOT, "data", "table-meta.json");

const SYS = {
  theoryDock: "706ba6a5-dd6d-4f3b-b010-0f3e4cf3fd00",
  megaron: "ede3c117-ecd0-4e4c-b101-0eda2a2f4f53",
  buleHub: "a73d24aa-556b-4d16-a92a-fa84d5b32a80",
  ostrakon: "a569024d-03de-4c9a-9ca9-094684edb0da",
  pniks: "f78408c7-c877-4553-83b4-cf108fe0e206",
  gelieya: "3535cd62-cb3e-4541-8ddc-0009ee5b9169",
  politeya: "d72d284c-b34f-458a-b785-410c50d6c9bf",
  agora: "7e395ab7-e0b6-4b5e-a57d-9b223d074dfe",
  sinoykia: "d688e6ba-80d4-432c-8ff0-de4e467d35e2",
  humNorth: "46696198-f78f-4048-9add-55cdc99fc307",
  archion: "67694bd9-a8e3-4459-a0e1-3043175f3987",
  periklid: "be6464ac-bf51-43f1-b956-70fe7c6f8658",
  korinfad: "cdb75b13-fc6d-45ac-bf2b-dbed94ca9b26",
  uley2: "25bbffda-7329-4051-896a-1a780dded9a4",
  uley3: "339b773c-043b-4304-aeb0-4708875e12a9",
};

const NOW = new Date().toISOString();
const TURN = 59;

function uniqPois(list, add) {
  const set = new Set([...(list || []).filter((x) => x && x !== "none"), ...add]);
  return [...set];
}

function appendNote(prev, line) {
  const p = String(prev || "").trim();
  if (!line) return p;
  if (p.includes(line.slice(0, 40))) return p;
  return p ? `${p} · ${line}` : line;
}

function mkFleet({
  name,
  factionId,
  systemId,
  kind = "combat",
  stance = "idle",
  composition,
  route = [],
  lastSystemId = null,
  gmNotes = null,
}) {
  const f = {
    id: randomUUID(),
    name,
    factionId,
    systemId,
    kind,
    composition,
    stance,
    route,
  };
  if (lastSystemId) f.lastSystemId = lastSystemId;
  if (gmNotes) f.gmNotes = gmNotes;
  return f;
}

function mkLegion({ name, factionId, systemId, composition, gmNotes = null }) {
  const l = {
    id: randomUUID(),
    name,
    factionId,
    systemId,
    composition,
    stance: "idle",
  };
  if (gmNotes) l.gmNotes = gmNotes;
  return l;
}

const world = JSON.parse(fs.readFileSync(PUBLISHED, "utf8"));
const byId = new Map(world.systems.map((s) => [s.id, s]));
const fleetById = new Map(world.fleets.map((f) => [f.id, f]));

function touchSystem(id, fn) {
  const s = byId.get(id);
  if (!s) throw new Error(`missing system ${id}`);
  fn(s);
}

// --- Swarm fleet movements & renames ---
const swarmMass = fleetById.get("f2961a9c-d294-4650-a5bf-20f401d16022"); // Роевая масса
if (swarmMass) {
  swarmMass.lastSystemId = swarmMass.systemId;
  swarmMass.systemId = SYS.ostrakon;
  swarmMass.stance = "move";
  swarmMass.route = [SYS.pniks, SYS.gelieya];
  swarmMass.gmNotes =
    "RP 2026-08-10: основная масса Роя медленно смещается на восток (Остракон → Пникс → Гелиэя).";
}

const fang = fleetById.get("297131aa-7c44-478c-87f5-81d2f886152e"); // Клык
if (fang) {
  fang.lastSystemId = fang.systemId;
  fang.systemId = SYS.buleHub;
  fang.stance = "attack";
  fang.route = [SYS.sinoykia];
  fang.name = "Клык СЗ · к потерянному флоту";
  fang.gmNotes =
    "RP 2026-08-10: отряд Роя на СЗ к потерянному имперскому флоту (коридор Буле-Хаб ↔ Синойкия).";
}

const wave = fleetById.get("3cc545ba-69f2-4871-8488-e36b79f642cd"); // Волна-Шрам @ Теория-Док
if (wave) {
  wave.stance = "attack";
  wave.gmNotes =
    "RP 2026-08-10: бой у Теория-Док. Живые тела Роя формируют границу; союзники — огонь без входа в приманки.";
}

const f4 = fleetById.get("d2577cf3-adca-4410-9f14-02a599dae99c");
if (f4) {
  f4.lastSystemId = f4.systemId;
  f4.systemId = SYS.pniks;
  f4.stance = "move";
  f4.name = "Восточный вал Роя";
  f4.gmNotes = "RP 2026-08-10: восточное крыло основного сосредоточения.";
}

const f5 = fleetById.get("28ad9fbb-ad12-4d0d-b6e4-5b88d4116a8e");
if (f5) {
  f5.lastSystemId = f5.systemId;
  f5.systemId = SYS.ostrakon;
  f5.stance = "fortify";
  f5.name = "Страховка приманки · Остракон";
  f5.gmNotes =
    "RP 2026-08-10: Рой оставляет ближние системы уязвимыми, но страхует их из соседних.";
}

const f6 = fleetById.get("d1a94eb0-36c0-4c92-a9fa-2253c3dbba2b");
if (f6) {
  f6.lastSystemId = f6.systemId;
  f6.systemId = SYS.uley3;
  f6.stance = "idle";
  f6.name = "Плазмагоны · ещё вне досягаемости";
  f6.composition = [
    { type: "ship.battleship", defId: "ship.battleship", count: 8, xp: 0, level: 0 },
    { type: "ship.cruiser", defId: "ship.cruiser", count: 20, xp: 0, level: 0 },
    { type: "ship.frigate", defId: "ship.frigate", count: 40, xp: 0, level: 0 },
  ];
  f6.gmNotes =
    "RP 2026-08-10: впервые выведены дальнобойные особи-плазмагоны. Пока вне досягаемости союзников — приоритет огня при появлении.";
}

const f8bule = fleetById.get("b61ba142-569d-47a4-90c4-f8c825d8e2b5");
if (f8bule) {
  f8bule.lastSystemId = f8bule.systemId;
  f8bule.systemId = SYS.megaron;
  f8bule.stance = "fortify";
  f8bule.name = "Подавители связи · миллионы";
  f8bule.composition = [
    { type: "ship.corvette", defId: "ship.corvette", count: 200, xp: 0, level: 0 },
    { type: "ship.frigate", defId: "ship.frigate", count: 80, xp: 0, level: 0 },
  ];
  f8bule.gmNotes =
    "RP 2026-08-10: облако подавителей связи (масштабом «миллионы» в каноне сессии). Dead-zone на ближних системах.";
}

const gilmir = fleetById.get("09e6c497-cd29-4c84-bc31-08f3cfd2f2aa");
if (gilmir) {
  gilmir.stance = "move";
  gilmir.route = [SYS.buleHub];
  gilmir.gmNotes =
    "Приказ Артемиды: скорейшим образом во фланг — деблокировать потерянный имперский флот (Буле-Хаб).";
}

const greavesLogistics = fleetById.get("bd0e1f9a-48ec-4b00-ab5a-0d515a7dfcd3");
if (greavesLogistics) {
  greavesLogistics.name = "Логистика Гривза";
  greavesLogistics.stance = "fortify";
  greavesLogistics.gmNotes =
    "Силы Гривза: ремонтные станции, логистика, мобильные РТГ; защита флагмана. Систематический отстрел вместе с Туранмалом / Флагманом / Нетриен.";
}

const grom = fleetById.get("75a09481-24f3-4bfb-9350-7b830850c497");
if (grom) {
  grom.lastSystemId = grom.systemId;
  grom.systemId = SYS.theoryDock;
  grom.name = "Флагман Сев. Фронта";
  grom.stance = "attack";
  grom.kind = "carrier";
  grom.gmNotes =
    "Флагман на систематическом отстреле. Крупные цели: Блюм + Солар. Не входить в системы-приманки.";
  grom.composition = [
    { type: "ship.battleship", defId: "ship.battleship", count: 4, xp: 100, level: 1, hp: 185 },
    { type: "ship.cruiser", defId: "ship.cruiser", count: 6, xp: 0, level: 0 },
    { type: "ship.frigate", defId: "ship.frigate", count: 8, xp: 0, level: 0 },
  ];
}

// --- New allied task forces ---
const newFleets = [
  mkFleet({
    name: "Удар Гуна",
    factionId: "faction_belator",
    systemId: SYS.archion,
    kind: "combat",
    stance: "fortify",
    composition: [
      { type: "ship.battleship", defId: "ship.battleship", count: 3, xp: 0, level: 0 },
      { type: "ship.cruiser", defId: "ship.cruiser", count: 8, xp: 0, level: 0 },
      { type: "ship.transport", defId: "ship.transport", count: 6, xp: 0, level: 0 },
      { type: "ship.frigate", defId: "ship.frigate", count: 10, xp: 0, level: 0 },
    ],
    gmNotes:
      "Имперские ударные флотилии + легионеры для высадки. Гун — генерал наземных/абордажных боёв. Резерв: дополнять «пустые» суда легионерами против окружения.",
  }),
  mkFleet({
    name: "Удар Туранмала",
    factionId: "faction_turon",
    systemId: SYS.theoryDock,
    kind: "combat",
    stance: "attack",
    composition: [
      { type: "ship.battleship", defId: "ship.battleship", count: 5, xp: 0, level: 0 },
      { type: "ship.cruiser", defId: "ship.cruiser", count: 10, xp: 0, level: 0 },
      { type: "ship.frigate", defId: "ship.frigate", count: 6, xp: 0, level: 0 },
    ],
    gmNotes:
      "Ударные и дальнобойные; медленнее и менее манёвренные, но крепче. Систематический отстрел с Гривзом / Флагманом / Нетриен. Не входить в приманки.",
  }),
  mkFleet({
    name: "Дальнобой Нетриен",
    factionId: "faction_belator",
    systemId: SYS.archion,
    kind: "combat",
    stance: "attack",
    composition: [
      { type: "ship.battleship", defId: "ship.battleship", count: 4, xp: 0, level: 0 },
      { type: "ship.cruiser", defId: "ship.cruiser", count: 8, xp: 0, level: 0 },
      { type: "ship.frigate", defId: "ship.frigate", count: 4, xp: 0, level: 0 },
    ],
    gmNotes:
      "Дальнобойная поддержка, небольшие экипажи, без легионов. Систематический отстрел. При окружении — доукомплектовать легионерами для выигрыша времени.",
  }),
  mkFleet({
    name: "Удар Свирских",
    factionId: "faction_belator",
    systemId: SYS.periklid,
    kind: "combat",
    stance: "idle",
    composition: [
      { type: "ship.battleship", defId: "ship.battleship", count: 6, xp: 0, level: 0 },
      { type: "ship.cruiser", defId: "ship.cruiser", count: 14, xp: 0, level: 0 },
      { type: "ship.frigate", defId: "ship.frigate", count: 12, xp: 0, level: 0 },
    ],
    gmNotes:
      "Основная ударная мощь сейчас. Экипажи без легионов; требует логистики. Ждёт команды на штурм. Дополнить легионерами на случай окружения/подлой атаки.",
  }),
];

const already = new Set(world.fleets.map((f) => f.name));
for (const f of newFleets) {
  if (!already.has(f.name)) world.fleets.push(f);
}

const matriarchLegion = mkLegion({
  name: "Пехота Матриарха · фронт",
  factionId: "faction_belator",
  systemId: SYS.korinfad,
  composition: [
    { type: "unit.generic_line", defId: "unit.generic_line", count: 12, xp: 0, level: 0 },
    { type: "unit.assault", defId: "unit.assault", count: 4, xp: 0, level: 0 },
  ],
  gmNotes:
    "Пехота Матриарха: защита флагмана и столицы Федерации, укрепление отбитых миров. Резерв легионеров для «пустых» судов Свирских/Нетриен.",
});
if (!(world.legions || []).some((l) => l.name === matriarchLegion.name)) {
  world.legions = world.legions || [];
  world.legions.push(matriarchLegion);
}

const gunLegion = mkLegion({
  name: "Легионеры Гуна",
  factionId: "faction_belator",
  systemId: SYS.archion,
  composition: [
    { type: "unit.assault", defId: "unit.assault", count: 8, xp: 0, level: 0 },
    { type: "unit.generic_line", defId: "unit.generic_line", count: 10, xp: 0, level: 0 },
  ],
  gmNotes: "Десант/абордаж под командованием Гуна; резерв на доукомплектование ударных флотов.",
});
if (!(world.legions || []).some((l) => l.name === gunLegion.name)) {
  world.legions.push(gunLegion);
}

// --- Map marks on systems ---
touchSystem(SYS.theoryDock, (s) => {
  s.activity = "battle";
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "debris"]);
  s.notes = appendNote(
    s.notes,
    "Фронт: залить Рой огнём; границу держат живыми телами. Не входить — отстрел снаружи"
  );
  s.gmNotes = appendNote(
    s.gmNotes,
    "RP 2026-08-10 Artemis: систематический отстрел (Туранмал+Гривз+Флагман+Нетриен). Данные союзникам; связь через псион."
  );
});

touchSystem(SYS.megaron, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "beacon", "dead_zone"]);
  s.scannerDeadZone = true;
  s.notes = appendNote(
    s.notes,
    "ПРИМАНКА Роя · не входить; подавители связи; страхование из соседних"
  );
  s.gmNotes = appendNote(s.gmNotes, "Bait system — fire only, no entry (Artemis).");
});

touchSystem(SYS.ostrakon, (s) => {
  s.activity = "garrison";
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "beacon", "dead_zone"]);
  s.scannerDeadZone = true;
  s.notes = appendNote(
    s.notes,
    "ПРИМАНКА · восток основной массы Роя; не входить; уничтожать огнём снаружи"
  );
});

touchSystem(SYS.buleHub, (s) => {
  s.activity = "battle";
  s.spaceObjects = uniqPois(s.spaceObjects, [
    "frontline",
    "debris",
    "abandoned_station",
    "dead_zone",
  ]);
  s.scannerDeadZone = true;
  s.notes = appendNote(
    s.notes,
    "Потерянный имперский флот под давлением СЗ-отряда Роя · деблок Гильмиром"
  );
  s.gmNotes = appendNote(
    s.gmNotes,
    "Lost imperial fleet corridor. Swarm NW detachment. Gilmir flank unblock."
  );
});

touchSystem(SYS.sinoykia, (s) => {
  s.activity = "transit";
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "outpost"]);
  s.notes = appendNote(
    s.notes,
    "Фланг Гильмира: деблок потерянного имперского флота у Буле-Хаба"
  );
});

touchSystem(SYS.pniks, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "beacon"]);
  s.notes = appendNote(s.notes, "Восточный вектор основной массы Роя");
});

touchSystem(SYS.gelieya, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["frontline", "beacon"]);
  s.notes = appendNote(s.notes, "Дальний восток смещения Роя · наблюдать");
});

touchSystem(SYS.agora, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["debris", "frontline"]);
  s.notes = appendNote(s.notes, "Осколки боёв; не путать с СЗ-коридором деблока");
});

touchSystem(SYS.politeya, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["debris", "abandoned_station"]);
  s.notes = appendNote(
    s.notes,
    "След уничтоженного федерального флота (не путать с СЗ-деблоком у Буле-Хаба)"
  );
});

touchSystem(SYS.archion, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["depot", "frontline"]);
  s.notes = appendNote(
    s.notes,
    "Сборный узел: Гун / Нетриен · отстрел; Свирских — в ожидании штурма на Периклиде"
  );
});

touchSystem(SYS.periklid, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["fortress", "depot"]);
  s.notes = appendNote(s.notes, "Удар Свирских ждёт команды на штурм · логистика обязательна");
});

touchSystem(SYS.uley3, (s) => {
  s.spaceObjects = uniqPois(s.spaceObjects, ["dead_zone", "fortress"]);
  s.notes = appendNote(s.notes, "Плазмагоны Роя развёрнуты в глубине · пока вне досягаемости");
});

touchSystem(SYS.humNorth, (s) => {
  s.notes = appendNote(
    s.notes,
    "Разведка: Рой ≠ простой коллектив; локальные надразумы + своё командование"
  );
});

// --- Quests ---
const northQ = world.quests.find((q) => q.id === "q_bel_north_queen");
if (northQ) {
  northQ.summary =
    "Северный Рой на федеральном фронте: не простой рой — особи индивидуальны, сходятся в локальные коллективы и надразумы; есть своё командование. Основная масса → восток; отряд → СЗ к потерянному имперскому флоту. Приманки + плазмагоны + подавители связи.";
  northQ.detail = [
    "Канон: II.07, II.22 + сессия RP 2026-08-10 (Kai / Artemis).",
    "Природа: не единый коллективный разум и не единственный; каждая особь индивидуальна, но может входить в локальные коллективы / надразумы. Есть командование, подобное командирам союзников.",
    "Движение: основное сосредоточение медленно на восток; часть — на СЗ к потерянному имперскому флоту (Буле-Хаб).",
    "Тактика Роя: ближайшие системы нарочно уязвимы (приманка), но застрахованы из соседних. Живые тела формируют границу. Вне досягаемости — плазмагоны и подавители связи (масштабом миллионы).",
    "Флагман Роя наводит крупные цели: Блюм + Солар.",
    "Приказ Артемиды: не входить в приманки — жечь снаружи; Гильмир во фланг на деблок; Туранмал+Гривз+Флагман+Нетриен — систематический отстрел; Свирских — ждать штурм; «пустые» суда доукомплектовать легионерами; держаться вместе, связь через псион; данные — союзникам.",
  ].join("\n");
  northQ.history = northQ.history || [];
  northQ.history.push({
    at: NOW,
    turn: TURN,
    kind: "message",
    authorName: "Kai / Artemis",
    body:
      "Разведка и приказы фронта: природа Роя (локальные надразумы + командование); масса→восток, отряд→СЗ к потерянному флоту; плазмагоны/подавители вне досягаемости; приманки не входить; Гильмир деблок; Туранмал+Гривз+Флагман+Нетриен отстрел; Свирских ждёт штурм; легионеры на пустые суда; псион-связь.",
  });
}

const gilmirQ = world.quests.find((q) => q.id === "q_bel_et_gilmir");
if (gilmirQ) {
  gilmirQ.summary =
    "Флот Эт Гильмир Сахале: универсальные самообеспечивающиеся флотилии. Приказ — скорейший фланг и деблок потерянного имперского флота у Буле-Хаба.";
  gilmirQ.detail =
    "Канон: II.08, II.22. RP 2026-08-10: Гильмир — многочисленные разноуровневые частично мобильные флотилии, единое целое, самообеспечение. Маршрут: Синойкия → Буле-Хаб.";
  gilmirQ.systemId = SYS.sinoykia;
  gilmirQ.history = gilmirQ.history || [];
  gilmirQ.history.push({
    at: NOW,
    turn: TURN,
    kind: "message",
    authorName: "Artemis",
    body: "Силы Гильмира — во фланг, деблокировать потерянный имперский флот (Буле-Хаб).",
  });
}

if (!world.quests.some((q) => q.id === "q_bel_swarm_front_ops")) {
  world.quests.push({
    id: "q_bel_swarm_front_ops",
    name: "Операции Сев. Фронта",
    summary:
      "Расстановка сил против Северного Роя: роли флотов, приманки, отстрел без входа, деблок, ожидание штурма.",
    detail: [
      "Роли:",
      "• Гун — удар + легионеры/абордаж (генерал).",
      "• Гривз — ремонт, логистика, РТГ, охрана флагмана.",
      "• Матриарх — пехота: флагман/столица Федерации, отбитые миры.",
      "• Туранмал — удар/дальнобой, медленнее, крепче.",
      "• Гильмир — универсал, самообеспечение → фланг/деблок.",
      "• Свирских — главная ударная мощь, без легионов, нужна логистика → ждёт штурм.",
      "• Нетриен — дальнобойная поддержка, малые экипажи, без легионов.",
      "",
      "Приказы Artemis: жечь ближние системы без входа; Гильмир деблок; Туранмал+Гривз+Флагман+Нетриен отстрел; Свирских — по команде; легионеры на пустые суда; псион-связь; фокус по плазмагонам при появлении.",
    ].join("\n"),
    systemId: SYS.theoryDock,
    status: "active",
    type: "side",
    history: [
      {
        at: NOW,
        turn: TURN,
        kind: "message",
        authorName: "Artemis Wintory",
        body: "Боевой план зафиксирован на карте Теория-Док / Архион / Периклид / Синойкия / Буле-Хаб.",
      },
    ],
    sourceNpcId: "npc_bel_miron_kostrov",
    sourceFactionId: "faction_belator",
    sourceSystemId: SYS.theoryDock,
    expiresTurn: null,
    catalogId: null,
  });
}

// --- NPC public notes ---
const bel = world.factions.find((f) => f.id === "faction_belator");
if (bel?.npcs) {
  const miron = bel.npcs.find((n) => n.id === "npc_bel_miron_kostrov");
  if (miron) {
    miron.publicNotes = appendNote(
      miron.publicNotes,
      "Сев. фронт: Рой с локальными надразумами и командованием; приманки+подавители; план Artemis на карте"
    );
  }
  const grivs = bel.npcs.find((n) => n.id === "npc_bel_grivs");
  if (grivs) {
    grivs.publicNotes = appendNote(
      grivs.publicNotes,
      "На фронте: логистика/ремонт флагмана, систематический отстрел с Туранмалом и Нетриен"
    );
  }
  const ksi = bel.npcs.find((n) => n.id === "npc_bel_ksi_tarra");
  if (ksi) {
    ksi.publicNotes = appendNote(
      ksi.publicNotes,
      "Северный Рой: не простой коллектив — особи + локальные надразумы; своё командование"
    );
  }
  const matriarch = bel.npcs.find((n) => n.id === "npc_bel_radimon_matriarch");
  if (matriarch) {
    matriarch.publicNotes = appendNote(
      matriarch.publicNotes,
      "Пехота на фронте: защита флагмана/Федерации и отбитых миров; резерв легионеров на пустые суда"
    );
  }
}

const ns = world.factions.find((f) => f.id === "faction_north_swarm");
if (ns) {
  ns.gmNotes = appendNote(
    ns.gmNotes,
    "RP 2026-08-10: не hive-mind; локальные коллективы/надразумы; командование; масса→E; отряд→NW lost fleet; bait+insurance; plasmaguns+jammers out of range; targets Bloom+Solar."
  );
}

// --- Meta / interventions ---
world.meta = world.meta || {};
world.meta.updatedAt = NOW;
world.meta.tableRevision = (world.meta.tableRevision || 0) + 1;
world.meta.turn = TURN;

fs.writeFileSync(PUBLISHED, JSON.stringify(world, null, 2) + "\n", "utf8");

let interventions = { entries: [] };
if (fs.existsSync(INTERVENTIONS)) {
  interventions = JSON.parse(fs.readFileSync(INTERVENTIONS, "utf8"));
}
interventions.entries = interventions.entries || [];
interventions.entries.push({
  id: `gmi_${Date.now()}_swarm_rp`,
  at: NOW,
  actor: "gm",
  action: "rp_session",
  before: { turn: TURN },
  after: { turn: TURN, tableRevision: world.meta.tableRevision },
  detail:
    "Northern Swarm RP 2026-08-10: intel (local overminds, command, plasma/jammers), movements E+NW, bait marks, allied TF (Gun/Greaves/Matriarch/Turanmal/Gilmir/Svirsky/Netrien), Artemis orders on map.",
});
if (interventions.entries.length > 500) {
  interventions.entries = interventions.entries.slice(-500);
}
fs.writeFileSync(INTERVENTIONS, JSON.stringify(interventions, null, 2) + "\n", "utf8");

if (fs.existsSync(TABLE_META)) {
  const tm = JSON.parse(fs.readFileSync(TABLE_META, "utf8"));
  tm.tableRevision = world.meta.tableRevision;
  tm.updatedAt = NOW;
  fs.writeFileSync(TABLE_META, JSON.stringify(tm, null, 2) + "\n", "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tableRevision: world.meta.tableRevision,
      fleets: world.fleets.filter((f) =>
        /Гун|Гривз|Туранмал|Нетриен|Свирск|Флагман Сев|Гильмир|Плазмагон|Подавител|Клык СЗ|Восточный|Страховка|Роевая|Волна/i.test(
          f.name
        )
      ).map((f) => ({ name: f.name, systemId: f.systemId, stance: f.stance })),
      quests: world.quests
        .filter((q) => /north_queen|et_gilmir|swarm_front/i.test(q.id))
        .map((q) => ({ id: q.id, systemId: q.systemId, summary: q.summary.slice(0, 80) })),
    },
    null,
    2
  )
);
