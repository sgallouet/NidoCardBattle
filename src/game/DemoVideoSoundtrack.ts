import battleVanguardUrl from '../../assets/game/audio/music/battle-vanguard-at-daybreak.mp3?url';
import abilityThunderUrl from '../../assets/game/audio/sfx/ability-thunder.mp3?url';
import combatAssistUrl from '../../assets/game/audio/sfx/combat-assist.mp3?url';
import combatHitMeleeUrl from '../../assets/game/audio/sfx/combat-hit-melee.mp3?url';
import uiCardDrawUrl from '../../assets/game/audio/sfx/ui-card-draw.mp3?url';
import uiCardPlayUrl from '../../assets/game/audio/sfx/ui-card-play.mp3?url';
import unitMoveStepUrl from '../../assets/game/audio/sfx/unit-move-step.mp3?url';
import unitSummonHumanUrl from '../../assets/game/audio/sfx/unit-summon-human.mp3?url';

export type DemoVideoAudioCue =
  | 'ability-thunder'
  | 'combat-assist'
  | 'combat-hit-melee'
  | 'ui-card-draw'
  | 'ui-card-play'
  | 'unit-move-step'
  | 'unit-summon-human';

export const DEMO_VIDEO_AUDIO_ASSETS: Readonly<Record<DemoVideoAudioCue | 'music', string>> = {
  music: battleVanguardUrl,
  'ability-thunder': abilityThunderUrl,
  'combat-assist': combatAssistUrl,
  'combat-hit-melee': combatHitMeleeUrl,
  'ui-card-draw': uiCardDrawUrl,
  'ui-card-play': uiCardPlayUrl,
  'unit-move-step': unitMoveStepUrl,
  'unit-summon-human': unitSummonHumanUrl,
};

const CUE_GAIN: Readonly<Record<DemoVideoAudioCue, number>> = {
  'ability-thunder': 0.92,
  'combat-assist': 0.72,
  'combat-hit-melee': 0.92,
  'ui-card-draw': 0.7,
  'ui-card-play': 0.76,
  'unit-move-step': 0.48,
  'unit-summon-human': 0.84,
};

type AudioContextConstructor = typeof AudioContext;

const audioContextConstructor = (): AudioContextConstructor | undefined => (
  window.AudioContext
  ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
);

export class DemoVideoSoundtrack {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private readonly buffers = new Map<DemoVideoAudioCue | 'music', AudioBuffer>();
  private readonly sources = new Set<AudioBufferSourceNode>();

  static isSupported(): boolean {
    return Boolean(audioContextConstructor());
  }

  async prepare(): Promise<MediaStreamTrack> {
    const AudioContextCtor = audioContextConstructor();
    if (!AudioContextCtor) throw new Error('Web Audio is required to record the demo soundtrack.');
    this.context = new AudioContextCtor();
    await this.context.resume();
    this.destination = this.context.createMediaStreamDestination();

    await Promise.all(Object.entries(DEMO_VIDEO_AUDIO_ASSETS).map(async ([id, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load demo audio ${id}: ${response.status}.`);
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(id as DemoVideoAudioCue | 'music', buffer);
    }));

    const track = this.destination.stream.getAudioTracks()[0];
    if (!track) throw new Error('The demo soundtrack did not create an audio track.');
    return track;
  }

  start(): void {
    const context = this.requireContext();
    const destination = this.requireDestination();
    const source = context.createBufferSource();
    source.buffer = this.requireBuffer('music');
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.32, context.currentTime + 0.65);
    source.connect(gain);
    gain.connect(destination);
    gain.connect(context.destination);
    source.start();
    this.musicSource = source;
    this.musicGain = gain;
    this.trackSource(source);
  }

  play(cue: DemoVideoAudioCue, delayMs = 0): void {
    const context = this.requireContext();
    const source = context.createBufferSource();
    source.buffer = this.requireBuffer(cue);
    const gain = context.createGain();
    gain.gain.value = CUE_GAIN[cue];
    source.connect(gain);
    gain.connect(this.requireDestination());
    source.start(context.currentTime + delayMs / 1_000);
    this.trackSource(source);
  }

  fadeOut(durationMs: number): void {
    const context = this.context;
    const gain = this.musicGain;
    if (!context || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + durationMs / 1_000);
  }

  async dispose(): Promise<void> {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source that naturally completed no longer needs stopping.
      }
    }
    this.sources.clear();
    this.musicSource = null;
    this.musicGain = null;
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    this.destination = null;
    const context = this.context;
    this.context = null;
    this.buffers.clear();
    if (context && context.state !== 'closed') await context.close();
  }

  private trackSource(source: AudioBufferSourceNode): void {
    this.sources.add(source);
    source.addEventListener('ended', () => this.sources.delete(source), { once: true });
  }

  private requireContext(): AudioContext {
    if (!this.context) throw new Error('The demo soundtrack has not been prepared.');
    return this.context;
  }

  private requireDestination(): MediaStreamAudioDestinationNode {
    if (!this.destination) throw new Error('The demo soundtrack output is unavailable.');
    return this.destination;
  }

  private requireBuffer(id: DemoVideoAudioCue | 'music'): AudioBuffer {
    const buffer = this.buffers.get(id);
    if (!buffer) throw new Error(`The demo soundtrack is missing ${id}.`);
    return buffer;
  }
}
