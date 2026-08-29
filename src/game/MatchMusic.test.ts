import { describe, expect, it } from 'vitest';
import {
  MATCH_MUSIC_TRACKS,
  MatchMusicDirector,
  isMatchMusicEnabled,
  type MatchMusicAudio,
} from './MatchMusic';

class FakeAudio implements MatchMusicAudio {
  currentTime = 12;
  loop = false;
  preload = '';
  volume = 1;
  playCount = 0;
  pauseCount = 0;
  rejectPlay = false;

  constructor(readonly src: string) {}

  play(): Promise<void> {
    this.playCount += 1;
    return this.rejectPlay ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve();
  }

  pause(): void {
    this.pauseCount += 1;
  }
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('match music director', () => {
  it('exports the complete WorldXplore battle playlist', () => {
    expect(MATCH_MUSIC_TRACKS).toHaveLength(13);
    expect(MATCH_MUSIC_TRACKS.map((track) => track.split('/').at(-1))).toEqual([
      'battle-short.mp3',
      'battle-heroic-last-stand.mp3',
      'battle-titan-hunt.mp3',
      'battle-kingdoms-counterattack.mp3',
      'battle-hold-the-castle-gate.mp3',
      'battle-cavalry-through-the-storm.mp3',
      'battle-oath-of-the-fallen-crown.mp3',
      'battle-champions-against-fate.mp3',
      'battle-vanguard-at-daybreak.mp3',
      'battle-blades-beneath-banner.mp3',
      'battle-crimson-bridge.mp3',
      'battle-wyvern-riders-charge.mp3',
      'battle-iron-oath-unbroken.mp3',
    ]);
  });

  it('selects and loops one authored track beneath gameplay audio', () => {
    const audios: FakeAudio[] = [];
    const director = new MatchMusicDirector(
      ['first.mp3', 'second.mp3', 'third.mp3'],
      (src) => {
        const audio = new FakeAudio(src);
        audios.push(audio);
        return audio;
      },
      null,
      () => 0.5,
    );

    director.start();

    expect(audios).toHaveLength(1);
    expect(audios[0].src).toBe('second.mp3');
    expect(audios[0].loop).toBe(true);
    expect(audios[0].preload).toBe('auto');
    expect(audios[0].volume).toBe(0.25);
    expect(audios[0].playCount).toBe(1);

    director.stop();
    expect(audios[0].pauseCount).toBe(1);
    expect(audios[0].currentTime).toBe(0);
  });

  it('retries playback on the first user gesture after autoplay is blocked', async () => {
    const target = new EventTarget();
    const audio = new FakeAudio('battle.mp3');
    audio.rejectPlay = true;
    const director = new MatchMusicDirector(['battle.mp3'], () => audio, target);

    director.start();
    await flushPromises();
    expect(audio.playCount).toBe(1);

    audio.rejectPlay = false;
    target.dispatchEvent(new Event('pointerdown'));
    await flushPromises();
    expect(audio.playCount).toBe(2);

    target.dispatchEvent(new Event('pointerdown'));
    expect(audio.playCount).toBe(2);
  });

  it('fails clearly when no match tracks are configured', () => {
    expect(() => new MatchMusicDirector([], () => new FakeAudio('unused.mp3'), null)).toThrow(
      'Match music requires at least one track.',
    );
  });

  it('supports the WorldXplore music-off query switch', () => {
    expect(isMatchMusicEnabled('')).toBe(true);
    expect(isMatchMusicEnabled('?music=off')).toBe(false);
  });
});
