import type { AudioCue } from '../model';
import { base64ToBytes } from '../assets';
import type { NativeAudioCommand } from './types';

/** Desktop implementation of the board audio contract. The C engine owns voice policy and gain. */
export class NativeAudio {
  private context: AudioContext | null = null;
  private clips = new Map<string, AudioBuffer>();
  private voices = new Map<
    number,
    { source: AudioBufferSourceNode; gain: GainNode; level: number }
  >();
  private muted = false;
  plays = 0;
  constructor(private complete: (voice: number) => void) {}
  get activeVoices() {
    return this.voices.size;
  }
  async prepare(cues: AudioCue[]) {
    this.stop();
    this.clips.clear();
    this.plays = 0;
    if (!cues.length) return;
    this.context ??= new AudioContext();
    await this.context.resume();
    for (const cue of cues) {
      const bytes = base64ToBytes(cue.data);
      this.clips.set(cue.id, await this.context.decodeAudioData(bytes.buffer as ArrayBuffer));
    }
  }
  apply(command: NativeAudioCommand) {
    const context = this.context;
    if (command.op === 'pause') {
      if (context) void (command.paused ? context.suspend() : context.resume()).catch(() => {});
      return;
    }
    if (command.op === 'stop') {
      this.stopVoice(command.voice);
      return;
    }
    if (command.op === 'gain') {
      const voice = this.voices.get(command.voice);
      if (voice && context) {
        voice.level = command.gain;
        voice.gain.gain.setValueAtTime(this.muted ? 0 : voice.level, context.currentTime);
      }
      return;
    }
    const clip = this.clips.get(command.cue);
    if (!context || !clip) {
      this.complete(command.voice);
      return;
    }
    this.stopVoice(command.voice);
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = clip;
    source.loop = command.loop;
    gain.gain.value = this.muted ? 0 : command.gain;
    source.connect(gain);
    gain.connect(context.destination);
    this.voices.set(command.voice, { source, gain, level: command.gain });
    this.plays++;
    source.onended = () => {
      const voice = this.voices.get(command.voice);
      if (voice?.source !== source) return;
      this.voices.delete(command.voice);
      source.disconnect();
      gain.disconnect();
      this.complete(command.voice);
    };
    source.start();
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    for (const voice of this.voices.values())
      voice.gain.gain.setValueAtTime(muted ? 0 : voice.level, this.context!.currentTime);
  }
  private stopVoice(token: number) {
    const voice = this.voices.get(token);
    if (!voice) return;
    this.voices.delete(token);
    voice.source.onended = null;
    voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
  }
  stop() {
    for (const token of this.voices.keys()) this.stopVoice(token);
  }
  close() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.clips.clear();
  }
}
