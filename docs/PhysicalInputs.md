# Physical controllers and sensor values

Configure **Project → Inputs & controllers**. Channels are typed int32, float32 or bool. Give them stable IDs, select their source, and optionally bind to movement or a game action. Display labels may change independently. Unbound channels are available to game hooks for arbitrary sensor gameplay. The exported ui_inputs.h lists every UI_CHANNEL_* and UI_DEVICE_* identifier.

First channel: UI_CHANNEL_ADC_X (int), source UI_DEVICE_ADC.

## Live editor monitoring

Open Project → Inputs & controllers → Live monitor to connect USB serial or BLE, view raw and normalized values, capture center/range and test game bindings in native C. ADC values can be streamed from your board as channel=value lines. See [Live input monitor](LiveInputMonitor.md). Monitoring starts with Drive game disabled; calibrated settings are saved in the project.

## ADC and GPIO

Poll board drivers on the LVGL owner thread after ui_init():

```c
/* IDs below correspond to the ADC joystick preset. */
ui_input_set_int(UI_CHANNEL_ADC_X, adc_x_raw);
ui_input_set_int(UI_CHANNEL_ADC_Y, adc_y_raw);
ui_input_set_bool(UI_CHANNEL_ADC_ACTION, gpio_button_pressed);
```

For coherent X/Y pairs call ui_input_publish() with two lge_input_sample_t entries and designated .value.integer / .value.real / .value.boolean. Validation is atomic: bad IDs, duplicate IDs, wrong types and non-finite floats reject the entire batch. ui_input_read_int/float/bool returns false while inactive and leaves output untouched. ui_input_normalized returns zero when inactive. Reads and game hooks run on the owner thread after publication is drained.

## UART / USB serial

Use one zero-initialized lge_input_serial_t per stream. Feed any fragments using ui_input_serial_feed(&parser, UI_DEVICE_SERIAL, bytes, length). The default text protocol is **channel_id=value\n**, e.g. serial_x=2048, serial_y=1024 and serial_action=true, each followed by newline. Bool accepts true/false/1/0; float accepts finite decimal/exponent values. Unknown channels, source mismatches, malformed values and overlong lines are discarded. The parser resynchronizes at the next newline. One stream must have one producer. For coherent high-rate samples use the binary report API instead of independent lines.

## BLE controllers

The board provides a BLE stack, pairing/subscription and GATT/HID notification delivery. Configure the source's report ID (optional) and each channel's byte offset, little-endian encoding or button bit. Offsets include the report ID byte when present. **There is no universal BLE gamepad byte layout**: match the peripheral's report descriptor/service. The BLE preset is a simple custom 5-byte report: uint16 X, uint16 Y, action in bit 0 of byte 4; axes 0..4095 centered at 2048.

```c
/* Notification bytes must be contiguous. Copy fragmented stack buffers first. */
bool accepted = ui_input_report(UI_DEVICE_BLE, bytes, length);
/* On radio/link loss: */
ui_input_disconnect(UI_DEVICE_BLE);
```

Each report validates every mapped field before publishing. Maximum report length is 64 bytes. A truncated report, wrong report ID or NaN/Infinity changes nothing. Serial and BLE share the exact same typed channel bank. No stack or radio is silently assumed; add the transport to your existing board port. See [Zephyr input](https://docs.zephyrproject.org/latest/services/input/index.html) for grouped event delivery and [ESP-IDF NimBLE examples](https://github.com/espressif/esp-idf/tree/master/examples/bluetooth/nimble) for notification/connection callbacks.

## Threading, disconnects and memory

Default publication is owner-thread only. For ADC ISR, UART DMA callbacks or BLE worker callbacks, provide BOTH ui_config_t.input_lock callbacks. enter returns a platform token; leave restores it. Use the same critical section for the producer and owner. Bare-metal single-core Cortex-M can save PRIMASK, disable IRQs, then restore PRIMASK. RTOS/multicore ports need their appropriate ISR-safe lock; do not use a blocking mutex in an ISR. Locks protect only short fixed-size publication/snapshot copies. No HAL, rendering, heap allocation or game callback occurs there. Start producers only after ui_init succeeds; stop/join them before ui_deinit/reinitializing the UI.

Configure timeouts for sampled/radio inputs (presets: 500 ms); timeout 0 intentionally holds the last value forever. Explicit disconnect releases every channel from that source on the next owner poll; timeout releases within one poll after the configured silence. A new valid sample reactivates it. Paused games still drain inputs/timeouts and discard button edges, avoiding delayed jumps. SWD exclusive input has priority. Boolean taps are latched between polls; numeric threshold buttons are evaluated at poll frequency, so use bool for short pulses. GPIO debouncing belongs in the driver; numeric buttons offer press/release hysteresis. No per-sample queue grows with ADC rate. Limits: 8 sources, 32 channels, 96-byte serial line. Generated capacity equals the authored channel count; channels are session state across scenes and are excluded from persistent saves. Target guidance includes the bank and bounded decoding workspace. BLE stack buffers/driver RAM remain board-owned.
