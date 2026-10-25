export type PlaytestPhase = 'idle' | 'building' | 'running' | 'stopped' | 'error';
export interface PlaytestTarget {
  kind: 'entry' | 'scene' | 'sequence';
  id?: string;
}
export interface PlaytestCapabilities {
  available: boolean;
  reason?: string;
  lvgl?: string;
  platform?: string;
  arch?: string;
}
export interface CompilerDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}
export interface NativeGameState {
  scene: string;
  sequence: string;
  step: string;
  paused: boolean;
  score: number;
  total: number;
}
export type NativeAudioCommand =
  | { op: 'play'; voice: number; cue: string; gain: number; loop: boolean }
  | { op: 'stop'; voice: number }
  | { op: 'pause'; paused: boolean }
  | { op: 'gain'; voice: number; gain: number };
export interface NativeInputValue {
  channel: number;
  type: 'int' | 'float' | 'bool';
  value: number | boolean;
  pulse?: boolean;
}
export interface NativeInputState {
  channels: {
    channel: number;
    value: number | boolean | null;
    normalized: number;
    active: boolean;
  }[];
  actions: number;
  x: number;
  y: number;
}
export type NativeControl =
  | { op: 'physical-input'; samples: NativeInputValue[] }
  | { op: 'physical-disconnect'; device: number }
  | { op: 'input-monitor'; enabled: boolean }
  | { op: 'collision-debug'; enabled: boolean }
  | { op: 'input'; mask: number }
  | { op: 'pointer'; x: number; y: number; down: boolean }
  | { op: 'pause'; paused: boolean }
  | { op: 'complete'; voice: number }
  | { op: 'frame-ack' | 'reset' | 'next' };
export type NativeEvent = { runId: string } & (
  | {
      kind: 'status';
      phase: PlaytestPhase;
      message: string;
      logs: string;
      diagnostics?: CompilerDiagnostic[];
      cached?: boolean;
    }
  | ({ kind: 'inputs' } & NativeInputState)
  | { kind: 'log'; text: string }
  | ({ kind: 'game' } & NativeGameState)
  | { kind: 'frame'; width: number; height: number; pixels: Uint8Array }
  | { kind: 'audio'; command: NativeAudioCommand }
);
export interface NativeStartRequest {
  entries: { path: string; data: string | Uint8Array }[];
  width: number;
  height: number;
  target: PlaytestTarget;
}
