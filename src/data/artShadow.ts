export interface ProjectedShadowArtDefinition {
  textureKey: string;
  url: string;
  displayWidth: number;
  displayHeight: number;
  originX: number;
  originY: number;
  alpha: number;
}

const SHADOW_MASK_WIDTH = 384;

export function projectedShadowArt(
  textureKey: string,
  url: string,
  sourceWidth: number,
  sourceHeight: number,
  displayHeight: number,
  alpha = 0.48,
): ProjectedShadowArtDefinition {
  return {
    textureKey,
    url,
    displayWidth: SHADOW_MASK_WIDTH * displayHeight / sourceHeight,
    displayHeight,
    originX: sourceWidth / 2 / SHADOW_MASK_WIDTH,
    originY: 1,
    alpha,
  };
}
