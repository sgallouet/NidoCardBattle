import hunterArrow from '../../assets/game/vfx/combat/hunter-arrow.png?url';
import swordSwingAtlas from '../../assets/game/vfx/combat/sword-swing-atlas.png?url';
import galaxyMapBackground from '../../assets/game/vfx/environment/galaxy-map-background-4k.webp?url';
import galaxyStarsOverlay from '../../assets/game/vfx/environment/galaxy-stars-overlay-4k.webp?url';

export const COMBAT_VFX_ART = {
  hunterArrow: {
    textureKey: 'vfx-hunter-arrow',
    url: hunterArrow,
    width: 32,
    height: 12,
  },
  swordSwing: {
    textureKey: 'vfx-sword-swing',
    url: swordSwingAtlas,
  },
} as const;

export const SWORD_SWING_CONTRACT = {
  columns: 4,
  rows: 4,
  frameSize: 313,
  framesPerDirection: 4,
  fps: 10,
  durationMs: 400,
} as const;

export const GALAXY_BACKGROUND_ART = {
  map: {
    textureKey: 'vfx-galaxy-map-background',
    url: galaxyMapBackground,
    resolution: 4096,
  },
  stars: {
    textureKey: 'vfx-galaxy-stars-overlay',
    url: galaxyStarsOverlay,
    resolution: 4096,
  },
} as const;

export const GALAXY_BACKGROUND_CONTRACT = {
  mapRotationMs: 601_700,
  starsRotationMs: 2_005_667,
  mapTileScale: 0.27,
  starsTileScale: 0.24,
  mapTint: 0x787bb4,
  starsAlpha: 0.345,
} as const;
