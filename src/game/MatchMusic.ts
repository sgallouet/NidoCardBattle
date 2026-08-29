import battleBladesBeneathBannerUrl from '../../assets/game/audio/music/battle-blades-beneath-banner.mp3?url';
import battleCavalryThroughTheStormUrl from '../../assets/game/audio/music/battle-cavalry-through-the-storm.mp3?url';
import battleChampionsAgainstFateUrl from '../../assets/game/audio/music/battle-champions-against-fate.mp3?url';
import battleCrimsonBridgeUrl from '../../assets/game/audio/music/battle-crimson-bridge.mp3?url';
import battleHeroicLastStandUrl from '../../assets/game/audio/music/battle-heroic-last-stand.mp3?url';
import battleHoldTheCastleGateUrl from '../../assets/game/audio/music/battle-hold-the-castle-gate.mp3?url';
import battleIronOathUnbrokenUrl from '../../assets/game/audio/music/battle-iron-oath-unbroken.mp3?url';
import battleKingdomsCounterattackUrl from '../../assets/game/audio/music/battle-kingdoms-counterattack.mp3?url';
import battleOathOfTheFallenCrownUrl from '../../assets/game/audio/music/battle-oath-of-the-fallen-crown.mp3?url';
import battleShortUrl from '../../assets/game/audio/music/battle-short.mp3?url';
import battleTitanHuntUrl from '../../assets/game/audio/music/battle-titan-hunt.mp3?url';
import battleVanguardAtDaybreakUrl from '../../assets/game/audio/music/battle-vanguard-at-daybreak.mp3?url';
import battleWyvernRidersChargeUrl from '../../assets/game/audio/music/battle-wyvern-riders-charge.mp3?url';

export const MATCH_MUSIC_TRACKS: readonly string[] = [
  battleShortUrl,
  battleHeroicLastStandUrl,
  battleTitanHuntUrl,
  battleKingdomsCounterattackUrl,
  battleHoldTheCastleGateUrl,
  battleCavalryThroughTheStormUrl,
  battleOathOfTheFallenCrownUrl,
  battleChampionsAgainstFateUrl,
  battleVanguardAtDaybreakUrl,
  battleBladesBeneathBannerUrl,
  battleCrimsonBridgeUrl,
  battleWyvernRidersChargeUrl,
  battleIronOathUnbrokenUrl,
];

export interface MatchMusicAudio {
  currentTime: number;
  loop: boolean;
  preload: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
}

export type MatchMusicAudioFactory = (src: string) => MatchMusicAudio;

const MATCH_MUSIC_VOLUME = 0.25;
const createAudio: MatchMusicAudioFactory = (src) => new Audio(src);

export const isMatchMusicEnabled = (search: string): boolean => (
  new URLSearchParams(search).get('music') !== 'off'
);

export class MatchMusicDirector {
  private audio: MatchMusicAudio | null = null;
  private started = false;
  private unlockArmed = false;

  constructor(
    private readonly tracks: readonly string[] = MATCH_MUSIC_TRACKS,
    private readonly audioFactory: MatchMusicAudioFactory = createAudio,
    private readonly unlockTarget: EventTarget | null = typeof window === 'undefined' ? null : window,
    private readonly random: () => number = Math.random,
  ) {
    if (tracks.length === 0) throw new Error('Match music requires at least one track.');
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const roll = this.random();
    const normalized = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0;
    const index = Math.min(this.tracks.length - 1, Math.floor(normalized * this.tracks.length));
    this.audio = this.audioFactory(this.tracks[index]);
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = MATCH_MUSIC_VOLUME;
    this.tryPlay();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.disarmUnlock();
    this.audio?.pause();
    if (this.audio) this.audio.currentTime = 0;
  }

  dispose(): void {
    this.stop();
    this.audio = null;
  }

  private tryPlay(): void {
    const audio = this.audio;
    if (!this.started || !audio) return;
    void audio.play()
      .then(() => {
        if (this.started && this.audio === audio) this.disarmUnlock();
      })
      .catch(() => {
        if (this.started && this.audio === audio) this.armUnlock();
      });
  }

  private readonly unlockPlayback = (): void => this.tryPlay();

  private armUnlock(): void {
    if (this.unlockArmed || !this.unlockTarget) return;
    this.unlockArmed = true;
    this.unlockTarget.addEventListener('pointerdown', this.unlockPlayback);
    this.unlockTarget.addEventListener('keydown', this.unlockPlayback);
    this.unlockTarget.addEventListener('touchstart', this.unlockPlayback);
  }

  private disarmUnlock(): void {
    if (!this.unlockArmed || !this.unlockTarget) return;
    this.unlockArmed = false;
    this.unlockTarget.removeEventListener('pointerdown', this.unlockPlayback);
    this.unlockTarget.removeEventListener('keydown', this.unlockPlayback);
    this.unlockTarget.removeEventListener('touchstart', this.unlockPlayback);
  }
}
