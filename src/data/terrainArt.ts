import forestCanopyOverlay from '../../assets/game/terrain/forest-canopy-overlay.png?url';
import forestGround from '../../assets/game/terrain/forest-ground-hex.png?url';
import mountainMassif from '../../assets/game/terrain/mountain-massif-hex.png?url';
import plainMeadow from '../../assets/game/terrain/plain-meadow-hex.png?url';

export const PLAIN_TERRAIN_ART = {
  textureKey: 'terrain-plain-meadow',
  url: plainMeadow,
} as const;

export const FOREST_TERRAIN_ART = {
  ground: {
    textureKey: 'terrain-forest-ground',
    url: forestGround,
  },
  overlay: {
    textureKey: 'terrain-forest-canopy',
    url: forestCanopyOverlay,
    alpha: 0.58,
  },
} as const;

export const MOUNTAIN_TERRAIN_ART = {
  textureKey: 'terrain-mountain-massif',
  url: mountainMassif,
} as const;
