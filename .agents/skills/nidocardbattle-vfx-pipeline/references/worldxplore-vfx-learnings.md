# WorldXplore VFX learnings

Use this file as the compact accepted reference for NidoCardBattle visual FX. Add only durable lessons that should change future implementation choices.

## 2026-08-22 - Sword swing and arrow reuse

### Accepted WorldXplore sources

- Sword swing atlas
  - source repository: `sgallouet/WorldXplore`
  - source path: `public/assets/fx/sword-swing/sword-swing-atlas.png`
  - Git blob SHA: `49bef9a6bde47d956bb702f8cd2c0053b79913c0`
  - runtime implementation: `src/rendering/combat/sword-swing-effects.ts`
  - atlas: 4 columns x 4 rows, 313 px cell, 1252 x 1252 total
  - four frames per camera-relative direction
  - 10 FPS / 0.4 second authored swing
  - the effect is spawned on the false-to-true attack edge, follows the attack source, sits slightly forward of the actor, and fades near the final quarter of the clip.

- Hunter arrow
  - source repository: `sgallouet/WorldXplore`
  - source path: `public/assets/combat/hunter-arrow.png`
  - Git blob SHA: `f4120880eb444952ad80cbd63be3d52ac820e00a`
  - source size: 32 x 12 px
  - runtime implementation: `src/rendering/combat/arrow-projectile-view.ts`
  - flight timing: `src/gameplay/combat/projectile-flight.ts`
  - the projectile is texture-backed, faces its travel vector, follows a small sinusoidal/parabolic lift, and is pooled/bounded in WorldXplore.

### What worked

- Keep combat state numeric and renderer-independent. The arrow view observes projectile state; it does not decide damage or target validity.
- Use a real authored arrow sprite. A procedural line/triangle reads like debug rendering and loses the visual identity of the attack.
- A sword attack benefits from a separate transient slash asset even when the unit itself already has an attack pose. The body motion gives weight; the slash gives contact direction and speed.
- Short FX should have an explicit lifetime and deterministic cleanup. No effect should need its own permanent animation loop.
- Direction is camera/screen-relative presentation information. The source gameplay rule does not change when the visual direction changes.
- Preserve alpha and original pixels when copying an accepted asset. Do not recompress merely to move it between projects.
- WorldXplore batches/pools repeated combat FX to keep rendering bounded. Nido's prototype can use Phaser objects/tweens per committed action while concurrency is tiny, but future high-frequency effects should remain pooled or capacity-bounded rather than allocate forever.

### Nido adaptation

- Nido uses a much farther 2D tactical camera, so keep the same effect identity but scale it to the unit/hex footprint.
- Arrow flight should remain visible but can be quicker than WorldXplore's 0.42-0.72 s world flight; prioritize tactical pace.
- Preserve a small flight arc instead of linear sliding.
- The slash should appear around the attacker/contact beat, not be stretched between attacker and defender.
- Assist attacks use the same combat primitives as normal attacks: an assisting archer fires the accepted arrow; an assisting melee unit uses the accepted slash/body attack language.
- Retaliation uses the same visual primitive at a shorter/snappier cadence, not a separate visual vocabulary.

### Rejection cases

- Do not replace `hunter-arrow.png` with a Phaser line and triangle once the accepted sprite is available.
- Do not draw a generic semicircle and call it the accepted sword slash when the atlas is available.
- Do not let FX resolve before the corresponding visual projectile/contact beat.
- Do not attach gameplay damage to animation callbacks as a second rules implementation. The engine remains authoritative.
- Do not add SFX as part of visual-FX replication; audio is a separate pipeline and user decision.
