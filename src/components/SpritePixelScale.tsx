import type { GameNode, SpriteAsset } from '../model';
import { spritePixelScale } from '../pixel-perfect';

export function SpritePixelScale({
  node,
  asset,
  pixelPerfect,
  onChange,
}: {
  node: GameNode;
  asset?: SpriteAsset;
  pixelPerfect: boolean;
  onChange: (size: Pick<GameNode, 'width' | 'height'>) => void;
}) {
  if (!asset) return null;
  const current = spritePixelScale(asset, node);
  const scales = [...new Set([1, 2, 3, 4, 6, 8, ...(current ? [current] : [])])]
    .filter((s) => s * Math.max(asset.width, asset.height) <= 2048)
    .sort((a, b) => a - b);
  return (
    <div className="sprite-pixel-scale">
      <label className="block-label">
        Sprite pixel scale
        <select
          aria-label="Sprite pixel scale"
          value={current ?? 'custom'}
          onChange={(e) => {
            const scale = Number(e.target.value);
            if (Number.isInteger(scale) && scale >= 1)
              onChange({ width: asset.width * scale, height: asset.height * scale });
          }}
        >
          {current === null && (
            <option value="custom">
              Custom · {node.width} × {node.height}
            </option>
          )}
          {scales.map((scale) => (
            <option key={scale} value={scale}>
              {scale}×{scale === 1 ? ' · Native size' : ''} · {asset.width * scale} ×{' '}
              {asset.height * scale}
            </option>
          ))}
        </select>
      </label>
      <p
        className={`field-hint ${pixelPerfect && current === null ? 'pixel-warning' : ''}`}
        role="status"
      >
        {pixelPerfect && current === null
          ? 'Uneven source pixels. Choose a whole scale to preserve the artwork.'
          : `Source ${asset.width} × ${asset.height} · nearest-neighbor sampling`}
      </p>
    </div>
  );
}
