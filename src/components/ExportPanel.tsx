import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Download,
  Folder,
  FolderOpen,
  Monitor,
  PackageCheck,
  Volume2,
} from 'lucide-react';
import type { Project, Issue } from '../model';
import type { ExportStats } from '../exporter';
import type { TargetReport } from '../targets/analyze';
import { TargetSummary } from './TargetSummary';
export function ExportPanel({
  project,
  issues,
  destination,
  native,
  busy,
  stats,
  result,
  conflicts,
  onChoose,
  onExport,
  onReveal,
  target,
  targetPending,
  onTarget,
}: {
  project: Project;
  issues: Issue[];
  destination: string | null;
  native: boolean;
  busy: boolean;
  stats: ExportStats | null;
  result: string | null;
  conflicts: string[];
  onChoose: () => void;
  onExport: (kind: 'folder' | 'zip', replace?: boolean) => void;
  onReveal: () => void;
  target: TargetReport;
  targetPending: boolean;
  onTarget: () => void;
}) {
  return (
    <>
      <div className="export-scroll">
        <div className="modal-icon">
          <Download size={23} />
        </div>
        <div className="eyebrow">READY FOR YOUR FIRMWARE</div>
        <h1>Export to LVGL</h1>
        <p>
          A clean <code>ui/</code> folder. One header to get started.
        </p>
        <div className="export-summary">
          <span>
            <Monitor size={15} />
            {project.width} × {project.height}
            <small>{project.colorDepth}-bit output</small>
          </span>
          <span>
            <Code2 size={15} />
            C99 + LVGL 9
            <small>
              {project.scenes.length} scene{project.scenes.length === 1 ? '' : 's'} · stable IDs
            </small>
          </span>
          <span>
            <Volume2 size={15} />
            {project.audio.length} sound{project.audio.length === 1 ? '' : 's'}
            <small>Board audio adapter</small>
          </span>
        </div>
        <TargetSummary report={target} pending={targetPending} onOpen={onTarget} />
        {native && (
          <label className="block-label export-destination">
            Destination
            <button onClick={onChoose} disabled={busy}>
              <FolderOpen size={16} />
              <span title={destination ?? undefined}>
                {destination ?? 'Choose your firmware project folder…'}
              </span>
              <ChevronRight size={14} />
            </button>
            <small>The app creates a ui folder inside your selected folder.</small>
          </label>
        )}
        <div className="export-filetree">
          <div>
            <Folder size={15} />
            <strong>ui/</strong>
            <small>Drop into your firmware</small>
          </div>
          <p>
            <code>ui.h · ui.c · ui_ids.h</code>
            <span>Public API and stable constants</span>
          </p>
          <p>
            <code>generated/</code>
            <span>Scene data and packed images</span>
          </p>
          <p>
            <code>engine/</code>
            <span>Game runtime and LVGL renderer</span>
          </p>
          <p>
            <code>user/game_hooks.c</code>
            <span>Your editable C logic</span>
          </p>
          <p>
            <code>assets/audio/</code>
            <span>WAV files + audio manifest</span>
          </p>
        </div>
        <div className="export-code">
          <span>START WITH TWO LINES</span>
          <pre>{'#include "ui/ui.h"\nui_init();'}</pre>
        </div>
        <div className="diagnostics">
          {issues.length ? (
            issues.slice(0, 4).map((issue, i) => (
              <div key={i} className={issue.severity}>
                <Activity size={13} />
                {issue.message}
              </div>
            ))
          ) : (
            <div className="success">
              <CheckCircle2 size={14} /> Project is ready to export
            </div>
          )}
          <small>
            Compile C in your firmware. Your board owns display, input and audio drivers.
          </small>
        </div>
        {conflicts.length > 0 && (
          <div className="export-conflicts">
            <strong>These files changed in both the editor and your firmware folder.</strong>
            <p>{conflicts.join(', ')}</p>
            <span>
              Choose another folder to keep both versions, or explicitly replace the files below.
            </span>
          </div>
        )}
        {result && (
          <div className="export-success">
            <PackageCheck size={18} />
            <div>
              <strong>Export complete</strong>
              <span>{result}</span>
              {stats && (
                <small>
                  Images {(stats.spritePacked / 1024).toFixed(1)} KB packed · tilemaps{' '}
                  {stats.mapPacked} B
                </small>
              )}
            </div>
            <button onClick={onReveal}>
              <FolderOpen size={14} />
              Show
            </button>
          </div>
        )}
      </div>
      <div className="export-actions">
        {native && (
          <button className="secondary" disabled={busy} onClick={() => onExport('zip')}>
            <Download size={13} />
            Save ZIP
          </button>
        )}
        <button
          className="primary"
          disabled={busy || issues.some((i) => i.severity === 'error')}
          onClick={() => onExport(native ? 'folder' : 'zip', conflicts.length > 0)}
        >
          {busy
            ? 'Exporting…'
            : conflicts.length
              ? 'Replace conflicting files'
              : native
                ? 'Export ui folder'
                : 'Download LVGL package'}
          {busy ? null : <Check size={14} />}
        </button>
      </div>
      <p className="field-hint">
        Palette-packed images · adaptive RLE tilemaps · no widget per tile
      </p>
    </>
  );
}
