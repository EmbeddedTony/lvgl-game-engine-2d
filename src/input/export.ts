import type { Project } from '../model';
import type { InputChannel, InputSource, InputType } from './model';
const float = (n: number) => `${Number(n).toExponential(8)}f`;
const valueType: Record<InputType, string> = {
  int: 'LGE_VALUE_INT',
  float: 'LGE_VALUE_FLOAT',
  bool: 'LGE_VALUE_BOOL',
};
const binding: Record<InputChannel['binding'], string> = {
  none: 'NONE',
  moveX: 'MOVE_X',
  moveY: 'MOVE_Y',
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP',
  down: 'DOWN',
  action: 'ACTION',
  interact: 'INTERACT',
  menu: 'MENU',
};
const encoding: Record<InputChannel['wire']['encoding'], string> = {
  none: 'NONE',
  i8: 'I8',
  u8: 'U8',
  i16le: 'I16_LE',
  u16le: 'U16_LE',
  i32le: 'I32_LE',
  f32le: 'F32_LE',
  bit: 'BIT',
};
function channelDefinition(c: InputChannel, sources: InputSource[]) {
  return `    {.id=${JSON.stringify(c.id)}, .source=${sources.findIndex((s) => s.id === c.source)},
     .type=${valueType[c.type]}, .binding=LGE_INPUT_BIND_${binding[c.binding]},
     .minimum=${float(c.min)}, .center=${float(c.center)}, .maximum=${float(c.max)},
     .deadzone=${float(c.deadzone)}, .press=${float(c.pressThreshold)}, .release=${float(c.releaseThreshold)},
     .smoothing_ms=${c.smoothingMs}, .timeout_ms=${c.timeoutMs}, .invert=${c.invert},
     .encoding=LGE_WIRE_${encoding[c.wire.encoding]}, .offset=${c.wire.offset}, .bit=${c.wire.bit}}`;
}
export function inputFiles(p: Project) {
  const { sources, channels } = p.inputs ?? { sources: [], channels: [] };
  return {
    'ui/generated/game_inputs.h': `/* Generated hardware channels; keep game hooks in user/. */
#ifndef GAME_INPUTS_H
#define GAME_INPUTS_H
#include "../engine/lge_input_codec.h"
#define GAME_INPUT_COUNT ${channels.length}
#define GAME_INPUT_SOURCE_COUNT ${sources.length}
extern const lge_input_def_t game_inputs[${Math.max(1, channels.length)}];
extern const lge_input_source_t game_input_sources[${Math.max(1, sources.length)}];
#endif
`,
    'ui/generated/game_inputs.c': `#include "game_inputs.h"
const lge_input_source_t game_input_sources[${Math.max(1, sources.length)}]={${sources.map((s) => `{${s.reportId ?? 256}}`).join(',') || '{256}'}};
const lge_input_def_t game_inputs[${Math.max(1, channels.length)}]={
${channels.map((c) => channelDefinition(c, sources)).join(',\n') || '    {0}'}
};
`,
    'ui/ui_inputs.h': `/* Stable channel identifiers: label edits do not change these names. */
#ifndef UI_INPUT_CHANNEL_IDS_H
#define UI_INPUT_CHANNEL_IDS_H
#include "generated/game_inputs.h"
${channels.length ? `typedef enum { ${channels.map((c, i) => `UI_CHANNEL_${c.id.toUpperCase()} = ${i}`).join(', ')} } ui_input_channel_t;` : ''}
${sources.length ? `typedef enum { ${sources.map((s, i) => `UI_DEVICE_${s.id.toUpperCase()} = ${i}`).join(', ')} } ui_input_device_t;` : ''}
#endif
`,
  };
}
export const inputHeader = `/* Physical channels: publishers may run in ISR/workers ONLY with input_lock.
 * Reads and all ordinary game/UI functions remain on the LVGL owner thread.
 * Values become visible at the next owner poll, including while paused. */
bool ui_input_set_int(unsigned channel, int32_t value);
bool ui_input_set_float(unsigned channel, float value);
bool ui_input_set_bool(unsigned channel, bool value);
bool ui_input_publish(const lge_input_sample_t *samples, size_t count);
bool ui_input_read_int(unsigned channel, int32_t *out);
bool ui_input_read_float(unsigned channel, float *out);
bool ui_input_read_bool(unsigned channel, bool *out);
float ui_input_normalized(unsigned channel); /* -1..1, +X right, +Y up. */
bool ui_input_active(unsigned channel); /* False before first sample or after timeout/disconnect. */
bool ui_input_disconnect(unsigned device);
bool ui_input_report(unsigned device, const void *bytes, size_t size);
unsigned ui_input_serial_feed(lge_input_serial_t *parser, unsigned device, const void *bytes, size_t size);
`;
export const inputSource = `
#if GAME_INPUT_COUNT > 0
static lge_inputs_t physical_inputs;
#endif
static lge_inputs_t *input_bank(void) {
#if GAME_INPUT_COUNT > 0
    return ready ? &physical_inputs : NULL;
#else
    return NULL;
#endif
}
static bool inputs_init(const lge_input_lock_t *lock) {
#if GAME_INPUT_COUNT > 0
    return lge_inputs_init(&physical_inputs,game_inputs,GAME_INPUT_COUNT,game_input_sources,GAME_INPUT_SOURCE_COUNT,lock);
#else
    return !lock || (!!lock->enter == !!lock->leave);
#endif
}
static void inputs_update(uint32_t now,uint32_t elapsed) {
    lge_input_frame_t f=lge_inputs_poll(input_bank(),now,elapsed);
    lge_set_controller_input(&view.engine,f.actions,f.pressed,f.x,f.y);
}
bool ui_input_set_int(unsigned id,int32_t v) { return lge_inputs_set_int(input_bank(),id,v); }
bool ui_input_set_float(unsigned id,float v) { return lge_inputs_set_float(input_bank(),id,v); }
bool ui_input_set_bool(unsigned id,bool v) { return lge_inputs_set_bool(input_bank(),id,v); }
bool ui_input_publish(const lge_input_sample_t *s,size_t n) { return lge_inputs_publish(input_bank(),s,n); }
bool ui_input_read_int(unsigned id,int32_t *out) { lge_input_value_t v; if(!out||!lge_inputs_read(input_bank(),id,LGE_VALUE_INT,&v))return false;*out=v.integer;return true; }
bool ui_input_read_float(unsigned id,float *out) { lge_input_value_t v;if(!out||!lge_inputs_read(input_bank(),id,LGE_VALUE_FLOAT,&v))return false;*out=v.real;return true; }
bool ui_input_read_bool(unsigned id,bool *out) { lge_input_value_t v;if(!out||!lge_inputs_read(input_bank(),id,LGE_VALUE_BOOL,&v))return false;*out=v.boolean;return true; }
float ui_input_normalized(unsigned id) { return lge_inputs_normalized(input_bank(),id); }
bool ui_input_active(unsigned id) { return lge_inputs_active(input_bank(),id); }
bool ui_input_disconnect(unsigned id) { return lge_inputs_disconnect(input_bank(),id); }
bool ui_input_report(unsigned id,const void *bytes,size_t size) { return lge_inputs_report(input_bank(),id,bytes,size); }
unsigned ui_input_serial_feed(lge_input_serial_t *p,unsigned id,const void *bytes,size_t size) {return lge_inputs_serial_feed(input_bank(),p,id,bytes,size);}
`;
export function inputGuide(p: Project) {
  const c = p.inputs?.channels[0],
    s = p.inputs?.sources[0];
  return `# Physical controllers and sensor values

Configure **Project → Inputs & controllers**. Channels are typed int32, float32 or bool. Give them stable IDs, select their source, and optionally bind to movement or a game action. Display labels may change independently. Unbound channels are available to game hooks for arbitrary sensor gameplay. The exported ui_inputs.h lists every UI_CHANNEL_* and UI_DEVICE_* identifier.

${c ? `First channel: UI_CHANNEL_${c.id.toUpperCase()} (${c.type}), source UI_DEVICE_${s?.id.toUpperCase()}.` : 'No channels configured. Existing keyboard/touch inputs continue to work and no input bank is allocated.'}

## Live editor monitoring

Open Project → Inputs & controllers → Live monitor to connect USB serial or BLE, view raw and normalized values, capture center/range and test game bindings in native C. ADC values can be streamed from your board as channel=value lines. See [Live input monitor](LiveInputMonitor.md). Monitoring starts with Drive game disabled; calibrated settings are saved in the project.

## ADC and GPIO

Poll board drivers on the LVGL owner thread after ui_init():

\`\`\`c
/* IDs below correspond to the ADC joystick preset. */
ui_input_set_int(UI_CHANNEL_ADC_X, adc_x_raw);
ui_input_set_int(UI_CHANNEL_ADC_Y, adc_y_raw);
ui_input_set_bool(UI_CHANNEL_ADC_ACTION, gpio_button_pressed);
\`\`\`

Raw ADC values stay int32; floats are suitable for a calibrated sensor, throttle or IMU. Bool is logical pressed, so invert active-low GPIO in the board adapter. Configure min/center/max, deadzone and optional smoothing. +X is right, +Y is up; the preset inverts raw Y. Top-down, grid and platform controllers consume the channels automatically. Grid mode quantizes directions; other modes preserve joystick magnitude. Keyboard/touch and other controllers merge by strongest axis and OR buttons.

For coherent X/Y pairs call ui_input_publish() with two lge_input_sample_t entries and designated .value.integer / .value.real / .value.boolean. Validation is atomic: bad IDs, duplicate IDs, wrong types and non-finite floats reject the entire batch. ui_input_read_int/float/bool returns false while inactive and leaves output untouched. ui_input_normalized returns zero when inactive. Reads and game hooks run on the owner thread after publication is drained.

## UART / USB serial

Use one zero-initialized lge_input_serial_t per stream. Feed any fragments using ui_input_serial_feed(&parser, UI_DEVICE_SERIAL, bytes, length). The default text protocol is **channel_id=value\\n**, e.g. serial_x=2048, serial_y=1024 and serial_action=true, each followed by newline. Bool accepts true/false/1/0; float accepts finite decimal/exponent values. Unknown channels, source mismatches, malformed values and overlong lines are discarded. The parser resynchronizes at the next newline. One stream must have one producer. For coherent high-rate samples use the binary report API instead of independent lines.

## BLE controllers

The board provides a BLE stack, pairing/subscription and GATT/HID notification delivery. Configure the source's report ID (optional) and each channel's byte offset, little-endian encoding or button bit. Offsets include the report ID byte when present. **There is no universal BLE gamepad byte layout**: match the peripheral's report descriptor/service. The BLE preset is a simple custom 5-byte report: uint16 X, uint16 Y, action in bit 0 of byte 4; axes 0..4095 centered at 2048.

\`\`\`c
/* Notification bytes must be contiguous. Copy fragmented stack buffers first. */
bool accepted = ui_input_report(UI_DEVICE_BLE, bytes, length);
/* On radio/link loss: */
ui_input_disconnect(UI_DEVICE_BLE);
\`\`\`

Each report validates every mapped field before publishing. Maximum report length is 64 bytes. A truncated report, wrong report ID or NaN/Infinity changes nothing. Serial and BLE share the exact same typed channel bank. No stack or radio is silently assumed; add the transport to your existing board port. See [Zephyr input](https://docs.zephyrproject.org/latest/services/input/index.html) for grouped event delivery and [ESP-IDF NimBLE examples](https://github.com/espressif/esp-idf/tree/master/examples/bluetooth/nimble) for notification/connection callbacks.

## Threading, disconnects and memory

Default publication is owner-thread only. For ADC ISR, UART DMA callbacks or BLE worker callbacks, provide BOTH ui_config_t.input_lock callbacks. enter returns a platform token; leave restores it. Use the same critical section for the producer and owner. Bare-metal single-core Cortex-M can save PRIMASK, disable IRQs, then restore PRIMASK. RTOS/multicore ports need their appropriate ISR-safe lock; do not use a blocking mutex in an ISR. Locks protect only short fixed-size publication/snapshot copies. No HAL, rendering, heap allocation or game callback occurs there. Start producers only after ui_init succeeds; stop/join them before ui_deinit/reinitializing the UI.

Configure timeouts for sampled/radio inputs (presets: 500 ms); timeout 0 intentionally holds the last value forever. Explicit disconnect releases every channel from that source on the next owner poll; timeout releases within one poll after the configured silence. A new valid sample reactivates it. Paused games still drain inputs/timeouts and discard button edges, avoiding delayed jumps. SWD exclusive input has priority. Boolean taps are latched between polls; numeric threshold buttons are evaluated at poll frequency, so use bool for short pulses. GPIO debouncing belongs in the driver; numeric buttons offer press/release hysteresis. No per-sample queue grows with ADC rate. Limits: 8 sources, 32 channels, 96-byte serial line. Generated capacity equals the authored channel count; channels are session state across scenes and are excluded from persistent saves. Target guidance includes the bank and bounded decoding workspace. BLE stack buffers/driver RAM remain board-owned.
`;
}
