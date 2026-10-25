import { useEffect, useRef, useState } from 'react';
import type { Project } from '../model';
import { uid } from '../model';
import { emptyGameplay } from '../gameplay/model';
import {
  importLayeredCharacter,
  characterLayerName,
  sortCharacterSheets,
  type CharacterSheet,
} from '../animation/import-character';
import { layeredAnimationIssues } from '../animation/layers';
import { resolveScene } from '../scenes';

export function LayeredCharacterImporter({
  project,
  onEdit,
  sceneId,
}: {
  project: Project;
  onEdit: (fn: (p: Project) => void) => void;
  sceneId?: string;
}) {
  const [sources, setSources] = useState<CharacterSheet[]>([]),
    [name, setName] = useState('New NPC'),
    [pixelScale, setPixelScale] = useState<1 | 2 | 3 | 4>(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const read = async (files: File[]) => {
    const token = ++generation.current;
    setBusy(true);
    setError('');
    setSources([]);
    try {
      if (files.length > 8) throw new Error('Choose up to eight layers for one character.');
      const sheets: CharacterSheet[] = [];
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error('Each character sheet must be below 8 MB.');
        const image = await createImageBitmap(file);
        try {
          if (image.width !== 512 || image.height !== 512)
            throw new Error('This preset needs 512 × 512 Mana Seed P1 sheets.');
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, 0, 0);
          sheets.push({
            name: file.name,
            sheet: {
              width: image.width,
              height: image.height,
              pixels: ctx.getImageData(0, 0, image.width, image.height).data,
            },
          });
        } finally {
          image.close();
        }
      }
      if (token === generation.current) setSources(sortCharacterSheets(sheets));
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const add = () => {
    try {
      const imported = importLayeredCharacter(name.trim() || 'NPC', uid('npc'), sources, {
        pixelScale,
      });
      if (
        project.sprites.length + imported.sprites.length > 2048 ||
        (project.gameplay?.animations.length ?? 0) + imported.clips.length > 64
      )
        throw new Error(
          'Character exceeds the 2048 source sprites / 64 animation clip budget. Use fewer layers or characters.',
        );
      const next = {
        ...project,
        sprites: [...project.sprites, ...imported.sprites],
        gameplay: {
          ...(project.gameplay ?? emptyGameplay()),
          animations: [...(project.gameplay?.animations ?? []), ...imported.clips],
        },
      };
      const issues = layeredAnimationIssues(next);
      if (issues.length) throw new Error(issues[0]);
      const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0];
      const nodes = resolveScene(project, scene);
      if (nodes.length >= 128)
        throw new Error('The scene is full. Create another scene before adding this NPC.');
      const follow = nodes.find((n) => n.id === scene.camera2d?.follow);
      if (follow) {
        imported.node.x = follow.x + 48;
        imported.node.y = follow.y;
      }
      onEdit((p) => {
        p.sprites.push(...imported.sprites);
        p.gameplay ??= emptyGameplay();
        p.gameplay.animations.push(...imported.clips);
        p.scenes.find((s) => s.id === scene.id)!.nodes.push(imported.node);
      });
      setSources([]);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="layered-character-importer">
      <summary>Import layered character</summary>
      <p>
        Mana Seed P1 · body + clothes + accessories. Original pixels, four directions, idle and
        six-frame walk. Export precomposes each frame for MCU efficiency.
      </p>
      <label>
        Character name
        <input
          aria-label="Layered character name"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Display scale
        <select
          aria-label="Character display scale"
          value={pixelScale}
          onChange={(e) => setPixelScale(Number(e.target.value) as 1 | 2 | 3 | 4)}
        >
          {[1, 2, 3, 4].map((scale) => (
            <option key={scale} value={scale}>
              {scale}× · {32 * scale} × {48 * scale}
            </option>
          ))}
        </select>
      </label>
      <label>
        PNG layers
        <input
          aria-label="Layered character sheets"
          data-testid="character-layer-files"
          type="file"
          accept="image/png"
          multiple
          disabled={busy}
          onChange={(e) => void read(Array.from(e.target.files ?? []))}
        />
      </label>
      <ol>
        {sources.map((s) => (
          <li key={s.name}>
            {characterLayerName(s.name)} · {s.name}
          </li>
        ))}
      </ol>
      <p className="field-hint">
        Files sort behind-body layers first, then body, outfit, cloak, facewear, hair and hood.
        Choose one color variant per part. Layer order and visibility remain editable in each clip.
        Canvas: native 32 × 48 from shared 64px cells. Display scaling uses whole pixels and also
        scales the feet collider.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || !sources.length} onClick={add}>
        {busy ? 'Reading layers…' : 'Create animated NPC'}
      </button>
    </details>
  );
}
