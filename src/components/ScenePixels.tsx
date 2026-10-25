import { buttonTextColor } from '../pixel-perfect';
import { tileFrame } from '../tiles/animation';
import { useLayoutEffect, useRef } from 'react';
import type { GameNode, SpriteAsset } from '../model';
import { renderPixel } from '../pixel-perfect';
import type { ViewBounds } from '../editor/viewport-navigation';

/** One logical-pixel surface; DOM scene nodes above it own input and authoring handles.
 * No separate sprite compositing layers can shift/soften at fractional desktop scales. */
export function ScenePixels({
  nodes,
  images,
  width: displayWidth,
  height: displayHeight,
  background,
  text,
  animationTicks = 0,
  transparentBackground = false,
  window: viewWindow,
  sampleScale = 1,
}: {
  nodes: GameNode[];
  images: Record<string, SpriteAsset>;
  width: number;
  height: number;
  background: string;
  animationTicks?: number;
  transparentBackground?: boolean;
  text: (node: GameNode) => string;
  window?: ViewBounds;
  sampleScale?: number;
}) {
  const width = viewWindow?.width ?? displayWidth,
    height = viewWindow?.height ?? displayHeight;
  const originX = viewWindow?.x ?? 0,
    originY = viewWindow?.y ?? 0;
  const rasterScale = Math.max(1 / 128, Math.min(1, sampleScale));
  const canvas = useRef<HTMLCanvasElement>(null);
  const cache = useRef(new Map<string, { source: SpriteAsset; bitmap: HTMLCanvasElement }>());
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(rasterScale, rasterScale);
    ctx.imageSmoothingEnabled = false;
    if (!transparentBackground) {
      ctx.fillStyle = background;
      // The game background belongs to its display rectangle; off-screen editor space
      // stays transparent so the workspace is distinct from actual scene content.
      ctx.fillRect(-originX, -originY, displayWidth, displayHeight);
    }
    const image = (id: string, w: number, h: number, left = 0, top = 0, cw = w, ch = h) => {
      const source = images[id];
      if (!source || !cw || !ch) return null;
      const bw = Math.max(1, Math.ceil(cw * rasterScale)),
        bh = Math.max(1, Math.ceil(ch * rasterScale));
      const key = `${id}:${w}:${h}:${left}:${top}:${cw}:${ch}:${bw}:${bh}`,
        old = cache.current.get(key);
      if (old?.source === source) return old.bitmap;
      const bitmap = document.createElement('canvas');
      bitmap.width = bw;
      bitmap.height = bh;
      const data = bitmap.getContext('2d')!.createImageData(bw, bh);
      for (let row = 0; row < bh; row++)
        for (let col = 0; col < bw; col++) {
          const from =
            (Math.floor((((row * ch) / bh + top) * source.height) / h) * source.width +
              Math.floor((((col * cw) / bw + left) * source.width) / w)) *
            4;
          const dest = (row * bw + col) * 4;
          for (let c = 0; c < 4; c++) data.data[dest + c] = source.pixels[from + c];
        }
      bitmap.getContext('2d')!.putImageData(data, 0, 0);
      // Bound decoded variants to 4 MiB; large clipped sprites need no full-node bitmap.
      let bytes = bw * bh * 4;
      for (const item of cache.current.values())
        bytes += item.bitmap.width * item.bitmap.height * 4;
      if (bytes > 4 * 1024 * 1024 || cache.current.size >= 512) cache.current.clear();
      if (bw * bh * 4 <= 4 * 1024 * 1024) cache.current.set(key, { source, bitmap });
      return bitmap;
    };
    for (const n of nodes) {
      if (!n.visible || ['group', 'instance', 'area'].includes(n.kind)) continue;
      const x = renderPixel(n.x) - originX,
        y = renderPixel(n.y) - originY;
      if (x >= width || y >= height || x + n.width <= 0 || y + n.height <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, n.width, n.height);
      ctx.clip();
      if (n.kind === 'sprite') {
        const left = Math.max(0, -x),
          top = Math.max(0, -y);
        const cw = Math.min(n.width - left, width - Math.max(0, x)),
          ch = Math.min(n.height - top, height - Math.max(0, y));
        const bitmap = image(n.asset, n.width, n.height, left, top, cw, ch);
        if (bitmap) ctx.drawImage(bitmap, x + left, y + top, cw, ch);
      } else if (n.tilemap) {
        const t = n.tilemap;
        for (
          let row = Math.max(0, Math.floor(-y / t.tileSize));
          row < Math.min(t.rows, Math.ceil((height - y) / t.tileSize));
          row++
        )
          for (
            let col = Math.max(0, Math.floor(-x / t.tileSize));
            col < Math.min(t.columns, Math.ceil((width - x) / t.tileSize));
            col++
          ) {
            const value = t.cells[row * t.columns + col];
            const bitmap = value
              ? image(tileFrame(t, value, animationTicks), t.tileSize, t.tileSize)
              : null;
            if (bitmap)
              ctx.drawImage(
                bitmap,
                x + col * t.tileSize,
                y + row * t.tileSize,
                t.tileSize,
                t.tileSize,
              );
          }
      } else {
        if (n.kind === 'rect' || n.kind === 'button') {
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.roundRect(x, y, n.width, n.height, Math.min(n.radius, n.width / 2, n.height / 2));
          ctx.fill();
        }
        if (n.kind === 'label' || n.kind === 'button') {
          ctx.font = '14px Arial, sans-serif';
          ctx.fillStyle = n.kind === 'label' ? n.color : buttonTextColor(n.color);
          ctx.textBaseline = 'top';
          ctx.textAlign = n.kind === 'button' ? 'center' : 'left';
          const lines = text(n).split('\n');
          lines.forEach((line, i) =>
            ctx.fillText(
              line,
              n.kind === 'button' ? x + n.width / 2 : x,
              y +
                (n.kind === 'button' ? Math.max(0, (n.height - lines.length * 18) / 2) : 0) +
                i * 18,
            ),
          );
        }
      }
      ctx.restore();
    }
  }, [
    nodes,
    images,
    width,
    height,
    displayWidth,
    displayHeight,
    originX,
    originY,
    rasterScale,
    background,
    text,
    transparentBackground,
    animationTicks,
  ]);
  return (
    <canvas
      ref={canvas}
      width={Math.ceil(width * rasterScale)}
      height={Math.ceil(height * rasterScale)}
      style={
        viewWindow
          ? { left: originX, top: originY, right: 'auto', bottom: 'auto', width, height }
          : undefined
      }
      data-testid="scene-pixels"
      aria-label="Scene pixels"
      className="scene-pixels"
    />
  );
}
