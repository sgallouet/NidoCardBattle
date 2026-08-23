import ruin from '../../assets/game/decorations/ruin.webp?url';
import town from '../../assets/game/decorations/town.webp?url';

export const RUIN_ART = {
  textureKey: 'decoration-ruin',
  url: ruin,
  displayWidth: 72,
  displayHeight: 70,
  bottomOffset: 29,
} as const;

export const TOWN_ART = {
  textureKey: 'decoration-town',
  url: town,
  displayWidth: 74,
  displayHeight: 73,
  bottomOffset: 30,
} as const;
