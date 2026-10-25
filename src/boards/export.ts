import { h7Adapter } from './diagnostics';
import type { Project } from '../model';
import { H7_PORT_COMMIT } from './stm32h7s78';
import { checkpointSources } from './checkpoint-sources.generated';
import { hardwareFiles } from '../input/hardware/export';
export function boardFiles(p: Project): Record<string, string> {
  if (p.board !== 'stm32h7s78-dk') return {};
  return {
    'ui/ports/stm32h7s78_dk.h': `#ifndef LGE_H7S78_DK_H\n#define LGE_H7S78_DK_H\n#include <stdbool.h>\n/* Call after the official port's lvgl_port_init(). */\nbool lge_h7s78_start(void);\nvoid lge_h7_gpu_interrupt(void);\n#endif\n`,
    'ui/ports/stm32h7s78_dk.c': h7Adapter,
    ...checkpointSources,
    ...hardwareFiles(p.inputs),
    'ui/ports/board.json': JSON.stringify(
      {
        board: p.board,
        display: [800, 480],
        color: 'RGB565',
        renderer: 'NeoChrom GPU2D / NemaGFX M7',
        dma2d: 'LTDC flush only',
        port: 'https://github.com/lvgl/lv_port_stm32h7s78-dk',
        commit: H7_PORT_COMMIT,
        checkpoints: {
          backend: 'internal-flash-journal',
          address: '0x0800c000',
          bytes: 16384,
          protectedBootBytes: 49152,
          maxPacketBytes: 4096,
        },
      },
      null,
      2,
    ),
    'ui/ports/README.md': `# STM32H7S78-DK\n\n800 × 480 RGB565 touch display, NeoChrom GPU2D. Cortex-M7 has no Helium.\n\nUse the LVGL official board port pinned to ${H7_PORT_COMMIT}. Preserve its boot project, MPU/cache, XSPI, LTDC, GPU2D, ICACHE_GPU2D, Nema pool and framebuffer linker sections. Select the NemaGFX Cortex-M7 hard-float library. Keep DMA2D drawing disabled while LTDC uses DMA2D flush. Include ../lv_conf_acceleration.h at the end of the active lv_conf.h.\n\nBuild this export from the engine repository with:\n\n\`python3 scripts/build-stm32h7s78.py --ui /absolute/path/to/ui\`\n\nThe script builds the separate Boot and Appli images using the pinned port and an ARM GNU toolchain. It does not flash a device. Replace lv_demo_benchmark() with lge_h7s78_start() after lvgl_port_init(). Link ports/stm32h7s78_dk.c alongside the ui CMake target. Call lv_timer_handler() continuously. The diagnostics adapter also requires KEEP(*(LgeTelemetry)) in the uncached RAM_CMD linker section and lge_h7_gpu_interrupt() after HAL_GPU2D_IRQHandler() in the board IRQ handler. The bundled builder adds these to prepared copies.\n\nThe optional 2D NeoChrom terrain cache is off by default because village tests measured it slower. --terrain-cache-kib accepts 32, 128, 512 or 2048 KiB for a fixed external-PSRAM ring, or 0 for no cache. Generic/software builds allocate no terrain pixels automatically. --profile-2d enables repeatable normal-input movement for measurement. The editor uses a hardware reset (-hardRst) after changing this external-XIP application; it does not change boot or option bytes.\n\nFramebuffer storage is 1,536,000 bytes in PSRAM for two full screens. Assets execute/read from external flash. Touch controller buttons are ordinary UI buttons mapped to engine input actions. Hardware audio remains application-owned through ui_config_t.audio.\n\nDesktop preview uses software rendering and cannot measure board frame rate. Verify rendering, touch orientation, caches, GPU fallback and timing on hardware before deployment.\n`,
  };
}
