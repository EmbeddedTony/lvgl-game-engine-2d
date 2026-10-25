import { Cpu, ChevronRight } from 'lucide-react';
import type { TargetReport } from '../targets/analyze';

export function TargetSummary({
  report,
  pending,
  onOpen,
}: {
  report: TargetReport;
  pending: boolean;
  onOpen: () => void;
}) {
  const count = report.alerts.filter((a) => a.level !== 'info').length;
  return (
    <button
      className={`target-summary ${count ? 'has-advice' : ''}`}
      onClick={onOpen}
      aria-label="Open target guidance"
    >
      <Cpu size={17} />
      <span>
        <strong>{report.configured ? report.family.family : 'Choose a target family'}</strong>
        <small>
          {pending
            ? 'Updating estimates…'
            : !report.configured
              ? 'Optional MCU resource and capability guidance'
              : report.family.kind !== 'mcu'
                ? 'MCU warnings suppressed for this OS target'
                : !report.config.enabled
                  ? 'Warnings paused'
                  : count
                    ? `${count} resource / capability suggestions`
                    : 'No advisory thresholds crossed'}
        </small>
      </span>
      <ChevronRight size={14} />
    </button>
  );
}
