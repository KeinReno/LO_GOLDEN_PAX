---
name: dialogue-systems
description: >-
  Branching dialogue and narrative state for GMap quests, court NPCs, and RP.
  Use when editing quest logs, NPC lines, court tasks, or chronicle prompts —
  not Ink/Yarn unless explicitly requested.
---

# Dialogue in GMap

This table is **data-driven JSON + quest engine**, not Ink/Yarn.

- Lines: content ids / chronicle messages, not hardcoded UI strings for lore.
- State: quest flags, `npc.currentTask`, court blocs — persist via existing stores.
- Branches: quest `objectives` / choices with `canAffordCosts`. Keep one dossier (`QuestDossierView`).
- RP chat is `RpStage` / `RpGmDesk` (player vs GM). Do not resurrect `RpChat.tsx`.
- Validate every choice reaches an end or a live node. Mutate flags on transition, not on re-read.

Lore prose lives in `00_Канон/` — do not dump chapters into skills or UI.
---
