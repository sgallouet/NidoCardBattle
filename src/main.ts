import Phaser from 'phaser';
import './style.css';
import { AiGameScene } from './game/AiGameScene';

const app = document.querySelector<HTMLElement>('#app');
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');

const updateFullscreenButton = (): void => {
  if (!fullscreenButton) return;
  const isFullscreen = document.fullscreenElement === app;
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('aria-pressed', `${isFullscreen}`);
  fullscreenButton.title = label;
};

fullscreenButton?.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await app?.requestFullscreen();
  }
});
document.addEventListener('fullscreenchange', updateFullscreenButton);
updateFullscreenButton();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#17251d',
  scene: [AiGameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
});
