/**
 * applyPlanetAction: instant planetary actions (build / demolish / colonize /
 * set_colony_type / rename / fill_slot / staff / staff_transfer / upgrade_grade).
 * Extracted from ../planetActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "../ledger.mjs";
import { writeLiveBoard } from "../tableStore.mjs";
import { canBuild as canBuildSlots, resourceMatchesRequire } from "../slotResolver.mjs";
import { factionHasProperty, applyUnlockEffects, collectBuildingUnlockEffects } from "../techActions.mjs";
import { listAvailableVariants } from "../variantResolver.mjs";
import { transferColonizePopulation } from "../colonizePop.mjs";
import { derivedGradeFields, gradeUpgradePlan } from "../planetGrade.mjs";
import {
  applyStaffTransfer,
  consumesLabor,
  laborSlotsForDef,
} from "../laborAllocation.mjs";
import {
  findSystemPlanet,
  canManagePlanet,
  canColonizePlanet,
  normalizeColonyType,
  buildingDefs,
  defForKindZone,
  buildingDefFromInstance,
  colonyDefForType,
  resolveBuildingDef,
  canPlaceBuilding,
  scaledCost,
  buildCostMult,
  canAfford,
  spendCost,
  recordAppliedIntent,
  checkAp,
  checkBuildForbidden,
  sanitizeName,
  pushSystemHistory,
} from "./helpers.mjs";

export function applyPlanetAction({
  world,
  factionId,
  action,
  systemId,
  planetId,
  buildingId,
  instanceId,
  colonyType,
  sourcePlanetId,
  note,
  apMax,
  zone: gradeZone,
  // New economy model: fill_slot params
  slotRole,
  slotResourceId,
  name,
  assignedLabor,
  fromInstanceId,
  transferAmount,
  /** When false, caller (processTurn) persists the board. Default true. */
  persist = true,
  /** Skip AP gate — pending tick intent already reserved AP. */
  skipApCheck = false,
  /** Skip writing a second applied intent row (tick already owns the intent). */
  skipIntentRecord = false,
  /** Spend cost but defer placing building (B4 ETA order — placement on resolve). */
  deferPlacement = false,
  /** Building already paid for (B4 resolve). */
  skipCost = false,
}) {
  const content = getContent();
  const turn = world.meta?.turn ?? 0;
  const found = findSystemPlanet(world, systemId, planetId);
  if (found.error) return { ok: false, error: found.error };
  const { system, planet } = found;

  const persistBoard = (reason) => {
    if (persist) writeLiveBoard(world, { backup: false, reason });
  };

  const gateAp = (apCost) => {
    if (skipApCheck) return { ok: true };
    return checkAp(factionId, turn, apCost, apMax);
  };

  const recordIntent = (opts) => {
    if (skipIntentRecord) {
      return {
        id: opts.idHint || `tick_${opts.defId}`,
        defId: opts.defId,
        factionId,
        turn,
        apCost: opts.apCost,
        payload: opts.payload || {},
      };
    }
    return recordAppliedIntent(opts);
  };

  if (action === "build") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    if ((planet.population ?? 0) <= 0 && normalizeColonyType(planet.colonyType) === "none") {
      return { ok: false, error: "Сначала колонизируйте планету" };
    }
    const resolved = resolveBuildingDef(
      content,
      buildingId,
      planet.raceComposition || [],
    );
    if (!resolved?.def) return { ok: false, error: "Неизвестное здание" };
    const def = resolved.def;
    // Variant must be available for this planet's race mix
    if (def.base && def.base !== buildingId) {
      const listed = listAvailableVariants(
        "buildings",
        def.base,
        planet.raceComposition || [],
        content,
        content.rules,
      );
      if (!listed.available.some((a) => a.id === buildingId || a.id === resolved.id)) {
        return {
          ok: false,
          error: "Этот расовый вариант недоступен при текущем составе населения",
        };
      }
    }
    const ledgerPre = readLedger();
    const ecoPre = ensureFactionEco(ledgerPre, factionId);
    const place = canPlaceBuilding(system, planet, def, factionId, ecoPre, content);
    if (!place.ok) return place;
    // orbital → orbital list; surface/subsurface/deep → surface list (zone preserved on instance)
    const listKey = place.listKey;
    const zone = place.zone;
    const list = [...(planet[listKey] ?? [])];
    const apCost = content.intents?.["intent.build"]?.ap ?? 0;
    const apGate = gateAp(apCost);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(def.cost, buildCostMult(factionId, planet));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    if (!skipCost) {
      const afford = canAfford(eco, cost);
      if (!afford.ok) return afford;
    }

    const building = {
      id: `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      buildingId: resolved.id || buildingId,
      baseBuildingId: resolved.baseId || buildingId,
      name: def.name,
      kind: def.kind,
      zone,
      slotFills: {},
    };

    const intent = recordIntent({
      factionId,
      defId: "intent.build",
      payload: { systemId, planetId, buildingId, instanceId: building.id },
      note,
      turn,
      apCost,
    });

    if (!skipCost) {
      spendCost(ledger, factionId, cost, turn, intent.id, "build");
    }
    const unlockFx = collectBuildingUnlockEffects(def);
    if (unlockFx.length) applyUnlockEffects(eco, unlockFx);
    if (!skipCost || unlockFx.length) writeLedger(ledger);

    if (deferPlacement) {
      return {
        ok: true,
        intent,
        world,
        planet,
        cost,
        building,
        listKey,
        deferred: true,
      };
    }

    list.push(building);
    planet[listKey] = list;
    if (!planet.ownerFactionId) planet.ownerFactionId = factionId;

    pushSystemHistory(system, {
      turn,
      type: "build",
      planetId,
      buildingId,
      description: `Построено: ${def.name} на ${planet.name}`,
    });
    persistBoard("planet_build");
    // New economy model: surface slot requirements (advisory, non-blocking)
    let slotInfo = null;
    try {
      const slotCheck = canBuildSlots(def);
      slotInfo = {
        hasSlots: !!(def.slots && def.slots.length > 0),
        slots: def.slots || [],
        canBuild: slotCheck.ok,
        missing: slotCheck.missing,
        bottlenecks: slotCheck.bottlenecks,
      };
    } catch (_e) {
      slotInfo = null;
    }
    return { ok: true, intent, world, planet, cost, building, slotInfo };
  }

  if (action === "demolish") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const apCost = content.intents?.["intent.demolish"]?.ap ?? 0;
    const apGate = gateAp(apCost);
    if (!apGate.ok) return apGate;
    let removed = null;
    for (const key of ["surfaceBuildings", "orbitalBuildings"]) {
      const list = planet[key] ?? [];
      const idx = list.findIndex((b) => b.id === instanceId);
      if (idx >= 0) {
        removed = list[idx];
        planet[key] = list.filter((b) => b.id !== instanceId);
        break;
      }
    }
    if (!removed) return { ok: false, error: "Постройка не найдена" };
    const intent = recordIntent({
      factionId,
      defId: "intent.demolish",
      payload: { systemId, planetId, instanceId },
      note,
      turn,
      apCost,
    });
    pushSystemHistory(system, {
      turn,
      type: "demolish",
      planetId,
      buildingId: removed.buildingId || removed.id,
      description: `Снесено: ${removed.name || removed.kind} на ${planet.name}`,
    });
    persistBoard("planet_demolish");
    return { ok: true, intent, world, planet, removed };
  }

  if (action === "colonize") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canColonizePlanet(system, planet, factionId)) {
      return {
        ok: false,
        error: "Нельзя колонизировать (нужна своя система и пустая планета)",
      };
    }
    const targetType = normalizeColonyType(colonyType || "outpost");
    if (targetType === "none") {
      return { ok: false, error: "Укажите тип колонии" };
    }
    const cdef = colonyDefForType(content, targetType);
    if (!cdef) return { ok: false, error: "Неизвестный тип колонии" };
    const apCost = cdef.colonizeAp ?? content.intents?.["intent.colonize"]?.ap ?? 1;
    const apGate = gateAp(apCost);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(cdef.colonizeCost, buildCostMult(factionId));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, cost);
    if (!afford.ok) return afford;

    const faction = (world.factions ?? []).find((f) => f.id === factionId);
    const popMove = transferColonizePopulation({
      world,
      destSystem: system,
      destPlanet: planet,
      factionId,
      settlerCount: cdef.colonizePopulation ?? 2,
      sourcePlanetId,
      founderRaceId: faction?.primaryRaceId,
    });
    if (!popMove.ok) return popMove;

    planet.colonyType = targetType;
    planet.population = popMove.destPopulation;
    planet.raceComposition = popMove.destComposition;
    planet.ownerFactionId = factionId;
    planet.habitable = planet.habitable ?? true;
    planet.colonizable = true;
    planet.surveyed = true;
    if (!planet.surfaceBuildings) planet.surfaceBuildings = [];
    if (!planet.orbitalBuildings) planet.orbitalBuildings = [];
    Object.assign(planet, derivedGradeFields(planet, content));

    const intent = recordIntent({
      factionId,
      defId: "intent.colonize",
      payload: { systemId, planetId, colonyType: targetType, sourcePlanetId },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, cost, turn, intent.id, "colonize");
    writeLedger(ledger);
    pushSystemHistory(system, {
      turn,
      type: "colonize",
      planetId,
      description: `Колонизирована планета ${planet.name} (${targetType})`,
    });
    persistBoard("planet_colonize");
    return { ok: true, intent, world, planet, cost };
  }

  if (action === "set_colony_type") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    if ((planet.population ?? 0) <= 0) {
      return { ok: false, error: "Нет колонии — сначала колонизируйте" };
    }
    const targetType = normalizeColonyType(colonyType);
    if (!targetType || targetType === "none") {
      return { ok: false, error: "Укажите тип колонии" };
    }
    if (normalizeColonyType(planet.colonyType) === targetType) {
      return { ok: false, error: "Тип уже установлен" };
    }
    const cdef = colonyDefForType(content, targetType);
    if (!cdef) return { ok: false, error: "Неизвестный тип колонии" };
    const apCost =
      cdef.setTypeAp ?? content.intents?.["intent.set_colony_type"]?.ap ?? 1;
    const apGate = gateAp(apCost);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(cdef.setTypeCost, buildCostMult(factionId));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, cost);
    if (!afford.ok) return afford;

    planet.colonyType = targetType;

    const intent = recordIntent({
      factionId,
      defId: "intent.set_colony_type",
      payload: { systemId, planetId, colonyType: targetType },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, cost, turn, intent.id, "set_colony_type");
    writeLedger(ledger);
    persistBoard("planet_set_type");
    return { ok: true, intent, world, planet, cost };
  }

  if (action === "rename") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const next = sanitizeName(name ?? note, planet.name);
    if (next === planet.name) {
      return { ok: true, planet };
    }
    planet.name = next;
    persistBoard("planet_rename");
    const intent = recordIntent({
      factionId,
      defId: "intent.rename_planet",
      payload: { systemId, planetId, name: next },
      note,
      turn,
      apCost: 0,
    });
    return { ok: true, intent, planet };
  }

  if (action === "fill_slot") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const inst = instanceId;
    const role = slotRole;
    const resourceId = slotResourceId;
    if (!inst || !role) {
      return { ok: false, error: "Нужны instanceId и slotRole" };
    }
    let target = null;
    let listKey = null;
    for (const key of ["surfaceBuildings", "orbitalBuildings"]) {
      const list = planet[key] ?? [];
      const idx = list.findIndex((b) => b.id === inst);
      if (idx >= 0) {
        target = list[idx];
        listKey = key;
        break;
      }
    }
    if (!target) return { ok: false, error: "Постройка не найдена" };
    const def =
      (target.buildingId && buildingDefs(content)[target.buildingId]) ||
      defForKindZone(content, target.kind, target.zone || "surface");
    if (!def?.slots) return { ok: false, error: "У здания нет слотов" };
    const slot = def.slots.find((s) => s.role === role);
    if (!slot) return { ok: false, error: `Слот '${role}' не найден` };

    if (!target.slotFills) target.slotFills = {};

    // Unfill when resourceId empty / null / "__clear__"
    const clearing =
      resourceId == null ||
      resourceId === "" ||
      resourceId === "__clear__";
    let filledId = null;
    if (clearing) {
      delete target.slotFills[role];
    } else {
      const resDef = Object.values(content.map_resources || {}).find(
        (r) => r.id === resourceId || r.name === resourceId,
      );
      if (!resDef) return { ok: false, error: "Ресурс не найден" };
      if (!resourceMatchesRequire(resDef, slot.require)) {
        return { ok: false, error: "Ресурс не подходит под требования слота" };
      }
      const ledgerGate = readLedger();
      const ecoGate = ensureFactionEco(ledgerGate, factionId);
      const slotProps = slot.require?.properties || [];
      for (const p of slotProps) {
        if (!(resDef.properties || []).includes(p)) continue;
        if (!factionHasProperty(ecoGate, p)) {
          const label =
            content.economy_schema?.properties?.[p]?.label || p;
          return { ok: false, error: `Нужно свойство: ${label}` };
        }
      }
      // Prefer planet-local deposits when planet has resources listed
      const local = planet.resources || [];
      if (local.length > 0) {
        const onPlanet = local.some(
          (n) => n === resDef.name || n === resDef.id,
        );
        if (!onPlanet) {
          return {
            ok: false,
            error: "Ресурс должен быть на этой планете",
          };
        }
      }
      target.slotFills[role] = resDef.id;
      filledId = resDef.id;
    }

    const list = planet[listKey];
    const idx = list.findIndex((b) => b.id === inst);
    list[idx] = target;
    planet[listKey] = list;
    const intent = recordIntent({
      factionId,
      defId: "intent.fill_slot",
      payload: {
        systemId,
        planetId,
        instanceId,
        role,
        resourceId: filledId,
        cleared: clearing,
      },
      note,
      turn,
      apCost: 0,
    });
    persistBoard(clearing ? "planet_unfill_slot" : "planet_fill_slot");
    return { ok: true, intent, world, planet, building: target };
  }

  if (action === "staff") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    if (!instanceId) return { ok: false, error: "Нужен instanceId" };
    let target = null;
    let listKey = null;
    for (const key of ["surfaceBuildings", "orbitalBuildings"]) {
      const list = planet[key] ?? [];
      const idx = list.findIndex((b) => b.id === instanceId);
      if (idx >= 0) {
        target = list[idx];
        listKey = key;
        break;
      }
    }
    if (!target) return { ok: false, error: "Постройка не найдена" };
    const def = buildingDefFromInstance(content, target);
    if (!consumesLabor(def)) {
      return { ok: false, error: "Это здание не занимает рабочих" };
    }
    const auto =
      assignedLabor == null ||
      assignedLabor === "" ||
      assignedLabor === "auto";
    if (auto) {
      delete target.assignedLabor;
    } else {
      const slots = laborSlotsForDef(def);
      const n = Math.floor(Number(assignedLabor));
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: "Некорректное число работников" };
      }
      target.assignedLabor = Math.min(slots, n);
    }
    const list = planet[listKey];
    const idx = list.findIndex((b) => b.id === instanceId);
    list[idx] = target;
    planet[listKey] = list;
    const intent = recordIntent({
      factionId,
      defId: "intent.staff",
      payload: {
        systemId,
        planetId,
        instanceId,
        assignedLabor: auto ? null : target.assignedLabor,
      },
      note,
      turn,
      apCost: 0,
    });
    persistBoard("planet_staff");
    return { ok: true, intent, world, planet, building: target };
  }

  if (action === "staff_transfer") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const moved = applyStaffTransfer(
      planet,
      content,
      fromInstanceId,
      instanceId,
      transferAmount,
    );
    if (!moved.ok) return moved;
    const intent = recordIntent({
      factionId,
      defId: "intent.staff",
      payload: {
        systemId,
        planetId,
        fromInstanceId: fromInstanceId || "idle",
        instanceId: instanceId || "idle",
        transferAmount: moved.moved,
      },
      note,
      turn,
      apCost: 0,
    });
    persistBoard("planet_staff_transfer");
    return { ok: true, intent, world, planet, moved: moved.moved };
  }

  if (action === "upgrade_grade") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const zone = gradeZone === "orbital" ? "orbital" : "surface";
    Object.assign(planet, derivedGradeFields(planet, content));
    const plan = gradeUpgradePlan(planet, zone, content);
    if (!plan.ok) return plan;
    const apCost = content.intents?.["intent.upgrade_grade"]?.ap ?? 1;
    const apGate = gateAp(apCost);
    if (!apGate.ok) return apGate;
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, plan.cost);
    if (!afford.ok) return afford;

    planet[plan.key] = plan.next;
    planet.surfaceSlots = plan.surfaceSlots;
    planet.orbitalSlots = plan.orbitalSlots;

    const intent = recordIntent({
      factionId,
      defId: "intent.upgrade_grade",
      payload: { systemId, planetId, zone },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, plan.cost, turn, intent.id, "upgrade_grade");
    writeLedger(ledger);
    pushSystemHistory(system, {
      turn,
      type: "build",
      planetId,
      description: `Грейд ${zone === "orbital" ? "орбиты" : "поверхности"} ${planet.name}: ${plan.next}`,
    });
    persistBoard("planet_upgrade_grade");
    return { ok: true, intent, world, planet, cost: plan.cost };
  }

  return { ok: false, error: `Неизвестное действие: ${action}` };
}
