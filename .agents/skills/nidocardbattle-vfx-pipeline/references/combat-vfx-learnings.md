# Combat VFX learnings

Use this file as the compact accepted reference for NidoCardBattle visual FX. Add only durable lessons that should change future implementation choices.

## Sword swing

- Use a separate transient slash asset even when the unit already has an attack pose: body motion gives weight; the slash gives direction and speed.
- Accepted atlas contract: 4 columns x 4 rows, 313 px cells, 1252 x 1252 total.
- Four frames per camera-relative direction at 10 FPS, about 0.4 seconds total.
- Spawn on the attack beat, position slightly forward of the attacker, and fade near the end.
- Do not stretch the slash between attacker and defender.

## Arrow projectile

- Use the accepted `assets/game/vfx/combat/hunter-arrow.png` instead of procedural line/triangle rendering.
- Source asset size: 32 x 12 px.
- Orient it along the source-to-target screen vector.
- Keep a small visible flight arc.
- Projectile rendering does not decide damage or target validity.
- Destroy the transient projectile immediately after the impact beat.

## Shared lessons

- Keep combat state numeric and renderer-independent.
- Short FX need explicit lifetimes and deterministic cleanup; no separate permanent animation loop.
- Direction is camera/screen-relative presentation information.
- Preserve alpha and original pixels for accepted assets; do not recompress them unnecessarily.
- Keep high-frequency effects pooled or capacity-bounded if concurrency grows.
- Nido uses a distant tactical camera, so FX should remain readable at normal gameplay zoom without dominating the hex.
- Assist and retaliation should reuse the same combat primitives at an appropriately snappier cadence rather than inventing unrelated visuals.
- Do not let FX callbacks become a second gameplay rules implementation.
- Visual FX changes do not imply audio changes.

## Rejection cases

- Do not replace the accepted arrow with a procedural line and triangle.
- Do not leave a generic semicircle as the final sword slash once the atlas is present.
- Do not resolve presentation before the corresponding projectile/contact beat is visible.
- Do not attach gameplay damage calculations to FX timing callbacks.
