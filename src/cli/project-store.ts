import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { checkedProject } from '../automation/project-commands';
import { AutomationError } from '../automation/protocol';
import type { Project } from '../model';
import { serializeProject } from '../project-file';
const MAX_BYTES = 24 * 1024 * 1024;
export const revision = (text: string) =>
  'sha256:' + createHash('sha256').update(text).digest('hex');
export async function resolveProject(input?: string, create = false): Promise<string> {
  if (!input)
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'Pass --project-path <file.lge.json> or --session <editor ID>.',
    );
  let file = path.resolve(input);
  const stat = await fs.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    const files = (await fs.readdir(file)).filter((n) => n.endsWith('.lge.json'));
    if (files.length !== 1)
      throw new AutomationError(
        'INVALID_ARGUMENT',
        'A project directory must contain exactly one *.lge.json. Pass a file path.',
      );
    file = path.join(file, files[0]);
  } else if (!stat && !create)
    throw new AutomationError('NOT_FOUND', `Project does not exist: ${file}.`);
  return stat ? fs.realpath(file) : file;
}
export async function readProjectFile(file: string) {
  const handle = await fs.open(file, 'r');
  try {
    if ((await handle.stat()).size > MAX_BYTES)
      throw new AutomationError('VALIDATION_FAILED', 'Project exceeds 24 MiB.');
    const text = await handle.readFile('utf8');
    return {
      project: checkedProject(text),
      revision: revision(text),
      path: file,
      dirty: false,
      source: 'file',
    };
  } finally {
    await handle.close();
  }
}
/** CLI writers serialize through an exclusive lock, recheck the exact source hash,
 * preserve a content-addressed previous version, then atomically rename. */
export async function writeProjectFile(
  file: string,
  project: Project,
  expected?: string,
  create = false,
) {
  const text = serializeProject(project) + '\n';
  if (Buffer.byteLength(text) > MAX_BYTES)
    throw new AutomationError('VALIDATION_FAILED', 'Serialized project exceeds 24 MiB.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const lockPath = file + '.lge-lock';
  const lock = await fs.open(lockPath, 'wx', 0o600).catch((e) => {
    if (e.code === 'EEXIST')
      throw new AutomationError(
        'CONFLICT',
        `Another writer holds ${lockPath}. If a writer crashed, inspect this lock before removing it.`,
      );
    throw e;
  });
  const temporary = path.join(
    path.dirname(file),
    '.' + path.basename(file) + '.' + randomUUID() + '.tmp',
  );
  let backup: string | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, created: new Date().toISOString() }));
    const previous = await fs.readFile(file, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (create && previous !== null)
      throw new AutomationError(
        'CONFLICT',
        'Project already exists; creation never overwrites files.',
      );
    if (!create && (previous === null || revision(previous) !== expected))
      throw new AutomationError(
        'CONFLICT',
        'Project changed on disk. Read it again before retrying.',
        { actualRevision: previous === null ? null : revision(previous) },
      );
    if (previous !== null) {
      backup = path.join(
        path.dirname(file),
        '.lge-backups',
        path.basename(file),
        revision(previous).slice(7) + '.json',
      );
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, previous, { flag: 'wx', mode: 0o600 }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
    }
    const mode = previous === null ? 0o644 : (await fs.stat(file)).mode;
    const target = await fs.open(temporary, 'wx', mode);
    try {
      await target.writeFile(text);
      await target.sync();
    } finally {
      await target.close();
    }
    await fs.rename(temporary, file);
    return { path: file, revision: revision(text), backup, dirty: false };
  } finally {
    await fs.rm(temporary, { force: true });
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}
