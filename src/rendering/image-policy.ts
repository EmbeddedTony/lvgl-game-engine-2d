import type { Project } from '../model';
import type { ImagePacking } from '../compression';

/** Standard ARGB8888 works in both NemaGFX and LVGL's software fallback. Nema's
 * I8 layout differs from ordinary indexed images; do not tag generic I8 as GPU-ready.
 * Keep compact indexed storage for ports using the software image decoder. */
export function imagePackingPolicy(project: Pick<Project, 'rendering'>): ImagePacking {
  return project.rendering?.compositor === 'neochrom' ? 'direct' : 'compact';
}
