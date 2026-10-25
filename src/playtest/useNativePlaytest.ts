import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../model';
import { generate } from '../exporter';
import { runtimeFiles } from '../runtime';
import { desktop, uiEntries } from '../desktop';
import { NativeAudio } from './native-audio';
import type {
  CompilerDiagnostic,
  NativeControl,
  NativeGameState,
  NativeInputState,
  PlaytestCapabilities,
  PlaytestPhase,
  PlaytestTarget,
} from './types';

/** Renderer-side session adapter. Frames go straight to canvas; React owns only control/status state. */
export function useNativePlaytest(project: Project) {
  const canvas = useRef<HTMLCanvasElement>(null),
    runId = useRef<string | null>(null),
    generation = useRef(0),
    mounted = useRef(true);
  const [capabilities, setCapabilities] = useState<PlaytestCapabilities | null>(null);
  const [phase, setPhase] = useState<PlaytestPhase>('idle');
  const [message, setMessage] = useState(
    'Compile and run the current project without exporting a folder.',
  );
  const [logs, setLogs] = useState('');
  const [diagnostics, setDiagnostics] = useState<CompilerDiagnostic[]>([]);
  const [cached, setCached] = useState(false),
    [muted, setMuted] = useState(false);
  const [game, setGame] = useState<NativeGameState | null>(null);
  const [inputState, setInputState] = useState<NativeInputState | null>(null);
  const [builtInputs, setBuiltInputs] = useState<string | null>(null);
  const [sound, setSound] = useState({ plays: 0, voices: 0 });
  const control = useCallback((command: NativeControl) => {
    if (runId.current && desktop)
      void desktop.nativeControl(runId.current, command).catch(() => {});
  }, []);
  const audio = useRef<NativeAudio | null>(null);
  audio.current ??= new NativeAudio((voice) => control({ op: 'complete', voice }));
  const stop = useCallback(async () => {
    ++generation.current;
    const id = runId.current;
    runId.current = null;
    audio.current?.stop();
    if (id && desktop) await desktop.nativeStop(id);
    if (mounted.current) {
      setPhase('stopped');
      setMessage('Game stopped.');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!desktop) {
      setCapabilities({
        available: false,
        reason: 'Native playtesting is available in the desktop app.',
      });
      return;
    }
    void desktop
      .nativeCapabilities()
      .then((result) => {
        if (mounted.current) setCapabilities(result);
      })
      .catch((error) => {
        if (mounted.current) setCapabilities({ available: false, reason: String(error) });
      });
    const unsubscribe = desktop.onNativeEvent((event) => {
      if (!runId.current && event.kind === 'status' && event.phase === 'building')
        runId.current = event.runId;
      if (event.runId !== runId.current) return;
      if (event.kind === 'status') {
        setPhase(event.phase);
        setMessage(event.message);
        setLogs(event.logs);
        if (event.diagnostics) setDiagnostics(event.diagnostics);
        if (event.cached !== undefined) setCached(event.cached);
        if (event.phase === 'error' || event.phase === 'stopped') audio.current?.stop();
      } else if (event.kind === 'log') setLogs(event.text);
      else if (event.kind === 'game') {
        setGame(event);
        setSound({ plays: audio.current!.plays, voices: audio.current!.activeVoices });
      } else if (event.kind === 'inputs') setInputState(event);
      else if (event.kind === 'audio') audio.current!.apply(event.command);
      else {
        try {
          const target = canvas.current;
          if (target) {
            if (target.width !== event.width || target.height !== event.height) {
              target.width = event.width;
              target.height = event.height;
            }
            const image = new ImageData(
              new Uint8ClampedArray(event.pixels),
              event.width,
              event.height,
            );
            target.getContext('2d', { alpha: false })?.putImageData(image, 0, 0);
            target.dataset.frames = String(Number(target.dataset.frames ?? 0) + 1);
          }
        } finally {
          control({ op: 'frame-ack' });
        }
      }
    });
    return () => {
      mounted.current = false;
      ++generation.current;
      unsubscribe();
      const id = runId.current;
      runId.current = null;
      if (id) void desktop?.nativeStop(id);
      audio.current?.close();
    };
  }, [control]);
  const start = useCallback(
    async (target: PlaytestTarget) => {
      if (!desktop) return;
      await stop();
      const attempt = ++generation.current;
      setPhase('building');
      setMessage('Preparing the project…');
      setLogs('');
      setDiagnostics([]);
      setGame(null);
      setInputState(null);
      setBuiltInputs(JSON.stringify(project.inputs ?? { sources: [], channels: [] }));
      setCached(false);
      if (canvas.current) canvas.current.dataset.frames = '0';
      try {
        const { files } = generate(project, runtimeFiles);
        try {
          await audio.current!.prepare(project.audio);
        } catch {
          setLogs('Audio could not be initialized; playtesting will run silently.\n');
        }
        if (!mounted.current || generation.current !== attempt) return;
        const result = await desktop.nativeStart({
          entries: uiEntries(files),
          width: project.width,
          height: project.height,
          target,
        });
        if (!mounted.current || generation.current !== attempt) {
          await desktop.nativeStop(result.runId);
          return;
        }
        runId.current = result.runId;
      } catch (error) {
        if (mounted.current && generation.current === attempt) {
          setPhase('error');
          setMessage((error as Error).message);
        }
      }
    },
    [project, stop],
  );
  useEffect(() => {
    if (phase === 'running') canvas.current?.focus();
  }, [phase]);
  const toggleMute = () =>
    setMuted((value) => {
      audio.current!.setMuted(!value);
      return !value;
    });
  return {
    canvas,
    inputState,
    builtInputs,
    capabilities,
    phase,
    message,
    logs,
    diagnostics,
    cached,
    game,
    sound,
    muted,
    toggleMute,
    start,
    stop,
    control,
  };
}
