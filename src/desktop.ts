import type { BoardCapabilities, BoardTools, BoardOptions, BoardEvent } from './boards/types';
import type { ExportFiles } from './exporter';
import type { AgentRequest, AgentReply } from './automation/protocol';
import type {
  PlaytestCapabilities,
  NativeStartRequest,
  NativeEvent,
  NativeControl,
} from './playtest/types';
export interface RecentProject {
  index: number;
  name: string;
  path: string;
}
export interface DesktopAction {
  type: string;
  index?: number;
}
export interface InputDevicePicker {
  kind: 'serial' | 'ble';
  devices: { id: string; name: string }[];
  closed?: boolean;
}
export interface DesktopBridge {
  inputDeviceSelect?(kind: 'serial' | 'ble', id: string): Promise<boolean>;
  onInputDevicePicker?(callback: (picker: InputDevicePicker) => void): () => void;
  agentResponse?(reply: AgentReply): Promise<boolean>;
  onAgentRequest?(callback: (request: AgentRequest) => void): () => void;
  boardCapabilities(): Promise<BoardCapabilities>;
  boardConfigure(config: BoardTools): Promise<BoardCapabilities>;
  boardScan(): Promise<{ serial: string; board: string }[]>;
  boardBuild(
    entries: { path: string; data: string | Uint8Array }[],
    options: BoardOptions,
  ): Promise<{ id: string }>;
  boardFlash(request: { id: string; serial: string; installBoot: boolean }): Promise<boolean>;
  boardMonitor(id: string, serial: string): Promise<boolean>;
  boardStopMonitor(): Promise<void>;
  boardCancel(): Promise<void>;
  onBoardEvent(callback: (event: BoardEvent) => void): () => void;

  nativeCapabilities(): Promise<PlaytestCapabilities>;
  nativeStart(request: NativeStartRequest): Promise<{ runId: string }>;
  nativeControl(runId: string, command: NativeControl): Promise<boolean>;
  nativeStop(runId?: string): Promise<void>;
  onNativeEvent(callback: (event: NativeEvent) => void): () => void;
  copyText(text: string): Promise<boolean>;
  openReference(url: string): Promise<boolean>;
  bootstrap(): Promise<{
    initialAction?: DesktopAction | null;
    platform: string;
    version: string;
    recovery: null | { text: string; dirty: boolean };
    documentPath: string | null;
    recent: RecentProject[];
    exportFolder: string | null;
  }>;
  openPending(): Promise<{ text: string; ticket: string; path: string } | null>;
  openProject(): Promise<{ text: string; ticket: string; path: string } | null>;
  openRecent(index: number): Promise<{ text: string; ticket: string; path: string } | null>;
  acceptProject(ticket: string): Promise<{ path: string }>;
  saveProject(text: string, saveAs?: boolean): Promise<{ path: string; name: string } | null>;
  confirmDiscard(
    text: string,
  ): Promise<{ proceed: boolean; saved?: { path: string; name: string } | null }>;
  newDocument(): Promise<boolean>;
  setDocumentState(state: { name: string; dirty: boolean }): Promise<boolean>;
  saveRecovery(text: string, dirty: boolean): Promise<boolean>;
  chooseExportFolder(): Promise<string | null>;
  exportUi(
    entries: { path: string; data: string | Uint8Array }[],
    projectId: string,
    replaceModified?: boolean,
  ): Promise<{
    ok: boolean;
    path: string;
    files?: number;
    conflicts?: string[];
    preserved?: string[];
  }>;
  saveArchive(bytes: Uint8Array, name: string): Promise<string | null>;
  revealExport(): Promise<void>;
  closeResponse(approved: boolean): Promise<void>;
  onAction(callback: (action: DesktopAction) => void): () => void;
}
declare global {
  interface Window {
    engineDesktop?: DesktopBridge;
  }
}
export const desktop = window.engineDesktop;
export function uiEntries(files: ExportFiles) {
  return Object.entries(files)
    .filter(([name]) => name.startsWith('ui/'))
    .map(([path, data]) => ({ path: path.slice(3), data }));
}
