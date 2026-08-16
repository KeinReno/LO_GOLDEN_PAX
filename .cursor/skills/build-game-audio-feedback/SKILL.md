---
name: build-game-audio-feedback
description: Design or implement responsive audio feedback for a web game. Use for action sounds, combat layers, music states, spatial audio, mix priorities, mute controls, accessibility, mobile audio unlock, and audio performance. Adapted for LO_GOLDEN_PAX: applies to UI and simulation feedback in the GMap viewer.
---

# Build Game Audio Feedback

Use audio to confirm player intent and combat state, not to add constant noise.

## Map feedback

Assign distinct cues for input accepted, windup, contact, block, miss, damage, interrupt, pickup, warning, death, and objective completion. Define priority so critical feedback remains audible during crowded encounters.

For LO_GOLDEN_PAX: assign cues per intent dispatch, economy tick result, combat resolution, and UI confirm/error. Keep a cue → event registry so simulation emits by ID, not by inline audio calls.

## Build for browsers

Unlock audio from a user gesture, respect mute/volume settings, release completed nodes, cap simultaneous voices, and provide subtitles or visual equivalents for meaningful cues. Change music by state with controlled transitions rather than restarts.

## Verify

Test first interaction, rapid actions, pause, tab/background return, mobile, muted state, and reduced motion/accessibility. Check memory and console health after a representative session.
