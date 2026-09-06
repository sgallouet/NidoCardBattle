import bridgeOverlay from '../../assets/game/terrain/bridge-overlay.webp?url';
import forestCanopyOverlay from '../../assets/game/terrain/forest-canopy-overlay.png?url';
import forestGround from '../../assets/game/terrain/forest-ground-hex.png?url';
import hillOverlay from '../../assets/game/terrain/hill-overlay.webp?url';
import mountainMassif from '../../assets/game/terrain/mountain-massif-hex.png?url';
import plainMeadow from '../../assets/game/terrain/plain-meadow-hex.png?url';
import seaBase01 from '../../assets/game/terrain/sea-base-01.png?url';
import seaBase02 from '../../assets/game/terrain/sea-base-02.png?url';
import seaBase03 from '../../assets/game/terrain/sea-base-03.png?url';
import seaBase04 from '../../assets/game/terrain/sea-base-04.png?url';
import seaEdge from '../../assets/game/terrain/sea-edge.png?url';
import seaEdgeCap from '../../assets/game/terrain/sea-edge-cap.png?url';
import seaWaveCalm from '../../assets/game/vfx/environment/sea-wave-calm.png?url';
import seaWaveDouble from '../../assets/game/vfx/environment/sea-wave-double.png?url';
import seaWaveGlint from '../../assets/game/vfx/environment/sea-wave-glint.png?url';

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
  displayWidth: 87,
  displayHeight: 87,
} as const;

export const MOUNTAIN_TERRAIN_ART = {
  textureKey: 'terrain-mountain-massif',
  url: mountainMassif,
} as const;

export const SEA_TERRAIN_ART = {
  bases: [
    { textureKey: 'terrain-sea-base-01', url: seaBase01 },
    { textureKey: 'terrain-sea-base-02', url: seaBase02 },
    { textureKey: 'terrain-sea-base-03', url: seaBase03 },
    { textureKey: 'terrain-sea-base-04', url: seaBase04 },
  ],
  edge: {
    textureKey: 'terrain-sea-edge',
    url: seaEdge,
    displayWidth: 86,
    displayHeight: 26,
  },
  edgeCap: {
    textureKey: 'terrain-sea-edge-cap',
    url: seaEdgeCap,
    displayWidth: 58,
    displayHeight: 24,
  },
  animations: {
    calm: {
      textureKey: 'vfx-sea-wave-calm',
      animationKey: 'sea-wave-calm',
      url: seaWaveCalm,
      frameWidth: 401,
      frameHeight: 130,
      frameCount: 8,
      frameRate: 6,
      displayWidth: 52,
      displayHeight: 17,
    },
    double: {
      textureKey: 'vfx-sea-wave-double',
      animationKey: 'sea-wave-double',
      url: seaWaveDouble,
      frameWidth: 360,
      frameHeight: 121,
      frameCount: 8,
      frameRate: 6,
      displayWidth: 48,
      displayHeight: 16,
    },
    glint: {
      textureKey: 'vfx-sea-wave-glint',
      animationKey: 'sea-wave-glint',
      url: seaWaveGlint,
      frameWidth: 390,
      frameHeight: 112,
      frameCount: 8,
      frameRate: 6,
      displayWidth: 46,
      displayHeight: 13,
    },
  },
} as const;
