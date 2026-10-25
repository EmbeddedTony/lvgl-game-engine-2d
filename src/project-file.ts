import type { Project } from './model';

/** Embedded pixel arrays must not acquire indentation per channel: a valid 20MiB
 * document can otherwise expand beyond 100MiB when saved. Share this representation
 * across desktop, downloads and headless writes; JSON inspection remains a CLI option. */
export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}
