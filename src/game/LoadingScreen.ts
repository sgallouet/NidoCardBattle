import { showBetaWelcomeOnce } from './BetaWelcome';

const MIN_VISIBLE_PROGRESS = 0.025;

class LoadingScreen {
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;
  private readonly percentage: HTMLElement;
  private displayed = 0;
  private target = 0;
  private animationFrame: number | null = null;
  private completing = false;
  private failed = false;
  private readonly battlefieldReady: Promise<void>;
  private resolveBattlefieldReady!: () => void;

  constructor(private readonly element: HTMLElement) {
    this.battlefieldReady = new Promise((resolve) => {
      this.resolveBattlefieldReady = resolve;
    });
    const progress = element.querySelector<HTMLElement>('[role="progressbar"]');
    const status = element.querySelector<HTMLElement>('[data-loading-status]');
    const percentage = element.querySelector<HTMLElement>('[data-loading-percent]');
    if (!progress || !status || !percentage) throw new Error('Loading screen markup is incomplete.');
    this.progress = progress;
    this.status = status;
    this.percentage = percentage;
    this.render();
  }

  whenBattlefieldReady(): Promise<void> {
    return this.battlefieldReady;
  }

  setProgress(value: number, status: string): void {
    if (this.completing || this.failed) return;
    this.target = Math.max(this.target, Math.min(0.985, Math.max(0, value)));
    this.status.textContent = status;
    this.element.dataset.loadingStage = status;
    this.schedule();
  }

  complete(): void {
    if (this.completing || this.failed) return;
    this.completing = true;
    this.target = 1;
    this.status.textContent = 'Entering the battlefield';
    this.element.dataset.loadingStage = 'complete';
    this.schedule();
  }

  fail(): void {
    if (this.failed || this.completing) return;
    this.failed = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.element.classList.remove('is-progressing');
    this.element.classList.add('is-failed');
    this.status.textContent = 'The battle could not begin. Reload to try again.';
  }

  private schedule(): void {
    if (this.animationFrame !== null) return;
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.animationFrame = null;
    const distance = this.target - this.displayed;
    if (distance > 0.0005) {
      this.displayed = Math.min(this.target, this.displayed + Math.max(0.004, distance * 0.105));
      this.render();
      this.schedule();
      return;
    }

    this.displayed = this.target;
    this.render();
    if (this.completing && this.displayed >= 1) this.dismiss();
  };

  private render(): void {
    const percentage = Math.round(this.displayed * 100);
    this.element.style.setProperty('--loading-progress', `${(this.displayed * 100).toFixed(2)}%`);
    this.element.classList.toggle(
      'is-progressing',
      this.displayed >= MIN_VISIBLE_PROGRESS && this.displayed < 0.998,
    );
    this.progress.setAttribute('aria-valuenow', `${percentage}`);
    this.percentage.textContent = `${percentage}%`;
  }

  private dismiss(): void {
    this.element.classList.remove('is-progressing');
    this.element.classList.add('is-complete');
    window.setTimeout(() => {
      this.element.classList.add('is-leaving');
      window.setTimeout(() => {
        this.element.remove();
        void showBetaWelcomeOnce().then(() => this.resolveBattlefieldReady());
      }, 520);
    }, 140);
  }
}

const loadingElement = document.querySelector<HTMLElement>('#loading-screen');
if (!loadingElement) throw new Error('Loading screen root is missing.');

export const loadingScreen = new LoadingScreen(loadingElement);
