import { useEffect, useState } from 'react';
import type { Project } from '../model';
import { desktop } from '../desktop';
import { inputBindings, type InputChannel } from '../input/model';
import type { InputMonitorController } from '../input/monitor/useInputMonitor';
import type { NativeInputState } from '../playtest/types';
import { NativePlaytestPanel } from './NativePlaytestPanel';
import './LiveInputMonitor.css';
import { hardwareSignature } from '../input/hardware/model';
const display = (value: number | boolean | null | undefined) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : Number.isInteger(value)
        ? String(value)
        : Number(value.toPrecision(9)).toString();
export function LiveInputMonitor({
  project,
  monitor,
  selected,
  onSelect,
  onCalibrate,
  onEditCode,
  labels,
}: {
  project: Project;
  monitor: InputMonitorController;
  selected: string;
  onSelect: (id: string) => void;
  onCalibrate: (id: string, patch: Partial<InputChannel>) => boolean;
  onEditCode?: (line: number) => void;
  labels: Record<InputChannel['binding'], string>;
}) {
  const config = project.inputs ?? { sources: [], channels: [] };
  const hardware = config.hardware;
  const identity = hardware ? monitor.snapshot.hardwareProfiles[hardware.source] : undefined;
  const hardwareVerified =
    !hardware ||
    (identity?.signature === hardwareSignature(hardware) &&
      identity.ageMs < 1500 &&
      monitor.connections[hardware.source]?.phase === 'connected' &&
      monitor.connections[hardware.source]?.transport === 'serial');
  const [sourceId, setSourceId] = useState(
    config.channels.find((c) => c.id === selected)?.source ?? config.sources[0]?.id ?? '',
  );
  const source = config.sources.find((s) => s.id === sourceId) ?? config.sources[0];
  const [transport, setTransport] = useState<'serial' | 'ble'>(
      source?.kind === 'ble' ? 'ble' : 'serial',
    ),
    [baud, setBaud] = useState(115200),
    [service, setService] = useState(''),
    [characteristic, setCharacteristic] = useState(''),
    [format, setFormat] = useState<'text' | 'report'>('report');
  const [testText, setTestText] = useState(''),
    [testHex, setTestHex] = useState(''),
    [notice, setNotice] = useState('');
  const [showGame, setShowGame] = useState(false),
    [drive, setDrive] = useState(false),
    [gameInput, setGameInput] = useState<NativeInputState | null>(null);
  const [capturing, setCapturing] = useState<string | null>(null);
  const c = config.channels.find((c) => c.id === selected) ?? config.channels[0];
  const reading = monitor.snapshot.readings.find((r) => r.id === c?.id);
  const hardwareChannel = hardware?.pins.some((p) => p.channel === c?.id);
  const calibrationReady = !hardwareChannel || hardwareVerified;
  const hardwareAxis = hardware?.pins.some((p) => p.channel === c?.id && p.kind === 'adc');
  const connection = source ? monitor.connections[source.id] : undefined;
  const busy = connection?.phase === 'connecting',
    connected = connection?.phase === 'connected' && connection.transport !== 'simulation';
  const gameReading = gameInput?.channels.find(
    (v) => v.channel === config.channels.findIndex((x) => x.id === c?.id),
  );
  useEffect(() => {
    setCapturing(null);
    setNotice('');
  }, [c?.id]);
  const chooseSource = (id: string) => {
    setSourceId(id);
    setTransport(config.sources.find((s) => s.id === id)?.kind === 'ble' ? 'ble' : 'serial');
    setNotice('');
  };
  const calibrate = (patch: Partial<InputChannel>) => {
    if (!c) return false;
    if (!hardwareVerified && hardware?.pins.some((p) => p.channel === c.id)) return false;
    setDrive(false);
    const ok = onCalibrate(c.id, patch);
    if (!ok)
      setNotice(
        'This capture cannot form a valid calibration. Check the input units and range in Configure.',
      );
    return ok;
  };
  const selectChannel = (id: string) => {
    onSelect(id);
    const next = config.channels.find((c) => c.id === id);
    if (next) chooseSource(next.source);
  };
  const simulate = (value: number | boolean) => {
    if (c) monitor.simulate({ id: c.id, value });
  };
  const table = (
    <div className="live-input-table-wrap">
      <table className="live-input-table" aria-label="Live input channels">
        <thead>
          <tr>
            <th>Channel / binding</th>
            <th>Raw</th>
            <th>Normalized</th>
            <th>Status</th>
            <th>Hz</th>
          </tr>
        </thead>
        <tbody>
          {config.channels.map((channel) => {
            const r = monitor.snapshot.readings.find((r) => r.id === channel.id);
            return (
              <tr
                key={channel.id}
                className={channel.id === c?.id ? 'selected' : ''}
                data-testid={`live-input-${channel.id}`}
                data-active={r?.active ?? false}
              >
                <td>
                  <button
                    className="live-channel-name"
                    aria-pressed={channel.id === c?.id}
                    onClick={() => selectChannel(channel.id)}
                  >
                    {channel.name}
                    <small>
                      {channel.source} · {channel.type} · {labels[channel.binding]}
                    </small>
                  </button>
                </td>
                <td className="live-raw">{display(r?.raw)}</td>
                <td className="live-normalized">{r?.active ? r.normalized.toFixed(3) : '0.000'}</td>
                <td>
                  <span className={`live-input-state ${r?.active ? 'active' : ''}`}>
                    {r?.active
                      ? 'Live'
                      : r?.raw === null || !r
                        ? 'Waiting'
                        : r.ageMs === null
                          ? 'Disconnected'
                          : 'Timed out'}
                  </span>
                </td>
                <td>{r?.active ? Math.round(r.hz) : 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!config.channels.length && <p>Add an input preset in Configure to begin.</p>}
    </div>
  );
  return (
    <div className={`live-monitor ${showGame ? 'with-game' : ''}`}>
      <div className="live-monitor-tools">
        <div>
          <strong>Live input monitor</strong>
          <p>Read real devices, capture calibration, then test the bindings in your game.</p>
        </div>
        <label className="input-checkbox">
          <input
            type="checkbox"
            checked={showGame}
            onChange={(e) => {
              setShowGame(e.target.checked);
              if (!e.target.checked) setDrive(false);
            }}
          />
          Show game test
        </label>
      </div>
      {hardware && (
        <p role="status" className="field-hint" data-testid="hardware-profile-status">
          {hardwareVerified
            ? 'Firmware pin profile matches. Live hardware calibration is ready.'
            : 'Waiting for matching controller firmware. Build & flash the chosen pins with ST-LINK streaming enabled, then connect serial. Old firmware or simulated values cannot calibrate this hardware profile.'}
        </p>
      )}
      <div className="live-monitor-columns">
        <div className="live-monitor-values">
          <section className="live-connection">
            <div className="live-connection-fields">
              <label>
                Input device
                <select
                  aria-label="Monitor input device"
                  value={source?.id ?? ''}
                  disabled={!config.sources.length}
                  onChange={(e) => chooseSource(e.target.value)}
                >
                  {config.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connect through
                <select
                  aria-label="Monitor transport"
                  value={transport}
                  disabled={busy || connected}
                  onChange={(e) => setTransport(e.target.value as 'serial' | 'ble')}
                >
                  <option value="serial">USB / serial (ADC bridge)</option>
                  <option value="ble">Bluetooth LE</option>
                </select>
              </label>
              {transport === 'serial' ? (
                <label>
                  Baud rate
                  <select
                    aria-label="Monitor baud rate"
                    value={baud}
                    disabled={busy || connected}
                    onChange={(e) => setBaud(Number(e.target.value))}
                  >
                    {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Notification format
                  <select
                    aria-label="BLE notification format"
                    value={format}
                    disabled={busy || connected}
                    onChange={(e) => setFormat(e.target.value as 'text' | 'report')}
                  >
                    <option value="report">Binary report layout</option>
                    <option value="text">channel=value lines</option>
                  </select>
                </label>
              )}
            </div>
            {transport === 'ble' && (
              <div className="field-pair">
                <label>
                  Service UUID
                  <input
                    aria-label="BLE service UUID"
                    placeholder="16-bit or full UUID"
                    value={service}
                    disabled={busy || connected}
                    onChange={(e) => setService(e.target.value)}
                  />
                </label>
                <label>
                  Notify characteristic UUID
                  <input
                    aria-label="BLE characteristic UUID"
                    placeholder="16-bit or full UUID"
                    value={characteristic}
                    disabled={busy || connected}
                    onChange={(e) => setCharacteristic(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="live-connection-actions">
              <button
                className="primary"
                disabled={
                  !source ||
                  busy ||
                  connected ||
                  (transport === 'ble' && (!service || !characteristic))
                }
                onClick={() =>
                  source &&
                  void monitor.connect(source.id, {
                    transport,
                    baud,
                    service,
                    characteristic,
                    format,
                  })
                }
              >
                Connect {transport === 'serial' ? 'serial' : 'BLE'}
              </button>
              <button
                className="secondary"
                disabled={!source || (!busy && connection?.phase !== 'connected')}
                onClick={() => source && void monitor.cancelConnect(source.id)}
              >
                {busy ? 'Cancel connection' : 'Disconnect'}
              </button>
              <span role="status">
                {connection?.label ?? 'Choose a device to connect. No values received yet.'}
              </span>
            </div>
            <p className="field-hint">
              {transport === 'serial'
                ? `Your board sends channel=value lines, for example ${config.channels.find((c) => c.source === source?.id)?.id ?? 'adc_x'}=2048 followed by newline. ADC sampling stays in the board driver.`
                : 'Select a peripheral advertising this service. Notifications use the channel offsets/encodings from Configure. Standard OS gamepads may expose HID instead of an accessible GATT service.'}
            </p>
          </section>
          {monitor.picker && (
            <section className="live-device-picker" aria-label="Choose input hardware">
              <strong>
                {monitor.picker.kind === 'ble' ? 'Nearby BLE devices' : 'Serial devices'}
              </strong>
              <p>Select your controller.</p>
              <div>
                {monitor.picker.devices.map((d) => (
                  <button
                    className="secondary"
                    key={d.id}
                    onClick={() => void monitor.choose(d.id)}
                  >
                    {d.name}
                  </button>
                ))}
                {!monitor.picker.devices.length && <span>Waiting for a matching device…</span>}
              </div>
              <button
                className="secondary"
                onClick={() => source && void monitor.cancelConnect(source.id)}
              >
                Cancel device selection
              </button>
            </section>
          )}
          {table}
          {c && reading && (
            <section className="live-calibration">
              <div className="input-section-title">
                <div>
                  <h2>{c.name}</h2>
                  <code>{c.id}</code>
                </div>
                <span className="live-calibrated-value">{reading.normalized.toFixed(3)}</span>
              </div>
              <svg
                className="live-input-spark"
                viewBox="0 0 504 76"
                preserveAspectRatio="none"
                role="img"
                aria-label="Recent normalized input history"
              >
                <path d="M0 38H504" stroke="#455360" />
                <polyline
                  points={reading.history.map((v, i) => `${i * 8},${38 - v * 32}`).join(' ')}
                  fill="none"
                  stroke="#85cbb7"
                  strokeWidth="2"
                />
              </svg>
              <div className="live-reading-detail">
                <span>
                  Raw <b>{display(reading.raw)}</b>
                </span>
                <span>
                  Seen range{' '}
                  <b>
                    {display(reading.low)} … {display(reading.high)}
                  </b>
                </span>
                <span>
                  Last sample{' '}
                  <b>{reading.ageMs === null ? '—' : `${Math.round(reading.ageMs)} ms`}</b>
                </span>
              </div>
              {c.type !== 'bool' && (
                <>
                  <div className="live-calibration-actions">
                    <button
                      className="secondary"
                      disabled={
                        !reading.active || typeof reading.raw !== 'number' || !calibrationReady
                      }
                      onClick={() => {
                        const raw = reading.raw as number;
                        const ok = calibrate({
                          center: raw,
                          min: Math.min(c.min, raw),
                          max: Math.max(c.max, raw),
                        });
                        if (ok)
                          setNotice(
                            'Resting value captured. Calibration was saved to the project.',
                          );
                      }}
                    >
                      Set center from live value
                    </button>
                    <button
                      className="secondary"
                      disabled={!reading.active || capturing === c.id || !calibrationReady}
                      onClick={() => {
                        setDrive(false);
                        monitor.session.clearRange(c.id);
                        setCapturing(c.id);
                        setNotice(
                          hardwareAxis
                            ? 'Move this joystick axis through its full travel. At least 256 ADC counts are required; use Configure for a smaller custom range.'
                            : 'Move this control through its full travel, then apply the captured range.',
                        );
                      }}
                    >
                      Capture range
                    </button>
                    {capturing === c.id && (
                      <>
                        <button
                          className="primary"
                          disabled={
                            reading.low === null ||
                            reading.high === null ||
                            !(Math.fround(reading.low) < Math.fround(reading.high)) ||
                            !calibrationReady ||
                            (hardwareAxis && reading.high - reading.low < 256)
                          }
                          onClick={() => {
                            const ok = calibrate({
                              min: reading.low!,
                              max: reading.high!,
                              center: Math.max(reading.low!, Math.min(reading.high!, c.center)),
                            });
                            if (ok) {
                              setCapturing(null);
                              setNotice(
                                'Captured range saved. Rebuild the game test to use the new calibration.',
                              );
                            }
                          }}
                        >
                          Apply captured range
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            setCapturing(null);
                            setNotice('Range capture cancelled.');
                          }}
                        >
                          Cancel capture
                        </button>
                      </>
                    )}
                  </div>
                  <div className="live-reading-detail">
                    <span>Min {display(c.min)}</span>
                    <span>Center {display(c.center)}</span>
                    <span>Max {display(c.max)}</span>
                    <span>Dead zone {c.deadzone}</span>
                  </div>
                </>
              )}
              <label className="live-binding-label">
                Game binding
                <select
                  aria-label="Live game binding"
                  value={c.binding}
                  onChange={(e) =>
                    calibrate({ binding: e.target.value as InputChannel['binding'] })
                  }
                >
                  {inputBindings
                    .filter((b) => c.type !== 'bool' || !['moveX', 'moveY'].includes(b))
                    .map((b) => (
                      <option key={b} value={b}>
                        {labels[b]}
                      </option>
                    ))}
                </select>
              </label>
              <details>
                <summary>Simulate this channel</summary>
                <p className="field-hint">
                  A held test value is sampled at 20 Hz. Disconnect the real device before
                  simulating. Use Disconnect to release simulated values.
                </p>
                {c.type === 'bool' ? (
                  <label className="input-checkbox">
                    <input
                      aria-label="Simulated live button"
                      type="checkbox"
                      checked={
                        reading.raw === true &&
                        monitor.connections[c.source]?.transport === 'simulation'
                      }
                      disabled={
                        monitor.connections[c.source]?.phase === 'connecting' ||
                        (monitor.connections[c.source]?.phase === 'connected' &&
                          monitor.connections[c.source].transport !== 'simulation')
                      }
                      onChange={(e) => simulate(e.target.checked)}
                    />
                    Pressed
                  </label>
                ) : (
                  <input
                    type="range"
                    aria-label="Simulated live raw value"
                    min={c.min}
                    max={c.max}
                    step={c.type === 'int' ? 1 : 'any'}
                    value={
                      typeof reading.raw === 'number'
                        ? Math.max(c.min, Math.min(c.max, reading.raw))
                        : c.center
                    }
                    disabled={
                      monitor.connections[c.source]?.phase === 'connecting' ||
                      (monitor.connections[c.source]?.phase === 'connected' &&
                        monitor.connections[c.source].transport !== 'simulation')
                    }
                    onChange={(e) => simulate(e.target.valueAsNumber)}
                  />
                )}
              </details>
              {notice && (
                <p className="live-monitor-notice" role="status">
                  {notice}
                </p>
              )}
            </section>
          )}
          <details className="live-packet-test">
            <summary>Test serial text / BLE report without hardware</summary>
            <p className="field-hint">
              One-shot packets for the selected device. Values time out normally. Disconnect a real
              or simulated stream before feeding test packets.
            </p>
            <label>
              Serial text
              <textarea
                aria-label="Test input serial text"
                value={testText}
                rows={3}
                placeholder="adc_x=2048"
                onChange={(e) => setTestText(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={
                !source ||
                busy ||
                connection?.phase === 'connected' ||
                testText.length > 8192 ||
                !testText
              }
              onClick={() => source && monitor.injectText(source.id, testText)}
            >
              Feed serial text
            </button>
            <label>
              Binary report (hex bytes)
              <input
                aria-label="Test input report hex"
                placeholder="FF 0F 00 08 01"
                value={testHex}
                maxLength={192}
                onChange={(e) => setTestHex(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={!source || busy || connection?.phase === 'connected' || !testHex}
              onClick={() => {
                const tokens = testHex.trim().split(/\s+/);
                if (tokens.length > 64 || tokens.some((t) => !/^([0-9a-f]{2})$/i.test(t))) {
                  setNotice('Use up to 64 two-digit hex bytes, separated by spaces.');
                  return;
                }
                if (source)
                  monitor.injectReport(
                    source.id,
                    Uint8Array.from(tokens.map((t) => parseInt(t, 16))),
                  );
              }}
            >
              Feed binary report
            </button>
          </details>
          <div className="live-monitor-counters">
            {monitor.snapshot.accepted} samples · {monitor.snapshot.rejected} rejected · 20 Hz
            display · bounded history
            {monitor.snapshot.error && (
              <span role="status">Last rejected packet: {monitor.snapshot.error}</span>
            )}
          </div>
        </div>
        {showGame && (
          <aside className="live-game-test">
            <label className="input-checkbox live-drive-toggle">
              <input
                type="checkbox"
                aria-label="Drive native game with monitored inputs"
                checked={drive}
                disabled={!calibrationReady}
                onChange={(e) => setDrive(e.target.checked)}
              />
              Drive game with monitored inputs
            </label>
            <p className="field-hint">
              {drive
                ? 'Incoming typed values feed the generated C input bank. Keyboard and touch still work.'
                : 'Monitor only. Enable Drive game to test physical or simulated bindings.'}
            </p>
            {gameInput && (
              <div
                className="live-game-feedback"
                data-testid="live-native-bindings"
                data-actions={gameInput.actions}
                data-x={gameInput.x}
                data-y={gameInput.y}
              >
                <strong>Actual C runtime</strong>
                <span>
                  Controller X {gameInput.x.toFixed(3)} · Y {gameInput.y.toFixed(3)}
                </span>
                <span>
                  Controller actions{' '}
                  {['Left', 'Right', 'Up', 'Down', 'Action', 'Interact', 'Menu']
                    .filter((_, i) => gameInput.actions & (1 << i))
                    .join(' · ') || 'none'}
                </span>
                {gameReading && (
                  <span>
                    {c?.name}: {display(gameReading.value)} → {gameReading.normalized.toFixed(3)} ·{' '}
                    {gameReading.active ? 'active' : 'inactive'}
                  </span>
                )}
              </div>
            )}
            <NativePlaytestPanel
              project={project}
              sceneId={project.scenes.find((s) => !s.prefab)?.id ?? project.scenes[0].id}
              onEditCode={onEditCode ?? (() => {})}
              inputMonitor={monitor.session}
              driveInputs={drive}
              onInputState={setGameInput}
            />
          </aside>
        )}
      </div>
      {!desktop && showGame && (
        <p className="field-hint">
          Native binding tests run in the standalone desktop app. Device monitoring and calibration
          are available here when supported.
        </p>
      )}
    </div>
  );
}
