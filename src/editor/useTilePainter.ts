import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { GameNode } from '../model';
import { tileChanges, type Cell, type TileStamp, type TileTool } from './tile-tools';

interface Gesture {
  from: Cell;
  last: Cell;
  tool: TileTool;
  changed: boolean;
  nodeId: string;
}
export function useTilePainter({
  enabled,
  node,
  worldX,
  worldY,
  zoom,
  stage,
  tool,
  stamp,
  onApply,
  onPick,
  onTool,
  onError,
}: {
  enabled: boolean;
  node?: GameNode;
  worldX: number;
  worldY: number;
  zoom: number;
  stage: RefObject<HTMLDivElement | null>;
  tool: TileTool;
  stamp: TileStamp;
  onApply: (id: string, changes: Map<number, number>, record: boolean) => void;
  onPick: (id: string) => void;
  onTool: (tool: TileTool) => void;
  onError: (message: string) => void;
}) {
  const [hover, setHover] = useState<Cell | null>(null),
    [rectangle, setRectangle] = useState<{ from: Cell; to: Cell } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const current = useRef({ node, onApply, onPick, onError, stamp });
  current.current = { node, onApply, onPick, onError, stamp };
  useEffect(() => {
    gesture.current = null;
    setHover(null);
    setRectangle(null);
  }, [enabled, node?.id]);
  useEffect(() => {
    if (!enabled) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        gesture.current = null;
        setRectangle(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.target !== stage.current) return;
      const next: Record<string, TileTool> = {
        b: 'brush',
        e: 'erase',
        r: 'rectangle',
        f: 'fill',
        i: 'pick',
      };
      const chosen = next[e.key.toLowerCase()];
      if (chosen) {
        e.preventDefault();
        onTool(chosen);
      }
      if (e.key === 'Escape') {
        gesture.current = null;
        setRectangle(null);
        setHover(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, stage, onTool]);
  const cellAt = (e: PointerEvent): Cell | null => {
    if (!stage.current || !node?.tilemap) return null;
    const b = stage.current.getBoundingClientRect(),
      t = node.tilemap;
    return {
      column: Math.max(
        -16,
        Math.min(t.columns + 16, Math.floor(((e.clientX - b.left) / zoom - worldX) / t.tileSize)),
      ),
      row: Math.max(
        -16,
        Math.min(t.rows + 16, Math.floor(((e.clientY - b.top) / zoom - worldY) / t.tileSize)),
      ),
    };
  };
  const apply = (g: Gesture, to: Cell) => {
    const c = current.current,
      map = c.node?.tilemap;
    if (!map || c.node?.id !== g.nodeId) return;
    try {
      const changes = tileChanges(
        map,
        g.tool,
        c.stamp,
        g.tool === 'rectangle' ? g.from : g.last,
        to,
      );
      if (changes.size) {
        c.onApply(g.nodeId, changes, !g.changed);
        g.changed = true;
      }
    } catch (e) {
      c.onError((e as Error).message);
      gesture.current = null;
    }
  };
  return {
    hover: enabled ? hover : null,
    rectangle: enabled ? rectangle : null,
    pointerDown: (e: PointerEvent) => {
      if (!enabled || !node?.tilemap || ![0, 2].includes(e.button)) return;
      e.preventDefault();
      e.stopPropagation();
      stage.current?.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      const cell = cellAt(e);
      if (!cell) return;
      const selectedTool = e.button === 2 ? 'erase' : e.altKey ? 'pick' : tool;
      if (selectedTool === 'pick') {
        const t = node.tilemap,
          value =
            cell.column >= 0 && cell.row >= 0 && cell.column < t.columns && cell.row < t.rows
              ? t.cells[cell.row * t.columns + cell.column]
              : 0;
        onPick(value ? t.tiles[value - 1] : '');
        return;
      }
      const g: Gesture = {
        from: cell,
        last: cell,
        tool: selectedTool,
        changed: false,
        nodeId: node.id,
      };
      gesture.current = g;
      setHover(cell);
      if (selectedTool === 'rectangle') setRectangle({ from: cell, to: cell });
      else apply(g, cell);
      if (selectedTool === 'fill') gesture.current = null;
    },
    pointerMove: (e: PointerEvent) => {
      if (!enabled) return;
      const cell = cellAt(e);
      setHover(cell);
      const g = gesture.current;
      if (!cell || !g || (cell.column === g.last.column && cell.row === g.last.row)) return;
      if (g.tool === 'rectangle') setRectangle({ from: g.from, to: cell });
      else apply(g, cell);
      g.last = cell;
    },
    pointerUp: () => {
      const g = gesture.current;
      if (g?.tool === 'rectangle') apply(g, g.last);
      gesture.current = null;
      setRectangle(null);
    },
    pointerCancel: () => {
      gesture.current = null;
      setRectangle(null);
    },
    pointerLeave: () => {
      if (!gesture.current) setHover(null);
    },
  };
}
