import Phaser from 'phaser';
import outdoorUrl from '../../assets/source/sscap/Outdoor.png?url';
import cliffsUrl from '../../assets/source/sscap/cliffs.png?url';
import mountainsUrl from '../../assets/source/sscap/mountains v2.png?url';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { CardDefinition, Coord, PlayerId, Terrain, UnitState } from '../data/types';
import {
  attackUnit,
  coordKey,
  createGameState,
  displaceUnit,
  effectiveRange,
  endTurn,
  findUnit,
  getAttackTargets,
  getDisplaceDestinations,
  getDisplaceTargets,
  getReachableCoords,
  getTacticTargets,
  getValidSummonCoords,
  moveUnit,
  playTacticCard,
  playUnitCard,
  terrainAt,
  unitAt,
  unitDefinition,
} from './engine';

const HEX_SIZE = 33;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const ORIGIN_X = 55;
const ORIGIN_Y = 58;
const PLAYER_COLORS: Record<PlayerId, number> = { 1: 0x62b6ff, 2: 0xef6a76 };
const TERRAIN_COLORS: Record<Terrain, number> = {
  plain: 0x657a49,
  forest: 0x36583b,
  hill: 0x786443,
  water: 0x276e93,
  cliff: 0x4f5158,
};

type InteractionMode = 'unit' | 'card' | 'displace-target' | 'displace-destination' | null;

