import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { FolderOpen, Grid2X2 } from 'lucide-react';
import type { TilesetAsset } from '../model';
import { uid } from '../model';
import {
  sliceSheet,
  buildTileset,
  tilesetPackedBytes,
  type Sheet,
  type SliceSettings,
} from '../tilesets';
import {
  buildTerrainTileset,
  terrainBlocks,
  suggestSheet,
  resizeTileset,
  type SheetLayout,
} from '../tiles/rpg-import';
export type TilesetImportAction = 'resource' | 'new-layer' | 'selected-layer';
const layouts: { id: SheetLayout; name: string }[] = [
  { id: 'grid', name: 'Grid · ordinary tiles / A5 / B–E' },
  { id: 'ace-a1', name: 'RPG Maker A1 · animated water' },
  { id: 'ace-a2', name: 'RPG Maker A2 · floor terrains' },
  { id: 'ace-a3', name: 'RPG Maker A3 · building walls' },
  { id: 'ace-a4', name: 'RPG Maker A4 · roofs & walls' },
];
export function TilesetImporter({
  selectedSize,
  onImport,
  onImportBatch,
}: {
  selectedSize?: number;
  onImport: (set: TilesetAsset, action: TilesetImportAction) => void;
  onImportBatch?: (sets: TilesetAsset[], action: TilesetImportAction) => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null),
    [name, setName] = useState('Tileset'),
    [layout, setLayout] = useState<SheetLayout>('grid');
  const [settings, setSettings] = useState<SliceSettings>({
    tileSize: 16,
    marginX: 0,
    marginY: 0,
    spacingX: 0,
    spacingY: 0,
  });
  const [output, setOutput] = useState<number | null>(null),
    [selected, setSelected] = useState(new Set<number>()),
    [merge, setMerge] = useState(true);
  const [zoom, setZoom] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [action, setAction] = useState<TilesetImportAction>('new-layer');
  const [queue, setQueue] = useState<File[]>([]),
    [batch, setBatch] = useState<TilesetAsset[]>([]);
  const input = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    generation = useRef(0);
  const gesture = useRef<{ cell: number; base: Set<number>; toggle: boolean } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const sliced = useMemo(() => {
    if (!sheet) return { grid: null, blocks: [], error: '' };
    try {
      return layout === 'grid'
        ? { grid: sliceSheet(sheet, settings), blocks: [], error: '' }
        : {
            grid: null,
            blocks: terrainBlocks(layout, settings.tileSize, sheet.width, sheet.height),
            error: '',
          };
    } catch (e) {
      return { grid: null, blocks: [], error: (e as Error).message };
    }
  }, [sheet, settings, layout]);
  const { grid, blocks } = sliced;
  useEffect(
    () =>
      setSelected(
        layout === 'grid'
          ? new Set(grid?.tiles.flatMap((p, i) => (p.length ? [i] : [])) ?? [])
          : new Set(blocks.length ? [0] : []),
      ),
    [grid, blocks, layout],
  );
  const make = (id: string) => {
    if (!sheet) throw new Error('Choose a sheet.');
    const set =
      layout === 'grid'
        ? buildTileset(name, settings.tileSize, grid!, selected, merge, id)
        : buildTerrainTileset(name, sheet, layout, settings.tileSize, selected, id);
    return resizeTileset(set, output ?? settings.tileSize);
  };
  const prepared = useMemo(() => {
    if (!sheet || (!grid && !blocks.length)) return { set: null, error: '' };
    try {
      return { set: make('preview'), error: '' };
    } catch (e) {
      return { set: null, error: (e as Error).message };
    }
  }, [sheet, grid, blocks, name, settings.tileSize, selected, merge, output, layout]);
  const packed = useMemo(
    () => (prepared.set ? tilesetPackedBytes(prepared.set) : 0),
    [prepared.set],
  );
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !sheet) return;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(sheet.pixels), sheet.width, sheet.height),
      0,
      0,
    );
    const outline = (i: number, x: number, y: number, w: number, h: number) => {
      if (selected.has(i)) {
        ctx.fillStyle = '#6baeff38';
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = selected.has(i) ? '#75baff' : '#ffffff60';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(x + 0.5 / zoom, y + 0.5 / zoom, w - 1 / zoom, h - 1 / zoom);
    };
    if (layout === 'grid' && grid)
      for (let i = 0; i < grid.tiles.length; i++)
        outline(
          i,
          settings.marginX + (i % grid.columns) * (settings.tileSize + settings.spacingX),
          settings.marginY + Math.floor(i / grid.columns) * (settings.tileSize + settings.spacingY),
          settings.tileSize,
          settings.tileSize,
        );
    else
      blocks.forEach((b, i) =>
        b.frames.forEach((f) =>
          outline(
            i,
            f.x,
            f.y,
            settings.tileSize * 2,
            settings.tileSize * (b.kind === 'floor' ? 3 : b.kind === 'wall' ? 2 : 1),
          ),
        ),
      );
  }, [sheet, grid, blocks, layout, settings, selected, zoom]);
  const read = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setLoading(true);
    setError('');
    setSheet(null);
    setOutput(null); // Every new sheet starts at native resolution, including queued files.
    let bitmap: ImageBitmap | undefined;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Sheet file limit: 8 MB.');
      bitmap = await createImageBitmap(file);
      if (bitmap.width > 2048 || bitmap.height > 2048)
        throw new Error('Sheet limit: 2048 × 2048 pixels.');
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0);
      if (token !== generation.current) return;
      const suggestion = suggestSheet(file.name, c.width, c.height);
      setSettings({
        tileSize: suggestion.tileSize,
        marginX: 0,
        marginY: 0,
        spacingX: 0,
        spacingY: 0,
      });
      setLayout(suggestion.layout);
      setSheet({
        width: c.width,
        height: c.height,
        pixels: ctx.getImageData(0, 0, c.width, c.height).data,
      });
      setName(file.name.replace(/\.[^.]+$/, '').slice(0, 128));
      setZoom(Math.min(4, Math.max(0.25, Math.floor((512 / Math.max(c.width, c.height)) * 4) / 4)));
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      bitmap?.close();
      if (token === generation.current) setLoading(false);
    }
  };
  const loadFiles = (files: File[]) => {
    const next = files
      .filter((f) => /\.(png|webp|jpe?g)$/i.test(f.name))
      .slice(0, onImportBatch ? 32 : 1);
    setQueue(next.slice(1));
    setBatch([]);
    setOutput(null);
    void read(next[0]);
  };
  const cellAt = (e: PointerEvent) => {
    if (!canvas.current) return -1;
    const rect = canvas.current.getBoundingClientRect(),
      x = (e.clientX - rect.left) / zoom,
      y = (e.clientY - rect.top) / zoom;
    if (layout !== 'grid')
      return blocks.findIndex((b) =>
        b.frames.some(
          (f) =>
            x >= f.x &&
            x < f.x + settings.tileSize * 2 &&
            y >= f.y &&
            y < f.y + settings.tileSize * (b.kind === 'floor' ? 3 : b.kind === 'wall' ? 2 : 1),
        ),
      );
    if (!grid) return -1;
    const c = Math.floor((x - settings.marginX) / (settings.tileSize + settings.spacingX)),
      r = Math.floor((y - settings.marginY) / (settings.tileSize + settings.spacingY));
    return c < 0 || r < 0 || c >= grid.columns || r >= grid.rows ? -1 : r * grid.columns + c;
  };
  const select = (cell: number) => {
    const g = gesture.current;
    if (!g || cell < 0) return;
    const result = new Set(g.base),
      columns = grid?.columns ?? 8;
    const c0 = Math.min(g.cell % columns, cell % columns),
      c1 = Math.max(g.cell % columns, cell % columns),
      r0 = Math.min(Math.floor(g.cell / columns), Math.floor(cell / columns)),
      r1 = Math.max(Math.floor(g.cell / columns), Math.floor(cell / columns));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * columns + c;
        if (g.toggle && g.base.has(i)) result.delete(i);
        else result.add(i);
      }
    setSelected(result);
  };
  const field = (label: string, key: keyof SliceSettings, min = 0, max = 2048) => (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={settings[key]}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v))
            setSettings((s) => ({ ...s, [key]: Math.max(min, Math.min(max, Math.round(v))) }));
        }}
      />
    </label>
  );
  const finish = () => {
    try {
      const set = make(uid('tileset'));
      if (queue.length) {
        setBatch((v) => [...v, set]);
        const next = queue[0];
        setQueue(queue.slice(1));
        void read(next);
        return;
      }
      const sets = [...batch, set],
        resolved =
          action === 'selected-layer' && sets.some((s) => s.tileSize !== selectedSize)
            ? 'new-layer'
            : action;
      if (onImportBatch) onImportBatch(sets, resolved);
      else onImport(set, resolved);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div
      className="tileset-importer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        loadFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header>
        <Grid2X2 size={23} />
        <div>
          <h1>Import tileset</h1>
          <p>
            Choose sheets, confirm the suggested layout, then paint.{' '}
            {batch.length + queue.length > 0
              ? `${batch.length} ready · ${queue.length} more sheets`
              : ''}
          </p>
        </div>
      </header>
      <input
        ref={input}
        data-testid="tileset-file"
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple={!!onImportBatch}
        hidden
        onChange={(e) => {
          loadFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <div className="tileset-import-body">
        <div className="tileset-import-settings">
          <button className="source-open" disabled={loading} onClick={() => input.current?.click()}>
            <FolderOpen size={14} />
            {loading ? 'Reading image…' : sheet ? 'Replace sheet…' : 'Choose image…'}
          </button>
          <label className="block-label">
            Tileset name
            <input
              aria-label="Tileset name"
              maxLength={128}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block-label">
            Sheet layout
            <select
              aria-label="Tileset layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value as SheetLayout)}
            >
              {layouts.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {field('Tile size', 'tileSize', 8, 64)}
          <label className="block-label">
            Output tile size
            <select
              aria-label="Output tile size"
              value={output ?? 0}
              onChange={(e) => setOutput(Number(e.target.value) || null)}
            >
              <option value={0}>Original · {settings.tileSize}px</option>
              {[8, 16, 24, 32, 48, 64]
                .filter((v) => v !== settings.tileSize)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}px · nearest pixels{v < settings.tileSize ? ' · smaller MCU assets' : ''}
                  </option>
                ))}
            </select>
          </label>
          <p className="field-hint" role="status">
            {output && output < settings.tileSize
              ? `${settings.tileSize}px → ${output}px keeps ${Math.round(100 * (output / settings.tileSize) ** 2)}% of source pixels. Fine detail is discarded even with nearest sampling.`
              : 'Original size preserves source pixels. Nearest sampling keeps pixel art sharp; reducing the output size discards detail.'}
          </p>
          {layout === 'grid' ? (
            <>
              <details>
                <summary>Margins & spacing</summary>
                <div className="field-pair">
                  {field('Margin X', 'marginX')}
                  {field('Margin Y', 'marginY')}
                </div>
                <div className="field-pair">
                  {field('Spacing X', 'spacingX')}
                  {field('Spacing Y', 'spacingY')}
                </div>
              </details>
              <label className="form-row">
                Merge identical tiles
                <input
                  aria-label="Merge identical tiles"
                  type="checkbox"
                  checked={merge}
                  onChange={(e) => setMerge(e.target.checked)}
                />
              </label>
            </>
          ) : (
            <p className="field-hint">
              Select a terrain block. Corners and connected edges are assembled for you; A1 water
              also gets its animation frames. Start with one or two terrains per resource.
            </p>
          )}
          <div className="tileset-import-budget" aria-live="polite">
            <strong>{prepared.set?.tiles.length ?? 0} / 255 unique tiles</strong>
            <span>
              {grid
                ? `${grid.columns} × ${grid.rows} atlas cells`
                : `${blocks.length} terrain blocks · connected brush`}
            </span>
            <span>
              {packed
                ? `${packed.toLocaleString()} B packed image data`
                : 'Transparent cells are omitted'}
            </span>
            {output && output < settings.tileSize && (
              <span>
                Pixel payload ≈{' '}
                {Math.round(((output * output) / (settings.tileSize * settings.tileSize)) * 100)}%
                of native resolution before packing
              </span>
            )}
          </div>
          <label className="block-label">
            After import
            <select
              aria-label="After tileset import"
              value={action}
              onChange={(e) => setAction(e.target.value as TilesetImportAction)}
            >
              <option value="new-layer">Create tilemap layer & paint</option>
              {selectedSize === (output ?? settings.tileSize) && (
                <option value="selected-layer">Use on selected tilemap</option>
              )}
              <option value="resource">Keep as tileset resource</option>
            </select>
          </label>
          <p className="field-hint">
            Only painted tiles and their animation frames enter firmware. Terrain connections are
            baked into byte-indexed maps.
          </p>
        </div>
        <div className="tileset-import-preview">
          <div className="tileset-preview-tools">
            <button
              disabled={!sheet}
              onClick={() =>
                setSelected(new Set(grid ? grid.tiles.map((_, i) => i) : blocks.map((_, i) => i)))
              }
            >
              Select all
            </button>
            <button disabled={!sheet} onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
            <select
              aria-label="Sheet zoom"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {![0.25, 0.5, 1, 2, 4, 8].includes(zoom) && <option value={zoom}>{zoom}×</option>}
              {[0.25, 0.5, 1, 2, 4, 8].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </div>
          <div className="tileset-sheet-scroll">
            {sheet ? (
              <canvas
                ref={canvas}
                width={sheet.width}
                height={sheet.height}
                style={{ width: sheet.width * zoom, height: sheet.height * zoom }}
                data-testid="tileset-sheet"
                aria-label="Tilesheet selection"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const cell = cellAt(e);
                  if (cell < 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  gesture.current = {
                    cell,
                    base: e.shiftKey || e.metaKey || e.ctrlKey ? new Set(selected) : new Set(),
                    toggle: e.metaKey || e.ctrlKey,
                  };
                  select(cell);
                }}
                onPointerMove={(e) => {
                  if (gesture.current) select(cellAt(e));
                }}
                onPointerUp={() => {
                  gesture.current = null;
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                }}
              />
            ) : (
              <div className="tileset-sheet-empty">
                <Grid2X2 size={38} />
                <strong>Drop tilesheets here</strong>
                <span>PNG, WebP or JPEG · up to 2048 × 2048 · multiple sheets supported</span>
              </div>
            )}
          </div>
          <p className="field-hint">
            Drag to choose a region. Shift adds; ⌘ / Ctrl toggles. RPG layout presets support ACE
            32px and MV 48px geometry. The layout is editable.
          </p>
        </div>
      </div>
      {(error || sliced.error || prepared.error) && (
        <p className="tileset-error" role="alert">
          {error || sliced.error || prepared.error}
        </p>
      )}
      <div className="modal-actions">
        {queue.length > 0 && (
          <button
            onClick={() => {
              const next = queue[0];
              setQueue(queue.slice(1));
              void read(next);
            }}
          >
            Skip this sheet
          </button>
        )}
        <button
          className="primary"
          disabled={loading || !prepared.set || !name.trim()}
          onClick={finish}
        >
          {queue.length
            ? 'Add selection & next sheet'
            : batch.length
              ? `Import ${batch.length + 1} tilesets`
              : `Import ${prepared.set?.tiles.length ?? 0} tiles`}
        </button>
      </div>
    </div>
  );
}
