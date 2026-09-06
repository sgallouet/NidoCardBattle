import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VICTORY_MUSIC_VOLUME,
  VictoryMusicDirector,
  type VictoryMusicAudio,
  VICTORY_MUSIC_TRACKS,
} from './VictoryMusic';

class FakeAudio implements VictoryMusicAudio {
  onended: (() => void) | null = null;
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
  it('hands off to background music once after the result track ends', () => {
    const audio = new FakeAudio('dawn.mp3');
    const director = new VictoryMusicDirector(['dawn.mp3'], () => audio);
    let resumed = 0;
    director.play(() => { resumed += 1; });
    const finish = audio.onended!;
    expect(resumed).toBe(0);
    finish();
    finish();
    expect(resumed).toBe(1);
    expect(audio.onended).toBeNull();
  });

  it('does not resume background music after cancellation or disposal', () => {
    for (const cancel of ['stop', 'dispose'] as const) {
      const audio = new FakeAudio('dawn.mp3');
      const director = new VictoryMusicDirector(['dawn.mp3'], () => audio);
      let resumed = 0;
      director.play(() => { resumed += 1; });
      const finish = audio.onended!;
      director[cancel]();
      finish();
      expect(resumed).toBe(0);
      expect(audio.onended).toBeNull();
    }
  });

  it('exports Dawn as the only accepted victory track', () => {
    expect(VICTORY_MUSIC_TRACKS.map((track) => track.split('/').at(-1))).toEqual([
      'music-victory-02-dawn-over-the-hexfield.mp3',
    ]);
  });

  it('plays one non-looping victory track per committed result', () => {
    const audios: FakeAudio[] = [];
    const director = new VictoryMusicDirector(
      ['dawn.mp3'],
      (src) => {
        const audio = new FakeAudio(src);
        audios.push(audio);
        return audio;
      },
      () => 0.5,
    );

    director.play();

    expect(audios).toHaveLength(1);
    expect(audios[0].src).toBe('dawn.mp3');
    expect(audios[0].loop).toBe(false);
    expect(audios[0].preload).toBe('auto');
    expect(audios[0].volume).toBe(DEFAULT_VICTORY_MUSIC_VOLUME);
    expect(audios[0].playCount).toBe(1);

    director.stop();
    expect(audios[0].pauseCount).toBe(1);
    expect(audios[0].currentTime).toBe(0);
  });
});
