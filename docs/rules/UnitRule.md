# UnitRule.md

This file owns unit stats, activation, combat, movement, traits, abilities, faction rosters, and implementation gaps.

## Unit Data
- **UNS1** - Every unit has Mana Cost, HP, Attack, Move, Range, Traits, and at most one special Ability or Spell unless its roster entry explicitly says otherwise.
- **UNS2** - Every summonable unit belongs to exactly one faction.
- **UNS3** - Faction roster tables below define the target stats; the Implementation column shows whether the prototype currently matches the target and is not a second source of gameplay rules.

## Activation
- **UNA1** - A unit may Move once and Attack once during its activation unless one of its Traits changes that sequence.
- **UNA2** - Movement must happen before the attack; either action may be skipped.
- **UNA3** - An Exhausted unit cannot Move or Attack until its owner's next turn.

## Combat
- **UNC1** - Attacks deal deterministic damage; there is no hit/miss roll.
- **UNC2** - A unit whose HP reaches 0 is removed immediately.
- **UNC3** - Retaliation is a reaction and does not consume the defender's normal attack on its next activation.

## Movement
- **UNM1** - Movement uses movement points; entering a normal hex costs 1 point unless terrain says otherwise.
- **UNM2** - Units have no facing direction.
- **UNM3** - Units cannot enter or pass through occupied hexes.
- **UNM4** - Movement must obey enemy **Blocking** traits.

## Traits
- **UNT1** - **Blocking:** when an enemy enters a hex adjacent to this unit, that enemy's movement ends immediately. Most close-range units should have this trait.
- **UNT2** - **Retaliates:** after surviving an attack, this unit immediately deals its Attack damage back if the attacker is within its Range.
- **UNT3** - **Invoker:** instead of attacking, this unit may summon an **Invoked Beast** on one free passable adjacent hex not blocked by `CRC4`. The Invoked Beast enters Exhausted, costs no mana, and has no Unit Card. Each Invoker may have only one living Invoked Beast at a time; it cannot invoke another until its current Beast is removed.
- **UNT4** - **Ranged:** this label identifies a unit with base Range 3; its attacks use ranged terrain rules.
- **UNT5** - **Flying:** terrain does not restrict this unit's movement except for Mountain under `MPT5`; every terrain hex it can enter costs 1 movement point.
- **UNT6** - **Agile Assault:** this unit may split its Move around its attack, moving before and again after attacking; total movement spent across both movement phases cannot exceed its Move stat. Retaliation damage received by this unit is reduced by 50%, rounded up.
- **UNT7** - **Dark Reflection:** when an enemy directly damages this unit, that attacker immediately takes 30% of the damage actually dealt, rounded to the nearest whole HP. Redirected damage does not trigger Dark Reflection.
- **UNT8** - **Necromancy:** when this unit personally kills an enemy with its attack, summon an Exhausted Skeletal Infantry on the defeated unit's hex if that hex is free after death resolution.
- **UNT9** - **Phase:** this unit ignores enemy Blocking while moving; occupied and otherwise impassable hexes still cannot be entered unless another trait says otherwise.
- **UNT10** - **Assist:** when an allied unit makes a close normal attack, this unit immediately adds 1 damage to that same primary target if the target is within this unit's Range. A close attack must be made from an adjacent hex by a primary attacker that does not have the **Ranged** trait; ranged attacks and attacks made from farther than 1 hex never trigger Assist. If the assisting unit is positioned directly on the opposite side of the target from the primary attacker, forming a straight attacker-target-assister line across the hex grid, that Assist deals 2 damage instead. Assist does not consume Move or Attack, does not trigger retaliation, and may trigger even if the assisting unit has already acted this turn; Exhausted units cannot Assist.
- **UNT11** - Each eligible assisting unit contributes its own Assist damage, so multiple Assist units may stack on the same attack. Assist damage cannot itself trigger Assist or other attack-triggered effects.
- **UNT12** - **Set Shot:** after this unit spends any movement during its turn, it cannot make a normal attack that turn. Moving does not disable **Assist**; the unit may still contribute Assist damage while otherwise eligible.

