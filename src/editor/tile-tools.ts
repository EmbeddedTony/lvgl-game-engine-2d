import type { TileMap } from '../model';

export type TileTool = 'brush' | 'erase' | 'rectangle' | 'fill' | 'pick';
export interface TileStamp {
  width: number;
  height: number;
  cells: string[];
}
export interface Cell {
  column: number;
  row: number;
}
export function lineCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let x = a.column,
    y = a.row;
  const dx = Math.abs(b.column - x),
    dy = -Math.abs(b.row - y),
    sx = x < b.column ? 1 : -1,
    sy = y < b.row ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    cells.push({ column: x, row: y });
    if (x === b.column && y === b.row) break;
    const next = 2 * error;
    if (next >= dy) {
      error += dy;
      x += sx;
    }
    if (next <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}
export function stampFromRegion(cells: string[], columns: number, a: Cell, b: Cell): TileStamp {
  const left = Math.min(a.column, b.column),
    top = Math.min(a.row, b.row);
  const width = Math.min(16, Math.abs(a.column - b.column) + 1),
    height = Math.min(16, Math.abs(a.row - b.row) + 1);
  return {
    width,
    height,
    cells: Array.from(
      { length: width * height },
      (_, i) => cells[(top + Math.floor(i / width)) * columns + left + (i % width)] ?? '',
    ),
  };
}
/** Return changed indices only. Strokes can commit one undo entry and apply deltas. */
export function tileChanges(
  map: TileMap,
  tool: TileTool,
  stamp: TileStamp,
  from: Cell,
  to = from,
): Map<number, number> {
  const changes = new Map<number, number>();
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < map.columns && r < map.rows;
  const valueAt = (x: number, y: number) => {
    const id =
      stamp.cells[
        (((y % stamp.height) + stamp.height) % stamp.height) * stamp.width +
          (((x % stamp.width) + stamp.width) % stamp.width)
      ];
    if (!id) return -1; /* Holes in a stamp never erase existing terrain. */
    const value = map.tiles.indexOf(id) + 1;
    if (!value) throw new Error('Use this tileset on the layer before painting.');
    return value;
  };
  const put = (c: number, r: number, v: number) => {
    if (inside(c, r) && v >= 0) {
      const index = r * map.columns + c;
      if (map.cells[index] === v) changes.delete(index);
      else changes.set(index, v);
    }
  };
  if (tool === 'pick') return changes;
  if (tool === 'fill') {
    if (!inside(from.column, from.row)) return changes;
    const target = map.cells[from.row * map.columns + from.column];
    const visited = new Uint8Array(map.cells.length),
      queue = [from.row * map.columns + from.column];
    visited[queue[0]] = 1;
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i],
        c = index % map.columns,
        r = Math.floor(index / map.columns);
      put(c, r, valueAt(c - from.column, r - from.row));
      for (const next of [
        { column: c - 1, row: r },
        { column: c + 1, row: r },
        { column: c, row: r - 1 },
        { column: c, row: r + 1 },
      ]) {
        if (!inside(next.column, next.row)) continue;
        const j = next.row * map.columns + next.column;
        if (!visited[j] && map.cells[j] === target) {
          visited[j] = 1;
          queue.push(j);
        }
      }
    }
    return changes;
  }
  if (tool === 'rectangle') {
    const left = Math.max(0, Math.min(from.column, to.column)),
      right = Math.min(map.columns - 1, Math.max(from.column, to.column));
    const top = Math.max(0, Math.min(from.row, to.row)),
      bottom = Math.min(map.rows - 1, Math.max(from.row, to.row));
    for (let r = top; r <= bottom; r++)
      for (let c = left; c <= right; c++) put(c, r, valueAt(c - left, r - top));
    return changes;
  }
  for (const cell of lineCells(from, to))
    for (let y = 0; y < stamp.height; y++)
      for (let x = 0; x < stamp.width; x++)
        put(cell.column + x, cell.row + y, tool === 'erase' ? 0 : valueAt(x, y));
  return changes;
}
