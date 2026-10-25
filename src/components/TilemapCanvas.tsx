import { tileFrame } from '../tiles/animation';
import { useEffect, useRef } from 'react';
import type { TileMap } from '../model';
import { renderPixel } from '../pixel-perfect';

/** One viewport-sized bitmap per layer; a large map never creates a DOM node per cell. */
export function TilemapCanvas({
  map,
  sprites,
  x,
  y,
  displayWidth,
  displayHeight,
  animationTicks = 0,
  originX = 0,
  originY = 0,
  sampleScale = 1,
}: {
  map: TileMap;
  sprites: Record<string, string>;
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  animationTicks?: number;
  originX?: number;
  originY?: number;
  sampleScale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    images = useRef(new Map<string, Promise<HTMLImageElement>>());
  const scale = Math.max(1 / 128, Math.min(1, sampleScale));
  const left = Math.max(0, originX - renderPixel(x)),
    top = Math.max(0, originY - renderPixel(y));
  const width = Math.max(
    0,
    Math.min(map.columns * map.tileSize - left, originX + displayWidth - renderPixel(x) - left),
  );
  const height = Math.max(
    0,
    Math.min(map.rows * map.tileSize - top, originY + displayHeight - renderPixel(y) - top),
  );
  const animationKey = Object.values(map.animations ?? {})
    .map((a) => Math.floor((animationTicks * a.fps) / 60) % a.frames.length)
    .join(',');
  useEffect(() => {
    if (!canvas.current || !width || !height) return;
    let cancelled = false;
    const ctx = canvas.current.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    const c0 = Math.floor(left / map.tileSize),
      r0 = Math.floor(top / map.tileSize),
      c1 = Math.min(map.columns, Math.ceil((left + width) / map.tileSize)),
      r1 = Math.min(map.rows, Math.ceil((top + height) / map.tileSize));
    const used = new Set<number>();
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++) {
        const value = map.cells[r * map.columns + c];
        if (value) used.add(value);
      }
    const load = (uri: string) => {
      let cached = images.current.get(uri);
      if (!cached) {
        cached = new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Tile image could not be decoded.'));
          img.src = uri;
        });
        images.current.set(uri, cached);
      }
      return cached;
    };
    void Promise.all(
      [...used].map(async (value) => {
        const uri = sprites[tileFrame(map, value, animationTicks)];
        return [value, uri ? await load(uri) : null] as const;
      }),
    )
      .then((loaded) => {
        if (cancelled) return;
        const byValue = new Map(loaded);
        for (let r = r0; r < r1; r++)
          for (let c = c0; c < c1; c++) {
            const img = byValue.get(map.cells[r * map.columns + c]);
            if (img)
              ctx.drawImage(
                img,
                c * map.tileSize - left,
                r * map.tileSize - top,
                map.tileSize,
                map.tileSize,
              );
          }
        if (images.current.size > 512) images.current.clear();
      })
      .catch(() => {
        /* Asset validation surfaces missing assets in the console. */
      });
    return () => {
      cancelled = true;
    };
  }, [map, sprites, left, top, width, height, scale, animationKey]);
  return width && height ? (
    <canvas
      ref={canvas}
      width={Math.ceil(width * scale)}
      height={Math.ceil(height * scale)}
      className="tilemap-canvas"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
      aria-label="Tilemap pixels"
    />
  ) : null;
}
