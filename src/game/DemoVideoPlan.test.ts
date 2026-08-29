import { describe, expect, it } from 'vitest';
import { applyGameAction } from './actions';
import {
  DEMO_VIDEO_ACTIONS,
  DEMO_VIDEO_PROFILE,
  createDemoVideoState,
} from './DemoVideoPlan';
import { selectDemoVideoFormat } from './DemoVideoRecorder';
import { DEMO_VIDEO_AUDIO_ASSETS } from './DemoVideoSoundtrack';

describe('Wavedash demo video plan', () => {
  it('uses an accepted 16:9 recording profile longer than five seconds', () => {
    expect(DEMO_VIDEO_PROFILE.width / DEMO_VIDEO_PROFILE.height).toBe(16 / 9);
    expect(DEMO_VIDEO_PROFILE.frameRate).toBe(30);
    expect(DEMO_VIDEO_PROFILE.minimumDurationSeconds).toBe(18);
  });

  it('replays every staged gameplay action through the shared engine', () => {
    const state = createDemoVideoState();
    const kinds: string[] = [];

    for (const action of DEMO_VIDEO_ACTIONS) {
      const result = applyGameAction(state, action);
      expect(result.ok, `${action.kind}: ${result.message}`).toBe(true);
      kinds.push(action.kind);
    }

    expect(kinds).toEqual(['move', 'attack', 'move', 'summon', 'thunder']);
    expect(state.winner).toBeNull();
  });

  it('prefers MP4 and falls back to an accepted WebM format', () => {
    expect(selectDemoVideoFormat(() => true)?.extension).toBe('mp4');
    expect(selectDemoVideoFormat((mimeType) => mimeType.includes('vp8'))).toEqual({
      mimeType: 'video/webm;codecs=vp8',
      extension: 'webm',
    });
  });

  it('mixes accepted music and the showcased gameplay cues into the export', () => {
    expect(Object.keys(DEMO_VIDEO_AUDIO_ASSETS)).toEqual(expect.arrayContaining([
      'music',
      'ui-card-draw',
      'ui-card-play',
      'unit-move-step',
      'combat-hit-melee',
      'combat-assist',
      'unit-summon-human',
      'ability-thunder',
    ]));
  });
});
