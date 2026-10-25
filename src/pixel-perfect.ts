/** Rendering policy shared by the editor, playtest and exporter. No physics rounding. */
export const pixelPerfectEnabled = (project: { pixelPerfect?: boolean }) =>
  project.pixelPerfect !== false;

/** Match C roundf, including negative half-pixels. Snap the final world position once. */
export const renderPixel = (value: number) => (value < 0 ? -Math.round(-value) : Math.round(value));

/** Uniform positive integer enlargement preserves every source pixel's shape. */
export function spritePixelScale(
  source: { width: number; height: number },
  target: { width: number; height: number },
): number | null {
  const scale = target.width / source.width;
  return Number.isInteger(scale) && scale >= 1 && target.height === source.height * scale
    ? scale
    : null;
}

/** CSS pixels vary with Retina/OS/browser scaling. Quantize in physical display pixels. */
export function pixelZoom(cssScale: number, devicePixelRatio: number, fit = false): number {
  const physical = cssScale * devicePixelRatio;
  return Math.max(1, fit ? Math.floor(physical + 1e-7) : Math.round(physical)) / devicePixelRatio;
}

export function viewportScale(
  available: { width: number; height: number },
  game: { width: number; height: number },
  devicePixelRatio: number,
  pixelPerfect: boolean,
): number {
  const fit = Math.min(4, available.width / game.width, available.height / game.height);
  // At least one physical pixel per game pixel; small viewports scroll instead of losing pixels.
  return pixelPerfect ? pixelZoom(fit, devicePixelRatio, true) : Math.max(0.1, fit);
}

/** Match the native adapter's automatic button text contrast. */
export function buttonTextColor(color: string) {
  const n = parseInt(color.slice(1), 16);
  return (n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114 < 128000
    ? '#dce7ee'
    : '#10271f';
}
