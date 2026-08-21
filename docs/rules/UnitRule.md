# UnitRule.md

## Unit Stats
- Every unit has only:
  - Mana Cost.
  - HP.
  - Attack.
  - Move.
  - Range.
  - Optional single ability.

## Suggested Core Units
- **Soldier**
  - Cheap, balanced melee unit.
- **Guardian**
  - Slow, high HP, protects objectives.
- **Archer**
  - Ranged, fragile.
- **Rider**
  - Fast flanking unit.
- **Mage**
  - Expensive ranged damage unit.
- **Scout**
  - Cheap, very mobile, weak in combat.

## Combat
- Attack damage is fixed.
- HP reaching 0 removes the unit immediately.
- Defender retaliates if alive and attacker is within defender range.
- A unit may attack only once per turn.
- Friendly units block movement.
- Enemy units block movement.
- A unit cannot move through occupied hexes.

## Movement
- Movement is measured in hexes.
- No facing direction.
- No action points.
- No diagonal rules beyond normal hex adjacency.
- Terrain does not change movement cost in MVP.

## Abilities
- A unit may have at most one simple ability.
- Examples:
  - **Guard:** adjacent allies take 1 less melee damage.
  - **Charge:** +1 attack if the unit moved 3+ hexes before attacking.
  - **Pierce:** ignores Forest ranged protection.
  - **Swift:** +1 Move.
- Avoid status-effect stacks and triggered ability chains.

## Unit Design Goal
- Players should identify a unit's role at a glance.
- Positioning should matter more than stat calculation.
- A normal unit should need only one short tooltip.
