# RP Chat Consolidation & Player UX — Implementation Spec

> **Handoff spec for an implementing agent.**
> **Source Discovery:** live audit of `RpGmDesk.tsx`/`RpChat.tsx`/`RpStage.tsx` + entry points, 2026-08-17 (see `agent-tasks/STATUS.md`).
> **Owner decision (already made, this spec plans execution):** merge the GM's two chat surfaces into one, based on `RpGmDesk.tsx`. Also improve `RpStage.tsx` (the player chat) — owner explicitly likes it as the reference model but flagged it still has real UX gaps.

All line numbers below refer to the files as read during this audit (2026-08-17) — re-check before relying on them if time has passed, files may have shifted from ongoing decomposition work elsewhere in this repo.

---

## Part 1: Merge `RpGmDesk.tsx` + `RpChat.tsx` into one GM chat

### Settled: `RpGmDesk.tsx` is the base, `RpChat.tsx` is deleted once parity is reached

Full feature inventories for both files are in the discovery notes referenced above — read `RpGmDesk.tsx` and `RpChat.tsx` in full before starting, don't work from this summary alone.

### 1a. Port: intent-attach (the feature the owner explicitly asked for)

1. Add state to `RpGmDesk`: `attachIntent`, `intentDefId`, `intentToSystemId` (mirrors `RpChat.tsx` ~202–204).
2. Systems data: `RpGmDesk` already has `world` via `useWorldStore((s) => s.world)` — read `world.systems` directly, don't add a new prop.
3. Intent-type labels: use the existing shared `intentLabel()` map in `src/editors/intentLabels.ts` (~30 entries, already used by `useViewerUnitOrders.ts`/`useViewerEconomyIntents.ts`). **Do not** copy `RpChat.tsx`'s hardcoded 5-item `INTENT_LABELS` (lines 70–76) — that's a second, stale, incomplete copy of data that already exists centrally.
4. UI: checkbox "Отправить как приказ (ОД)" + intent-type `<select>` + system `<select>`, gated on `voice === "action" && attachIntent`, inserted near `RpGmDesk`'s existing voice/tone row (~973–997). Mirror `RpChat.tsx`'s layout (~1061–1099) for the control shapes, not its data source.
5. Send: extend `RpGmDesk.post()` (~524–558) to append `payload.intent = { defId: intentDefId, payload: { toSystemId, systemId: intentToSystemId }, note: body.trim().slice(0, 120) }` when attaching. Server-side consumer is already real and unchanged: `server/routes/rp.mjs` ~244–274.
6. **This fix subsumes real bug #1 below (see Part 3) automatically** — `RpGmDesk.post()` already unconditionally sends a real `authorFactionId` (line 536) because its channels are always one faction's HQ. Porting the intent block into `RpGmDesk`'s `post()` means the GM's own attached intents will actually work, unlike in `RpChat.tsx` today. No extra wiring needed for this — just confirm it live (see "How this gets checked").
7. Confirm dialog: use `ConfirmModal` (`src/viewer/shared/ConfirmModal.tsx`), not a native `window.confirm()` — `RpStage.tsx` ~1570–1585 is the pattern to copy (styled modal, `busy` state, confirm/cancel). `RpChat.tsx`'s native confirm (~464–468) is exactly the anti-pattern this project has already been fixing elsewhere (`GmCourtPanel`'s `removeBloc`/`removeNpc` got the same treatment in an earlier pass per `agent-tasks/_archive/status/2026-08-16.md`).
8. Add `intentId`/`intentDefId` to `RpGmDesk`'s `RpMessage` type (currently absent) and render an `"приказ в очереди"` chip when `m.intentId` is set — copy the rendering pattern from `RpChat.tsx` (~879–881) or `RpStage.tsx` (~1171–1173).

### 1b. Port: chapter/episode admin — **hard dependency, not optional, even though the owner didn't name it explicitly**

`RpChat.tsx`'s `showAdmin` panel (~708–754, via `masterPost()` ~435–450) is the **only UI anywhere in the client** that can create a chapter (`POST /api/rp/chapter`), create a scene episode (`POST /api/rp/episode`), or close one (`POST /api/rp/episode/close`). `RpGmDesk` never needed this because its rail is hard-filtered to HQ episodes only (auto-provisioned server-side, `server/rpStore.mjs` ~214–239) — but campaign "scene" episodes (what players browse via `RpStage`'s `ChroniclePanel` drawer) can **only** be authored through this panel.

