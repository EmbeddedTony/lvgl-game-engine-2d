import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  anchoredPan,
  editorZoom,
  editorZoomSteps,
  snapEditorPan,
  stepEditorZoom,
  type EditorView,
  type Point,
  type ViewBounds,
} from './viewport-navigation';

interface Options {
  viewport: RefObject<HTMLDivElement | null>;
  frame: RefObject<HTMLDivElement | null>;
  focusTarget: RefObject<HTMLDivElement | null>;
  context: string;
  active: boolean;
  playing: boolean;
  painting: boolean;
  pixels: boolean;
  ratio: number;
  display: { width: number; height: number };
  bounds: (selection: boolean) => ViewBounds;
}
interface Measure {
  width: number;
  height: number;
  center: Point;
}
const emptyMeasure: Measure = { width: 0, height: 0, center: { x: 0, y: 0 } };
const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]');

/** Owns presentation only: navigation never commits a project change or changes game cameras. */
export function useSceneNavigation(options: Options) {
  const current = useRef(options);
  current.current = options;
  const views = useRef(new Map<string, EditorView>());
  const [, refresh] = useState(0);
  const [measure, setMeasure] = useState(emptyMeasure),
    metrics = useRef(emptyMeasure);
  const [panning, setPanning] = useState(false),
    [spaceHeld, setSpaceHeld] = useState(false);
  const space = useRef(false),
    hover = useRef(false),
    wheel = useRef(0);
  const gesture = useRef<{ pointer: number; start: Point; pan: Point } | null>(null);
  const viewFor = () => {
    const key = current.current.context;
    if (!views.current.has(key)) {
      if (views.current.size >= 64) views.current.delete(views.current.keys().next().value!);
      views.current.set(key, { zoom: 2, pan: { x: 0, y: 0 }, automatic: true });
    }
    return views.current.get(key)!;
  };
  const update = (next: EditorView) => {
    const old = viewFor();
    if (
      old.zoom === next.zoom &&
      old.pan.x === next.pan.x &&
      old.pan.y === next.pan.y &&
      old.automatic === next.automatic
    )
      return;
    views.current.set(current.current.context, next);
    refresh((v) => v + 1);
  };
  const panAt = (x: number, y: number) => ({
    x: snapEditorPan(x, current.current.ratio, current.current.pixels),
    y: snapEditorPan(y, current.current.ratio, current.current.pixels),
  });
  const frameBounds = (bounds: ViewBounds, automatic = false) => {
    const o = current.current,
      size = metrics.current;
    if (!size.width || !size.height) return;
    const raw = Math.min((size.width - 80) / bounds.width, (size.height - 85) / bounds.height);
    const zoom =
      o.playing && o.pixels
        ? Math.max(1 / o.ratio, editorZoom(raw, o.ratio, true, true))
        : editorZoom(raw, o.ratio, o.pixels, true);
    update({
      zoom,
      automatic,
      pan: panAt(
        (o.display.width / 2 - bounds.x - bounds.width / 2) * zoom,
        (o.display.height / 2 - bounds.y - bounds.height / 2) * zoom,
      ),
    });
  };
  const fit = () => frameBounds({ x: 0, y: 0, ...current.current.display }, true);
  const zoomTo = (requested: number, client?: Point) => {
    if (!Number.isFinite(requested)) return;
    const o = current.current,
      size = metrics.current,
      old = viewFor();
    const zoom =
      o.playing && o.pixels
        ? Math.max(1 / o.ratio, editorZoom(requested, o.ratio, true))
        : editorZoom(requested, o.ratio, o.pixels);
    if (zoom === old.zoom) {
      update({ ...old, pan: panAt(old.pan.x, old.pan.y), automatic: false });
      return;
    }
    const viewport = o.viewport.current?.getBoundingClientRect(),
      frame = o.frame.current?.getBoundingClientRect();
    const point =
      client && viewport
        ? { x: client.x - viewport.left, y: client.y - viewport.top }
        : size.center;
    const origin =
      frame && viewport
        ? { x: frame.left - viewport.left, y: frame.top - viewport.top }
        : {
            x: size.center.x - (o.display.width * old.zoom) / 2 + old.pan.x,
            y: size.center.y - (o.display.height * old.zoom) / 2 + old.pan.y,
          };
    const pan = anchoredPan(point, origin, old.zoom, zoom, size.center, o.display);
    const nextPan = o.playing ? { x: 0, y: 0 } : panAt(pan.x, pan.y);
    update({ zoom, pan: nextPan, automatic: false });
    if (gesture.current && client) {
      gesture.current.pan = nextPan;
      gesture.current.start = client;
    }
  };
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g && current.current.viewport.current?.hasPointerCapture(g.pointer))
      current.current.viewport.current.releasePointerCapture(g.pointer);
    setPanning(false);
  };
  const blur = () => {
    end();
    space.current = false;
    setSpaceHeld(false);
    wheel.current = 0;
  };
  useLayoutEffect(() => {
    const element = options.viewport.current;
    if (!options.active || !element) return;
    const resize = () => {
      const css = getComputedStyle(element),
        width = element.clientWidth,
        height = element.clientHeight;
      const next = {
        width,
        height,
        center: {
          x: (width + parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)) / 2,
          y: (height + parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)) / 2,
        },
      };
      if (
        width !== metrics.current.width ||
        height !== metrics.current.height ||
        next.center.x !== metrics.current.center.x ||
        next.center.y !== metrics.current.center.y
      ) {
        metrics.current = next;
        setMeasure(next);
      }
      // A manual zoom/pan is never replaced by layout, scrollbar or recovery updates.
      if (viewFor().automatic) fit();
      else zoomTo(viewFor().zoom); // Re-quantize for monitor/pixel-policy changes, never auto-fit.
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, [
    options.context,
    options.active,
    options.display.width,
    options.display.height,
    options.ratio,
    options.pixels,
  ]);
  useEffect(() => {
    const element = options.viewport.current;
    if (!options.active || !element) return;
    const onWheel = (e: WheelEvent) => {
      if (editable(e.target)) return;
      e.preventDefault();
      const delta =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? element.clientHeight : 1);
      if (!delta) return;
      if (Math.sign(wheel.current) !== Math.sign(delta)) wheel.current = 0;
      wheel.current += delta;
      if (Math.abs(wheel.current) < 40) return;
      const direction = wheel.current < 0 ? 1 : -1;
      wheel.current = 0;
      const o = current.current;
      zoomTo(stepEditorZoom(viewFor().zoom, direction, o.ratio, o.pixels), {
        x: e.clientX,
        y: e.clientY,
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    const down = (e: KeyboardEvent) => {
      const o = current.current;
      if (
        e.defaultPrevented ||
        o.playing ||
        editable(e.target) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (!hover.current && !element.contains(e.target as Node)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
        setSpaceHeld(true);
      }
      if (e.key.toLowerCase() === 'f' && !o.painting) {
        e.preventDefault();
        frameBounds(o.bounds(true));
      }
      if (e.key === 'Home') {
        e.preventDefault();
        frameBounds(o.bounds(false));
      }
      if (e.key === 'Escape') blur();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [options.context, options.active]);
  const view = viewFor();
  const origin = {
    x: measure.center.x - (options.display.width * view.zoom) / 2 + view.pan.x,
    y: measure.center.y - (options.display.height * view.zoom) / 2 + view.pan.y,
  };
  const windowBounds = measure.width
    ? {
        x: Math.floor(-origin.x / view.zoom) - 4,
        y: Math.floor(-origin.y / view.zoom) - 4,
        width: Math.ceil(measure.width / view.zoom) + 8,
        height: Math.ceil(measure.height / view.zoom) + 8,
      }
    : undefined;
  return {
    zoom: view.zoom,
    pan: options.playing ? { x: 0, y: 0 } : view.pan,
    panning,
    spaceHeld,
    zoomOptions: editorZoomSteps(options.ratio, options.pixels).filter(
      (v) => !options.playing || !options.pixels || v * options.ratio >= 1,
    ),
    windowBounds: options.playing ? undefined : windowBounds,
    fit,
    zoomTo,
    frameAll: () => frameBounds(current.current.bounds(false)),
    frameSelection: () => frameBounds(current.current.bounds(true)),
    onPointerEnter: () => {
      hover.current = true;
    },
    onPointerLeave: () => {
      hover.current = false;
    },
    onPointerDownCapture: (e: PointerEvent<HTMLDivElement>) => {
      if (
        current.current.playing ||
        !(e.button === 2 || e.button === 1 || (e.button === 0 && space.current))
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      gesture.current = {
        pointer: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        pan: { ...viewFor().pan },
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      (current.current.focusTarget.current ?? e.currentTarget).focus({ preventScroll: true });
      setPanning(true);
    },
    onPointerMoveCapture: (e: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      update({
        ...viewFor(),
        pan: panAt(g.pan.x + e.clientX - g.start.x, g.pan.y + e.clientY - g.start.y),
        automatic: false,
      });
    },
    onPointerUpCapture: (e: PointerEvent<HTMLDivElement>) => {
      if (gesture.current?.pointer === e.pointerId) {
        e.preventDefault();
        e.stopPropagation();
        end();
      }
    },
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
