export function CanvasRulers({
  width,
  height,
  zoom,
}: {
  width: number;
  height: number;
  zoom: number;
}) {
  const interval = zoom < 0.8 ? 64 : 32;
  return (
    <div className="canvas-rulers" aria-hidden="true">
      <div className="ruler-x">
        {Array.from({ length: Math.floor(width / interval) + 1 }, (_, i) => (
          <span key={i} style={{ left: i * interval * zoom }}>
            {i * interval}
          </span>
        ))}
      </div>
      <div className="ruler-y">
        {Array.from({ length: Math.floor(height / interval) + 1 }, (_, i) => (
          <span key={i} style={{ top: i * interval * zoom }}>
            {i * interval}
          </span>
        ))}
      </div>
    </div>
  );
}
