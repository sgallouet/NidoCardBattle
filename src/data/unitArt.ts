import humanCommander from '../../assets/game/units/human/human-commander.webp?url';
import longbowRanger from '../../assets/game/units/human/longbow-ranger.webp?url';
import royalGuard from '../../assets/game/units/human/royal-guard.webp?url';
import silverwingCavalry from '../../assets/game/units/human/silverwing-cavalry.webp?url';
import skeletalInfantryAttack from '../../assets/game/units/undead/skeletal_infantry/attack.png?url';
import skeletalInfantryIdle from '../../assets/game/units/undead/skeletal_infantry/idle.png?url';
import skeletalInfantryWalk from '../../assets/game/units/undead/skeletal_infantry/walk.png?url';
import banshee from '../../assets/game/units/undead/banshee.webp?url';
import graveKnight from '../../assets/game/units/undead/grave-knight.webp?url';
import necromancer from '../../assets/game/units/undead/necromancer.webp?url';
import undeadCommander from '../../assets/game/units/undead/undead-commander.webp?url';
import wraith from '../../assets/game/units/undead/wraith.webp?url';
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

const staticUnitArt = (
  url: string,
  key: string,
  scale = 0.35,
): UnitArtDefinition => ({
  frameSize: 200,
  scale,
  anchorX: 0.5,
  anchorY: 0.875,
  offsetX: 0,
  offsetY: 8,
  defaultFacing: 'south-east',
  mirroredFacings: ['south-west', 'north-west'],
  movementMsPerHex: 190,
  attackDurationMs: 520,
  attackImpactMs: 330,
  animations: {
    idle: {
      textureKey: `unit-${key}-idle`,
      animationKey: `unit-${key}-idle-animation`,
      url,
      frameCount: 1,
      frameRate: 1,
      repeat: 0,
    },
    walk: {
      textureKey: `unit-${key}-walk`,
      animationKey: `unit-${key}-walk-animation`,
      url,
      frameCount: 1,
      frameRate: 1,
      repeat: -1,
    },
    attack: {
      textureKey: `unit-${key}-attack`,
      animationKey: `unit-${key}-attack-animation`,
      url,
      frameCount: 1,
      frameRate: 1,
      repeat: 0,
    },
  },
  shadow: {
    width: 42,
    height: 12,
    offsetX: 1,
    offsetY: 15,
    alpha: 0.22,
  },
});

export const UNIT_ART: Partial<Record<UnitDefinitionId, UnitArtDefinition>> = {
  humanCommander: staticUnitArt(humanCommander, 'human-commander', 0.28),
  undeadCommander: staticUnitArt(undeadCommander, 'undead-commander', 0.28),
  royalGuard: staticUnitArt(royalGuard, 'royal-guard', 0.27),
  longbowRanger: staticUnitArt(longbowRanger, 'longbow-ranger', 0.27),
  silverwingCavalry: staticUnitArt(silverwingCavalry, 'silverwing-cavalry', 0.31),
  skeletalInfantry: {
    frameSize: 200,
    scale: 0.41,
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
  necromancer: staticUnitArt(necromancer, 'necromancer'),
  banshee: staticUnitArt(banshee, 'banshee'),
  wraith: staticUnitArt(wraith, 'wraith'),
  graveKnight: staticUnitArt(graveKnight, 'grave-knight', 0.39),
};
