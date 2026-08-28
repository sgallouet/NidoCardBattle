import Phaser from 'phaser';
import type { CardDefinitionId } from '../data/cards';
import type { ActionResult, Coord, GameState, PlayerId, UnitState } from '../data/types';
import { AbilityVfxAnimator, type AbilityVfxEvent } from './AbilityVfxAnimator';
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
  neighbors,
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
  playCombatAssist: () => void;
  playCombatHit: (ranged: boolean) => void;
  playCombatRetaliation: () => void;
  playCardPlay: () => void;
  playTacticSound: (cardId: CardDefinitionId) => void;
  playUnitDeath: (owner: PlayerId, commander?: boolean) => void;
  playUnitSummon: (owner: PlayerId) => void;
  presentInvokedUnit: (unitId: string) => Promise<void>;
  presentAbilityVfx: (event: AbilityVfxEvent) => Promise<void>;
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
  private abilityVfx?: AbilityVfxAnimator;
  private battlePresentation?: BattlePresentation;

  create(): void {
    super.create();
    const game = this as unknown as AnimatedSceneInternals;
    const originalMovement = game.animateMovement.bind(this);
    const originalAttack = game.resolveAnimatedAttack.bind(this);
    const originalRenderAll = game.renderAll.bind(this);

    this.motion = new UnitMotionAnimator(this, () => game.boardLayer);
    this.actionFx = new ActionFxAnimator(this, () => game.boardLayer, game.center.bind(this));
    this.abilityVfx = new AbilityVfxAnimator(this, () => game.boardLayer, game.center.bind(this));
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

    game.presentAbilityVfx = async (event) => this.abilityVfx?.play(event, game.renderedUnits);

    game.playAiAction = async (action) => this.playAnimatedAiAction(game, action, originalAttack);

    this.events.once('shutdown', () => {
      this.motion = undefined;
      this.actionFx = undefined;
      this.abilityVfx = undefined;
      this.battlePresentation = undefined;
    });
  }

  private async playAnimatedAiAction(
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
      const actor = findUnit(game.state, action.unitId);
      const result = applyAiAction(game.state, action);
      if (result.ok && actor) {
        await game.presentAbilityVfx({
          kind: 'displace',
          source: { ...actor.coord },
          targetId: action.targetId,
          destination: { ...action.destination },
        });
      }
      return result;
    }

    if (action.kind === 'rally') {
      const actor = findUnit(game.state, action.unitId);
      const targets = actor ? getRallyTargets(game.state, actor.id).map((unit) => ({ ...unit.coord })) : [];
      const result = applyAiAction(game.state, action);
      if (result.ok && actor) {
        await game.presentAbilityVfx({
          kind: 'rally',
          source: { ...actor.coord },
          targets,
          owner: actor.owner,
        });
      }
      return result;
    }

    if (action.kind === 'soulLink') {
      const actor = findUnit(game.state, action.unitId);
      const target = findUnit(game.state, action.targetId);
      const result = applyAiAction(game.state, action);
      if (result.ok && actor && target) {
        await game.presentAbilityVfx({
          kind: 'soulLink',
          source: { ...actor.coord },
          target: { ...target.coord },
        });
      }
      return result;
    }

    if (action.kind === 'curse') {
      const actor = findUnit(game.state, action.unitId);
      const target = findUnit(game.state, action.targetId);
      const result = applyAiAction(game.state, action);
      if (result.ok && actor && target) {
        await game.presentAbilityVfx({
          kind: 'curse',
          source: { ...actor.coord },
          target: { ...target.coord },
        });
      }
      return result;
    }

    if (action.kind === 'thunder') {
      const result = applyAiAction(game.state, action);
      if (result.ok) {
        await game.presentAbilityVfx({
          kind: 'thunder',
          destination: { ...action.destination },
          affected: [
            { ...action.destination },
            ...neighbors(action.destination).map((coord) => ({ ...coord })),
          ],
        });
      }
      return result;
    }

    if (action.kind === 'summon') {
      const result = applyAiAction(game.state, action);
      if (!result.ok) return result;
      game.playCardPlay();
      game.renderAll();
      document.querySelector<HTMLElement>('#hand')?.replaceChildren();
      const summoned = result.summonedUnitId ? findUnit(game.state, result.summonedUnitId) : undefined;
      const view = result.summonedUnitId ? game.renderedUnits.get(result.summonedUnitId) : undefined;
      if (summoned) game.playUnitSummon(summoned.owner);
      if (summoned && view && fx) await fx.summon(view, summoned.owner);
      return result;
    }

    if (action.kind === 'invoke') {
      const result = applyAiAction(game.state, action);
      if (result.ok && result.summonedUnitId) await game.presentInvokedUnit(result.summonedUnitId);
      return result;
    }

    const targetCoord = 'destination' in action
      ? action.destination
      : findUnit(game.state, action.targetId)?.coord;
    const result = applyAiAction(game.state, action);
    if (result.ok) {
      if (action.kind === 'tactic') game.playCardPlay();
      if (action.kind === 'tactic' && (
        action.cardId === 'graveLock'
        || action.cardId === 'buildBridge'
        || action.cardId === 'scorch'
        || action.cardId === 'raiseFort'
        || action.cardId === 'profaneWell'
      )) game.playTacticSound(action.cardId);
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

    for (const [unitId, view] of game.renderedUnits) {
      view.hpText?.setText(`${Math.max(0, findUnit(game.state, unitId)?.hp ?? 0)}`);
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

    const primaryImpactPower = defenderDamage?.dead
      ? 1.55
      : Math.max(1, Math.min(1.45, (primaryTargetDamage || defenderDamage?.damage || 1) / 3));
    game.playCombatHit(attackPose.ranged);
    await this.playImpactBeat(
      motion,
      defenderCoord,
      game.center.bind(this),
      [attackerView, defenderView],
      primaryImpactPower,
      defenderDamage?.dead ?? false,
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
        if (event.dead) {
          game.playUnitDeath(event.unit.owner, event.unit.definitionId === 'commander');
          await motion.die(view, event.unit);
        }
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
        game.playCombatAssist();
        await this.playImpactBeat(
          motion,
          defenderCoord,
          game.center.bind(this),
          [assisterView, defenderView],
          actualDamage >= 2 ? 1.18 : 0.9,
          lethal,
        );
        if (this.actionFx) await this.actionFx.assistHit(defenderCoord, actualDamage);
        await Promise.all([
          motion.hurt(defenderView, defenderBefore, actualDamage, game.center(assister.coord), lethal),
          motion.finishAttack(assisterView, pose.source, true),
        ]);
        remainingHp -= actualDamage;
        if (lethal) {
          game.playUnitDeath(defenderBefore.owner, defenderBefore.definitionId === 'commander');
          await motion.die(defenderView, defenderBefore);
          deathPlayed = true;
          break;
        }
      }
      if (defenderDamage.dead && !deathPlayed) {
        game.playUnitDeath(defenderBefore.owner, defenderBefore.definitionId === 'commander');
        await motion.die(defenderView, defenderBefore);
      }
    }

    const newSkeleton = game.state.units.find((unit) =>
      !beforeIds.has(unit.id)
      && unit.definitionId === 'skeletalInfantry'
      && unit.owner === attackerBefore.owner
      && sameCoord(unit.coord, defenderCoord));
    if (newSkeleton) {
      motion.spawnNecromancyBurst(defenderCoord, game.center.bind(this));
      await this.waitForAnimation(220);
    }

    if (attackerDamage && attackerDamage.damage > 0) {
      const defenderDefinition = unitDefinition(defenderBefore);
      const survivingDefender = findUnit(game.state, defenderId);
      if (survivingDefender && defenderDefinition.traits.includes('Retaliates')) {
        game.playCombatRetaliation();
        const counterPose = await motion.beginAttack(
          defenderView,
          defenderBefore,
          game.center(attackerCoord),
          (from, to) => game.faceUnit(defenderId, from, to),
          true,
        );
        game.playCombatHit(counterPose.ranged);
        await this.playImpactBeat(
          motion,
          attackerCoord,
          game.center.bind(this),
          [defenderView, attackerView],
          attackerDamage.dead ? 1.45 : 1,
          attackerDamage.dead,
        );
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
      if (attackerDamage.dead) {
        game.playUnitDeath(attackerBefore.owner, attackerBefore.definitionId === 'commander');
        await motion.die(attackerView, attackerBefore);
      }
    }

    game.message = result.message;
    return result;
  }

  private async playImpactBeat(
    motion: UnitMotionAnimator,
    coord: Coord,
    center: (coord: Coord) => Phaser.Math.Vector2,
    views: AnimatedUnitView[],
    power: number,
    lethal: boolean,
  ): Promise<void> {
    const hitStopMs = lethal ? 76 : power >= 1.3 ? 60 : 46;
    const recoveryMs = lethal ? 34 : power >= 1.3 ? 24 : 16;
    const pausedSprites = views
      .map((view) => view.sprite)
      .filter((sprite): sprite is Phaser.GameObjects.Sprite => !!sprite?.active && sprite.anims.isPlaying);

    for (const sprite of pausedSprites) sprite.anims.pause();
    const impact = motion.impact(coord, center, power);
    if (lethal) this.cameras.main.shake(115, 0.0026);
    else if (power >= 1.3) this.cameras.main.shake(82, 0.0017);

    await Promise.all([impact, this.waitForAnimation(hitStopMs)]);
    for (const sprite of pausedSprites) {
      if (sprite.active) sprite.anims.resume();
    }
    await this.waitForAnimation(recoveryMs);
  }

  private damageEvents(before: GameState, after: GameState): DamageEvent[] {
    return before.units.flatMap((unit) => {
      const survivor = findUnit(after, unit.id);
      const damage = Math.max(0, unit.hp - (survivor?.hp ?? 0));
      if (damage <= 0) return [];
      return [{ unit, damage, dead: survivor === undefined }];
    });
  }

  private waitForAnimation(duration: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(duration, resolve));
  }
}
