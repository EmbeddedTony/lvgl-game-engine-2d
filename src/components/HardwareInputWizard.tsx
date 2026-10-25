import { useEffect, useState } from 'react';
import type { Project } from '../model';
import { validInputs, type InputChannel, type InputConfig } from '../input/model';
import type { InputMonitorController } from '../input/monitor/useInputMonitor';
import { controllerDraft, planController, type ControllerDraft } from '../input/hardware/wizard';
import { dkPins, dkPin, pinLabel } from '../input/hardware/pins';
import { hardwareFiles } from '../input/hardware/export';
import { LiveInputMonitor } from './LiveInputMonitor';
import './HardwareInputWizard.css';

export function HardwareInputWizard({
  project,
  config,
  onChange,
  monitor,
  selected,
  onSelect,
  onOpenBoard,
  onEditCode,
  labels,
}: {
  project: Project;
  config: InputConfig;
  onChange: (config: InputConfig) => void;
  monitor: InputMonitorController;
  selected: string;
  onSelect: (id: string) => void;
  onOpenBoard?: () => void;
  onEditCode?: (line: number) => void;
  labels: Record<InputChannel['binding'], string>;
}) {
  const [draft, setDraft] = useState(() => controllerDraft(config));
  const [step, setStep] = useState(0);
  const profileKey = JSON.stringify(config.hardware ?? null);
  useEffect(() => setDraft(controllerDraft(config)), [profileKey]);
  const plan = planController(config, draft);
  const h = config.hardware;
  const update = (patch: Partial<ControllerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const pinSelect = (
    name: string,
    value: string,
    analog: boolean,
    change: (pin: string) => void,
  ) => (
    <label>
      {name}
      <select aria-label={name} value={value} onChange={(e) => change(e.target.value)}>
        {dkPins
          .filter((p) => !analog || p.adc || p.label === 'A5')
          .map((p) => (
            <option key={p.id} value={p.id} disabled={!!p.blocked}>
              {p.label} · {p.id}
              {p.adc ? ` · ADC${p.adc.instance}` : ''}
              {p.blocked ? ' · unavailable' : ''}
            </option>
          ))}
      </select>
      <small>
        {dkPin(value)?.connector}
        {dkPin(value)?.note && ` · ${dkPin(value)?.note}`}
      </small>
    </label>
  );
  const generate = () => {
    if (plan.errors.length) return;
    onChange(plan.config);
    onSelect(plan.config.hardware!.pins[0].channel);
    setStep(1);
  };
  return (
    <div className="hardware-wizard" data-testid="hardware-input-wizard">
      <nav className="hardware-steps" aria-label="Hardware input setup steps">
        {['Choose pins', 'Generate firmware', 'Calibrate & test'].map((name, i) => (
          <button
            key={name}
            aria-current={step === i ? 'step' : undefined}
            disabled={i > 0 && !h}
            onClick={() => setStep(i)}
          >
            <b>{i + 1}</b>
            {name}
          </button>
        ))}
      </nav>
      {step === 0 ? (
        <>
          <div className="hardware-intro">
            <h2>Wire a joystick and buttons</h2>
            <p>
              STM32H7S78-DK · Arduino headers · 3.3 V inputs. Display, touch, SWD and memory pins
              stay reserved.
            </p>
          </div>
          <div className="hardware-pin-layout">
            <section className="hardware-card">
              <label className="input-checkbox">
                <input
                  type="checkbox"
                  aria-label="Use analog joystick"
                  checked={draft.joystick}
                  onChange={(e) => update({ joystick: e.target.checked })}
                />
                Analog joystick
              </label>
              {draft.joystick && (
                <>
                  <div className="hardware-fields">
                    {pinSelect('Joystick X pin', draft.xPin, true, (xPin) => update({ xPin }))}
                    {pinSelect('Joystick Y pin', draft.yPin, true, (yPin) => update({ yPin }))}
                  </div>
                  <label className="input-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.invertY}
                      onChange={(e) => update({ invertY: e.target.checked })}
                    />
                    Invert vertical axis (up is positive)
                  </label>
                  <p className="field-hint">
                    VRx → X pin · VRy → Y pin · VCC → CN12 pin 4 (+3V3) · GND → CN12 pin 6 or 7.
                    Keep analog outputs within 0–3.3 V.
                  </p>
                </>
              )}
              <label>
                Sample rate
                <select
                  aria-label="Hardware sample rate"
                  value={draft.sampleHz}
                  onChange={(e) =>
                    update({ sampleHz: Number(e.target.value) as ControllerDraft['sampleHz'] })
                  }
                >
                  <option value="50">50 Hz · low overhead</option>
                  <option value="100">100 Hz · recommended</option>
                  <option value="200">200 Hz · fast controls</option>
                </select>
              </label>
              <p className="field-hint">
                Acquisition runs independently of rendering. The monitor reports the slower serial
                display rate.
              </p>
              {(draft.xPin === 'PF13' ||
                draft.yPin === 'PF13' ||
                draft.buttons.some((b) => b.pin === 'PF13')) && (
                <label className="input-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.factoryA4Routing}
                    onChange={(e) => update({ factoryA4Routing: e.target.checked })}
                  />
                  A4 uses factory routing: SB26 ON, SB27 OFF
                </label>
              )}
            </section>
            <section className="hardware-card">
              <div className="hardware-card-title">
                <h2>Buttons</h2>
                <button
                  className="secondary"
                  disabled={draft.buttons.length >= 8}
                  onClick={() =>
                    update({
                      buttons: [
                        ...draft.buttons,
                        {
                          id: 'new_' + Date.now(),
                          name: `Button ${draft.buttons.length + 1}`,
                          pin:
                            dkPins.find(
                              (p) =>
                                !p.blocked &&
                                !p.builtIn &&
                                !p.adc &&
                                !draft.buttons.some((b) => b.pin === p.id),
                            )?.id ?? 'PF1',
                          binding: 'interact',
                          pull: 'up',
                          activeLow: true,
                          debounceMs: 20,
                        },
                      ],
                    })
                  }
                >
                  + Add button
                </button>
              </div>
              {draft.buttons.map((b, i) => (
                <div className="hardware-button" key={b.id}>
                  <div className="hardware-card-title">
                    <label>
                      Button name
                      <input
                        aria-label={`Button ${i + 1} name`}
                        value={b.name}
                        maxLength={128}
                        onChange={(e) =>
                          update({
                            buttons: draft.buttons.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      className="secondary"
                      aria-label={`Remove button ${i + 1}`}
                      onClick={() => update({ buttons: draft.buttons.filter((_, j) => j !== i) })}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="hardware-fields">
                    {pinSelect(`Button ${i + 1} pin`, b.pin, false, (pin) =>
                      update({
                        buttons: draft.buttons.map((x, j) =>
                          i === j
                            ? {
                                ...x,
                                pin,
                                ...(pin === 'PC13'
                                  ? { pull: 'down' as const, activeLow: false }
                                  : {}),
                              }
                            : x,
                        ),
                      }),
                    )}
                    <label>
                      Game action
                      <select
                        aria-label={`Button ${i + 1} binding`}
                        value={b.binding}
                        onChange={(e) =>
                          update({
                            buttons: draft.buttons.map((x, j) =>
                              i === j
                                ? { ...x, binding: e.target.value as InputChannel['binding'] }
                                : x,
                            ),
                          })
                        }
                      >
                        {(
                          [
                            'action',
                            'interact',
                            'menu',
                            'left',
                            'right',
                            'up',
                            'down',
                            'none',
                          ] as const
                        ).map((v) => (
                          <option value={v} key={v}>
                            {labels[v]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!dkPin(b.pin)?.builtIn && (
                    <div className="hardware-fields">
                      <label>
                        Button wiring
                        <select
                          aria-label={`Button ${i + 1} wiring`}
                          value={`${b.pull}:${b.activeLow}`}
                          onChange={(e) => {
                            const [pull, low] = e.target.value.split(':');
                            update({
                              buttons: draft.buttons.map((x, j) =>
                                i === j
                                  ? { ...x, pull: pull as typeof b.pull, activeLow: low === 'true' }
                                  : x,
                              ),
                            });
                          }}
                        >
                          <option value="up:true">
                            Pin to GND when pressed · internal pull-up
                          </option>
                          <option value="down:false">
                            Pin to 3V3 when pressed · internal pull-down
                          </option>
                          <option value="none:true">External resistor · pressed low</option>
                          <option value="none:false">External resistor · pressed high</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <label>
                    Debounce (ms)
                    <input
                      aria-label={`Button ${i + 1} debounce`}
                      type="number"
                      min="0"
                      max="100"
                      value={b.debounceMs}
                      onChange={(e) =>
                        update({
                          buttons: draft.buttons.map((x, j) =>
                            i === j ? { ...x, debounceMs: e.target.valueAsNumber } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <small>
                    {dkPin(b.pin)?.builtIn
                      ? 'B2 is already wired on the board: active high, pull-down.'
                      : 'Button inputs latch short taps between game frames.'}
                  </small>
                </div>
              ))}
            </section>
          </div>
          <details className="hardware-reserved">
            <summary>Reserved and shared pins</summary>
            <p>
              {dkPins
                .filter((p) => p.blocked)
                .map((p) => `${p.label} (${p.id}): ${p.blocked}`)
                .join(' · ')}
            </p>
          </details>
          {plan.errors.length > 0 && (
            <div role="alert" className="hardware-errors">
              {plan.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
          <div className="hardware-actions">
            <span>
              Pin changes are applied together when you generate. Other controllers are preserved.
            </span>
            <button className="primary" disabled={plan.errors.length > 0} onClick={generate}>
              Generate controller bindings
            </button>
          </div>
        </>
      ) : step === 1 && h ? (
        <>
          <div className="hardware-intro">
            <h2>Your firmware bindings are ready</h2>
            <p>
              The project now contains the pin map, typed channels and calibration. Export includes
              a board driver and wiring guide.
            </p>
          </div>
          <div className="hardware-generated">
            <table aria-label="Generated hardware bindings">
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Connect to</th>
                  <th>Game binding</th>
                </tr>
              </thead>
              <tbody>
                {h.pins.map((p) => {
                  const c = config.channels.find((c) => c.id === p.channel)!;
                  return (
                    <tr key={p.channel}>
                      <td>
                        {c.name}
                        <small>UI_CHANNEL_{c.id.toUpperCase()}</small>
                      </td>
                      <td>{pinLabel(p.pin)}</td>
                      <td>{labels[c.binding]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <details>
              <summary>Generated C pin definitions</summary>
              <pre>{hardwareFiles(config)['ui/ports/hardware_inputs_config.c']}</pre>
            </details>
            <p>
              Firmware owns TIM3
              {h.pins.some((p) => p.kind === 'adc') ? ' and the selected ADCs' : ''}. It uses
              bounded interrupt sampling, debounced buttons and the existing typed input API.
            </p>
            <p>
              Build and flash the application to use these pins. Keep{' '}
              <strong>Install board bootloader</strong> unchecked; the working bootloader and
              existing checkpoint schema remain separate. Pin changes require a new application
              build.
            </p>
            <p>
              For calibration, enable <strong>Stream inputs over ST-LINK serial</strong>. Then
              return to this wizard and choose Calibrate & test.
            </p>
          </div>
          <div className="hardware-actions">
            <button className="secondary" onClick={() => setStep(0)}>
              Edit pins
            </button>
            <div>
              {onOpenBoard && (
                <button className="secondary" onClick={onOpenBoard}>
                  Open Build & flash
                </button>
              )}{' '}
              <button className="primary" onClick={() => setStep(2)}>
                Calibrate & test
              </button>
            </div>
          </div>
        </>
      ) : h ? (
        <>
          <div className="hardware-intro">
            <h2>Calibrate the real controls</h2>
            <p>
              Connect STLINK-V3 at 115200. Select each joystick axis, capture its resting center,
              then capture its full travel. Press each button and check the game action.
            </p>
            <p>
              The monitor checks the firmware pin profile before accepting calibration. Build &
              flash again after changing pins or to install captured calibration on the DK.
            </p>
          </div>
          <LiveInputMonitor
            project={{ ...project, inputs: config }}
            monitor={monitor}
            selected={selected || h.pins[0].channel}
            onSelect={onSelect}
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
        </>
      ) : null}
    </div>
  );
}
