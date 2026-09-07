import Phaser from 'phaser';
import type { Coord } from '../data/types';
import { SEA_HEX_SIZE, SEA_HEX_WIDTH, seaCoords } from './seaTerrain';
import fragment from './waveWater.frag?raw';

/** One board-space surface, with a coast-distance texture built only on creation. */
export class WaveWaterSurface {
  private shader?: Phaser.GameObjects.Shader;
  private readonly textureKey = 'wave-water-coast';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly addObject: (object: Phaser.GameObjects.GameObject) => void,
    private readonly center: (coord: Coord) => Phaser.Math.Vector2,
  ) {}

  render(): void {
    this.destroy();
    if (this.scene.game.renderer.type !== Phaser.WEBGL) throw new Error('Wave water requires WebGL.');
    const points = seaCoords().map(this.center);
    if (!points.length) return;
    const left = Math.floor(Math.min(...points.map(p => p.x)) - SEA_HEX_WIDTH / 2 - 3);
    const top = Math.floor(Math.min(...points.map(p => p.y)) - SEA_HEX_SIZE - 3);
    const width = Math.ceil(Math.max(...points.map(p => p.x)) + SEA_HEX_WIDTH / 2 + 3 - left);
    const height = Math.ceil(Math.max(...points.map(p => p.y)) + SEA_HEX_SIZE + 3 - top);
    const texture = this.scene.textures.createCanvas(this.textureKey, width, height);
    if (!texture) throw new Error('Cannot create wave-water coastline texture.');
    const ctx = texture.context;
    ctx.fillStyle = '#fff';
    // Slight overlap closes rasterization cracks; the distance field sees a union.
    for (const point of points) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 30) * Math.PI / 180;
        const x = point.x - left + Math.cos(angle) * (SEA_HEX_SIZE + 0.35);
        const y = point.y - top + Math.sin(angle) * (SEA_HEX_SIZE + 0.35);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    const pixels = ctx.getImageData(0, 0, width, height);
    const distance = new Float32Array(width * height);
    for (let i = 0; i < distance.length; i++) distance[i] = pixels.data[i * 4 + 3] > 127 ? 96 : 0;
    // Two-pass chamfer transform: O(pixels), including diagonal shore distances.
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - width] + 1,
        distance[i - width - 1] + Math.SQRT2, distance[i - width + 1] + Math.SQRT2);
    }
    for (let y = height - 2; y > 0; y--) for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;
      distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + width] + 1,
        distance[i + width - 1] + Math.SQRT2, distance[i + width + 1] + Math.SQRT2);
    }
    for (let i = 0; i < distance.length; i++) {
      pixels.data[i * 4] = Math.round(distance[i] / 96 * 255);
      pixels.data[i * 4 + 1] = pixels.data[i * 4 + 3];
      pixels.data[i * 4 + 2] = 0;
      pixels.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    texture.refresh();
    const base = new Phaser.Display.BaseShader('wave-water', fragment, undefined, {
      motion: { type: '1f', value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1 },
    });
    // Board-sized masks are non-power-of-two: WebGL 1 requires clamped sampling.
    this.shader = this.scene.add.shader(base, left + width / 2, top + height / 2, width, height, [this.textureKey], {
      repeat: false,
      wrapS: 'clamp_to_edge',
      wrapT: 'clamp_to_edge',
      minFilter: 'linear',
      magFilter: 'linear',
    });
    this.addObject(this.shader);
  }

  destroy(): void {
    this.shader?.destroy();
    this.shader = undefined;
    if (this.scene.textures.exists(this.textureKey)) this.scene.textures.remove(this.textureKey);
  }
}
