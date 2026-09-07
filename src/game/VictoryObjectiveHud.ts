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
  private tensionFrame?: HTMLElement;
  private previousCountdown: CountdownSnapshot | null = null;
  private burstTimer: number | null = null;
  private framePulseTimer: number | null = null;
  private previousStateKey = '';

  constructor(private readonly options: VictoryObjectiveHudOptions) {}

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app || this.root) return;

    const root = document.createElement('aside');
    root.className = 'victory-objective-hud';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <span class="victory-objective-crest" aria-hidden="true"><i>◆</i></span>
      <span class="victory-objective-copy">
        <span class="victory-objective-kicker"></span>
        <strong class="victory-objective-title"></strong>
        <span class="victory-objective-detail"></span>
      </span>
      <span class="victory-objective-pips" aria-hidden="true"></span>`;

    const tensionFrame = document.createElement('div');
    tensionFrame.className = 'victory-tension-frame';
    tensionFrame.setAttribute('aria-hidden', 'true');

    app.append(tensionFrame, root);
    this.root = root;
    this.tensionFrame = tensionFrame;
    this.sync(this.options.getState());
  }

  sync(state: GameState): void {
    if (!this.root) return;

    const previous = this.previousCountdown;
    const countdown = state.countdown
      ? { player: state.countdown.player, checkpoints: state.countdown.checkpoints }
      : null;
    const started = Boolean(countdown && (!previous || previous.player !== countdown.player));
    const advanced = Boolean(
      countdown
      && previous?.player === countdown.player
      && previous.checkpoints !== countdown.checkpoints,
    );
    const newlyCompleted = countdown && (started || advanced) && countdown.checkpoints > 0
      ? countdown.checkpoints - 1
      : -1;

    this.presentCountdownChange(countdown, previous);
    this.updateTensionFrame(state, countdown, started || advanced);

    const crest = this.root.querySelector<HTMLElement>('.victory-objective-crest i');
    const kicker = this.root.querySelector<HTMLElement>('.victory-objective-kicker');
    const title = this.root.querySelector<HTMLElement>('.victory-objective-title');
    const detail = this.root.querySelector<HTMLElement>('.victory-objective-detail');
    const pips = this.root.querySelector<HTMLElement>('.victory-objective-pips');
    if (!crest || !kicker || !title || !detail || !pips) return;

    this.root.classList.remove('is-neutral', 'is-survive', 'is-danger', 'is-victory', 'is-defeat', 'is-state-change');

    if (state.winner === 1) {
      this.root.classList.add('is-victory');
      crest.textContent = '✓';
      kicker.textContent = 'Victory';
      title.textContent = 'Objective secured';
      detail.textContent = 'Commander endured';
      pips.replaceChildren();
      this.presentStateChange('victory');
      this.previousCountdown = countdown;
      return;
    }

    if (state.winner === 2) {
      this.root.classList.add('is-defeat');
      crest.textContent = '×';
      kicker.textContent = 'Defeat';
      title.textContent = 'Enemy objective secured';
      detail.textContent = 'Battle lost';
      pips.replaceChildren();
      this.presentStateChange('defeat');
      this.previousCountdown = countdown;
      return;
    }

    if (countdown?.player === 1) {
      const remaining = Math.max(1, 3 - countdown.checkpoints);
      this.root.classList.add('is-survive');
      crest.textContent = '◆';
      kicker.textContent = 'Endgame';
      title.textContent = `Hold Commander · ${remaining} turn${remaining === 1 ? '' : 's'}`;
      detail.textContent = 'Enemy Commander defeated';
      this.renderPips(pips, countdown.checkpoints, 'friendly', newlyCompleted);
      this.presentStateChange(`survive:${countdown.checkpoints}`);
      this.previousCountdown = countdown;
      return;
    }

    if (countdown?.player === 2) {
      const remaining = Math.max(1, 3 - countdown.checkpoints);
      this.root.classList.add('is-danger');
      crest.textContent = '!';
      kicker.textContent = 'Danger';
      title.textContent = `Break countdown · ${remaining} turn${remaining === 1 ? '' : 's'}`;
      detail.textContent = 'Defeat the enemy Commander now';
      this.renderPips(pips, countdown.checkpoints, 'enemy', newlyCompleted);
      this.presentStateChange(`danger:${countdown.checkpoints}`);
      this.previousCountdown = countdown;
      return;
    }

    this.root.classList.add('is-neutral');
    crest.textContent = '◆';
    kicker.textContent = 'Objective';
    title.textContent = 'Defeat enemy Commander';
    detail.textContent = 'Then survive 3 turns';
    this.renderPips(pips, 0, 'neutral', -1);
    this.presentStateChange('neutral');
    this.previousCountdown = countdown;
  }

  destroy(): void {
    if (this.burstTimer !== null) window.clearTimeout(this.burstTimer);
    if (this.framePulseTimer !== null) window.clearTimeout(this.framePulseTimer);
    this.burstTimer = null;
    this.framePulseTimer = null;
    document.querySelector('.victory-countdown-burst')?.remove();
    this.tensionFrame?.remove();
    this.tensionFrame = undefined;
    this.root?.remove();
    this.root = undefined;
  }

  private renderPips(
    root: HTMLElement,
    checkpoints: number,
    tone: 'friendly' | 'enemy' | 'neutral',
    newlyCompleted: number,
  ): void {
    root.replaceChildren(...Array.from({ length: 3 }, (_, index) => {
      const pip = document.createElement('i');
      if (index < checkpoints) pip.classList.add('is-complete');
      if (index === newlyCompleted) pip.classList.add('is-new');
      pip.dataset.tone = tone;
      pip.innerHTML = '<b></b>';
      return pip;
    }));
  }

  private presentStateChange(key: string): void {
    if (!this.root || this.previousStateKey === key) return;
    this.previousStateKey = key;
    this.root.classList.remove('is-state-change');
    void this.root.offsetWidth;
    this.root.classList.add('is-state-change');
  }

  private updateTensionFrame(
    state: GameState,
    countdown: CountdownSnapshot | null,
    changed: boolean,
  ): void {
    const frame = this.tensionFrame;
    if (!frame) return;
    frame.classList.remove('is-survive', 'is-danger');
    if (!state.winner && countdown?.player === 1) frame.classList.add('is-survive');
    if (!state.winner && countdown?.player === 2) frame.classList.add('is-danger');
    if (!changed) return;

    frame.classList.remove('is-pulse');
    void frame.offsetWidth;
    frame.classList.add('is-pulse');
    if (this.framePulseTimer !== null) window.clearTimeout(this.framePulseTimer);
    this.framePulseTimer = window.setTimeout(() => {
      frame.classList.remove('is-pulse');
      this.framePulseTimer = null;
    }, 900);
  }

  private presentCountdownChange(
    next: CountdownSnapshot | null,
    previous: CountdownSnapshot | null,
  ): void {
    if (!next) return;
    const started = !previous || previous.player !== next.player;
    const advanced = previous?.player === next.player && previous.checkpoints !== next.checkpoints;
    if (!started && !advanced) return;

    const remaining = Math.max(1, 3 - next.checkpoints);
    const label = next.player === 1 ? 'SURVIVE' : 'DANGER';
    const detail = next.player === 1
      ? 'Keep your Commander alive'
      : 'Break the enemy countdown';
    this.presentBurst(label, `${remaining}`, detail);
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
      window.setTimeout(() => burst.remove(), reducedMotion ? 80 : 220);
      this.burstTimer = null;
    }, reducedMotion ? 620 : 1080);
  }
}
