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
- **AI-009** - Use one common live search profile for every player device. Each live think is capped at **1 second** and is presented as part of the enemy turn (focus the enemy Commander, think, act, think, next act).
- **AI-010** - Run the same planner for either faction and support reproducible headless AI-vs-AI match batches for balance, regression, stalemate detection, and dominant-strategy analysis.
- **AI-014** - Passive traits and triggered effects are evaluated by simulating the real engine action, so Assist, Agile Assault, Dark Reflection, Necromancy, Phase, Blood Drain, Cleave, retaliation, terrain effects, and future passive mechanics need no AI-specific implementation.
- **AI-015** - A new active ability is added to the engine legal-action/resolver layer once; the AI automatically receives and searches it without adding an AI-specific action handler.
- **AI-016** - Search clones and cache signatures include complete serializable unit state so stateful mechanics such as Curse, Soul Link, Rally movement bonuses, and remaining Agile Assault movement are not merged into stale equivalent positions.
- **AI-017** - Before applying the 72-action node cap, reserve capacity for attacks, abilities, summons, tactics, and moves; tile-target cards keep only their strongest representative destinations and no family may consume the entire backfill.
- **AI-018** - Strategic planning and tactical opponent response have independent node/time budgets and independently report `complete`, `node-limit`, or `time-limit`.
- **AI-019** - Committed Commander damage is worth substantially more than speculative future attack pressure. Wounded Commanders increase pursuit priority, while tactical safety tiers still prevent avoidable Commander losses.
- **AI-020** - Portfolio planner search policy and strategic doctrine weights live in typed versioned profile constants, so V3, V4, V5, and V6 share one implementation and tuning does not fork gameplay logic.
- **AI-023** - V5 keeps V4's search budget and adds habit weights for early Profane Well, unused Curse, empty Soul Link, leftover playable mana, healthy Commander retreat, and Invoked Beast spam.
- **AI-024** - V6 keeps the one-second live budget and makes map control persistent: uncaptured Mana Wells and Forts reward both immediate capture and multi-turn approach, healthy ranged units prefer Hills, and wounded ranged units prefer available Villages over Hill posture.
- **AI-021** - V4 retains multiple candidates per doctrine, allocates doctrine budgets by bounded urgency, preserves action-family diversity, deduplicates equivalent end states, and audits diverse visible response sequences under the same total node budget as V3.
- **AI-022** - Planner matchup reports aggregate per-planner candidate counts, response sequences, node use, termination reasons, doctrine selections, replay failures, captures, kills, and paired outcomes. Live promotion requires a separate held-out seed set.

The live opponent uses Planner V6's nine-doctrine portfolio. V4 remains the accepted regression baseline from its 32-game held-out paired-seed promotion run against V3. V5 preserves the intervening ability/card habits, while V6 adds the map-control behavior under **AI-024** without forking the planner engine.

## Rules-Aware Contract
- `src/game/actions.ts` is the AI-facing gameplay action boundary.
- `getLegalGameActions(...)` enumerates legal actions from authoritative engine rules.
- `applyGameAction(...)` resolves those actions through the authoritative engine.
- The AI may order actions cheaply for search efficiency, but it does not decide whether an action is legal or reproduce an ability's effect.
- Passive traits remain inside normal engine resolution and therefore require no action type.
- Choice-based summon effects, such as Light Mage Restore, are represented as complete legal action variants so the planner evaluates the choice together with the summon.
- Simulation action counters use the same canonical action-kind list, so adding an action cannot silently break telemetry.

## Common Performance Budget
- Every live device uses the same V6 two-phase think: strategic planning gets **7,200 nodes / 700 ms**, and tactical opponent response gets **3,000 nodes / 300 ms** (**1 second** together) before each committed action.
- Live play replans after each committed action so the visible think is part of enemy-turn pacing. Headless simulation still plans a whole turn under relaxed clocks.
- Each phase's node budget is its intelligence limit; its wall-clock limit is a safety valve if a device cannot finish the node budget in time.
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
- `npm run simulate:planners` compares V2 and V3 over 40 paired seeds, prints progress after every pair, and runs the CPU-bound batch in a child process. A parent-process timeout defaults to one hour and can be changed with `--timeout-ms`.
- `npm run simulate:v4` compares V3 and V4 under the same node budgets. V4 uses typed scoring/search profiles, two candidates per doctrine, urgency-weighted budget allocation, cross-doctrine state deduplication, and a diverse visible-response beam.
- `npm run simulate:v5` compares V4 and V5 under the same node budgets. V5 adds habit weights from first-turn reviews: play Profane Well before well-income ticks, Curse a reachable Commander, skip Soul Link with no threat, and stop parking a healthy Commander on the map edge.
- `npm run simulate:v6` compares V5 and V6 under the same node budgets. V6 adds multi-turn map-control pressure plus stronger Well, Fort, Hill, and Village priorities.

## Known Limits From Self-Review
- Opponent response search models visible board actions only and deliberately does not guess hidden cards yet.
- A very slow live device can hit either wall-clock safety cap before its node cap, so exact cross-device move parity is not guaranteed even though every device uses the same limits.
- Search quality still depends on evaluation weights and finite beam width; rules are simulated correctly, but a bounded search can still miss a stronger long sequence.
- Headless simulation still applies a completed whole-turn plan and records replay failures. Live play commits one action, then thinks again.
- Current faction/map-side balance is still partly coupled because each faction keeps its current starting side; first-move bias is measured separately, but map-side mirroring can be added later if needed.

## Next
- **AI-011** - Establish a baseline from repeated simulation reports and tune obvious evaluation/gameplay outliers before adding more intelligence.
- **AI-012** - Model unseen opponent cards probabilistically from faction deck composition and observed cards without reading the hidden hand.
- **AI-013** - Add difficulty presets only if needed later; difficulty should not depend on device performance.
