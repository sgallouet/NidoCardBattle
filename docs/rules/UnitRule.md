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

## Special Abilities
- **UNB1** - **Displace:** instead of attacking, move one adjacent unit, allied or enemy, to another free hex adjacent to the Displacer.
- **UNB2** - Displacement is repositioning, not normal movement, so it ignores Blocking.
- **UNB3** - **Blood Drain:** when this unit's normal attack deals damage, heal this unit by 1 HP.
- **UNB4** - **Phase:** this unit ignores Blocking while moving.
- **UNB5** - **Feast:** when this unit kills another unit with a normal attack, heal this unit by 2 HP.

## Suggested First Army — Undead
- **UNR1** - **Skeleton Guard:** cheap melee; Traits: Blocking, Retaliates.
- **UNR2** - **Bone Archer:** fragile ranged attacker; no defensive trait.
- **UNR3** - **Vampire:** fast melee; Traits: Blocking, Retaliates; Ability: Blood Drain.
- **UNR4** - **Necromancer:** fragile ranged support; Trait: Invoker.
- **UNR5** - **Banshee:** fragile control unit; Ability: Displace.
- **UNR6** - **Wraith:** very mobile scout; Ability: Phase.
- **UNR7** - **Ghoul:** medium melee bruiser; Trait: Blocking; Ability: Feast.
- **UNR8** - **Grave Knight:** expensive heavy melee; Traits: Blocking, Retaliates.
