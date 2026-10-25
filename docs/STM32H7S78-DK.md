# Willowlight on STM32H7S78-DK

Open **Help → Open STM32H7S78-DK Adventure**, then **Play** or **Native LVGL → Build & run**. The original-art demo has a 3,072 × 2,048 world, a camera that follows on both axes, a continuous trail and bridge, directional walking/sword clips, cuttable wildflowers, a talking scout and 5 FPS animated water. All game positions and collisions remain in world coordinates; HUD and touch controls remain on screen. WASD/arrows move, Space attacks, E talks. The built-in display can use the on-screen arrows, SWORD and TALK. Its reference touch driver reports a single pointer.

Existing projects can use **Project → Target guidance → Configure board & display**. This sets 800 × 480 RGB565, the H7R/S reference family, 32 MiB external PSRAM, 128 MiB external flash, two full framebuffers and NeoChrom. Generic family guidance remains advisory; the explicit board policy adds the deployment adapter. **Use generic export** removes that adapter policy. Other scene objects can receive **Sword & melee** in the Sprite inspector. Buttons can map **Controller input** to movement/action inputs.

The standalone editor now includes **Build & flash** and live ST-LINK diagnostics. See [Build, flash and profile](BoardDeployment.md) for the complete workflow, software comparison mode and successful CLI deployment through a USB High-Speed hub. The command-line builder below remains available.

## Hardware foundation

