# Economy SECTION acceptance — v0.5 (B3)

> Checklist against `ECONOMY_SECTION_SPEC.md` §15 + host canon in `VIEWER_HOST_AND_TRACK_LOCKS.md`.
> Date: 2026-08-09 · Game target: **0.5** · Updated after B3 polish

## Host

| Item | Status |
|------|--------|
| Desktop Economy via WorkbenchShell (not FloatingPanel room) | Pass |
| Phone Economy via BottomSheet | Pass |
| FloatingPanel reserved for edge widgets | Pass (canon) |
| Master–detail: Economy left + System right | Pass (`workbench-root--master-detail` + `viewer-system-layer--docked-right`) |

## §15 content

| Item | Status | Notes |
|------|--------|-------|
| Sidebar 5 sections + hotkeys 1–5 | Pass | |
| Category colors A–F vs schema | Pass | |
| Treasury forecast 3–5 turns | Pass | |
| Production → System (master–detail) | Pass | Linked system docks right; Esc / «← Экономика» returns to room |
| Stockpile drag → Sell/Reserve/Caravan | Pass | Includes strategic map.* |
| Stockpile long-press radial | Pass | |
| Tax preview before apply | Pass | |
| Budget timeline swipe | Pass | already + reason chip from donut |
| Expense donut → journal filter | Pass | B3 |
| No marketing Aceternity beams | Pass | |
| Data via ViewerPayload / intents | Pass | |
| RoleScore + strategic stocks visible | Pass | UI handoff |
| Readable 1366×768 | Manual | |
| `/view` performance | Manual | |

## Spec ↔ code deviations (accepted for 0.5)

1. Room host is Workbench, not Floating+Rnd+snap (canon).
2. Full Aceternity polish / AnimatedTooltip everywhere deferred.
3. Tech Paths (A6) deferred — see `TECH_PATHS_PLAN_v06.md`.

## Verdict

**v0.5 Economy UI: accept.** Model smoke 7/7 + SECTION gaps for master–detail / budget drill closed.
