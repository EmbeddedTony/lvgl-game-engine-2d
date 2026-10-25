import { useEffect, useRef } from 'react';

/** Pointer capture and keyboard resizing share the same bounded command. */
export function DockSeparator({
  name,
  axis,
  value,
  min,
  max,
  defaultValue,
  onChange,
  className = '',
  reverse = false,
}: {
  name: string;
  axis: 'horizontal' | 'vertical';
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  className?: string;
  reverse?: boolean;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const resetCursor = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    drag.current = null;
  };
  useEffect(() => resetCursor, []);
  const bounded = (size: number) => onChange(Math.max(min, Math.min(max, size)));
  return (
    <div
      className={`dock-separator ${className}`}
      role="separator"
      aria-label={name}
      aria-orientation={axis}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${name} · drag or use arrow keys · double-click to reset`}
      onDoubleClick={() => onChange(defaultValue)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { start: axis === 'vertical' ? event.clientX : event.clientY, value };
        document.body.style.cursor = axis === 'vertical' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const position = axis === 'vertical' ? event.clientX : event.clientY;
        bounded(drag.current.value + (position - drag.current.start) * (reverse ? -1 : 1));
      }}
      onPointerUp={resetCursor}
      onPointerCancel={resetCursor}
      onLostPointerCapture={resetCursor}
      onKeyDown={(event) => {
        const decrement = axis === 'vertical' ? 'ArrowLeft' : 'ArrowUp',
          increment = axis === 'vertical' ? 'ArrowRight' : 'ArrowDown';
        if (event.key === decrement || event.key === increment) {
          event.preventDefault();
          bounded(value + (event.key === increment ? 16 : -16) * (reverse ? -1 : 1));
        }
        if (event.key === 'Home') {
          event.preventDefault();
          bounded(min);
        }
        if (event.key === 'End') {
          event.preventDefault();
          bounded(max);
        }
      }}
    />
  );
}
