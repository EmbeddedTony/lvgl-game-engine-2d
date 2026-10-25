# MCU reference catalog

60 profiles from 13 vendors. Reviewed 2026-10-19; catalog version 1.

These are reference capacities, not guarantees for every family SKU. See [Target guidance](TargetGuidance.md) for planning assumptions and limitations. RAM may span shared, TCM, cache or restricted banks. NVM is code flash/MRAM; zero means external code storage must be budgeted. External module flash/PSRAM is excluded. Acceleration is advertised capability, not an enabled LVGL port. No clock-to-FPS prediction is made.

| Vendor / family | Reference | RAM KiB | Code NVM KiB | Confirmed capabilities | Primary reference |
| --- | --- | ---: | ---: | --- | --- |
| STMicroelectronics / STM32F0 | STM32F072RB | 16 | 128 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f072rb.html) |
| STMicroelectronics / STM32F1 | STM32F103RE | 64 | 512 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f103re.html) |
| STMicroelectronics / STM32F3 | STM32F303RE | 80 | 512 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f303re.html) |
| STMicroelectronics / STM32F4 · general | STM32F407VG | 192 | 1024 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f407vg.html) |
| STMicroelectronics / STM32F4 · graphics | STM32F429ZI | 256 | 2048 | Chrom-ART / DMA2D | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f429zi.html) |
| STMicroelectronics / STM32F7 | STM32F746ZG | 320 | 1024 | Chrom-ART / DMA2D | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32f746zg.html) |
| STMicroelectronics / STM32G0 | STM32G0B1RE | 144 | 512 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32g0b1re.html) |
| STMicroelectronics / STM32G4 | STM32G474RE | 128 | 512 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32g474re.html) |
| STMicroelectronics / STM32H5 | STM32H563ZI | 640 | 2048 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32h563zi.html) |
| STMicroelectronics / STM32H7 | STM32H743ZI | 1024 | 2048 | Chrom-ART / DMA2D | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32h743zi.html) |
| STMicroelectronics / STM32U5 · U575 | STM32U575ZI | 786 | 2048 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32u575zi.html) |
| STMicroelectronics / STM32U5 · U5A9 graphics | STM32U5A9NJ | 2560 | 4096 | Chrom-ART / DMA2D; NeoChrom 2.5D GPU | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32u5a9nj.html) |
| STMicroelectronics / STM32WB | STM32WB55RG | 256 | 1024 | — | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32wb55rg.html) |
| STMicroelectronics / STM32N6 | STM32N645A0 | 4096 | 0 | Chrom-ART / DMA2D; NeoChrom 2.5D GPU; Arm Helium | [Vendor](https://www.st.com/en/microcontrollers-microprocessors/stm32n645a0.html) |
| Espressif / ESP32 | ESP32 chip baseline | 520 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32) |
| Espressif / ESP32-S2 | ESP32-S2 chip baseline | 320 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-s2) |
| Espressif / ESP32-S3 | ESP32-S3 chip baseline | 512 | 0 | Xtensa vector instructions (not Arm Helium) | [Vendor](https://www.espressif.com/en/products/socs/esp32-s3) |
| Espressif / ESP32-C2 | ESP32-C2 chip baseline | 272 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-c2) |
| Espressif / ESP32-C3 | ESP32-C3 chip baseline | 400 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-c3) |
| Espressif / ESP32-C5 | ESP32-C5 chip baseline | 384 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-c5) |
| Espressif / ESP32-C6 | ESP32-C6 chip baseline | 512 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-c6) |
| Espressif / ESP32-C61 | ESP32-C61 chip baseline | 320 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-c61) |
| Espressif / ESP32-H2 | ESP32-H2 chip baseline | 256 | 0 | — | [Vendor](https://www.espressif.com/en/products/socs/esp32-h2) |
| Espressif / ESP32-P4 | ESP32-P4 chip baseline | 768 | 0 | 2D-DMA (copy/port support; not STM32 DMA2D); Pixel Processing Accelerator (PPA) | [Vendor](https://www.espressif.com/en/products/socs/esp32-p4) |
| NXP / i.MX RT1010 | RT1010 envelope | 128 | 0 | — | [Vendor](https://www.nxp.com/products/i.MX-RT1010) |
| NXP / i.MX RT1020 | RT1020 envelope | 256 | 0 | — | [Vendor](https://www.nxp.com/products/i.MX-RT1020) |
| NXP / i.MX RT1050 | RT1050 envelope | 512 | 0 | Pixel Processing Pipeline (PxP) | [Vendor](https://www.nxp.com/products/i.MX-RT1050) |
| NXP / i.MX RT1060 | RT1060 envelope | 1024 | 0 | — | [Vendor](https://www.nxp.com/products/i.MX-RT1060) |
| NXP / i.MX RT1160 | RT1160 envelope | 1024 | 0 | 2D GPU / VGLite (selected variants) | [Vendor](https://www.nxp.com/products/i.MX-RT1160) |
| NXP / i.MX RT1170 | RT1170 envelope | 2048 | 0 | 2D GPU / VGLite (selected variants) | [Vendor](https://www.nxp.com/products/i.MX-RT1170) |
| NXP / i.MX RT1180 | RT1180 envelope | 1536 | 0 | — | [Vendor](https://www.nxp.com/products/i.MX-RT1180) |
| NXP / i.MX RT500 | RT595 class | 5120 | 0 | 2D GPU / VGLite (selected variants) | [Vendor](https://www.nxp.com/products/i.MX-RT500) |
| NXP / i.MX RT600 | RT685 class | 4608 | 0 | — | [Vendor](https://www.nxp.com/products/i.MX-RT600) |
| NXP / MCX N | MCXN947 | 512 | 2048 | — | [Vendor](https://www.nxp.com/docs/en/data-sheet/MCXNP184M150F70.pdf) |
| NXP / LPC55S6x | LPC55S69 | 320 | 640 | — | [Vendor](https://www.nxp.com/products/LPC55S6x) |
| NXP / LPC546xx | LPC54628J512ET180 | 200 | 512 | — | [Vendor](https://www.nxp.com/docs/en/data-sheet/LPC546XX.pdf) |
| Renesas / RA6M3 | RA6M3 reference envelope | 640 | 2048 | D/AVE 2D drawing engine | [Vendor](https://www.renesas.com/en/products/ra6m3) |
| Renesas / RA6M5 | RA6M5 reference envelope | 512 | 2048 | — | [Vendor](https://www.renesas.com/en/products/ra6m5) |
| Renesas / RA8D1 | RA8D1 reference envelope | 1024 | 2048 | D/AVE 2D drawing engine; Arm Helium | [Vendor](https://www.renesas.com/en/products/ra8d1) |
| Renesas / RA8E1 | RA8E1 reference envelope | 544 | 1024 | Arm Helium | [Vendor](https://www.renesas.com/en/products/ra8e1) |
| Renesas / RA8P1 | RA8P1 reference envelope | 2048 | 512 | Arm Helium | [Vendor](https://www.renesas.com/en/products/ra8p1) |
| Nordic Semiconductor / nRF52 | nRF52840 | 256 | 1024 | — | [Vendor](https://www.nordicsemi.com/products/nrf52840) |
| Nordic Semiconductor / nRF53 | nRF5340 application core | 512 | 1024 | — | [Vendor](https://www.nordicsemi.com/products/nrf5340) |
| Nordic Semiconductor / nRF54L | nRF54L15 (1524 KiB usable NVM baseline) | 256 | 1524 | — | [Vendor](https://www.nordicsemi.com/Products/nRF54L15) |
| Raspberry Pi / RP2040 | RP2040 base chip | 264 | 0 | — | [Vendor](https://www.raspberrypi.com/documentation/microcontrollers/microcontroller-chips.html) |
| Raspberry Pi / RP2350 | RP2350 base chip | 520 | 0 | — | [Vendor](https://www.raspberrypi.com/documentation/microcontrollers/microcontroller-chips.html) |
| Microchip / SAM D21 | ATSAMD21G18A | 32 | 256 | — | [Vendor](https://ww1.microchip.com/downloads/aemDocuments/documents/MCU32/ProductDocuments/DataSheets/SAM-D21-DA1-Family-Data-Sheet-DS40001882.pdf) |
| Microchip / SAM D51 | ATSAMD51J20A | 256 | 1024 | — | [Vendor](https://www.microchip.com/en-us/product/ATSAMD51J20A) |
| Microchip / SAM E70 | ATSAME70Q21 | 384 | 2048 | — | [Vendor](https://www.microchip.com/en-us/product/ATSAME70Q21) |
| Microchip / PIC32MZ EF | PIC32MZ2048EFH144 | 512 | 2048 | — | [Vendor](https://ww1.microchip.com/downloads/en/DeviceDoc/60001358C.pdf) |
| Infineon / PSoC 6 | CY8C6247BZI-D54 | 288 | 1024 | — | [Vendor](https://www.infineon.com/assets/row/public/documents/30/57/infineon-psoc6-cy8c62x6-cy8c62x7-architecture-trm-additionaltechnicalinformation-en.pdf) |
| Silicon Labs / EFM32 Giant Gecko GG11 | EFM32GG11B420F2048GM64 | 512 | 2048 | — | [Vendor](https://www.silabs.com/mcu/32-bit-microcontrollers/efm32-giant-gecko-gg11/device.efm32gg11b420f2048gm64) |
| Silicon Labs / EFR32MG24 | EFR32MG24A010F1536IM40 | 256 | 1536 | — | [Vendor](https://www.silabs.com/wireless/zigbee/efr32mg24-series-2-socs/device.efr32mg24a010f1536im40) |
| Texas Instruments / MSPM0 G | MSPM0G3507 | 32 | 128 | — | [Vendor](https://www.ti.com/product/MSPM0G3507) |
| Texas Instruments / Tiva C TM4C129 | TM4C1294NCPDT | 256 | 1024 | — | [Vendor](https://www.ti.com/product/TM4C1294NCPDT) |
| Nuvoton / NuMicro M55M1 | M55M1 reference envelope | 1536 | 2048 | Arm Helium | [Vendor](https://www.nuvoton.com/products/microcontrollers/arm-cortex-m55-mcus/m55m1-series/) |
| Ambiq / Apollo3 | Apollo3 reference envelope | 384 | 1024 | — | [Vendor](https://contentportal.ambiq.com/documents/20123/387733/Apollo-SoC-Family-Brochure-EN-A4.pdf) |
| Ambiq / Apollo4 Plus | Apollo4 Plus reference envelope | 2816 | 2048 | — | [Vendor](https://contentportal.ambiq.com/documents/20123/387733/Apollo-SoC-Family-Brochure-EN-A4.pdf) |
| Ambiq / Apollo510 | Apollo510 reference envelope | 3840 | 4096 | Nema 2D/2.5D GPU; Arm Helium | [Vendor](https://ambiq.com/product/apollo510/) |
| Alif Semiconductor / Ensemble E7 · MCU cores | E7 upper reference envelope | 13824 | 5632 | 2D GPU (part/port dependent); Arm Helium | [Vendor](https://alifsemi.com/ensemble-e7-series/) |

## Reference notes

- **STM32F0 — STM32F072RB:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32F1 — STM32F103RE:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32F3 — STM32F303RE:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32F4 · general — STM32F407VG:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32F4 · graphics — STM32F429ZI:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32F7 — STM32F746ZG:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32G0 — STM32G0B1RE:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32G4 — STM32G474RE:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32H5 — STM32H563ZI:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32H7 — STM32H743ZI:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32U5 · U575 — STM32U575ZI:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32U5 · U5A9 graphics — STM32U5A9NJ:** Reference capacities are not guaranteed across this family. SRAM may include banks inaccessible to display DMA; confirm the memory map and package.
- **STM32WB — STM32WB55RG:** Radio stack reserves SRAM and flash. Enter application-available budgets after wireless/security reservations.
- **STM32N6 — STM32N645A0:** 4 MiB planning baseline within advertised 4.2 MB SRAM. Flashless; external boot/code storage required. Helium and NeoChrom need a compatible compiler/LVGL port. NPU is not a graphics GPU.
- **ESP32 — ESP32 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-S2 — ESP32-S2 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-S3 — ESP32-S3 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-C2 — ESP32-C2 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed. 16 KiB of advertised SRAM is cache.
- **ESP32-C3 — ESP32-C3 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-C5 — ESP32-C5 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-C6 — ESP32-C6 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-C61 — ESP32-C61 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-H2 — ESP32-H2 chip baseline:** Chip SRAM total is shared with code/cache/SDK/radio; reduce to application-available RAM. Module flash/PSRAM varies and is not assumed installed.
- **ESP32-P4 — ESP32-P4 chip baseline:** 768 KiB HP L2 SRAM planning baseline; package PSRAM size and revision vary. PPA and DMA2D require the Espressif port; they are not automatically used by this export. DMA2D is transfer-only in the LVGL port; PPA fills/blends are operation/format dependent. Hardware rotation uses right-angle steps; general transforms/rounded shapes are not credited.
- **i.MX RT1010 — RT1010 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT1020 — RT1020 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT1050 — RT1050 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part. PxP is an operation-limited pixel processor; general transforms/rounded shapes are not credited.
- **i.MX RT1060 — RT1060 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT1160 — RT1160 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT1170 — RT1170 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT1180 — RT1180 envelope:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT500 — RT595 class:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **i.MX RT600 — RT685 class:** External boot flash is not included. SRAM is split/shared across TCM and system banks/cores; verify DMA visibility and choose the actual part.
- **MCX N — MCXN947:** 512 KiB includes ECC-capable banks; 480 KiB non-ECC plus 32 KiB ECC. NPU and PowerQuad are not a 2D GPU.
- **LPC55S6x — LPC55S69:** 288 KiB system SRAM + 32 KiB code-bus SRAM; DSP accelerator is not a graphics GPU.
- **LPC546xx — LPC54628J512ET180:** Reference LCD controller is not a rendering accelerator; package changes external-memory interfaces.
- **RA6M3 — RA6M3 reference envelope:** Reference uses the larger advertised code-memory option except RA8P1, whose baseline is 512 KiB MRAM. SRAM includes TCM; external interfaces/graphics vary by part. NPU acceleration is not assumed useful for drawing.
- **RA6M5 — RA6M5 reference envelope:** Reference uses the larger advertised code-memory option except RA8P1, whose baseline is 512 KiB MRAM. SRAM includes TCM; external interfaces/graphics vary by part. NPU acceleration is not assumed useful for drawing.
- **RA8D1 — RA8D1 reference envelope:** Reference uses the larger advertised code-memory option except RA8P1, whose baseline is 512 KiB MRAM. SRAM includes TCM; external interfaces/graphics vary by part. NPU acceleration is not assumed useful for drawing.
- **RA8E1 — RA8E1 reference envelope:** Reference uses the larger advertised code-memory option except RA8P1, whose baseline is 512 KiB MRAM. SRAM includes TCM; external interfaces/graphics vary by part. NPU acceleration is not assumed useful for drawing.
- **RA8P1 — RA8P1 reference envelope:** Reference uses the larger advertised code-memory option except RA8P1, whose baseline is 512 KiB MRAM. SRAM includes TCM; external interfaces/graphics vary by part. NPU acceleration is not assumed useful for drawing.
- **nRF52 — nRF52840:** Subtract radio, security, RTOS and SDK reservations. Network-core memories are not counted as application RAM.
- **nRF53 — nRF5340 application core:** Subtract radio, security, RTOS and SDK reservations. Network-core memories are not counted as application RAM.
- **nRF54L — nRF54L15 (1524 KiB usable NVM baseline):** Subtract radio, security, RTOS and SDK reservations. Network-core memories are not counted as application RAM.
- **RP2040 — RP2040 base chip:** External flash must be entered for the actual board. In-package flash options are not assumed. No graphics rendering accelerator is assumed.
- **RP2350 — RP2350 base chip:** External flash must be entered for the actual board. In-package flash options are not assumed. No graphics rendering accelerator is assumed.
- **SAM D21 — ATSAMD21G18A:** Reference memory excludes boot/backup areas. Interfaces, DMA access and packages must be checked separately.
- **SAM D51 — ATSAMD51J20A:** Reference memory excludes boot/backup areas. Interfaces, DMA access and packages must be checked separately.
- **SAM E70 — ATSAME70Q21:** Reference memory excludes boot/backup areas. Interfaces, DMA access and packages must be checked separately.
- **PIC32MZ EF — PIC32MZ2048EFH144:** Reference memory excludes boot/backup areas. Interfaces, DMA access and packages must be checked separately.
- **PSoC 6 — CY8C6247BZI-D54:** Shared dual-core memory; secure/radio stacks can reserve substantial space. Other PSoC 6 variants have different totals.
- **EFM32 Giant Gecko GG11 — EFM32GG11B420F2048GM64:** No rendering offload is assumed from an LCD interface or general DMA.
- **EFR32MG24 — EFR32MG24A010F1536IM40:** Reduce budgets for wireless/security stacks. The AI accelerator is not a graphics GPU.
- **MSPM0 G — MSPM0G3507:** MATHACL and general DMA are not 2D graphics acceleration.
- **Tiva C TM4C129 — TM4C1294NCPDT:** External peripheral interface and general DMA do not imply a GPU.
- **NuMicro M55M1 — M55M1 reference envelope:** Includes multiple SRAM/TCM banks; check accelerator/DMA access. Helium requires optimized routines.
- **Apollo3 — Apollo3 reference envelope:** Reference SRAM total is before SDK/BLE reservations.
- **Apollo4 Plus — Apollo4 Plus reference envelope:** MRAM code storage; selected graphics capability requires the vendor LVGL renderer. No acceleration is assumed enabled.
- **Apollo510 — Apollo510 reference envelope:** MRAM code storage; SRAM includes TCM/system banks. Nema GPU and Helium need compatible software.
- **Ensemble E7 · MCU cores — E7 upper reference envelope:** 13.5 MiB SRAM / 5.5 MiB MRAM are shared family-envelope totals, not one M55 heap. Set core-available budgets. Choose Embedded Linux instead when running Linux on A32.

## Additional cross-checks

The catalog stores a directly relevant source per profile. These primary documents provide cross-family comparisons or clarify integration details:

- [Espressif chip-selection table](https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/get-started/board-selection.html) and [ESP32-P4 external RAM](https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-guides/external-ram.html).
- [NXP i.MX RT portfolio](https://www.nxp.com/docs/en/brochure/IMXRTPORTBR.pdf), [RT500/RT600 comparison](https://www.nxp.com/docs/en/fact-sheet/IMXRT500RT600FS.pdf) and [VGLite integration targets](https://www.nxp.com/docs/en/application-note/AN14210.pdf).
- [ST U5 graphics lines](https://www.st.com/resource/en/product_presentation/stm32u5-mcu-lines-for-advanced-graphics.pdf): U5A9 has 2.5 MB SRAM; the 3 MB line is U5G9. [STM32N6 reference datasheet](https://www.st.com/resource/en/datasheet/stm32n655i0.pdf): the profile uses a conservative 4 MiB planning baseline within the advertised 4.2 MB memory envelope.
- [Nordic Matter memory budgets](https://nrfconnectdocs.nordicsemi.com/addons/ncs-matter/latest/memory.html): nRF54L15 usable NVM baseline 1,524 KiB rather than treating the marketing 1.5 MB label as 1,536 KiB of unrestricted storage.
- [Raspberry Pi microcontroller documentation](https://www.raspberrypi.com/documentation/microcontrollers/microcontroller-chips.html): RP2350 base silicon has no assumed package flash; actual package/module capacity must be entered.
- [Ambiq Apollo family brochure](https://contentportal.ambiq.com/documents/20123/387733/Apollo-SoC-Family-Brochure-EN-A4.pdf) and [Apollo510](https://ambiq.com/product/apollo510/).
- [LVGL STM32 DMA2D](https://lvgl.io/docs/open/integration/chip_vendors/stm32/dma2d_gpu), [Arm-2D / Helium](https://lvgl.io/docs/open/integration/chip_vendors/arm/arm2d), [draw units](https://lvgl.io/docs/open/main-modules/draw/draw_units), and [Espressif 2D DMA](https://lvgl.io/docs/open/9.4/details/integration/chip_vendors/espressif/hardware_accelerator_dma2d.html).

This is a curated starting catalog, not an exhaustive database of every MCU or package. To add a profile, record a primary vendor source, a named reference, explicit KiB budgets, memory caveats and separately confirmed accelerator capabilities in src/targets/catalog.json. Update the review date, this table and catalog tests. Do not infer a GPU from an NPU, SIMD from a core name alone, or installed external memory from a development-board photograph.

Operation scope is explicit in catalog data: STM32 DMA2D receives draw credit, while ESP32-P4 2D DMA receives transfer credit only. PPA/PxP receive fill/blend credit after port confirmation but do not automatically satisfy generic runtime transform or rounded-shape advice. See [LVGL PPA support](https://lvgl.io/docs/open/9.4/details/integration/chip_vendors/espressif/hardware_accelerator_ppa.html) and [Espressif PPA API](https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-reference/peripherals/ppa.html) for operation, format and right-angle rotation restrictions. A general GPU still requires an integrated draw unit and supported effect/format; it is not a timing guarantee.
