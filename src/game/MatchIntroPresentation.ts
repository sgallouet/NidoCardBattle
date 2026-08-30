import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import type { Coord, GameState, UnitState } from '../data/types';
import { ActionFxAnimator } from './ActionFxAnimator';
import { CommanderConfrontation } from './CommanderConfrontation';
import { neighbors } from './engine';
import { buildMapRevealPlan, MAP_REVEAL_DURATION, ownedKeepCoord } from './MatchIntroPlan';
import { loadingScreen } from './LoadingScreen';
import type { AnimatedUnitView } from './UnitMotionAnimator';
import './MatchIntroPresentation.css';

const INTRO_COVER_DEPTH = 50_000;
const INTRO_BEACON_DEPTH = INTRO_COVER_DEPTH + 10;
const COVER_FADE_DURATION = 230;

export interface MatchIntroSceneInternals {
  state: GameState;
  boardLayer?: Phaser.GameObjects.Container;
  renderedUnits: Map<string, AnimatedUnitView>;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
  setAnimationLock: (locked: boolean) => void;
}

export class MatchIntroPresentation {
  private covers = new Map<string, Phaser.GameObjects.Graphics>();
  private guide?: HTMLElement;
  private actionFx?: ActionFxAnimator;
  private commanderConfrontation?: CommanderConfrontation;
  private localKeep?: Coord;
  private localUnits: UnitState[] = [];
  private prepared = false;
  private finished = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: MatchIntroSceneInternals,
  ) {}

  prepare(): boolean {
    if (this.prepared || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const keep = ownedKeepCoord(this.game.state, 1);
    const board = this.game.boardLayer;
    if (!keep || !board) return false;

    this.prepared = true;
    this.localKeep = keep;
    this.localUnits = this.game.state.units.filter((unit) => unit.owner === 1);
    this.actionFx = new ActionFxAnimator(this.scene, () => this.game.boardLayer, this.game.center.bind(this.game));
    this.commanderConfrontation = new CommanderConfrontation(this.scene, this.game);

    document.querySelector<HTMLElement>('#app')?.classList.add('match-intro-active');
    this.game.setAnimationLock(true);
    this.createGuide();
    this.createMapCovers();
    for (const unit of this.localUnits) this.game.renderedUnits.get(unit.id)?.container.setAlpha(0);

    const focus = this.game.center(this.localKeep);
    const camera = this.scene.cameras.main;
    camera.setZoom(Math.min(1.08, Math.max(camera.zoom, 0.94)));
    camera.centerOn(focus.x + 48, focus.y - 18);
    return true;
  }

  async playWhenReady(): Promise<void> {
    if (!this.prepared || !this.localKeep || this.finished) return;
    await this.waitUntilVisible();
    if (this.finished || !this.scene.sys.isActive()) return;

    this.showGuide('01', 'Your Home Keep', 'Your army begins here. Controlled Keeps and Forts are your deployment anchors.', 'keep');
    this.spawnKeepBeacon(this.localKeep);
    await this.revealKeepCluster(this.localKeep);
    await this.wait(430);

    this.showGuide('02', 'The Battlefield', 'Watch the routes unfold: terrain shapes movement, while sites create strategic value.', 'map');
    this.focusCameraOnLocalKeep(MAP_REVEAL_DURATION + 280);
    await this.revealMap(this.localKeep);

    const commander = this.localUnits.find((unit) => unit.definitionId === 'commander');
    if (commander) {
      this.showGuide('03', 'Your Commander', 'This is the heart of your army. Keep their survival in view as the battle develops.', 'commander');
      this.spawnCommanderBeacon(commander.coord);
      await this.revealUnit(commander);
      await this.wait(90);
    }

    const support = this.localUnits.filter((unit) => unit.id !== commander?.id);
    if (support.length > 0) {
      this.showGuide('04', 'Your Starting Army', 'Each unit has a clear job. Read the formation first, then choose who acts.', 'army');
      await Promise.all(support.map(async (unit, index) => {
        if (index > 0) await this.wait(index * 85);
        await this.revealUnit(unit);
      }));
      await this.wait(70);
    }

    const enemyCommander = this.game.state.units.find((unit) => unit.owner === 2 && unit.definitionId === 'commander');
    if (commander && enemyCommander && this.commanderConfrontation) {
      await this.commanderConfrontation.play(enemyCommander, commander);
    }

    this.showGuide('05', 'Your Hand', 'Spend mana to reinforce your army or change the battlefield with a Tactic.', 'hand');
    await this.revealHudAndCards();
    await this.wait(180);
    await this.finish();
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    for (const cover of this.covers.values()) {
      if (cover.active) cover.destroy();
    }
    this.covers.clear();
    for (const unit of this.localUnits) {
      this.game.renderedUnits.get(unit.id)?.container.setAlpha(1).setScale(1);
    }
    this.guide?.classList.add('is-leaving');
    await this.wait(210);
    this.guide?.remove();
    this.guide = undefined;
    this.commanderConfrontation?.destroy();
    this.commanderConfrontation = undefined;
    const app = document.querySelector<HTMLElement>('#app');
    app?.classList.remove('match-intro-active', 'match-intro-hud-visible', 'match-intro-dialogue-active');
    this.game.setAnimationLock(false);
  }

  destroy(): void {
    this.finished = true;
    for (const cover of this.covers.values()) {
      if (cover.active) cover.destroy();
    }
    this.covers.clear();
    this.commanderConfrontation?.destroy();
    this.commanderConfrontation = undefined;
    this.guide?.remove();
    this.guide = undefined;
    document.querySelector<HTMLElement>('#app')?.classList.remove(
      'match-intro-active',
      'match-intro-hud-visible',
      'match-intro-dialogue-active',
    );
  }

  private createMapCovers(): void {
    const board = this.game.boardLayer;
    if (!board) return;
    for (let r = 0; r < MAP_HEIGHT; r += 1) {
      for (let q = 0; q < MAP_WIDTH; q += 1) {
        const coord = { q, r };
        const center = this.game.center(coord);
        const points = this.game.hexPoints(center, -1)
          .map((point) => new Phaser.Geom.Point(point.x - center.x, point.y - center.y));
        const cover = this.scene.add.graphics()
          .setPosition(center.x, center.y)
          .setDepth(INTRO_COVER_DEPTH);
        cover.fillStyle(0x020914, 0.985);
        cover.fillPoints(points, true);
        cover.lineStyle(2, 0x2c8290, 0.34);
        cover.strokePoints(points, true);
        cover.lineStyle(1, 0x6ce9f5, 0.13);
        cover.strokeCircle(0, 0, 11 + ((q * 3 + r * 5) % 8));
        for (let mark = 0; mark < 3; mark += 1) {
          const x = -19 + ((q * 13 + r * 7 + mark * 17) % 38);
          const y = -25 + ((q * 5 + r * 19 + mark * 13) % 50);
          cover.fillStyle(mark === 1 ? 0x6ce9f5 : 0x24707d, mark === 1 ? 0.2 : 0.13);
          cover.fillRect(x, y, mark === 1 ? 2 : 1, 7 + ((q + r + mark) % 11));
        }
        board.add(cover);
        this.covers.set(this.key(coord), cover);
      }
    }
    board.sort('depth');
  }

  private async revealKeepCluster(origin: Coord): Promise<void> {
    const cluster = [origin, ...neighbors(origin)];
    await Promise.all(cluster.map((coord, index) => this.revealCover(coord, 340 + index * 26)));
  }

  private async revealMap(origin: Coord): Promise<void> {
    const plan = buildMapRevealPlan(origin);
    for (const step of plan) {
      const cover = this.covers.get(this.key(step.coord));
      if (!cover?.active) continue;
      this.scene.time.delayedCall(step.delay, () => void this.revealCover(step.coord, COVER_FADE_DURATION));
    }
    const lastDelay = plan.at(-1)?.delay ?? MAP_REVEAL_DURATION;
    await this.wait(lastDelay + COVER_FADE_DURATION + 120);
  }

  private revealCover(coord: Coord, duration: number): Promise<void> {
    const cover = this.covers.get(this.key(coord));
    if (!cover?.active) return Promise.resolve();
    this.covers.delete(this.key(coord));
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: cover,
        alpha: 0,
        scaleX: 0.76,
        scaleY: 0.76,
        duration,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          cover.destroy();
          resolve();
        },
      });
    });
  }

  private async revealUnit(unit: UnitState): Promise<void> {
    const view = this.game.renderedUnits.get(unit.id);
    if (!view || !this.actionFx) return;
    await this.actionFx.summon(view, unit.owner);
  }

  private spawnKeepBeacon(coord: Coord): void {
    const center = this.game.center(coord);
    const color = this.game.state.players[1].faction === 'human' ? 0x55b9f3 : 0xb76cff;
    const beacon = this.scene.add.graphics()
      .setPosition(center.x, center.y)
      .setDepth(INTRO_BEACON_DEPTH)
      .setScale(0.55);
    beacon.fillStyle(color, 0.16);
    beacon.fillCircle(0, 0, 47);
    beacon.lineStyle(5, color, 0.95);
    beacon.strokeCircle(0, 0, 44);
    beacon.lineStyle(2, 0xe9fbff, 0.82);
    beacon.strokeCircle(0, 0, 34);
    for (let index = 0; index < 6; index += 1) {
      const angle = Phaser.Math.DegToRad(index * 60 - 30);
      beacon.lineStyle(2, 0xbff7ff, 0.8);
      beacon.lineBetween(Math.cos(angle) * 49, Math.sin(angle) * 49, Math.cos(angle) * 63, Math.sin(angle) * 63);
    }
    this.game.boardLayer?.add(beacon);
    this.scene.tweens.add({
      targets: beacon,
      alpha: 0,
      scaleX: 1.48,
      scaleY: 1.48,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => beacon.destroy(),
    });
  }

  private spawnCommanderBeacon(coord: Coord): void {
    const center = this.game.center(coord);
    const beacon = this.scene.add.graphics()
      .setPosition(center.x, center.y)
      .setDepth(INTRO_BEACON_DEPTH)
      .setAlpha(0);
    beacon.fillStyle(0x77dcff, 0.17);
    beacon.fillRect(-25, -92, 50, 118);
    beacon.lineStyle(3, 0x77dcff, 0.82);
    beacon.strokeCircle(0, 13, 35);
    beacon.lineStyle(1.5, 0xe5fbff, 0.75);
    beacon.strokeCircle(0, 13, 27);
    this.game.boardLayer?.add(beacon);
    this.scene.tweens.add({
      targets: beacon,
      alpha: { from: 0, to: 1 },
      duration: 150,
      yoyo: true,
      hold: 180,
      ease: 'Sine.easeOut',
      onComplete: () => beacon.destroy(),
    });
  }

  private async revealHudAndCards(): Promise<void> {
    const app = document.querySelector<HTMLElement>('#app');
    const surfaces = [...document.querySelectorAll<HTMLElement>('.card-surface')];
    for (const surface of surfaces) surface.style.opacity = '0';
    app?.classList.add('match-intro-hud-visible');
    await this.wait(65);

    const animations = surfaces.map((surface, index) => {
      const animation = surface.animate([
        {
          opacity: 0,
          transform: 'perspective(1000px) translate3d(0, 145px, -80px) rotateX(34deg) scale(.72)',
          filter: 'brightness(.58) saturate(.7)',
        },
        {
          offset: 0.72,
          opacity: 1,
          transform: 'perspective(1000px) translate3d(0, -10px, 20px) rotateX(-3deg) scale(1.035)',
          filter: 'brightness(1.18) saturate(1.12)',
        },
        {
          opacity: 1,
          transform: 'perspective(1000px) translate3d(0, 0, 0) rotateX(0deg) scale(1)',
          filter: 'brightness(1) saturate(1)',
        },
      ], {
        duration: 440,
        delay: index * 55,
        easing: 'cubic-bezier(.16,.82,.22,1)',
        fill: 'forwards',
      });
      return animation.finished.finally(() => {
        surface.style.removeProperty('opacity');
        animation.cancel();
      });
    });
    await Promise.all(animations);
  }

  private createGuide(): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;
    const guide = document.createElement('div');
    guide.className = 'match-intro-guide';
    guide.setAttribute('role', 'status');
    guide.setAttribute('aria-live', 'polite');
    guide.innerHTML = `
      <span class="match-intro-step"></span>
      <div class="match-intro-copy">
        <strong></strong>
        <p></p>
      </div>
      <span class="match-intro-progress" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i>
      </span>`;
    app.append(guide);
    this.guide = guide;
  }

  private showGuide(step: string, title: string, detail: string, phase: string): void {
    if (!this.guide) return;
    this.guide.dataset.phase = phase;
    const stepElement = this.guide.querySelector<HTMLElement>('.match-intro-step');
    const titleElement = this.guide.querySelector<HTMLElement>('strong');
    const detailElement = this.guide.querySelector<HTMLElement>('p');
    if (stepElement) stepElement.textContent = step;
    if (titleElement) titleElement.textContent = title;
    if (detailElement) detailElement.textContent = detail;
    const activeIndex = Math.max(0, Number(step) - 1);
    this.guide.querySelectorAll<HTMLElement>('.match-intro-progress i').forEach((marker, index) => {
      marker.classList.toggle('is-active', index <= activeIndex);
    });
    this.guide.classList.remove('is-updating');
    void this.guide.offsetWidth;
    this.guide.classList.add('is-updating');
  }

  private focusCameraOnLocalKeep(duration: number): void {
    if (!this.localKeep) return;
    const focus = this.game.center(this.localKeep);
    this.scene.cameras.main.pan(focus.x, focus.y, duration, 'Sine.easeInOut');
  }

  private async waitUntilVisible(): Promise<void> {
    await loadingScreen.whenBattlefieldReady();
    if (this.finished || !this.scene.sys.isActive()) return;
    await this.wait(100);
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }

  private key(coord: Coord): string {
    return `${coord.q},${coord.r}`;
  }
}
