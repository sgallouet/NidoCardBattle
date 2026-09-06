import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState, Trait, UnitDefinition, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { coordKey, effectiveRange, findUnit, getReachableCoords, unitDefinition } from './engine';
import './UnitInfoInspector.css';

export interface UnitInfoInspectorSceneInternals {
  state: GameState;
  selectedUnitId: string | null;
}

type InspectorMode =
  | { kind: 'selected'; unit: UnitState; definition: UnitDefinition }
  | { kind: 'card'; definition: UnitDefinition; cost: number };

interface InspectorTag {
  label: string;
  kind: 'ability' | 'trait' | 'status';
  description?: string;
}

const TRAIT_LABELS: Record<Trait, string> = {
  Blocking: 'Blocking',
  Retaliates: 'Retaliates',
  Invoker: 'Invoker',
  HealingAura: 'Healing Aura',
  Ranged: 'Ranged',
  SetShot: 'Set Shot',
  Flying: 'Flying',
  AgileAssault: 'Agile Assault',
  DarkReflection: 'Dark Reflection',
  Necromancy: 'Necromancy',
  Phase: 'Phase',
  Assist: 'Assist',
};

const TRAIT_DESCRIPTIONS: Record<Trait, string> = {
  Blocking: 'When an enemy enters a hex adjacent to this unit, that enemy’s movement ends immediately.',
  Retaliates: 'After surviving an attack, immediately deals its Attack damage back if the attacker is within this unit’s Range.',
  Invoker: 'Instead of attacking, summon one Exhausted Invoked Beast on a free adjacent hex. This unit can have only one living Beast at a time.',
  HealingAura: 'At the start of this unit owner’s turn, every adjacent ally restores 1 HP. The aura bearer does not heal itself.',
  Ranged: 'Uses ranged attack rules. Base Range is 3, and standing on a Hill grants +1 Range.',
  SetShot: 'After this unit spends any movement during its turn, it cannot make a normal attack that turn. It can still Assist.',
  Flying: 'Ignores terrain movement restrictions except Mountains. Every terrain hex it can enter costs 1 movement point.',
  AgileAssault: 'May move up to its Move before attacking, then move up to its Move again after attacking. Retaliation damage is reduced by 50%, rounded up.',
  DarkReflection: 'When an enemy directly damages this unit, that attacker immediately takes 30% of the damage actually dealt, rounded to the nearest HP.',
  Necromancy: 'When this unit personally kills an enemy with its attack, summon an Exhausted Skeletal Infantry on the defeated hex if it is free.',
  Phase: 'Ignores enemy Blocking while moving. Normal occupancy, destination, Grave Lock, and impassable-terrain rules still apply.',
  Assist: 'When an ally makes an adjacent close normal attack, add 1 damage if the target is within this unit’s Range, or 2 from directly opposite the attacker. Assist does not consume actions.',
};

export class UnitInfoInspector {
  private observer?: MutationObserver;
  private hoveredCard?: HTMLButtonElement;
  private traitTooltip?: HTMLElement;

  constructor(private readonly game: UnitInfoInspectorSceneInternals) {}

  install(): void {
    this.createTraitTooltip();
    const hand = document.querySelector<HTMLElement>('#hand');
    if (hand) {
      this.bindCards();
      this.observer = new MutationObserver(() => this.bindCards());
      this.observer.observe(hand, { childList: true });
    }
    this.sync();
  }

  sync(): void {
    if (this.hoveredCard?.isConnected) return;
    this.hoveredCard = undefined;
    this.renderSelected();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.hoveredCard = undefined;
    this.hideTraitTooltip();
    this.traitTooltip?.remove();
    this.traitTooltip = undefined;
  }

  private createTraitTooltip(): void {
    this.traitTooltip?.remove();
    const tooltip = document.createElement('div');
    tooltip.className = 'unit-trait-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    this.traitTooltip = tooltip;
  }

  private bindCards(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    for (const button of hand.querySelectorAll<HTMLButtonElement>('.card[data-hand-index]')) {
      if (button.dataset.unitInspectorBound === 'true') continue;
      button.dataset.unitInspectorBound = 'true';
      button.addEventListener('pointerenter', () => this.previewCard(button));
      button.addEventListener('pointerleave', () => this.endCardPreview(button));
      button.addEventListener('focus', () => this.previewCard(button));
      button.addEventListener('blur', () => this.endCardPreview(button));
    }
  }

  private previewCard(button: HTMLButtonElement): void {
    const player = this.game.state.players[this.game.state.currentPlayer];
    const index = Number(button.dataset.handIndex);
    const cardId = player.hand[index] as CardDefinitionId | undefined;
    if (!cardId) return;
    const card = CARD_DEFINITIONS[cardId];
    if (card.type !== 'unit') return;

    const definition = UNIT_DEFINITIONS[card.unitId as UnitDefinitionId];
    if (!definition) return;
    this.hoveredCard = button;
    this.render({ kind: 'card', definition, cost: card.cost });
  }

  private endCardPreview(button: HTMLButtonElement): void {
    if (this.hoveredCard !== button) return;
    this.hoveredCard = undefined;
    this.renderSelected();
  }

  private renderSelected(): void {
    const unit = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
    if (!unit) {
      this.hideTraitTooltip();
      const inspector = document.querySelector<HTMLElement>('#unit-inspector');
      if (inspector) inspector.hidden = true;
      return;
    }
    this.render({ kind: 'selected', unit, definition: unitDefinition(unit) });
  }

