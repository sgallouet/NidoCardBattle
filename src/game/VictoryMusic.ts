import victoryDawnOverTheHexfieldUrl from '../../assets/game/audio/music/music-victory-02-dawn-over-the-hexfield.mp3?url';
import victoryGraveFallsSilentUrl from '../../assets/game/audio/music/music-victory-04-the-grave-falls-silent.mp3?url';

export const VICTORY_MUSIC_TRACKS: readonly string[] = [
  victoryDawnOverTheHexfieldUrl,
  victoryGraveFallsSilentUrl,
];

export interface VictoryMusicAudio {
  currentTime: number;
  loop: boolean;
  preload: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
}

export type VictoryMusicAudioFactory = (src: string) => VictoryMusicAudio;

export const DEFAULT_VICTORY_MUSIC_VOLUME = 0.34;
const createAudio: VictoryMusicAudioFactory = (src) => new Audio(src);

export class VictoryMusicDirector {
  private audio: VictoryMusicAudio | null = null;

  constructor(
    private readonly tracks: readonly string[] = VICTORY_MUSIC_TRACKS,
    private readonly audioFactory: VictoryMusicAudioFactory = createAudio,
    private readonly random: () => number = Math.random,
  ) {
    if (tracks.length === 0) throw new Error('Victory music requires at least one track.');
  }

  play(): void {
    this.stop();
    const roll = this.random();
    const normalized = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0;
    const index = Math.min(this.tracks.length - 1, Math.floor(normalized * this.tracks.length));
    const audio = this.audioFactory(this.tracks[index]);
    audio.loop = false;
    audio.preload = 'auto';
    audio.volume = DEFAULT_VICTORY_MUSIC_VOLUME;
    this.audio = audio;
    void audio.play().catch(() => undefined);
  }

  stop(): void {
    this.audio?.pause();
    if (this.audio) this.audio.currentTime = 0;
    this.audio = null;
  }

  dispose(): void {
    this.stop();
  }
}
