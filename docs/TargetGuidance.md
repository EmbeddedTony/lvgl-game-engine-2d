# Target capability guidance

Open **Project → Target guidance…**, the target button in the status bar, or the target summary in Project settings / Export. Choose a family, then adjust the budgets for your actual part, board and firmware. Searching matches vendor, family, reference part and CPU core. The catalog contains 60 MCU reference profiles from 13 vendors, plus Custom MCU, Embedded Linux and Host PC. [Catalog and vendor sources](TargetCatalog.md).

The feature is optional. Opening it does not change the project; choosing a profile does. Settings save in the project, participate in Undo/Redo and survive recovery. Changing family resets assumptions to that reference; Undo restores the previous configuration. Show MCU advice pauses recommendations without deleting assumptions. Linux and PC selections suppress all routine MCU resource and accelerator advice. Engine limits and invalid project data remain validated on every target.

This is an early planning tool. It does not select a board port, configure LVGL, install memory, alter a linker script, implement an effect or promise a frame rate. Warnings never block an otherwise valid export.

## Reference capacities

Each profile names a reference part or a documented family envelope and links to a primary vendor source. These are not universal minimums or maximums for all family members. Notes identify shared/multi-core RAM, cache/TCM reservations, ECC and flashless parts. RAM figures include documented banks which may have different DMA access, security ownership or latency. Replace totals with the memory actually available to your application, then reserve space for the rest of the firmware.

External RAM, external flash and SD capacity start at zero. Module/package flash or PSRAM must be entered explicitly. Flashless parts prompt for boot/code flash. MRAM is counted as code NVM where appropriate. KiB/MiB are binary units; vendor capacities sometimes use rounded marketing labels. Reference review date: **2026-10-19**. The bundled catalog works offline; vendor links need an Internet connection.

## What the editor measures

The scanner expands linked scenes using the same resolver as export. Storage covers all exported scenes; live RAM and rendering indicators use the largest scene. It scans actual used sprite sizes, painted tile types, compressed map data, visible widgets, alpha artwork, rounded shapes, collision work and PCM WAV files. It does not analyze hand-written C. Image palette scans are cached by immutable asset identity; scene scanning is debounced while editing. Changing a target assumption updates the report without recompressing assets.

| Budget | Model |
| --- | --- |
| Draw RAM | Width × color bytes × partial rows × 1–2 buffers, or 1–2 full frames |
| Additional scanout RAM | 0–2 full frames for board RGB/LTDC buffers not already counted as full draw buffers |
| Runtime / widgets | 8 KiB fixed allowance + 144 bytes per compiled node slot + contact bitsets + 256 bytes per peak visible widget; buttons include their label. Slots cover the largest resolved scene rounded up to eight, including prefab reserves |
| Decode RAM | One largest image variant at 4 bytes/pixel by default; verified scanline mode removes this full-image allowance |
| Other RAM | Editable system/heap reserve; editable audio buffers when audio exists |
| Code / graphics NVM | Conservative packed image upper estimate + exact compressed map bytes + table allowance + firmware/font reserve + WAVs when assigned to main NVM |
| Display traffic | Frame bytes × target FPS × redraw percentage × 8; compared to entered effective payload Mbit/s |
| WAV files | Complete exported file sizes, including RIFF headers; all cues count toward storage |

The default draw plan is one 40-row partial buffer with no extra scanout buffer. This suits a panel with its own GRAM; an RGB/LTDC port may need additional RAM. Full-image decode is deliberately conservative. Scanline selection is valid only after confirming the actual LVGL decoder, cache and scratch allocations; include those other allocations in the system reserve.

Internal engine/system/audio allowance is checked independently when external RAM is present. External RAM never guarantees DMA accessibility or adequate bandwidth. Memory banks are not packed by a linker simulation. LVGL heap fragmentation, draw tasks, fonts, custom C, stacks, RTOS, radio stacks, caches and actual compiler layout can exceed these allowances. Adjust reserves and measure the firmware heap high-water mark and linker map.

Image estimates avoid allocating every resized RGBA variant on each edit. Downsampling and byte-identical image sharing can reduce the final export below the upper estimate. Exact image/map/audio payload counts are attached to the exported snapshot after generation. Table/runtime allowances are planning policies, not measured C sizeof or linked binary sizes.

## Actionable recommendations

RAM and code/graphics occupancy above 80% warn about headroom; above the configured budget needs attention. Remedies include smaller sprites, fewer size variants, shorter partial buffers, RGB565, external PSRAM/SDRAM, memory-mapped flash or a higher-capacity MCU. SD capacity does not add RAM and does not relocate compiled C image arrays. External-flash capacity is shared by code/assets and externally assigned WAV files rather than counted twice. External WAV placement still requires copying files and a matching audio backend.

Large PCM collections suggest SD/external-flash streaming. The audio traffic indicator assumes the eight highest-rate cues overlap; it is not a measured mix. The existing hardware audio backend remains responsible for decoding, mixing, queues and DMA-backed I²S/DAC/PWM. No filesystem or streaming implementation is enabled by selecting storage here.

