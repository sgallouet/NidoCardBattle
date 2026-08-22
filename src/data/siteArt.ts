import fort from '../../assets/game/sites/fort.webp?url';
import keep from '../../assets/game/sites/keep.webp?url';
import manaWell from '../../assets/game/sites/mana-well.webp?url';
import type { SiteType } from './types';

export interface SiteArtDefinition {
  textureKey: string;
  url: string;
  displayWidth: number;
  displayHeight: number;
  bottomOffset: number;
  labelOffset: number;
}

export const SITE_ART: Record<SiteType, SiteArtDefinition> = {
  keep: {
    textureKey: 'site-keep',
    url: keep,
    displayWidth: 72,
    displayHeight: 76,
    bottomOffset: 29,
    labelOffset: 39,
  },
  fort: {
    textureKey: 'site-fort',
    url: fort,
    displayWidth: 76,
    displayHeight: 64,
    bottomOffset: 28,
    labelOffset: 39,
  },
  well: {
    textureKey: 'site-mana-well',
    url: manaWell,
    displayWidth: 48,
    displayHeight: 49,
    bottomOffset: 26,
    labelOffset: 38,
  },
};
