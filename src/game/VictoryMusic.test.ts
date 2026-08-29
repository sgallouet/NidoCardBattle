import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VICTORY_MUSIC_VOLUME,
  VictoryMusicDirector,
  type VictoryMusicAudio,
  VICTORY_MUSIC_TRACKS,
} from './VictoryMusic';

class FakeAudio implements VictoryMusicAudio {
  currentTime = 12;
  loop = true;
  preload = '';
  volume = 1;
  playCount = 0;
  pauseCount = 0;

  constructor(readonly src: string) {}

  play(): Promise<void> {
    this.playCount += 1;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCount += 1;
  }
}

describe('victory music director', () => {
  it('exports the two user-approved victory tracks', () => {
    expect(VICTORY_MUSIC_TRACKS.map((track) => track.split('/').at(-1))).toEqual([
      'music-victory-02-dawn-over-the-hexfield.mp3',
      'music-victory-04-the-grave-falls-silent.mp3',
    ]);
  });

  it('plays one non-looping victory track per committed result', () => {
    const audios: FakeAudio[] = [];
    const director = new VictoryMusicDirector(
      ['dawn.mp3', 'grave.mp3'],
      (src) => {
        const audio = new FakeAudio(src);
        audios.push(audio);
        return audio;
      },
      () => 0.5,
    );

    director.play();

    expect(audios).toHaveLength(1);
    expect(audios[0].src).toBe('grave.mp3');
    expect(audios[0].loop).toBe(false);
    expect(audios[0].preload).toBe('auto');
    expect(audios[0].volume).toBe(DEFAULT_VICTORY_MUSIC_VOLUME);
    expect(audios[0].playCount).toBe(1);

    director.stop();
    expect(audios[0].pauseCount).toBe(1);
    expect(audios[0].currentTime).toBe(0);
  });
});
