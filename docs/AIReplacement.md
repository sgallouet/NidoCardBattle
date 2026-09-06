# AI review and replacement proposal

Reviewed 2026-09-05. Design proposal; the live AI has not been replaced.
Gameplay remains owned by `docs/rules/`. This proposal supersedes no rules.

## Diagnosis

The code supports the complaint that the AI can make weak decisions, but does not establish a player-age comparison or a world ranking. More bonuses alone will not establish strength.

| Generation | What it actually does | Main limitation |
| --- | --- | --- |
| Original (`ai.ts`) | Beam search with state deduplication and a separate reply audit | Finite action horizon and heuristic candidate pruning |
| V2 | Tracks completed depth and adds deployment/exposure evaluation | Still separates own-plan construction from a shallow opponent audit |
| V3 | Splits search across nine strategic doctrines | Three-state beams; doctrines largely explore variations of the same board |
| V4 | Adds candidates, adaptive budgets, reply beam | Diversity reservations can be discarded before expansion |
| V5 | Adds specific behavioral incentives | Rewards chosen habits rather than demonstrating their payoff |
| V6 | Adds map-control pressure and terrain preferences | More competing heuristic scores without deeper adversarial search |
| V7 | Changes tactical/healing ordering and objective habits | Discrete preferences can override better evaluated continuations |
| V8 (live) | Assigns objective runners and adds conversion pressure | Inherits the same search; still has large activity/healing incentives |

V4–V8 are profiles around `planPortfolioAiTurn` in `src/game/aiPlannerV3.ts`, not independent new search algorithms.

### Findings to fix first

1. **Reserved actions can never be searched.** `doctrineActions` appends missing action kinds and unit moves after its initial retained list. `buildDoctrineCandidates` then slices that list to `expandedActionsPerNode`. V8 retains ten before appending diversity, but expands seven. The claimed diversity protection therefore does not reach expansion.
2. **Seven own actions and three opponent actions are not full turns.** Those are V8's inherited maximum depths. Multi-unit combinations and the retaliation to a successful attack can lie outside the horizon. There is no search of our following turn to evaluate a sacrifice or recapture.
3. **Scoring can reward the appearance of useful play.** V8 awards 90 per action and 20,000 for qualifying planned Village moves. Its ordinary strategic outlook contribution is bounded to ±500. Healing credit inspects a move and initial health, rather than requiring the unit to remain there and realize the benefit. These are real scoring imbalances; their match-level impact still needs measurement.
4. **Search wastes equivalent action orders.** Own-turn alternatives deduplicate action arrays, not resulting positions; the beam itself is not deduplicated. Different orders reaching the same position can consume several slots. Old V1/V2 already had state-based visited maps.
5. **Distance estimates are not travel plans.** Runner assignment uses hex distance. Approximate danger uses Move + Range without resolving obstacles or movement restrictions. These shortcuts influence pruning before exact engine simulation can correct the decision.
6. **Opponent cards are absent from reply search.** Avoiding hidden-hand access is correct; assuming no card plays leaves foreseeable faction threats unexamined.
7. **Evaluation and execution disagree.** `AiGameScene.playAiPlan` executes only `actions[0]` and requests a fresh plan. `simulatePlannerDuelGame` executes the whole sequence. A setup can lose its intended continuation in live play, and whole-plan benchmark wins do not validate that live behavior.

Focused baseline: 49/52 tests passed across the eight planner test files. Failures occurred in the original planner's UNT3 fixture, V2's deployment sequence, and V5's opening tactic expectation. These are baseline failures; their causes have not been diagnosed. V8's seven tests passed, which establishes those scenarios only. No new strength tournament was run.

## Proposed replacement: one adversarial turn search

Keep the engine action API, Worker, replay telemetry and benchmark harness. Replace the portfolio with one shared search, using the old planners only as benchmark opponents. No new audio or visual effects are needed.

**Search coordinated plans, then their refutations.** Build candidate turn sequences with an explicit end-turn choice. Use engine-simulated short combinations to prioritize setup moves, attacks, deployment and repositioning; retain individual legal actions so templates do not define what the AI is allowed to consider. Apply diversity at the actual expansion boundary. Merge equivalent gameplay states while preserving all future-relevant fields and excluding presentation logs.

**Spend depth on contested decisions.** Iteratively search our turn → opposing turn → our following turn, deepening only completed iterations within the existing Worker budget. Alternate perspective at turn boundaries, not after every action. Use adversarial value backup over the retained turn candidates. Extend forcing combat and Commander threats until stable or until an explicit extension budget ends. A cutoff is uncertainty, never proof of safety or a forced win. Retain the best fully evaluated plan when time expires.

**Compare outcomes in one score.** Terminal outcomes under GRV1–GRV4 outrank all heuristics. Otherwise evaluate the position after the strongest searched reply: surviving army, Commander prospects, usable income, deployment access, terrain and time to objectives. Remove rewards for action count, mana spent, ability use or merely visiting a tile. Credit their resulting benefit instead. Use one unsaturated internal score; keep the bounded outlook for display only. Tune weights against held-out outcomes, not expected favorite moves.

**Allocate the army deliberately.** Estimate travel time using engine-compatible path costs. Send the minimum adequate force to an objective and concentrate the remainder where local superiority produces a favorable exchange. Include interception, deployment denial, support coverage and survival in assignments. Reconsider assignments after meaningful changes; objective ownership alone should not trigger an attack. Prefer a concrete win, then prevention of an opponent win, then the best sustainable exchange or expansion. These priorities guide search rather than prescribe one opening against every position.

**Preserve tactical intent.** Save the selected continuation with expected gameplay-state fingerprints. After each animation, validate the actual state and next legal action. Reuse that continuation as the incumbent during further thinking; replace it only when a newly evaluated continuation improves it. Invalidate mismatches explicitly. Both live play and simulations must use this same controller and stopping policy.

**Model uncertainty explicitly.** Subsequently add a small set of opponent hand/deck samples consistent with faction composition and public history under CRD1–CRD6. Never inspect actual hidden cards or future deck order. Compare plans across the same samples, balancing average result with downside risk. Decisions must depend only on information available at their decision point; independently optimizing clairvoyant continuations in each sample would overstate strength. Add invariance tests that shuffle inaccessible cards without changing decisions.

## Cheapest implementation order and acceptance

1. Fix expansion diversity, state deduplication and live/benchmark execution parity. Add regressions proving a reserved setup reaches expansion and its continuation survives live execution.
2. Introduce the shared adversarial search and outcome score. Add curated positions for combined attacks, beneficial sacrifices, blocked routes, deployment sequencing and endgame decisions, referencing owning rule IDs.
3. Add public-information card sampling once the deterministic search is reliable.
4. Run held-out matches against V7, V8 and distinct rush, economy and defensive opponents, balancing factions, map starts and move order. Require zero illegal replays, report draws and timeouts, and use pair-level confidence intervals. A proposed promotion target is at least 65% match score with a confidence interval above 50%, followed by human tests aimed at exploiting it. Do not promote from one narrow self-play win.

For a serious attempt at elite strength, later train a compact policy/value model offline from diverse self-play and human defeats, using it inside this same search. Neural evaluation plus search has a strong precedent in [AlphaZero](https://deepmind.google/blog/alphazero-shedding-new-light-on-chess-shogi-and-go/), but that result is not transferable evidence of strength here: this game has hidden cards, different turn structure and no established world-level benchmark. Start with the measurable structural repairs; training requires a separate compute investment, not more prompt tokens.