export class GameScene extends Phaser.Scene {
  private state = createGameState();
  private boardLayer?: Phaser.GameObjects.Container;
  private selectedUnitId: string | null = null;
  private selectedCardIndex: number | null = null;
  private displaceTargetId: string | null = null;
  private mode: InteractionMode = null;
  private message = 'Player 1 begins. Move a unit or play a card.';

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('sscap-outdoor', outdoorUrl);
    this.load.image('sscap-cliffs', cliffsUrl);
    this.load.image('sscap-mountains', mountainsUrl);
  }

  create(): void {
    this.createAssetFrames();
    document.querySelector<HTMLButtonElement>('#end-turn-button')?.addEventListener('click', () => this.handleEndTurn());
    document.querySelector<HTMLButtonElement>('#cancel-button')?.addEventListener('click', () => this.cancelInteraction('Selection cleared.'));
    document.querySelector<HTMLButtonElement>('#ability-button')?.addEventListener('click', () => this.beginDisplace());
    this.renderAll();
  }

  private createAssetFrames(): void {
    const outdoor = this.textures.get('sscap-outdoor');
    if (!outdoor.has('tree')) outdoor.add('tree', 0, 160, 224, 64, 96);
    if (!outdoor.has('fort')) outdoor.add('fort', 0, 240, 224, 80, 64);
    const cliffs = this.textures.get('sscap-cliffs');
    if (!cliffs.has('cliff-mark')) cliffs.add('cliff-mark', 0, 0, 0, 96, 64);
    const mountains = this.textures.get('sscap-mountains');
    if (!mountains.has('hill-mark')) mountains.add('hill-mark', 0, 0, 128, 160, 96);
  }

  private center(coord: Coord): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      ORIGIN_X + coord.q * HEX_WIDTH + (coord.r % 2) * HEX_WIDTH / 2,
      ORIGIN_Y + coord.r * HEX_SIZE * 1.5,
    );
  }

  private hexPoints(center: Phaser.Math.Vector2, inset = 1): Phaser.Geom.Point[] {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = Phaser.Math.DegToRad(60 * index - 30);
      return new Phaser.Geom.Point(
        center.x + (HEX_SIZE - inset) * Math.cos(angle),
        center.y + (HEX_SIZE - inset) * Math.sin(angle),
      );
    });
  }

  private highlights(): { move: Set<string>; attack: Set<string>; summon: Set<string>; selected: Set<string> } {
    const move = new Set<string>();
    const attack = new Set<string>();
    const summon = new Set<string>();
    const selected = new Set<string>();

    const selectedUnit = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (selectedUnit) selected.add(coordKey(selectedUnit.coord));

    if (this.mode === 'unit' && selectedUnit) {
      for (const key of getReachableCoords(this.state, selectedUnit.id).keys()) move.add(key);
      for (const target of getAttackTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? CARD_DEFINITIONS[cardId as CardDefinitionId] : undefined;
      if (card?.type === 'unit') {
        for (const coord of getValidSummonCoords(this.state)) summon.add(coordKey(coord));
      } else if (card?.type === 'tactic') {
        for (const target of getTacticTargets(this.state, card.id)) attack.add(coordKey(target.coord));
      }
    }

    if (this.mode === 'displace-target' && selectedUnit) {
      for (const target of getDisplaceTargets(this.state, selectedUnit.id)) attack.add(coordKey(target.coord));
    }

    if (this.mode === 'displace-destination' && selectedUnit && this.displaceTargetId) {
      for (const coord of getDisplaceDestinations(this.state, selectedUnit.id, this.displaceTargetId)) summon.add(coordKey(coord));
    }

    return { move, attack, summon, selected };
  }

  private renderAll(): void {
    this.renderBoard();
    this.renderHud();
  }

  private renderBoard(): void {
    this.boardLayer?.destroy(true);
    this.boardLayer = this.add.container(0, 0);
    const highlight = this.highlights();

    const backdrop = this.add.rectangle(435, 300, 870, 600, 0x10131a);
    this.boardLayer.add(backdrop);

    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const key = coordKey(coord);
        const center = this.center(coord);
        const points = this.hexPoints(center);
        const hex = this.add.graphics();
        let fill = TERRAIN_COLORS[terrainAt(coord)];
        if (highlight.move.has(key)) fill = 0x3f9f94;
        if (highlight.summon.has(key)) fill = 0xb18b3f;
        if (highlight.attack.has(key)) fill = 0xa13e4c;
        hex.fillStyle(fill, 1);
        hex.fillPoints(points, true);
        const stroke = highlight.selected.has(key) ? 0xffffff : 0x25202c;
        hex.lineStyle(highlight.selected.has(key) ? 4 : 2, stroke, 1);
        hex.strokePoints(points, true);
        hex.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
        hex.on('pointerdown', () => this.handleHexClick(coord));
        this.boardLayer.add(hex);
        this.addTerrainDecoration(coord, center);
      }
    }

    for (const site of this.state.sites) this.addSite(site.coord, site.type, site.owner);
    for (const unit of this.state.units) this.addUnit(unit);

    if (this.state.winner) {
      const shade = this.add.rectangle(435, 300, 870, 600, 0x09070b, 0.72);
      const title = this.add.text(435, 270, `PLAYER ${this.state.winner} WINS`, {
        fontFamily: 'Georgia, serif', fontSize: '44px', color: '#f5d58e', fontStyle: 'bold',
      }).setOrigin(0.5);
      const copy = this.add.text(435, 325, 'The Commander survived all three checkpoints.', {
        fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#f4eee4',
      }).setOrigin(0.5);
      this.boardLayer.add([shade, title, copy]);
    }
  }

  private addTerrainDecoration(coord: Coord, center: Phaser.Math.Vector2): void {
    const terrain = terrainAt(coord);
    let sprite: Phaser.GameObjects.Image | undefined;
    if (terrain === 'forest') sprite = this.add.image(center.x, center.y - 2, 'sscap-outdoor', 'tree').setDisplaySize(28, 42);
    if (terrain === 'hill') sprite = this.add.image(center.x, center.y + 2, 'sscap-mountains', 'hill-mark').setDisplaySize(45, 28);
    if (terrain === 'cliff') sprite = this.add.image(center.x, center.y + 3, 'sscap-cliffs', 'cliff-mark').setDisplaySize(44, 30);
    if (sprite) {
      sprite.setAlpha(0.72);
      this.boardLayer?.add(sprite);
    }
  }

  private addSite(coord: Coord, type: 'keep' | 'fort' | 'well', owner: PlayerId | null): void {
    const center = this.center(coord);
    const ownerColor = owner ? PLAYER_COLORS[owner] : 0xb8abb8;
    const ring = this.add.circle(center.x, center.y, 21, 0x121018, 0.5).setStrokeStyle(3, ownerColor, 1);
    this.boardLayer?.add(ring);

    if (type === 'keep' || type === 'fort') {
      const fort = this.add.image(center.x, center.y - 2, 'sscap-outdoor', 'fort').setDisplaySize(type === 'keep' ? 42 : 34, type === 'keep' ? 34 : 28);
      this.boardLayer?.add(fort);
    }
    const mark = type === 'keep' ? 'K' : type === 'fort' ? 'F' : 'M';
    const label = this.add.text(center.x, center.y + (type === 'well' ? 0 : 18), mark, {
      fontFamily: 'Arial, sans-serif', fontSize: type === 'well' ? '17px' : '10px', color: '#fff6df', fontStyle: 'bold',
      stroke: '#17131b', strokeThickness: 3,
    }).setOrigin(0.5);
    this.boardLayer?.add(label);
  }

  private addUnit(unit: UnitState): void {
    const center = this.center(unit.coord);
    const definition = unitDefinition(unit);
    const selected = unit.id === this.selectedUnitId;
    const shadow = this.add.ellipse(center.x + 2, center.y + 10, 37, 15, 0x08070a, 0.45);
    const token = this.add.circle(center.x, center.y - 1, 19, PLAYER_COLORS[unit.owner], unit.exhausted ? 0.55 : 1)
      .setStrokeStyle(selected ? 4 : 2, selected ? 0xffffff : 0x17131b, 1);
    const mark = this.add.text(center.x, center.y - 3, definition.mark, {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#101018', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hpBack = this.add.rectangle(center.x, center.y + 21, 36, 5, 0x251923);
    const hpWidth = 34 * Math.max(0, unit.hp / definition.maxHp);
    const hp = this.add.rectangle(center.x - 17 + hpWidth / 2, center.y + 21, hpWidth, 3, 0x7ee08a);
    this.boardLayer?.add([shadow, token, mark, hpBack, hp]);
    if (unit.exhausted) {
      const exhausted = this.add.text(center.x + 15, center.y - 18, 'Z', {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#f5e7bd', fontStyle: 'bold',
        backgroundColor: '#43364c', padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      this.boardLayer?.add(exhausted);
    }
  }

  private handleHexClick(coord: Coord): void {
    if (this.state.winner) return;
    const occupant = unitAt(this.state, coord);

    if (this.mode === 'card' && this.selectedCardIndex !== null) {
      const cardId = this.state.players[this.state.currentPlayer].hand[this.selectedCardIndex];
      const card = cardId ? CARD_DEFINITIONS[cardId as CardDefinitionId] : undefined;
      if (!card) return this.cancelInteraction('That card is no longer in hand.');
      const result = card.type === 'unit'
        ? playUnitCard(this.state, this.selectedCardIndex, coord)
        : occupant
          ? playTacticCard(this.state, this.selectedCardIndex, occupant.id)
          : { ok: false, message: 'Choose a highlighted unit.' };
      this.message = result.message;
      if (result.ok) this.clearInteraction();
      return this.renderAll();
    }

    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (this.mode === 'displace-target' && selected) {
      if (!occupant || !getDisplaceTargets(this.state, selected.id).some((unit) => unit.id === occupant.id)) {
        this.message = 'Choose a highlighted adjacent unit.';
      } else {
        this.displaceTargetId = occupant.id;
        this.mode = 'displace-destination';
        this.message = 'Choose a highlighted destination.';
      }
      return this.renderAll();
    }

    if (this.mode === 'displace-destination' && selected && this.displaceTargetId) {
      const result = displaceUnit(this.state, selected.id, this.displaceTargetId, coord);
      this.message = result.message;
      if (result.ok) {
        this.displaceTargetId = null;
        this.mode = 'unit';
      }
      return this.renderAll();
    }

    if (selected && selected.owner === this.state.currentPlayer && occupant?.owner !== this.state.currentPlayer) {
      if (occupant) {
        const result = attackUnit(this.state, selected.id, occupant.id);
        this.message = result.message;
        return this.renderAll();
      }
    }

    if (selected && selected.owner === this.state.currentPlayer && !occupant) {
      const result = moveUnit(this.state, selected.id, coord);
      this.message = result.message;
      return this.renderAll();
    }

    if (occupant) {
      this.selectedUnitId = occupant.id;
      this.selectedCardIndex = null;
      this.displaceTargetId = null;
      this.mode = occupant.owner === this.state.currentPlayer ? 'unit' : null;
      this.message = occupant.owner === this.state.currentPlayer
        ? `${unitDefinition(occupant).name} selected.`
        : `${unitDefinition(occupant).name} belongs to Player ${occupant.owner}.`;
      return this.renderAll();
    }

    this.message = 'Select a unit or card first.';
    this.renderHud();
  }

  private selectCard(index: number): void {
    if (this.state.winner) return;
    if (this.selectedCardIndex === index) return this.cancelInteraction('Card selection cleared.');
    const cardId = this.state.players[this.state.currentPlayer].hand[index];
    const card = CARD_DEFINITIONS[cardId as CardDefinitionId];
    this.selectedCardIndex = index;
    this.selectedUnitId = null;
    this.displaceTargetId = null;
    this.mode = 'card';
    this.message = card.type === 'unit'
      ? `Choose a highlighted spawn hex for ${card.name}.`
      : `Choose a highlighted target for ${card.name}.`;
    this.renderAll();
  }

  private beginDisplace(): void {
    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (!selected || getDisplaceTargets(this.state, selected.id).length === 0) {
      this.message = 'No adjacent unit can be displaced.';
      return this.renderAll();
    }
    this.mode = 'displace-target';
    this.displaceTargetId = null;
    this.message = 'Choose a highlighted adjacent unit to displace.';
    this.renderAll();
  }

  private handleEndTurn(): void {
    const result = endTurn(this.state);
    this.clearInteraction();
    this.message = result.message;
    this.renderAll();
  }

  private clearInteraction(): void {
    this.selectedUnitId = null;
    this.selectedCardIndex = null;
    this.displaceTargetId = null;
    this.mode = null;
  }

  private cancelInteraction(message: string): void {
    this.clearInteraction();
    this.message = message;
    this.renderAll();
  }

  private renderHud(): void {
    const current = this.state.players[this.state.currentPlayer];
    const wells = this.state.sites.filter((site) => site.type === 'well' && site.owner === this.state.currentPlayer).length;
    const turnSummary = document.querySelector<HTMLElement>('#turn-summary');
    if (turnSummary) {
      turnSummary.innerHTML = `<span class="unit-owner-${this.state.currentPlayer}">Player ${this.state.currentPlayer}</span> · Turn ${this.state.turnNumber}<small>${current.mana} mana · ${wells} Mana Well${wells === 1 ? '' : 's'}</small>`;
    }

    const selectedPanel = document.querySelector<HTMLElement>('#selected-unit');
    const selected = this.selectedUnitId ? findUnit(this.state, this.selectedUnitId) : undefined;
    if (selectedPanel) {
      if (!selected) selectedPanel.innerHTML = '<span class="muted">Select a unit on the board.</span>';
      else {
        const definition = unitDefinition(selected);
        const traits = [...definition.traits, ...(definition.ability ? [definition.ability] : [])];
        selectedPanel.innerHTML = `
          <div class="unit-name unit-owner-${selected.owner}">${definition.name}</div>
          <div class="unit-stats">
            <span>HP <strong>${selected.hp}/${definition.maxHp}</strong></span>
            <span>Attack <strong>${definition.attack}</strong></span>
            <span>Move <strong>${definition.move}</strong></span>
            <span>Range <strong>${effectiveRange(selected)}</strong></span>
          </div>
          <div class="traits">${traits.length ? traits.join(' · ') : 'No traits'}${selected.exhausted ? ' · Exhausted' : ''}${selected.moved ? ' · Moved' : ''}${selected.attacked ? ' · Attacked' : ''}</div>`;
      }
    }

    const abilityButton = document.querySelector<HTMLButtonElement>('#ability-button');
    if (abilityButton) {
      const isDisplacer = selected
        && selected.owner === this.state.currentPlayer
        && unitDefinition(selected).ability === 'Displace';
      abilityButton.hidden = !isDisplacer;
      abilityButton.textContent = 'Use Displace';
      abilityButton.disabled = !isDisplacer || selected.exhausted || selected.attacked || this.state.winner !== null;
    }

    const countdown = document.querySelector<HTMLElement>('#countdown');
    if (countdown) {
      if (this.state.winner) countdown.innerHTML = `<span class="winner">Player ${this.state.winner} won.</span>`;
      else if (this.state.countdown) {
        countdown.innerHTML = `<span class="countdown-active">Player ${this.state.countdown.player}: ${this.state.countdown.checkpoints}/3 checkpoints</span>`;
      } else countdown.innerHTML = '<span class="muted">No countdown is active.</span>';
    }

    const status = document.querySelector<HTMLElement>('#status');
    if (status) status.textContent = this.message;
    const endButton = document.querySelector<HTMLButtonElement>('#end-turn-button');
    if (endButton) endButton.disabled = this.state.winner !== null;
    const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-button');
    if (cancelButton) cancelButton.disabled = this.mode === null;
    const deckSummary = document.querySelector<HTMLElement>('#deck-summary');
    if (deckSummary) deckSummary.textContent = `${current.deck.length} deck · ${current.discard.length} discard`;
    this.renderHand();
  }

  private renderHand(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    const player = this.state.players[this.state.currentPlayer];
    hand.replaceChildren();
    player.hand.forEach((cardId, index) => {
      const card = CARD_DEFINITIONS[cardId as CardDefinitionId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `card${this.selectedCardIndex === index ? ' selected' : ''}`;
      button.disabled = card.cost > player.mana || this.state.winner !== null;
      button.innerHTML = `
        <span class="card-cost">${card.cost}</span>
        <span class="card-type">${card.type}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-copy">${this.cardCopy(card)}</span>`;
      button.addEventListener('click', () => this.selectCard(index));
      hand.append(button);
    });
  }

  private cardCopy(card: CardDefinition): string {
    if (card.type === 'unit') {
      const definition = unitDefinition({ definitionId: card.unitId } as UnitState);
      const traits = [...definition.traits, ...(definition.ability ? [definition.ability] : [])].join(', ');
      return `${definition.maxHp} HP · ${definition.attack} ATK · ${definition.move} MOV · ${definition.range} RNG${traits ? `<br>${traits}` : ''}`;
    }
    const verb = card.effect.kind === 'damage' ? 'Deal' : 'Heal';
    return `${verb} ${card.effect.amount} to a ${card.effect.target} unit.`;
  }
}
