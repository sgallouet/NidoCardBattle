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
- **AI-009** - Apply strict node and wall-clock budgets; phone browsers use a smaller search profile than desktop browsers.

## Mobile Performance
- Phone profile target: at most **55 ms** of search time, **2,800** searched states, 4 candidate AI plans, and at most 650 Human-response states per candidate.
- Desktop profile may search wider/deeper, but is also strictly bounded.
- Search uses a purpose-built GameState clone instead of `structuredClone` in the hot path.
- Exact threat maps are used only for high-value Commander checks; the inner evaluator uses cheaper approximations.
- If the search budget is exhausted, the best plan found so far is used and the turn still completes normally.
- If Web Workers are unavailable, the same bounded planner runs on the main thread as a fallback.

## Next
- **AI-010** - Model unseen opponent cards probabilistically from faction deck composition and observed cards without reading the hidden hand.
- **AI-011** - Add difficulty presets by changing search width/depth and response modeling, not by forcing irrational mistakes.
- **AI-012** - Add AI-vs-AI simulation tooling for balance, regression, and dominant-strategy detection.