Display link advice uses effective measured payload throughput, not nominal SPI clock. Reducing redraw area/FPS, color depth or resolution can reduce traffic. A GPU does not remove a display bus bottleneck. Redraw percentage is your scenario assumption, not a static dirty-region measurement.

Acceleration is split into **DMA2D**, **2D GPU / pixel accelerator**, **Helium** and **other SIMD**. Catalog capability alone does not silence a warning: explicitly confirm the integration under Acceleration enabled by your port. Unsupported flags imported into a project are warned about and receive no credit. Custom MCU allows user-confirmed capabilities. Capabilities absent from a reference mean unconfirmed, rather than proof that no family variant offers them.

- Heavy coverage / alpha work suggests appropriate DMA2D or 2D GPU draw units. Supported formats, cache maintenance and DMA-visible memory still matter.
- Runtime rotation/scaling declared for custom C suggests a supported GPU or prebaked frames. The engine's built-in sprite sizing is prebaked and does not require runtime transformation hardware.
- Declared blur/convolution or vector/pixel DSP suggests an optimized SIMD implementation, such as Cortex-M55/M85 Helium, or a suitable alternative. A GPU checkbox does not claim to implement a blur pipeline.
- Large rounded shapes warn separately because STM32 DMA2D generally does not accelerate rounded corners.
- Dense collision work and large visible tile windows warn about CPU work. Drawing clips before decoding; sparse flash indices accelerate RLE queries. GPUs still need CPU task submission.
- Heavy simulation on known no-FPU Cortex-M0/M0+/M3 targets warns about software float cost. Correct soft-float builds remain supported; this does not infer optional FPUs on other cores.
- High pixel workloads using external memory warn about bandwidth, DMA accessibility and cache ownership.

STM32 DMA2D is not a general rotation/scale/rounded-shape engine. Arm-2D is a software library, with optional Helium optimizations; it is not itself a GPU. ESP32-S3 SIMD is not Arm Helium, ESP32-P4 PPA/2D DMA is not STM32 Chrom-ART, and an NPU is not a graphics accelerator. The reference distinguishes them. Transfer-only ESP32-P4 2D DMA is not credited for LVGL drawing, and operation-limited PPA/PxP do not automatically satisfy generic transform/rounded-shape recommendations. [LVGL PPA support](https://lvgl.io/docs/open/9.4/details/integration/chip_vendors/espressif/hardware_accelerator_ppa.html) describes the separate draw and display-port integrations. See the official [LVGL DMA2D integration](https://lvgl.io/docs/open/integration/chip_vendors/stm32/dma2d_gpu), [Arm-2D integration](https://lvgl.io/docs/open/integration/chip_vendors/arm/arm2d) and [draw units](https://lvgl.io/docs/open/main-modules/draw/draw_units).

The following thresholds are **editor heuristics, not vendor performance specifications**: 16 million covered pixels/s; 4 million partial-alpha bounding pixels/s; 4 million rounded-shape bounding pixels/s; 8,192 potentially visible tile cells across active layers; 4,096 rough collision pairs; 768,000 PCM bytes/s across the top eight cues; and an informational display check above 40 Mbit/s when no throughput is supplied. They flag scenarios to profile. They do not estimate FPS from CPU MHz, account for every draw operation or prove that an accelerator supports a custom effect. Alpha/rounded metrics assume potential full redraws; collision pairs omit masks/substeps and are a rough indicator.

## Export and architecture

Every export includes **ui/target-guidance.json** with catalog date/version, selected reference/source, assumptions, workload estimates, recommendations and exact export payload counts. The snapshot is JSON for developer review; it is not compiled into firmware. The project stores the selected assumptions; the report is recomputed from current content. No target selected produces an unconfigured snapshot and no MCU warnings.

Catalog data, strict target validation, pure workload measurement and pure recommendation rules live in src/targets. Presentation lives in TargetGuidance/TargetSummary; project ownership stays with App. Export performs a fresh authoritative scan rather than reusing the debounced UI result. The desktop reference-link adapter accepts only HTTPS official vendor/LVGL domains; it does not permit arbitrary navigation inside the editor.

## 2D Toolkit estimates

The workload model includes RPG records and reachable portrait/icon variants, pattern tables, tile-bank ramp bytes, optional fixed projectile-pool RAM, estimated live-shot demand versus the authored limit, possible swept projectile/body pairs and platform passenger preflights. A smaller projectile limit reduces active projectile work but does not shrink the fixed native 64-slot allocation. The core/view/story allowance uses the capacity-based formula above, plus widgets and optional pool allowance, before board buffers/reserves. These are planning allowances, not MCU ABI measurements. GPU/DMA2D/Helium flags do not erase scalar gameplay collision costs. Routine MCU advice remains gated off for host and embedded Linux.

See [Performance review](PerformanceReview.md) for measured ABI layouts, fallback policy and remaining optimization candidates.
