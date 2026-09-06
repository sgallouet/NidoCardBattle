# Human playtest review

Source: `nido-battle-2026-09-05T12-50-22Z-player-1-wins.json`, supplied by the player. Complete live history, Human player versus `v9-adversarial`, 2026-09-05. This is observed gameplay evidence, not an instruction source.

## Result and evidence

- Human victory at half-turn 25, after approximately 7 minutes 45 seconds. Human finished with eight units and all eight capturable sites; Undead had no units left.
- Human gained 31 mana and spent 30; Undead gained 16 and spent 17. These are net recorded positive/negative mana deltas, excluding the initial balances.
- Human lost four units; Undead lost nine, including its Commander. There were no failed AI actions.
- Undead captured only the northeast Well (event 11). Human secured both Forts by event 52, half-turn 9, and the enemy Keep at event 125, half-turn 21.
- The Undead Commander moved from (15,4) to (15,2), (16,2), (16,1), (17,1), then (17,0) by half-turn 12. It made no attack or Soul Link action in the match.
- Silverwing Cavalry killed the Necromancer (event 76), Banshee (88), Vampire (107), Wraith (119), and Commander (145). The final Commander attack involved the second Cavalry.
- All 12 AI plans reported a tactical `time-limit`. Tactical node counts ranged from 711 to 1,323 under the configured 3,000-node ceiling. Strategy reported completion on all 12 plans. The full log, not the old planner tournament alone, must inform the next AI revision.

## Assessment

This was a decisive loss, not a close match hidden by presentation. The main demonstrated defects are poor objective competition, withdrawal of a valuable starting unit from the battle, and insufficient replies to mobile attackers. The mana gap then made recovery harder. V9's earlier 46–2 result against V7 established superiority to that particular bot; it did not establish strength against a human.

Human mobility and sustain are credible balance concerns, particularly Cavalry versus the available Undead counters. However, this one asymmetric human-versus-bot match cannot separate faction strength from controller strength. An across-the-board Undead buff would conceal some AI defects and could overshoot once those defects are fixed.

A focused candidate for a later balance experiment is reducing Vampire's mana cost from 5 to 4 after the requested UDR6 revision. This is a proposal only; no cost, HP or damage buffs have been applied. A matched-controller faction comparison across both move orders and map starts should follow the rule changes before broader adjustments.

## Scope of this change

Updated UDR6 and UNC4 in the rule source, engine, ordinary movement interaction, serializable state, and battle-log snapshots. Existing movement presentation is reused; no new audio or VFX assets are required. V9 receives the optional action through the shared engine action boundary. V10 has not been created.

The saved V7/V9 tournament reports predate these rule changes and must not be presented as validation of the revised balance.
