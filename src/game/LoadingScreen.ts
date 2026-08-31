const MIN_VISIBLE_PROGRESS = 0.025;

class LoadingScreen {
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;
  private readonly percentage: HTMLElement;
  private readonly slides: HTMLElement[];
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly actionLabel: HTMLElement;
  private readonly slideStatus: HTMLElement;
  private readonly dots: HTMLElement[];
  private displayed = 0;
  private target = 0;
  private currentSlide = 0;
  private animationFrame: number | null = null;
  private completing = false;
  private readyToStart = false;
  private dismissing = false;
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
    const slides = [...element.querySelectorAll<HTMLElement>('[data-loading-slide]')];
    const previousButton = element.querySelector<HTMLButtonElement>('[data-loading-prev]');
    const nextButton = element.querySelector<HTMLButtonElement>('[data-loading-next]');
    const actionLabel = element.querySelector<HTMLElement>('[data-loading-action]');
    const slideStatus = element.querySelector<HTMLElement>('[data-loading-slide-status]');
    const dots = [...element.querySelectorAll<HTMLElement>('.loading-tutorial-dots span')];
    if (
      !progress || !status || !percentage || slides.length !== 3 || !previousButton
      || !nextButton || !actionLabel || !slideStatus || dots.length !== slides.length
    ) throw new Error('Loading screen markup is incomplete.');
    this.progress = progress;
    this.status = status;
    this.percentage = percentage;
    this.slides = slides;
    this.previousButton = previousButton;
    this.nextButton = nextButton;
    this.actionLabel = actionLabel;
    this.slideStatus = slideStatus;
    this.dots = dots;
    previousButton.addEventListener('click', this.showPreviousSlide);
    nextButton.addEventListener('click', this.advanceTutorial);
    window.addEventListener('keydown', this.handleKeydown);
    document.querySelector<HTMLElement>('#app')?.setAttribute('inert', '');
    this.showSlide(0, false);
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
    this.status.textContent = 'Finishing the battlefield';
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
    this.updateNavigation();
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
    if (this.completing && this.displayed >= 1 && !this.readyToStart) {
      this.readyToStart = true;
      this.element.classList.add('is-ready');
      this.status.textContent = 'Battlefield ready';
      this.updateNavigation();
    }
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
    this.updateNavigation();
  }

  private readonly showPreviousSlide = (): void => {
    this.showSlide(this.currentSlide - 1);
  };

  private readonly advanceTutorial = (): void => {
    if (this.currentSlide < this.slides.length - 1) {
      this.showSlide(this.currentSlide + 1);
      return;
    }
    if (this.readyToStart && !this.failed) this.dismiss();
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft' && this.currentSlide > 0) {
      event.preventDefault();
      this.showSlide(this.currentSlide - 1);
    }
    if (event.key === 'ArrowRight' && this.currentSlide < this.slides.length - 1) {
      event.preventDefault();
      this.showSlide(this.currentSlide + 1);
    }
  };

  private showSlide(index: number, focusAction = true): void {
    this.currentSlide = Math.max(0, Math.min(this.slides.length - 1, index));
    this.slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === this.currentSlide;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', `${!isActive}`);
    });
    this.element.dataset.tutorialSlide = `${this.currentSlide + 1}`;
    const title = this.slides[this.currentSlide].querySelector<HTMLElement>('h1');
    if (title?.id) this.element.setAttribute('aria-labelledby', title.id);
    this.slideStatus.textContent = `Slide ${this.currentSlide + 1} of ${this.slides.length}`;
    this.updateNavigation();
    if (focusAction) this.nextButton.focus();
  }

  private updateNavigation(): void {
    const isFinalSlide = this.currentSlide === this.slides.length - 1;
    this.previousButton.disabled = this.currentSlide === 0;
    this.dots.forEach((dot, index) => dot.classList.toggle('is-active', index === this.currentSlide));
    this.nextButton.disabled = this.failed || (isFinalSlide && !this.readyToStart);
    this.actionLabel.textContent = isFinalSlide
      ? this.readyToStart ? 'Start Game' : `Loading ${Math.round(this.displayed * 100)}%`
      : 'Next';
  }

  private dismiss(): void {
    if (this.dismissing) return;
    this.dismissing = true;
    this.element.classList.remove('is-progressing');
    this.element.classList.add('is-complete');
    this.element.classList.add('is-leaving');
    window.removeEventListener('keydown', this.handleKeydown);
    document.querySelector<HTMLElement>('#app')?.removeAttribute('inert');
    window.setTimeout(() => {
      this.element.remove();
      this.resolveBattlefieldReady();
    }, 520);
  }
}

const loadingElement = document.querySelector<HTMLElement>('#loading-screen');
if (!loadingElement) throw new Error('Loading screen root is missing.');

export const loadingScreen = new LoadingScreen(loadingElement);
