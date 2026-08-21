import Phaser from 'phaser';
import './style.css';
import { GameScene } from './game/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 870,
  height: 600,
  backgroundColor: '#10131a',
  scene: [GameScene],
  render: {
    antialias: false,
    pixelArt: true,
  },
});