**If `RpChat.tsx` is deleted without this, the GM permanently loses the ability to start or close campaign scenes.** Do this:
- Reuse `src/viewer/ChroniclePanel.tsx` (already exists, already used by `RpStage` for browsing/opening scenes, currently read-only) for the listing half, instead of reimplementing `RpChat`'s bespoke `flatChannels` picker.
- Add create/close controls to it (it currently has none), modeled on `RpChat.tsx`'s `showAdmin` block, gated behind a GM-only flag consistent with `RpGmDesk`'s existing kit-tab pattern (`pin`/`choice`/`dice`/`macros` tabs, ~1050–1216 — add a `chapters` tab alongside them, don't bolt on a separate panel).

### 1c. Decision needed from owner (do not assume — flag, don't silently pick)

`RpChat.tsx`'s master-mode visibility `<select>` (`all`/`gm_only`/`faction:<id>`, ~1007–1023) lets the GM log a note into the channel that the authoring player can't see. `RpGmDesk` has no equivalent. Since `RpGmDesk`'s channels are always single-faction HQs, only the `gm_only` case (private GM scratch notes) would be meaningful there. **This was not part of the owner's original ask — implement only if explicitly confirmed, otherwise skip it and note it as deferred.**

### 1d. Fix while here (small, same files, same effort either way)

- **Reply/quote is invisible outside `RpStage.tsx`.** `buildReplyBody`/`parseReplyBody` (`RpStage.tsx` ~231–239) glue a `"» {author} — «{snippet}»\n\n"` marker into the raw message body; only `RpStage`'s own renderer parses it back into a blockquote. Port `parseReplyBody`'s rendering (not necessarily the authoring UI, unless useful for GM replies too) into the merged component so a player's reply doesn't show up as literal marker text in the GM's view.
- **"Rolls" filter bug, duplicated in both `RpStage.tsx:793` and `RpGmDesk.tsx:692`**: `feedFilter === "rolls"` matches `m.type === "system"` broadly, which also catches unrelated GM stage-direction stamps (`focus`/`time`), not just dice results. Fix the predicate to also require `m.prompt?.kind === "dice"` (or equivalent), in both places — same bug, fix once conceptually, apply to both call sites (the merge naturally collapses `RpGmDesk`'s copy into the new single component; still need the `RpStage.tsx` copy fixed separately since that file isn't being merged away).
- **`FloatingRpWindow.tsx`'s default body (`<RpChat layout="fill" />`, line 174) is dead code** — both real callers (`TopBar.tsx` ~477–496, `ViewerPlayFloats.tsx` ~97–116) always override via `children`. Repoint the default at the merged component (or remove the fallback default entirely) so this isn't a silent trap for a future caller.
- **`RpStudio.tsx` (26 lines) currently renders `<RpChat />` with zero props** — `factionId` is always `undefined`, so the GM has never been able to speak as an NPC from the full-tab surface. Fix when swapping the tab to render the merged component (see 1e) by wiring the props it's currently missing.

### 1e. Genuinely not needed — don't port

Prompt/choice/dice cards (RpChat has none — RpGmDesk is already the superset), `QUICK_GESTURES`/`applyGesture` (dead in the only live caller), `showDice`/`showPersona`/`onBackToCourt`/`preferScenes`/`preferHome`/`sceneOnly`/`forceReadOnly` prop plumbing (only mattered for hypothetical multi-consumer reuse, moot once `RpChat.tsx` is deleted). `DICE_PRESETS`'s roll animation is a low-priority optional nicety, not required for parity — pick it up only if time allows.

### 1f. Keep a full-tab entry point, but as the SAME component

The full tab isn't purely redundant even after the merge — a docked tab has more usable vertical space for a long GM session than a draggable/resizable popup that can be minimized or covered. Keep `RpStudio.tsx` as an entry point, but:
- Give the merged component a `layout` prop (`RpGmDesk` currently has none — `RpChat`/`RpStage` both already do, copy that pattern).
- Change `RpStudio.tsx` to render `<MergedGmRpChat layout="fill" .../>` with correct props (not zero props, per 1d's NPC-persona fix) instead of `<RpChat />`.
- Only delete `RpChat.tsx` after this swap is live and verified.

---

## Part 2: `RpStage.tsx` player UX — owner's own reference model, still has real gaps

Owner's framing: they like this as the model for the GM chat, but said explicitly there's more to do here too. These are concrete, found-by-reading issues, not a vague polish pass — implement all of them unless one turns out to be more invasive than expected, in which case flag it rather than skip silently.

1. **No "jump to new messages" affordance when scrolled up.** `stickBottom` only auto-scrolls within 56px of bottom; the only new-message cue is a 1.6s CSS highlight on the new line itself (`freshIds`), which is off-screen and expires before a scrolled-up reader notices. Add a "new messages" pill/button that appears when new content arrives while scrolled up, click-to-jump — standard chat-UI pattern, low risk.
2. **No pagination/virtualization on scrollback.** `loadMessages()` fetches the whole channel's message list every 5s poll with no limit/offset; every message renders as a live animated `motion.article`. Add at minimum a reasonable initial-load cap + "load older" on scroll-to-top, so a multi-week campaign's scene doesn't degrade. Don't need full virtualization if a simple cap solves the real problem — propose the smallest fix that actually bounds cost, confirm with a rough calculation (expected messages/session × campaign length) rather than over-building.
3. **Reply affordance isn't discoverable.** Starting a reply requires tapping a bubble to reveal a hidden row, then tapping "Ответить" — no visual hint a bubble is tappable for this, inconsistent with the file's own `GestureChip` pattern which DOES self-document via tooltip. Add a visible (not hidden-until-tap) reply affordance, or at minimum a hover/tooltip hint matching `GestureChip`'s existing self-documentation convention.
4. **Compose chrome doesn't collapse on desktop/panel layout.** `compact` (mobile) mode already has a `toolsOpen` toggle hiding persona/voice/gesture/reply/meta rows behind one tap — the desktop/panel path always renders the full stack, permanently eating vertical space. Extend the same collapse toggle to the non-compact layout (the mechanism already exists, this is applying it more broadly, not building something new).
5. **Whisper is sticky with no reset.** `whisper` state only flips via explicit clicks and `post()` never resets it after a send. A player who whispers once and keeps typing silently keeps whispering. Reset `whisper` to `false` after a successful send (mirrors how a "reply to" target should also likely clear after send, if it doesn't already — verify).
6. **No scrollback search / no way back to an unanswered prompt.** If the GM posts several more lines after a choice/dice prompt, a player has no way to jump back to it. At minimum, add a filter/indicator for "has an unresolved prompt for me" (RpGmDesk's `waiting` concept already exists server-side conceptually for the GM rail — reuse that shape client-side for the player instead of inventing new state).
7. **"Rolls" filter bug** — see Part 1d, same file, fix here too (not just in the merged GM component).

---

## Part 3: Other real bugs found (fix opportunistically as you touch these files — don't go hunting elsewhere)

1. `RpChat.tsx`'s intent-attach never actually creates an intent for the GM's own voice (`authorFactionId` never set for persona `self`/`master`/`narrator`) — moot once `RpChat.tsx` is deleted per Part 1, but if for any reason the deletion is delayed, this is a real, silent, no-error-shown failure worth knowing about.
2. `FloatingRpWindow.tsx`'s dead default body — see Part 1d.
3. `RpStudio.tsx` zero-props NPC-persona bug — see Part 1d.

---

## Explicitly out of scope

- Do not touch `RpGmDesk.tsx`'s faction rail, chime, macros/stamps, or scene-pin systems — these already work and aren't part of this ask.
- Do not build a roll-animation for `RpGmDesk`'s `rollFree()` unless time allows after everything above — optional, not required.
- Do not implement Part 1c (GM-private visibility levels) without explicit owner confirmation first.
- Do not touch server-side RP code (`server/rpStore.mjs`, `server/routes/rp.mjs`) — the client-side merge doesn't need it, all the server plumbing this depends on already exists and works.

## How this gets checked

1. Feature checklist from Part 1's inventory — every capability listed for `RpGmDesk.tsx` and `RpChat.tsx` in the discovery notes must still work after the merge (verify by hand, not just "it compiles").
2. Live-verify the intent-attach fix specifically: as GM, open the popup, attach an intent to a message, confirm a real intent gets created server-side (check the response, not just "no error shown" — this exact silent-failure shape is what caused bug #1 to go unnoticed in `RpChat.tsx`).
3. Confirm scene creation/close still works through whatever `ChroniclePanel` GM controls replace `RpChat`'s admin panel, before `RpChat.tsx` is deleted.
4. `RpStudio.tsx` correctly wires `factionId`/`npcs` post-swap — verify the GM can speak as an NPC from the full tab, something that has never worked before this fix.
5. `npm run lint` clean (server unaffected, but if any `.mjs` touched incidentally, check), `tsc --noEmit` clean, existing `test:viewer-page` suite still green.
6. Full-tab (`RpStudio.tsx`) and popup (`TopBar.tsx`'s `FloatingRpWindow`) both render the same merged component with no behavior fork between them beyond `layout`.
