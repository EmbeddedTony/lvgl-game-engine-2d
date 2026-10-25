import data from './catalog.json' with { type: 'json' };

export interface FamilyProfile {
  id: string;
  vendor: string;
  family: string;
  reference: string;
  kind: 'mcu' | 'linux' | 'host';
  core: string;
  ramKiB: number;
  nvmKiB: number;
  graphics?: string;
  graphicsScope?: 'general-2d' | 'pixel-processor';
  dma2d?: string;
  dma2dScope?: 'draw' | 'transfer';
  helium?: boolean;
  simd?: string;
  notes: string;
  source: string;
}
/** Reference configurations, never guaranteed minima/maxima of an entire family. */
export const families = data.profiles as FamilyProfile[];
export const catalogDate = data.checked;
export const catalogVersion = data.version;
export const familyById = (id: string) => families.find((f) => f.id === id);
export const guidanceSources = {
  dma2d: 'https://lvgl.io/docs/open/integration/chip_vendors/stm32/dma2d_gpu',
  helium: 'https://lvgl.io/docs/open/integration/chip_vendors/arm/arm2d',
  draw: 'https://lvgl.io/docs/open/main-modules/draw/draw_units',
};
