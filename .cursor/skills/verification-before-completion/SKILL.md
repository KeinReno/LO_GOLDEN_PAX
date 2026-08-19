---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing — before committing or creating PRs. Run the proof command this turn; evidence before assertions.
---

Source: [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion).

# Verification Before Completion

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## Gate

BEFORE claiming any status:

1. IDENTIFY the command that proves the claim.
2. RUN it fresh and complete.
3. READ full output and exit code.
4. VERIFY the output confirms the claim.
5. ONLY THEN make the claim, with the evidence.

## GMap proof commands

| Claim | Proof |
|---|---|
| Server logic | `npm run lint` (if `server/`) + targeted `npm run test:*` / `npm run smoke` |
| Tech/content | `npm run validate:tech` |
| Client types | `npx tsc --noEmit` (from `GMap/`) |
| UI/GM bug gone | Browser: original repro steps + console clean (`verifying-in-browser`) |
| No live-board mutation | Did not call `processTurn` / `runEconomyTick` on `data/published.json` |

Code changed ≠ bug fixed. Re-run the original symptom.

## Red flags

"should", "probably", "looks correct", satisfaction before the command, trusting a subagent report without checking the diff.
