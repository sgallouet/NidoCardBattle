import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { Ability, GameState, Trait, UnitDefinition, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import {
  coordKey,
  effectiveMove,
  effectiveRange,
  findUnit,
  getAttackTargets,
  getCurseTargets,
  getDisplaceTargets,
  getInvokeDestinations,
  getRallyTargets,
  getReachableCoords,
  getSoulLinkTargets,
  getThunderTargetCoords,
  hasActiveCurseFrom,
  unitDefinition,
} from './engine';
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
  icon?: string;
}

interface UnitVisualSnapshot {
  hp: number;
  range: number;
  move: number;
  moved: boolean;
  attacked: boolean;
  exhausted: boolean;
}

interface ActionChip {
  label: string;
  value: string;
  icon: string;
  tone: 'ready' | 'spent' | 'neutral' | 'special';
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
  SetShot: 'After this unit spends any movement during its turn, it cannot make a normal attack that turn. It can still use eligible abilities and still Assist.',
  Flying: 'Ignores terrain movement restrictions except Mountains. Every terrain hex it can enter costs 1 movement point.',
  AgileAssault: 'May move up to its Move before attacking, then move up to its Move again after attacking. Retaliation damage is reduced by 50%, rounded up.',
  DarkReflection: 'When an enemy directly damages this unit, that attacker immediately takes 30% of the damage actually dealt, rounded to the nearest HP.',
  Necromancy: 'When this unit personally kills an enemy with its normal attack, raise an Exhausted Skeletal Infantry with exactly 1 HP on the defeated hex if it is free.',
  Phase: 'Ignores enemy Blocking while moving. Normal occupancy, destination, Grave Lock, and impassable-terrain rules still apply.',
  Assist: 'When an ally makes an adjacent close normal attack, add 1 damage if the target is within this unit’s Range, or 2 from directly opposite the attacker. Assist does not consume actions.',
};

const ABILITY_DESCRIPTIONS: Record<Ability, string> = {
  Displace: 'Instead of attacking, move one adjacent unit to another free hex adjacent to this unit.',
  Restore: 'Restore HP to an eligible adjacent ally.',
  Thunder: 'Strike one enemy within Range for 1 damage, then chain through every enemy connected by adjacent occupied hexes. Each enemy is struck once; allies are safe.',
  Rally: 'Instead of attacking, give eligible adjacent allies +1 Move for the current turn.',
  SoulLink: 'Instead of attacking, link the Commander to one adjacent allied Undead unit so incoming Commander damage is redirected to it.',
  Curse: 'Curse one enemy within Range for 1 damage at the end of its next 3 turns. Each Necromancer may maintain only one active Curse at a time.',
  BloodDrain: 'After dealing damage with a normal attack, restore 1 HP to this unit, up to its maximum.',
  Cleave: 'A normal attack also deals this unit’s Attack damage to every other enemy adjacent to the attacker.',
};

export class UnitInfoInspector {
  private observer?: MutationObserver;
  private hoveredCard?: HTMLButtonElement;
  private traitTooltip?: HTMLElement;
  private readonly snapshots = new Map<string, UnitVisualSnapshot>();
  private renderedSubject?: string;
  private entranceTimer?: number;

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
    if (this.entranceTimer !== undefined) window.clearTimeout(this.entranceTimer);
    this.entranceTimer = undefined;
    this.snapshots.clear();
    this.renderedSubject = undefined;
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
      this.renderedSubject = undefined;
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
    inspector.classList.remove('hp-damaged', 'hp-healed');

    const definition = mode.definition;
    const owner = mode.kind === 'selected' ? mode.unit.owner : this.game.state.currentPlayer;
    inspector.dataset.owner = `${owner}`;

