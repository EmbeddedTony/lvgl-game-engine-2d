import type { AudioCue, Bus } from './model';
import { base64ToBytes } from './assets';
/* Mirrors the board's bounded voice pool; decoding occurs before playback. */
export class PreviewAudio {
  context: AudioContext | null = null;
  buffers = new Map<string, { data: string; buffer: AudioBuffer }>();
  generation = 0;
  voices: { source: AudioBufferSourceNode; gain: GainNode; cue: AudioCue }[] = [];
  gains: Record<Bus, number> = { sfx: 1, music: 0.7, ui: 1 };
  muted = false;
  async ready(cues: AudioCue[]) {
    const generation = ++this.generation;
    const ids = new Set(cues.map((cue) => cue.id));
    for (const id of this.buffers.keys()) if (!ids.has(id)) this.buffers.delete(id);
    if (!cues.length) return;
    this.context ??= new AudioContext();
    await this.context.resume();
    await Promise.all(
      cues.map(async (cue) => {
        if (this.buffers.get(cue.id)?.data === cue.data) return;
        const buffer = await this.context!.decodeAudioData(
          base64ToBytes(cue.data).buffer as ArrayBuffer,
        );
        if (this.generation === generation) this.buffers.set(cue.id, { data: cue.data, buffer });
      }),
    );
  }
  play(cue: AudioCue) {
    const ctx = this.context,
      cached = this.buffers.get(cue.id);
    if (!ctx || !cached || cached.data !== cue.data) return;
    if (this.voices.length >= 8) {
      const lowest = this.voices.reduce((a, b) => (a.cue.priority <= b.cue.priority ? a : b));
      if (lowest.cue.priority > cue.priority) return;
      lowest.source.stop();
      this.voices = this.voices.filter((v) => v !== lowest);
    }
    const source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = cached.buffer;
    source.loop = cue.loop;
    gain.gain.value = this.muted ? 0 : cue.gain * this.gains[cue.bus];
    source.connect(gain);
    gain.connect(ctx.destination);
    const voice = { source, gain, cue };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }
  refresh() {
    for (const v of this.voices)
      v.gain.gain.setValueAtTime(
        this.muted ? 0 : v.cue.gain * this.gains[v.cue.bus],
        this.context!.currentTime,
      );
  }
  stop() {
    const voices = [...this.voices];
    this.voices = [];
    for (const v of voices) v.source.stop();
  }
  async pause(paused: boolean) {
    if (this.context) await (paused ? this.context.suspend() : this.context.resume());
  }
}
