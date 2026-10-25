import { useEffect, useState, useMemo } from 'react';
import type { Project } from '../model';
import { validate } from '../model';
import { desktop, uiEntries } from '../desktop';
import { generate } from '../exporter';
import { runtimeFiles } from '../runtime';
import type {
  BoardCapabilities,
  BoardBuild,
  BoardPhase,
  BoardOptions,
  BoardMetrics,
  BoardTools,
} from './types';
/** Owns board operations, event subscriptions and document/build staleness. */
export function useBoard(project: Project) {
  const [caps, setCaps] = useState<BoardCapabilities | null>(null),
    [tools, setTools] = useState<BoardTools>({});
  const [probes, setProbes] = useState<
      {
        serial: string;
        board: string;
      }[]
    >([]),
    [serial, setSerial] = useState(''),
    [probeError, setProbeError] = useState('');
  const [phase, setPhase] = useState<BoardPhase>('idle'),
    [message, setMessage] = useState('Build your current project, then flash the selected board.');
  const [logs, setLogs] = useState(''),
    [build, setBuild] = useState<BoardBuild | null>(null),
    [metrics, setMetrics] = useState<BoardMetrics | null>(null);
  const [options, setOptions] = useState<BoardOptions>({
      renderer: 'neochrom',
      fps: 60,
      terrainCacheKiB: 0,
      inputMonitor: !!project.inputs?.hardware,
    }),
    [boot, setBoot] = useState(false),
    [monitoring, setMonitoring] = useState(false);
  const current = useMemo(() => {
      let h = 2166136261;
      for (const c of JSON.stringify({
        project,
        renderer: options.renderer,
        fps: options.fps,
        terrainCacheKiB: options.terrainCacheKiB ?? 0,
        inputMonitor: options.inputMonitor ?? false,
      }))
        h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      return (h >>> 0).toString(16);
    }, [project, options.renderer, options.fps, options.terrainCacheKiB, options.inputMonitor]),
    busy = phase === 'building' || phase === 'flashing';
  const attempt = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const scan = async () => {
    if (!desktop) return;
    try {
      const ps = await desktop.boardScan();
      setProbes(ps);
      setSerial((old) =>
        ps.some((p) => p.serial === old) ? old : ps.length === 1 ? ps[0].serial : '',
      );
      setProbeError(
        ps.length ? '' : 'No accessible ST-LINK. Connect CN7 and refresh the probe list.',
      );
    } catch (e) {
      setProbes([]);
      setSerial('');
      setProbeError((e as Error).message);
      throw e;
    }
  };
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    const off = desktop.onBoardEvent((e) => {
      if (e.type === 'log') setLogs((old) => (old + e.text).slice(-120000));
      else if (e.type === 'metrics') {
        setMetrics(e);
        setMonitoring(true);
      } else if (e.type === 'monitor-message') {
        setMessage(e.message);
      } else {
        setPhase(e.phase);
        setMessage(e.message);
        if (e.build) setBuild(e.build);
        if (e.phase === 'flashed') setBoot(false);
      }
    });
    void desktop!.boardCapabilities().then((c) => {
      if (live) {
        setCaps(c);
        setTools(c.config);
        setPhase(c.phase);
        setLogs(c.logs);
        setBuild(c.build);
        setMonitoring(c.monitoring);
        if (c.build)
          setOptions({
            renderer: c.build.report.renderer.includes('Software') ? 'software' : 'neochrom',
            fps: c.build.report.fpsTarget as 30 | 60,
            inputMonitor:
              !!project.inputs?.hardware || (c.build.report.inputMonitor?.enabled ?? false),
          });
      }
    });
    void attempt(scan);
    return () => {
      live = false;
      off();
      void desktop?.boardStopMonitor();
    };
  }, []);
  const compile = () =>
    attempt(async () => {
      if (!desktop) return;
      const errors = validate(project).filter((i) => i.severity === 'error');
      if (errors.length) throw Error(errors[0].message);
      const result = generate(project, runtimeFiles);
      setLogs('');
      setMetrics(null);
      setBuild(null);
      await desktop!.boardBuild(uiEntries(result.files), { ...options, fingerprint: current });
      setPhase('building');
    });
  const stale = !!build && build.fingerprint !== current;
  const saveTools = () =>
    attempt(async () => {
      if (desktop) setCaps(await desktop.boardConfigure(tools));
    });
  const flash = () =>
    attempt(async () => {
      if (!desktop || !build || stale || !serial) return;
      await desktop.boardFlash({ id: build.id, serial, installBoot: boot });
      setPhase('flashing');
    });
  return {
    saveTools,
    flash,
    caps,
    tools,
    setTools,
    probes,
    probeError,
    serial,
    setSerial,
    phase,
    message,
    logs,
    build,
    metrics,
    options,
    setOptions,
    boot,
    setBoot,
    monitoring,
    setMonitoring,
    busy,
    attempt,
    scan,
    compile,
    stale,
  };
}