The [ST board](https://www.st.com/en/evaluation-tools/stm32h7s78-dk.html) uses a Cortex-M7 STM32H7S7 at up to 600 MHz with a 5-inch 800 × 480 capacitive touch display. It has NeoChrom GPU2D and DMA2D, 620 KiB internal RAM, 64 KiB internal flash and external memory. It does **not** implement Helium. See the [ST manual](https://www.st.com/resource/en/user_manual/um3289-discovery-kit-with-stm32h7s7l8-mcu-stmicroelectronics.pdf).

The build uses the [official LVGL port](https://github.com/lvgl/lv_port_stm32h7s78-dk) pinned to `4e6609de729e9807f27031a4799f92cdee9a833b`, with LVGL submodule `84861b8bf2f7492f68c540c8ebc64c12d034892d` (9.5.0-dev). Boot, HAL initialization, MPU/cache setup, external memory timings, GPU interrupt handlers and memory regions are retained from that port. Do not substitute the older STM32H7 HAL for STM32H7RS.

Two RGB565 screens occupy **1,536,000 bytes in PSRAM**, rather than internal RAM. The Nema pool occupies 10 KiB in the port's uncached `RAM_CMD` region. The reference port's LVGL heap is 300 KiB. The application and immutable packed assets reside in external NOR at `0x70000000`. The boot image resides at `0x08000000`. Cache coherence, framebuffer placement and external boot are board responsibilities; the engine adapter checks the display and renderer configuration instead of duplicating those drivers.

## Build without flashing

Requirements: Python 3, Git, CMake, Ninja, and ARM GNU GCC/G++ with **newlib**. On macOS the script falls back to a complete toolchain inside STM32CubeIDE if the PATH compiler lacks the standard headers. An explicit `--toolchain-bin /path/to/bin` is supported. The script fetches the pinned port into `.cache`, prepares a separate application main/config and builds both images; upstream sources are retained unchanged.

```sh
npm run sample
npx tsx scripts/export-starter.ts .cache/generated-h7 examples/WillowlightH7.lge.json
python3 scripts/build-stm32h7s78.py --out .cache/h7-arm
```

For an editor-exported project, use `--ui /absolute/path/to/ui`. Outputs are `build/boot.elf`, `build/appli.elf`, their `.bin` files, map files and `build-report.json` below the chosen output directory. No flash command is executed. The boot/application address split must be preserved when loading with STM32CubeProgrammer and the correct H7S78-DK external loader. Follow the official port's boot/application loading instructions and board jumper settings. Replacing the board's existing boot/application is a separate deployment step.

The exported `ui/ports` folder contains the adapter, board manifest and integration notes. For a manually maintained port, call `lge_h7s78_start()` after `lvgl_port_init()`, link the generated UI target and adapter, and service `lv_timer_handler()` continuously. Include `ui/lv_conf_acceleration.h` at the end of the active LVGL configuration and rebuild LVGL itself. The adapter deliberately rejects RGB32, the wrong MCU/Nema library and DMA2D draw ownership.

Hardware audio remains owned by the board application through `ui_config_t.audio`; its callbacks can enqueue PCM/I2S/DMA work without tying game scripts to a peripheral. This demonstration is silent.

## Reusable combat and camera API

Melee is an optional scene-owned pool for at most eight actors, allocated once on scene load. Each swing uses a fixed 128-target bitset and has windup, active and recovery phases. Direction is held during the swing, movement locking is configurable, and target collision layers filter hits. Each target receives at most one Hit event per swing. Hit event pages can hide an object, change state, play a sound or start a script. The damage value is metadata: game rules decide HP changes; this module does not change RPG party HP automatically. It does not test walls between the attacker and target; use collision masks and level geometry accordingly.

```c
/* Start an authored melee attack from a C behavior. */
ui_melee_start("guard");

/* Read this only during LGE_EVENT_HIT / LGE_EVENT_PROJECTILE_HIT. */
const lge_melee_hit_t *hit = ui_melee_hit();
if (hit) { /* hit->attacker, hit->target, hit->damage */ }

float camera_x, camera_y;
ui_camera_position(&camera_x, &camera_y); /* Drawing offset, integer aligned. */
```

`ui_melee_active(id)` includes all three phases. Public hit pointers are valid only inside the callback. `LGE_EVENT_HIT` aliases the existing projectile Hit event for source compatibility; `ui_projectile_hit()` and `ui_melee_hit()` identify which source fired it. Missing attack clips fall back to motion/idle clips. Generic `attack` and directional `attackUp/Down/Left/Right` slots are exported as immutable clip tables.

Touch buttons merge with physical input, latch short taps until the next fixed step and retain independent holds for buttons mapped to the same action. Pause, scene changes and shutdown clear held input. Hiding a controller button releases its hold. World bounds use the camera's world dimensions, not the display dimensions. Tilemaps remain compressed and only visible cells submit draw tasks; no world-sized framebuffer is allocated.

## Verification and remaining hardware check

The ARM GNU 14.3.1 build links both images with the actual ST HAL, LVGL and NemaGFX M7 library. Map inspection confirms the GPU completion callback, Nema initialization/LUT bindings, uncached GPU pool and external framebuffers. Latest image sizes and dependency commits are in the generated build report.

Strict C99/UBSan tests exercise phase timing, direction, movement locking, one hit per target, pause, keyboard/touch merging, duplicate action buttons and camera offsets. TypeScript tests check export policy, map compression/animation, both camera axes and import validation. Real LVGL host tests render the exported C and exercise touch events, scrolling, pinned HUD, changing sword frames, Hit scripts, water image changes and teardown. Desktop tests use isolated profiles.

The corrected NeoChrom application was programmed and independently readback-verified on the physical DK on 2026-10-19. The installed bootloader and all internal flash remained unchanged. Three initial live samples reported 10.891–13.307 rendered FPS with advancing frame and GPU interrupt counters; a sample after 107 seconds confirmed continued operation. These are initial measurements, not a controlled movement benchmark. The user confirmed that the artwork and touch controls work on the physical board. The [device report](../evidence/h7-cli-device-2026-10-19/report.json) retains checks and raw CLI logs; build reports retain their build-time `hardwareTested: false` flag.

## NeoChrom image export correction

A board report described severely distorted/checkered game artwork while the UI buttons remained legible. Inspection found an exporter incompatibility that host software rendering did not exercise: the [pinned LVGL converter](https://github.com/lvgl/lvgl/blob/84861b8bf2f7492f68c540c8ebc64c12d034892d/scripts/LVGLImage.py#L974) applies a Nema-specific nibble mapping to I8 indices, whereas our old output used ordinary indexed bytes. NemaGFX can use indexed textures directly; the software renderer first expands them. LVGL also has a [confirmed GPU texture-address alignment requirement](https://github.com/lvgl/lvgl/issues/9975).

NeoChrom exports now cook standard BGRA byte data under ARGB8888 descriptors and align every image to 16 bytes. This avoids a GPU-only indexed representation that would break software fallback. GPU drawing remains enabled; generic software projects retain palette compression, and tilemap RLE/RAW8 compression is unchanged. The village's cooked image payload increases from 403,328 to 1,468,416 bytes in external flash. Target guidance and the image manifest account for that increase. Source project art is unchanged.

The builder rejects older indexed NeoChrom exports before building. It also checks every linked texture's byte count, 16-byte alignment and placement in external NOR, and records addresses in the build report. The bootloader replacement checkbox now defaults off. The candidate uses the same boot image bytes as the previous build; no clock, external-memory, MPU, option-byte or boot initialization changes were made for this correction.

The ARGB8888 application has now been programmed, readback-verified and started on the DK with GPU activity. The user confirmed correct artwork and working touch controls, resolving the reported checkerboard distortion on this firmware. Application startup checks the required option bytes read-only instead of changing them.
