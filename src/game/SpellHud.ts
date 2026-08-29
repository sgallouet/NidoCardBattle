import type Phaser from 'phaser';
import { SPELL_UI, isActiveSpellId, type ActiveSpellId } from '../data/spellArt';
import type { Coord, GameState, UnitState } from '../data/types';
import type { AbilityVfxEvent } from './AbilityVfxAnimator';
import {
  coordKey,
  curseUnit,
  findUnit,
  getCurseTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getRallyTargets,
  getSoulLinkTargets,
  getThunderTargetCoords,
  neighbors,
  rallyAdjacentAllies,
  sameCoord,
  soulLinkUnit,
  thunderAtCoord,
  unitAt,
  unitDefinition,
} from './engine';
import './SpellHud.css';

interface HighlightSets {
  move: Set<string>;
  attack: Set<string>;
  summon: Set<string>;
  selected: Set<string>;
}

export interface SpellHudSceneInternals {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  displaceTargetId: string | null;
  mode: string | null;
  renderAll: () => void;
  renderHud: () => void;
  highlights: () => HighlightSets;
  handleHexClick: (coord: Coord) => Promise<void>;
  beginDisplace: () => void;
  playAbilityThunder: () => void;
  presentAbilityVfx: (event: AbilityVfxEvent) => Promise<void>;
  setAnimationLock: (locked: boolean) => void;
}

