import type { Project } from '../model';
import { targetDefaults } from '../targets/model';
export const H7_PORT_COMMIT = '4e6609de729e9807f27031a4799f92cdee9a833b';
/** Board deployment policy is explicit, separate from generic capability assumptions. */
export function useH7Board(p: Project) {
  p.board = 'stm32h7s78-dk';
  p.width = 800;
  p.height = 480;
  p.colorDepth = 16;
  p.rendering = {
    backend: 'software',
    helium: false,
    compositor: 'neochrom',
    stm32Hal: 'stm32h7rsxx_hal.h',
  };
  p.target = {
    ...targetDefaults('stm32h7rs'),
    externalRamKiB: 32768,
    externalFlashKiB: 131072,
    buffers: 'double',
    bufferCount: 2,
    scanoutBuffers: 0,
    reserveRamKiB: 64,
    reserveNvmKiB: 512,
    decode: 'scanline',
    fps: 30,
    acceleration: ['graphics'],
    displayMbps: 0,
    redrawPercent: 100,
  };
}
