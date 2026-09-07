import { CARD_ART } from '../data/cardArt';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState, PlayerId } from '../data/types';
import { getValidSummonCoords } from './engine';

interface PersistentHandRendererOptions {
  getState: () => GameState;
  getSelectedCardIndex: () => number | null;
  getMode: () => string | null;
  isAnimationInProgress: () => boolean;
  selectCard: (index: number) => void;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class PersistentHandRenderer {
  private initialized = false;
  private currentPlayer?: PlayerId;

  constructor(private readonly options: PersistentHandRendererOptions) {}

  render(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;

    const state = this.options.getState();
    const player = state.players[state.currentPlayer];
    const canReuse = this.initialized && this.currentPlayer === state.currentPlayer;
    const existing = canReuse
      ? Array.from(hand.querySelectorAll<HTMLButtonElement>(':scope > .card[data-persistent-hand="true"]'))
      : [];
    const reusable = new Map<string, HTMLButtonElement[]>();

    for (const button of existing) {
      const cardId = button.dataset.cardId;
      if (!cardId) continue;
      const pool = reusable.get(cardId) ?? [];
      pool.push(button);
      reusable.set(cardId, pool);
    }

    hand.classList.toggle('targeting', this.options.getMode() === 'card');
    const hasSummonSite = getValidSummonCoords(state).length > 0;
    const desired: HTMLButtonElement[] = [];

    player.hand.forEach((rawCardId, index) => {
      const cardId = rawCardId as CardDefinitionId;
      const pool = reusable.get(cardId);
      const button = pool?.shift() ?? this.createCard(cardId);
      this.updateCard(button, cardId, index, player.hand.length, hasSummonSite);
      desired.push(button);
    });

    const desiredSet = new Set(desired);
    for (const child of Array.from(hand.children)) {
      if (!desiredSet.has(child as HTMLButtonElement)) child.remove();
    }

    desired.forEach((button, index) => {
      const current = hand.children.item(index);
      if (current !== button) hand.insertBefore(button, current);
    });

    this.initialized = true;
    this.currentPlayer = state.currentPlayer;
  }

  destroy(): void {
    this.initialized = false;
    this.currentPlayer = undefined;
  }

  private createCard(cardId: CardDefinitionId): HTMLButtonElement {
    const cardArt = CARD_ART[cardId];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card deal-in';
    button.dataset.persistentHand = 'true';
    button.dataset.cardId = cardId;
    button.innerHTML = `
      <span class="card-surface">
        <img class="card-art" src="${cardArt}" alt="" draggable="false" decoding="async">
        <span class="card-holo" aria-hidden="true"></span>
        <span class="card-glare" aria-hidden="true"></span>
      </span>`;

    button.addEventListener('pointermove', (event) => this.tiltCard(button, event));
    button.addEventListener('pointerleave', () => this.resetCardTilt(button));
    button.addEventListener('click', () => {
      const index = Number(button.dataset.handIndex);
      if (Number.isInteger(index) && index >= 0) this.options.selectCard(index);
    });
    button.addEventListener('animationend', (event) => {
      if (event.animationName === 'card-deal-in') button.classList.remove('deal-in');
    });
    window.setTimeout(() => button.classList.remove('deal-in'), 1400);
    return button;
  }

  private updateCard(
    button: HTMLButtonElement,
    cardId: CardDefinitionId,
    index: number,
    handSize: number,
    hasSummonSite: boolean,
  ): void {
    const state = this.options.getState();
    const player = state.players[state.currentPlayer];
    const card = CARD_DEFINITIONS[cardId];
    const availabilityDisabled = card.cost > player.mana || (card.type === 'unit' && !hasSummonSite);
    const hardDisabled = state.winner !== null || this.options.isAnimationInProgress();

    button.classList.toggle('selected', this.options.getSelectedCardIndex() === index);
    button.disabled = hardDisabled || availabilityDisabled;
    button.dataset.hardDisabled = `${hardDisabled}`;
    button.dataset.handIndex = `${index}`;
    button.setAttribute('aria-label', `${card.name}, ${card.cost} mana`);

    if (!availabilityDisabled) {
      delete button.dataset.availabilityBlocked;
      button.removeAttribute('aria-disabled');
    }

    // A deliberately visible but still restrained hand fan. The cards pivot from
    // below the viewport as though held in one hand: outer cards rotate outward,
    // while the middle sinks into a shallow arc. CSS straightens and lifts the
    // hovered/selected card without losing this resting geometry.
    const fanOffset = index - (handSize - 1) / 2;
    const maxOffset = Math.max(0.5, (handSize - 1) / 2);
    const normalizedOffset = fanOffset / maxOffset;
    const maxAngle = handSize <= 1 ? 0 : Math.min(13, 7 + handSize * 1.05);
    const normalizedDistance = Math.min(1, Math.abs(fanOffset) / maxOffset);
    const centerDip = handSize <= 1 ? 0 : (1 - normalizedDistance ** 1.45) * 25;
    button.style.setProperty('--fan-angle', `${normalizedOffset * maxAngle}deg`);
    button.style.setProperty('--fan-y', `${centerDip}px`);
    button.style.setProperty('--fan-position', `${normalizedOffset}`);
    button.style.setProperty('--deal-delay', `${index * 70}ms`);

    delete button.dataset.holoStyle;
    button.style.removeProperty('--card-mask');
    if (index === 0) {
      button.dataset.holoStyle = 'masked';
      button.style.setProperty('--card-mask', `url("${CARD_ART[cardId]}")`);
    } else if (index === 1) {
      button.dataset.holoStyle = 'cosmos';
    } else if (index === 3) {
      button.dataset.holoStyle = 'radiant';
    } else if (index === 4) {
      button.dataset.holoStyle = 'reverse';
    }
  }

  private tiltCard(card: HTMLButtonElement, event: PointerEvent): void {
    if (card.disabled || window.matchMedia('(hover: none)').matches) return;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 16}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 20}deg`);
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
    card.style.setProperty('--holo-x', `${(1 - x) * 100}%`);
    card.style.setProperty('--holo-y', `${(1 - y) * 100}%`);
  }

  private resetCardTilt(card: HTMLButtonElement): void {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--shine-x', '50%');
    card.style.setProperty('--shine-y', '50%');
    card.style.setProperty('--holo-x', '50%');
    card.style.setProperty('--holo-y', '50%');
  }
}