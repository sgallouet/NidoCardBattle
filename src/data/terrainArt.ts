import bridgeOverlay from '../../assets/game/terrain/bridge-overlay.webp?url';
import forestCanopyOverlay from '../../assets/game/terrain/forest-canopy-overlay.png?url';
import forestGround from '../../assets/game/terrain/forest-ground-hex.png?url';
import hillOverlay from '../../assets/game/terrain/hill-overlay.webp?url';
import mountainMassif from '../../assets/game/terrain/mountain-massif-hex.png?url';
import plainMeadow from '../../assets/game/terrain/plain-meadow-hex.png?url';
import riverWaterPainted from '../../assets/game/terrain/river-water-painted.png?url';
import riverWaveDisplacement from '../../assets/game/vfx/environment/river-wave-displacement.png?url';

export const PLAIN_TERRAIN_ART = {
  textureKey: 'terrain-plain-meadow',
  url: plainMeadow,
} as const;

export const BRIDGE_TERRAIN_ART = {
  textureKey: 'terrain-bridge-overlay',
  url: bridgeOverlay,
  displayWidth: 98,
  displayHeight: 36,
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

export const HILL_TERRAIN_ART = {
  textureKey: 'terrain-hill-overlay',
  url: hillOverlay,
  displayWidth: 76,
  displayHeight: 76,
} as const;

export const MOUNTAIN_TERRAIN_ART = {
  textureKey: 'terrain-mountain-massif',
  url: mountainMassif,
} as const;

export const RIVER_WATER_ART = {
  base: {
    textureKey: 'terrain-river-water-painted',
    url: riverWaterPainted,
    tileScale: 0.38,
  },
  displacement: {
    textureKey: 'vfx-river-wave-displacement',
    url: riverWaveDisplacement,
    strengthX: 0.002,
    strengthY: 0.0045,
    pulseStrengthX: 0.0035,
    pulseStrengthY: 0.0065,
    pulseHalfPeriodMs: 11_000,
  },
  scroll: {
    x: 512,
    y: 160,
    durationMs: 90_000,
  },
  highlight: {
    alpha: 0.035,
    tint: 0x78cde0,
    x: -512,
    y: 96,
    durationMs: 120_000,
  },
} as const;
