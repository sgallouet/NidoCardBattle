import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import { SEA_HEX_SIZE, SEA_HEX_WIDTH } from './seaTerrain';
import fragment from './cloudShadows.frag?raw';

export function createCloudShadows(scene: Phaser.Scene, origin: Phaser.Math.Vector2): Phaser.GameObjects.Shader {
  if (scene.game.renderer.type !== Phaser.WEBGL) throw new Error('Cloud shadows require WebGL.');
  const width = (MAP_WIDTH + (MAP_HEIGHT > 1 ? 0.5 : 0)) * SEA_HEX_WIDTH;
  const height = (MAP_HEIGHT - 1) * SEA_HEX_SIZE * 1.5 + SEA_HEX_SIZE * 2;
  const base = new Phaser.Display.BaseShader('cloud-shadows', fragment, undefined, {
    environmentTime: { type: '1f', value: 0 },
    mapSize: { type: '2f', value: { x: MAP_WIDTH, y: MAP_HEIGHT } },
    motion: { type: '1f', value: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1 },
  });
  return scene.add.shader(base, origin.x - SEA_HEX_WIDTH/2 + width/2,
    origin.y - SEA_HEX_SIZE + height/2, width, height);
}
