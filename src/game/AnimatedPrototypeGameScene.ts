import Phaser from 'phaser';
import type { ActionResult, Coord, GameState, UnitState } from '../data/types';
import { ActionFxAnimator } from './ActionFxAnimator';
import { applyAiAction, type AiAction } from './ai';
import { BattlePresentation } from './BattlePresentation';
import {
  previewAssistPresentations,
  previewPrimaryTargetDamage,
} from './CombatPresentation';
import {
  attackUnit,
  findUnit,
  getRallyTargets,
  sameCoord,
  unitDefinition,
} from './engine';
import { PrototypeGameScene } from './PrototypeGameScene';
import { UnitMotionAnimator, type AnimatedUnitView } from './UnitMotionAnimator';

interface AnimatedSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, AnimatedUnitView>;
  message: string;
  renderAll: () => void;
  animateMovement: (unitId: string, path: Coord[]) => Promise<void>;
  resolveAnimatedAttack: (attackerId: string, defenderId: string) => Promise<void>;
  faceUnit: (unitId: string, from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
  playAiAction?: (action: AiAction) => Promise<ActionResult>;
}

interface DamageEvent {
  unit: UnitState;
  damage: number;
  dead: boolean;
}

export class AnimatedPrototypeGameScene extends PrototypeGameScene {
  private motion?: UnitMotionAnimator;
  private actionFx?: ActionFxAnimator;
  private battlePresentation?: BattlePresentation;

  create(): void {
    super.create();
    const game = this as unknown as AnimatedSceneInternals;
    const originalMovement = game.animateMovement.bind(this);
    const originalAttack = game.resolveAnimatedAttack.bind(this);
    const originalRenderAll = game.renderAll.bind(this);

    this.motion = new UnitMotionAnimator(this, () => game.boardLayer);
    this.actionFx = new ActionFxAnimator(this, () => game.boardLayer, game.center.bind(this));
    this.battlePresentation = new BattlePresentation(this, game.state);

    game.renderAll = () => {
      originalRenderAll();
      this.battlePresentation?.sync(game.state);
    };

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
      const result = await this.resolveCodeAnimatedAttack(game, attackerId, defenderId, originalAttack);
      game.message = result.message;
    };

    game.playAiAction = async (action) => this.playAiAction(game, action, originalAttack);

