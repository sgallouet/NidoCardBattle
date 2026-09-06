import Phaser from 'phaser';
import type { Coord } from '../data/types';
import { SEA_TERRAIN_ART } from '../data/terrainArt';
import {
  SEA_HEX_SIZE,
  SEA_HEX_WIDTH,
  seaBaseVariant,
  seaCoastMarks,
  seaCoords,
  seaWaveSpec,
} from './seaTerrain';

export class SeaTerrainSurface {
  private sprites: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly addObject: (object: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) => void,
    private readonly center: (coord: Coord) => Phaser.Math.Vector2,
  ) {}

  static preload(scene: Phaser.Scene): void {
    for (const base of SEA_TERRAIN_ART.bases) scene.load.image(base.textureKey, base.url);
    scene.load.image(SEA_TERRAIN_ART.edge.textureKey, SEA_TERRAIN_ART.edge.url);
    scene.load.image(SEA_TERRAIN_ART.edgeCap.textureKey, SEA_TERRAIN_ART.edgeCap.url);
    for (const clip of Object.values(SEA_TERRAIN_ART.animations)) {
      scene.load.spritesheet(clip.textureKey, clip.url, {
        frameWidth: clip.frameWidth,
        frameHeight: clip.frameHeight,
      });
    }
  }

  static createAnimations(scene: Phaser.Scene): void {
    for (const clip of Object.values(SEA_TERRAIN_ART.animations)) {
      if (scene.anims.exists(clip.animationKey)) continue;
      scene.anims.create({
        key: clip.animationKey,
        frames: scene.anims.generateFrameNumbers(clip.textureKey, {
          start: 0,
          end: clip.frameCount - 1,
        }),
        frameRate: clip.frameRate,
        repeat: -1,
      });
    }
  }

  render(): void {
    this.destroy();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const coord of seaCoords()) {
      const center = this.center(coord);
      const base = this.scene.add.image(
        center.x,
        center.y,
        SEA_TERRAIN_ART.bases[seaBaseVariant(coord)].textureKey,
      ).setDisplaySize(SEA_HEX_WIDTH, SEA_HEX_SIZE * 2);
      this.track(base);

      for (const mark of seaCoastMarks(coord)) {
        const art = mark.kind === 'cap' ? SEA_TERRAIN_ART.edgeCap : SEA_TERRAIN_ART.edge;
        const edge = this.scene.add.image(center.x + mark.offsetX, center.y + mark.offsetY, art.textureKey)
          .setDisplaySize(art.displayWidth, art.displayHeight)
          .setAlpha(0.58)
          .setAngle(mark.rotationDeg);
        this.track(edge);
      }

      const wave = seaWaveSpec(coord);
      if (!wave) continue;
      const clip = SEA_TERRAIN_ART.animations[wave.family];
      const sprite = this.scene.add.sprite(center.x + wave.offsetX, center.y + wave.offsetY, clip.textureKey)
        .setDisplaySize(clip.displayWidth * wave.scale, clip.displayHeight * wave.scale)
        .setAlpha(wave.alpha)
        .setFlipX(wave.flipX);
      if (reducedMotion) {
        sprite.setFrame(wave.startFrame);
      } else {
        sprite.anims.play({
          key: clip.animationKey,
          startFrame: wave.startFrame,
          delay: wave.delayMs,
        });
      }
      this.track(sprite);
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) {
      if ('anims' in sprite) this.scene.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.sprites = [];
  }

  private track(object: Phaser.GameObjects.GameObject): void {
    this.sprites.push(object);
    this.addObject(object);
  }
}
