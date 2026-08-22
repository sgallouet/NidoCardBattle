# Enemy AI

This document describes AI architecture only. Gameplay rules remain authoritative in `docs/rules/`.

## Current: Smart Turn Planner
- **AI-001** - Generate legal summon, move, attack, and Displace actions from the current state.
- **AI-002** - Plan whole-turn action sequences instead of deciding each unit independently.
- **AI-003** - Use beam search to keep only the strongest candidate states while exploring a turn.
- **AI-004** - Score positions using victory state, Commander safety/threat, material, objectives, formation, cards, and mana.
- **AI-005** - Build an exact visible-board threat map for tactical pruning and Commander movement safety.
- **AI-006** - Never use the opponent's hidden hand when evaluating positions or simulating responses.
- **AI-007** - Run a shallow minimax-style Human response search over the best AI end-of-turn plans and prefer the plan with the strongest worst-case result.
- **AI-008** - Run planning in a Web Worker so search does not block Phaser rendering or touch input.
- **AI-009** - Use one common mobile-safe search profile for every player device; PC does not receive a stronger AI search budget.

## Common Performance Budget
- Every device uses the mobile-safe profile: at most **55 ms** of search time, **2,800** searched states, 4 candidate AI plans, and at most 650 Human-response states per candidate.
- The node budget is the main common intelligence limit; the wall-clock limit is a safety valve so unusually slow phones never freeze for a long enemy turn.
- Search uses a purpose-built GameState clone instead of `structuredClone` in the hot path.
- Exact threat maps are used only for high-value Commander checks; the inner evaluator uses cheaper approximations.
- If the search budget is exhausted, the best plan found so far is used and the turn still completes normally.
- Planning runs in a Web Worker; if Workers are unavailable, the same bounded profile runs on the main thread as a fallback.

## Known Limits From Self-Review
- Human response search currently models visible board actions only and deliberately does not guess hidden cards yet.
- A very slow device can hit the 55 ms safety cap before the shared node cap, so exact cross-device move parity is not guaranteed even though every device uses the same limits.
- Search quality depends heavily on the evaluation weights; automated match simulation is needed before treating those weights as balanced.
- AI actions are currently applied as a completed plan; later gameplay testing should verify that every planned sequence still replays legally under all abilities and future card effects.

## Next
- **AI-010** - Add AI-vs-AI simulation tooling for balance, regression, deadlock detection, and dominant-strategy detection.
- **AI-011** - Model unseen opponent cards probabilistically from faction deck composition and observed cards without reading the hidden hand.
- **AI-012** - Add difficulty presets only if needed later; difficulty should not depend on device performance.