    this.events.once('shutdown', () => {
      this.motion = undefined;
      this.actionFx = undefined;
      this.battlePresentation = undefined;
    });
  }

  private async playAiAction(
    game: AnimatedSceneInternals,
    action: AiAction,
    fallbackAttack: (attackerId: string, defenderId: string) => Promise<void>,
  ): Promise<ActionResult> {
    const motion = this.motion;
    const fx = this.actionFx;
    const actorPlayer = game.state.currentPlayer;

    if (action.kind === 'attack') {
      return this.resolveCodeAnimatedAttack(game, action.unitId, action.targetId, fallbackAttack);
    }

    if (action.kind === 'move') {
      const unit = findUnit(game.state, action.unitId);
      const view = game.renderedUnits.get(action.unitId);
      const result = applyAiAction(game.state, action);
      if (result.ok && result.path && unit && view && motion) {
        await motion.move(
          view,
          unit,
          result.path,
          game.center.bind(this),
          (from, to) => game.faceUnit(action.unitId, from, to),
        );
      }
      return result;
    }

    if (action.kind === 'displace') {
      const targetView = game.renderedUnits.get(action.targetId);
      const result = applyAiAction(game.state, action);
      if (result.ok && targetView && fx) await fx.displace(targetView, action.destination);
      return result;
    }

    if (action.kind === 'rally') {
      const actor = findUnit(game.state, action.unitId);
      const targets = actor ? getRallyTargets(game.state, actor.id).map((unit) => ({ ...unit.coord })) : [];
      const result = applyAiAction(game.state, action);
      if (result.ok && actor && fx) await fx.rally(actor.coord, targets, actor.owner);
      return result;
    }

    if (action.kind === 'soulLink') {
      const actor = findUnit(game.state, action.unitId);
      const target = findUnit(game.state, action.targetId);
      const result = applyAiAction(game.state, action);
      if (result.ok && actor && target && fx) await fx.soulLink(actor.coord, target.coord);
      return result;
    }

    if (action.kind === 'curse') {
      const target = findUnit(game.state, action.targetId);
      const result = applyAiAction(game.state, action);
      if (result.ok && target && fx) await fx.curse(target.coord);
      return result;
    }

    if (action.kind === 'summon') {
      const result = applyAiAction(game.state, action);
      if (!result.ok) return result;
      game.renderAll();
      document.querySelector<HTMLElement>('#hand')?.replaceChildren();
      const summoned = result.summonedUnitId ? findUnit(game.state, result.summonedUnitId) : undefined;
      const view = result.summonedUnitId ? game.renderedUnits.get(result.summonedUnitId) : undefined;
      if (summoned && view && fx) await fx.summon(view, summoned.owner);
      return result;
    }

    const targetCoord = 'destination' in action
      ? action.destination
      : findUnit(game.state, action.targetId)?.coord;
    const result = applyAiAction(game.state, action);
    if (result.ok) {
      game.renderAll();
      document.querySelector<HTMLElement>('#hand')?.replaceChildren();
      if (targetCoord && fx) await fx.tacticPulse(targetCoord, actorPlayer);
    }
    return result;
  }

  private async resolveCodeAnimatedAttack(
    game: AnimatedSceneInternals,
    attackerId: string,
    defenderId: string,
    fallback: (attackerId: string, defenderId: string) => Promise<void>,
  ): Promise<ActionResult> {
    const motion = this.motion;
    if (!motion) {
      await fallback(attackerId, defenderId);
      return { ok: true, message: game.message };
    }

    const before = structuredClone(game.state);
    const attackerBefore = findUnit(before, attackerId);
    const defenderBefore = findUnit(before, defenderId);
    const attackerView = game.renderedUnits.get(attackerId);
    const defenderView = game.renderedUnits.get(defenderId);
    if (!attackerBefore || !defenderBefore || !attackerView || !defenderView) {
      await fallback(attackerId, defenderId);
      return { ok: true, message: game.message };
    }

    const assistPlan = previewAssistPresentations(before, attackerId, defenderId);
    const primaryTargetDamage = previewPrimaryTargetDamage(before, attackerId, defenderId);
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
    const result = attackUnit(game.state, attackerId, defenderId);
    if (!result.ok) {
      await motion.finishAttack(attackerView, attackPose.source);
      game.message = result.message;
      return result;
    }

    const events = this.damageEvents(before, game.state);
    const defenderDamage = events.find((event) => event.unit.id === defenderId);
    const attackerDamage = events.find((event) => event.unit.id === attackerId);
    const redirected = defenderBefore.soulLinkTargetId
      ? events.find((event) => event.unit.id === defenderBefore.soulLinkTargetId && event.damage > 0)
      : undefined;
    const sequenceAssists = assistPlan.length > 0
      && !!defenderDamage
      && defenderDamage.damage > primaryTargetDamage
      && !redirected;

    await motion.impact(
      defenderCoord,
      game.center.bind(this),
      defenderDamage?.dead ? 1.55 : Math.max(1, Math.min(1.45, (primaryTargetDamage || defenderDamage?.damage || 1) / 3)),
    );

    if (redirected && (!defenderDamage || defenderDamage.damage === 0)) {
      motion.redirect(defenderCoord, redirected.unit.coord, game.center.bind(this));
    }

    const reactions = events
      .filter((event) => event.unit.id !== attackerId && event.damage > 0)
      .map(async (event) => {
        const view = game.renderedUnits.get(event.unit.id);
        if (!view) return;
        if (sequenceAssists && event.unit.id === defenderId) {
          if (primaryTargetDamage > 0) {
            await motion.hurt(view, event.unit, primaryTargetDamage, game.center(attackerCoord), false);
          }
          return;
        }
        const sourceCoord = redirected?.unit.id === event.unit.id ? defenderCoord : attackerCoord;
        await motion.hurt(view, event.unit, event.damage, game.center(sourceCoord), event.dead);
        if (event.dead) await motion.die(view, event.unit);
      });

    await Promise.all([
      Promise.all(reactions),
      motion.finishAttack(attackerView, attackPose.source),
    ]);

    if (sequenceAssists && defenderDamage && defenderView) {
      let remainingHp = Math.max(0, defenderBefore.hp - primaryTargetDamage);
      let deathPlayed = false;
      for (const assist of assistPlan) {
        if (remainingHp <= 0) break;
        const assister = findUnit(before, assist.unitId);
        const assisterView = game.renderedUnits.get(assist.unitId);
        if (!assister || !assisterView) continue;
        const actualDamage = Math.min(assist.damage, remainingHp);
        if (actualDamage <= 0) continue;
        const lethal = defenderDamage.dead && actualDamage >= remainingHp;
        const pose = await motion.beginAttack(
          assisterView,
          assister,
          targetPoint,
          (from, to) => game.faceUnit(assister.id, from, to),
          true,
        );
        await motion.impact(defenderCoord, game.center.bind(this), actualDamage >= 2 ? 1.18 : 0.9);
        if (this.actionFx) await this.actionFx.assistHit(defenderCoord, actualDamage);
        await Promise.all([
          motion.hurt(defenderView, defenderBefore, actualDamage, game.center(assister.coord), lethal),
          motion.finishAttack(assisterView, pose.source, true),
        ]);
        remainingHp -= actualDamage;
        if (lethal) {
          await motion.die(defenderView, defenderBefore);
          deathPlayed = true;
          break;
        }
      }
      if (defenderDamage.dead && !deathPlayed) await motion.die(defenderView, defenderBefore);
    }

    const newSkeleton = game.state.units.find((unit) =>
      !beforeIds.has(unit.id)
      && unit.definitionId === 'skeletalInfantry'
      && unit.owner === attackerBefore.owner
      && sameCoord(unit.coord, defenderCoord));
    if (newSkeleton) {
      motion.spawnNecromancyBurst(defenderCoord, game.center.bind(this));
      await this.wait(220);
    }

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
    return result;
  }

  private damageEvents(before: GameState, after: GameState): DamageEvent[] {
    return before.units.flatMap((unit) => {
      const survivor = findUnit(after, unit.id);
      const damage = Math.max(0, unit.hp - (survivor?.hp ?? 0));
      if (damage <= 0) return [];
      return [{ unit, damage, dead: survivor === undefined }];
    });
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }
}
