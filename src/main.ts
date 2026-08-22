import Phaser from 'phaser';
import './style.css';
import { MAP_RENDER_MODE } from './data/mapRenderMode';
import { AnimatedPrototypeGameScene } from './game/AnimatedPrototypeGameScene';

const app = document.querySelector<HTMLElement>('#app');
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');
const mapRenderButton = document.querySelector<HTMLButtonElement>('#map-render-button');

const updateFullscreenButton = (): void => {
  if (!fullscreenButton) return;
  const isFullscreen = document.fullscreenElement === app;
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('aria-pressed', `${isFullscreen}`);
  fullscreenButton.title = label;
};

const updateMapRenderButton = (): void => {
  if (!mapRenderButton) return;
  const currentLabel = MAP_RENDER_MODE === 'authored' ? 'Authored' : 'Tiled';
  const nextLabel = MAP_RENDER_MODE === 'authored' ? 'Tiled' : 'Authored';
  mapRenderButton.textContent = `Map: ${currentLabel}`;
  mapRenderButton.setAttribute('aria-label', `Switch map rendering to ${nextLabel}`);
  mapRenderButton.title = `Switch to ${nextLabel} map rendering`;
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

mapRenderButton?.addEventListener('click', () => {
  const nextMode = MAP_RENDER_MODE === 'authored' ? 'tiled' : 'authored';
  const url = new URL(window.location.href);
  url.searchParams.set('map', nextMode);
  window.location.assign(url);
});
updateMapRenderButton();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#17251d',
  scene: [AnimatedPrototypeGameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
});