export class SpellHud {
  private dock?: HTMLDivElement;
  private copy?: HTMLDivElement;
  private title?: HTMLSpanElement;
  private description?: HTMLSpanElement;
  private cooldown?: HTMLDivElement;
  private button?: HTMLButtonElement;
  private invokeButton?: HTMLButtonElement;
  private originalButtonParent?: HTMLElement;
  private originalInvokeButtonParent?: HTMLElement;
  private currentSpell?: ActiveSpellId;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: SpellHudSceneInternals,
  ) {}

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    const button = document.querySelector<HTMLButtonElement>('#ability-button');
    const invokeButton = document.querySelector<HTMLButtonElement>('#invoke-button');
    if (!app || !button) return;

    this.originalButtonParent = button.parentElement ?? undefined;
    this.originalInvokeButtonParent = invokeButton?.parentElement ?? undefined;
    this.button = button;
    this.invokeButton = invokeButton ?? undefined;
    if (invokeButton) {
      const image = document.createElement('img');
      image.src = SPELL_UI.InvokeBeast.art;
      image.alt = '';
      image.draggable = false;
      const label = document.createElement('span');
      label.textContent = SPELL_UI.InvokeBeast.name;
      invokeButton.className = 'spell-button invoke-spell-button';
      invokeButton.replaceChildren(image, label);
      invokeButton.setAttribute('aria-label', `${SPELL_UI.InvokeBeast.name}. ${SPELL_UI.InvokeBeast.description}`);
      invokeButton.title = `${SPELL_UI.InvokeBeast.name} — ${SPELL_UI.InvokeBeast.description}`;
    }
    this.buildDock(app, button, invokeButton ?? undefined);

    const originalBeginAbility = this.game.beginDisplace.bind(this.scene);
    const originalHighlights = this.game.highlights.bind(this.scene);
    const originalHandleHexClick = this.game.handleHexClick.bind(this.scene);
    const originalRenderHud = this.game.renderHud.bind(this.scene);

    this.game.beginDisplace = () => this.beginAbility(originalBeginAbility);
    this.game.highlights = () => {
      const highlight = originalHighlights();
      const selected = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
      if (!selected) return highlight;

      if (this.game.mode === 'rally-target') {
        for (const target of getRallyTargets(this.game.state, selected.id)) {
          highlight.summon.add(coordKey(target.coord));
        }
      } else if (this.game.mode === 'soul-link-target') {
        for (const target of getSoulLinkTargets(this.game.state, selected.id)) {
          highlight.summon.add(coordKey(target.coord));
        }
      } else if (this.game.mode === 'curse-target') {
        for (const target of getCurseTargets(this.game.state, selected.id)) {
          highlight.attack.add(coordKey(target.coord));
        }
      } else if (this.game.mode === 'thunder-target') {
        for (const target of getThunderTargetCoords(this.game.state, selected.id)) {
          highlight.attack.add(coordKey(target));
        }
      }
      return highlight;
    };
    this.game.handleHexClick = async (coord: Coord) => {
      const selected = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
      if (this.game.mode === 'rally-target' && selected) {
        const occupant = unitAt(this.game.state, coord);
        const valid = occupant
          && getRallyTargets(this.game.state, selected.id).some((target) => target.id === occupant.id);
        if (valid) await this.castRally(selected.id);
        else {
          this.game.message = 'Choose a highlighted ally, or tap Rally again to cast.';
          this.game.renderAll();
        }
        return;
      }
      if (this.game.mode === 'soul-link-target' && selected) {
        const occupant = unitAt(this.game.state, coord);
        const source = { ...selected.coord };
        const target = occupant ? { ...occupant.coord } : undefined;
        const result = occupant
          ? soulLinkUnit(this.game.state, selected.id, occupant.id)
          : { ok: false, message: 'Choose a highlighted adjacent Undead ally.' };
        this.game.message = result.message;
        if (result.ok) this.game.mode = 'unit';
        if (result.ok && target) await this.present({ kind: 'soulLink', source, target });
        else this.game.renderAll();
        return;
      }
      if (this.game.mode === 'curse-target' && selected) {
        const occupant = unitAt(this.game.state, coord);
        const source = { ...selected.coord };
        const target = occupant ? { ...occupant.coord } : undefined;
        const result = occupant
          ? curseUnit(this.game.state, selected.id, occupant.id)
          : { ok: false, message: 'Choose a highlighted enemy within Curse range.' };
        this.game.message = result.message;
        if (result.ok) this.game.mode = 'unit';
        if (result.ok && target) await this.present({ kind: 'curse', source, target });
        else this.game.renderAll();
        return;
      }
      if (this.game.mode === 'thunder-target' && selected) {
        const valid = getThunderTargetCoords(this.game.state, selected.id)
          .some((target) => sameCoord(target, coord));
        const result = valid
          ? thunderAtCoord(this.game.state, selected.id, coord)
          : { ok: false, message: 'Choose a highlighted battlefield hex within Thunder range.' };
        this.game.message = result.message;
        if (result.ok) this.game.mode = 'unit';
        if (result.ok) {
          this.game.playAbilityThunder();
          await this.present({
            kind: 'thunder',
            destination: { ...coord },
            affected: [{ ...coord }, ...neighbors(coord).map((neighbor) => ({ ...neighbor }))],
          });
        } else this.game.renderAll();
        return;
      }
      await originalHandleHexClick(coord);
    };
    this.game.renderHud = () => {
      originalRenderHud();
      this.sync();
    };

    this.scene.events.once('shutdown', () => this.destroy());
  }

  private buildDock(app: HTMLElement, button: HTMLButtonElement, invokeButton?: HTMLButtonElement): void {
    const dock = document.createElement('div');
    dock.className = 'spell-dock';
    dock.hidden = true;

    const copy = document.createElement('div');
    copy.className = 'spell-copy';
    copy.hidden = true;
    const title = document.createElement('span');
    title.className = 'spell-name';
    const description = document.createElement('span');
    description.className = 'spell-description';
    copy.append(title, description);

    button.className = 'spell-button';
    button.type = 'button';
    button.hidden = false;

    const cooldown = document.createElement('div');
    cooldown.className = 'spell-cooldown';

    const actions = document.createElement('div');
    actions.className = 'spell-actions';
    actions.append(button);
    if (invokeButton) actions.append(invokeButton);

    dock.append(copy, actions, cooldown);
    app.append(dock);

    this.dock = dock;
    this.copy = copy;
    this.title = title;
    this.description = description;
    this.cooldown = cooldown;
  }

  private beginAbility(originalBeginAbility: () => void): void {
    if (this.game.animationInProgress) return;
    const selected = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
    const ability = selected?.owner === this.game.state.currentPlayer
      ? unitDefinition(selected).ability
      : undefined;
    if (!selected || !isActiveSpellId(ability)) {
      originalBeginAbility();
      return;
    }

    if (this.isTargeting(ability)) {
      if (ability === 'Rally' && this.game.mode === 'rally-target') {
        void this.castRally(selected.id);
        return;
      }
      this.game.displaceTargetId = null;
      this.game.mode = 'unit';
      this.game.message = `${SPELL_UI[ability].name} targeting cancelled.`;
      this.game.renderAll();
      return;
    }

    if (ability === 'Rally') {
      const targets = getRallyTargets(this.game.state, selected.id);
      if (targets.length === 0) {
        this.game.message = 'No adjacent ally can benefit from Rally.';
        this.game.renderAll();
        return;
      }
      this.game.mode = 'rally-target';
      this.game.message = 'Rally will affect the highlighted allies.';
      this.game.renderAll();
      return;
    }

    if (ability === 'SoulLink') {
      const targets = getSoulLinkTargets(this.game.state, selected.id);
      if (targets.length === 0) {
        this.game.message = 'No adjacent Undead ally can receive Soul Link.';
        this.game.renderAll();
        return;
      }
      this.game.mode = 'soul-link-target';
      this.game.message = 'Choose a highlighted adjacent Undead ally for Soul Link.';
      this.game.renderAll();
      return;
    }

    if (ability === 'Curse') {
      const targets = getCurseTargets(this.game.state, selected.id);
      if (targets.length === 0) {
        this.game.message = 'No enemy is within Curse range.';
        this.game.renderAll();
        return;
      }
      this.game.mode = 'curse-target';
      this.game.message = 'Choose a highlighted enemy to Curse.';
      this.game.renderAll();
      return;
    }

    if (ability === 'Thunder') {
      const targets = getThunderTargetCoords(this.game.state, selected.id);
      if (targets.length === 0) {
        this.game.message = 'No battlefield hex is within Thunder range.';
        this.game.renderAll();
        return;
      }
      this.game.mode = 'thunder-target';
      this.game.message = 'Choose a highlighted hex. Thunder deals 1 damage there and to all adjacent units, allies included.';
      this.game.renderAll();
      return;
    }

    originalBeginAbility();
  }

  private async castRally(actorId: string): Promise<void> {
    const actor = findUnit(this.game.state, actorId);
    const targets = actor ? getRallyTargets(this.game.state, actorId).map((unit) => ({ ...unit.coord })) : [];
    const result = rallyAdjacentAllies(this.game.state, actorId);
    this.game.message = result.message;
    if (result.ok) this.game.mode = 'unit';
    if (result.ok && actor) {
      await this.present({
        kind: 'rally',
        source: { ...actor.coord },
        targets,
        owner: actor.owner,
      });
    } else this.game.renderAll();
  }

  private async present(event: AbilityVfxEvent): Promise<void> {
    this.game.setAnimationLock(true);
    try {
      await this.game.presentAbilityVfx(event);
    } finally {
      this.game.renderAll();
      this.game.setAnimationLock(false);
    }
  }

  private isTargeting(ability: ActiveSpellId): boolean {
    if (ability === 'Displace') {
      return this.game.mode === 'displace-target' || this.game.mode === 'displace-destination';
    }
    if (ability === 'SoulLink') return this.game.mode === 'soul-link-target';
    if (ability === 'Curse') return this.game.mode === 'curse-target';
    if (ability === 'Thunder') return this.game.mode === 'thunder-target';
    return this.game.mode === 'rally-target';
  }

  private hasLegalTarget(unit: UnitState, ability: ActiveSpellId): boolean {
    if (ability === 'Displace') {
      return getDisplaceTargets(this.game.state, unit.id)
        .some((target) => getDisplaceDestinations(this.game.state, unit.id, target.id).length > 0);
    }
    if (ability === 'Rally') return getRallyTargets(this.game.state, unit.id).length > 0;
    if (ability === 'SoulLink') return getSoulLinkTargets(this.game.state, unit.id).length > 0;
    if (ability === 'Thunder') return getThunderTargetCoords(this.game.state, unit.id).length > 0;
    return getCurseTargets(this.game.state, unit.id).length > 0;
  }

  private sync(): void {
    if (!this.dock || !this.button || !this.copy || !this.title || !this.description || !this.cooldown) return;

    const selected = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
    const ability = selected?.owner === this.game.state.currentPlayer
      ? unitDefinition(selected).ability
      : undefined;
    if (!selected || !isActiveSpellId(ability)) {
      this.dock.hidden = true;
      return;
    }

    const ui = SPELL_UI[ability];
    const targeting = this.isTargeting(ability);
    const used = selected.exhausted
      || selected.attacked
      || this.game.state.winner !== null
      || this.game.animationInProgress;
    const hasTarget = targeting || this.hasLegalTarget(selected, ability);
    const blocked = !used && !hasTarget;

    this.dock.hidden = false;
    this.dock.style.setProperty('--spell-accent', ui.accent);
    this.dock.dataset.state = used ? 'used' : blocked ? 'blocked' : targeting ? 'targeting' : 'ready';
    this.button.hidden = false;
    this.button.disabled = used || blocked;
    this.button.classList.toggle('targeting', targeting);
    this.button.setAttribute('aria-pressed', targeting ? 'true' : 'false');
    this.button.setAttribute('aria-label', `${ui.name}. ${ui.description}`);
    this.button.title = `${ui.name} — ${ui.description}`;

    if (this.currentSpell !== ability) {
      const image = document.createElement('img');
      image.src = ui.art;
      image.alt = '';
      image.draggable = false;
      this.button.replaceChildren(image);
      this.currentSpell = ability;
    }

    this.title.textContent = ui.name;
    this.description.textContent = ability === 'Rally' && targeting
      ? `${ui.description} Tap again or tap a highlighted ally to cast.`
      : ui.description;
    this.copy.hidden = !targeting;
    this.cooldown.textContent = used ? 'USED' : blocked ? 'NO TARGET' : targeting ? 'TARGETING' : 'READY';
  }

  private destroy(): void {
    if (this.button && this.originalButtonParent) {
      this.button.className = 'secondary';
      this.button.replaceChildren();
      this.originalButtonParent.append(this.button);
    }
    this.dock?.remove();
    if (this.invokeButton) {
      this.invokeButton.className = 'secondary';
      this.invokeButton.textContent = 'Invoke Beast';
      this.invokeButton.removeAttribute('title');
      this.originalInvokeButtonParent?.append(this.invokeButton);
    }
    this.dock = undefined;
    this.button = undefined;
    this.invokeButton = undefined;
    this.originalInvokeButtonParent = undefined;
  }
}
