import { useEffect, useRef, useState } from 'react';
import type { Project } from '../model';
import { makeNode } from '../model';
import { begin, advance } from '../simulation';
import { makePhysics } from '../physics';
import { emptyGameplay } from '../gameplay/model';
import type { BulletPattern } from '../gameplay/toolkit';
export function PatternPreview({ project, pattern }: { project: Project; pattern: BulletPattern }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [running, setRunning] = useState(true),
    [stats, setStats] = useState({ active: 0, dropped: 0 });
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const p: Project = {
      ...project,
      width: 320,
      height: 180,
      gameplay: {
        ...emptyGameplay(),
        patterns: [pattern],
        projectileLimit: project.gameplay?.projectileLimit ?? 64,
      },
    };
    const scene = {
      ...project.scenes[0],
      camera2d: undefined,
      nodes: [
        makeNode('group', {
          id: 'preview_emitter',
          x: 156,
          y: 30,
          width: 8,
          height: 8,
          emitter: { pattern: pattern.id, autoplay: true },
        }),
        makeNode('rect', {
          id: 'preview_target',
          x: 152,
          y: 150,
          width: 16,
          height: 16,
          player: true,
          physics: { ...makePhysics('character'), motion: 'code', mask: 0 },
        }),
      ],
    };
    const sim = begin(scene, p);
    let frame = 0,
      last = performance.now(),
      raf = 0,
      disposed = false;
    const draw = (now: number) => {
      if (disposed) return;
      const dt = now - last;
      last = now;
      if (running)
        advance(
          sim,
          p,
          new Set(),
          dt,
          () => {},
          () => {},
        );
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#191f28';
        ctx.fillRect(0, 0, 320, 180);
        ctx.strokeStyle = '#2d3745';
        ctx.lineWidth = 1;
        for (let x = 0; x < 320; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, 180);
          ctx.stroke();
        }
        for (let y = 0; y < 180; y += 16) {
          ctx.beginPath();
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(320, y + 0.5);
          ctx.stroke();
        }
        ctx.fillStyle = '#90b9df';
        ctx.fillRect(156, 30, 8, 8);
        ctx.strokeStyle = '#94cfa0';
        ctx.strokeRect(152.5, 150.5, 16, 16);
        for (const b of sim.projectiles.slots)
          if (b && b.remaining > 0) {
            ctx.fillStyle = b.pattern.color;
            ctx.beginPath();
            ctx.arc(Math.round(b.x), Math.round(b.y), b.pattern.radius, 0, Math.PI * 2);
            ctx.fill();
          }
      }
      if (frame++ % 15 === 0)
        setStats({
          active: sim.projectiles.slots.filter((b) => b && b.remaining > 0).length,
          dropped: sim.projectiles.dropped,
        });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [project, pattern]);
  return (
    <section className="pattern-preview">
      <canvas ref={canvas} width={320} height={180} aria-label="Bullet pattern live preview" />
      <div className="gameplay-inline">
        <button onClick={() => setRunning((v) => !v)}>
          {running ? 'Pause pattern' : 'Resume pattern'}
        </button>
        <span>
          {stats.active} active · {stats.dropped} dropped
        </span>
      </div>
      <p>
        Blue: emitter. Green: aiming target. Uses the same bounded pool and fixed step as scene
        preview.
      </p>
    </section>
  );
}
