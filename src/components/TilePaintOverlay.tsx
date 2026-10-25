import type { Cell, TileStamp, TileTool } from '../editor/tile-tools';
export function TilePaintOverlay({
  x,
  y,
  size,
  hover,
  rectangle,
  stamp,
  tool,
  sprites,
}: {
  x: number;
  y: number;
  size: number;
  hover: Cell | null;
  rectangle: { from: Cell; to: Cell } | null;
  stamp: TileStamp;
  tool: TileTool;
  sprites: Record<string, string>;
}) {
  if (!hover) return null;
  const left = rectangle ? Math.min(rectangle.from.column, rectangle.to.column) : hover.column;
  const top = rectangle ? Math.min(rectangle.from.row, rectangle.to.row) : hover.row;
  const width = rectangle
    ? Math.abs(rectangle.from.column - rectangle.to.column) + 1
    : tool === 'brush' || tool === 'erase'
      ? stamp.width
      : 1;
  const height = rectangle
    ? Math.abs(rectangle.from.row - rectangle.to.row) + 1
    : tool === 'brush' || tool === 'erase'
      ? stamp.height
      : 1;
  return (
    <div
      className={`tile-paint-ghost ${tool}`}
      data-testid="tile-paint-ghost"
      style={{
        left: x + left * size,
        top: y + top * size,
        width: width * size,
        height: height * size,
      }}
    >
      {!rectangle &&
        tool === 'brush' &&
        stamp.cells.map((id, i) =>
          sprites[id] ? (
            <img
              key={i}
              src={sprites[id]}
              alt=""
              draggable={false}
              style={{
                left: (i % stamp.width) * size,
                top: Math.floor(i / stamp.width) * size,
                width: size,
                height: size,
              }}
            />
          ) : null,
        )}
      <span>{rectangle ? `${width} × ${height}` : tool}</span>
    </div>
  );
}
