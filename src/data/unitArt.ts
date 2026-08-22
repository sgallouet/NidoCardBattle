import skeletalInfantryAttack from '../../assets/game/units/undead/skeletal_infantry/attack.png?url';
import skeletalInfantryIdle from '../../assets/game/units/undead/skeletal_infantry/idle.png?url';
import skeletalInfantryWalk from '../../assets/game/units/undead/skeletal_infantry/walk.png?url';
import type { UnitDefinitionId } from './units';

export type UnitAnimationState = 'idle' | 'walk' | 'attack';
export type UnitFacing = 'north-east' | 'south-east' | 'south-west' | 'north-west';

export interface UnitAnimationClip {
  textureKey: string;
  animationKey: string;
  url: string;
  frameCount: number;
  frameRate: number;
  repeat: number;
}

export interface UnitArtDefinition {
  frameSize: number;
  scale: number;
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
  defaultFacing: UnitFacing;
  mirroredFacings: UnitFacing[];
  movementMsPerHex: number;
  attackDurationMs: number;
  attackImpactMs: number;
  animations: Record<UnitAnimationState, UnitAnimationClip>;
  shadow: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    alpha: number;
  };
}

export const UNIT_ART: Partial<Record<UnitDefinitionId, UnitArtDefinition>> = {
  skeletalInfantry: {
    frameSize: 200,
    scale: 4 / 7,
    anchorX: 0.5,
    anchorY: 0.875,
    offsetX: 0,
    offsetY: 7,
    defaultFacing: 'south-east',
    mirroredFacings: ['south-west', 'north-west'],
    movementMsPerHex: 190,
    attackDurationMs: 560,
    attackImpactMs: 360,
    animations: {
      idle: {
        textureKey: 'unit-skeletal-infantry-idle',
        animationKey: 'unit-skeletal-infantry-idle-animation',
        url: skeletalInfantryIdle,
        frameCount: 1,
        frameRate: 1,
        repeat: 0,
      },
      walk: {
        textureKey: 'unit-skeletal-infantry-walk',
        animationKey: 'unit-skeletal-infantry-walk-animation',
        url: skeletalInfantryWalk,
        frameCount: 8,
        frameRate: 16,
        repeat: -1,
      },
      attack: {
        textureKey: 'unit-skeletal-infantry-attack',
        animationKey: 'unit-skeletal-infantry-attack-animation',
        url: skeletalInfantryAttack,
        frameCount: 8,
        frameRate: 14,
        repeat: 0,
      },
    },
    shadow: {
      width: 36,
      height: 11,
      offsetX: 1,
      offsetY: 13,
      alpha: 0.2,
    },
  },
};
