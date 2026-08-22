import bannerCaptain from '../../assets/game/cards/banner-captain.webp?url';
import banshee from '../../assets/game/cards/banshee.webp?url';
import boneArcher from '../../assets/game/cards/bone-archer.webp?url';
import buildBridge from '../../assets/game/cards/build-bridge.webp?url';
import graveKnight from '../../assets/game/cards/grave-knight.webp?url';
import lightMage from '../../assets/game/cards/light-mage.webp?url';
import longbowRanger from '../../assets/game/cards/longbow-ranger.webp?url';
import necromancer from '../../assets/game/cards/necromancer.webp?url';
import raiseFort from '../../assets/game/cards/raise-fort.webp?url';
import royalGuard from '../../assets/game/cards/royal-guard.webp?url';
import silverwingCavalry from '../../assets/game/cards/silverwing-cavalry.webp?url';
import skeletalInfantry from '../../assets/game/cards/skeletal-infantry.webp?url';
import vampire from '../../assets/game/cards/vampire.webp?url';
import wraith from '../../assets/game/cards/wraith.webp?url';
import type { CardDefinitionId } from './cards';

export const CARD_ART = {
  royalGuard,
  longbowRanger,
  silverwingCavalry,
  lightMage,
  bannerCaptain,
  windAdept: lightMage,
  skeletalInfantry,
  boneArcher,
  necromancer,
  banshee,
  vampire,
  wraith,
  graveKnight,
  graveLock: necromancer,
  buildBridge,
  scorch: lightMage,
  raiseFort,
  profaneWell: necromancer,
} satisfies Record<CardDefinitionId, string>;
