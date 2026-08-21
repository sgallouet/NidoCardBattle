import bansheeDisplacer from '../../assets/source/cards/banshee-displacer.png?url';
import graveKnight from '../../assets/source/cards/grave-knight.png?url';
import lightMage from '../../assets/source/cards/light-mage.png?url';
import longbowRanger from '../../assets/source/cards/longbow-ranger.png?url';
import necromancer from '../../assets/source/cards/necromancer.png?url';
import royalGuard from '../../assets/source/cards/royal-guard.png?url';
import silverwingCavalry from '../../assets/source/cards/silverwing-cavalry.png?url';
import skeletalInfantry from '../../assets/source/cards/skeletal-infantry.png?url';
import type { CardDefinitionId } from './cards';

export const CARD_ART: Record<CardDefinitionId, string> = {
  skeletonGuard: skeletalInfantry,
  boneArcher: longbowRanger,
  vampire: silverwingCavalry,
  necromancer,
  banshee: bansheeDisplacer,
  wraith: lightMage,
  ghoul: royalGuard,
  graveKnight,
  graveBolt: necromancer,
  soulMend: lightMage,
};
