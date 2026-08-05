/**

 * Same-system contact battles — resolve immediately or open card duel.

 */

import {

  collectContactsAndAttacks,

  instantResolveEngagementIds,

  readEngagements,

  requestCardBattle,

} from "./engagements.mjs";

import {

  cancelIntent,

  submitIntent,

  readIntents,

  writeIntents,

} from "./intents.mjs";



export function unitCoLocatedAtTarget(world, payload) {

  const toId = payload?.toSystemId;

  if (!toId) return false;

  if (payload.fleetId) {

    const f = (world.fleets ?? []).find((x) => x.id === payload.fleetId);

    return !!f && f.systemId === toId;

  }

  if (payload.legionId) {

    const l = (world.legions ?? []).find((x) => x.id === payload.legionId);

    return !!l && l.systemId === toId;

  }

  return false;

}



function factionHasHumanSeat(world, factionId) {

  const f = (world.factions ?? []).find((x) => x.id === factionId);

  return !!(f?.password && String(f.password).length > 0);

}



function enrichPayload(payload, targetUnitKind, targetUnitId) {

  if (!targetUnitId || !targetUnitKind) return payload;

  if (targetUnitKind === "fleet") {

    return { ...payload, targetFleetId: targetUnitId };

  }

  if (targetUnitKind === "legion") {

    return { ...payload, targetLegionId: targetUnitId };

  }

  return payload;

}



function setupCardContact(engagementIds, factionId, world) {

  for (const id of engagementIds) {

    requestCardBattle(id, factionId, world);

    const eng = readEngagements().find((e) => e.id === id);

    if (!eng) continue;

    for (const side of eng.sides) {

      if (side.factionId === factionId) continue;

      if (!factionHasHumanSeat(world, side.factionId)) {

        requestCardBattle(id, side.factionId, world);

      }

    }

  }

}



/**

 * @returns {{ ok: true, intent, journal, engagements, contactMode? } | { ok: false, error: string }}

 */

export function runContactStrike({

  world,

  factionId,

  defId,

  payload,

  note,

  turn,

  apMax,

  contactMode = "auto",

  targetUnitKind,

  targetUnitId,

}) {

  const isUnitDuel = !!(targetUnitId && targetUnitKind);

  if (isUnitDuel && contactMode !== "auto" && contactMode !== "card") {

    return { ok: false, error: "Выберите режим боя: автобой или карточный" };

  }



  const strikePayload = enrichPayload(payload, targetUnitKind, targetUnitId);



  const submitted = submitIntent({

    factionId,

    defId,

    payload: strikePayload,

    note,

    source: "contact_strike",

    turn,

    apMax,

    world,

  });

  if (!submitted.ok) return submitted;



  const journal = [];

  const attackRow = {

    factionId,

    payload: submitted.intent.payload,

  };

  const created = collectContactsAndAttacks(world, turn, [attackRow], journal);



  if (!created || !created.length) {

    cancelIntent(submitted.intent.id, factionId);

    return {

      ok: false,

      error: "Нет цели для боя в этой системе",

      journal,

    };

  }



  const createdIds = (created || []).map((e) => e.id);



  if (isUnitDuel && contactMode === "card") {

    setupCardContact(createdIds, factionId, world);

    const list = readIntents();

    const idx = list.findIndex((i) => i.id === submitted.intent.id);

    if (idx >= 0) {

      list[idx] = {

        ...list[idx],

        status: "applied",

        resolvedAt: new Date().toISOString(),

      };

      writeIntents(list);

    }

    const open = readEngagements().filter((e) => createdIds.includes(e.id));

    return {

      ok: true,

      contactMode: "card",

      intent: idx >= 0 ? list[idx] : submitted.intent,

      journal,

      engagements: open,

    };

  }



  instantResolveEngagementIds(world, createdIds, journal);



  const list = readIntents();

  const idx = list.findIndex((i) => i.id === submitted.intent.id);

  if (idx >= 0) {

    list[idx] = {

      ...list[idx],

      status: "applied",

      resolvedAt: new Date().toISOString(),

    };

    writeIntents(list);

  }



  const resolved = readEngagements().filter((e) => createdIds.includes(e.id));



  return {

    ok: true,

    contactMode: "auto",

    intent: idx >= 0 ? list[idx] : submitted.intent,

    journal,

    engagements: resolved,

  };

}


