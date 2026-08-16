# Client UI & Galaxy Map: Grill / Discovery Notes

Date: 2026-08-15 · Goal: pin down how the new client (`client-web/`, currently a 193-line placeholder) gets built — the galaxy map's rendering architecture, and how gesture-primacy (already settled project paradigm, `docs/UI_SYSTEMS_MASTER_SPEC.md` §1) extends to every new mechanic designed 2026-08-14 (tech tree 2.0, court/NPC roster, boarding, stability/revolt, adjacency/movement, currency peg).

## Context established before Q1 (from free-form discussion, being confirmed not re-derived)

- `docs/UI_SYSTEMS_MASTER_SPEC.md` §1 is the standing paradigm: gestures-primacy (drag/long-press/pinch/wheel over menus/sliders), intuitiveness (preview-before-action, traffic-light colors), functionality ("2-step rule"), and "Engine few verbs, Content many nouns" (UI never hardcodes entity ids/effects, renders declaratively from content packs). Only Economy + Science sections are fully speced there; map, GM/player split, court, boarding, stability, adjacency are NOT covered by it at all.
- GMap's `MapCanvas.tsx` (4400 lines) has real, working, reusable math: `iso.ts` projection, BFS hop-range, links hit-testing, fog/territory via pluggable "theme" draw functions, fleet/legion glyphs with drag+tween. Proposal: port the math, split the monolith into small per-layer files (`iso.ts`, `systemLayer.ts`, `unitLayer.ts`, `interactionLayer.ts`, thin `MapStage.tsx` assembly) — same "many small pieces" pattern GMap's own `GmWorkbench` already proved for GM tooling.
- Proposed gesture-to-new-mechanic mapping (extends the existing gesture table, doesn't invent new verbs): drag fleet→system = move (existing), drag legion→enemy fleet = boarding (kind-mismatch drag reads as the action), long-press unit = radial menu (move/blockade/fortify/engage/board), drag NPC card→council seat/system/force glyph = seat/governor/commander assignment (one verb, three nouns), drag resource→tech socket = fill socket (reuses existing "drag cognitio→tech node" verb), drag strategic resource→treasury icon = set/change currency peg.
- Stability proposed to reuse the existing traffic-light color language (green/yellow/red, already defined for economy surplus/deficit) rather than a new visual vocabulary.
- Council panel proposed as a radial layout — `council_seats.json` already carries `angleDeg` per seat (a round-table layout is already latent in the content, not invented).
- Proposed reusing the fully-speced Economy/Science panel template (Sidebar + content, drag/resize/snap window) as the structural pattern for every other panel (Court/Forces/Diplomacy/Quests), not just those two.

## Summary / key decisions

(filled in as we go)

## Q&A log

## Open flags (pending input)
