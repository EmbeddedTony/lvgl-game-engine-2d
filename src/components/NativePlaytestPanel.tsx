import type { InputMonitorSession } from '../input/monitor/session';
import { useInputGameBridge } from '../input/monitor/useInputGameBridge';
import type { NativeInputState } from '../playtest/types';
import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Code2,
  LoaderCircle,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Square,
  Terminal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Project } from '../model';
import { getFlow } from '../flow';
import { useNativePlaytest } from '../playtest/useNativePlaytest';
import { useNativeInput } from '../playtest/useNativeInput';
import type { PlaytestTarget } from '../playtest/types';
import { pixelPerfectEnabled, pixelZoom, viewportScale } from '../pixel-perfect';
import { useDevicePixelRatio, usePixelAlignment } from '../editor/usePixelViewport';
export function NativePlaytestPanel({
  project,
  sceneId,
  onEditCode,
  inputMonitor,
  driveInputs = false,
  onInputState,
}: {
  project: Project;
  sceneId: string;
  onEditCode: (line: number) => void;
  inputMonitor?: InputMonitorSession;
  driveInputs?: boolean;
  onInputState?: (state: NativeInputState | null) => void;
}) {
  const runner = useNativePlaytest(project),
    viewport = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState(`scene:${sceneId}`),
    [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState('fit');
  const pixelPerfect = pixelPerfectEnabled(project),
    ratio = useDevicePixelRatio();
  const scale =
    zoom === 'fit'
      ? pixelPerfect
        ? pixelZoom(fitScale, ratio, true)
        : fitScale
      : Number(zoom) / ratio;
  const alignment = usePixelAlignment(
    pixelPerfect,
    ratio,
    viewport,
    runner.canvas,
    `${project.width}:${project.height}:${scale}`,
  );
  const [collisionDebug, setCollisionDebug] = useState(false);
  const busy = runner.phase === 'building' || runner.phase === 'running';
  const running = runner.phase === 'running',
    paused = !!runner.game?.paused;
  const inputStale =
    !!inputMonitor &&
    runner.builtInputs !== null &&
    runner.builtInputs !== JSON.stringify(project.inputs ?? { sources: [], channels: [] });
  useInputGameBridge(
    inputMonitor,
    project.inputs,
    runner.control,
    running,
    driveInputs,
    inputStale,
  );
  useEffect(() => {
    onInputState?.(running && !inputStale ? runner.inputState : null);
  }, [runner.inputState, running, inputStale, onInputState]);
  const input = useNativeInput(runner.control, running, paused);
  useEffect(() => {
    if (running) runner.control({ op: 'collision-debug', enabled: collisionDebug });
  }, [running, collisionDebug, runner.control]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const fit = () => {
      const bounds = element.getBoundingClientRect();
      setFitScale(
        viewportScale(
          { width: bounds.width - 48, height: bounds.height - 48 },
          project,
          ratio,
          pixelPerfect,
        ),
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.width, project.height, ratio, pixelPerfect]);
  const start = () => {
    const [kind, id] = target.split(':');
    void runner.start({ kind: kind as PlaytestTarget['kind'], ...(id ? { id } : {}) });
  };
  const sceneName = project.scenes.find((s) => s.id === runner.game?.scene)?.name;
  const sequenceName = getFlow(project).sequences.find((s) => s.id === runner.game?.sequence)?.name;
  return (
    <div className="native-playtest" data-testid="native-playtest" data-phase={runner.phase}>
      <header className="native-heading">
        <div className="native-heading-icon">
          <MonitorPlay size={24} />
        </div>
        <div>
          <span className="eyebrow">TEST BEFORE FLASHING</span>
          <h1>Native LVGL playtest</h1>
          <p>Your generated C, running here in the editor.</p>
        </div>
      </header>
      <div className="native-toolbar">
        <label>
          Start from
          <select
            aria-label="Native start target"
            disabled={busy}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="entry">Game entry</option>
            <optgroup label="Scenes">
              {project.scenes.map((s) => (
                <option key={s.id} value={`scene:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sequences">
              {getFlow(project)
                .sequences.filter((s) => s.steps.length)
                .map((s) => (
                  <option key={s.id} value={`sequence:${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        {!busy ? (
          <button className="primary" disabled={!runner.capabilities?.available} onClick={start}>
            <Play size={14} /> Build & run
          </button>
        ) : (
          <button className="secondary" onClick={() => void runner.stop()}>
            <Square size={13} />
            {runner.phase === 'building' ? 'Cancel build' : 'Stop game'}
          </button>
        )}
        {inputStale && busy && (
          <button className="primary" onClick={start}>
            Apply inputs & rebuild
          </button>
        )}
        <button
          disabled={!running}
          aria-label={paused ? 'Resume native game' : 'Pause native game'}
          onClick={() => runner.control({ op: 'pause', paused: !paused })}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          disabled={!running}
          aria-label="Restart native game"
          title="Restart the same build"
          onClick={() => runner.control({ op: 'reset' })}
        >
          <RotateCcw size={14} />
        </button>
        <button
          disabled={!running || !runner.game?.sequence || paused}
          onClick={() => runner.control({ op: 'next' })}
        >
          Next step <ChevronRight size={12} />
        </button>
        <span className="native-toolbar-spacer" />
        <label className="native-zoom">
          Display zoom
          <select aria-label="Native zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            <option value="fit">{pixelPerfect ? 'Integer fit' : 'Fit'}</option>
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n}× display pixels
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="Native collision shapes"
          aria-pressed={collisionDebug}
          onClick={() => setCollisionDebug(!collisionDebug)}
        >
          Colliders {collisionDebug ? 'on' : 'off'}
        </button>
        <button
          aria-label={runner.muted ? 'Unmute native audio' : 'Mute native audio'}
          onClick={runner.toggleMute}
        >
          {runner.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
      <div className={`native-status ${runner.phase}`} role="status">
        {runner.phase === 'building' ? (
          <LoaderCircle size={14} className="native-spinner" />
        ) : running ? (
          <CheckCircle2 size={14} />
        ) : (
          <Code2 size={14} />
        )}
        <span>{paused && running ? 'Game paused.' : runner.message}</span>
        {runner.cached && <small>Cached build</small>}
        {runner.capabilities?.available && <small>LVGL {runner.capabilities.lvgl} · local C</small>}
      </div>
      {inputStale && running && (
        <p className="native-input-stale" role="status">
          Input settings changed. Apply inputs & rebuild to test the new calibration or bindings.
          Live forwarding is paused.
        </p>
      )}
      {runner.capabilities && !runner.capabilities.available && (
        <p className="native-unavailable">{runner.capabilities.reason}</p>
      )}
      <div className="native-screen" ref={viewport}>
        <canvas
          ref={runner.canvas}
          data-testid="native-game-canvas"
          data-frames="0"
          data-pixel-perfect={pixelPerfect}
          data-physical-scale={scale * ratio}
          width={project.width}
          height={project.height}
          aria-label="Native game display"
          tabIndex={0}
          style={{ ...alignment, width: project.width * scale, height: project.height * scale }}
          {...input}
        />
        {runner.phase === 'idle' && (
          <div className="native-screen-hint">
            <MonitorPlay size={30} />
            <strong>Ready for a real playtest</strong>
            <span>Choose where to start, then Build & run.</span>
          </div>
        )}
        {runner.phase === 'building' && (
          <div className="native-screen-hint">
            <LoaderCircle className="native-spinner" size={28} />
            <strong>Building your game…</strong>
            <span>Unchanged builds are reused on the next run.</span>
          </div>
        )}
      </div>
      <div
        className="native-runtime-info"
        data-testid="native-runtime-state"
        data-scene={runner.game?.scene ?? ''}
        data-score={runner.game?.score ?? 0}
        data-audio-plays={runner.sound.plays}
      >
        <span>
          {sceneName ?? 'No game running'}
          {sequenceName ? ` · ${sequenceName}` : ''}
          {runner.game?.step ? ` · ${runner.game.step}` : ''}
        </span>
        <span>
          {project.width} × {project.height} · {Math.round(scale * 100)}%
          {pixelPerfect ? ` · ${Math.round(scale * ratio)}× pixels` : ''}
        </span>
        <span>
          {runner.sound.voices} audio voices · {runner.sound.plays} cue plays
        </span>
      </div>
      <section className="native-output" aria-label="Native build and game output">
        <div>
          <Terminal size={13} />
          <strong>Build & game output</strong>
          <small>
            {'WASD / arrows · Space jump · E / Enter interact · P party · click UI · Esc pause'}
          </small>
        </div>
        {!!runner.diagnostics.length && (
          <ul className="native-diagnostics">
            {runner.diagnostics.map((d, i) => (
              <li key={i}>
                <span>
                  {d.file}:{d.line}:{d.column} · {d.message}
                </span>
                {d.file === 'user/game_hooks.c' && (
                  <button onClick={() => onEditCode(d.line)}>
                    Open at line {d.line} <ChevronRight size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <pre data-testid="native-output">
          {runner.logs || 'Compiler diagnostics and printf output appear here.'}
        </pre>
      </section>
      <footer className="native-footnote">
        Runs your project’s C as a local process. Hardware drivers use the desktop display/audio
        ports; MCU timing and memory still need board tests.
      </footer>
    </div>
  );
}