    const range = mode.kind === 'selected' ? effectiveRange(mode.unit) : definition.range;
    const move = mode.kind === 'selected' ? effectiveMove(mode.unit) : definition.move;
    const hpValue = mode.kind === 'selected' ? mode.unit.hp : definition.maxHp;
    const hpPercent = Math.max(0, Math.min(100, hpValue / definition.maxHp * 100));
    const attack = definition.normalAttack === false ? '—' : `${definition.attack}`;
    const subject = mode.kind === 'selected' ? `unit:${mode.unit.id}` : `card:${definition.id}`;
    const previous = mode.kind === 'selected' ? this.snapshots.get(mode.unit.id) : undefined;
    const previousHpPercent = previous
      ? Math.max(0, Math.min(100, previous.hp / definition.maxHp * 100))
      : hpPercent;
    const hpDelta = previous ? hpValue - previous.hp : 0;
    const rangeChanged = previous !== undefined && previous.range !== range;
    const moveChanged = previous !== undefined && previous.move !== move;

    if (hpDelta < 0) inspector.classList.add('hp-damaged');
    if (hpDelta > 0) inspector.classList.add('hp-healed');
    if (subject !== this.renderedSubject) this.playEntrance(inspector);
    this.renderedSubject = subject;

    const status = mode.kind === 'selected' ? this.statusFor(mode.unit) : [];
    const tags: InspectorTag[] = [
      ...(definition.ability ? [{
        label: definition.ability,
        kind: 'ability' as const,
        description: ABILITY_DESCRIPTIONS[definition.ability],
        icon: '✦',
      }] : []),
      ...definition.traits.map((trait) => ({
        label: TRAIT_LABELS[trait],
        kind: 'trait' as const,
        description: TRAIT_DESCRIPTIONS[trait],
      })),
      ...status,
    ];
    const enemyPreview = mode.kind === 'selected' && mode.unit.owner !== this.game.state.currentPlayer;
    const ownerLabel = mode.kind === 'card'
      ? `Unit card · ${mode.cost} Mana`
      : mode.unit.owner === this.game.state.currentPlayer
        ? 'Your unit'
        : 'Enemy unit';
    const moveBonus = move - definition.move;
    const rangeBonus = range - definition.range;
    const actionState = mode.kind === 'selected' && !enemyPreview
      ? this.renderActionState(mode.unit, definition)
      : '';

    target.innerHTML = `
      <div class="unit-sheet-heading">
        <div>
          <span class="unit-sheet-kicker">${ownerLabel}</span>
          <div class="unit-name unit-owner-${owner}">${definition.name}</div>
        </div>
        ${mode.kind === 'card' ? '<span class="unit-sheet-preview-badge">Preview</span>' : enemyPreview ? '<span class="unit-sheet-preview-badge is-threat">Threat</span>' : ''}
      </div>
      <div class="unit-health ${hpPercent <= 35 ? 'is-low' : ''}" style="--hp-current:${hpPercent}%;--hp-previous:${previousHpPercent}%">
        <div class="unit-health-copy">
          <span>Health</span>
          <strong>${hpValue}<small> / ${definition.maxHp}</small></strong>
          ${hpDelta !== 0 ? `<em class="unit-health-delta">${hpDelta > 0 ? '+' : ''}${hpDelta}</em>` : ''}
        </div>
        <div class="unit-health-track" aria-label="${hpValue} of ${definition.maxHp} health">
          <i class="unit-health-lag" aria-hidden="true"></i>
          <i class="unit-health-fill" aria-hidden="true"></i>
          <i class="unit-health-spark" aria-hidden="true"></i>
        </div>
      </div>
      <div class="unit-sheet-stats" aria-label="Unit statistics">
        ${this.stat('ATK', attack, definition.normalAttack === false ? 'No normal attack' : 'Attack damage')}
        ${this.stat('MOV', `${move}`, moveBonus > 0 ? `Movement (${definition.move} base + ${moveBonus} bonus)` : 'Movement', moveBonus > 0 ? `+${moveBonus}` : '', moveChanged)}
        ${this.stat('RNG', `${range}`, rangeBonus > 0 ? `Range (${definition.range} base + ${rangeBonus} terrain bonus)` : 'Attack range', rangeBonus > 0 ? `+${rangeBonus}` : '', rangeChanged)}
      </div>
      ${actionState}
      ${tags.length > 0 ? `<div class="unit-sheet-tags">${tags.map((tag) => this.renderTag(tag)).join('')}</div>` : ''}
      ${enemyPreview ? '<div class="unit-sheet-threat-legend"><span><i class="is-move"></i>Move next turn</span><span><i class="is-attack"></i>Attack threat</span></div>' : ''}
      ${mode.kind === 'card' && definition.traits.includes('Ranged') ? '<div class="unit-sheet-note">Ranged units gain +1 Range while on Hills.</div>' : ''}`;

