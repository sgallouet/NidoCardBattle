import Phaser from 'phaser';
import type { ActionResult, Coord, GameState, UnitState } from '../data/types';
import { attackUnit, findUnit, sameCoord, unitDefinition } from './engine';
import { PrototypeGameScene } from './PrototypeGameScene';
import { UnitMotionAnimator, type AnimatedUnitView } from './UnitMotionAnimator';

interface AnimatedSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, AnimatedUnitView>;
  message: string;
  animateMovement: (unitId: string, path: Coord[]) => Promise<void>;
  resolveAnimatedAttack: (attackerId: string, defenderId: string) => Promise<void>;
  faceUnit: (unitId: string, from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface DamageEvent {
  unit: UnitState;
  damage: number;
  dead: boolean;
}

export class AnimatedPrototypeGameScene extends PrototypeGameScene {
  private motion?: UnitMotionAnimator;

  create(): void {
    super.create();
    const game = this as unknown as AnimatedSceneInternals;
    const originalMovement = game.animateMovement.bind(this);
    const originalAttack = game.resolveAnimatedAttack.bind(this);
    this.motion = new UnitMotionAnimator(this, () => game.boardLayer);

    game.animateMovement = async (unitId, path) => {
      const unit = findUnit(game.state, unitId);
      const view = game.renderedUnits.get(unitId);
      if (!this.motion || !unit || !view) {
        await originalMovement(unitId, path);
        return;
      }
      await this.motion.move(
        view,
        unit,
        path,
        game.center.bind(this),
        (from, to) => game.faceUnit(unitId, from, to),
      );
    };

    game.resolveAnimatedAttack = async (attackerId, defenderId) => {
      if (!this.motion) {
        await originalAttack(attackerId, defenderId);
        return;
      }
      await this.resolveCodeAnimatedAttack(game, attackerId, defenderId, originalAttack);
    };

    this.events.once('shutdown', () => {
      this.motion = undefined;
    });
  }

  private async resolveCodeAnimatedAttack(
    game: AnimatedSceneInternals,
    attackerId: string,
    defenderId: string,
    fallback: (attackerId: string, defenderId: string) => Promise<void>,
  ): Promise<void> {
    const motion = this.motion;
    if (!motion) return fallback(attackerId, defenderId);

    const before = structuredClone(game.state);
    const attackerBefore = findUnit(before, attackerId);
    const defenderBefore = findUnit(before, defenderId);
    const attackerView = game.renderedUnits.get(attackerId);
    const defenderView = game.renderedUnits.get(defenderId);
    if (!attackerBefore || !defenderBefore || !attackerView || !defenderView) {
      await fallback(attackerId, defenderId);
      return;
    }

    const attackerCoord = { ...attackerBefore.coord };
    const defenderCoord = { ...defenderBefore.coord };
    const targetPoint = game.center(defenderCoord);
    const attackPose = await motion.beginAttack(
      attackerView,
      attackerBefore,
      targetPoint,
      (from, to) => game.faceUnit(attackerId, from, to),
    );

    const beforeIds = new Set(before.units.map((unit) => unit.id));
    const result: ActionResult = attackUnit(game.state, attackerId, defenderId);
    if (!result.ok) {
      await motion.finishAttack(attackerView, attackPose.source);
      game.message = result.message;
      return;
    }

    const events = this.damageEvents(before, game.state);
    const defenderDamage = events.find((event) => event.unit.id === defenderId);
    const attackerDamage = events.find((event) => event.unit.id === attackerId);
    const redirected = defenderBefore.soulLinkTargetId
      ? events.find((event) => event.unit.id === defenderBefore.soulLinkTargetId && event.damage > 0)
      : undefined;

    await motion.impact(
      defenderCoord,
      game.center.bind(this),
      defenderDamage?.dead ? 1.55 : Math.max(1, Math.min(1.45, (defenderDamage?.damage ?? 1) / 3)),
    );

    if (redirected && (!defenderDamage || defenderDamage.damage === 0)) {
      motion.redirect(defenderCoord, redirected.unit.coord, game.center.bind(this));
    }

    const reactions = events
      .filter((event) => event.unit.id !== attackerId && event.damage > 0)
      .map(async (event) => {
        const view = game.renderedUnits.get(event.unit.id);
        if (!view) return;
        const sourceCoord = redirected?.unit.id === event.unit.id ? defenderCoord : attackerCoord;
        await motion.hurt(view, event.unit, event.damage, game.center(sourceCoord), event.dead);
        if (event.dead) await motion.die(view, event.unit);
      });

    await Promise.all([
      Promise.all(reactions),
      motion.finishAttack(attackerView, attackPose.source),
    ]);

    const newSkeleton = game.state.units.find((unit) =>
      !beforeIds.has(unit.id)
      && unit.definitionId === 'skeletalInfantry'
      && unit.owner === attackerBefore.owner
      && sameCoord(unit.coord, defenderCoord));
    if (newSkeleton) motion.spawnNecromancyBurst(defenderCoord, game.center.bind(this));

    if (attackerDamage && attackerDamage.damage > 0) {
      const defenderDefinition = unitDefinition(defenderBefore);
      const survivingDefender = findUnit(game.state, defenderId);
      if (survivingDefender && defenderDefinition.traits.includes('Retaliates')) {
        const counterPose = await motion.beginAttack(
          defenderView,
          defenderBefore,
          game.center(attackerCoord),
          (from, to) => game.faceUnit(defenderId, from, to),
          true,
        );
        await motion.impact(attackerCoord, game.center.bind(this), attackerDamage.dead ? 1.45 : 1);
        await Promise.all([
          motion.hurt(
            attackerView,
            attackerBefore,
            attackerDamage.damage,
            game.center(defenderCoord),
            attackerDamage.dead,
          ),
          motion.finishAttack(defenderView, counterPose.source, true),
        ]);
      } else if (defenderDefinition.traits.includes('DarkReflection')) {
        await motion.reflect(defenderCoord, attackerCoord, game.center.bind(this));
        await motion.hurt(
          attackerView,
          attackerBefore,
          attackerDamage.damage,
          game.center(defenderCoord),
          attackerDamage.dead,
        );
      } else {
        await motion.hurt(
          attackerView,
          attackerBefore,
          attackerDamage.damage,
          game.center(defenderCoord),
          attackerDamage.dead,
        );
      }
      if (attackerDamage.dead) await motion.die(attackerView, attackerBefore);
    }

    game.message = result.message;
  }

  private damageEvents(before: GameState, after: GameState): DamageEvent[] {
    return before.units.flatMap((unit) => {
      const survivor = findUnit(after, unit.id);
      const damage = Math.max(0, unit.hp - (survivor?.hp ?? 0));
      if (damage <= 0) return [];
      return [{ unit, damage, dead: survivor === undefined }];
    });
  }
}
