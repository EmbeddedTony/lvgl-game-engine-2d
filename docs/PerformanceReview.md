# Firmware performance review — 2026-10-20

The highest-confidence improvement is removing unnecessary CPU work before adding hardware dependencies. This review covers the portable C runtime, LVGL adapter, exported build policy, target guidance and pinned STM32H7S78-DK port. Optimizations retain the existing authored behavior and source artwork. No board was programmed in this review; host timings are not device FPS.

## Current hardware use

The H7S7 supports single/double precision, but most engine arithmetic intentionally uses `float` and `*f` math functions. The new ARM compile checks enable `-Wdouble-promotion`. Hard/soft-float ABIs cannot be mixed. Use the actual chip's FPU settings, not an assumption based only on the Cortex family. See [ST's H7S7 datasheet](https://www.st.com/resource/en/datasheet/stm32h7s7l8.pdf) and [GCC ARM options](https://gcc.gnu.org/onlinedocs/gcc/ARM-Options.html).

## Changes implemented

### Compressed-map lookup and rendering

Exports now store a cumulative cell offset every 16 RLE runs. Random lookup uses binary search of the checkpoints and at most 16 run entries: O(log(ceil(R/16)) + 16). A caller-owned cursor reuses the current run or advances across nearby cells. RAW8 remains O(1); legacy streams without checkpoints still work. Cursors are independent across maps, calls and engine instances; there is no shared mutable global cache.

The index uses four flash bytes per checkpoint, approximately 6.25% of RLE stream bytes, and no decompressed-map RAM. Packing includes that overhead when choosing RLE versus RAW8, so a marginal RLE win cannot become a larger map after indexing. Export statistics and target guidance include the same payload.

LVGL drawing intersects the map with the current layer's dirty clip before decoding. Animated invalidation visits only the viewport and combines adjacent changed tiles into row spans. Swept 2D collision queries reuse a cursor and avoid duplicate lookup of solid tiles. Source images, tile indices, collision semantics and animation timing remain unchanged.

The synthetic 128×128/1,024-run host benchmark measured 200,000 random lookups per trial, three trials: approximately 37.3 ms without indexing versus 2.7 ms with indexing (13.85×), with 256 bytes of seek flash. This tests the same production lookup API with/without its optional index. Actual MCU cache/flash latencies, camera movement and GPU/display work can change the benefit substantially. See [raw benchmark](../evidence/optimization-host-benchmark.json).

### Storage proportional to project size

Exports set `LGE_MAX_NODES` to the largest resolved scene, rounded up to eight slots, minimum eight. All reserved prefab slots are included. Node state, view pointer arrays, contact bitsets and bounded temporary arrays shrink together. The authoring maximum stays 128; no scene content is silently removed. Manual ports may override the capacity consistently across all translation units.

Contact bitsets use ceiling division, including non-byte-aligned manual capacities. New C tests exercise seven- and nine-slot builds, including repeated prefab reset. The ARM ABI layout probe measures the 2D core engine as 1,020 bytes at eight slots, 10,300 at 88 and 15,540 at 128. The village's 84 authored nodes use 88 slots, saving 5,240 core-state bytes versus the previous fixed 128, plus smaller view arrays and scratch storage. These figures exclude LVGL, story, audio, projectiles and framebuffers. Target guidance includes a capacity-based planning allowance rather than claiming exact firmware RAM.

### Math and feature fallback

## Prioritized remaining work

| Priority | Candidate | Expected benefit / cost | Decision |
| --- | --- | --- | --- |
| 1 | Measure simulation, task construction, GPU wait, flush and scanout separately on the DK | Identifies the limiting stage; existing rendered-FPS and LVGL activity counters measure different things | Benchmark the same scene/camera/input before asserting an FPS gain |
| 1 | Tune draw-buffer height and batch draw/dirty work | Can reduce setup/IRQ/flush overhead; larger buffers consume RAM and bus bandwidth | Keep board defaults until measurements justify a change |
| 2 | Cache draw-order keys / exploit temporal ordering | Avoid repeated O(N²) insertion work when few Y-sort values move; needs invalidation on scene/reuse/movement and extra bounded RAM | Profile after tile traversal changes; current 128-node bound is intentional |
| 2 | Spatial broad phase for dense 2D bodies/projectiles | Current object scans can approach O(BN + AN + PN); grids/sweep lists help sparse large scenes but add memory and update bookkeeping | Use only when pair counts dominate; preserve masks, swept motion, hierarchy and prefab reset |
| 2 | Larger decoder/texture or chunk caches | Helps repeated expensive decoding/external reads; costs RAM, cold-start work and cache-maintenance traffic | Existing precomposed frames/shared descriptors avoid many runtime costs. Add bounded caches only from measured misses |
| 2 | Compare `-O2`/LTO with `-Os` | May improve hot loops or shrink calls; may also increase code/stack pressure and external-flash fetches | Do not change all vendor code blindly; compare linker maps and repeat gameplay tests |
| 3 | CMSIS-DSP / fast trig or fixed-point solver | Could help software-FPU targets or large bullet bursts; adds dependency, precision and determinism work | No mandatory library or wholesale numeric conversion without a benchmark and error budget |
| 3 | DMA for asset/audio streaming and large copies | Can overlap useful transfers; tiny commands/unaligned buffers may cost more setup than a CPU copy | Board worker owns queues, cache handoff, completion IRQs and peripheral arbitration |

Do not globally enable `-ffast-math`/finite-only assumptions: validators use `isfinite` to reject invalid values. SIMD should be limited to kernels with verified numerical/tail behavior. Do not disable all D-cache as a performance fix; use appropriate memory regions and ownership handoffs. ST describes these hazards in [AN4839](https://www.st.com/resource/en/application_note/an4839-level-1-cache-on-stm32f7-series-and-stm32h7-series-stmicroelectronics.pdf). LVGL's [draw-unit model](https://lvgl.io/docs/open/main-modules/draw/draw_units) governs supported-operation fallback.

## Scaling and guidance

MCU guidance now measures potentially visible tile cells instead of total world cells, includes checkpoint bytes, counts implicit area/pickup bodies, accounts for node capacity, and warns about heavy simulation on known no-FPU Cortex-M0/M0+/M3 targets. High external-memory pixel workloads receive bandwidth/cache advice. These are workload heuristics, not FPS forecasts; Linux/host targets keep routine MCU advice suppressed.

## Reproduce

`npm test`; `npm run test:runtime`; `npm run test:portability`; `npm run bench:runtime`; `npm run test:h7`;

The portability check links the core with ARM GNU/newlib for M0+ soft float and M7 hard float, inspects emitted instructions and records ABI layouts. It includes no LVGL/BSP or hardware execution. Graphics checks compile M55/M85 vector kernels and verify strict rejection plus generic scalar fallback. Native LVGL tests cover actual rendering/gameplay with a 300 KiB LVGL heap; the village's ARM build retains the pinned board startup and acceleration integration. See the [portability evidence](../evidence/optimization-portability.json). Re-export existing projects to receive the optimized C runtime and seek tables.

## Follow-up: scrolling terrain batches

The user measured approximately 25% LVGL activity and 30 FPS stationary, rising to 95% activity and 24 FPS while moving. The native village profile reproduces the workload change: camera movement redraws the complete viewport, compared with 2.7–5.4% per rendered frame in its stationary windows. Player/camera movement stops after release, redraw work falls again, and free LVGL heap remains stable in that test. This identifies scrolling cost rather than continued input after release. LVGL's activity percentage includes time inside its timer handler, including synchronous rendering and GPU waits.

NeoChrom exports now optionally combine repeated static terrain cells into eight-copy horizontal images. The exporter ranks repeated row runs and limits the extra immutable image payload to 64 KiB per project. The village selects two strips. Every RGBA pixel is copied exactly; there is no filtering, lower resolution, color reduction, runtime tile framebuffer or GPU-library patch. Animated cells retain their original frame selection and per-cell drawing. Short runs and viewport edges clip the repeated image without crossing into other cells. Existing maps with no strip table, compact software exports and `LGE_TILE_BATCHES=0` retain per-cell rendering. Guidance includes the additional image and pointer-table storage.

The reference generated UI from the previously flashed application and the new generated UI produced identical complete RGB565 streams for 125 rendered frames (48 million output pixels), plus six byte-identical PPM checkpoints. These cover scrolling, both character directions, layered NPCs, animated water, dialogue, touch input and sword/hit behavior. All 155 pre-existing image payloads also match byte for byte. With the same new generated data, disabling batching raises terrain image tasks from 41,547 to 72,236 in the native partial-buffer test, a 42.48% reduction with batching. These counts do not predict board FPS: the board uses direct double buffering and NeoChrom, while the comparison uses LVGL software drawing.

The village application grows by 66,064 bytes, including 65,536 bytes of repeated-image payload. Its boot image hash is unchanged. The ARM builder verifies all 157 image addresses, sizes and alignment in external flash. TypeScript tests (153), C99/UBSan runtime tests and village rendering on LVGL 9.4/9.6 pass. See [visual comparison evidence](../evidence/h7-terrain-batching-device-2026-10-20/visual-verification.json) and the deployment report alongside it for physical programming/readback results.

## Follow-up: 30 FPS performance candidate

The next candidate keeps the 800×480 output, original RGBA artwork, animation rates and fixed 60 Hz simulation. It improves flash allocation within the same 64 KiB strip budget: a greedy sequence of two-, four- and eight-copy upgrades ranks marginal command savings per additional byte. In the village this retains the eight-copy grass strip and adds shorter strips for paths and hedges. The measured native terrain workload falls from 41,547 to 35,871 image tasks, another 13.66%, with unchanged strip payload size. This is a bounded export heuristic, not a mathematical optimum or an FPS forecast.

Draw ordering calculates each sort-Y foot key once per pass instead of repeatedly inside insertion comparisons. It checks the desired LVGL child at its index rather than asking each child to scan its siblings for its index. Ordering and tie behavior are unchanged. Temporary sort keys cost four stack bytes per configured node (352 bytes for the village); there is no persistent cache or allocation.

The H7 builder now defaults to `--optimization speed`: engine and LVGL compile with `-O2`, and LVGL's built-in object style cache is enabled. HAL, startup and Boot retain `-Os`. The application service loop uses `HAL_Delay(0)`: this HAL still adds one tick, avoiding the extra guard tick of the vendor loop's `HAL_Delay(1)`. CPU sleep/debug and peripheral clock policy remain unchanged. A trial interrupt-sleep loop made live SWD access unreliable and was replaced; it is not in the final firmware. `--optimization size` retains `-Os`, the vendor style-cache setting and the vendor polling loop. Fast-math and LTO are not enabled. The boot image remains byte-identical. This policy is specific to the verified H7 board builder; generic ports keep their own compiler/LVGL policy.

With `-O2` and style caching, all 125 complete host RGB565 frames and six checkpoints still match the pre-optimization reference byte for byte. Native LVGL 9.4/9.6, 153 TypeScript cases and the C99/UBSan runtime checks pass. The final ARM application is 5,388,944 bytes; all 160 linked image addresses/strides/sizes pass verification. Binary comparison with the verified pre-sleep speed build shows one changed byte, the HAL delay argument; the rest of the application is identical. Read-only DWT PC samples caught stationary activity and must not be treated as a scrolling profile. See [candidate visual evidence](../evidence/h7-fps30-device-2026-10-20/visual-verification.json) and its deployment report for on-board results. A stable 30 FPS moving workload must be measured on the actual board; a configured 30 FPS limit alone does not establish that result.

## Follow-up: bounded 2D terrain cache and opaque images

Only native-size, uncompressed XRGB8888 cells without tile animation can enter a chunk. Holes, alpha, animated water, unusual tile sizes and other image formats retain ordinary tile/strip drawing. Partial edge chunks use their actual dimensions; dirty clips preserve the fixed map-space origin. Fully opaque direct-color assets now use XRGB8888 descriptors with byte-identical BGRA payloads. Partially transparent images remain ARGB8888. The exporter advertises tilemap coverage only after proving that every cell is present and every used image and animation frame is opaque. The pinned H7 image backend uses source copy for nearest, normal, fully opaque XRGB8888 images without masks/recolor/color keys; other operations retain the vendor blend path.

`ui_config_t.terrain_cache` supplies the optional cache. GPU ports provide `begin_write` and `publish` ownership callbacks; generic ports allocate no pixel cache unless the application supplies one. The DK builder/UI/CLI expose fixed external-PSRAM ring budgets of 0 (off), 32, 128, 512 and 2048 KiB, plus at most 8 KiB of metadata. The pixel reservation is in a separate NOLOAD linker section after the scanout buffers; its address/size is verified inside the 32 MiB external RAM region. The measured default is **off**: PSRAM caching was consistently slower than its uncached control in this village. Guidance includes the default zero reservation and explains that manual overrides need a RAM budget. The editor's cache selector participates in build fingerprints so a changed budget makes an older build stale. This policy changes no bootloader, MPU, external-memory timing or display resolution.

`npm run test:terrain-cache` compares full RGB565 frame streams with caching off, one-slot budgets and the DK budget in XRGB8888/RGB565, plus translucent-parent fallback. It runs the real native LVGL integration under C99/UBSan and exercises eviction, visibility pinning, undersized budgets, unsupported/animated/transparent cells, publication failure, partial chunks, memory guards and teardown. It covers scrolling, water, layered characters, dialogue, touch and sword frames. `LGE_LVGL_VERSION` and `LGE_LVGL_SOURCE` select another supported LVGL checkout. Host pixel identity and draw-task counts do not establish board FPS; hardware comparison uses the same village and normal left/right input with camera displacement recorded separately.

The first independent XRGB8888-chunk DK candidate measured 21.63 FPS moving, below the 24.31 FPS legacy baseline. Native pixel identity alone was insufficient: reduced command counts did not establish a speedup. RGB565 chunks and a merged ring atlas were also benchmarked separately from opaque drawing. The subsequent 2D presentation-sync option commits LVGL object state at `LV_EVENT_REFR_START`, before layout/drawing, instead of committing it on every 16 ms simulation callback. Fixed 60 Hz physics, animations and input integration remain unchanged. The native full-frame comparison also covers this option; display callback removal is checked at teardown. Final on-device numbers and rejected candidates are recorded in the evidence report linked below.

### Final hardware outcome

| Matched hardware trial | Uncached moving FPS | Cached moving FPS | Decision |
| --- | ---: | ---: | --- |
| Independent RGB565 chunks, 30 Hz requests | 23.869 | 22.598 | Reject as default |
| Merged ring atlas, 30 Hz requests | 28.415 | 27.025 | Reject as default |
| Ring + refresh-synchronized view, 30 Hz requests | 24.451 | 23.061 | Keep optional; default off |
| 60 Hz requests, ordinary view synchronization | **30.028** | Not selected | Ship this pacing; cache off |

The original legacy 30 Hz-request baseline measured 24.307 FPS moving. Earlier uncached runs varied between about 24 and 28 FPS; absolute FPS must be compared against its matched control. The faster delivered setup does not depend on PSRAM terrain caching. `sync_to_refresh` remains an optional tested API and is off in the normal board configuration.

All 160 original image byte arrays remain identical. The legacy 125-frame / 48-million-pixel RGB565 trace matches normal cache/presentation variants exactly on LVGL 9.4 and 9.6. Faded-parent variants match their corresponding uncached reference. Actual GPU framebuffer readback compares 35,178 unobscured terrain pixels in the cached trial and 35,286 in the 60 Hz-request trial with **zero mismatches**, including grass/path texture. HUD, sprites and animated cells are excluded from this hardware terrain-only comparison and covered by native full-frame tests. The compiler reports 1,336 bytes of static stack for `tilemap_draw`, excluding callees/interrupt high-water.

The normal delivery omits engineering controls, reserves no terrain pixel buffer and uses the same source artwork, 800×480 output and fixed 60 Hz game simulation. Application-only programming backs up affected external sectors twice, preserves the last sector's trailing bytes, verifies a complete independent readback and compares all 64 KiB of internal flash before/after. Boot and option-byte write paths are not used. The complete [hardware report](../evidence/h7-terrain-cache-2026-10-20/report.json) records candidates, rejected trials, exact hashes, methods and limitations.

ST's [H7R/S errata ES0596](https://www.st.com/resource/en/errata_sheet/es0596-stm32h7rxx7sxx-device-errata-stmicroelectronics.pdf) was consulted while investigating intermittent running debug access. No erratum is asserted as its cause, and no security, boot or memory-timing workaround was applied. The editor uses a hardware reset after external-XIP programming; that reset does not write boot or option bytes.
