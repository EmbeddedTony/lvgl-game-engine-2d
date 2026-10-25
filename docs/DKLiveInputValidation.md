# DK live input validation · October 21, 2026

The real serial stream delivered integer touch axes, boolean touch/B2 and float
uptime at 10–13 Hz during this workload. The user exercised touch and B2. The
packaged test recorded changing raw values, actual X/Y movement in the compiled
C test game, and action bit 16 from B2. It also verified monitor-only isolation,
range capture, calibration rebuild, source release, OS port cleanup and reconnect.
Real uptime was temporarily bound to an axis in the isolated test project to
exercise calibration reproducibly; it is unbound in the supplied monitoring
project. No simulated values were used in the hardware test.

Fresh internal-flash readback after physical testing matched the pre-task 64KiB
backup exactly. Protected 48KiB Boot prefix SHA-256:
`6220f46059b4de2a6438ef1526d37740c2df33fdee3194d1825a195d6d7458fc`.
Existing 16KiB save SHA-256:
`dc25388b9f9c203fa6ff7b5449c1eaf1c300b20d7ded00a641923295fedf42b3`.
All 26 option fields matched. Only complete affected external application
sectors were written, retaining the last sector's original tail. No Boot, save,
option-byte or mass-erase operation was issued.

ADC electrical acquisition and BLE radio acquisition were not tested: no such
controller was connected. The bridge also streams active authored channels once
their hardware drivers publish them. The serial monitor does not configure those
peripherals or install a BLE stack.

Evidence: [verification](../evidence/dk-input-monitor-2026-10-21/verification.json),
[recorded editor readings](../evidence/dk-input-monitor-2026-10-21/editor-validation.json),
[protected-memory verification](../evidence/dk-input-monitor-2026-10-21/preservation-and-runtime.json),
[flash plan](../evidence/dk-input-monitor-2026-10-21/flash-plan.json).

Repeat with an already prepared DK:

```sh
LGE_DK_SERIAL=STLINK-V3 LGE_DK_TOUCH_SECONDS=90 \
LGE_MONITOR_APP='release/dk-input-monitor-update/mac-arm64/LVGL Game Engine.app' \
npx playwright test --config playwright.packaged.config.ts tests/packaged/dk-input-monitor.spec.ts
```
