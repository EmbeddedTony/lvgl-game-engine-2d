import { Cpu, Download, RefreshCw, Activity, Square } from 'lucide-react';
import type { Project } from '../model';
import { desktop } from '../desktop';
import { useBoard } from '../boards/useBoard';
import type { BoardOptions } from '../boards/types';
export function BoardPanel({
  project,
  onConfigure,
}: {
  project: Project;
  onConfigure: () => void;
}) {
  const {
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
  } = useBoard(project);
  return (
    <div className="board-panel" data-testid="board-panel" data-phase={phase}>
      <header className="native-heading">
        <Cpu size={28} />
        <div>
          <span className="eyebrow">BUILD · FLASH · MEASURE</span>
          <h1>STM32H7S78-DK</h1>
          <p>800 × 480 touch display · NeoChrom GPU2D · ST-LINK / CN7</p>
        </div>
      </header>
      {!desktop ? (
        <p>Build and flash is available in the standalone desktop app.</p>
      ) : (
        <>
          {project.board !== 'stm32h7s78-dk' ? (
            <div className="board-callout">
              <p>Configure this project for the board’s display, memory and renderer.</p>
              <button onClick={onConfigure}>Configure STM32H7S78-DK</button>
            </div>
          ) : null}
          <div className="board-columns">
            <section>
              <h3>1. Build firmware</h3>
              <label className="block-label">
                Renderer
                <select
                  aria-label="Board renderer"
                  disabled={busy}
                  value={options.renderer}
                  onChange={(e) =>
                    setOptions({ ...options, renderer: e.target.value as BoardOptions['renderer'] })
                  }
                >
                  <option value="neochrom">NeoChrom hardware acceleration</option>
                  <option value="software">Software comparison (GPU drawing off)</option>
                </select>
              </label>
              <label className="block-label">
                Refresh target
                <select
                  aria-label="Board refresh target"
                  disabled={busy}
                  value={options.fps}
                  onChange={(e) =>
                    setOptions({ ...options, fps: Number(e.target.value) as 30 | 60 })
                  }
                >
                  <option value="60">60 FPS target</option>
                  <option value="30">30 FPS target</option>
                </select>
              </label>
              <p className="field-hint">
                Scheduling target, not guaranteed FPS. The 2D village reached about 30 FPS with 60
                Hz requests.
              </p>
              <label className="block-label">
                Terrain cache · external PSRAM
                <select
                  aria-label="Board terrain cache budget"
                  disabled={busy || options.renderer !== 'neochrom'}
                  value={options.terrainCacheKiB ?? 0}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      terrainCacheKiB: Number(e.target.value) as BoardOptions['terrainCacheKiB'],
                    })
                  }
                >
                  <option value="0">Off · measured faster for the village</option>
                  <option value="32">32 KiB</option>
                  <option value="128">128 KiB</option>
                  <option value="512">512 KiB</option>
                  <option value="2048">2 MiB</option>
                </select>
              </label>
              <p className="field-hint">
                Optional for 2D NeoChrom. Benchmark your scene: fewer draw commands can still cost
                more memory bandwidth. Artwork and animation stay unchanged.
              </p>
              <label className="input-checkbox">
                <input
                  type="checkbox"
                  aria-label="Stream inputs over ST-LINK serial"
                  checked={options.inputMonitor ?? false}
                  disabled={busy}
                  onChange={(e) => setOptions({ ...options, inputMonitor: e.target.checked })}
                />
                Stream inputs over ST-LINK serial
              </label>
              <p className="field-hint">
                Development bridge · 115200 baud. In Inputs & controllers, add DK touch & button,
                then connect Live monitor to the ST-LINK port. Also streams active authored
                channels.
              </p>
              <button
                className="primary"
                disabled={busy || project.board !== 'stm32h7s78-dk'}
                onClick={compile}
              >
                <Cpu size={14} /> {phase === 'building' ? 'Building…' : 'Build firmware'}
              </button>
              {build && (
                <p className="field-hint">
                  Boot {(build.report.outputs['boot.bin'] / 1024).toFixed(1)} KiB · Game{' '}
                  {(build.report.outputs['appli.bin'] / 1024).toFixed(1)} KiB
                  {build.report.terrainCache?.pixelBytes
                    ? ` · Terrain PSRAM ${(build.report.terrainCache.pixelBytes / 1024).toFixed(0)} KiB`
                    : ' · Terrain cache off'}
                </p>
              )}
              {build?.report.checkpoints?.enabled && (
                <p className="field-hint">
                  Persistent checkpoints ready · 16 KiB reserved internal data flash · no SD card
                  needed. Application updates preserve saves and the bootloader.
                </p>
              )}
              <details>
                <summary>Tool settings</summary>
                <p className="field-hint">
                  Requires ARM GNU with newlib, Python 3, CMake, Ninja, Git and STM32CubeProgrammer.
                  The first build downloads the pinned LVGL board SDK.
                </p>
                <label className="block-label">
                  CubeProgrammer CLI
                  <input
                    aria-label="CubeProgrammer CLI"
                    placeholder={caps?.tools.programmer ?? 'Absolute path to STM32_Programmer_CLI'}
                    value={tools.programmer ?? ''}
                    onChange={(e) => setTools({ ...tools, programmer: e.target.value })}
                  />
                </label>
                <label className="block-label">
                  ARM toolchain bin
                  <input
                    aria-label="ARM toolchain bin"
                    placeholder="Auto-detect (STM32CubeIDE on macOS)"
                    value={tools.toolchainBin ?? ''}
                    onChange={(e) => setTools({ ...tools, toolchainBin: e.target.value })}
                  />
                </label>
                <button disabled={busy} onClick={saveTools}>
                  Save tool settings
                </button>
                {caps && (
                  <p className="field-hint">
                    {Object.entries(caps.tools)
                      .map(([name, p]) => `${name}: ${p ? 'found' : 'missing'}`)
                      .join(' · ')}
                  </p>
                )}
              </details>
            </section>
            <section>
              <h3>2. Flash selected board</h3>
              <label className="block-label">
                ST-LINK probe
                <select
                  aria-label="ST-LINK probe"
                  value={serial}
                  disabled={busy}
                  onChange={(e) => setSerial(e.target.value)}
                >
                  <option value="">Select a connected probe…</option>
                  {probes.map((p) => (
                    <option key={p.serial} value={p.serial}>
                      {p.board} · {p.serial}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy} onClick={() => void attempt(scan)}>
                <RefreshCw size={14} /> Refresh probes
              </button>
              {probeError && <p className="board-callout">{probeError}</p>}
              <label className="gameplay-check">
                <input
                  type="checkbox"
                  aria-label="Install board bootloader"
                  disabled={busy || !!project.inputs?.hardware}
                  checked={boot}
                  onChange={(e) => setBoot(e.target.checked)}
                />{' '}
                Replace bootloader (explicit installation)
              </label>
              <p className="field-hint">
                Writes the current game at 0x70000000{boot ? ' and bootloader at 0x08000000' : ''}
                {boot ? ', verifies both images' : ', verifies the game'}, then resets.
                {boot
                  ? ' Existing firmware at these addresses is replaced.'
                  : ' The installed bootloader is preserved.'}
              </p>
              {stale && (
                <p className="board-callout">
                  Project or build options changed. Rebuild before flashing.
                </p>
              )}
              <button
                className="primary"
                disabled={busy || !build || stale || !serial}
                onClick={flash}
              >
                <Download size={14} />{' '}
                {phase === 'flashing' ? 'Flashing & verifying…' : 'Flash & run'}
              </button>
            </section>
            <section>
              <h3>3. Measure on hardware</h3>
              <div className="board-fps">
                {metrics && !metrics.stale ? metrics.fps.toFixed(1) : '—'} <small>FPS</small>
              </div>
              <p>
                {metrics
                  ? metrics.accelerated
                    ? 'NeoChrom enabled'
                    : 'Software comparison'
                  : 'Waiting for board measurements'}
              </p>
              <dl className="board-metrics">
                <dt>Render</dt>
                <dd>{metrics ? `${metrics.renderUs / 1000} ms` : '—'}</dd>
                <dt>Flush / wait</dt>
                <dd>{metrics ? `${metrics.flushUs / 1000} ms` : '—'}</dd>
                <dt>GPU interrupts</dt>
                <dd>{metrics?.gpuIrqs ?? '—'}</dd>
                <dt>LVGL heap free</dt>
                <dd>{metrics ? `${(metrics.freeHeap / 1024).toFixed(1)} KiB` : '—'}</dd>
              </dl>
              <button
                disabled={busy || !build || !serial}
                onClick={() =>
                  attempt(async () => {
                    if (monitoring) {
                      await desktop!.boardStopMonitor();
                      setMonitoring(false);
                    } else {
                      await desktop!.boardMonitor(build!.id, serial);
                      setMonitoring(true);
                    }
                  })
                }
              >
                <Activity size={14} /> {monitoring ? 'Stop monitor' : 'Monitor FPS'}
              </button>
              <p className="field-hint">
                Measured display frames over ST-LINK, once per second. Move through the world to
                compare GPU and software builds. The board also displays these values.
              </p>
            </section>
          </div>
          <div role="status" className="board-status">
            {message}
            {phase === 'building' && (
              <button onClick={() => attempt(() => desktop!.boardCancel())}>
                <Square size={12} /> Cancel build
              </button>
            )}
          </div>
          <details open={phase === 'error'}>
            <summary>Build & device log</summary>
            <pre className="native-output" data-testid="board-output">
              {logs || 'Build and flash output appears here.'}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