  private render(mode: InspectorMode): void {
    const inspector = document.querySelector<HTMLElement>('#unit-inspector');
    const target = document.querySelector<HTMLElement>('#selected-unit');
    if (!inspector || !target) return;

    this.hideTraitTooltip();
    inspector.hidden = false;
    inspector.classList.toggle('is-card-preview', mode.kind === 'card');
    const definition = mode.definition;
    const range = mode.kind === 'selected' ? effectiveRange(mode.unit) : definition.range;
    const hp = mode.kind === 'selected' ? `${mode.unit.hp}/${definition.maxHp}` : `${definition.maxHp}`;
    const attack = definition.normalAttack === false ? '—' : `${definition.attack}`;
    const status = mode.kind === 'selected' ? this.statusFor(mode.unit) : [];
    const tags: InspectorTag[] = [
      ...(definition.ability ? [{ label: definition.ability, kind: 'ability' as const }] : []),
      ...definition.traits.map((trait) => ({
        label: TRAIT_LABELS[trait],
        kind: 'trait' as const,
        description: TRAIT_DESCRIPTIONS[trait],
      })),
      ...status.map((label) => ({ label, kind: 'status' as const })),
    ];
    const enemyPreview = mode.kind === 'selected' && mode.unit.owner !== this.game.state.currentPlayer;

    target.innerHTML = `
      <div class="unit-sheet-heading">
        <div>
          <span class="unit-sheet-kicker">${mode.kind === 'card' ? `Unit card · ${mode.cost} Mana` : `Player ${mode.unit.owner} unit`}</span>
          <div class="unit-name unit-owner-${mode.kind === 'selected' ? mode.unit.owner : this.game.state.currentPlayer}">${definition.name}</div>
        </div>
        ${mode.kind === 'card' ? '<span class="unit-sheet-preview-badge">Preview</span>' : enemyPreview ? '<span class="unit-sheet-preview-badge is-threat">Threat</span>' : ''}
      </div>
      <div class="unit-sheet-stats" aria-label="Unit statistics">
        ${this.stat('HP', hp, 'Health')}
        ${this.stat('ATK', attack, definition.normalAttack === false ? 'No normal attack' : 'Attack damage')}
        ${this.stat('MOV', `${definition.move}`, 'Movement')}
        ${this.stat('RNG', `${range}`, range > definition.range ? `Range (${definition.range} base + terrain bonus)` : 'Attack range')}
      </div>
      ${tags.length > 0 ? `<div class="unit-sheet-tags">${tags.map((tag) => this.renderTag(tag)).join('')}</div>` : ''}
      ${enemyPreview ? '<div class="unit-sheet-threat-legend"><span><i class="is-move"></i>Move next turn</span><span><i class="is-attack"></i>Attack threat</span></div>' : ''}
      ${mode.kind === 'card' && definition.traits.includes('Ranged') ? '<div class="unit-sheet-note">Ranged units gain +1 Range while on Hills.</div>' : ''}`;

    this.bindTraitTooltips(target);
  }

  private renderTag(tag: InspectorTag): string {
    if (!tag.description) {
      return `<span class="unit-sheet-tag is-${tag.kind}">${this.escape(tag.label)}</span>`;
    }
    const description = this.escape(tag.description);
    return `<span class="unit-sheet-tag is-${tag.kind}" tabindex="0" data-trait-description="${description}" aria-label="${this.escape(`${tag.label}: ${tag.description}`)}">${this.escape(tag.label)}</span>`;
  }

  private bindTraitTooltips(target: HTMLElement): void {
    for (const tag of target.querySelectorAll<HTMLElement>('[data-trait-description]')) {
      tag.addEventListener('pointerenter', () => this.showTraitTooltip(tag));
      tag.addEventListener('pointerleave', () => this.hideTraitTooltip());
      tag.addEventListener('focus', () => this.showTraitTooltip(tag));
      tag.addEventListener('blur', () => this.hideTraitTooltip());
    }
  }

  private showTraitTooltip(tag: HTMLElement): void {
    const tooltip = this.traitTooltip;
    const description = tag.dataset.traitDescription;
    if (!tooltip || !description) return;
    tooltip.textContent = description;
    tooltip.hidden = false;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    const anchor = tag.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const padding = 8;
    const left = Math.max(
      padding,
      Math.min(window.innerWidth - bounds.width - padding, anchor.left + anchor.width / 2 - bounds.width / 2),
    );
    const above = anchor.top - bounds.height - 9;
    const top = above >= padding
      ? above
      : Math.min(window.innerHeight - bounds.height - padding, anchor.bottom + 9);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  private hideTraitTooltip(): void {
    if (this.traitTooltip) this.traitTooltip.hidden = true;
  }

  private stat(label: string, value: string, title: string): string {
    return `<div class="unit-sheet-stat" title="${this.escape(title)}"><span>${label}</span><strong>${this.escape(value)}</strong></div>`;
  }

  private statusFor(unit: UnitState): string[] {
    return [
      unit.exhausted ? 'Exhausted' : '',
      unit.moved ? 'Moved' : '',
      unit.attacked ? 'Attacked' : '',
      unit.pendingAdvance && getReachableCoords(this.game.state, unit.id).has(coordKey(unit.pendingAdvance)) ? 'Reposition available' : '',
    ].filter(Boolean);
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
