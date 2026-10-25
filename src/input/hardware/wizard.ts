import { makeInputChannel, validInputs, type InputChannel, type InputConfig } from '../model';
import { hardwareInputIssues, type DkHardwareInputs, type HardwarePin } from './model';
export interface ControllerDraft {
  joystick: boolean;
  xPin: string;
  yPin: string;
  invertY: boolean;
  sampleHz: DkHardwareInputs['sampleHz'];
  factoryA4Routing: boolean;
  buttons: {
    id: string;
    name: string;
    pin: string;
    binding: InputChannel['binding'];
    pull: HardwarePin['pull'];
    activeLow: boolean;
    debounceMs: number;
  }[];
}
export function controllerDraft(config: InputConfig): ControllerDraft {
  const h = config.hardware,
    axes = h?.pins.filter((p) => p.kind === 'adc') ?? [];
  return {
    joystick: !h || axes.length > 0,
    xPin: axes[0]?.pin ?? 'PC0',
    yPin: axes[1]?.pin ?? 'PC2',
    invertY: config.channels.find((c) => c.id === axes[1]?.channel)?.invert ?? true,
    sampleHz: h?.sampleHz ?? 100,
    factoryA4Routing: h?.factoryA4Routing ?? false,
    buttons: h
      ? h.pins
          .filter((p) => p.kind === 'gpio')
          .map((p) => {
            const c = config.channels.find((c) => c.id === p.channel)!;
            return {
              id: c.id,
              name: c.name,
              pin: p.pin,
              binding: c.binding,
              pull: p.pull,
              activeLow: p.activeLow,
              debounceMs: p.debounceMs,
            };
          })
      : [
          {
            id: 'action',
            name: 'Action button',
            pin: 'PC13',
            binding: 'action',
            pull: 'down',
            activeLow: false,
            debounceMs: 20,
          },
        ],
  };
}
/** Replace only this wizard's previous acquisition group. Other devices and
 * user channels survive, and existing hardware IDs/calibration remain stable. */
export function planController(
  config: InputConfig,
  draft: ControllerDraft,
): { config: InputConfig; errors: string[] } {
  const old = config.hardware;
  let source = old?.source ?? 'controller',
    n = 2;
  while (!old && config.sources.some((s) => s.id.toLowerCase() === source.toLowerCase()))
    source = 'controller_' + n++;
  const managed = new Set(old?.pins.map((p) => p.channel) ?? []);
  const channels = config.channels.filter((c) => !managed.has(c.id));
  const pins: HardwarePin[] = [];
  const unique = (base: string) => {
    let id = base,
      i = 2;
    while (channels.some((c) => c.id.toLowerCase() === id.toLowerCase())) id = base + '_' + i++;
    return id;
  };
  const priorAxes = old?.pins.filter((p) => p.kind === 'adc') ?? [];
  const add = (
    base: string,
    name: string,
    pin: string,
    kind: 'adc' | 'gpio',
    binding: InputChannel['binding'],
    settings: Partial<HardwarePin> = {},
    invert = false,
    priorId?: string,
  ) => {
    const prior = config.channels.find((c) => c.id === priorId);
    const id = prior?.id ?? unique(source + '_' + base);
    const c = prior ? { ...prior } : makeInputChannel(id, source, kind === 'adc' ? 'int' : 'bool');
    Object.assign(c, { name, binding, invert, timeoutMs: 1500 });
    channels.push(c);
    pins.push({
      channel: id,
      pin,
      kind,
      pull: 'none',
      activeLow: false,
      debounceMs: 0,
      ...settings,
    });
  };
  if (draft.joystick) {
    add('x', 'Joystick horizontal', draft.xPin, 'adc', 'moveX', {}, false, priorAxes[0]?.channel);
    add(
      'y',
      'Joystick vertical',
      draft.yPin,
      'adc',
      'moveY',
      {},
      draft.invertY,
      priorAxes[1]?.channel,
    );
  }
  draft.buttons.forEach((b, i) =>
    add(
      'button_' + (i + 1),
      b.name,
      b.pin,
      'gpio',
      b.binding,
      { pull: b.pull, activeLow: b.activeLow, debounceMs: b.debounceMs },
      false,
      managed.has(b.id) ? b.id : undefined,
    ),
  );
  const hardware: DkHardwareInputs = {
    board: 'stm32h7s78-dk',
    version: 1,
    source,
    sampleHz: draft.sampleHz,
    factoryA4Routing: draft.factoryA4Routing,
    pins,
  };
  const sources = config.sources.some((s) => s.id === source)
    ? config.sources
    : [...config.sources, { id: source, name: 'DK joystick & buttons', kind: 'custom' as const }];
  const next: InputConfig = { ...config, sources, channels, hardware };
  const errors = hardwareInputIssues(hardware, channels);
  if (!pins.length)
    errors.splice(0, errors.length, 'Enable a joystick or add at least one button.');
  if (!validInputs(next) && !errors.length)
    errors.push(
      'Check channel limits, names and calibration. Up to 32 channels and 8 devices are supported.',
    );
  return { config: next, errors };
}
