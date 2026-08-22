import hunterArrow from '../../assets/game/vfx/combat/hunter-arrow.png?url';
import swordSwingAtlas from '../../assets/game/vfx/combat/sword-swing-atlas.png?url';

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
