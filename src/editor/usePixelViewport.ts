import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** React to moving between monitors as well as browser/OS zoom changes. */
export function useDevicePixelRatio() {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const update = () => setRatio(window.devicePixelRatio || 1);
    const monitor = window.matchMedia(`(resolution: ${ratio}dppx)`);
    monitor.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      monitor.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [ratio]);
  return ratio;
}

/** Align the rendered frame's origin, even when flex centering or scroll offsets are fractional. */
export function usePixelAlignment(
  enabled: boolean,
  ratio: number,
  container: RefObject<HTMLElement | null>,
  frame: RefObject<HTMLElement | null>,
  revision: string,
): CSSProperties {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const element = frame.current,
      parent = container.current;
    if (!element || !parent || !enabled) {
      setOffset((old) => (old.x || old.y ? { x: 0, y: 0 } : old));
      return;
    }
    const align = () => {
      const bounds = element.getBoundingClientRect();
      const x = bounds.left - (parseFloat(element.style.left) || 0);
      const y = bounds.top - (parseFloat(element.style.top) || 0);
      // Use layout offsets, not an extra compositing transform: translating a
      // pre-rasterized layer by half a CSS pixel can itself blur otherwise crisp art.
      // Chromium lays out in 1/64 CSS-pixel units.
      const layout = (value: number) => Math.round(value * 64) / 64;
      // Canvas placement also needs a CSS-pixel boundary. At 125% OS scale,
      // multiples of four CSS pixels are simultaneously whole physical pixels.
      const step =
        Array.from({ length: 64 }, (_, i) => i + 1).find(
          (s) => Math.abs(s * ratio - Math.round(s * ratio)) < 1e-5,
        ) ?? 1 / ratio;
      const next = {
        x: layout(Math.round(x / step) * step - x),
        y: layout(Math.round(y / step) * step - y),
      };
      setOffset((old) =>
        Math.abs(old.x - next.x) < 1e-5 && Math.abs(old.y - next.y) < 1e-5 ? old : next,
      );
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(parent);
    observer.observe(element);
    window.addEventListener('scroll', align, true);
    window.addEventListener('resize', align);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', align, true);
      window.removeEventListener('resize', align);
    };
  }, [enabled, ratio, container, frame, revision]);
  return {
    position: 'relative',
    left: enabled ? offset.x : 0,
    top: enabled ? offset.y : 0,
  };
}
