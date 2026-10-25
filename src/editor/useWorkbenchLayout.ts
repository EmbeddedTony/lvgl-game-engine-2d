import { useEffect, useState } from 'react';

const STORAGE = 'lvgl-game-engine.workbench.v1';
export const defaultLayout = {
  hierarchy: 220,
  inspector: 286,
  project: 196,
  collapsed: false,
  focused: false,
};
export type WorkbenchLayout = typeof defaultLayout;
export function useWorkbenchLayout() {
  const [layout, setLayout] = useState<WorkbenchLayout>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
      const size = (key: 'hierarchy' | 'inspector' | 'project', min: number, max: number) =>
        typeof value[key] === 'number' && Number.isFinite(value[key])
          ? Math.max(min, Math.min(max, value[key]))
          : defaultLayout[key];
      return {
        hierarchy: size('hierarchy', 170, 360),
        inspector: size('inspector', 240, 420),
        project: size('project', 120, 400),
        collapsed: value.collapsed === true,
        focused: false,
      };
    } catch {
      return defaultLayout;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ ...layout, focused: false }));
    } catch {
      /* Layout preferences must never block editing. */
    }
  }, [layout]);
  return { layout, setLayout, resetLayout: () => setLayout({ ...defaultLayout }) };
}
