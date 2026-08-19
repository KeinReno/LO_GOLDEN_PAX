# Root Cause Tracing

Source: [obra/superpowers](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/root-cause-tracing.md)

Bugs often show deep in the stack. Fixing where the error appears treats a symptom.

**Trace backward until the original trigger, then fix at the source.**

1. Observe the symptom (message, wrong id, empty select).
2. Find the code that directly produces it.
3. Ask what called this, with what value.
4. Keep going until the value originates (default, missing remap, wrong payload).
5. Fix there. Optionally add validation at each layer (`defense-in-depth.md`).

Never fix only the throw site. Example pattern from GMap: Intel showed "—" while the select displayed Belator — DOM lied, Zustand still had dead `faction_a`; the source was `loadWorld` not remapping `activeFactionId`.
