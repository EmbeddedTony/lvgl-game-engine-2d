import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, Link2 } from 'lucide-react';
import type { GameNode } from '../model';
import type { ResolvedNode, TreeDrop } from '../scenes';

export function SceneTree({
  nodes,
  selected,
  filter,
  playing,
  icon,
  onSelect,
  onVisible,
  onOpenSource,
  onMove,
}: {
  nodes: ResolvedNode[];
  selected: string;
  filter: string;
  playing: boolean;
  icon: (node: GameNode) => ReactNode;
  onSelect: (id: string) => void;
  onVisible: (node: ResolvedNode) => void;
  onOpenSource: (id: string) => void;
  onMove: (id: string, target: string | undefined, placement: TreeDrop) => void;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const known = useRef(new Set<string>());
  useEffect(() => {
    const pools = nodes.filter(
      (n) =>
        nodes.some((child) => child.parent === n.id && child.spawnable) && !known.current.has(n.id),
    );
    for (const n of nodes) known.current.add(n.id);
    if (pools.length) setCollapsed((old) => new Set([...old, ...pools.map((n) => n.id)]));
  }, [nodes]);
  const [dragged, setDragged] = useState('');
  const [drop, setDrop] = useState<{ id: string; placement: TreeDrop }>();
  const canDrop = (target?: ResolvedNode) => {
    if (!dragged || playing || target?.instanceRoot) return false;
    let at = target;
    while (at) {
      if (at.id === dragged) return false;
      at = nodes.find((n) => n.id === at!.parent);
    }
    return true;
  };
  const finish = (target: ResolvedNode | undefined, placement: TreeDrop) => {
    if (canDrop(target)) {
      onMove(dragged, target?.id, placement);
      if (placement === 'inside' && target)
        setCollapsed((old) => {
          const next = new Set(old);
          next.delete(target.id);
          return next;
        });
    }
    setDragged('');
    setDrop(undefined);
  };
  const visible = new Set<string>(),
    query = filter.toLowerCase();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes)
    if (!query || n.name.toLowerCase().includes(query)) {
      let current: ResolvedNode | undefined = n;
      while (current) {
        visible.add(current.id);
        current = current.parent ? byId.get(current.parent) : undefined;
      }
    }
  const isCollapsed = (n: ResolvedNode): boolean =>
    !!n.parent && (collapsed.has(n.parent) || isCollapsed(byId.get(n.parent)!));
  return (
    <div className="scene-tree" role="tree" aria-label="Scene tree">
      <div
        role="treeitem"
        aria-label="Scene root drop target"
        className={`tree-root-drop ${dragged ? 'drag-active' : ''} ${drop?.placement === 'root' ? 'drop-inside' : ''}`}
        onDragOver={(e) => {
          if (canDrop()) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDrop({ id: '', placement: 'root' });
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          finish(undefined, 'root');
        }}
      >
        Drop here to move to scene root
      </div>
      {nodes
        .filter((n) => visible.has(n.id) && (query || !isCollapsed(n)))
        .map((n) => {
          const children = nodes.some((a) => a.parent === n.id);
          return (
            <div
              key={n.id}
              role="treeitem"
              aria-level={n.depth + 1}
              aria-selected={selected === n.id}
              aria-expanded={children ? !collapsed.has(n.id) : undefined}
              draggable={!playing && !n.instanceRoot}
              onDragStart={(e) => {
                if (playing || n.instanceRoot) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData('application/x-lge-node', n.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragged(n.id);
                onSelect(n.id);
              }}
              onDragEnd={() => {
                setDragged('');
                setDrop(undefined);
              }}
              onDragOver={(e) => {
                if (!canDrop(n)) {
                  e.dataTransfer.dropEffect = 'none';
                  setDrop(undefined);
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const box = e.currentTarget.getBoundingClientRect(),
                  fraction = (e.clientY - box.top) / box.height;
                setDrop({
                  id: n.id,
                  placement: fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside',
                });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const box = e.currentTarget.getBoundingClientRect();
                const fraction = (e.clientY - box.top) / box.height;
                finish(n, fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside');
              }}
              className={`tree-row ${selected === n.id ? 'selected' : ''} ${!n.effectiveVisible ? 'hidden-node' : ''} ${n.instanceRoot ? 'inherited-node' : ''} ${dragged === n.id ? 'dragging-node' : ''} ${drop?.id === n.id ? `drop-${drop.placement}` : ''}`}
              style={{ paddingLeft: 8 + n.depth * 14 }}
            >
              <button
                className="tree-expander"
                aria-label={`${collapsed.has(n.id) ? 'Expand' : 'Collapse'} ${n.name}`}
                style={{ visibility: children ? 'visible' : 'hidden' }}
                onClick={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  })
                }
              >
                {collapsed.has(n.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              <button
                className="node-select"
                draggable={!playing && !n.instanceRoot}
                data-testid={`tree-${n.id}`}
                onClick={() => onSelect(n.id)}
                onDoubleClick={() => n.kind === 'instance' && n.scene && onOpenSource(n.scene)}
                title={
                  n.instanceRoot
                    ? `${n.id} · Open source to change its hierarchy`
                    : `${n.id} · Drag onto an object to parent; between rows to reorder`
                }
              >
                {n.kind === 'instance' ? (
                  <Link2 size={14} />
                ) : n.kind === 'group' ? (
                  <Box size={14} />
                ) : (
                  icon(n)
                )}
                <span>{n.name}</span>
                {n.spawnable && <small title="Reserved for runtime spawning">POOL</small>}
                {n.instanceRoot && <Link2 size={10} />}
                {n.player && <i className="player-dot" />}
              </button>
              <button
                className="visibility"
                aria-label={`${n.visible ? 'Hide' : 'Show'} ${n.name}`}
                disabled={playing}
                onClick={() => onVisible(n)}
              >
                {n.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          );
        })}
      {query && !visible.size && <p className="field-hint">No matching nodes.</p>}
    </div>
  );
}
