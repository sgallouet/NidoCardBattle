import Phaser from 'phaser';
import type { WavedashSDK } from '@wvdsh/sdk-js';
import './style.css';
import './cardHitAreaFix.css';
import { MAP_RENDER_MODE } from './data/mapRenderMode';
import { loadingScreen } from './game/LoadingScreen';
import { ProductionGameScene } from './game/ProductionGameScene';

type TileBorderMode = 'full' | 'half' | 'off';

type WavedashWindow = Window & { Wavedash?: WavedashSDK };

type GraphicsLineStyle = (
  this: Phaser.GameObjects.Graphics,
  lineWidth?: number,
  color?: number,
  alpha?: number,
) => Phaser.GameObjects.Graphics;

const app = document.querySelector<HTMLElement>('#app');
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button');
const tileBorderButton = document.querySelector<HTMLButtonElement>('#tile-border-button');
const TILE_BORDER_STORAGE_KEY = 'nido.tileBorderMode';
const LEGACY_TILE_BORDER_STORAGE_KEY = 'nido.tileBordersVisible';

window.addEventListener('error', () => loadingScreen.fail(), { once: true });
window.addEventListener('unhandledrejection', () => loadingScreen.fail(), { once: true });

let tileBorderMode: TileBorderMode = 'full';
try {
  const stored = window.localStorage.getItem(TILE_BORDER_STORAGE_KEY);
  if (stored === 'full' || stored === 'half' || stored === 'off') {
    tileBorderMode = stored;
  } else if (window.localStorage.getItem(LEGACY_TILE_BORDER_STORAGE_KEY) === 'false') {
    tileBorderMode = 'off';
  }
} catch {
  tileBorderMode = 'full';
}

const nextTileBorderMode = (mode: TileBorderMode): TileBorderMode => {
  if (mode === 'full') return 'half';
  if (mode === 'half') return 'off';
  return 'full';
};

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
  const adjustedWidth = isIdleTileBorder
    ? tileBorderMode === 'full' ? 2 : tileBorderMode === 'half' ? 1 : 0
    : lineWidth;
  return originalLineStyle.call(this, adjustedWidth, color, alpha);
};

const updateFullscreenButton = (): void => {
  if (!fullscreenButton) return;
  const isFullscreen = document.fullscreenElement === app;
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('aria-pressed', `${isFullscreen}`);
  fullscreenButton.title = label;
};

const updateTileBorderButton = (): void => {
  if (!tileBorderButton) return;
  const currentLabel = tileBorderMode === 'full' ? 'Full' : tileBorderMode === 'half' ? 'Half' : 'Off';
  const nextMode = nextTileBorderMode(tileBorderMode);
  tileBorderButton.textContent = `Borders: ${currentLabel}`;
  tileBorderButton.setAttribute('aria-pressed', `${tileBorderMode !== 'off'}`);
  tileBorderButton.setAttribute('aria-label', `Cycle hex tile borders to ${nextMode}`);
  tileBorderButton.title = `Cycle hex tile borders to ${nextMode}`;
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

updateTileBorderButton();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#02091a',
  scene: [ProductionGameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  callbacks: {
    postBoot: () => (window as WavedashWindow).Wavedash?.init(),
  },
});

tileBorderButton?.addEventListener('click', () => {
  tileBorderMode = nextTileBorderMode(tileBorderMode);
  try {
    window.localStorage.setItem(TILE_BORDER_STORAGE_KEY, tileBorderMode);
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  updateTileBorderButton();

  if (!game.scene.isActive('game')) return;
  const scene = game.scene.getScene('game') as unknown as { renderAll?: () => void };
  scene.renderAll?.();
});
