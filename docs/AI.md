# Enemy AI

This document describes AI architecture only. Gameplay rules remain authoritative in `docs/rules/`.

## Current: Rules-Aware Smart Turn Planner
- **AI-001** - The gameplay engine owns the legal action stream. The AI asks `getLegalGameActions(...)` for every legal card, move, attack, and active ability instead of recreating gameplay rules in AI code.
- **AI-002** - Plan whole-turn action sequences instead of deciding each unit independently.
- **AI-003** - Use beam search to keep only the strongest candidate states while exploring a turn.
- **AI-004** - Report an explainable strategic outlook from -100 to +100 using economy, army, objectives, position, Commander state, and victory progress. This outlook is not a win probability.
- **AI-005** - Build an exact visible-board threat map for tactical pruning and Commander movement safety.
- **AI-006** - Never use the opponent's hidden hand when evaluating positions or simulating responses.
- **AI-007** - Run a shallow visible-board opponent response search over the best end-of-turn plans. Rank `forced-win`, `safe`, `unsafe`, and `forced-loss` before strategic outlook so an immediate win is not missed and an avoidable Commander loss is rejected.
- **AI-008** - Run live-game planning in a Web Worker so search does not block Phaser rendering or touch input.
- **AI-009** - Use one common mobile-safe search profile for every player device; PC does not receive a stronger AI search budget.
- **AI-010** - Run the same planner for either faction and support reproducible headless AI-vs-AI match batches for balance, regression, stalemate detection, and dominant-strategy analysis.
- **AI-014** - Passive traits and triggered effects are evaluated by simulating the real engine action, so Assist, Agile Assault, Dark Reflection, Necromancy, Phase, Blood Drain, Cleave, retaliation, terrain effects, and future passive mechanics need no AI-specific implementation.
- **AI-015** - A new active ability is added to the engine legal-action/resolver layer once; the AI automatically receives and searches it without adding an AI-specific action handler.
- **AI-016** - Search clones and cache signatures include complete serializable unit state so stateful mechanics such as Curse, Soul Link, Rally movement bonuses, and remaining Agile Assault movement are not merged into stale equivalent positions.
- **AI-017** - Before applying the 72-action node cap, reserve capacity for attacks, abilities, summons, tactics, and moves; tile-target cards keep only their strongest representative destinations and no family may consume the entire backfill.
- **AI-018** - Strategic planning and tactical opponent response have independent node/time budgets and independently report `complete`, `node-limit`, or `time-limit`.
- **AI-019** - Committed Commander damage is worth substantially more than speculative future attack pressure. Wounded Commanders increase pursuit priority, while tactical safety tiers still prevent avoidable Commander losses.

## Rules-Aware Contract
- `src/game/actions.ts` is the AI-facing gameplay action boundary.
- `getLegalGameActions(...)` enumerates legal actions from authoritative engine rules.
- `applyGameAction(...)` resolves those actions through the authoritative engine.
- The AI may order actions cheaply for search efficiency, but it does not decide whether an action is legal or reproduce an ability's effect.
- Passive traits remain inside normal engine resolution and therefore require no action type.
- Choice-based summon effects, such as Light Mage Restore, are represented as complete legal action variants so the planner evaluates the choice together with the summon.
- Simulation action counters use the same canonical action-kind list, so adding an action cannot silently break telemetry.

## Common Performance Budget
- Every live device uses the same mobile-safe two-phase profile: strategic planning gets **1,800 nodes / 35 ms**, and tactical opponent response gets **1,000 nodes / 20 ms** across 4 candidate plans.
- Each phase's node budget is its intelligence limit; its wall-clock limit is a safety valve for slow phones.
- Headless simulation uses the same node/search-width limits but relaxes the wall-clock cap so benchmark results do not depend on the machine running them.
- Search uses a correctness-first serializable GameState clone so newly added state fields are preserved automatically.
- Exact threat maps are used only for high-value Commander checks; the inner evaluator uses cheaper approximations.
- If a phase reaches a limit, its best completed plan is used and the exact phase/reason is recorded.
- Live planning runs in a Web Worker; if Workers are unavailable, the same bounded profile runs on the main thread as a fallback.

## Simulation
- `simulateAiMatch(seed)` runs one deterministic headless match with the real game engine.
- `simulateAiBatch(...)` aggregates faction win rate, first-player win rate, match length, stalemates, Commander deaths, objective control, unit/card usage, all gameplay action kinds, per-phase AI node/termination metrics, and plan replay failures.
- `generateBattleLog(...)` schema v2 records compact state deltas plus the chosen strategic components, tactical tier/components, worst visible response, candidate pruning counts, and each phase's exact termination reason.
- `analyzeBattleLogs(...)` derives processable faction metrics and evidence-linked AI, simulation, and pacing findings from one or more detailed logs.
- Batch simulations use paired seeds by default: each seed runs once with Human moving first and once with Undead moving first, so faction strength is not confused with draw order or first-move advantage.
- Simulation repetition fingerprints include full unit status state so Curse, Soul Link, movement bonuses, and future status effects cannot create false repetitions.
- `npm run simulate` runs a reproducible 12-match baseline report without loading Phaser or game art.
- `npm run battlelog -- --matches 2 --seed 20260823` writes detailed alternating-first-player logs and their analysis under `reports/battle-logs/`. Use `--out <path>` to choose another output file.

## Known Limits From Self-Review
- Opponent response search models visible board actions only and deliberately does not guess hidden cards yet.
- A very slow live device can hit either wall-clock safety cap before its node cap, so exact cross-device move parity is not guaranteed even though every device uses the same limits.
- Search quality still depends on evaluation weights and finite beam width; rules are simulated correctly, but a bounded search can still miss a stronger long sequence.
- AI actions are applied as a completed plan; simulation records any replay failure so future abilities/cards cannot silently invalidate planned sequences.
- Current faction/map-side balance is still partly coupled because each faction keeps its current starting side; first-move bias is measured separately, but map-side mirroring can be added later if needed.

## Next
- **AI-011** - Establish a baseline from repeated simulation reports and tune obvious evaluation/gameplay outliers before adding more intelligence.
- **AI-012** - Model unseen opponent cards probabilistically from faction deck composition and observed cards without reading the hidden hand.
- **AI-013** - Add difficulty presets only if needed later; difficulty should not depend on device performance.
