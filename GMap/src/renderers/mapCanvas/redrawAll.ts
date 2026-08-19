import type { MutableRefObject } from "react";
import { Application, Graphics, Text } from "pixi.js";
import type { StarSystem } from "../../state/types";
import type { MapFxSite } from "../mapFxOverlay";
import type {
  SystemSignalFlags,
  UnitSpriteSlot,
} from "../mapIconSprites";
import type { MapViewModel } from "./types";

export type MapRedrawCtx = {
  mode: "editor" | "viewer";
  app: Application;
  getModel: () => MapViewModel;

  ambientGRef: MutableRefObject<any>;
  animRef: MutableRefObject<any>;
  applyHoverTipRef: MutableRefObject<any>;
  battleFxRef: MutableRefObject<any>;
  battleSitesRef: MutableRefObject<any>;
  breathSitesRef: MutableRefObject<any>;
  brushGRef: MutableRefObject<any>;
  diplomacyGRef: MutableRefObject<any>;
  dirtyRef: MutableRefObject<any>;
  dragHintLabelRef: MutableRefObject<any>;
  drawingRef: MutableRefObject<any>;
  emblemLoadingRef: MutableRefObject<any>;
  emblemMapRef: MutableRefObject<any>;
  fleetsGRef: MutableRefObject<any>;
  fleetStackLabelMapRef: MutableRefObject<any>;
  hoveredSystemIdRef: MutableRefObject<any>;
  iconOverlayRef: MutableRefObject<any>;
  labelMapRef: MutableRefObject<any>;
  labelPlatesGRef: MutableRefObject<any>;
  labelsRef: MutableRefObject<any>;
  lastDtRef: MutableRefObject<any>;
  lastHoverTipRef: MutableRefObject<any>;
  lastMapStyleRef: MutableRefObject<any>;
  lastPointerWorldRef: MutableRefObject<any>;
  legionsGRef: MutableRefObject<any>;
  linksGRef: MutableRefObject<any>;
  mapFxRef: MutableRefObject<any>;
  marqueeRef: MutableRefObject<any>;
  ordersGRef: MutableRefObject<any>;
  panRef: MutableRefObject<any>;
  perfTierRef: MutableRefObject<any>;
  playerFactionIdRef: MutableRefObject<any>;
  sectorsGRef: MutableRefObject<any>;
  systemsGRef: MutableRefObject<any>;
  tableFloorGRef: MutableRefObject<any>;
  tableGridGRef: MutableRefObject<any>;
  territoryBorderGRef: MutableRefObject<any>;
  territoryFpRef: MutableRefObject<any>;
  territoryGRef: MutableRefObject<any>;
  territoryLayerRef: MutableRefObject<any>;
  transientFxRef: MutableRefObject<any>;
  unitDragRef: MutableRefObject<any>;
  unitDropHoverRef: MutableRefObject<any>;
  unitLastPosRef: MutableRefObject<any>;
  unitLastSystemRef: MutableRefObject<any>;
  unitTransitRef: MutableRefObject<any>;
  worldLayerRef: MutableRefObject<any>;
};

import {
  drawActivityBadge,
  drawBattleFx,
  drawContestedRing,
  drawCrossedSwords,
  drawDiplomacyLines,
  drawFactionLabels,
  drawCapitalEmblems,
  drawFleetGlyph,
  drawFleetStanceBadge,
  drawFogVeil,
  drawHoverRing,
  drawIntelRing,
  drawLegionGlyph,
  drawLegionStanceBadge,
  drawLink,
  drawOrderArrow,
  drawOrderArrowIso,
  drawOwnershipAura,
  drawLoyaltyAura,
  drawSectors,
  drawSelectionBrackets,
  drawTradeLanes,
  layoutFleetsAroundSystem,
  layoutLegionsAroundSystem,
  linkHasTraffic,
  resolveLabelScale,
  resolveMapLod,
} from "../drawMapIcons";
import { drawStarfield, drawTableFloor } from "../drawTableFx";
import { toIso } from "../iso";
import { isoInBounds, isoViewportBounds } from "../viewportCull";
import { isCorridorSystem, censusPlanets } from "../../state/planets";
import { getVisibleSystemIdsWithFog } from "../../state/fog";
import { isStatePolity } from "../../state/territory";
import { buildFactionThemeColorMap, resolveTheme } from "../styles";
import {
  drawHoloContestedClaim,
  drawHoloLink,
  drawHoloTrafficPulse,
  drawTableGrid,
  isHoloTheme,
} from "../styles/holoTheme";
import { mapIconsReady } from "../mapIconAssets";
import { fleetSlotIcon, legionSlotIcon } from "../mapIconSprites";
import {
  drawAnomalyField,
  drawBlockadeRing,
  drawCaravans,
  drawContestedClaim,
  drawDeadZone,
  drawEconomyBottleneckBadge,
  drawJumpRange,
  drawQuestMarker,
  drawSpecialLink,
  drawSupplyChains,
  drawTimerBadge,
  drawTrafficDensity,
} from "../drawMapFeatures";
import { ORDER_ARROW_COLORS } from "../../state/defaults";
import { questsAtSystem } from "../../state/mapFeatures";
import { hasSpaceObject } from "../../state/spaceObjects";
import { formatHopTurns, hopDistance, hopPath } from "../../state/pathfinding";
import { useWorldStore } from "../../state/worldStore";
import {
  FLEET_ICON_SIZE,
  FLEET_ICON_SIZE_SEL,
  LEGION_ICON_SIZE,
  LEGION_ICON_SIZE_SEL,
  SYSTEM_DROP_R,
} from "./constants";
import { resolveDropIntent } from "./dropIntent";
import { buildSystemHoverLines } from "./hover";
import {
  isFactionLabelKey,
  purgeThemeLabelCaches,
  resolveGraphics,
  resolveMapStyle,
  resolvePerfTier,
  STATIC_ANIM,
  territoryFingerprint,
} from "./perf";

