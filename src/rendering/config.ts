/** Build policy belongs to the project. Scenes only own content and quality. */
export interface RenderingConfig {
  backend: 'software';
  helium: boolean;
  compositor: 'software' | 'dma2d' | 'neochrom';
  stm32Hal?: string; // Explicit port setting, never inferred from guidance assumptions.
}
export const stm32HalHeaders = [
  'stm32f4xx_hal.h',
  'stm32f7xx_hal.h',
  'stm32h7xx_hal.h',
  'stm32h7rsxx_hal.h',
  'stm32u5xx_hal.h',
  'stm32n6xx_hal.h',
];
export const defaultRendering: RenderingConfig = {
  backend: 'software',
  helium: false,
  compositor: 'software',
};
export function validRendering(value: unknown): value is RenderingConfig {
  if (!value || typeof value !== 'object') return false;
  const r = value as RenderingConfig;
  return (
    r.backend === 'software' &&
    typeof r.helium === 'boolean' &&
    ['software', 'dma2d', 'neochrom'].includes(r.compositor) &&
    (r.stm32Hal === undefined || stm32HalHeaders.includes(r.stm32Hal))
  );
}

export function accelerationSettings(p: { rendering?: RenderingConfig }) {
  return {
    dma2d: p.rendering?.compositor === 'dma2d',
    neochrom: p.rendering?.compositor === 'neochrom',
  };
}
