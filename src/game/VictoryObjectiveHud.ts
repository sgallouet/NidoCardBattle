import type { GameState } from '../data/types';
import './VictoryObjectiveHud.css';

interface VictoryObjectiveHudOptions {
  getState: () => GameState;
}

interface CountdownSnapshot {
  player: 1 | 2;
  checkpoints: number;
}

export class VictoryObjectiveHud {
  private root?: HTMLElement;
  private previousCountdown: CountdownSnapshot | null = null;
  private burstTimer: number | null = null;

  constructor(private readonly options: VictoryObjectiveHudOptions) {}

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app || this.root) return;

    const root = document.createElement('aside');
    root.className = 'victory-objective-hud';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <span class="victory-objective-kicker"></span>
      <strong class="victory-objective-title"></strong>
      <span class="victory-objective-detail"></span>
      <span class="victory-objective-pips" aria-hidden="true"></span>`;
    app.append(root);
    this.root = root;
    this.sync(this.options.getState());
  }

  sync(state: GameState): void {
    if (!this.root) return;

    const countdown = state.countdown
      ? { player: state.countdown.player, checkpoints: state.countdown.checkpoints }
      : null;
    this.presentCountdownChange(countdown);
    this.previousCountdown = countdown;

    const kicker = this.root.querySelector<HTMLElement>('.victory-objective-kicker');
    const title = this.root.querySelector<HTMLElement>('.victory-objective-title');
    const detail = this.root.querySelector<HTMLElement>('.victory-objective-detail');
    const pips = this.root.querySelector<HTMLElement>('.victory-objective-pips');
    if (!kicker || !title || !detail || !pips) return;

    this.root.classList.remove('is-survive', 'is-danger', 'is-victory', 'is-defeat');

    if (state.winner === 1) {
      this.root.classList.add('is-victory');
      kicker.textContent = 'Victory';
      title.textContent = 'Objective secured';
      detail.textContent = 'The enemy Commander fell and yours endured.';
      pips.replaceChildren();
      return;
    }

    if (state.winner === 2) {
      this.root.classList.add('is-defeat');
      kicker.textContent = 'Defeat';
      title.textContent = 'Enemy objective secured';
      detail.textContent = 'The battle is over.';
      pips.replaceChildren();
      return;
    }

    if (countdown?.player === 1) {
      const remaining = Math.max(1, 3 - countdown.checkpoints);
      this.root.classList.add('is-survive');
      kicker.textContent = 'Survive';
      title.textContent = `${remaining} turn${remaining === 1 ? '' : 's'} remaining`;
      detail.textContent = 'Enemy Commander defeated — keep your Commander alive.';
      this.renderPips(pips, countdown.checkpoints, 'friendly');
      return;
    }

    if (countdown?.player === 2) {
      const remaining = Math.max(1, 3 - countdown.checkpoints);
      this.root.classList.add('is-danger');
      kicker.textContent = 'Enemy countdown';
      title.textContent = `${remaining} turn${remaining === 1 ? '' : 's'} remaining`;
      detail.textContent = 'The enemy is closing out the battle.';
      this.renderPips(pips, countdown.checkpoints, 'enemy');
      return;
    }

    kicker.textContent = 'Victory objective';
    title.textContent = 'Defeat the enemy Commander';
    detail.textContent = 'Then keep your Commander alive for 3 turns.';
    this.renderPips(pips, 0, 'neutral');
  }

  destroy(): void {
    if (this.burstTimer !== null) window.clearTimeout(this.burstTimer);
    this.burstTimer = null;
    document.querySelector('.victory-countdown-burst')?.remove();
    this.root?.remove();
    this.root = undefined;
  }

  private renderPips(root: HTMLElement, checkpoints: number, tone: 'friendly' | 'enemy' | 'neutral'): void {
    root.replaceChildren(...Array.from({ length: 3 }, (_, index) => {
      const pip = document.createElement('i');
      pip.className = index < checkpoints ? 'is-complete' : '';
      pip.dataset.tone = tone;
      return pip;
    }));
  }

  private presentCountdownChange(next: CountdownSnapshot | null): void {
    if (!next) return;
    const previous = this.previousCountdown;
    const started = !previous || previous.player !== next.player;
    const advanced = previous?.player === next.player && previous.checkpoints !== next.checkpoints;
    if (!started && !advanced) return;

    const remaining = Math.max(1, 3 - next.checkpoints);
    this.presentBurst(next.player === 1 ? 'SURVIVE' : 'DANGER', `${remaining}`,
      next.player === 1 ? 'Keep your Commander alive' : 'Enemy victory countdown');
  }

  private presentBurst(label: string, value: string, detail: string): void {
    document.querySelector('.victory-countdown-burst')?.remove();
    if (this.burstTimer !== null) window.clearTimeout(this.burstTimer);

    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;
    const burst = document.createElement('div');
    burst.className = `victory-countdown-burst ${label === 'DANGER' ? 'is-danger' : ''}`;
    burst.setAttribute('aria-hidden', 'true');
    burst.innerHTML = `
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>`;
    app.append(burst);
    requestAnimationFrame(() => burst.classList.add('is-visible'));

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.burstTimer = window.setTimeout(() => {
      burst.classList.add('is-leaving');
      window.setTimeout(() => burst.remove(), reducedMotion ? 80 : 240);
      this.burstTimer = null;
    }, reducedMotion ? 650 : 1250);
  }
}