## Special Abilities / Spells
- **UNB1** - **Displace:** instead of attacking, move one adjacent unit, allied or enemy, to another free hex adjacent to the Displacer.
- **UNB2** - Displacement is repositioning, not normal movement, so it ignores Blocking.
- **UNB6** - **Restore:** when this unit is summoned, its owner chooses one damaged adjacent ally and restores 2 HP to it, up to that ally's maximum HP. If there is no valid ally, the effect ends.
- **UNB7** - **Rally:** instead of attacking, give each adjacent allied unit +1 Move for the current turn; Rally cannot increase a unit that has already completed its movement this turn.
- **UNB8** - **Soul Link:** instead of attacking, choose one adjacent allied Undead unit. Until the start of the Commander's next turn, all damage that would be dealt to the Commander is dealt to the linked unit instead. If redirected damage kills the linked unit, any excess damage from that same damage instance is dealt to the Commander normally; the link then ends.
- **UNB9** - **Curse:** instead of attacking, choose one enemy within Range. That unit takes 1 damage at the end of each of its owner's next 3 turns, then Curse ends.
- **UNB10** - **Blood Drain:** after this unit deals damage with its normal attack, restore 1 HP to it, up to its maximum HP.
- **UNB11** - **Cleave:** when this unit makes a normal attack, deal its Attack damage to the target and every other enemy adjacent to the attacker. Only the original target may retaliate.

## Human Army

Human identity: formation, mobility, ranged support, and controlled repositioning.

| Rule | Unit | Mana | HP | DMG | Move | Range | Traits | Spell / Ability | Implementation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| **HUR1** | Human Commander | — | 10 | 3 | 2 | 1 | Blocking, Retaliates | Rally | ✅ Implemented. |
| **HUR2** | Royal Guard | 2 | 3 | 2 | 2 | 1 | Blocking, Retaliates, Assist | — | ✅ Implemented. |
| **HUR3** | Longbow Ranger | 3 | 1 | 1 | 2 | 3 | Ranged, Assist, Set Shot | — | ✅ Implemented. |
| **HUR4** | Silverwing Cavalry | 6 | 5 | 4 | 4 | 1 | Flying, Agile Assault | — | ✅ Implemented. |
| **HUR5** | Light Mage | 4 | 3 | 2 | 2 | 2 | — | Restore | ✅ Implemented. |
| **HUR6** | Banner Captain | 4 | 4 | 2 | 2 | 1 | — | — | ✅ Implemented. |
| **HUR7** | Wind Adept | 3 | 2 | 1 | 3 | 2 | — | Displace | ✅ Implemented. |

## Undead Army

Undead identity: summoning, disruption, attrition, damage redirection, and punishing clustered enemies.

| Rule | Unit | Mana | HP | DMG | Move | Range | Traits | Spell / Ability | Implementation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| **UDR1** | Undead Commander | — | 10 | 3 | 2 | 1 | Blocking, Dark Reflection | Soul Link | ✅ Implemented. |
| **UDR2** | Skeletal Infantry | 1 | 2 | 2 | 2 | 1 | Blocking, Assist | — | ✅ Implemented. |
| **UDR3** | Bone Archer | 3 | 1 | 1 | 2 | 3 | Ranged, Assist, Set Shot | — | ✅ Implemented. |
| **UDR4** | Necromancer | 5 | 4 | 1 | 2 | 3 | Ranged, Necromancy, Invoker | Curse | ✅ Implemented. |
| **UDR5** | Banshee | 4 | 3 | 2 | 3 | 1 | — | Displace | ✅ Implemented. |
| **UDR6** | Vampire | 5 | 4 | 3 | 3 | 1 | Flying | Blood Drain | ✅ Implemented. |
| **UDR7** | Wraith | 4 | 3 | 2 | 4 | 1 | Phase | — | ✅ Implemented. |
| **UDR8** | Grave Knight | 5 | 5 | 3 | 2 | 1 | Blocking, Retaliates | Cleave | ✅ Implemented. |
| **UDR9** | Invoked Beast | — | 2 | 1 | 2 | 1 | — | — | ✅ Implemented as the token created by `UNT3`. |
