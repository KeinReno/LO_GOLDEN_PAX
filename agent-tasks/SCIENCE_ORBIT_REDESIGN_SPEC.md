# Science / Research Screen — Orbit Redesign Spec

> **Handoff spec for an implementing agent.** Owner has reviewed and confirmed the direction across a long design pass (visual reference: [design canvas](https://claude.ai/code/artifact/1cb5dfb4-9f7f-4fc0-a866-8efe2a1c5d31), 11 artboards). This document is the single source of truth for what to build — the canvas is illustrative, this file is authoritative on rules/thresholds where they differ.
>
> **This is a rebuild, not a patch.** Owner's explicit instruction: do not let existing CSS classes or markup in `ResearchPanel.tsx` / `app.css` (`.research-*` classes, current `research-panel-head`/`research-tree-body`/`research-desk-bar` structure) pull the new design back toward the old layout. New component tree, new class names, new file(s). Old code gets deleted once parity is reached, not kept "just in case."
>
> **Model guidance:** this spec requires real design judgment at several points (silhouette shapes, phase thresholds, interaction feel) — not a mechanical port. Recommend Sonnet/Opus tier for implementation, not Haiku (matches the reasoning already applied to RP_CHAT_CONSOLIDATION_SPEC).

---

## 0. The problem (context, already diagnosed)

Current `src/viewer/ResearchPanel.tsx` (1178 lines) stacks 6 UI zones with no hierarchy: mode tabs, 7 direction tabs + search, collapsible queue+forecast rail, collapsible "Пути развития" fold (RoleScore/"Прорыв"), offers strip, and a pan/zoom graph (`research/graph/TechGraphCanvas.tsx`, 608 lines) rendering all reachable nodes at once. Two more problems compound it:

- **"Прорыв" (breakthrough) is broken for 6 of 8 RoleScore paths** — content gap (missing `breakthroughTechId` + cluster techs in `tech_paths.json`), confirmed via `npm run validate:tech`'s WARN output. Even the 2 working paths aren't visually distinct from the fold they're buried in.
- **The graph tries to render the whole reachable subtree at once.** At 608 total technologies (confirmed count, `content/core/technologies.json`) this doesn't scale — verified directly by rendering all 608 in the orbit layout (`OrbitFull.dc.html` on the canvas): nodes don't overlap (math is sound) but the result is unreadable past the 2nd ring.

## 1. Locked decisions (do not re-litigate)

### 1a. Three-tier screen structure
Replaces all 6 stacked zones with a strict hierarchy:
1. **Always-visible top bar** — current queue (compact slots) + tech offers (Stellaris-style cards), never collapsed.
2. **Center — the graph**, default showing only a "horizon" (researched + immediate frontier), never the full tree by default. Full-tree view reachable via one explicit button, returns to horizon via the same control.
3. **Side strip — faction specialization** (replaces the buried "Пути развития" fold and the separate `PathsStrip.tsx` topbar chip — **one source of truth, not two**). Gauges with a marked breakthrough threshold, not a button.

Reference: `Main.dc.html` (horizon default) / `Expanded.dc.html` (full-tree expanded) on the design canvas.

### 1b. Graph rendering: orbit / radial, not columns
Chosen over the column/DAG (current) and organic-web (Endless Space 2 style) alternatives. Rationale: each technology has exactly one owning direction in the data model (or should — see §3), so a radial partition algorithm applies cleanly and computes automatically as content grows — unlike a hand-authored web layout (which is what ES2 actually is, confirmed via research) or manual column tuning.

**Layout math** (do not reimplement by hand — use `d3-hierarchy`'s `partition()` layout, reinterpreting its `x` output as angle and `y` as radius):
- **Angle is a budget, not fixed.** Each of the 6 directions gets angular width proportional to its *real* (non-`catalogPending`) technology count, recomputed from live data — not a fixed 60°×6. See §3 for why this matters right now.
- **Ring radius is computed, not fixed per tier.** `radius ≈ (nodeCount at this ring × nodePitchPx) / sectorAngleRadians`. A crowded ring pushes outward; rings are NOT uniform circles across sectors (each sector's own ring radius differs — this is correct, not a bug). Verified with real numbers on `OrbitScale.dc.html`.
- **Edges cross sector boundaries freely.** Only NODE placement must never overlap; a tech with a cross-direction prerequisite just draws a line across the wedge boundary.
- **Node positions are stable for the life of a save.** Position is a pure function of (direction, total content count in that direction, the node's rank within it) — never recomputed from "what's currently researched." Only a node's *state* (locked/afford/done) changes turn to turn. New content appended later goes at the outer edge of the outermost ring, not interleaved (protects existing near-complete factions from a visual reshuffle — see §5).

### 1c. Horizon clipping + cluster badges (the anti-overload mechanism)
Never render more than researched + a capped frontier sample per sector:
- Frontier sample size: cap at **8** immediate-neighbor nodes shown individually beyond the researched core, regardless of how many are actually unlocked-and-affordable.
- Beyond that: if remaining-in-sector ≤ **14**, show them directly (dim, locked style) — no badge needed at that count. If remaining > 14, collapse into a single `+N` cluster badge per sector, positioned at the edge of the last rendered ring. Clicking a badge expands that sector only (not the whole tree).
- "Expand full tree" (top-right control) bypasses horizon clipping entirely for the session — shows every node in every sector at once, with a minimap (bottom-right corner, matching `Expanded.dc.html`) since it's no longer navigable by scanning alone.

### 1d. The five-phase per-sector lifecycle
Each of the 6 direction sectors is independently in one of 5 phases, computed from `researched / total` for that direction — **not one global game-progress flag**:

| Phase | Threshold | Renders |
|---|---|---|
| 0 — Dormant | 0% researched | ONE node: the cheapest no-prerequisite entry tech. Nothing else, not even a badge. |
| 1 — Awakening | researched > 0, < ~15% | Horizon rule applies (§1c), sector wedge tint becomes visible. |
| 2 — Growing | ~15–70% | Full horizon + ring-packing + cluster badges, the main working mode. |
| 3 — Mastered | ~70–99% | Cluster badges disappear (remaining count is low enough to show directly, dim). Silhouette (§1e) is mostly legible. |
| 4 — Complete | 100% | Individual nodes stop rendering entirely. Sector collapses to the filled silhouette trophy — gold, glowing, no per-node interaction. Reopens automatically (back to Phase 3) if new content is later authored into that direction and pushes it below 100% — do not hardcode "done forever." |

All-6-sectors-Phase-4 (full game completion) is NOT a special case to implement separately — it falls out of the per-sector rule with no extra code. Reference: `ProgressTurn1.dc.html` (all Phase 0), `ProgressMid.dc.html` (mixed phases — this is the realistic long-run state), `ProgressComplete.dc.html` (one sector at Phase 4 next to active ones).

### 1e. Silhouette clusters (Path of Exile–inspired, visual only)
Within a sector, minor (unlabeled) nodes trace a recognizable icon silhouette instead of a generic fan — legible from a glance before reading any label, matches how PoE's passive tree clusters read as sword/axe/crossbow shapes. Confirmed six shapes (reference `OrbitSilhouette.dc.html` for exact point sets, and `genProgression.mjs`'s `SHAPES` object for the coordinate data already extracted into reusable form):

- Индустрия — gear/cog
- Военное дело — blade, point outward
- Культура — flame
- Торговля — faceted gem
- Дипломатия — two linked rings
- Управление — crown, three points

The flagship/breakthrough node sits at the outward tip of each silhouette. Cluster group rotates to point outward from the hub (CSS `transform: rotate()` on the group); text labels on the flagship node counter-rotate so they stay upright — see `OrbitSilhouette.dc.html`'s `.stip-label` handling for the exact technique.

### 1f. "Прорыв" becomes drag-to-combine, not a button
Once a sector's specialization gauge (§1a tier 3) reads "ready," its flagship node becomes a drop target. Player drags 2 already-researched technologies from that direction onto it to trigger the breakthrough — reuses the existing tech-drag interaction already in `ResearchPanel.tsx` (`getTechDragId`/`TECH_DND_MIME`/queue-slot drop handling), extended with a new drop-target type. Reference: `Combine.dc.html`.

**Explicitly scoped narrow:** this is NOT "drag any tech onto any tech" (608×607/2 ≈ 184k combinations, unauthorable). It only applies to the 8 flagship/breakthrough nodes, consuming 2 of the player's own already-researched techs from that same direction as the "cost" — no new per-pair content needed.

## 2. Technical approach — don't hand-roll what's already solved

- **Layout math**: `d3-hierarchy` (`partition()`), reinterpreted x→angle, y→radius. Free, maintained, already implements the angular-subdivision-by-subtree-weight algorithm described in §1b.
- **Rendering/interaction** (pan, zoom, node drag, minimap): evaluate `cytoscape.js` (+ `react-cytoscapejs`) vs `react-flow`/`xyflow` as a replacement for the current hand-rolled `TechGraphCanvas.tsx` (608 lines of custom pan/zoom/drag code). Neither ships a radial-sector layout out of the box — that part is still custom (§2, `d3-hierarchy` above) — but both remove the need to hand-maintain pan/zoom/drag/minimap plumbing. `react-flow` has a built-in `MiniMap` component, relevant for §1c's full-tree view.
- Do not block on this evaluation — if neither library integrates cleanly with the existing drag-to-queue / drag-to-combine (§1f) interactions on a spike, hand-rolling the interaction layer (keeping only `d3-hierarchy` for the math) is an acceptable fallback. Flag the decision either way in your handoff notes.

## 3. Data-layer prerequisite work (must land before/alongside the layout)

**Root cause found during this design pass**: only 178 of 608 technologies have an explicit `direction` field in `content/core/technologies.json` (`military: 58, commerce: 60, culture: 60`, confirmed by direct count). The rest fall through `resolveTechDirection()`'s fallback logic in `src/state/techDirections.ts`, which defaults unmatched techs to `"industry"`. Estimated real split (not exact — the fallback logic wasn't fully replicated for this estimate): industry ~280, diplomacy ~80, governance ~70. If accurate, industry alone would claim ~46% of the orbit's angular budget — visually confirmed as lopsided on `OrbitFull.dc.html`.

Two fixes, do both (not either/or):
1. **Content fix**: tag the remaining ~430 technologies with an explicit `direction`, same pattern as the deposit-alias content fix earlier this project (`DEPOSIT_ALIASES_SPEC.md`) — look at each tech's real content (category, prerequisites, name) to judge the correct direction, don't guess blind. Add a WARN-level check to `scripts/validateTechnologies.mjs` (same pattern as the existing `tech_paths` cross-check added this session) that flags any technology whose direction resolves only via the `"industry"` fallback, so this doesn't silently regress.
2. **Defensive algorithmic cap**: regardless of #1's outcome, cap maximum sector angular width (recommend ~130–140°) so no single direction's wedge can dominate the wheel even if content stays uneven — overflow absorbed by extra ring depth instead of angle. Protects against future content drift, not just today's gap.

## 4. Explicitly out of scope for this spec

- Rewriting the alchemy Lab tab (`research/AlchemyLab.tsx`) — untouched, stays a separate mode tab.
- Actually authoring the 6 missing `tech_paths.json` breakthrough definitions — that's tracked separately (deferred by owner earlier this project), but note: §1f's combine mechanic needs *some* flagship node to exist per direction to be drop-targetable, so that content gap blocks §1f specifically, not the rest of this spec. Sequence accordingly (layout/horizon/phases can ship without it; combine cannot).
- Full tech catalog completion (608 total, 387 `catalogPending`) — unrelated, pre-existing, tracked elsewhere.
- Mobile/compact layout variant of the new screen — build desktop-first, compact mode is a follow-up pass.

## 5. Verification

- `npm run lint` clean, full server + client test suites green (existing baseline: 320 server tests, `test:viewer-page` 125 tests) — no regressions.
- `npm run validate:tech` — new WARN check from §3 should report actual current count of fallback-direction technologies (expect >0 until the content fix lands; 0 after).
- Manual: with a fresh 0-researched save, screen should show Phase 0 for all 6 sectors (matches `ProgressTurn1.dc.html`). With a save that has one direction at 100%, that sector should render as the silhouette trophy, not as 40+ individual gold nodes.
- Live-boot check (matching the pattern used throughout this project for server-touching changes): don't trust unit tests alone for the combine-to-breakthrough server route — verify via a real HTTP call against a real save, same pattern as this session's `previewBuild` and deposit-alias verifications.
- Re-run the "all 178→608" direction-count check from §3 after the content fix; expect 0 technologies resolving via the industry fallback (or a documented, deliberate remainder).

## 6. Suggested sequencing

1. §3 data fix (independent, mechanical-ish, could go to a separate agent — content tagging, not layout code) + validator.
2. §1b layout math as a pure, tested function (`computeOrbitLayout(directions, techs) → {node positions, sector boundaries}`) — testable in isolation against real `technologies.json`, no UI yet.
3. §1a/§1c screen shell + horizon clipping, wired to the layout function from step 2.
4. §1d phase system (mostly a state-derivation layer on top of step 3 — few new visuals, mostly thresholds + the Phase 4 collapse).
5. §1e silhouette shapes (pure visual polish on top of an already-working step 3/4).
6. §1f combine-to-breakthrough — last, since it depends on the flagship-node content gap noted in §4.
