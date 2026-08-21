# UnitRule.md

This file owns unit stats, activation, combat, movement, traits, abilities, and the first prototype roster.

## Unit Data
- **UNS1** - Every unit has Mana Cost, HP, Attack, Move, Range, Traits, and at most one special Ability.

## Activation
- **UNA1** - A unit may Move once and Attack once during its activation.
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
- **UNT3** - **Invoker:** this trait makes the unit a valid spawn source under `CRU3`.
- **UNT4** - **Ranged:** this label identifies a unit with base Range 3; its attacks use ranged terrain rules.
- **UNT5** - **Flying:** terrain does not restrict this unit's movement; every terrain hex costs 1 movement point to enter.
- **UNT6** - **Charge:** this unit enters play ready to Move and Attack instead of Exhausted.

## Special Abilities
- **UNB1** - **Displace:** instead of attacking, move one adjacent unit, allied or enemy, to another free hex adjacent to the Displacer.
- **UNB2** - Displacement is repositioning, not normal movement, so it ignores Blocking.
- **UNB6** - **Restore:** when this unit is summoned, its owner chooses one damaged adjacent ally and restores 2 HP to it, up to that ally's maximum HP. If there is no valid ally, the effect ends.

## First Prototype Roster

| Rule | Unit | Mana | HP | Attack | Move | Range | Traits | Ability |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| **UNR1** | Skeletal Infantry | 1 | 2 | 2 | 2 | 1 | Blocking | — |
| **UNR2** | Longbow Ranger | 3 | 2 | 2 | 2 | 3 | Ranged | — |
| **UNR3** | Silverwing Cavalry | 6 | 5 | 4 | 4 | 1 | Flying, Charge | — |
| **UNR4** | Necromancer | 5 | 4 | 1 | 2 | 2 | Invoker | — |
| **UNR5** | Banshee Displacer | 4 | 3 | 2 | 3 | 1 | — | Displace |
| **UNR6** | Light Mage | 4 | 3 | 2 | 2 | 2 | — | Restore |
| **UNR7** | Royal Guard | 2 | 3 | 2 | 2 | 1 | Blocking, Retaliates | — |
| **UNR8** | Grave Knight | 5 | 4 | 4 | 2 | 1 | Blocking, Retaliates | — |