/** @param pulseOnly skip territory/links/floor — idle glyph breathe only */
export function redrawAll(ctx: MapRedrawCtx, pulseOnly = false): void {
  const {
    mode,
    app,
    getModel,
    ambientGRef,
    animRef,
    applyHoverTipRef,
    battleFxRef,
    battleSitesRef,
    breathSitesRef,
    brushGRef,
    diplomacyGRef,
    dirtyRef,
    dragHintLabelRef,
    drawingRef,
    emblemLoadingRef,
    emblemMapRef,
    fleetsGRef,
    fleetStackLabelMapRef,
    hoveredSystemIdRef,
    iconOverlayRef,
    labelMapRef,
    labelPlatesGRef,
    labelsRef,
    lastDtRef,
    lastHoverTipRef,
    lastMapStyleRef,
    lastPointerWorldRef,
    legionsGRef,
    linksGRef,
    mapFxRef,
    marqueeRef,
    ordersGRef,
    panRef,
    perfTierRef,
    playerFactionIdRef,
    sectorsGRef,
    systemsGRef,
    tableFloorGRef,
    tableGridGRef,
    territoryBorderGRef,
    territoryFpRef,
    territoryGRef,
    territoryLayerRef,
    transientFxRef,
    unitDragRef,
    unitDropHoverRef,
    unitLastPosRef,
    unitLastSystemRef,
    unitTransitRef,
    worldLayerRef,
  } = ctx;
      if (!pulseOnly) {
        const stFocus = useWorldStore.getState();
        const focusId = stFocus.cameraFocusSystemId;
        if (focusId && worldLayerRef.current && app.renderer) {
          const sys = stFocus.world.systems.find((s) => s.id === focusId);
          useWorldStore.setState({ cameraFocusSystemId: null });
          if (sys) {
            const layer = worldLayerRef.current;
            const iso = toIso(sys.x, sys.y);
            const scale = layer.scale.x;
            layer.position.set(
              app.screen.width / 2 - iso.x * scale,
              app.screen.height / 2 - iso.y * scale,
            );
          }
        }
      }

      const model = getModel();
      const tableFloorG = tableFloorGRef.current;
      const ambientG = ambientGRef.current;
      const territoryG = territoryGRef.current;
      const territoryBorderG = territoryBorderGRef.current;
      const sectorsG = sectorsGRef.current;
      const diplomacyG = diplomacyGRef.current;
      const linksG = linksGRef.current;
      const systemsG = systemsGRef.current;
      const fleetsG = fleetsGRef.current;
      const legionsG = legionsGRef.current;
      const ordersG = ordersGRef.current;
      const labels = labelsRef.current;
      if (
        !linksG ||
        !systemsG ||
        !fleetsG ||
        !legionsG ||
        !ordersG ||
        !labels ||
        !ambientG ||
        !tableFloorG ||
        !territoryG ||
        !territoryBorderG ||
        !sectorsG ||
        !diplomacyG
      )
        return;

      if (!pulseOnly) dirtyRef.current = false;

      const {
        world,
        selectedSystemId,
        selectedFleetId,
        selectedLegionId,
        selectedLinkId,
        selectedSectorId,
        linkDraftFromId,
        sectorDraftPoints,
        showLinks,
        showOwnership,
        showTerritory,
        showSectors,
        showFactionLabels,
        showLabels,
        showFleets,
        showLegions,
        showOrders,
        showDiplomacy,
        showFogPreview,
        gmOmniscientView = true,
        fogMaskPreview,
        showJumpRange,
        showSupply,
        showCaravans,
        showBlockades,
        showDeadZones,
        showTraffic,
        showQuests,
        showLoyalty = false,
        showSignalFan = false,
        activeFactionId,
        perfMode,
      } = model;

      const tier = resolvePerfTier(mode, perfMode);
      const mapStyleResolved = resolveMapStyle(model, tier);
      const theme = resolveTheme(mapStyleResolved);
      if (mapStyleResolved !== lastMapStyleRef.current) {
        purgeThemeLabelCaches(
          labelsRef.current,
          labelMapRef.current,
          emblemMapRef.current,
          emblemLoadingRef.current,
        );
        lastMapStyleRef.current = mapStyleResolved;
        territoryFpRef.current = "";
      }
      perfTierRef.current = tier;
      const bare = tier === "bare";
      const gfx = resolveGraphics(model, tier);
      const anim =
        bare || !gfx.animations ? STATIC_ANIM : animRef.current;

      // Territory glow is baked in drawTerritoryGlow (no live BlurFilter).
      if (!pulseOnly && territoryLayerRef.current?.filters?.length) {
        territoryLayerRef.current.filters = [];
      }

      if (!pulseOnly) {
        if (bare || !gfx.tableFx) {
          tableFloorG.clear();
          ambientG.clear();
        } else {
          const starLite = tier === "lite";
          const cinematicBoost = gfx.cinematic && tier === "full";
          drawTableFloor(tableFloorG, anim, starLite);
          drawStarfield(ambientG, anim, {
            lite: starLite,
            cinematic: cinematicBoost,
          });
        }
      }

      const factionColors = buildFactionThemeColorMap(world.factions);
      const byId = new Map(world.systems.map((s) => [s.id, s]));
      // When omniscient is off, `world` is already faction-sliced (no veil needed).
      // With omniscient + fog preview, dim systems the active faction cannot see.
      const fogVisible =
        mode === "editor" &&
        gmOmniscientView &&
        showFogPreview &&
        activeFactionId
          ? getVisibleSystemIdsWithFog(
              useWorldStore.getState().world,
              activeFactionId,
              fogMaskPreview ?? [],
            )
          : null;
      const maskSet =
        fogMaskPreview && fogMaskPreview.length > 0
          ? new Set(fogMaskPreview)
          : null;

      const worldScale = worldLayerRef.current?.scale.x ?? 1;
      const lod = resolveMapLod(worldScale);
      const labelScale = resolveLabelScale(worldScale, lod);

      const layerForCull = worldLayerRef.current;
      const viewBounds =
        layerForCull && app.renderer
          ? isoViewportBounds(
              layerForCull.x,
              layerForCull.y,
              layerForCull.scale.x || 1,
              app.screen.width,
              app.screen.height,
              lod === "near" ? 120 : lod === "mid" ? 160 : 0,
            )
          : null;
      /** Far overview: draw all. Mid/near: frustum cull in iso space. */
      const useCull = lod !== "far" && viewBounds != null;
      const holoActive = isHoloTheme(theme);

      const tableGridG = tableGridGRef.current;
      if (!pulseOnly && tableGridG) {
        if (holoActive && !bare && viewBounds) {
          drawTableGrid(
            tableGridG,
            {
              x: viewBounds.minX,
              y: viewBounds.minY,
              width: viewBounds.maxX - viewBounds.minX,
              height: viewBounds.maxY - viewBounds.minY,
            },
          );
        } else {
          tableGridG.clear();
        }
      }

      if (!pulseOnly) {
      if (showTerritory) {
        const fp =
          territoryFingerprint(world) +
          ":" +
          mapStyleResolved +
          (bare ? ":bare" : "") +
          (gfx.territoryGlow ? ":glow" : ":flat");
        if (fp !== territoryFpRef.current) {
          territoryFpRef.current = fp;
          if (bare) {
            territoryG.clear();
          } else {
            theme.drawTerritory(territoryG, world, factionColors, anim, {
              rich: gfx.territoryGlow,
              cinematic: gfx.cinematic && tier === "full",
            });
          }
          theme.drawTerritoryBorder(
            territoryBorderG,
            world,
            factionColors,
            anim,
          );
        }
        territoryG.visible = !bare;
        territoryBorderG.visible = true;
      } else {
        territoryG.clear();
        territoryBorderG.clear();
        territoryFpRef.current = "";
        territoryG.visible = false;
        territoryBorderG.visible = false;
      }

      if (showSectors || sectorDraftPoints.length > 0) {
        drawSectors(
          sectorsG,
          world,
          selectedSectorId,
          sectorDraftPoints,
        );
      } else {
        sectorsG.clear();
      }

      linksG.clear();
      const holoTrafficSegments: {
        ax: number;
        ay: number;
        bx: number;
        by: number;
      }[] = [];
      if (showLinks) {
        for (const link of world.links) {
          const a = byId.get(link.fromId);
          const b = byId.get(link.toId);
          if (!a || !b) continue;
          if (useCull && viewBounds) {
            const ia = toIso(a.x, a.y);
            const ib = toIso(b.x, b.y);
            if (
              !isoInBounds(ia.x, ia.y, viewBounds) &&
              !isoInBounds(ib.x, ib.y, viewBounds)
            ) {
              continue;
            }
          }
          const selected = link.id === selectedLinkId;
          if (
            !drawSpecialLink(
              linksG,
              link,
              a.x,
              a.y,
              b.x,
              b.y,
              anim,
              selected,
            )
          ) {
            if (holoActive) {
              const traffic = linkHasTraffic(a, b, world);
              drawHoloLink(
                linksG,
                a.x,
                a.y,
                b.x,
                b.y,
                link.type,
                anim,
                selected,
              );
              if (
                traffic &&
                gfx.animations &&
                tier !== "bare" &&
                tier !== "lite"
              ) {
                holoTrafficSegments.push({
                  ax: a.x,
                  ay: a.y,
                  bx: b.x,
                  by: b.y,
                });
              }
            } else {
              drawLink(
                linksG,
                a.x,
                a.y,
                b.x,
                b.y,
                link.type,
                anim,
                selected,
                linkHasTraffic(a, b, world),
              );
            }
          }
        }
        if (
          holoActive &&
          gfx.animations &&
          tier !== "bare" &&
          tier !== "lite" &&
          holoTrafficSegments.length > 0
        ) {
          drawHoloTrafficPulse(linksG, holoTrafficSegments, anim);
        }
        if (linkDraftFromId) {
          const from = byId.get(linkDraftFromId);
          if (from) {
            const tip = toIso(from.x, from.y);
            linksG.circle(tip.x, tip.y, 10);
            linksG.stroke({ width: 2, color: 0xffe08a, alpha: 0.85 });
          }
        }
      }

      if (!bare && tier === "full") {
        if (showTraffic) {
          drawTrafficDensity(linksG, world, anim);
        }
        if (showSupply) {
          drawSupplyChains(linksG, world, activeFactionId ?? null, anim);
        }
        if (showCaravans) {
          drawCaravans(linksG, world, world.caravans ?? [], anim);
        }
        drawTradeLanes(linksG, world, anim);
      } else if (!bare && showSupply && tier === "soft") {
        drawSupplyChains(linksG, world, activeFactionId ?? null, anim);
      }

      if (
        showDiplomacy &&
        mode !== "viewer" &&
        !bare &&
        tier !== "lite"
      ) {
        drawDiplomacyLines(diplomacyG, world, anim);
      } else {
        diplomacyG.clear();
      }
      } // !pulseOnly — skip heavy layers on idle glyph breathe

      ordersG.clear();

      const fleetsBySystem = new Map<string, typeof world.fleets>();
      for (const f of world.fleets) {
        const list = fleetsBySystem.get(f.systemId) ?? [];
        list.push(f);
        fleetsBySystem.set(f.systemId, list);
      }
      const legionsBySystem = new Map<string, typeof world.legions>();
      for (const l of world.legions ?? []) {
        const list = legionsBySystem.get(l.systemId) ?? [];
        list.push(l);
        legionsBySystem.set(l.systemId, list);
      }

      if (showOrders) {
        for (const order of world.orders) {
          if (order.status !== "pending" && order.status !== "active") continue;
          let fromId = order.fromSystemId ?? null;
          if (!fromId && order.fleetId) {
            fromId =
              world.fleets.find((f) => f.id === order.fleetId)?.systemId ??
              null;
          }
          if (!fromId && order.legionId) {
            fromId =
              (world.legions ?? []).find((l) => l.id === order.legionId)?.systemId ??
              null;
          }
          const from = fromId ? byId.get(fromId) : null;
          const to = order.toSystemId ? byId.get(order.toSystemId) : null;
          if (!from || !to) continue;
          const color =
            order.type === "attack_system"
              ? 0xe85d4c
              : order.type === "claim_system"
                ? 0xf0c14a
                : 0x4cc9f0;
          if (
            order.type === "move_fleet" ||
            order.type === "move_legion"
          ) {
            const path = hopPath(
              world,
              from.id,
              to.id,
              order.type === "move_fleet" ? "fleet" : "legion",
            );
            if (path.length >= 2) {
              for (let i = 0; i < path.length - 1; i++) {
                const a = byId.get(path[i]!);
                const b = byId.get(path[i + 1]!);
                if (!a || !b) continue;
                drawOrderArrow(ordersG, a.x, a.y, b.x, b.y, color, anim);
              }
              continue;
            }
          }
          drawOrderArrow(ordersG, from.x, from.y, to.x, to.y, color, anim);
        }

        for (const fleet of world.fleets) {
          if (!fleet.route?.length) continue;
          const startSys = byId.get(fleet.systemId);
          if (!startSys) continue;
          const here = fleetsBySystem.get(fleet.systemId) ?? [fleet];
          const slots = layoutFleetsAroundSystem(
            startSys,
            here,
            anim,
            fleet.id,
          );
          const slot =
            slots.find(
              (s) =>
                s.fleet.id === fleet.id ||
                (s.fleetIds?.includes(fleet.id) ?? false),
            ) ?? slots[0];
          const startIso = slot
            ? { x: slot.x, y: slot.y }
            : toIso(startSys.x, startSys.y);
          const col =
            ORDER_ARROW_COLORS[fleet.stance] ??
            ORDER_ARROW_COLORS.move ??
            0x4cc9f0;
          let prevIso = startIso;
          for (const hopId of fleet.route) {
            const hop = byId.get(hopId);
            if (!hop) continue;
            const hopIso = toIso(hop.x, hop.y);
            drawOrderArrowIso(
              ordersG,
              prevIso.x,
              prevIso.y,
              hopIso.x,
              hopIso.y,
              col,
              anim,
            );
            prevIso = hopIso;
          }
        }

        for (const legion of world.legions ?? []) {
          const route = legion.route ?? [];
          if (!route.length) continue;
          const startSys = byId.get(legion.systemId);
          if (!startSys) continue;
          const here = legionsBySystem.get(legion.systemId) ?? [legion];
          const slots = layoutLegionsAroundSystem(
            startSys,
            here,
            anim,
            legion.id,
          );
          const slot =
            slots.find(
              (s) =>
                s.legion.id === legion.id ||
                (s.legionIds?.includes(legion.id) ?? false),
            ) ?? slots[0];
          const startIso = slot
            ? { x: slot.x, y: slot.y }
            : toIso(startSys.x, startSys.y);
          const col =
            ORDER_ARROW_COLORS[legion.status] ??
            ORDER_ARROW_COLORS.move ??
            0x4cc9f0;
          let prevIso = startIso;
          for (const hopId of route) {
            const hop = byId.get(hopId);
            if (!hop) continue;
            const hopIso = toIso(hop.x, hop.y);
            drawOrderArrowIso(
              ordersG,
              prevIso.x,
              prevIso.y,
              hopIso.x,
              hopIso.y,
              col,
              anim,
            );
            prevIso = hopIso;
          }
        }
      }

      systemsG.clear();
      labelPlatesGRef.current?.clear();
      const seen = new Set<string>();
      // fleetsBySystem / legionsBySystem already built above

      const systemsInView = useCull
        ? world.systems.filter((s) => {
            const ip = toIso(s.x, s.y);
            return isoInBounds(ip.x, ip.y, viewBounds!);
          })
        : world.systems;

      // Y-sort is expensive on phones — skip for lite/bare
      const sorted =
        bare || tier === "lite"
          ? systemsInView
          : [...systemsInView].sort((a, b) => {
              return toIso(a.x, a.y).y - toIso(b.x, b.y).y;
            });

      const battleMarkerIds = new Set<string>();
      const signalFlags = new Map<string, SystemSignalFlags>();
      const useMapSprites = mapIconsReady();
      // Hover wins for focus-dim / badge density; selection still draws brackets
      const focusId =
        hoveredSystemIdRef.current || selectedSystemId || null;
      const hasMapFocus = !!focusId;
      const battleSites: { id: string; x: number; y: number }[] = [];
      const fxSites: MapFxSite[] = [];
      const breathSites: { ix: number; iy: number; color: number }[] = [];
      // One-shot order-outcome flashes (move/attack/claim) — pruned here so
      // they naturally disappear once transientFxRef's expireAt passes.
      {
        const now = performance.now();
        const live = transientFxRef.current.filter(
          (t: { expireAt: number }) => t.expireAt > now,
        );
        transientFxRef.current = live;
        for (const t of live) fxSites.push({ id: t.id, kind: t.kind, x: t.x, y: t.y });
      }
      const useLiveFx =
        !!mapFxRef.current &&
        gfx.animations &&
        (tier === "full" || tier === "soft");
      /**
       * Live pulse on glyphs when animations on. Dirty rebuild is throttled
       * (~12fps) so idle map breathes without a 60fps full clear.
       */
      const geomAnim = gfx.animations && !bare ? anim : STATIC_ANIM;
      const selectedIds =
        model.selectedSystemIds ??
        (selectedSystemId ? [selectedSystemId] : []);
      const unitSlots: UnitSpriteSlot[] = [];
      const useUnitSprites = mapIconsReady();

      for (const s of sorted) {
        seen.add(s.id);
        const selected = selectedIds.includes(s.id);
        const here = fleetsBySystem.get(s.id) ?? [];
        const contested = new Set(here.map((f) => f.factionId)).size > 1;
        const ip = toIso(s.x, s.y);
        const fogged = !!(
          (fogVisible && !fogVisible.has(s.id)) ||
          (maskSet && maskSet.has(s.id))
        );

        if (!fogged && !bare) {
          const col = s.ownerFactionId
            ? (factionColors.get(s.ownerFactionId)?.system ?? 0x8a93a5)
            : 0x6b7358;
          if (gfx.animations) {
            breathSites.push({ ix: ip.x, iy: ip.y, color: col });
          }
        }

        const emphasize =
          s.id === selectedSystemId ||
          s.id === hoveredSystemIdRef.current;
        const dimMul = hasMapFocus && !emphasize ? 0.38 : 1;

        // Ownership rings only near or focused — cuts concentric noise on mid
        if (
          showOwnership &&
          s.ownerFactionId &&
          (lod === "near" || emphasize)
        ) {
          const owner = world.factions.find((f) => f.id === s.ownerFactionId);
          const coIds = s.coOwnerFactionIds ?? [];
          const shareColors =
            coIds.length > 0
              ? [
                  factionColors.get(s.ownerFactionId)?.system ?? 0x888888,
                  ...coIds.map(
                    (id) => factionColors.get(id)?.system ?? 0x888888,
                  ),
                ]
              : undefined;
          if (isStatePolity(owner) || (shareColors && shareColors.length >= 2)) {
            drawOwnershipAura(
              systemsG,
              s,
              factionColors.get(s.ownerFactionId)?.system ?? 0x888888,
              geomAnim,
              shareColors,
              { dim: dimMul, emphasize },
            );
          }
        }

        if (showLoyalty) {
          const inhabited = (s.planets || []).filter(
            (p) => (p.population ?? 0) > 0,
          );
          if (inhabited.length) {
            const avg =
              inhabited.reduce((sum, p) => sum + (p.loyalty ?? 50), 0) /
              inhabited.length;
            drawLoyaltyAura(systemsG, s, avg, geomAnim, { dim: dimMul });
          }
        }

        if (
          emphasize &&
          activeFactionId &&
          (s.visibleToFactionIds ?? []).includes(activeFactionId)
        ) {
          if (useLiveFx) {
            fxSites.push({ id: s.id, kind: "intel", x: s.x, y: s.y });
          } else {
            drawIntelRing(systemsG, s, anim);
          }
        }

        if (contested && showFleets) {
          if (useLiveFx) {
            fxSites.push({ id: s.id, kind: "contested", x: s.x, y: s.y });
          } else {
            drawContestedRing(systemsG, s, anim);
          }
        } else if (s.activity === "battle" && !mapIconsReady()) {
          const bp = toIso(s.x, s.y);
          drawCrossedSwords(
            systemsG,
            bp.x,
            bp.y - 34 - geomAnim.pulse * 0.6,
            0.75,
            geomAnim,
          );
        }

        const inBattle = s.activity === "battle" || contested;
        if (inBattle && gfx.battleFx && tier === "full") {
          if (useLiveFx) {
            fxSites.push({ id: s.id, kind: "battle", x: s.x, y: s.y });
          } else {
            drawBattleFx(systemsG, s, anim);
          }
          battleSites.push({ id: s.id, x: s.x, y: s.y });
        } else if (inBattle && gfx.battleFx && (tier === "soft" || tier === "lite")) {
          if (useLiveFx && tier === "soft") {
            fxSites.push({ id: s.id, kind: "battle", x: s.x, y: s.y });
          }
          battleSites.push({ id: s.id, x: s.x, y: s.y });
        }
        const objs = s.spaceObjects || (s.poiType && s.poiType !== "none" ? [s.poiType] : []);
        if (
          gfx.scarFx &&
          !inBattle &&
          (objs.includes("debris") || objs.includes("ruin")) &&
          (tier === "full" || tier === "soft")
        ) {
          battleSites.push({ id: `scar:${s.id}`, x: s.x, y: s.y });
        }
        if ((contested && showFleets) || s.activity === "battle") {
          battleMarkerIds.add(s.id);
        }

        if (showDeadZones && (s.scannerDeadZone || hasSpaceObject(s, "dead_zone"))) {
          drawDeadZone(systemsG, s, geomAnim);
        }
        if (s.anomalyMotion || hasSpaceObject(s, "anomaly")) {
          drawAnomalyField(systemsG, s, geomAnim);
        }
        if (holoActive) {
          drawHoloContestedClaim(systemsG, s, geomAnim);
        } else {
          drawContestedClaim(systemsG, s, geomAnim);
        }

        {
          const coIds = s.coOwnerFactionIds ?? [];
          const shareColors =
            s.ownerFactionId && coIds.length > 0
              ? [
                  factionColors.get(s.ownerFactionId)?.system ?? 0x888888,
                  ...coIds.map(
                    (id) => factionColors.get(id)?.system ?? 0x888888,
                  ),
                ]
              : undefined;
          theme.drawSystem(
            systemsG,
            s,
            selected,
            geomAnim,
            s.ownerFactionId
              ? factionColors.get(s.ownerFactionId)
              : undefined,
            lod,
            shareColors,
            { dim: dimMul, emphasize },
          );
        }
        if (!useMapSprites && emphasize) {
          drawActivityBadge(systemsG, s, geomAnim);
        }
        if (mode === "editor" && s.timers?.length && emphasize) {
          drawTimerBadge(systemsG, s, world.meta?.turn ?? 0, geomAnim);
        }

        if (showBlockades && s.blockaded && lod === "near" && !useMapSprites) {
          drawBlockadeRing(systemsG, s, geomAnim);
        }
        const systemQuests = showQuests
          ? questsAtSystem(world, s.id)
          : [];
        const hasActiveQuest =
          systemQuests.some((q) => q.status === "active") ||
          s.poiType === "quest" ||
          !!s.questId;
        // Quest = pin (Aceternity-style), not a crowded signal badge
        if (showQuests && lod !== "far" && hasActiveQuest) {
          drawQuestMarker(systemsG, s, systemQuests, geomAnim);
        }
        const economyBn =
          !!model.economyBottleneckSystemIds?.includes(s.id);
        if (lod !== "far" && economyBn && !useMapSprites && emphasize) {
          drawEconomyBottleneckBadge(systemsG, s, geomAnim);
        }

        if (useMapSprites && lod !== "far") {
          signalFlags.set(s.id, {
            blockaded: !!(showBlockades && s.blockaded),
            hasQuest: showQuests && hasActiveQuest,
            economyBottleneck: economyBn,
          });
        }

        if (fogged) {
          drawFogVeil(systemsG, s);
        }

        if (selected) {
          if (useLiveFx) {
            fxSites.push({ id: s.id, kind: "selection", x: s.x, y: s.y });
          } else {
            drawSelectionBrackets(systemsG, s, anim);
          }
        } else if (
          !fogged &&
          hoveredSystemIdRef.current === s.id &&
          !bare
        ) {
          drawHoverRing(systemsG, s, geomAnim);
        }

        const hasQuest = hasActiveQuest;
        const inhabited =
          s.isCapital || censusPlanets(s.planets ?? []).inhabited > 0;
        const showSystemLabel =
          !!showLabels &&
          (selected ||
            lod === "near" ||
            (lod === "mid" && (inhabited || hasQuest)));

        if (showSystemLabel) {
          let label = labelMapRef.current.get(s.id);
          const tag = isCorridorSystem(s) ? "◇ " : s.isCapital ? "★ " : "";
          const fill = isCorridorSystem(s)
            ? 0xc9a227
            : s.isCapital
              ? 0xe8c547
              : inhabited
                ? 0xdce4f0
                : 0xb8c2d0;
          const fontSize = lod === "mid" ? 12 : 11;
          const weight = inhabited || s.isCapital ? "700" : "600";
          const useLabelShadows =
            !bare &&
            tier !== "lite" &&
            (gfx.labelShadows || (gfx.cinematic && tier === "full"));
          if (!label) {
            label = new Text({
              text: tag + s.name,
              style: {
                fontSize,
                fill,
                fontFamily: "Rajdhani, Segoe UI, sans-serif",
                fontWeight: weight,
                letterSpacing: 0.4,
                stroke: { color: 0x05070c, width: 3.5, join: "round" },
                ...(useLabelShadows
                  ? {
                      dropShadow: {
                        color: 0x000000,
                        alpha: gfx.cinematic && tier === "full" ? 0.48 : 0.35,
                        blur: gfx.cinematic && tier === "full" ? 3 : 2,
                        distance: 1,
                        angle: Math.PI / 2,
                      },
                    }
                  : {}),
              },
            });
            label.anchor.set(0.5, 0);
            labelMapRef.current.set(s.id, label);
            labels.addChild(label);
          }
          label.text = tag + s.name;
          label.style.fill = fill;
          label.style.fontSize = fontSize;
          label.style.fontWeight = weight;
          label.visible = true;
          label.scale.set(labelScale);
          const labelY = ip.y + 24 * labelScale;
          label.position.set(ip.x, labelY);
          const baseA =
            (fogged ? 0.22 : lod === "mid" ? 0.8 : 0.9) * dimMul;
          label.alpha = baseA;
          (
            label as Text & { __baseAlpha?: number }
          ).__baseAlpha = baseA;

          const plateG = labelPlatesGRef.current;
          if (plateG) {
            const padX = 7 * labelScale;
            const padY = 3 * labelScale;
            const tw = label.width + padX * 2;
            const th = label.height + padY * 2;
            plateG.roundRect(
              ip.x - tw / 2,
              labelY - padY,
              tw,
              th,
              5 * labelScale,
            );
            plateG.fill({ color: 0x05070c, alpha: fogged ? 0.4 : 0.55 });
            plateG.roundRect(
              ip.x - tw / 2,
              labelY - padY,
              tw,
              th,
              5 * labelScale,
            );
            plateG.stroke({
              width: 1 * labelScale,
              color: 0x6b7a90,
              alpha: fogged ? 0.18 : 0.28,
            });
          }
        } else {
          const label = labelMapRef.current.get(s.id);
          if (label) label.visible = false;
        }
      }

      if (useCull) {
        for (const [id, label] of labelMapRef.current) {
          if (!seen.has(id)) label.visible = false;
        }
      }

      if (showJumpRange) {
        const jumpSys =
          (selectedFleetId
            ? byId.get(
                world.fleets.find((f) => f.id === selectedFleetId)?.systemId ??
                  "",
              )
            : null) ??
          (selectedSystemId ? byId.get(selectedSystemId) : null);
        if (jumpSys) drawJumpRange(systemsG, jumpSys, undefined, geomAnim);
      }

      // System markers synced after unit slots are collected below
      if (!bare) {
        const enableBattle =
          (gfx.battleFx || gfx.scarFx) && (tier === "full" || tier === "soft");
        battleFxRef.current?.setEnabled(enableBattle);
        battleSitesRef.current = enableBattle ? battleSites : [];
        battleFxRef.current?.sync(
          battleSitesRef.current,
          lastDtRef.current,
        );
        mapFxRef.current?.setEnabled(useLiveFx);
        mapFxRef.current?.sync(useLiveFx ? fxSites : []);
        if (useLiveFx) mapFxRef.current?.tick(anim);
        breathSitesRef.current = breathSites;
      } else {
        battleSitesRef.current = [];
        breathSitesRef.current = [];
        mapFxRef.current?.sync([]);
      }

      const selectedFacId = selectedSystemId
        ? byId.get(selectedSystemId)?.ownerFactionId ?? null
        : null;
      const showPolityLabels =
        showFactionLabels && (lod === "near" || !!selectedFacId);

      if (showPolityLabels) {
        if (theme.drawFactionLabels) {
          theme.drawFactionLabels(
            labels,
            world,
            anim,
            labelMapRef.current,
            emblemMapRef.current,
            emblemLoadingRef.current,
            factionColors,
            labelScale * (lod === "far" ? 1.0 : lod === "mid" ? 0.92 : 0.85),
            lod === "near" ? undefined : selectedFacId ?? undefined,
          );
        } else {
          drawFactionLabels(
            labels,
            world,
            anim,
            labelMapRef.current,
            emblemMapRef.current,
            emblemLoadingRef.current,
            labelScale * (lod === "far" ? 1.0 : lod === "mid" ? 0.92 : 0.85),
            lod === "near" ? undefined : selectedFacId ?? undefined,
          );
        }
        if (lod !== "far") {
          drawCapitalEmblems(
            labels,
            world,
            anim,
            emblemMapRef.current,
            emblemLoadingRef.current,
          );
        } else {
          for (const [key, sprite] of emblemMapRef.current) {
            if (key.startsWith("capemb:")) sprite.visible = false;
          }
        }
      } else {
        for (const [key, label] of labelMapRef.current) {
          if (isFactionLabelKey(key)) label.visible = false;
        }
        for (const sprite of emblemMapRef.current.values()) {
          sprite.visible = false;
        }
        // Theme plaques are Graphics under labels — hide so they don't float alone.
        for (const child of labels.children) {
          if (child instanceof Graphics) child.visible = false;
        }
      }

      fleetsG.clear();
      const seenFleetStacks = new Set<string>();
      const drag = unitDragRef.current;
      const dragIso = drag?.moved
        ? toIso(lastPointerWorldRef.current.x, lastPointerWorldRef.current.y)
        : null;

      let dropTarget: StarSystem | null = null;
      const hostileUnitDrop = unitDropHoverRef.current;
      if (drag?.moved && dragIso) {
        const tip = dragIso;
        let bestD = SYSTEM_DROP_R * SYSTEM_DROP_R;
        for (const s of world.systems) {
          const sp = toIso(s.x, s.y);
          const dx = tip.x - sp.x;
          const dy = (tip.y - sp.y) * 1.6;
          const d = dx * dx + dy * dy;
          if (d <= bestD) {
            bestD = d;
            dropTarget = s;
          }
        }
        if (hostileUnitDrop) {
          dropTarget =
            world.systems.find((s) => s.id === hostileUnitDrop.systemId) ??
            dropTarget;
        }
      }

      if (hostileUnitDrop && drag) {
        const unit =
          drag.kind === "fleet"
            ? world.fleets.find((x) => x.id === drag.id)
            : (world.legions ?? []).find((x) => x.id === drag.id);
        const travelMode = drag.kind === "fleet" ? "fleet" : "legion";
        const hops = hopDistance(
          world,
          unit?.systemId,
          hostileUnitDrop.systemId,
          travelMode,
        );
        const path = hopPath(
          world,
          unit?.systemId,
          hostileUnitDrop.systemId,
          travelMode,
        );
        const reachable = Number.isFinite(hops) && hops > 0;
        const same = hops === 0;
        const ring = 0xe85d4c;
        const ringSoft = 0xff8a7a;
        const ringAlpha = reachable || same ? 0.92 : 0.5;
        if (path.length >= 2) {
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < path.length - 1; i++) {
              const a = byId.get(path[i]!);
              const b = byId.get(path[i + 1]!);
              if (!a || !b) continue;
              const ai = toIso(a.x, a.y);
              const bi = toIso(b.x, b.y);
              fleetsG.moveTo(ai.x, ai.y);
              fleetsG.lineTo(bi.x, bi.y);
            }
            fleetsG.stroke(
              pass === 0
                ? { width: 5, color: 0x05070c, alpha: 0.55 }
                : { width: 2.4, color: ring, alpha: ringAlpha },
            );
          }
        }
        fleetsG.circle(hostileUnitDrop.isoX, hostileUnitDrop.isoY, 22);
        fleetsG.stroke({ width: 2.4, color: ring, alpha: 0.95 });
        fleetsG.circle(hostileUnitDrop.isoX, hostileUnitDrop.isoY, 14);
        fleetsG.stroke({ width: 1, color: ringSoft, alpha: 0.5 });
        const targetName =
          hostileUnitDrop.targetKind === "fleet"
            ? world.fleets.find((f) => f.id === hostileUnitDrop!.targetId)
                ?.name
            : (world.legions ?? []).find((l) => l.id === hostileUnitDrop!.targetId)
                ?.name;
        const hint = same
          ? `атака · ${targetName ?? "цель"}`
          : reachable
            ? `атака · ${formatHopTurns(hops)}`
            : "нет пути";
        let tip = dragHintLabelRef.current;
        if (!tip) {
          tip = new Text({
            text: hint,
            style: {
              fontSize: 14,
              fill: 0xffb0a4,
              fontFamily: "Rajdhani, Segoe UI, sans-serif",
              fontWeight: "700",
              stroke: { color: 0x05070c, width: 3.5 },
            },
          });
          tip.anchor.set(0.5, 1);
          dragHintLabelRef.current = tip;
          labels.addChild(tip);
        }
        tip.text = hint;
        tip.style.fill = reachable || same ? 0xffb0a4 : 0xff8a7a;
        tip.visible = true;
        tip.position.set(hostileUnitDrop.isoX, hostileUnitDrop.isoY - 28);
      } else if (dropTarget && drag) {
        const unit =
          drag.kind === "fleet"
            ? world.fleets.find((x) => x.id === drag.id)
            : (world.legions ?? []).find((x) => x.id === drag.id);
        const travelMode = drag.kind === "fleet" ? "fleet" : "legion";
        const hops = hopDistance(
          world,
          unit?.systemId,
          dropTarget.id,
          travelMode,
        );
        const path = hopPath(
          world,
          unit?.systemId,
          dropTarget.id,
          travelMode,
        );
        const reachable = Number.isFinite(hops) && hops > 0;
        const same = hops === 0;
        // Intent color: gold=move, red=attack, cyan=claim. Reachability dims it.
        const intent =
          mode === "viewer"
            ? resolveDropIntent(
                dropTarget,
                playerFactionIdRef.current,
                world,
              )
            : "move";
        const intentColor =
          intent === "attack"
            ? 0xe85d4c
            : intent === "claim"
              ? 0x5fd0e6
              : 0xc9a227;
        const intentSoft =
          intent === "attack"
            ? 0xff8a7a
            : intent === "claim"
              ? 0x9be8f6
              : 0xffe08a;
        const unreachable = !reachable && !(same && intent === "attack");
        const ring = unreachable ? 0xe85d4c : intentColor;
        const ringSoft = unreachable ? 0xff8a7a : intentSoft;
        const ringAlpha = reachable ? 0.92 : same ? 0.6 : 0.5;
        if (path.length >= 2) {
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < path.length - 1; i++) {
              const a = byId.get(path[i]!);
              const b = byId.get(path[i + 1]!);
              if (!a || !b) continue;
              const ai = toIso(a.x, a.y);
              const bi = toIso(b.x, b.y);
              fleetsG.moveTo(ai.x, ai.y);
              fleetsG.lineTo(bi.x, bi.y);
            }
            fleetsG.stroke(
              pass === 0
                ? { width: 5, color: 0x05070c, alpha: 0.55 }
                : {
                    width: 2.4,
                    color: ring,
                    alpha: ringAlpha,
                  },
            );
          }
        }
        const dp = toIso(dropTarget.x, dropTarget.y);
        fleetsG.circle(dp.x, dp.y, 28);
        fleetsG.stroke({
          width: 2.2,
          color: ring,
          alpha: 0.9,
        });
        fleetsG.circle(dp.x, dp.y, 20);
        fleetsG.stroke({
          width: 1,
          color: ringSoft,
          alpha: 0.45,
        });
        const intentLabel =
          intent === "attack" ? "атака" : intent === "claim" ? "захват" : "";
        const hint = same
          ? intent === "attack"
            ? "атака · здесь"
            : "уже здесь"
          : reachable
            ? `${intentLabel ? `${intentLabel} · ` : ""}${formatHopTurns(hops)}`
            : "нет пути";
        let tip = dragHintLabelRef.current;
        if (!tip) {
          tip = new Text({
            text: hint,
            style: {
              fontSize: 14,
              fill: 0xffe8a8,
              fontFamily: "Rajdhani, Segoe UI, sans-serif",
              fontWeight: "700",
              stroke: { color: 0x05070c, width: 3.5 },
            },
          });
          tip.anchor.set(0.5, 1);
          dragHintLabelRef.current = tip;
          labels.addChild(tip);
        }
        tip.text = hint;
        tip.style.fill = unreachable
          ? 0xffb0a4
          : intent === "attack"
            ? 0xffb0a4
            : intent === "claim"
              ? 0x9be8f6
              : 0xffe8a8;
        tip.visible = true;
        tip.position.set(dp.x, dp.y - 32);
      } else if (dragHintLabelRef.current) {
        dragHintLabelRef.current.visible = false;
      }

      /** Detect a fleet/legion's systemId change and seed a move tween from
       * its last known screen pos — ticked every frame in tickFxLayers. */
      const registerUnitTransit = (
        key: string,
        systemId: string,
        x: number,
        y: number,
      ) => {
        const lastSys = unitLastSystemRef.current.get(key);
        const lastPos = unitLastPosRef.current.get(key);
        if (lastSys != null && lastSys !== systemId && lastPos) {
          unitTransitRef.current.set(key, {
            fromX: lastPos.x,
            fromY: lastPos.y,
            toX: x,
            toY: y,
            startedAt: performance.now(),
          });
        }
        unitLastSystemRef.current.set(key, systemId);
        unitLastPosRef.current.set(key, { x, y });
      };

      if (showFleets) {
        const fleetDraw: {
          y: number;
          slot: ReturnType<typeof layoutFleetsAroundSystem>[number];
          col: number;
        }[] = [];
        for (const [sysId, fleets] of fleetsBySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          if (fogVisible && !fogVisible.has(sysId)) continue;
          const visibleFleets =
            drag?.kind === "fleet" && drag.moved
              ? fleets.filter((f) => f.id !== drag.id)
              : fleets;
          if (visibleFleets.length === 0) continue;
          for (const slot of layoutFleetsAroundSystem(
            sys,
            visibleFleets,
            anim,
            selectedFleetId,
          )) {
            fleetDraw.push({
              y: slot.y,
              slot,
              col: factionColors.get(slot.fleet.factionId)?.system ?? 0xcccccc,
            });
          }
        }
        fleetDraw.sort((a, b) => a.y - b.y);
        for (const item of fleetDraw) {
          const selected =
            item.slot.fleet.id === selectedFleetId ||
            (item.slot.fleetIds?.includes(selectedFleetId ?? "") ?? false);
          if (useUnitSprites) {
            registerUnitTransit(
              `fleet:${item.slot.fleet.id}`,
              item.slot.fleet.systemId,
              item.slot.x,
              item.slot.y,
            );
            unitSlots.push({
              key: `fleet:${item.slot.fleet.id}`,
              x: item.slot.x,
              y: item.slot.y,
              icon: fleetSlotIcon(item.slot.fleet.kind),
              tint: item.col,
              size: selected ? FLEET_ICON_SIZE_SEL : FLEET_ICON_SIZE,
              selected,
              stackCount: item.slot.stackCount,
            });
            drawFleetStanceBadge(
              fleetsG,
              item.slot.x,
              item.slot.y,
              item.slot.fleet.stance,
              selected,
              item.slot.stackCount ?? 1,
            );
          } else {
            drawFleetGlyph(
              fleetsG,
              item.slot.x,
              item.slot.y,
              item.col,
              selected,
              item.slot.fleet.stance,
              anim,
              item.slot.fleet.kind ?? "combat",
              item.slot.stackCount ?? 1,
            );
          }
          const stackKey = `fleet:${item.slot.fleet.systemId}:${item.slot.fleet.factionId}`;
          if ((item.slot.stackCount ?? 1) > 1) {
            seenFleetStacks.add(stackKey);
            let stackLabel = fleetStackLabelMapRef.current.get(stackKey);
            if (!stackLabel) {
              stackLabel = new Text({
                text: `×${item.slot.stackCount}`,
                style: {
                  fontSize: 10,
                  fill: 0xa8e4ef,
                  fontFamily: "Rajdhani, Segoe UI, sans-serif",
                  fontWeight: "700",
                  stroke: { color: 0x05070c, width: 2 },
                },
              });
              stackLabel.anchor.set(0.5);
              fleetStackLabelMapRef.current.set(stackKey, stackLabel);
              labels.addChild(stackLabel);
            }
            stackLabel.text = `×${item.slot.stackCount}`;
            stackLabel.visible = true;
            stackLabel.position.set(item.slot.x - 10, item.slot.y - 10);
          }
        }

        if (drag?.kind === "fleet" && drag.moved && dragIso) {
          const f = world.fleets.find((x) => x.id === drag.id);
          if (f) {
            const col = factionColors.get(f.factionId)?.system ?? 0xcccccc;
            if (useUnitSprites) {
              unitSlots.push({
                key: `fleet-drag:${f.id}`,
                x: dragIso.x,
                y: dragIso.y,
                icon: fleetSlotIcon(f.kind),
                tint: col,
                size: FLEET_ICON_SIZE_SEL,
                selected: true,
              });
              drawFleetStanceBadge(fleetsG, dragIso.x, dragIso.y, f.stance, true, 1);
            } else {
              drawFleetGlyph(
                fleetsG,
                dragIso.x,
                dragIso.y,
                col,
                true,
                f.stance,
                anim,
                f.kind ?? "combat",
                1,
              );
            }
          }
        }
      }

      legionsG.clear();
      if (showLegions) {
        for (const [sysId, legs] of legionsBySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          if (fogVisible && !fogVisible.has(sysId)) continue;
          const visibleLegs =
            drag?.kind === "legion" && drag.moved
              ? legs.filter((l) => l.id !== drag.id)
              : legs;
          for (const slot of layoutLegionsAroundSystem(
            sys,
            visibleLegs,
            anim,
            selectedLegionId,
          )) {
            const selected =
              slot.legion.id === selectedLegionId ||
              (slot.legionIds?.includes(selectedLegionId ?? "") ?? false);
            const col = factionColors.get(slot.legion.factionId)?.system ?? 0xcccccc;
            if (useUnitSprites) {
              registerUnitTransit(
                `legion:${slot.legion.id}`,
                slot.legion.systemId,
                slot.x,
                slot.y,
              );
              unitSlots.push({
                key: `legion:${slot.legion.id}`,
                x: slot.x,
                y: slot.y,
                icon: legionSlotIcon(slot.legion.status),
                tint: col,
                size: selected ? LEGION_ICON_SIZE_SEL : LEGION_ICON_SIZE,
                selected,
                stackCount: slot.stackCount,
              });
              drawLegionStanceBadge(
                legionsG,
                slot.x,
                slot.y,
                slot.legion.status,
                selected,
              );
            } else {
              drawLegionGlyph(
                legionsG,
                slot.x,
                slot.y,
                col,
                selected,
                slot.legion.status,
                anim,
              );
            }
            const stackKey = `legion:${slot.legion.systemId}:${slot.legion.factionId}`;
            if ((slot.stackCount ?? 1) > 1) {
              seenFleetStacks.add(stackKey);
              let stackLabel = fleetStackLabelMapRef.current.get(stackKey);
              if (!stackLabel) {
                stackLabel = new Text({
                  text: `×${slot.stackCount}`,
                  style: {
                    fontSize: 10,
                    fill: 0xa8e4ef,
                    fontFamily: "Rajdhani, Segoe UI, sans-serif",
                    fontWeight: "700",
                    stroke: { color: 0x05070c, width: 2 },
                  },
                });
                stackLabel.anchor.set(0.5);
                fleetStackLabelMapRef.current.set(stackKey, stackLabel);
                labels.addChild(stackLabel);
              }
              stackLabel.text = `×${slot.stackCount}`;
              stackLabel.visible = true;
              stackLabel.position.set(slot.x - 10, slot.y - 10);
            }
          }
        }
        if (drag?.kind === "legion" && drag.moved && dragIso) {
          const l = (world.legions ?? []).find((x) => x.id === drag.id);
          if (l) {
            const col = factionColors.get(l.factionId)?.system ?? 0xcccccc;
            if (useUnitSprites) {
              unitSlots.push({
                key: `legion-drag:${l.id}`,
                x: dragIso.x,
                y: dragIso.y,
                icon: legionSlotIcon(l.status),
                tint: col,
                size: LEGION_ICON_SIZE_SEL,
                selected: true,
              });
              drawLegionStanceBadge(legionsG, dragIso.x, dragIso.y, l.status, true);
            } else {
              drawLegionGlyph(
                legionsG,
                dragIso.x,
                dragIso.y,
                col,
                true,
                l.status,
                anim,
              );
            }
          }
        }
      }

      for (const [key, stackLabel] of fleetStackLabelMapRef.current) {
        if (!seenFleetStacks.has(key)) {
          labels.removeChild(stackLabel);
          stackLabel.destroy();
          fleetStackLabelMapRef.current.delete(key);
        }
      }

      if (!bare) {
        iconOverlayRef.current?.sync(sorted, anim, {
          battleMarkerIds,
          unitSlots,
          lod,
          signalFlags,
          signalFan: showSignalFan,
          emphasisId: focusId,
          questAsPin: true,
          plateStyle: theme.iconPlateStyle,
        });
      }

      // DOM hover tip — dense stats off the map billboards (imperative, no React setState)
      {
        const hid = hoveredSystemIdRef.current;
        const wl = worldLayerRef.current;
        if (
          hid &&
          wl &&
          !panRef.current.active &&
          (lod === "mid" || lod === "near")
        ) {
          const hs = byId.get(hid);
          if (hs) {
            const tipP = toIso(hs.x, hs.y);
            const sx = tipP.x * wl.scale.x + wl.x;
            const sy = tipP.y * wl.scale.y + wl.y - 36 * wl.scale.y;
            applyHoverTipRef.current({
              systemId: hs.id,
              name: hs.name,
              screenX: sx,
              screenY: sy,
              lines: buildSystemHoverLines(hs),
            });
          }
        } else if (lastHoverTipRef.current) {
          applyHoverTipRef.current(null);
        }
      }

      for (const [id, label] of labelMapRef.current) {
        if (isFactionLabelKey(id)) continue;
        if (!seen.has(id)) {
          labels.removeChild(label);
          label.destroy();
          labelMapRef.current.delete(id);
        } else if (!showLabels) {
          label.visible = false;
        }
      }

      const brushG = brushGRef.current;
      const mq = marqueeRef.current;
      if (brushG && mq?.active && !drawingRef.current) {
        brushG.clear();
        const x = Math.min(mq.x0, mq.x1);
        const y = Math.min(mq.y0, mq.y1);
        const w = Math.abs(mq.x1 - mq.x0);
        const h = Math.abs(mq.y1 - mq.y0);
        brushG.rect(x, y, w, h);
        brushG.fill({ color: 0xc9a227, alpha: 0.08 });
        brushG.rect(x, y, w, h);
        brushG.stroke({ width: 1.5, color: 0xe8c547, alpha: 0.85 });
      }
}
