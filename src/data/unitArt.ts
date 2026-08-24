import bannerCaptain from '../../assets/game/units/shadows/banner-captain.webp?url';
import humanCommander from '../../assets/game/units/shadows/human-commander.webp?url';
import lightMage from '../../assets/game/units/shadows/light-mage.webp?url';
import longbowRanger from '../../assets/game/units/shadows/longbow-ranger.webp?url';
import royalGuard from '../../assets/game/units/shadows/royal-guard.webp?url';
import silverwingCavalry from '../../assets/game/units/shadows/silverwing-cavalry.webp?url';
import windAdept from '../../assets/game/units/shadows/wind-adept.webp?url';
import skeletalInfantryAttack from '../../assets/game/units/undead/skeletal_infantry/attack.png?url';
import skeletalInfantryIdle from '../../assets/game/units/undead/skeletal_infantry/idle.png?url';
import skeletalInfantryWalk from '../../assets/game/units/undead/skeletal_infantry/walk.png?url';
import banshee from '../../assets/game/units/shadows/banshee.webp?url';
import boneArcher from '../../assets/game/units/shadows/bone-archer.webp?url';
import graveKnight from '../../assets/game/units/shadows/grave-knight.webp?url';
import invokedBeast from '../../assets/game/units/shadows/invoked-beast.webp?url';
import necromancer from '../../assets/game/units/shadows/necromancer.webp?url';
import undeadCommander from '../../assets/game/units/shadows/undead-commander.webp?url';
import vampire from '../../assets/game/units/shadows/vampire.webp?url';
import wraith from '../../assets/game/units/shadows/wraith.webp?url';
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
});

export const UNIT_ART: Partial<Record<UnitDefinitionId, UnitArtDefinition>> = {
  humanCommander: staticUnitArt(humanCommander, 'human-commander', 0.28),
  undeadCommander: staticUnitArt(undeadCommander, 'undead-commander', 0.28),
  royalGuard: staticUnitArt(royalGuard, 'royal-guard', 0.27),
  longbowRanger: staticUnitArt(longbowRanger, 'longbow-ranger', 0.27),
  silverwingCavalry: staticUnitArt(silverwingCavalry, 'silverwing-cavalry', 0.31),
  lightMage: staticUnitArt(lightMage, 'light-mage', 0.28),
  bannerCaptain: staticUnitArt(bannerCaptain, 'banner-captain', 0.28),
  windAdept: staticUnitArt(windAdept, 'wind-adept', 0.28),
  skeletalInfantry: {
    frameSize: 200,
    scale: 0.41,
    anchorX: 0.5,
    anchorY: 0.875,
    offsetX: 0,
    offsetY: 7,
    defaultFacing: 'south-west',
    mirroredFacings: ['south-east', 'north-east'],
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
  },
  boneArcher: staticUnitArt(boneArcher, 'bone-archer', 0.27),
  necromancer: staticUnitArt(necromancer, 'necromancer'),
  banshee: staticUnitArt(banshee, 'banshee'),
  vampire: staticUnitArt(vampire, 'vampire'),
  wraith: staticUnitArt(wraith, 'wraith'),
  graveKnight: staticUnitArt(graveKnight, 'grave-knight', 0.39),
  invokedBeast: staticUnitArt(invokedBeast, 'invoked-beast', 0.31),
};
