import Phaser from 'phaser';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { MAP_DECORATIONS } from '../data/map';
import type { Coord, GameState, PlayerId } from '../data/types';
import { getValidSummonCoords, MAX_MANA, unitAt } from './engine';
import './ManaPresentation.css';
import './ManaReactiveFeedback.css';

type ManaSourceKind = 'keep' | 'well' | 'ruin';

interface ManaSource {
  coord: Coord;
  kind: ManaSourceKind;
  amount: number;
}

export interface ManaPresentationSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderAll: () => void;
  renderHud: () => void;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface ManaSchedule {
  playerTurn: number;
  keeps: number;
  wells: number;
  ruins: number;
  wellDeliveryNow: boolean;
  wellTurnsRemaining: number;
}

const playerTurnNumber = (state: GameState): number => Math.ceil(state.turnNumber / 2);

export const getManaDeliverySchedule = (state: GameState): ManaSchedule => {
  const player = state.currentPlayer;
  const playerTurn = playerTurnNumber(state);
  const keeps = state.sites.filter((site) => site.type === 'keep' && site.owner === player).length;
  const wells = state.sites.filter((site) => site.type === 'well' && site.owner === player).length;
  const ruins = MAP_DECORATIONS.filter((decoration) =>
    decoration.type === 'ruin' && unitAt(state, decoration.coord)?.owner === player).length;
  const wellDeliveryNow = playerTurn % 3 === 0;
  return {
    playerTurn,
    keeps,
    wells,
    ruins,
    wellDeliveryNow,
    wellTurnsRemaining: wellDeliveryNow ? 3 : 3 - (playerTurn % 3),
  };
};

const incomeSourcesFor = (state: GameState, player: PlayerId): ManaSource[] => {
  const playerTurn = playerTurnNumber(state);
  const sources: ManaSource[] = [];

  if (playerTurn > 1) {
    for (const keep of state.sites.filter((site) => site.type === 'keep' && site.owner === player)) {
      sources.push({ coord: { ...keep.coord }, kind: 'keep', amount: 1 });
    }
  }

  for (const ruin of MAP_DECORATIONS.filter((decoration) => decoration.type === 'ruin')) {
    if (unitAt(state, ruin.coord)?.owner === player) {
      sources.push({ coord: { ...ruin.coord }, kind: 'ruin', amount: 1 });
    }
  }

  if (playerTurn % 3 === 0) {
    for (const well of state.sites.filter((site) => site.type === 'well' && site.owner === player)) {
      sources.push({ coord: { ...well.coord }, kind: 'well', amount: 2 });
    }
  }

  const order: Record<ManaSourceKind, number> = { keep: 0, ruin: 1, well: 2 };
  return sources.sort((left, right) => order[left.kind] - order[right.kind]);
};

