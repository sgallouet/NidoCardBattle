---
name: nidocardbattle-vfx-pipeline
description: "Create, adapt, and integrate NidoCardBattle combat and tactical visual effects. Use for melee slashes, arrows/projectiles, hit impacts, spell FX, summons, deaths, terrain/tactic FX, and other short gameplay VFX."
---

# NidoCardBattle VFX Pipeline

Treat VFX as gameplay presentation, never as gameplay authority. Read the relevant existing animator/presentation code first and keep rules in the engine. For established combat primitives, read `references/combat-vfx-learnings.md` before creating a new effect.

## Core principle

**Reuse an accepted Nido visual language before inventing a parallel one.** If a matching effect already exists in this repository, reuse its asset and presentation pattern, then adapt only scale, timing, placement, and layering when needed.

Do not replace an accepted texture-backed effect merely because a procedural approximation is easier.

## Runtime asset locations

- Accepted/processed runtime VFX belong under `assets/game/vfx/`.
- Combat primitives belong under `assets/game/vfx/combat/`.
- Do not put VFX into `assets/source/`.

## Required workflow

1. **Inspect before creating.** Search NidoCardBattle for the same semantic effect.
2. **Prefer exact reuse.** If the effect already exists and visually fits, reuse the accepted asset instead of regenerating it.
3. **Preserve the presentation contract.** Record source dimensions/grid, frames, FPS/duration, trigger moment, anchor/offset, orientation, alpha behavior, and cleanup behavior.
4. **Adapt transforms, not semantics.** Do not alter damage, range, Assist, retaliation, or other game rules to make an effect fit.
5. **Trigger at the perceived action beat.** A slash belongs on the weapon/contact beat; an arrow visibly travels before impact; hurt/death follows the committed engine result.
6. **Bound transient work.** Effects must be short-lived, cleaned up deterministically, and must not create an unbounded update loop or particle population. Prefer existing Phaser tweens/containers and lightweight sprites.
7. **Keep FX readable at gameplay zoom.** Strong silhouette and timing matter more than micro-detail. Do not cover HP/action-state readability longer than the impact beat.
8. **Use directional assets correctly.** Direction rows/variants are presentation data. Choose the closest screen-space direction; do not mirror or rotate an authored directional frame blindly when it changes the intended silhouette.
9. **Keep fallback code temporary.** If an accepted texture-backed effect exists, a procedural placeholder is not the final implementation.
10. **Record durable learnings.** Add to `references/combat-vfx-learnings.md` only when a repeated failure, successful controlled comparison, or accepted new effect gives us a reusable rule.

## Combat sequencing

Preserve the current combat readability ordering:

`attack anticipation -> attack visual/projectile -> primary impact -> Assist follow-up attack(s) -> retaliation/reflection -> death/resurrection aftermath`

The engine remains the source of truth for which of those beats occur. Presentation should derive consequences from the committed state or from safe cloned-state preview, not reproduce combat formulas.

## Sword swing contract

The accepted slash is an atlas-driven transient, not a generic line:

- 4 x 4 atlas;
- 313 px cells, 1252 x 1252 atlas;
- four frames for each of four camera-relative directions;
- 10 FPS, approximately 0.4 s total;
- spawned on the attack edge;
- placed slightly forward of the attacker toward the attack direction;
- alpha fades only near the end;
- transparent, non-blocking, presentation-only.

Scale the effect to the unit/hex footprint and align it to the actual attacker-to-target screen vector. Do not stretch the slash to span the full distance between units.

## Arrow contract

Use the accepted `hunter-arrow.png` rather than drawing a line/triangle arrow:

- texture-backed projectile;
- oriented along the source-to-target screen vector;
- slight parabolic lift during travel;
- damage/impact remains engine-owned;
- projectile is destroyed immediately after the impact beat;
- no persistent trail unless explicitly authored for a different projectile type.

The arrow must remain visibly in flight instead of teleporting.

## Future FX

When adding Curse, Soul Link, Rally, Displace, Cleave, Necromancy, summon portals, capture pulses, terrain changes, or new projectile families:

- first search this repository for an accepted effect with the same semantic role;
- reuse its asset and core presentation contract when appropriate;
- otherwise build the smallest new effect that matches the established readability: a strong action silhouette, a clear impact beat, restrained particles, fast cleanup;
- add the accepted result and its key parameters to the reference file for the next implementation.

## Audio boundary

This skill owns **visual FX only**. Do not generate, copy, catalog, or wire SFX while using it unless the user separately asks for audio. `$nidocardbattle-audio-pipeline` owns sound.
