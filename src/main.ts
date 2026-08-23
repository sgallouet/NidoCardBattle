import Phaser from 'phaser';
import './style.css';
import { MAP_RENDER_MODE } from './data/mapRenderMode';
import { AnimatedPrototypeGameScene } from './game/AnimatedPrototypeGameScene';

const app = document.querySelector<HTMLElement>('#app');
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');
const mapRenderButton = document.querySelector<HTMLButtonElement>('#map-render-button');
const tileBorderButton = document.querySelector<HTMLButtonElement>('#tile-border-button');
const TILE_BORDER_STORAGE_KEY = 'nido.tileBordersVisible';

let tileBordersVisible = true;
try {
  tileBordersVisible = window.localStorage.getItem(TILE_BORDER_STORAGE_KEY) !== 'false';
} catch {
  tileBordersVisible = true;
}

type GraphicsLineStyle = (
  this: Phaser.GameObjects.Graphics,
  lineWidth?: number,
  color?: number,
  alpha?: number,
) => Phaser.GameObjects.Graphics;

const graphicsPrototype = Phaser.GameObjects.Graphics.prototype as unknown as {
  lineStyle: GraphicsLineStyle;
};
const originalLineStyle = graphicsPrototype.lineStyle;
graphicsPrototype.lineStyle = function (
  lineWidth = 1,
  color = 0xffffff,
  alpha = 1,
): Phaser.GameObjects.Graphics {
  const isIdleTileBorder = lineWidth === 2 && color === 0x263828 && alpha === 0.95;
  return originalLineStyle.call(
    this,
    lineWidth,
    color,
    !tileBordersVisible && isIdleTileBorder ? 0 : alpha,
  );
};

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

const updateTileBorderButton = (): void => {
  if (!tileBorderButton) return;
  tileBorderButton.textContent = `Borders: ${tileBordersVisible ? 'On' : 'Off'}`;
  tileBorderButton.setAttribute('aria-pressed', `${tileBordersVisible}`);
  tileBorderButton.setAttribute(
    'aria-label',
    tileBordersVisible ? 'Hide hex tile borders' : 'Show hex tile borders',
  );
  tileBorderButton.title = tileBordersVisible ? 'Hide hex tile borders' : 'Show hex tile borders';
  tileBorderButton.disabled = MAP_RENDER_MODE === 'authored';
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
updateTileBorderButton();

const game = new Phaser.Game({
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

tileBorderButton?.addEventListener('click', () => {
  tileBordersVisible = !tileBordersVisible;
  try {
    window.localStorage.setItem(TILE_BORDER_STORAGE_KEY, `${tileBordersVisible}`);
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  updateTileBorderButton();

  if (!game.scene.isActive('game')) return;
  const scene = game.scene.getScene('game') as unknown as { renderAll?: () => void };
  scene.renderAll?.();
});
