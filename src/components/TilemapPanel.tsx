import { TileAnimationTools } from './TileAnimationTools';
import type { TileAnimation } from '../tiles/animation';
import { useMemo, useRef, type PointerEvent } from 'react';
import { Eraser, Paintbrush, PaintBucket, Pipette, Plus, Square, Upload } from 'lucide-react';
import type { GameNode, Project } from '../model';
import { projectImages } from '../tilesets';
import { packTilemap } from '../compression';
import { stampFromRegion, type Cell, type TileStamp, type TileTool } from '../editor/tile-tools';

export const TILE_TOOLS: { id: TileTool; name: string; key: string; icon: typeof Paintbrush }[] = [
  { id: 'brush', name: 'Brush', key: 'B', icon: Paintbrush },
  { id: 'erase', name: 'Eraser', key: 'E', icon: Eraser },
  { id: 'rectangle', name: 'Rectangle', key: 'R', icon: Square },
  { id: 'fill', name: 'Flood fill', key: 'F', icon: PaintBucket },
  { id: 'pick', name: 'Pick tile', key: 'I', icon: Pipette },
];
export function TilemapPanel({
  project,
  sprites,
  maps,
  node,
  tilesetId,
  tool,
  stamp,
  playing,
  onTileset,
  onMap,
  onTool,
  onStamp,
  onCreate,
  onUse,
  onImport,
  onSolids,
  onSlope,
  onAnimation,
}: {
  project: Project;
  sprites: Record<string, string>;
  maps: GameNode[];
  node?: GameNode;
  tilesetId: string;
  tool: TileTool;
  stamp: TileStamp;
  playing: boolean;
  onTileset: (id: string) => void;
  onMap: (id: string) => void;
  onTool: (tool: TileTool) => void;
  onStamp: (stamp: TileStamp) => void;
  onCreate: (id: string) => void;
  onUse: (id: string) => void;
  onImport: () => void;
  onAnimation: (id: string, animation?: TileAnimation) => void;
  onSlope: (ids: string[], shape: 'box' | 'up' | 'down') => void;
  onSolids: (ids: string[], solid: boolean) => void;
}) {
  const set = project.tilesets?.find((s) => s.id === tilesetId),
    map = node?.tilemap;
  const images = useMemo(
    () => new Map(projectImages(project).map((a) => [a.id, a])),
    [project.sprites, project.tilesets],
  );
  const cells = set?.cells ?? map?.tiles ?? [],
    columns = set?.columns ?? 8,
    rows = set?.rows ?? Math.ceil(cells.length / columns);
  const size = set?.tileSize ?? map?.tileSize ?? 16,
    grid = useRef<HTMLDivElement>(null);
  const anchor = useRef<Cell | null>(null);
  const selected = useMemo(() => new Set(stamp.cells.filter(Boolean)), [stamp]);
  const allSolid =
    selected.size > 0 &&
    [...selected].every((id) => {
      const tile = project.tilesets?.flatMap((s) => s.tiles).find((t) => t.id === id);
      return tile ? tile.solid : map?.solidTiles.includes(map.tiles.indexOf(id) + 1);
    });
  const ready =
    !!map &&
    (tool === 'erase' ||
      tool === 'pick' ||
      ([...selected].every((id) => map.tiles.includes(id)) && selected.size > 0)) &&
    (!set || set.tileSize === map.tileSize);
  const cellAt = (e: PointerEvent): Cell | null => {
    if (!grid.current) return null;
    const rect = grid.current.getBoundingClientRect();
    const column = Math.max(0, Math.min(columns - 1, Math.floor((e.clientX - rect.left) / 36)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - rect.top) / 36)));
    return { column, row };
  };
  const choose = (cell: Cell) => {
    if (anchor.current) {
      onStamp(stampFromRegion(cells, columns, anchor.current, cell));
      onTool('brush');
    }
  };
  return (
    <div className="tilemap-workspace">
      <div className="tilemap-sidebar">
        <label>
          Tilemap layer
          <select
            aria-label="Tilemap layer"
            value={node?.id ?? ''}
            disabled={playing}
            onChange={(e) => onMap(e.target.value)}
          >
            <option value="">Select a layer…</option>
            {maps.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tile palette
          <select
            aria-label="Tileset resource"
            value={set?.id ?? ''}
            onChange={(e) => onTileset(e.target.value)}
          >
            <option value="">Current map tiles</option>
            {project.tilesets?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.tileSize}px
              </option>
            ))}
          </select>
        </label>
        <div className="tilemap-resource-actions">
          <button disabled={playing} onClick={onImport}>
            <Upload size={12} /> Import sheet
          </button>
          <button disabled={!set || playing} onClick={() => set && onCreate(set.id)}>
            <Plus size={12} /> New layer
          </button>
        </div>
        {set &&
          map &&
          (!map.tiles.includes(set.tiles[0].id) ||
            set.tiles.some((t) => !map.tiles.includes(t.id))) && (
            <button
              className="source-open"
              disabled={playing || set.tileSize !== map.tileSize}
              onClick={() => onUse(set.id)}
            >
              Use tileset on this layer
            </button>
          )}
        <p className="field-hint">
          {map
            ? `${map.columns} × ${map.rows} cells · ${map.tileSize}px · ${new Set(map.cells.filter(Boolean)).size}/${map.tiles.length} tile types used`
            : 'Create or select a tilemap layer to start painting.'}
        </p>
        {map && (
          <p className="tilemap-memory">
            {packTilemap(map.cells).bytes.toLocaleString()} B{' '}
            {packTilemap(map.cells).codec.toUpperCase()}
            <span>
              {' '}
              / {map.cells.length.toLocaleString()} B raw · {Math.ceil(map.tiles.length / 8)} B
              collision bits
            </span>
          </p>
        )}
        <TileAnimationTools
          set={set}
          selected={[...selected]}
          disabled={playing}
          onChange={onAnimation}
          onBrush={(id) => onStamp({ width: 1, height: 1, cells: [id] })}
        />
      </div>
      <div className="tilemap-palette-area">
        <div className="tilemap-tool-row" role="toolbar" aria-label="Tile placement tools">
          {TILE_TOOLS.map(({ id, name, key, icon: Icon }) => (
            <button
              key={id}
              disabled={playing}
              aria-label={`${name} tool`}
              title={`${name} · ${key}`}
              aria-pressed={tool === id}
              className={tool === id ? 'active' : ''}
              onClick={() => onTool(id)}
            >
              <Icon size={13} />
              <span>{name}</span>
              <kbd>{key}</kbd>
            </button>
          ))}
          <span>
            {stamp.width} × {stamp.height} stamp · {size}px
          </span>
          <label className="tilemap-solid-check">
            <input
              aria-label="Solid tile selection"
              type="checkbox"
              checked={allSolid}
              disabled={!selected.size || playing}
              onChange={(e) => onSolids([...selected], e.target.checked)}
            />
            Solid
          </label>
          <label>
            Floor shape
            <select
              aria-label="Tile floor shape"
              disabled={!selected.size || playing}
              value={(() => {
                const values = [...selected].map(
                  (id) =>
                    project.tilesets?.flatMap((s) => s.tiles).find((t) => t.id === id)?.slope ??
                    map?.slopes?.[(map?.tiles.indexOf(id) ?? -1) + 1] ??
                    'box',
                );
                return new Set(values).size === 1 ? values[0] : 'mixed';
              })()}
              onChange={(e) => onSlope([...selected], e.target.value as 'box' | 'up' | 'down')}
            >
              <option value="mixed" disabled>
                Mixed
              </option>
              <option value="box">Rectangle</option>
              <option value="up">Ramp ↗</option>
              <option value="down">Ramp ↘</option>
            </select>
          </label>
        </div>
        <div className="tilemap-atlas-scroll">
          {cells.length ? (
            <div
              ref={grid}
              className="tilemap-atlas"
              role="grid"
              aria-label="Tile atlas"
              aria-rowcount={rows}
              aria-colcount={columns}
              style={{ gridTemplateColumns: `repeat(${columns},36px)` }}
              onPointerDown={(e) => {
                if (playing || e.button !== 0) return;
                const cell = cellAt(e);
                if (!cell) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                anchor.current = cell;
                choose(cell);
              }}
              onPointerMove={(e) => {
                if (anchor.current) {
                  const cell = cellAt(e);
                  if (cell) choose(cell);
                }
              }}
              onPointerUp={() => {
                anchor.current = null;
              }}
              onPointerCancel={() => {
                anchor.current = null;
              }}
            >
              {cells.map((id, i) => (
                <button
                  key={i}
                  role="gridcell"
                  data-cell={i}
                  aria-label={`${images.get(id)?.name ?? 'Empty'} · column ${(i % columns) + 1}, row ${Math.floor(i / columns) + 1}`}
                  aria-selected={!!id && selected.has(id)}
                  className={`${id && selected.has(id) ? 'selected' : ''} ${!id ? 'empty' : ''}`}
                  title={`${images.get(id)?.name ?? 'Empty'} · ${(i % columns) + 1}, ${Math.floor(i / columns) + 1}`}
                  onKeyDown={(e) => {
                    const offset = {
                      ArrowRight: 1,
                      ArrowLeft: -1,
                      ArrowDown: columns,
                      ArrowUp: -columns,
                    }[e.key];
                    if (offset !== undefined) {
                      e.preventDefault();
                      const j = Math.min(cells.length - 1, Math.max(0, i + offset));
                      onStamp({ width: 1, height: 1, cells: [cells[j]] });
                      grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${j}"]`)?.focus();
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onStamp({ width: 1, height: 1, cells: [id] });
                      onTool('brush');
                    }
                  }}
                >
                  {sprites[id] && <img alt="" draggable={false} src={sprites[id]} />}
                  {map && id && map.tiles.includes(id) && (
                    <span className="tile-bank-index" title="Map bank value for ui_tile_at">
                      {map.tiles.indexOf(id) + 1}
                    </span>
                  )}
                  {(set?.tiles.find((t) => t.id === id)?.solid ??
                    !!map?.solidTiles.includes(map.tiles.indexOf(id) + 1)) && (
                    <i className="tile-solid-marker" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="tileset-sheet-empty">
              <Upload size={25} />
              <strong>Import a tilesheet</strong>
              <span>Pick tiles from an atlas, then paint them into a layer.</span>
              <button disabled={playing} onClick={onImport}>
                Import tileset…
              </button>
            </div>
          )}
        </div>
        <div className={`tilemap-hint ${!ready && map ? 'needs-palette' : ''}`}>
          {set && map && set.tileSize !== map.tileSize
            ? `${set.tileSize}px tiles need a matching layer. Use New layer.`
            : !ready && map
              ? 'Select tiles and use this tileset on the layer before painting.'
              : 'Drag tiles to make a stamp · LMB paints · E erases · RMB pans · wheel zooms · Alt picks · empty stamp cells are skipped'}
          <span>Solid changes apply to every map using the selected tiles.</span>
        </div>
      </div>
    </div>
  );
}
