import type { Project } from '../model';
import { accelerationSettings } from './config';
import { resolveScene } from '../scenes';
/** Build-time settings are emitted separately from scene content and board guidance. */
export function renderingFiles(p: Project, uiCmake: (strict: boolean) => string) {
  const acceleration = accelerationSettings(p);
  const clean: Record<string, string> = {};
  const hal = p.rendering?.stm32Hal;
  const strict = p.board === 'stm32h7s78-dk';
  const nodeCapacity = Math.max(
    8,
    ...p.scenes.map((s) => Math.ceil(resolveScene(p, s).length / 8) * 8),
  );
  const checkpoints = p.gameplay?.scripts.some((s) =>
    s.actions.some((a) => a.type === 'checkpoint'),
  );
  const checkpointBytes = checkpoints
    ? 16 +
      (p.gameplay?.state.filter((v) => v.persistent).length ?? 0) * 4 +
      (p.gameplay?.party ? 32 + p.gameplay.party.members.length * 28 : 0)
    : 0;
  clean['ui/CMakeLists.txt'] = uiCmake(strict);
  clean['ui/engine/lge_config.h'] =
    `#ifndef LGE_CONFIG_H\n#define LGE_CONFIG_H\n#define LGE_INPUT_MAX_CHANNELS ${Math.max(1, p.inputs?.channels.length ?? 0)}\n#ifndef LGE_MAX_NODES\n#define LGE_MAX_NODES ${nodeCapacity}\n#endif\n#define LGE_CHECKPOINT_BYTES ${checkpointBytes}\n#ifndef LGE_ACCELERATION_STRICT\n#define LGE_ACCELERATION_STRICT ${strict ? 1 : 0}\n#endif\n#define LGE_REQUIRE_DMA2D ${acceleration.dma2d ? 1 : 0}\n#ifndef LGE_REQUIRE_NEOCHROM\n#define LGE_REQUIRE_NEOCHROM ${acceleration.neochrom ? 1 : 0}\n#endif\n#endif\n`;
  clean['ui/lv_conf_acceleration.h'] =
    `/* Include from lv_conf.h AFTER its defaults, then rebuild LVGL itself.
 * STM32 only: provide HAL/CMSIS and the NemaGFX SDK in your board port.
 * Configure LV_DRAW_DMA2D_HAL_INCLUDE in lv_conf.h for your exact STM32 family.
 * DMA2D flush and LVGL draw cannot own the peripheral concurrently. */
#ifndef LGE_LV_CONF_ACCELERATION_H
#define LGE_LV_CONF_ACCELERATION_H
/* Generic ports opt in only after HAL, memory and peripheral ownership are ready.
 * A graphics selection alone must not pull vendor headers into another MCU. */
#ifndef LGE_PORT_ACCELERATION
#define LGE_PORT_ACCELERATION ${strict ? 1 : 0}
#endif
#if LGE_PORT_ACCELERATION
${acceleration.dma2d ? '#undef LV_USE_DRAW_DMA2D\n#define LV_USE_DRAW_DMA2D 1' + (hal ? `\n#undef LV_DRAW_DMA2D_HAL_INCLUDE\n#define LV_DRAW_DMA2D_HAL_INCLUDE "${hal}"` : '\n/* Set LV_DRAW_DMA2D_HAL_INCLUDE for the exact STM32 in lv_conf.h. */') : ''}
${p.board === 'stm32h7s78-dk' ? '#undef LV_USE_NEMA_LIB\n#define LV_USE_NEMA_LIB LV_NEMA_LIB_M7\n#undef LV_USE_DRAW_DMA2D\n#define LV_USE_DRAW_DMA2D 0' : ''}
${acceleration.neochrom ? '#undef LV_USE_NEMA_GFX\n#define LV_USE_NEMA_GFX 1\n#undef LV_USE_NEMA_HAL\n#define LV_USE_NEMA_HAL LV_NEMA_HAL_STM32\n#undef LV_ATTRIBUTE_MEM_ALIGN_SIZE\n#define LV_ATTRIBUTE_MEM_ALIGN_SIZE 16\n#undef LV_ATTRIBUTE_MEM_ALIGN\n#define LV_ATTRIBUTE_MEM_ALIGN __attribute__((aligned(16)))\n#undef LV_DRAW_BUF_ALIGN\n#define LV_DRAW_BUF_ALIGN 16' + (hal ? `\n#undef LV_NEMA_STM32_HAL_INCLUDE\n#define LV_NEMA_STM32_HAL_INCLUDE "${hal}"` : '\n/* Set LV_NEMA_STM32_HAL_INCLUDE for the exact STM32 in lv_conf.h. */') : ''}
#endif
#endif
`;
  return clean;
}
