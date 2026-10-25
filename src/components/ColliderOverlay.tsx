import { useRef, type PointerEvent } from 'react';
import type { GameNode } from '../model';
import { colliderBox, physicsFor, type Box, type Physics } from '../physics';
import { renderPixel } from '../pixel-perfect';

/** Pure authoring overlay. It never creates artwork or exports debug widgets. */
export function ColliderOverlay({
  nodes,
  selected,
  editing,
  show,
  zoom,
  onChange,
}: {
  nodes: GameNode[];
  selected: string;
  editing: boolean;
  show: boolean;
  zoom: number;
  onChange: (id: string, physics: Physics, record: boolean) => void;
}) {
  const drag = useRef<{
    id: string;
    p: Physics;
    box: Box;
    x: number;
    y: number;
    corner?: string;
    changed: boolean;
  } | null>(null);
  const start = (e: PointerEvent, n: GameNode, corner?: string) => {
    if (!editing || selected !== n.id || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = physicsFor(n);
    drag.current = {
      id: n.id,
      p,
      box: p.box ?? { x: 0, y: 0, width: n.width, height: n.height },
      x: e.clientX,
      y: e.clientY,
      corner,
      changed: false,
    };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const dx = Math.round((e.clientX - d.x) / zoom),
      dy = Math.round((e.clientY - d.y) / zoom);
    const box = { ...d.box };
    if (d.corner) {
      const left = d.corner.includes('l'),
        top = d.corner.includes('t');
      box.width = Math.max(1, Math.min(2048, d.box.width + (left ? -dx : dx)));
      box.height = Math.max(1, Math.min(2048, d.box.height + (top ? -dy : dy)));
      if (left) box.x += d.box.width - box.width;
      if (top) box.y += d.box.height - box.height;
    } else {
      box.x += dx;
      box.y += dy;
    }
    box.x = Math.max(-2048, Math.min(2048, box.x));
    box.y = Math.max(-2048, Math.min(2048, box.y));
    if (!dx && !dy && !d.changed) return;
    onChange(d.id, { ...d.p, box }, !d.changed);
    d.changed = true;
  };
  return (
    <div className="collider-overlay" aria-label="Collision shapes">
      {nodes
        .filter(
          (n) =>
            n.visible &&
            physicsFor(n).body !== 'none' &&
            (show || (n.id === selected && editing) || (n.kind === 'area' && n.id === selected)),
        )
        .flatMap((n) => {
          const p = physicsFor(n),
            box = colliderBox(n);
          if (n.tilemap)
            return n.tilemap.cells.flatMap((v, i) =>
              n.tilemap!.solidTiles.includes(v) ? (
                <div
                  key={`${n.id}-${i}`}
                  className="collider-shape static tile-collider"
                  style={{
                    left: renderPixel(n.x) + (i % n.tilemap!.columns) * n.tilemap!.tileSize,
                    top:
                      renderPixel(n.y) + Math.floor(i / n.tilemap!.columns) * n.tilemap!.tileSize,
                    clipPath:
                      n.tilemap!.slopes?.[v] === 'up'
                        ? 'polygon(0 100%,100% 0,100% 100%)'
                        : n.tilemap!.slopes?.[v] === 'down'
                          ? 'polygon(0 0,100% 100%,0 100%)'
                          : undefined,
                    width: n.tilemap!.tileSize,
                    height: n.tilemap!.tileSize,
                  }}
                />
              ) : (
                []
              ),
            );
          const active = editing && n.id === selected;
          return (
            <div
              key={n.id}
              data-testid={`collider-${n.id}`}
              className={`collider-shape ${p.body} ${active ? 'editing' : ''}`}
              style={{
                left: renderPixel(box.x),
                top: renderPixel(box.y),
                width: renderPixel(box.x + box.width) - renderPixel(box.x),
                height: renderPixel(box.y + box.height) - renderPixel(box.y),
              }}
              onPointerDown={(e) => start(e, n)}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              {p.travel && (
                <svg className="platform-path" style={{ overflow: 'visible' }}>
                  <line
                    x1={box.width / 2}
                    y1={box.height / 2}
                    x2={box.width / 2 + p.travel.x}
                    y2={box.height / 2 + p.travel.y}
                    stroke="#b48cff"
                    strokeDasharray="4 4"
                  />
                  <rect
                    x={p.travel.x}
                    y={p.travel.y}
                    width={box.width}
                    height={box.height}
                    fill="#b48cff18"
                    stroke="#b48cff"
                    strokeDasharray="3 3"
                  />
                </svg>
              )}
              {p.slope && (
                <svg className="slope-outline" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path
                    d={p.slope === 'up' ? 'M0 100 L100 0 L100 100 Z' : 'M0 0 L100 100 L0 100 Z'}
                    fill="#69d6a422"
                    stroke="#69d6a4"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <span className="collider-label">{p.body === 'area' ? n.name : p.body}</span>
              {active &&
                ['tl', 'tr', 'bl', 'br'].map((corner) => (
                  <i
                    key={corner}
                    data-testid={`collider-handle-${corner}`}
                    className={`handle collider-handle ${corner}`}
                    onPointerDown={(e) => start(e, n, corner)}
                  />
                ))}
            </div>
          );
        })}
    </div>
  );
}
