import { useEffect, useRef } from 'react';
import type { NativeControl } from './types';
const buttons: Record<string, number> = {
  a: 1,
  arrowleft: 1,
  d: 2,
  arrowright: 2,
  w: 4,
  arrowup: 4,
  s: 8,
  arrowdown: 8,
  ' ': 16,
  p: 64,
  e: 32,
  z: 32,
  enter: 32,
};
export function useNativeInput(
  control: (command: NativeControl) => void,
  running: boolean,
  paused: boolean,
) {
  const keys = useRef(new Set<string>()),
    point = useRef({ x: 0, y: 0 });
  const release = () => {
    keys.current.clear();
    control({ op: 'input', mask: 0 });
    control({ op: 'pointer', ...point.current, down: false });
  };
  useEffect(() => {
    if (!running) return;
    const blur = () => {
      release();
      control({ op: 'pause', paused: true });
    };
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('blur', blur);
      release();
    };
  }, [running, control]);
  const key = (event: React.KeyboardEvent<HTMLCanvasElement>, down: boolean) => {
    const value = event.key.toLowerCase();
    if (!running || event.metaKey || event.ctrlKey) return;
    if (value === 'escape' && down && !event.repeat) {
      event.preventDefault();
      release();
      control({ op: 'pause', paused: !paused });
      return;
    }
    if (!buttons[value]) return;
    event.preventDefault();
    if (down) keys.current.add(value);
    else keys.current.delete(value);
    let mask = 0;
    for (const value of keys.current) mask |= buttons[value] ?? 0;
    control({ op: 'input', mask });
  };
  const pointer = (event: React.PointerEvent<HTMLCanvasElement>, down: boolean) => {
    if (!running) return;
    const element = event.currentTarget,
      bounds = element.getBoundingClientRect();
    point.current = {
      x: Math.max(
        0,
        Math.min(
          element.width - 1,
          Math.floor(((event.clientX - bounds.left) * element.width) / bounds.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          element.height - 1,
          Math.floor(((event.clientY - bounds.top) * element.height) / bounds.height),
        ),
      ),
    };
    control({ op: 'pointer', ...point.current, down });
  };
  return {
    onKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => key(event, true),
    onKeyUp: (event: React.KeyboardEvent<HTMLCanvasElement>) => key(event, false),
    onBlur: release,
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.button !== 0) return;
      pointer(event, true);
    },
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
      pointer(event, !!(event.buttons & 1));
    },
    onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
      pointer(event, false);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: release,
    onContextMenu: (event: React.MouseEvent<HTMLCanvasElement>) => event.preventDefault(),
  };
}
