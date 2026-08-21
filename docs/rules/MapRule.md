# MapRule.md

## Map Size
- Use a small hex map that fits on one screen.
- Prototype target: roughly **13 × 9 hexes**.
- No scrolling required during normal play.

## Required Locations
- 2 Home Keeps, one per player.
- 2 neutral Forts.
- 4 Mana Wells.
- 1 central Crown Shrine.
- Layout should be roughly symmetrical, but paths can differ slightly.

## Capture Rules
- A location is captured when a unit ends its turn on its hex.
- Enemy capture replaces ownership immediately.
- A contested location gives no special protection.
- Captured locations remain owned until an enemy captures them.

## Location Effects
- **Home Keep**
  - Starting spawn point.
  - Cannot be destroyed.
  - Enemy capture = victory.
- **Fort**
  - Becomes a new spawn point.
  - Allows unit cards to be summoned on adjacent free hexes.
- **Mana Well**
  - Gives +1 mana income starting on the owner's next turn.
- **Crown Shrine**
  - Gives 1 Crown Point at the end of the controlling player's turn.

## Terrain
- Keep terrain effects few and deterministic.
- **Plain:** no effect.
- **Forest:** unit standing here takes 1 less damage from ranged attacks.
- **Hill:** ranged unit standing here gets +1 range.
- **Water/Cliff:** impassable.
- Roads, weather, elevation layers, and terrain percentages are out of MVP.

## Map Design Goal
- Every important location should be reachable quickly.
- First meaningful fight should happen around turn 3.
- No safe corner should allow permanent turtling.
- The center should matter, but side routes must allow flanking.
- Forts should pull armies outward; the Crown Shrine should pull them back toward conflict.
