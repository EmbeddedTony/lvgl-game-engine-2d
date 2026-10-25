import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../model';
import { analyzeTarget, createWorkloadMeasurer } from './analyze';

/** Image palettes are cached by immutable asset identity; scene scans are debounced
 * so painting/dragging and code typing never repeatedly repack graphics. */
export function useTargetGuidance(project: Project) {
  const [measure] = useState(() => createWorkloadMeasurer());
  const [work, setWork] = useState(() => measure(project));
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(true);
    const timer = setTimeout(() => {
      setWork(measure(project));
      setPending(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [
    project.dimension,
    project.width,
    project.height,
    project.scenes,
    project.sprites,
    project.tilesets,
    project.audio,
  ]);
  const report = useMemo(
    () => analyzeTarget(project, work),
    [project.width, project.height, project.colorDepth, project.target, work],
  );
  return { report, pending };
}
