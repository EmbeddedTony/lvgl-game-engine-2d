import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const execute = promisify(execFile);
test('CLI edits the live document, creates one Undo step and enforces revisions and explicit saves', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lge-cli-live-')),
    profile = join(root, 'profile'),
    file = join(root, 'Live.lge.json');
  await mkdir(profile);
  const cli = async (args: string[], exit = 0) => {
    let r: any;
    try {
      r = await execute(process.execPath, [resolve('tests/cli/runner.cjs'), ...args], {
        env: { ...process.env, LGE_PROFILE_DIR: profile },
        maxBuffer: 48 * 1024 * 1024,
      });
    } catch (e) {
      r = e;
    }
    expect(r.code ?? 0, r.stdout + '\n' + r.stderr).toBe(exit);
    return JSON.parse(r.stdout);
  };
  await cli(['project', 'create', '--project-path', file, '--name', 'Live CLI']);
  const initial = await readFile(file, 'utf8');
  await writeFile(
    join(profile, 'recovery.json'),
    JSON.stringify({ text: initial, path: file, dirty: false }),
  );
  const app = await electron.launch({
    args: [resolve('desktop/main.cjs')],
    env: { ...process.env, LGE_PROFILE_DIR: profile },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('Undo', { exact: true })).toBeVisible();
    const status = await cli(['status', '--project-path', file]);
    expect(status.meta.source).toBe('editor');
    const revision = status.meta.revision;
    const batch = JSON.stringify({
      commands: [
        {
          command: 'node.create',
          params: {
            scene: 'main',
            kind: 'rect',
            id: 'hero',
            data: { name: 'Agent Hero', player: true },
          },
        },
        {
          command: 'node.create',
          params: { scene: 'main', kind: 'label', id: 'caption', data: { text: 'Agent test' } },
        },
      ],
    });
    const changed = await cli([
      'project',
      'apply',
      '--project-path',
      file,
      '--params',
      batch,
      '--expected-revision',
      revision,
    ]);
    expect(changed.meta.dirty).toBe(true);
    expect(await readFile(file, 'utf8')).toBe(initial);
    const live = await cli(['node', 'list', '--project-path', file, '--scene', 'main']);
    expect(live.data).toHaveLength(2);
    await page.getByLabel('Undo', { exact: true }).click();
    expect(
      (await cli(['node', 'list', '--project-path', file, '--scene', 'main'])).data,
    ).toHaveLength(0);
    await cli(
      [
        'project',
        'apply',
        '--project-path',
        file,
        '--params',
        batch,
        '--expected-revision',
        changed.meta.revision,
      ],
      4,
    );
    const applied = await cli([
      'project',
      'apply',
      '--project-path',
      file,
      '--params',
      batch,
      '--save',
    ]);
    expect(applied.data.saved.dirty).toBe(false);
    expect(JSON.parse(await readFile(file, 'utf8')).scenes[0].nodes).toHaveLength(2);
    await cli(
      [
        'node',
        'update',
        '--project-path',
        file,
        '--scene',
        'main',
        '--id',
        'hero',
        '--patch',
        '{"x":80}',
        '--offline',
      ],
      4,
    );
    const session = (await cli(['editor', 'sessions'])).data[0];
    expect(session.token).toBeUndefined();
    expect(session.endpoint).toBeUndefined();
    const registry = JSON.parse(
      await readFile(join(profile, 'automation', `session-${session.pid}.json`), 'utf8'),
    );
    const { request } = createRequire(import.meta.url)('../../desktop/automation/session.cjs');
    await expect(request({ ...registry, token: '0'.repeat(64) }, 'snapshot')).rejects.toThrow(
      /credentials/,
    );
    await page.screenshot({ path: 'evidence/cli-live-editor.png', fullPage: true });
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
