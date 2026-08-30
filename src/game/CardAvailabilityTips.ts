import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState } from '../data/types';
import './CardAvailabilityTips.css';

interface CardAvailabilityTipsOptions {
  getState: () => GameState;
  tileTipsEnabled: () => boolean;
  hideTileInsight: () => void;
}

export class CardAvailabilityTips {
  private observer?: MutationObserver;
  private activeCard?: HTMLButtonElement;
  private showTimer: number | null = null;

  constructor(private readonly options: CardAvailabilityTipsOptions) {}

  install(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    this.sync();
    this.observer = new MutationObserver(() => this.sync());
    this.observer.observe(hand, { childList: true });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.hide();
  }

  private sync(): void {
    if (this.activeCard && !this.activeCard.isConnected) this.hide();
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    const state = this.options.getState();
    const player = state.players[state.currentPlayer];

    for (const button of hand.querySelectorAll<HTMLButtonElement>('.card[data-hand-index]')) {
      const index = Number(button.dataset.handIndex);
      const cardId = player.hand[index] as CardDefinitionId | undefined;
      if (!cardId) continue;
      const card = CARD_DEFINITIONS[cardId];
      if (card.cost <= player.mana) continue;

      // Native disabled buttons are unreliable hover targets. Keep the same disabled
      // presentation and semantics, but block activation ourselves so FTUE can explain why.
      button.disabled = false;
      button.dataset.manaBlocked = 'true';
      button.setAttribute('aria-disabled', 'true');
      button.addEventListener('click', this.blockActivation, { capture: true });
      button.addEventListener('pointerenter', () => this.schedule(button, card.name, card.cost, player.mana));
      button.addEventListener('pointerleave', () => this.hide(button));
      button.addEventListener('focus', () => this.schedule(button, card.name, card.cost, player.mana));
      button.addEventListener('blur', () => this.hide(button));
    }
  }

  private readonly blockActivation = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private schedule(button: HTMLButtonElement, cardName: string, cost: number, mana: number): void {
    if (!this.options.tileTipsEnabled() || window.matchMedia('(hover: none)').matches) return;
    this.hide();
    this.activeCard = button;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      if (this.activeCard !== button || !button.isConnected) return;
      this.render(button, cardName, cost, mana);
    }, 220);
  }

  private hide(button?: HTMLButtonElement): void {
    if (button && this.activeCard !== button) return;
    if (this.showTimer !== null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.activeCard = undefined;
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = true;
  }

  private render(button: HTMLButtonElement, cardName: string, cost: number, mana: number): void {
    this.options.hideTileInsight();
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    const eyebrow = document.querySelector<HTMLElement>('#tile-insight-eyebrow');
    const title = document.querySelector<HTMLElement>('#tile-insight-title');
    const badge = document.querySelector<HTMLElement>('#tile-insight-badge');
    const rows = document.querySelector<HTMLElement>('#tile-insight-rows');
    if (!panel || !eyebrow || !title || !badge || !rows) return;

    const missing = cost - mana;
    eyebrow.textContent = 'Card unavailable';
    title.textContent = 'Not enough Mana';
    badge.textContent = `Need ${missing}`;
    panel.dataset.tone = 'hostile';

    const item = document.createElement('div');
    item.className = 'tile-insight-row';
    const label = document.createElement('span');
    label.className = 'tile-insight-label';
    label.textContent = 'Mana';
    const copy = document.createElement('span');
    copy.className = 'tile-insight-copy';
    copy.textContent = `${cardName} costs ${cost}. You have ${mana}; gain ${missing} more to play it.`;
    item.append(label, copy);
    rows.replaceChildren(item);

    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    this.position(panel, button);
    window.requestAnimationFrame(() => {
      if (!panel.hidden && this.activeCard === button) panel.classList.add('is-visible');
    });
  }

  private position(panel: HTMLElement, button: HTMLButtonElement): void {
    const cardRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const padding = 12;
    const gap = 12;
    const left = Math.max(
      padding,
      Math.min(
        cardRect.left + cardRect.width / 2 - panelRect.width / 2,
        window.innerWidth - panelRect.width - padding,
      ),
    );
    const top = Math.max(padding, cardRect.top - panelRect.height - gap);
    panel.dataset.side = left + panelRect.width / 2 <= cardRect.left + cardRect.width / 2 ? 'right' : 'left';
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
}
