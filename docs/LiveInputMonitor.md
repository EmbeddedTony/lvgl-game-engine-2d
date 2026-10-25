# Live input monitor

Open **Project → Inputs & controllers → Live monitor** in the standalone editor.
The channel table shows exact raw int32 / float32 / bool values, normalized values,
sample rate and Waiting / Live / Timed out / Disconnected status. Select a channel
to see its recent normalized history and observed minimum/maximum.

## Connect a board or controller

Select the input device you configured, then choose its transport:

- **USB / serial**: choose a baud rate, click Connect serial and select the port.
  The monitor reads ASCII channel_id=value lines, terminated by newline. UART,
  USB CDC and an ST-LINK virtual COM port can carry the same stream. ADC/GPIO
  acquisition remains in the board driver; the MCU must send those sampled values.
  Debug logs that do not match an authored channel are rejected and counted.
- **Bluetooth LE**: enter the peripheral's service UUID and notifying characteristic
  UUID, click Connect BLE and choose the device. Use Binary report layout to match
  authored byte offsets, encodings, bit fields and optional report ID. A text GATT
  service can instead use channel=value lines. The service must be accessible and
  advertised by the peripheral. BLE HID gamepads may require a USB/serial bridge
  or a custom GATT service because OS-protected HID services are not universally
  available to Web Bluetooth.

For the ADC preset, a board can send:

```text
adc_x=2048
adc_y=1024
adc_action=false
```

For example, in your board's owner task (not a time-critical ADC ISR):

```c
ui_input_set_int(UI_CHANNEL_ADC_X, adc_raw);
char line[40];
int length = snprintf(line, sizeof(line), "adc_x=%ld\n", (long)adc_raw);
/* Enqueue these bytes in your existing UART/USB TX driver. */
if (length > 0 && (size_t)length < sizeof(line))
    board_serial_enqueue(line, (size_t)length);
```

board_serial_enqueue is your board adapter, not a generated engine function.
There is no automatic sampling, pin configuration, BLE stack installation, board
programming or SWD access when the monitor opens. Connection details are local
to the monitor session. Opening a serial port may have the USB adapter's normal
reset behavior; the monitor sends no board commands or modem control signals.

## Calibrate with real values

1. Leave the control at rest and choose **Set center from live value**.
2. Choose **Capture range**, move through its full travel, then choose
   **Apply captured range**. At least two distinct values are required.
3. Adjust dead zone, inversion, smoothing or button thresholds in Configure.

Each accepted capture is saved in the project and participates in Undo/Redo.
Capture disables Drive game. Incomplete/invalid Configure edits remain local and
must be corrected before opening the monitor. Observed ranges and connection
state are temporary, not checkpoint/save data.

## Test game bindings

Enable **Show game test** and **Build & run**. This runs the exported C and LVGL
using the desktop port. **Monitor only** is the default: incoming values do not
control the game until you enable **Drive game with monitored inputs**.

The Actual C runtime panel reports the values and normalized channels that the C
bank received, controller axes and held actions. The native process owns the same
calibration, dead zones, smoothing, thresholds and input merging used on an MCU.
Keyboard and touch still work. Physical publications enter the C bank on its owner
thread; a BLE callback never invokes gameplay/UI code directly.

When calibration or bindings change, live forwarding stops until **Apply inputs &
rebuild** installs the new exported settings. The current stream remains connected.
This prevents the game silently testing a previous calibration. Turning Drive off,
disconnecting a device, closing the game test or closing the monitor releases the
forwarded source. Inactive channels still follow their configured timeout; timeout
0 deliberately holds values until explicit disconnect. Fresh boolean taps are
latched between display updates. The monitor is not a board performance profiler.

## Without hardware

Use **Simulate this channel** for a held slider/button value, sampled at 20 Hz.
Disconnect releases the simulated source. The **Test serial text / BLE report**
section accepts one-shot text packets or up to 64 hex bytes (for example
FF 0F 00 08 01 for the custom BLE preset). One-shot values time out normally.
Disconnect any continuous real/simulated stream before feeding test packets.
These tools use the same decoder and native input bridge as hardware connections.

## Bounded workload and lifetime

Acquisition coalesces the latest value per channel instead of growing a sample
queue. The display refreshes at 20 Hz, native input telemetry at 10 Hz, and history
stores at most 64 points per channel. Limits remain 32 channels, 8 source devices,
64-byte binary reports and 95 ASCII bytes per serial line. Invalid complete reports
never partially update channels. Serial lines and BLE notifications may arrive in
fragments; each text stream has its own bounded parser. Closing the input window
cancels device selection, notifications and readers and releases its connections.
This desktop instrumentation adds no firmware monitor buffer or peripheral driver.

The integration follows Electron's [device access APIs](https://www.electronjs.org/docs/latest/tutorial/devices).

## STM32H7S78-DK over ST-LINK

Add **DK touch & button** in Configure. It matches the optional **--input-monitor**
firmware build bridge: touch X/Y (int), touch/B2 (bool), uptime seconds (float).
Connect serial at **115200** and select the ST-LINK usbmodem port. The bridge reads
the existing touch device, recenters axes on release and leaves on-board touch
controls unchanged. Show game test tests these bindings in the desktop C runtime.
Sample frequency follows the real board workload; the preset uses 1500ms timeouts.

The exported **ports/INPUT_MONITOR.md** explains enabling the bridge. It uses one
512-byte TX packet, no growing queue and a bounded FIFO interrupt. It can also
stream active authored channels published by your ADC/serial/BLE drivers. It has
no serial commands or flash writes. Test data is never automatically substituted
for disconnected hardware. Enabling this optional development bridge requires an
application build and flash; opening the monitor alone never programs the board.
