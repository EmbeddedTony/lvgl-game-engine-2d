import { useState } from 'react';
import { Cpu, ExternalLink, Info, AlertTriangle, RotateCcw } from 'lucide-react';
import type { TargetReport } from '../targets/analyze';
import { formatBytes } from '../targets/analyze';
import { families, catalogDate, guidanceSources } from '../targets/catalog';
import { targetDefaults, type TargetConfig } from '../targets/model';
import { desktop } from '../desktop';
function NumberInput({
  label,
  value,
  onChange,
  max = 16 * 1024 * 1024,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  min?: number;
}) {
  return (
    <label className="target-number">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, Math.round(next))));
        }}
      />
    </label>
  );
}
function Meter({
  label,
  value,
  limit,
  hint,
}: {
  label: string;
  value: number;
  limit: number;
  hint: string;
}) {
  return (
    <div className={`target-meter ${value > limit ? 'over' : value > limit * 0.8 ? 'near' : ''}`}>
      <div>
        <strong>{label}</strong>
        <span>
          {formatBytes(value)} / {formatBytes(limit)}
        </span>
      </div>
      <meter
        min={0}
        max={Math.max(1, limit)}
        value={Math.min(value, Math.max(1, limit))}
        aria-label={label}
      />
      <small>{hint}</small>
    </div>
  );
}
export function TargetGuidance({
  report: r,
  pending,
  onChange,
  onBoard,
  onClearBoard,
}: {
  onBoard?: () => void;
  onClearBoard?: () => void;
  report: TargetReport;
  pending: boolean;
  onChange: (config: TargetConfig | undefined) => void;
}) {
  const [search, setSearch] = useState('');
  const [linkError, setLinkError] = useState('');
  const c = r.config,
    family = r.family;
  const patch = (change: Partial<TargetConfig>) => onChange({ ...c, ...change });
  const vendors = [...new Set(families.map((f) => f.vendor))];
  const sourceLink = (url: string, label: string) => (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (desktop) {
          e.preventDefault();
          void desktop.openReference(url).catch((error) => setLinkError(String(error)));
        }
      }}
    >
      {label} <ExternalLink size={11} />
    </a>
  );
  return (
    <div className="target-guidance" data-testid="target-guidance" aria-busy={pending}>
      <header className="target-heading">
        <Cpu size={27} />
        <div>
          <span className="eyebrow">PLAN BEFORE YOU PORT</span>
          <h1>Target guidance</h1>
          <p>
            Memory, storage and rendering advice for your MCU. Your board port stays in your
            control.
          </p>
        </div>
      </header>
      <div className="target-layout">
        <aside className="target-controls">
          {onBoard && (
            <div className="target-reference">
              <strong>STM32H7S78-DK</strong>
              <p>800 × 480 touch display · NeoChrom · 32 MiB PSRAM · 128 MiB flash</p>
              <button onClick={onBoard}>Configure board & display</button>
              {onClearBoard && <button onClick={onClearBoard}>Use generic export</button>}
              <small>Applies the display size, acceleration settings and memory guidance.</small>
            </div>
          )}
          <label className="block-label">
            Find a family
            <input
              aria-label="Find target family"
              placeholder="STM32, ESP32, RA8, Cortex-M55…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block-label">
            Target family
            <select
              aria-label="Target family"
              value={r.configured ? c.family : ''}
              onChange={(e) =>
                onChange(e.target.value ? targetDefaults(e.target.value) : undefined)
              }
            >
              <option value="">Choose target family…</option>
              {vendors.map((vendor) => (
                <optgroup key={vendor} label={vendor}>
                  {families
                    .filter(
                      (f) =>
                        f.vendor === vendor &&
                        (f.id === c.family ||
                          `${f.vendor} ${f.family} ${f.reference} ${f.core}`
                            .toLowerCase()
                            .includes(search.toLowerCase())),
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.family}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="target-catalog-count">
            {families.filter((f) => f.kind === 'mcu' && f.id !== 'generic').length} vendor MCU
            profiles ·{' '}
            {
              new Set(
                families.filter((f) => f.kind === 'mcu' && f.id !== 'generic').map((f) => f.vendor),
              ).size
            }{' '}
            vendors
            <br />
            Custom MCU · Linux · Host PC
          </p>
          {r.configured && (
            <>
              <div className="target-reference">
                <strong>{family.reference}</strong>
                <span>{family.core}</span>
                <p>{family.notes}</p>
                {sourceLink(family.source, 'Vendor reference')}
                <small>Reviewed {catalogDate}</small>
              </div>
              {family.kind === 'mcu' ? (
                <>
                  <label className="target-check">
                    <input
                      aria-label="Enable MCU guidance"
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) => patch({ enabled: e.target.checked })}
                    />{' '}
                    Show MCU advice
                  </label>
                  <details open>
                    <summary>Memory & storage budgets</summary>
                    <p className="field-hint">
                      Edit for your exact part and installed memory. These values are planning
                      totals before the reserves below.
                    </p>
                    <NumberInput
                      label="Internal RAM (KiB)"
                      value={c.ramKiB}
                      onChange={(ramKiB) => patch({ ramKiB })}
                    />
                    <NumberInput
                      label="Internal code NVM (KiB)"
                      value={c.nvmKiB}
                      onChange={(nvmKiB) => patch({ nvmKiB })}
                    />
                    <NumberInput
                      label="External RAM (KiB)"
                      value={c.externalRamKiB}
                      onChange={(externalRamKiB) => patch({ externalRamKiB })}
                    />
                    <NumberInput
                      label="External flash (KiB)"
                      value={c.externalFlashKiB}
                      onChange={(externalFlashKiB) => patch({ externalFlashKiB })}
                    />
                    <NumberInput
                      label="SD / eMMC capacity (MiB)"
                      max={1024 * 1024}
                      value={c.sdMiB}
                      onChange={(sdMiB) => patch({ sdMiB })}
                    />
                    <label className="block-label">
                      Audio storage
                      <select
                        aria-label="Audio storage budget"
                        value={c.audioStorage}
                        onChange={(e) =>
                          patch({ audioStorage: e.target.value as TargetConfig['audioStorage'] })
                        }
                      >
                        <option value="internal">Main code / asset NVM</option>
                        <option value="external-flash">External flash filesystem</option>
                        <option value="sd">SD / eMMC filesystem</option>
                      </select>
                    </label>
                    <p className="field-hint">
                      SD stores WAVs through your audio backend. Generated C images still need code
                      or memory-mapped flash; they do not move to SD.
                    </p>
                  </details>
                  <details>
                    <summary>Display & RAM assumptions</summary>
                    <label className="block-label">
                      Draw buffers
                      <select
                        aria-label="Draw buffer plan"
                        value={c.buffers}
                        onChange={(e) =>
                          patch({ buffers: e.target.value as TargetConfig['buffers'] })
                        }
                      >
                        <option value="partial">Partial rows</option>
                        <option value="single">One full framebuffer</option>
                        <option value="double">Two full framebuffers</option>
                      </select>
                    </label>
                    {c.buffers === 'partial' && (
                      <>
                        <NumberInput
                          label="Partial draw rows"
                          min={1}
                          max={2048}
                          value={c.partialRows}
                          onChange={(partialRows) => patch({ partialRows })}
                        />
                        <label className="block-label">
                          Partial buffers
                          <select
                            aria-label="Partial buffer count"
                            value={c.bufferCount}
                            onChange={(e) =>
                              patch({ bufferCount: Number(e.target.value) as 1 | 2 })
                            }
                          >
                            <option value={1}>1 buffer</option>
                            <option value={2}>2 buffers</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label className="block-label">
                      Additional board scanout buffers
                      <select
                        aria-label="Additional scanout buffers"
                        value={c.scanoutBuffers}
                        onChange={(e) =>
                          patch({ scanoutBuffers: Number(e.target.value) as 0 | 1 | 2 })
                        }
                      >
                        <option value={0}>0 · panel GRAM / already counted above</option>
                        <option value={1}>1 additional full framebuffer</option>
                        <option value={2}>2 additional full framebuffers</option>
                      </select>
                    </label>
                    <p className="field-hint">
                      RGB/LTDC ports often need RAM scanout buffers even with partial LVGL drawing.
                      Count them here only if they are not the full draw buffers above.
                    </p>
                    <NumberInput
                      label="System / heap reserve (KiB)"
                      value={c.reserveRamKiB}
                      onChange={(reserveRamKiB) => patch({ reserveRamKiB })}
                    />
                    <NumberInput
                      label="Firmware / font reserve (KiB)"
                      value={c.reserveNvmKiB}
                      onChange={(reserveNvmKiB) => patch({ reserveNvmKiB })}
                    />
                    <NumberInput
                      label="Audio buffers (KiB)"
                      value={c.audioBufferKiB}
                      onChange={(audioBufferKiB) => patch({ audioBufferKiB })}
                    />
                    <label className="block-label">
                      Image decode allowance
                      <select
                        aria-label="Image decode plan"
                        value={c.decode}
                        onChange={(e) =>
                          patch({ decode: e.target.value as TargetConfig['decode'] })
                        }
                      >
                        <option value="full-image">One full decoded image</option>
                        <option value="scanline">
                          Verified scanline decoder (exclude full image)
                        </option>
                      </select>
                    </label>
                    <p className="field-hint">
                      Other scanline/cache/scratch allocations must fit the system reserve. External
                      RAM may not be DMA-accessible.
                    </p>
                  </details>
                  <details>
                    <summary>Refresh & custom C effects</summary>
                    <NumberInput
                      label="Target refresh FPS"
                      min={1}
                      max={240}
                      value={c.fps}
                      onChange={(fps) => patch({ fps })}
                    />
                    <NumberInput
                      label="Redraw per frame (%)"
                      min={1}
                      max={100}
                      value={c.redrawPercent}
                      onChange={(redrawPercent) => patch({ redrawPercent })}
                    />
                    <NumberInput
                      label="Effective display payload (Mbit/s)"
                      max={100000}
                      value={c.displayMbps}
                      onChange={(displayMbps) => patch({ displayMbps })}
                    />
                    <p className="field-hint">
                      0 means unknown. Use measured payload throughput, not nominal SPI clock. This
                      is a redraw scenario, not a measured frame rate.
                    </p>
                    <strong className="target-subtitle">Planned effects in custom C</strong>
                    {(
                      [
                        ['transforms', 'Runtime rotation / scaling'],
                        ['blur', 'Blur / convolution filters'],
                        ['vector-dsp', 'Custom vector / pixel DSP'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="target-check">
                        <input
                          aria-label={label}
                          type="checkbox"
                          checked={c.effects.includes(key)}
                          onChange={(e) =>
                            patch({
                              effects: e.target.checked
                                ? [...c.effects, key]
                                : c.effects.filter((v) => v !== key),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <p className="field-hint">
                      Planning flags only; no effect is added to your game, and custom C is not
                      analyzed.
                    </p>
                  </details>
                  <details>
                    <summary>Acceleration enabled by your port</summary>
                    <p className="field-hint">
                      All start off. Selecting a family never configures LVGL or compiler flags.
                      Only confirm integrations that your firmware actually uses.
                    </p>
                    {(['dma2d', 'graphics', 'helium', 'simd'] as const).map((key) => (
                      <label className="target-check" key={key}>
                        <input
                          type="checkbox"
                          aria-label={`Port uses ${key}`}
                          disabled={
                            !family[key] && family.id !== 'generic' && !c.acceleration.includes(key)
                          }
                          checked={c.acceleration.includes(key)}
                          onChange={(e) =>
                            patch({
                              acceleration: e.target.checked
                                ? [...c.acceleration, key]
                                : c.acceleration.filter((v) => v !== key),
                            })
                          }
                        />
                        <span>
                          {key === 'graphics'
                            ? '2D GPU / pixel accelerator'
                            : key === 'helium'
                              ? 'Helium optimized routines'
                              : key === 'simd'
                                ? 'Other SIMD routines'
                                : 'DMA2D draw / transfer integration'}
                          <small>
                            {typeof family[key] === 'string'
                              ? family[key]
                              : family[key]
                                ? 'Advertised by this reference'
                                : family.id === 'generic'
                                  ? 'Custom capability; verify hardware'
                                  : 'Not confirmed by this reference'}
                          </small>
                        </span>
                      </label>
                    ))}
                  </details>
                  <button
                    className="target-reset"
                    onClick={() => onChange(targetDefaults(c.family))}
                  >
                    <RotateCcw size={12} /> Reset profile assumptions
                  </button>
                </>
              ) : (
                <p className="target-quiet">
                  MCU memory, storage and accelerator warnings are suppressed for{' '}
                  {family.kind === 'host' ? 'host PCs' : 'embedded Linux'}. Engine/project
                  validation remains active.
                </p>
              )}
            </>
          )}
        </aside>
        <section className="target-results" aria-label="Target budget results">
          {linkError && (
            <p className="target-alert attention" role="alert">
              Could not open reference: {linkError}
            </p>
          )}
          <div className="target-notice">
            <Info size={16} />
            <p>
              Reference parts and planning allowances, not guaranteed family limits or a porting
              checklist. Memory banks, SDK reserves and driver support vary. Your linker map and
              board measurements are authoritative.
            </p>
          </div>
          {r.configured && family.kind === 'mcu' && (
            <div className="target-meters">
              <Meter
                label="Planned working RAM"
                value={r.ramBytes}
                limit={r.ramBudget}
                hint="Draw/decode allowances + engine/widgets + audio + system reserve"
              />
              <Meter
                label="Planned code / graphics NVM"
                value={r.nvmBytes}
                limit={r.nvmBudget}
                hint="Conservative assets + tables + firmware/font reserve + main-NVM audio"
              />
            </div>
          )}
          <div className="target-metrics">
            <div>
              <span>One game framebuffer</span>
              <strong>{formatBytes(r.frameBytes)}</strong>
            </div>
            <div>
              <span>Image payload upper estimate</span>
              <strong>{formatBytes(r.work.imageBytes)}</strong>
            </div>
            <div>
              <span>Compressed map cells</span>
              <strong>{formatBytes(r.work.mapBytes)}</strong>
            </div>
            <div>
              <span>PCM WAV files</span>
              <strong>{formatBytes(r.work.audioBytes)}</strong>
            </div>
          </div>
          {undefined}
          <section
            className="target-alerts"
            aria-label="Target recommendations"
            data-testid="target-recommendations"
          >
            <h2>{pending ? 'Updating scene estimates…' : 'Recommendations'}</h2>
            {!pending &&
              (r.alerts.length ? (
                r.alerts.map((a) => (
                  <article className={`target-alert ${a.level}`} key={a.id} data-guidance={a.id}>
                    {a.level === 'info' ? <Info size={16} /> : <AlertTriangle size={16} />}
                    <div>
                      <h3>{a.title}</h3>
                      <p>{a.detail}</p>
                      <p className="target-action">{a.suggestion}</p>
                      {a.source && sourceLink(a.source, 'Technical reference')}
                    </div>
                  </article>
                ))
              ) : (
                <p className="target-empty">
                  {!r.configured
                    ? 'Choose a target family to get MCU advice.'
                    : family.kind !== 'mcu'
                      ? 'Routine MCU advice is suppressed for this target.'
                      : !c.enabled
                        ? 'Warnings are paused for this project.'
                        : 'No advisory thresholds crossed under these assumptions. This does not prove the compiled game will fit or meet FPS.'}
                </p>
              ))}
            {r.work.sceneErrors.map((message) => (
              <article className="target-alert attention" key={message}>
                <AlertTriangle size={16} />
                <div>
                  <h3>Project structure needs attention</h3>
                  <p>{message}</p>
                </div>
              </article>
            ))}
          </section>
          <details className="target-method">
            <summary>How the estimates work</summary>
            <dl>
              <dt>Draw buffers</dt>
              <dd>
                {formatBytes(r.drawBytes)} ·{' '}
                {c.buffers === 'partial'
                  ? `${Math.min(c.partialRows, r.height)} rows × ${c.bufferCount} buffer(s)`
                  : c.buffers === 'double'
                    ? 'Two complete game framebuffers'
                    : 'One complete game framebuffer'}
              </dd>
              <dt>Additional scanout buffers</dt>
              <dd>
                {formatBytes(r.scanoutBytes)} · {c.scanoutBuffers} extra framebuffer(s)
              </dd>
              {undefined}
              <dt>Engine / widgets allowance</dt>
              <dd>
                {formatBytes(r.runtimeBytes)} · 12 KiB fixed engine allowance + 256 B per peak
                visible widget
              </dd>
              {r.work.inputRamBytes > 0 && (
                <>
                  <dt>Physical input channels / workspace</dt>
                  <dd>
                    {formatBytes(r.work.inputRamBytes)} · included above; radio stack and board
                    driver buffers use the system reserve
                  </dd>
                </>
              )}
              <dt>One decoded image allowance</dt>
              <dd>
                {formatBytes(r.decodeBytes)} ·{' '}
                {c.decode === 'full-image'
                  ? 'Largest used exported image variant at 4 B/pixel'
                  : 'Full decode excluded by your assumption; scratch/cache must fit system reserve'}
              </dd>
              <dt>Audio / system reserve</dt>
              <dd>
                {formatBytes(r.audioRam)} / {formatBytes(c.reserveRamKiB * 1024)}
              </dd>
              <dt>Immutable definition allowance</dt>
              <dd>
                {formatBytes(r.work.tableBytes)} · definitions, descriptors, tile pointers/flags;
                ABI/layout may differ
              </dd>
              <dt>Display transfer scenario</dt>
              <dd>
                {r.transferMbps.toFixed(1)} Mbit/s at {c.fps} FPS · {c.redrawPercent}% redraw,
                before protocol overhead
              </dd>
              <dt>Covered pixels scenario</dt>
              <dd>
                {r.repaintMPixels.toFixed(1)} MPixel/s · viewport-clipped rectangle coverage,
                including overdraw; not GPU/CPU timing
              </dd>
            </dl>
            <p>
              Scenes are evaluated separately for peak runtime use; all exported scenes/assets
              contribute to storage. Payload estimates include only referenced variants and painted
              tiles, plus every exported WAV. Exact export may merge more identical images or use a
              smaller palette after resampling. C code, font sizes, SDK/RTOS/wireless stacks, bus
              contention, decoder caches, backend audio buffers and compiled binary sizes are not
              measured.
            </p>
            <p>
              DMA2D helps supported fills/copies/blends, not every transform/filter. Helium is a CPU
              SIMD extension, not a GPU. NPUs and ordinary DMA are not credited as graphics
              acceleration.
            </p>
            <div className="target-source-links">
              {sourceLink(guidanceSources.dma2d, 'LVGL DMA2D')}
              {sourceLink(guidanceSources.helium, 'Arm-2D / Helium')}
              {sourceLink(guidanceSources.draw, 'LVGL draw units')}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
