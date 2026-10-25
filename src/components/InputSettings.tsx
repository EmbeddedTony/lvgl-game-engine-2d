import { LiveInputMonitor } from './LiveInputMonitor';
import { useInputMonitor } from '../input/monitor/useInputMonitor';
import { useEffect, useState } from 'react';
import type { Project } from '../model';
import {
  addInputPreset,
  addDkMonitorPreset,
  canAddDkMonitor,
  inputBindings,
  inputEncodings,
  inputRamBytes,
  makeInputChannel,
  previewInput,
  validInputs,
  type InputChannel,
  type InputConfig,
  type InputType,
} from '../input/model';
import './InputSettings.css';
import { HardwareInputWizard } from './HardwareInputWizard';
const EMPTY_INPUTS: InputConfig = { sources: [], channels: [] };
const labels: Record<(typeof inputBindings)[number], string> = {
  none: 'Value only · read in code',
  moveX: 'Move horizontally',
  moveY: 'Move vertically (+ up)',
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  action: 'Action / jump / sword',
  interact: 'Interact / talk',
  menu: 'Menu / lock-on',
};
export function InputSettings({
  project,
  onChange: commit,
  onDone,
  onEditCode,
  onOpenBoard,
}: {
  project: Project;
  onChange: (config: InputConfig) => void;
  onDone: () => void;
  onEditCode?: (line: number) => void;
  onOpenBoard?: () => void;
}) {
  // Keep incomplete calibration/name edits local; never autosave an invalid project.
  const [config, setConfig] = useState<InputConfig>(
    project.inputs ?? { sources: [], channels: [] },
  );
  useEffect(() => setConfig(project.inputs ?? { sources: [], channels: [] }), [project.inputs]);
  const onChange = (next: InputConfig) => {
    setConfig(next);
    if (
      validInputs(next) &&
      JSON.stringify(next) !== JSON.stringify(project.inputs ?? { sources: [], channels: [] })
    )
      commit(next);
  };
  const [mode, setMode] = useState<'configure' | 'monitor' | 'hardware'>('configure');
  const monitor = useInputMonitor(project.inputs ?? EMPTY_INPUTS);
  const [selected, setSelected] = useState(config.channels[0]?.id ?? '');
  const [testValue, setTestValue] = useState<number | boolean>(0);
  const channel = config.channels.find((c) => c.id === selected) ?? config.channels[0];
  const source = config.sources.find((s) => s.id === channel?.source);
  const select = (c: InputChannel) => {
    setSelected(c.id);
    setTestValue(c.type === 'bool' ? false : c.center);
  };
  const update = (patch: Partial<InputChannel>) => {
    if (channel)
      onChange({
        ...config,
        channels: config.channels.map((c) => (c.id === channel.id ? { ...c, ...patch } : c)),
      });
  };
  const preset = (kind: 'adc' | 'serial' | 'ble') => {
    const next = addInputPreset(config, kind);
    onChange(next);
    select(next.channels[config.channels.length]);
  };
  const addSource = () => {
    let id = 'device',
      n = 2;
    while (config.sources.some((s) => s.id === id)) id = 'device_' + n++;
    onChange({
      ...config,
      sources: [...config.sources, { id, name: 'Custom controller', kind: 'custom' }],
    });
  };
  const addChannel = (source: string, type: InputType) => {
    let id = source + '_' + type,
      n = 2;
    while (config.channels.some((c) => c.id.toUpperCase() === id.toUpperCase()))
      id = source + '_' + type + '_' + n++;
    const c = makeInputChannel(id, source, type);
    onChange({ ...config, channels: [...config.channels, c] });
    select(c);
  };
  const field = (
    label: string,
    key:
      | 'min'
      | 'center'
      | 'max'
      | 'deadzone'
      | 'smoothingMs'
      | 'timeoutMs'
      | 'pressThreshold'
      | 'releaseThreshold',
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="block-label">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={channel?.[key] ?? 0}
        onChange={(e) => {
          if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber))
            update({ [key]: Math.max(min, Math.min(max, e.target.valueAsNumber)) });
        }}
      />
    </label>
  );
  return (
    <div className="input-settings">
      <div className="eyebrow">PHYSICAL CONTROLLERS & SENSORS</div>
      <h1>Inputs & controllers</h1>
      <p>
        Connect real values to your game. Bind a joystick or button, or read any sensor in code.
      </p>
      <div className="input-mode-tabs" role="tablist" aria-label="Input workspace">
        {project.board === 'stm32h7s78-dk' && (
          <button
            role="tab"
            aria-selected={mode === 'hardware'}
            disabled={!validInputs(config)}
            onClick={() => setMode('hardware')}
          >
            Hardware wizard
          </button>
        )}
        <button
          role="tab"
          aria-selected={mode === 'configure'}
          onClick={() => setMode('configure')}
        >
          Configure
        </button>
        <button
          role="tab"
          disabled={!validInputs(config)}
          aria-selected={mode === 'monitor'}
          onClick={() => setMode('monitor')}
        >
          Live monitor
        </button>
      </div>
      {mode === 'hardware' ? (
        <HardwareInputWizard
          project={project}
          config={config}
          onChange={onChange}
          monitor={monitor}
          selected={selected}
          onSelect={setSelected}
          labels={labels}
          onOpenBoard={onOpenBoard}
          onEditCode={onEditCode}
        />
      ) : mode === 'monitor' ? (
        <LiveInputMonitor
          project={project}
          monitor={monitor}
          selected={selected}
          onSelect={setSelected}
          labels={labels}
          onEditCode={onEditCode}
          onCalibrate={(id, patch) => {
            const next = {
              ...config,
              channels: config.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            };
            if (!validInputs(next)) return false;
            onChange(next);
            return true;
          }}
        />
      ) : (
        <>
          <div className="input-presets" aria-label="Controller presets">
            {project.board === 'stm32h7s78-dk' && (
              <button
                className="secondary"
                disabled={!canAddDkMonitor(config)}
                title="Match the optional --input-monitor firmware bridge, 115200 baud over ST-LINK."
                onClick={() => {
                  const next = addDkMonitorPreset(config);
                  onChange(next);
                  select(next.channels[config.channels.length]);
                }}
              >
                + DK touch & button
              </button>
            )}
            <button
              className="secondary"
              disabled={config.sources.length >= 8 || config.channels.length > 29}
              onClick={() => preset('adc')}
            >
              + ADC joystick
            </button>
            <button
              className="secondary"
              disabled={config.sources.length >= 8 || config.channels.length > 29}
              onClick={() => preset('serial')}
            >
              + Serial controller
            </button>
            <button
              className="secondary"
              disabled={config.sources.length >= 8 || config.channels.length > 29}
              onClick={() => preset('ble')}
            >
              + BLE controller
            </button>
            <button className="secondary" disabled={config.sources.length >= 8} onClick={addSource}>
              + Custom device
            </button>
          </div>
          <div className="input-workspace">
            <aside className="input-devices" aria-label="Input devices">
              {!config.sources.length && (
                <div className="input-empty">
                  Start with a preset above. Your existing touch and keyboard controls keep working.
                </div>
              )}
              {config.sources.map((s) => (
                <section className="input-device" key={s.id}>
                  <div className="input-device-heading">
                    <strong>{s.name}</strong>
                    <span>{s.kind.toUpperCase()}</span>
                  </div>
                  {config.channels
                    .filter((c) => c.source === s.id)
                    .map((c) => (
                      <button
                        key={c.id}
                        className={`input-channel ${channel?.id === c.id ? 'selected' : ''}`}
                        onClick={() => select(c)}
                        aria-pressed={channel?.id === c.id}
                      >
                        <span>{c.name}</span>
                        <small>
                          {c.type} · {c.binding === 'none' ? 'value' : labels[c.binding]}
                        </small>
                      </button>
                    ))}
                  <div className="input-add-channel" aria-label={`Add channel to ${s.name}`}>
                    {(['int', 'float', 'bool'] as const).map((type) => (
                      <button
                        className="secondary"
                        disabled={config.channels.length >= 32}
                        key={type}
                        onClick={() => addChannel(s.id, type)}
                      >
                        + {type}
                      </button>
                    ))}
                  </div>
                  <button
                    className="input-remove-device"
                    onClick={() =>
                      onChange({
                        ...config,
                        sources: config.sources.filter((d) => d.id !== s.id),
                        channels: config.channels.filter((c) => c.source !== s.id),
                        hardware: config.hardware?.source === s.id ? undefined : config.hardware,
                      })
                    }
                  >
                    Remove device & channels
                  </button>
                </section>
              ))}
            </aside>
            {channel && source ? (
              <main className="input-channel-editor" key={channel.id}>
                <div className="input-section-title">
                  <h2>{channel.name}</h2>
                  <button
                    className="secondary"
                    disabled={config.hardware?.pins.some((p) => p.channel === channel.id)}
                    title="Remove mapped controls in Hardware wizard."
                    onClick={() =>
                      onChange({
                        ...config,
                        channels: config.channels.filter((c) => c.id !== channel.id),
                      })
                    }
                  >
                    Remove channel
                  </button>
                </div>
                {config.hardware?.pins.some((p) => p.channel === channel.id) && (
                  <p className="field-hint">
                    This channel is generated from DK pins.{' '}
                    <button className="secondary" onClick={() => setMode('hardware')}>
                      Edit in Hardware wizard
                    </button>
                  </p>
                )}
                <div className="field-pair">
                  <label className="block-label">
                    Channel name
                    <input
                      aria-label="Channel name"
                      maxLength={128}
                      value={channel.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </label>
                  <label className="block-label">
                    Value type
                    <select
                      aria-label="Value type"
                      disabled={config.hardware?.pins.some((p) => p.channel === channel.id)}
                      value={channel.type}
                      onChange={(e) => {
                        const type = e.target.value as InputType;
                        const next = makeInputChannel(channel.id, channel.source, type);
                        update({
                          ...next,
                          name: channel.name,
                          binding:
                            type === 'bool' && ['moveX', 'moveY'].includes(channel.binding)
                              ? 'none'
                              : channel.binding,
                        });
                        setTestValue(type === 'bool' ? false : next.center);
                      }}
                    >
                      <option value="int">Integer · ADC / encoder</option>
                      <option value="float">Float · sensor / analog</option>
                      <option value="bool">Boolean · button / switch</option>
                    </select>
                  </label>
                </div>
                <label className="block-label">
                  Game binding
                  <select
                    aria-label="Game binding"
                    value={channel.binding}
                    onChange={(e) => update({ binding: e.target.value as InputChannel['binding'] })}
                  >
                    {inputBindings
                      .filter((b) => channel.type !== 'bool' || !['moveX', 'moveY'].includes(b))
                      .map((b) => (
                        <option key={b} value={b}>
                          {labels[b]}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="input-code-id">
                  Stable code ID <code>UI_CHANNEL_{channel.id.toUpperCase()}</code>
                </div>
                {channel.type !== 'bool' && (
                  <section>
                    <h3>Calibration</h3>
                    <div className="input-three-fields">
                      {field(
                        'Minimum',
                        'min',
                        -2147483648,
                        2147483647,
                        channel.type === 'int' ? 1 : 0.01,
                      )}
                      {field(
                        'Center / resting value',
                        'center',
                        -2147483648,
                        2147483647,
                        channel.type === 'int' ? 1 : 0.01,
                      )}
                      {field(
                        'Maximum',
                        'max',
                        -2147483648,
                        2147483647,
                        channel.type === 'int' ? 1 : 0.01,
                      )}
                    </div>
                    <div className="field-pair">
                      {field('Dead zone (0–0.95)', 'deadzone', 0, 0.95, 0.01)}
                      {field('Smoothing (ms)', 'smoothingMs', 0, 60000, 1)}
                    </div>
                    <label className="input-checkbox">
                      <input
                        type="checkbox"
                        checked={channel.invert}
                        onChange={(e) => update({ invert: e.target.checked })}
                      />
                      Invert direction
                    </label>
                    {!['none', 'moveX', 'moveY'].includes(channel.binding) && (
                      <div className="field-pair">
                        {field('Press threshold', 'pressThreshold', 0.01, 1, 0.01)}
                        {field('Release threshold', 'releaseThreshold', 0, 0.99, 0.01)}
                      </div>
                    )}
                  </section>
                )}
                <div className="field-pair">
                  {field('Release after silence (ms)', 'timeoutMs', 0, 60000, 1)}
                  <p className="field-hint">
                    500 ms is a good starting point. Zero holds the last value until explicitly
                    disconnected.
                  </p>
                </div>
                <section className="input-preview">
                  <h3>
                    Calibration preview <small>simulated values</small>
                  </h3>
                  {channel.type === 'bool' ? (
                    <label className="input-checkbox">
                      <input
                        type="checkbox"
                        aria-label="Test button pressed"
                        checked={Boolean(testValue)}
                        onChange={(e) => setTestValue(e.target.checked)}
                      />
                      Button pressed
                    </label>
                  ) : (
                    <input
                      aria-label="Test raw value"
                      type="range"
                      min={channel.min}
                      max={channel.max}
                      step={channel.type === 'int' ? 1 : 'any'}
                      value={typeof testValue === 'number' ? testValue : channel.center}
                      onChange={(e) => setTestValue(e.target.valueAsNumber)}
                    />
                  )}
                  <div className="input-preview-values">
                    <span>
                      Raw <b>{String(testValue)}</b>
                    </span>
                    <span>
                      Normalized <b>{previewInput(channel, testValue).toFixed(3)}</b>
                    </span>
                  </div>
                  <meter
                    aria-label="Normalized input magnitude"
                    min={0}
                    max={1}
                    value={Math.abs(previewInput(channel, testValue))}
                  />
                </section>
                <details open={source.kind === 'serial' || source.kind === 'ble'}>
                  <summary>Device & packet layout</summary>
                  <label className="block-label">
                    Device name
                    <input
                      value={source.name}
                      maxLength={128}
                      onChange={(e) =>
                        onChange({
                          ...config,
                          sources: config.sources.map((s) =>
                            s.id === source.id ? { ...s, name: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <p className="field-hint">
                    Source ID <code>UI_DEVICE_{source.id.toUpperCase()}</code>. Offsets include the
                    report ID byte, if used.
                  </p>
                  <label className="block-label">
                    Report ID (blank = no prefix)
                    <input
                      aria-label="Report ID"
                      type="number"
                      min={0}
                      max={255}
                      value={source.reportId ?? ''}
                      onChange={(e) =>
                        onChange({
                          ...config,
                          sources: config.sources.map((s) =>
                            s.id === source.id
                              ? {
                                  ...s,
                                  reportId:
                                    e.target.value === ''
                                      ? undefined
                                      : Math.max(
                                          0,
                                          Math.min(255, Math.round(e.target.valueAsNumber)),
                                        ),
                                }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="input-three-fields">
                    <label className="block-label">
                      Encoding
                      <select
                        aria-label="Packet encoding"
                        value={channel.wire.encoding}
                        onChange={(e) =>
                          update({
                            wire: {
                              ...channel.wire,
                              encoding: e.target.value as InputChannel['wire']['encoding'],
                            },
                          })
                        }
                      >
                        {inputEncodings
                          .filter((v) =>
                            channel.type === 'bool'
                              ? ['none', 'bit'].includes(v)
                              : v !== 'bit' && (channel.type === 'float' || v !== 'f32le'),
                          )
                          .map((v) => (
                            <option value={v} key={v}>
                              {v === 'none' ? 'Direct API / text' : v}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block-label">
                      Byte offset
                      <input
                        aria-label="Byte offset"
                        type="number"
                        min={0}
                        max={63}
                        value={channel.wire.offset}
                        onChange={(e) =>
                          update({
                            wire: {
                              ...channel.wire,
                              offset: Math.max(
                                0,
                                Math.min(63, Math.round(e.target.valueAsNumber || 0)),
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    {channel.wire.encoding === 'bit' && (
                      <label className="block-label">
                        Bit (0–7)
                        <input
                          aria-label="Button bit"
                          type="number"
                          min={0}
                          max={7}
                          value={channel.wire.bit}
                          onChange={(e) =>
                            update({
                              wire: {
                                ...channel.wire,
                                bit: Math.max(
                                  0,
                                  Math.min(7, Math.round(e.target.valueAsNumber || 0)),
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                </details>
                <details>
                  <summary>Connect from firmware</summary>
                  <p className="field-hint">
                    Initialize hardware in your board port, then publish typed values. The game
                    polls and applies them on its own thread.
                  </p>
                  <pre>{`ui_input_set_${channel.type}(UI_CHANNEL_${channel.id.toUpperCase()}, ${channel.type === 'bool' ? 'pressed' : channel.type === 'int' ? 'adc_raw' : 'sensor_value'});\n\n/* Read in a game update hook: */\n${channel.type === 'int' ? 'int32_t' : channel.type === 'bool' ? 'bool' : 'float'} value;\nif (ui_input_read_${channel.type}(UI_CHANNEL_${channel.id.toUpperCase()}, &value)) {\n    /* Use the physical value. */\n}`}</pre>
                  {source.kind === 'serial' && (
                    <pre>{`/* One zero-initialized parser per stream. */\nui_input_serial_feed(&parser, UI_DEVICE_${source.id.toUpperCase()}, bytes, length);\n/* Text: ${channel.id}=${channel.type === 'bool' ? 'true' : channel.center}\\n */`}</pre>
                  )}
                  {source.kind === 'ble' && (
                    <pre>{`/* GATT/HID notification, configured report layout: */\nui_input_report(UI_DEVICE_${source.id.toUpperCase()}, bytes, length);\n/* Connection lost: */\nui_input_disconnect(UI_DEVICE_${source.id.toUpperCase()});`}</pre>
                  )}
                  <p className="field-hint">
                    ADC, serial and BLE drivers belong to the board port. Worker/ISR publishers
                    require ui_config_t.input_lock. Exported INPUTS.md includes integration and
                    threading examples.
                  </p>
                </details>
              </main>
            ) : (
              <div className="input-empty">
                <h2>One input API, any controller</h2>
                <p>
                  Use integers for ADC counts and encoders, floats for measured values, and booleans
                  for buttons. Add a channel under a device to begin.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {!validInputs(config) && (
        <p role="alert" className="input-error">
          Check calibration: minimum &lt; maximum, center inside range, release &lt; press. Names
          must not be empty and packet fields must fit 64 bytes.
        </p>
      )}
      <div className="modal-actions input-footer">
        <small>
          {config.channels.length}/32 channels · {config.sources.length}/8 devices · ≤{' '}
          {inputRamBytes(config)} bytes estimated engine RAM + decoding workspace
        </small>
        <button className="primary" disabled={!validInputs(config)} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
