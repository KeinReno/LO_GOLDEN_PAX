---
name: tune-enemy-ai
description: Build, debug, balance, or test opponent/faction AI for strategy games. Use for aggro, target selection, navigation, spacing, attack choices, telegraphs, retreats, capital/boss behavior, behavior-state machines, and deterministic AI regression tests. Adapted for LO_GOLDEN_PAX: applies to faction AI in economyTick, planetActions, and intents resolution.
---

# Tune Enemy AI

Make enemy choices legible, bounded, and reproducible.

## Model decisions explicitly

Use a small state machine or utility layer with named states such as idle, investigate, pursue, reposition, windup, attack, recover, stagger, retreat, and defeated. State transitions must state their prerequisites, exit conditions, minimum dwell time, and cooldown effects.

For LO_GOLDEN_PAX factions: map states to strategy verbs — idle/gather, expand, fortify, raid, siege, retreat, regroup. Each transition must declare prerequisites (resources, fleet, distance via pathfinding.ts) and cooldowns.

## Separate perception, intent, and motion

1. Gather observable inputs: distance, line of sight, target state, occupancy, threat, health, and timers.
2. Select one intention from constrained legal actions.
3. Move and animate toward that intent without rewriting the decision mid-action.

Use authoritative collision and navigation results for movement success. Do not derive them from rendered pose or assumed path completion.

## Preserve fair combat

Telegraph attacks before their active window. Prevent instant turn-and-hit behavior, perpetual chase, clipped attacks through blockers, and repeated recovery spam. Add spacing and commitment so the player can read and answer each enemy archetype.

## Test the decision surface

Create deterministic fixtures for target acquisition, target loss, obstruction, path failure, close-range pressure, multiple enemies, retaliation, interrupt, stagger, boss phase, and reset. Assert transitions and outcomes, not only final positions. Run a real browser encounter after automated tests.
