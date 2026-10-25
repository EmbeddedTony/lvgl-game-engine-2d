# DK hardware input wizard

Open **Project → Inputs & controllers → Hardware wizard** in a project configured
for STM32H7S78-DK. The three steps keep wiring, firmware generation and live
calibration together. Start with [DKHardwareInputs.lge.json](../examples/DKHardwareInputs.lge.json)
for a small joystick/B2 laboratory, or add controls to your current game.

1. **Choose pins.** Enable the joystick and select X/Y by Arduino label and MCU
   pin. A0/PC0 and A1/PC2 are defaults. Add up to eight buttons; choose an external
   header pin or the built-in blue B2. Choose wiring, action and debounce time.
   Pin conflicts block generation. Display, touch, external memory and SWD are
   reserved; shared module pins and A5 are unavailable. A4/PF13 requires explicit
   confirmation of factory routing (SB26 ON, SB27 OFF).
2. **Generate firmware.** Apply the pin map and typed channels as one undoable
   project edit. Review each connection and the generated C table. Other input
   devices remain in the project; reopening the wizard preserves IDs and
   calibration. Open **Build & flash** and keep **Stream inputs over ST-LINK
   serial** enabled while calibrating. Controller builds prevent bootloader
   replacement. A build alone never programs a device.
3. **Calibrate & test.** After the application is installed, return here and connect
   STLINK-V3 at 115200 baud. The monitor checks the firmware's pin signature; older
   firmware and simulated packets cannot unlock hardware calibration. Select each
   axis, leave it at rest and capture center, then capture its full travel. At
   least 256 ADC counts are required to apply a joystick range, preventing small
   resting noise from becoming full-scale movement. Advanced small ranges remain
   editable under Configure. Press each button and check its action; a button
   shown pressed at rest needs its electrical polarity corrected in Choose pins.

Use **Show game test → Build & run → Drive game with monitored inputs** to test
the exported C bindings on the Mac. Monitor-only is the default. Capture changes
are saved to the project and trigger a rebuild for the desktop test. Build and
flash the application again to install final calibration on the MCU. Changing
pins, polarity, sample rate or debounce also requires an application update.

Use 3.3V joystick power (CN12 pin 4), a common ground (CN12 pin 6/7), and analog
signals within 0–3.3V. An internal pull-up button connects its input to ground when
pressed; a pull-down button connects to 3V3. B2 requires no external wiring.
The generated `ports/CONTROLLER_WIRING.md` lists the exact connections and API IDs.
The wizard assumes no extra shield or module drives the selected pins.

## Runtime and export architecture

`inputs.hardware` stores a versioned board description separately from calibration
and game bindings. Pin catalog, validation, wizard planning and C generation are
separate modules. The normal `ui_input_read_int/float/bool`, normalized values,
movement and action APIs remain the same. Hardware samples are session state and
are excluded from checkpoint saves.

Exports include `ports/hardware_inputs_config.h/.c`, `hardware_inputs.c`, the
debouncer, a machine-readable manifest and wiring guide. The builder compiles the
driver only when a profile exists, and matching ST HAL 1.2.0 ADC modules only when
ADC pins are selected. A GPIO-only profile has no ADC HAL dependency. Other MCU
ports retain the generic input API and their own drivers.

TIM3 triggers bounded 50/100/200Hz acquisition independently of rendering, without
changing the existing HAL time base, PLLs, display, memory or serial clocks. The
ADCs use their inherited kernel clock divided by 16. Selected ADCs calibrate once
during startup. Per-ADC sequences publish together; faults invalidate a scan and
the next periodic boundary resynchronizes it. GPIO debounce uses monotonic elapsed
time, and the input bank latches taps between game frames. ISR publication uses
the adapter's existing short critical-section lock. No heap, growing queue, DMA
or cache-maintenance buffer is needed for these small controller reports.

The driver refuses an already-running TIM3 or enabled ADC and shows a controller
failure in the DK overlay while touch remains usable. Its resource ownership is
listed in the generated manifest. The optional serial bridge streams active
authored channels alongside the pin signature; it owns UART4 TX. Sampling is
independent of the serial monitor's lower display/stream rate. Target guidance
includes a conservative 1.5KiB hardware-driver RAM allowance in addition to the
channel bank.

Driver, calibration and bindings contain no flash, option-byte or storage writes.
Existing projects keep their ID and checkpoint schema. Controller updates use the
external application image; bootloader installation is disabled in both the UI
and board service for these builds. Existing checkpoint sectors remain separate.

Board mapping: [ST UM3289 rev 4, tables 22/27](https://www.st.com/resource/en/user_manual/um3289-discovery-kit-with-stm32h7s7l8-mcu-stmicroelectronics.pdf).
ADC implementation: [ST's HAL driver](https://github.com/STMicroelectronics/stm32h7rsxx-hal-driver/tree/v1.2.0),
with bundled licenses and file hashes in `ports/vendor/adc/provenance.json`.

## Verification

`npm run test:hardware-inputs` runs the actual C driver against a host peripheral
seam and the real input bank. It checks timer setup, ADC sequence publication,
peripheral ownership, active-low GPIO debounce, tap latching and error recovery.
Model/UI tests check pin conflicts, A4 routing, stable IDs, project persistence,
firmware identity and live range capture. M7 builds cover ADC+GPIO and GPIO-only
profiles; their Boot image must match the working port's image.

The new wizard does not automatically flash a controller profile onto the DK.
Physical ADC accuracy and external-button wiring still need verification with the
chosen controller connected. The previously working game and save are left intact.
