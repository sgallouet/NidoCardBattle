import fortHuman from '../../assets/game/sites/fort-human.webp?url';
import fortNeutral from '../../assets/game/sites/fort-neutral.webp?url';
import fortUndead from '../../assets/game/sites/fort-undead.webp?url';
import fortHumanShadow from '../../assets/game/sites/shadows/fort-human.webp?url';
import fortNeutralShadow from '../../assets/game/sites/shadows/fort-neutral.webp?url';
import fortUndeadShadow from '../../assets/game/sites/shadows/fort-undead.webp?url';
import garrisonHuman from '../../assets/game/sites/garrison-human.webp?url';
import garrisonNeutral from '../../assets/game/sites/garrison-neutral.webp?url';
import garrisonUndead from '../../assets/game/sites/garrison-undead.webp?url';
import garrisonHumanShadow from '../../assets/game/sites/shadows/garrison-human.webp?url';
import garrisonNeutralShadow from '../../assets/game/sites/shadows/garrison-neutral.webp?url';
import garrisonUndeadShadow from '../../assets/game/sites/shadows/garrison-undead.webp?url';
import keep from '../../assets/game/sites/keep.webp?url';
import keepUndead from '../../assets/game/sites/keep-undead.webp?url';
import keepShadow from '../../assets/game/sites/shadows/keep.webp?url';
import keepUndeadShadow from '../../assets/game/sites/shadows/keep-undead.webp?url';
import wellHuman from '../../assets/game/sites/well-human-v3.webp?url';
import wellNeutral from '../../assets/game/sites/well-neutral-v3.webp?url';
import wellUndead from '../../assets/game/sites/well-undead-v3.webp?url';
import wellHumanShadow from '../../assets/game/sites/shadows/well-human.webp?url';
import wellNeutralShadow from '../../assets/game/sites/shadows/well-neutral.webp?url';
import wellUndeadShadow from '../../assets/game/sites/shadows/well-undead.webp?url';
import { projectedShadowArt, type ProjectedShadowArtDefinition } from './artShadow';
import type { PlayerId, SiteType } from './types';

export interface SiteArtDefinition {
  textureKey: string;
  url: string;
  displayWidth: number;
  displayHeight: number;
  bottomOffset: number;
  labelOffset: number;
  shadow?: ProjectedShadowArtDefinition;
}

type SiteOwnerVariant = 'neutral' | 'human' | 'undead';

const KEEP_STANDARD_ART: SiteArtDefinition = {
  textureKey: 'site-keep',
  url: keep,
  displayWidth: 72,
  displayHeight: 76,
  bottomOffset: 29,
  labelOffset: 39,
  shadow: projectedShadowArt('site-keep-shadow', keepShadow, 244, 256, 76),
};

const KEEP_ART: Record<SiteOwnerVariant, SiteArtDefinition> = {
  neutral: KEEP_STANDARD_ART,
  human: KEEP_STANDARD_ART,
  undead: {
    textureKey: 'site-keep-undead',
    url: keepUndead,
    displayWidth: 76,
    displayHeight: 76,
    bottomOffset: 29,
    labelOffset: 39,
    shadow: projectedShadowArt('site-keep-undead-shadow', keepUndeadShadow, 256, 256, 76),
  },
};

const FORT_ART: Record<SiteOwnerVariant, SiteArtDefinition> = {
  neutral: {
    textureKey: 'site-fort-neutral', url: fortNeutral, displayWidth: 94, displayHeight: 94,
    bottomOffset: 36, labelOffset: 42,
    shadow: projectedShadowArt('site-fort-neutral-shadow', fortNeutralShadow, 256, 256, 94),
  },
  human: {
    textureKey: 'site-fort-human', url: fortHuman, displayWidth: 94, displayHeight: 94,
    bottomOffset: 36, labelOffset: 42,
    shadow: projectedShadowArt('site-fort-human-shadow', fortHumanShadow, 256, 256, 94),
  },
  undead: {
    textureKey: 'site-fort-undead', url: fortUndead, displayWidth: 94, displayHeight: 94,
    bottomOffset: 36, labelOffset: 42,
    shadow: projectedShadowArt('site-fort-undead-shadow', fortUndeadShadow, 256, 256, 94),
  },
};

const GARRISON_ART: Record<SiteOwnerVariant, SiteArtDefinition> = {
  neutral: {
    textureKey: 'site-garrison-neutral', url: garrisonNeutral, displayWidth: 84, displayHeight: 84,
    bottomOffset: 30, labelOffset: 41,
    shadow: projectedShadowArt('site-garrison-neutral-shadow', garrisonNeutralShadow, 256, 256, 84),
  },
  human: {
    textureKey: 'site-garrison-human', url: garrisonHuman, displayWidth: 84, displayHeight: 84,
    bottomOffset: 30, labelOffset: 41,
    shadow: projectedShadowArt('site-garrison-human-shadow', garrisonHumanShadow, 256, 256, 84),
  },
  undead: {
    textureKey: 'site-garrison-undead', url: garrisonUndead, displayWidth: 84, displayHeight: 84,
    bottomOffset: 30, labelOffset: 41,
    shadow: projectedShadowArt('site-garrison-undead-shadow', garrisonUndeadShadow, 256, 256, 84),
  },
};

const WELL_ART: Record<SiteOwnerVariant, SiteArtDefinition> = {
  neutral: {
    textureKey: 'site-well-neutral', url: wellNeutral, displayWidth: 48, displayHeight: 48,
    bottomOffset: 26, labelOffset: 38,
    shadow: projectedShadowArt('site-well-neutral-shadow', wellNeutralShadow, 256, 256, 48, 0.44),
  },
  human: {
    textureKey: 'site-well-human', url: wellHuman, displayWidth: 48, displayHeight: 48,
    bottomOffset: 26, labelOffset: 38,
    shadow: projectedShadowArt('site-well-human-shadow', wellHumanShadow, 256, 256, 48, 0.44),
  },
  undead: {
    textureKey: 'site-well-undead', url: wellUndead, displayWidth: 48, displayHeight: 48,
    bottomOffset: 26, labelOffset: 38,
    shadow: projectedShadowArt('site-well-undead-shadow', wellUndeadShadow, 256, 256, 48, 0.44),
  },
};

export const SITE_ART_TEXTURES: SiteArtDefinition[] = [
  KEEP_STANDARD_ART,
  KEEP_ART.undead,
  ...Object.values(FORT_ART),
  ...Object.values(GARRISON_ART),
  ...Object.values(WELL_ART),
];

export const SITE_SHADOW_TEXTURES: ProjectedShadowArtDefinition[] = SITE_ART_TEXTURES.flatMap(
  (art) => art.shadow ? [art.shadow] : [],
);

function ownerVariant(owner: PlayerId | null): SiteOwnerVariant {
  if (owner === 1) return 'human';
  if (owner === 2) return 'undead';
  return 'neutral';
}

export function siteArtFor(type: SiteType, owner: PlayerId | null): SiteArtDefinition {
  const variant = ownerVariant(owner);
  if (type === 'keep') return KEEP_ART[variant];
  return type === 'fort' ? FORT_ART[variant] : WELL_ART[variant];
}

export function garrisonArtFor(owner: PlayerId | null): SiteArtDefinition {
  return GARRISON_ART[ownerVariant(owner)];
}