export class ManaPresentation {
  private schedule?: HTMLDivElement;
  private flightLayer?: HTMLDivElement;
  private manaCount?: HTMLElement;
  private manaShell?: HTMLElement;
  private originalRenderHud?: () => void;
  private lastTurnNumber = 0;
  private lastPlayer: PlayerId = 1;
  private manaByPlayer: Record<PlayerId, number> = { 1: 0, 2: 0 };
  private displayedMana?: number;
  private animationToken = 0;
  private destroyed = false;
  private audioContext?: AudioContext;
  private wakeTimers: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: ManaPresentationSceneInternals,
  ) {}

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    const manaCount = document.querySelector<HTMLElement>('#mana-count');
    if (!app || !manaCount) return;

    this.manaCount = manaCount;
    manaCount.classList.add('mana-schedule-anchor');

    const manaShell = manaCount.closest<HTMLElement>('.mana-count');
    this.manaShell = manaShell ?? undefined;
    const turnControl = document.querySelector<HTMLElement>('.turn-control');
    const turnIndicator = turnControl?.querySelector<HTMLElement>('#turn-indicator');
    if (manaShell && turnControl) {
      if (turnIndicator) turnIndicator.insertAdjacentElement('afterend', manaShell);
      else turnControl.append(manaShell);
    }

    const schedule = document.createElement('div');
    schedule.className = 'mana-delivery-schedule';
    schedule.setAttribute('aria-live', 'polite');
    if (manaShell) manaShell.insertAdjacentElement('afterend', schedule);
    else app.append(schedule);
    this.schedule = schedule;

    const flightLayer = document.createElement('div');
    flightLayer.className = 'mana-flight-layer';
    flightLayer.setAttribute('aria-hidden', 'true');
    app.append(flightLayer);
    this.flightLayer = flightLayer;

    app.addEventListener('pointerdown', this.handleFirstInteraction, true);

    this.lastTurnNumber = this.game.state.turnNumber;
    this.lastPlayer = this.game.state.currentPlayer;
    this.manaByPlayer = {
      1: this.game.state.players[1].mana,
      2: this.game.state.players[2].mana,
    };

    const originalRenderHud = this.game.renderHud.bind(this.scene);
    const originalRenderAll = this.game.renderAll.bind(this.scene);
    this.originalRenderHud = originalRenderHud;

    this.game.renderHud = () => {
      originalRenderHud();
      this.decorateHud();
    };
    this.game.renderAll = () => {
      originalRenderAll();
      this.sync();
    };

    this.decorateHud();
  }

  destroy(): void {
    this.destroyed = true;
    this.animationToken += 1;
    document.querySelector<HTMLElement>('#app')?.removeEventListener('pointerdown', this.handleFirstInteraction, true);
    for (const timer of this.wakeTimers) window.clearTimeout(timer);
    this.wakeTimers = [];
    this.clearPendingCards();
    this.schedule?.remove();
    this.flightLayer?.remove();
    this.manaCount?.classList.remove('mana-schedule-anchor', 'mana-counter-impact');
    this.manaShell?.classList.remove('mana-reactive-gain', 'mana-reactive-spend');
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    this.schedule = undefined;
    this.flightLayer = undefined;
    this.manaCount = undefined;
    this.manaShell = undefined;
  }

  private readonly handleFirstInteraction = (): void => {
    this.ensureAudioContext();
  };

  private sync(): void {
    if (this.destroyed) return;
    this.renderSchedule();

    const state = this.game.state;
    const player = state.currentPlayer;
    const turnChanged = state.turnNumber !== this.lastTurnNumber || player !== this.lastPlayer;
    const previousMana = this.manaByPlayer[player];
    const finalMana = state.players[player].mana;

    this.lastTurnNumber = state.turnNumber;
    this.lastPlayer = player;
    this.manaByPlayer[player] = finalMana;

    // Player 1 is the local human in this battle mode. Enemy mana changes stay instant
    // so AI presentation never blocks on cosmetic resource feedback.
    if (player !== 1) {
      if (this.displayedMana !== undefined) this.cancelActiveAnimation();
      return;
    }

    if (finalMana > previousMana) {
      const sources = turnChanged ? incomeSourcesFor(state, player) : [];
      void this.animateIncome(previousMana, finalMana, sources);
      return;
    }

    if (finalMana < previousMana) {
      void this.animateSpend(previousMana, finalMana);
    }
  }

  private decorateHud(): void {
    this.renderSchedule();
    if (this.displayedMana !== undefined && this.manaCount) {
      this.manaCount.textContent = `${this.displayedMana}/${MAX_MANA}`;
    }
  }

  private renderSchedule(): void {
    const element = this.schedule;
    if (!element) return;
    const schedule = getManaDeliverySchedule(this.game.state);
    const keepIncome = schedule.keeps;
    const ruinIncome = schedule.ruins;
    const wellIncome = schedule.wells * 2;
    const wellTiming = schedule.wellDeliveryNow ? 'NOW' : `${schedule.wellTurnsRemaining}T`;

    element.innerHTML = `
      <span class="mana-source-chip is-keep" title="Keeps: +1 mana each turn">
        <i aria-hidden="true">K</i><span><small>Keep</small><strong>+${keepIncome}<em>/T</em></strong></span>
      </span>
      ${ruinIncome > 0 ? `
        <span class="mana-source-chip is-ruin" title="Occupied ruins: +1 mana each turn">
          <i aria-hidden="true">R</i><span><small>Ruin</small><strong>+${ruinIncome}<em>/T</em></strong></span>
        </span>` : ''}
      <span class="mana-source-chip is-well ${schedule.wellDeliveryNow && schedule.wells > 0 ? 'is-due' : ''}" title="Mana Wells: +2 mana each every third turn">
        <i aria-hidden="true">W</i><span><small>Well</small><strong>${schedule.wells > 0 ? `+${wellIncome}<em>${wellTiming}</em>` : '—'}</strong></span>
      </span>`;

    element.classList.toggle('is-well-delivery', schedule.wellDeliveryNow && schedule.wells > 0);
    element.setAttribute(
      'aria-label',
      `Mana income. Keeps provide ${keepIncome} mana per turn. Occupied ruins provide ${ruinIncome} mana per turn. ${schedule.wells} Mana Wells provide ${wellIncome} mana every third turn; ${schedule.wells > 0 ? `next well timing ${wellTiming}` : 'no well is controlled'}.`,
    );
  }

  private async animateIncome(previousMana: number, finalMana: number, sources: ManaSource[]): Promise<void> {
    const token = ++this.animationToken;
    this.displayedMana = previousMana;
    this.markPendingCards(previousMana, finalMana);
    this.decorateHud();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || sources.length === 0) {
      const before = this.displayedMana;
      this.displayedMana = finalMana;
      if (this.manaCount) this.manaCount.textContent = `${finalMana}/${MAX_MANA}`;
      this.impactMana(finalMana - previousMana, false);
      this.wakeNewlyAffordableCards(before, finalMana);
      await this.wait(reducedMotion ? 40 : 180);
      this.finishManaAnimation(token);
      return;
    }

    await Promise.all(sources.map((source, index) => this.animateSource(source, finalMana, index * 115, token)));
    this.finishManaAnimation(token);
  }

  private async animateSpend(previousMana: number, finalMana: number): Promise<void> {
    const token = ++this.animationToken;
    this.clearPendingCards();
    this.displayedMana = previousMana;
    this.decorateHud();
    this.presentSpendDelta(previousMana - finalMana);
    this.dimNewlyUnaffordableCards(previousMana, finalMana);
    this.playManaSpend();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.displayedMana = finalMana;
      if (this.manaCount) this.manaCount.textContent = `${finalMana}/${MAX_MANA}`;
      this.finishManaAnimation(token);
      return;
    }

    const steps = Math.max(2, Math.min(7, Math.abs(previousMana - finalMana) * 2));
    for (let step = 1; step <= steps; step += 1) {
      await this.wait(38);
      if (this.destroyed || token !== this.animationToken) return;
      const value = Math.round(previousMana + (finalMana - previousMana) * step / steps);
      this.displayedMana = value;
      if (this.manaCount) this.manaCount.textContent = `${value}/${MAX_MANA}`;
    }
    await this.wait(90);
    this.finishManaAnimation(token);
  }

  private async animateSource(source: ManaSource, finalMana: number, delay: number, token: number): Promise<void> {
    await this.wait(delay);
    if (this.destroyed || token !== this.animationToken) return;

    this.pulseSource(source);
    const flight = this.createFlight(source);
    if (!flight) {
      this.creditSource(source, finalMana);
      return;
    }

    const start = this.sourceOverlayPoint(source.coord);
    const end = this.manaOverlayPoint();
    if (!start || !end) {
      flight.remove();
      this.creditSource(source, finalMana);
      return;
    }

    flight.style.left = `${start.x}px`;
    flight.style.top = `${start.y}px`;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const bend = source.kind === 'well' ? -72 : -48;
    const duration = source.kind === 'well' ? 760 : 640;
    const animation = flight.animate([
      { transform: 'translate(0, 0) scale(.55)', opacity: 0 },
      { transform: `translate(${dx * 0.18}px, ${dy * 0.16 + bend}px) scale(1.25)`, opacity: 1, offset: 0.24 },
      { transform: `translate(${dx * 0.68}px, ${dy * 0.58 + bend * 0.55}px) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) scale(.36)`, opacity: 0.92 },
    ], {
      duration,
      easing: 'cubic-bezier(.18,.78,.2,1)',
      fill: 'forwards',
    });

    try {
      await animation.finished;
    } catch {
      // Scene teardown can cancel Web Animations; there is nothing left to present.
    }
    flight.remove();
    if (this.destroyed || token !== this.animationToken) return;
    this.creditSource(source, finalMana);
  }

  private creditSource(source: ManaSource, finalMana: number): void {
    const before = this.displayedMana ?? finalMana;
    const credited = Math.min(source.amount, Math.max(0, finalMana - before));
    const after = Math.min(finalMana, before + credited);
    this.displayedMana = after;
    if (this.manaCount) this.manaCount.textContent = `${after}/${MAX_MANA}`;
    this.impactMana(credited, source.kind === 'well');
    this.wakeNewlyAffordableCards(before, after);
  }

  private impactMana(amount: number, strong = false): void {
    const mana = this.manaCount;
    const layer = this.flightLayer;
    if (!mana || !layer) return;

    this.manaShell?.classList.remove('mana-reactive-spend');
    this.manaShell?.classList.remove('mana-reactive-gain');
    void this.manaShell?.offsetWidth;
    this.manaShell?.classList.add('mana-reactive-gain');
    window.setTimeout(() => this.manaShell?.classList.remove('mana-reactive-gain'), 520);

    mana.classList.remove('mana-counter-impact');
    void mana.offsetWidth;
    mana.classList.add('mana-counter-impact');
    window.setTimeout(() => mana.classList.remove('mana-counter-impact'), 430);

    const appRect = layer.getBoundingClientRect();
    const manaRect = mana.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = `mana-gain-pop${strong ? ' is-well' : ''}`;
    pop.textContent = amount > 0 ? `+${amount}` : 'MAX';
    pop.style.left = `${manaRect.left + manaRect.width * 0.55 - appRect.left}px`;
    pop.style.top = `${manaRect.top - appRect.top}px`;
    layer.append(pop);
    const animation = pop.animate([
      { transform: 'translate(-50%, 2px) scale(.65)', opacity: 0 },
      { transform: 'translate(-50%, -12px) scale(1.2)', opacity: 1, offset: 0.32 },
      { transform: 'translate(-50%, -34px) scale(.92)', opacity: 0 },
    ], { duration: strong ? 700 : 560, easing: 'cubic-bezier(.17,.8,.25,1)' });
    animation.finished.finally(() => pop.remove());
    if (amount > 0) this.playManaGain(strong);
  }

  private presentSpendDelta(amount: number): void {
    const mana = this.manaCount;
    const layer = this.flightLayer;
    if (!mana || !layer || amount <= 0) return;

    this.manaShell?.classList.remove('mana-reactive-gain');
    this.manaShell?.classList.remove('mana-reactive-spend');
    void this.manaShell?.offsetWidth;
    this.manaShell?.classList.add('mana-reactive-spend');
    window.setTimeout(() => this.manaShell?.classList.remove('mana-reactive-spend'), 480);

    const appRect = layer.getBoundingClientRect();
    const manaRect = mana.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'mana-gain-pop is-spend';
    pop.textContent = `-${amount}`;
    pop.style.left = `${manaRect.left + manaRect.width * 0.55 - appRect.left}px`;
    pop.style.top = `${manaRect.top - appRect.top}px`;
    layer.append(pop);
    const animation = pop.animate([
      { transform: 'translate(-50%, -2px) scale(.78)', opacity: 0 },
      { transform: 'translate(-50%, -13px) scale(1.08)', opacity: 1, offset: 0.28 },
      { transform: 'translate(-50%, -28px) scale(.9)', opacity: 0 },
    ], { duration: 520, easing: 'cubic-bezier(.2,.72,.25,1)' });
    animation.finished.finally(() => pop.remove());
  }

  private markPendingCards(previousMana: number, finalMana: number): void {
    const hasSummonSite = getValidSummonCoords(this.game.state).length > 0;
    for (const button of document.querySelectorAll<HTMLButtonElement>('.card[data-card-id]')) {
      const definition = this.cardDefinitionFor(button);
      if (!definition) continue;
      const becomesAffordable = definition.cost > previousMana && definition.cost <= finalMana;
      const canUse = definition.type !== 'unit' || hasSummonSite;
      button.classList.toggle('mana-awaiting', becomesAffordable && canUse);
    }
  }

  private wakeNewlyAffordableCards(previousMana: number, finalMana: number): void {
    if (finalMana <= previousMana) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasSummonSite = getValidSummonCoords(this.game.state).length > 0;

    for (const button of document.querySelectorAll<HTMLButtonElement>('.card[data-card-id]')) {
      const definition = this.cardDefinitionFor(button);
      if (!definition) continue;
      if (!(definition.cost > previousMana && definition.cost <= finalMana)) continue;
      if (definition.type === 'unit' && !hasSummonSite) continue;

      button.classList.remove('mana-awaiting');
      if (reducedMotion) continue;
      button.classList.remove('mana-awaken');
      void button.offsetWidth;
      button.classList.add('mana-awaken');

      button.querySelector('.mana-card-ready')?.remove();
      const ready = document.createElement('span');
      ready.className = 'mana-card-ready';
      ready.textContent = 'READY';
      ready.setAttribute('aria-hidden', 'true');
      button.append(ready);

      const timer = window.setTimeout(() => {
        button.classList.remove('mana-awaken');
        ready.remove();
      }, 820);
      this.wakeTimers.push(timer);
    }
  }

  private dimNewlyUnaffordableCards(previousMana: number, finalMana: number): void {
    if (finalMana >= previousMana) return;
    for (const button of document.querySelectorAll<HTMLButtonElement>('.card[data-card-id]')) {
      const definition = this.cardDefinitionFor(button);
      if (!definition) continue;
      if (!(definition.cost <= previousMana && definition.cost > finalMana)) continue;
      button.classList.remove('mana-sleep');
      void button.offsetWidth;
      button.classList.add('mana-sleep');
      const timer = window.setTimeout(() => button.classList.remove('mana-sleep'), 460);
      this.wakeTimers.push(timer);
    }
  }

  private cardDefinitionFor(button: HTMLButtonElement) {
    const rawId = button.dataset.cardId as CardDefinitionId | undefined;
    return rawId ? CARD_DEFINITIONS[rawId] : undefined;
  }

  private clearPendingCards(): void {
    for (const card of document.querySelectorAll<HTMLElement>('.card.mana-awaiting')) {
      card.classList.remove('mana-awaiting');
    }
  }

  private createFlight(source: ManaSource): HTMLDivElement | undefined {
    const layer = this.flightLayer;
    if (!layer) return undefined;
    const flight = document.createElement('div');
    flight.className = `mana-flight is-${source.kind}`;
    const core = document.createElement('span');
    core.className = 'mana-flight-core';
    flight.append(core);
    layer.append(flight);
    return flight;
  }

  private pulseSource(source: ManaSource): void {
    const center = this.game.center(source.coord);
    const pulse = this.scene.add.graphics();
    const color = source.kind === 'well' ? 0x74b9ff : source.kind === 'ruin' ? 0x8fe8ff : 0x58d4ff;
    const radius = source.kind === 'well' ? 30 : 23;
    pulse.fillStyle(color, source.kind === 'well' ? 0.24 : 0.16);
    pulse.fillCircle(0, 0, radius);
    pulse.lineStyle(source.kind === 'well' ? 5 : 3, 0xd9f7ff, 0.95);
    pulse.strokeCircle(0, 0, radius);
    pulse.lineStyle(2, color, 0.8);
    pulse.strokeCircle(0, 0, radius + 10);
    pulse.setPosition(center.x, center.y).setDepth(9990);
    this.game.boardLayer?.add(pulse);
    this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: source.kind === 'well' ? 2.2 : 1.8,
      scaleY: source.kind === 'well' ? 2.2 : 1.8,
      duration: source.kind === 'well' ? 620 : 480,
      ease: 'Cubic.easeOut',
      onComplete: () => pulse.destroy(),
    });
  }

  private sourceOverlayPoint(coord: Coord): { x: number; y: number } | undefined {
    const layer = this.flightLayer;
    const canvas = this.scene.game.canvas;
    if (!layer || !canvas) return undefined;
    const canvasRect = canvas.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return undefined;

    const camera = this.scene.cameras.main;
    const world = this.game.center(coord);
    const gameX = camera.x + (world.x - camera.worldView.x) * camera.zoom;
    const gameY = camera.y + (world.y - camera.worldView.y) * camera.zoom;
    const gameSize = this.scene.scale.gameSize;
    return {
      x: canvasRect.left - layerRect.left + gameX * (canvasRect.width / gameSize.width),
      y: canvasRect.top - layerRect.top + gameY * (canvasRect.height / gameSize.height),
    };
  }

  private manaOverlayPoint(): { x: number; y: number } | undefined {
    const layer = this.flightLayer;
    const mana = this.manaCount;
    if (!layer || !mana) return undefined;
    const layerRect = layer.getBoundingClientRect();
    const manaRect = mana.getBoundingClientRect();
    return {
      x: manaRect.left + manaRect.width * 0.5 - layerRect.left,
      y: manaRect.top + manaRect.height * 0.5 - layerRect.top,
    };
  }

  private finishManaAnimation(token: number): void {
    if (this.destroyed || token !== this.animationToken) return;
    this.clearPendingCards();
    const player = this.game.state.currentPlayer;
    this.displayedMana = undefined;
    this.manaByPlayer[player] = this.game.state.players[player].mana;
    this.originalRenderHud?.();
    this.decorateHud();
  }

  private cancelActiveAnimation(): void {
    this.animationToken += 1;
    this.clearPendingCards();
    this.displayedMana = undefined;
    this.originalRenderHud?.();
    this.decorateHud();
  }

  private ensureAudioContext(): AudioContext | undefined {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return undefined;
      this.audioContext = new AudioContextCtor();
    }
    if (this.audioContext.state === 'suspended') void this.audioContext.resume().catch(() => undefined);
    return this.audioContext;
  }

  private playTone(startHz: number, endHz: number, duration: number, volume: number): void {
    const context = this.ensureAudioContext();
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private playManaGain(strong: boolean): void {
    this.playTone(strong ? 560 : 520, strong ? 940 : 830, strong ? 0.13 : 0.095, strong ? 0.018 : 0.012);
  }

  private playManaSpend(): void {
    this.playTone(410, 250, 0.1, 0.016);
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }
}
