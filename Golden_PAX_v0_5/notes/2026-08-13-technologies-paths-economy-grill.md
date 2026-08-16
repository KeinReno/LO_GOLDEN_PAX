# Technologies ↔ Paths ↔ Economy / Army / Fleet: Grill / Discovery Notes
Date: 2026-08-13 · Goal: strip illogical / wrong / overloaded tech mechanics when transferring GMap → v0.5, and lock a ban-list so old errors do not land in the new version.

## Summary / key decisions
- Session is an **anti-error transfer filter**, not a catalog rewrite and not a taxonomy redesign-by-default. Goal in the user's words: «убрать нелогичные, не правильные, перегруженные механики, не допустить ошибок в новой версии, что были раньше».
- Binding contract (tech → path / economy / army / fleet) is the *method*; the *outcome* is a cleaner system that does not repeat GMap's tech mistakes.
- 8-path + Core taxonomy from ECONOMY_TECH_REDESIGN_SPEC §10 is **not yet confirmed as off-limits** — user redirected to cleanup, did not explicitly freeze or reopen it.

## Q&A log

### Q1 — session purpose
- Asked: confirm this session is the binding contract (tech → path/economy/army/fleet), not a 428-tech catalog pass and not a reopen of the 8-path taxonomy.
- Captured: user corrected the goal. «цель сесси - убрать нелогичные, не правильные, перегруженные механики, не допустить ошибок в новой версии, что были раньше».
- Decided: session = cleanup + anti-regression for tech (and its links to paths/economy/army/fleet). Not “copy nodes”. Catalog walk and path-taxonomy reopen stay uncommitted until asked.

## Open flags (pending input)
- Concrete ban-list of old tech errors (what exactly was illogical / wrong / overloaded) -> user, Q2
- Whether §10 8-path + Core model is frozen or on the table -> not yet asked
- Catalog (~428) keep/drop/cluster rules -> later, after ban-list
