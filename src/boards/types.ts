export interface BoardOptions {
  renderer: 'neochrom' | 'software';
  fps: 30 | 60;
  terrainCacheKiB?: 0 | 32 | 128 | 512 | 2048;
  inputMonitor?: boolean;
  fingerprint?: string;
}
export interface BoardTools {
  programmer?: string;
  toolchainBin?: string;
}
export interface BoardMetrics {
  stale?: boolean;
  uptimeMs: number;
  frames: number;
  fps: number;
  renderUs: number;
  flushUs: number;
  gpuIrqs: number;
  accelerated: boolean;
  freeHeap: number;
}
export interface BoardBuild {
  id: string;
  fingerprint?: string;
  out: string;
  report: {
    renderer: string;
    fpsTarget: number;
    telemetryAddress: string;
    outputs: Record<string, number>;
    hardwareInputs?: { source: string; sampleHz: number; signature: string };
    inputMonitor?: { enabled: boolean; baud: number; packetBytes: number; serialCommands: boolean };
    terrainCache?: { pixelBytes: number; address: string | null; metadataAllowanceBytes: number };
    checkpoints?: {
      enabled: boolean;
      address: string | null;
      bytes: number;
      protectedBootBytes: number;
      maxPacketBytes: number;
    };
  };
}
export type BoardPhase =
  'idle' | 'building' | 'ready' | 'flashing' | 'flashed' | 'monitoring' | 'error' | 'stopped';
export interface BoardCapabilities {
  config: BoardTools;
  tools: Record<'python' | 'cmake' | 'ninja' | 'git' | 'programmer' | 'loader', string | null>;
  phase: BoardPhase;
  logs: string;
  build: BoardBuild | null;
  monitoring: boolean;
}
export type BoardEvent =
  | { type: 'status'; phase: BoardPhase; message: string; build?: BoardBuild }
  | { type: 'log'; text: string }
  | ({ type: 'metrics' } & BoardMetrics)
  | { type: 'monitor-message'; message: string };