    this.bindTraitTooltips(target);
    this.enhanceAbilityControls(inspector, mode);

    if (mode.kind === 'selected') {
      this.snapshots.set(mode.unit.id, {
        hp: mode.unit.hp,
        range,
        move,
        moved: mode.unit.moved,
        attacked: mode.unit.attacked,
        exhausted: mode.unit.exhausted,
      });
    }
  }

  private renderActionState(unit: UnitState, definition: UnitDefinition): string {
    const chips = [this.moveChip(unit), this.attackChip(unit, definition)];
    const exhausted = unit.exhausted;
    return `
      <div class="unit-action-state ${exhausted ? 'is-exhausted' : ''}" aria-label="Action state">
        ${chips.map((chip) => `
          <span class="unit-action-chip is-${chip.tone}">
            <i aria-hidden="true">${chip.icon}</i>
            <span><small>${chip.label}</small><strong>${chip.value}</strong></span>
          </span>`).join('')}
      </div>`;
  }

  private moveChip(unit: UnitState): ActionChip {
    if (unit.exhausted) return { label: 'Move', value: 'Spent', icon: '↠', tone: 'spent' };
    const reposition = unit.pendingAdvance
      && getReachableCoords(this.game.state, unit.id).has(coordKey(unit.pendingAdvance));
    if (reposition) return { label: 'Move', value: 'Reposition', icon: '↠', tone: 'special' };

    const reachable = getReachableCoords(this.game.state, unit.id).size > 0;
    if (unit.moved && reachable && !unit.attacked) {
      return { label: 'Move', value: 'Reconsider', icon: '↠', tone: 'special' };
    }
    if (reachable) return { label: 'Move', value: 'Ready', icon: '↠', tone: 'ready' };
    if (unit.moved || unit.attacked) return { label: 'Move', value: 'Used', icon: '↠', tone: 'spent' };
    return { label: 'Move', value: 'No path', icon: '↠', tone: 'neutral' };
  }

  private attackChip(unit: UnitState, definition: UnitDefinition): ActionChip {
    if (unit.exhausted) return { label: 'Attack', value: 'Spent', icon: '⚔', tone: 'spent' };
    if (unit.attacked) return { label: 'Attack', value: 'Used', icon: '⚔', tone: 'spent' };
    if (definition.normalAttack === false) return { label: 'Attack', value: 'Ability only', icon: '⚔', tone: 'neutral' };
    if (definition.traits.includes('SetShot') && (unit.movementSpent ?? 0) > 0) {
      return { label: 'Attack', value: 'Set Shot lost', icon: '⚔', tone: 'spent' };
    }
    if (getAttackTargets(this.game.state, unit.id).length > 0) {
      return { label: 'Attack', value: 'Target ready', icon: '⚔', tone: 'ready' };
    }
    return { label: 'Attack', value: 'Unused', icon: '⚔', tone: 'neutral' };
  }

  private enhanceAbilityControls(inspector: HTMLElement, mode: InspectorMode): void {
    const row = inspector.querySelector<HTMLElement>('.action-row');
    if (!row) return;
    const ability = inspector.querySelector<HTMLButtonElement>('#ability-button');
    const invoke = inspector.querySelector<HTMLButtonElement>('#invoke-button');
    const controls = [ability, invoke].filter((button): button is HTMLButtonElement => Boolean(button && !button.hidden));
    row.hidden = mode.kind === 'card' || controls.length === 0;
    if (row.hidden) return;

    for (const button of controls) {
      const existingLabel = button.querySelector<HTMLElement>('.unit-action-label')?.textContent;
      const label = (existingLabel ?? button.textContent ?? 'Ability').replace(/^Use\s+/i, '').trim();
      const isInvoke = button.id === 'invoke-button';
      const available = !button.disabled && this.activeAbilityAvailable(mode, label, isInvoke);
      button.classList.add('unit-action-control');
      button.classList.toggle('is-ready', available);
      button.innerHTML = `
        <span class="unit-action-control-icon" aria-hidden="true">${isInvoke ? '◆' : '✦'}</span>
        <span class="unit-action-control-copy">
          <strong class="unit-action-label">${this.escape(label)}</strong>
          <small>${available ? 'Ready · use ability' : 'Unavailable now'}</small>
        </span>
        <span class="unit-action-control-arrow" aria-hidden="true">›</span>`;
    }
  }

  private activeAbilityAvailable(mode: InspectorMode, label: string, invoke: boolean): boolean {
    if (mode.kind !== 'selected') return false;
    const unit = mode.unit;
    if (invoke) return getInvokeDestinations(this.game.state, unit.id).length > 0;
    if (label === 'Displace') return getDisplaceTargets(this.game.state, unit.id).length > 0;
    if (label === 'Rally') return getRallyTargets(this.game.state, unit.id).length > 0;
    if (label === 'Soul Link') return getSoulLinkTargets(this.game.state, unit.id).length > 0;
    if (label === 'Curse') return getCurseTargets(this.game.state, unit.id).length > 0;
    if (label === 'Thunder') return getThunderTargetCoords(this.game.state, unit.id).length > 0;
    return true;
  }

  private renderTag(tag: InspectorTag): string {
    const icon = tag.icon ? `<i class="unit-sheet-tag-icon" aria-hidden="true">${this.escape(tag.icon)}</i>` : '';
    if (!tag.description) {
      return `<span class="unit-sheet-tag is-${tag.kind}">${icon}${this.escape(tag.label)}</span>`;
    }
    const description = this.escape(tag.description);
    return `<span class="unit-sheet-tag is-${tag.kind}" tabindex="0" data-trait-description="${description}" aria-label="${this.escape(`${tag.label}: ${tag.description}`)}">${icon}${this.escape(tag.label)}</span>`;
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

  private stat(label: string, value: string, title: string, bonus = '', changed = false): string {
    return `
      <div class="unit-sheet-stat ${bonus ? 'is-boosted' : ''} ${changed ? 'stat-changed' : ''}" title="${this.escape(title)}">
        <span>${label}</span>
        <strong>${this.escape(value)}</strong>
        ${bonus ? `<em>${this.escape(bonus)}</em>` : ''}
      </div>`;
  }

  private statusFor(unit: UnitState): InspectorTag[] {
    const tags: InspectorTag[] = [];
    if (unit.exhausted) tags.push({ label: 'Exhausted', kind: 'status', icon: '◌' });
    if (unit.pendingAdvance && getReachableCoords(this.game.state, unit.id).has(coordKey(unit.pendingAdvance))) {
      tags.push({ label: 'Reposition available', kind: 'status', icon: '↠' });
    }
    if (hasActiveCurseFrom(this.game.state, unit.id)) {
      tags.push({
        label: 'Curse active',
        kind: 'status',
        icon: '☾',
        description: 'This Necromancer already maintains a Curse and cannot cast another until it ends or its target leaves the battlefield.',
      });
    }
    const activeBeast = unit.invokedPetId ? findUnit(this.game.state, unit.invokedPetId) : undefined;
    if (activeBeast) {
      tags.push({
        label: 'Beast active',
        kind: 'status',
        icon: '◆',
        description: 'This Mage already has a living Invoked Beast and cannot invoke another until it is destroyed.',
      });
    }
    return tags;
  }

  private playEntrance(inspector: HTMLElement): void {
    inspector.classList.remove('is-entering');
    void inspector.offsetWidth;
    inspector.classList.add('is-entering');
    if (this.entranceTimer !== undefined) window.clearTimeout(this.entranceTimer);
    this.entranceTimer = window.setTimeout(() => {
      inspector.classList.remove('is-entering');
      this.entranceTimer = undefined;
    }, 360);
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
