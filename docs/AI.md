# Enemy AI

This document describes AI architecture only. Gameplay rules remain authoritative in `docs/rules/`.

## Current: Smart Turn Planner
- **AI-001** - Generate legal summon, move, attack, and Displace actions from the current state.
- **AI-002** - Plan whole-turn action sequences instead of deciding each unit independently.
- **AI-003** - Use beam search to keep only the strongest candidate states while exploring a turn.
- **AI-004** - Score positions using victory state, Commander safety/threat, material, objectives, formation, cards, and mana.
- **AI-005** - Build an exact visible-board threat map for tactical pruning and Commander movement safety.
- **AI-006** - Never use the opponent's hidden hand when evaluating positions.

## Next
- **AI-007** - Add a shallow opponent-response/minimax pass over the best end-of-turn plans.
- **AI-008** - Model unseen opponent cards probabilistically from faction deck composition and observed cards.
- **AI-009** - Add difficulty presets by changing search width/depth and response modeling, not by forcing irrational mistakes.
- **AI-010** - Add AI-vs-AI simulation tooling for balance, regression, and dominant-strategy detection.

## Performance Rule
- Full threat maps are used only where tactically valuable; the inner beam-search evaluator uses cheaper approximations so enemy turns remain interactive.
