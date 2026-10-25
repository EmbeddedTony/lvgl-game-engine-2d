import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export interface EditorMenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}
export interface EditorMenu {
  label: string;
  items: EditorMenuItem[];
}
export function EditorMenuBar({ menus }: { menus: EditorMenu[] }) {
  const [open, setOpen] = useState<number | null>(null),
    root = useRef<HTMLElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  return (
    <nav
      className="editor-menu"
      ref={root}
      aria-label="Editor menus"
      role="menubar"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(null);
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (open !== null) triggers.current[open]?.focus();
          setOpen(null);
        }
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && open !== null) {
          event.preventDefault();
          event.stopPropagation();
          const visible = triggers.current
            .map((button, index) => (button && button.offsetParent !== null ? index : -1))
            .filter((index) => index >= 0);
          const next =
            visible[
              (visible.indexOf(open) + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) %
                visible.length
            ];
          setOpen(next);
          triggers.current[next]?.focus();
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          const index = open ?? triggers.current.findIndex((b) => b === document.activeElement);
          if (index < 0) return;
          setOpen(index);
          requestAnimationFrame(() => {
            const items = [
              ...root.current!.querySelectorAll<HTMLButtonElement>(
                '[role="menu"] button:not(:disabled)',
              ),
            ];
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            items[
              (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            ]?.focus();
          });
        }
      }}
    >
      {menus.map((menu, index) => (
        <div key={menu.label} className="editor-menu-group">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === index}
            className={open === index ? 'active' : ''}
            ref={(element) => {
              triggers.current[index] = element;
            }}
            onClick={() => setOpen(open === index ? null : index)}
            onPointerEnter={() => {
              if (open !== null) setOpen(index);
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <div className="editor-menu-popup" role="menu" aria-label={`${menu.label} menu`}>
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  className={item.separator ? 'menu-divider' : ''}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(null);
                    item.action();
                    triggers.current[index]?.focus();
                  }}
                >
                  <span className="menu-check">{item.checked && <Check size={12} />}</span>
                  <span>{item.label}</span>
                  <kbd>{item.shortcut}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
