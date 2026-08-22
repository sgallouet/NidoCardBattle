# Enemy AI

This document describes AI architecture only. Gameplay rules remain authoritative in `docs/rules/`.

## Current: Smart Turn Planner
- **AI-001** - Generate legal summon, move, attack, and Displace actions from the current state.
- **AI-002** - Plan whole-turn action sequences instead of deciding each unit independently.
- **AI-003** - Use beam search to keep only the strongest candidate states while exploring a turn.
- **AI-004** - Score positions using victory state, Commander safety/threat, material, objectives, formation, cards, and mana.
- **AI-005** - Build an exact visible-board threat map for tactical pruning and Commander movement safety.
- **AI-006** - Never use the opponent's hidden hand when evaluating positions or simulating responses.
- **AI-007** - Run a shallow minimax-style opponent response search over the best end-of-turn plans and prefer the plan with the strongest worst-case result.
- **AI-008** - Run live-game planning in a Web Worker so search does not block Phaser rendering or touch input.
- **AI-009** - Use one common mobile-safe search profile for every player device; PC does not receive a stronger AI search budget.
- **AI-010** - Run the same planner for either faction and support reproducible headless AI-vs-AI match batches for balance, regression, stalemate detection, and dominant-strategy analysis.

## Common Performance Budget
- Every live device uses the mobile-safe profile: at most **55 ms** of search time, **2,800** searched states, 4 candidate plans, and at most 650 opponent-response states per candidate.
- The node budget is the common intelligence limit; the wall-clock limit is only a safety valve for slow phones.
- Headless simulation uses the same node/search-width limits but relaxes the wall-clock cap so benchmark results do not depend on the machine running them.
- Search uses a purpose-built GameState clone instead of `structuredClone` in the hot path.
- Exact threat maps are used only for high-value Commander checks; the inner evaluator uses cheaper approximations.
- If the search budget is exhausted, the best plan found so far is used and the turn still completes normally.
- Live planning runs in a Web Worker; if Workers are unavailable, the same bounded profile runs on the main thread as a fallback.

## Simulation
- `simulateAiMatch(seed)` runs one deterministic headless match with the real game engine.
- `simulateAiBatch(...)` aggregates faction win rate, first-player win rate, match length, stalemates, Commander deaths, objective control, unit/card usage, action mix, AI search cost, timeouts, and plan replay failures.
- Batch simulations alternate Human and Undead as Player 1 by default so faction strength is not confused with first-move advantage.
- `npm run simulate` runs a reproducible 12-match baseline report without loading Phaser or game art.

## Known Limits From Self-Review
- Opponent response search models visible board actions only and deliberately does not guess hidden cards yet.
- A very slow live device can hit the 55 ms safety cap before the shared node cap, so exact cross-device move parity is not guaranteed even though every device uses the same limits.
- Search quality depends heavily on evaluation weights; simulation results should drive weight and gameplay tuning rather than assuming the current numbers are balanced.
- AI actions are applied as a completed plan; simulation records any replay failure so future abilities/cards cannot silently invalidate planned sequences.
- Current faction/map-side balance is still partly coupled because each faction keeps its current starting side; first-move bias is measured separately, but map-side mirroring can be added later if needed.

## Next
- **AI-011** - Establish a baseline from repeated simulation reports and tune obvious evaluation/gameplay outliers before adding more intelligence.
- **AI-012** - Model unseen opponent cards probabilistically from faction deck composition and observed cards without reading the hidden hand.
- **AI-013** - Add difficulty presets only if needed later; difficulty should not depend on device performance.
