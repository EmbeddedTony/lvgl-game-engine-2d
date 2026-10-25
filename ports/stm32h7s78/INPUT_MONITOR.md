# STM32H7S78-DK live input bridge

Build a current DK export with `scripts/build-stm32h7s78.py --ui /path/to/ui
--out /path/to/build --input-monitor` (optional `--debug-swd`). This is a build
option, off by default. It does not program a board. Use the application's
sector-preserving external-flash workflow; leave Boot, options and checkpoint
sectors untouched.

The bridge owns UART4 TX on PD1 AF8, connected to ST-LINK's CN7 Virtual COM Port
by the board. Connect at **115200, 8N1, no flow control**. It has no RX/command
handler and never writes storage. It retains the existing UART kernel clock mux.
Close other serial terminals before connecting the editor.

In **Project → Inputs & controllers**, add **DK touch & button**, select **Live
monitor**, then **Connect serial** and choose the ST-LINK port. On macOS its name
usually contains `usbmodem`. Use Monitor only first, then Show game test / Build &
run / Drive game to test the bindings in the desktop C runtime. Opening a port
does not flash the board.

Built-in channel IDs (reserved for this bridge):

| ID | Type | Meaning |
| --- | --- | --- |
| dk_touch_x | int | Touch screen X, 0–799; 400 when released |
| dk_touch_y | int | Touch screen Y, 0–479; 240 when released |
| dk_touch_down | bool | Touch pressed |
| dk_button | bool | Blue B2 / PC13, active high, 25ms debounce |
| dk_uptime | float | Board uptime in seconds, wraps with the HAL millisecond tick |

These values are read from the board's existing LVGL input device and GPIO.
They do not change how the game on the DK receives touch. The desktop preset
maps X/Y to movement, B2 to Action; touch pressed and uptime are unbound.

All active authored channels also stream under their own IDs. Add matching
channels in the monitor with one serial source; the original acquisition source
can still be ADC or BLE on the MCU. Drivers publish using
`ui_input_set_int/float/bool()` or `ui_input_publish()`. The monitor is not an ADC
driver or BLE stack. Do not name authored channels with a reserved built-in ID.
Inactive channels stop streaming and the desktop's configured timeout releases
their bindings. For 32 channels, set a timeout large enough for the round-robin
cycle and the actual rendering workload; short pulses require a driver latch.

One 512-byte packet maximum is in flight, with no heap or growing queue. A 50ms
LVGL timer samples the latest values and skips if the previous TX is busy. FIFO
interrupts write at most 16 bytes per invocation and never access UI/game state.
Each ASCII line is complete and at most 95 bytes. Additional authored channels
rotate fairly through packet space. Slow game rendering lowers the sample rate
(the monitor shows actual Hz); it does not cause a catch-up burst. A bounded
integer/scientific formatter preserves float32 precision without linking floating
printf or allocating dtoa workspace.

Board wiring references: [ST UM3289](https://www.st.com/resource/en/user_manual/um3289-discovery-kit-with-stm32h7s7l8-mcu-stmicroelectronics.pdf),
[ST BSP pin definitions](https://github.com/STMicroelectronics/stm32h7s78-dk-bsp/blob/main/stm32h7s78_discovery.h).
