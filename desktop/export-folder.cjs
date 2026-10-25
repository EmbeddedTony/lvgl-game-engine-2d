const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MANIFEST = '.lge-export.json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function safeRelative(name) {
  return (
    typeof name === 'string' &&
    name.length < 240 &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    !name.includes(':') &&
    !path.isAbsolute(name) &&
    name.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}
async function exists(file) {
  try {
    return await fs.lstat(file);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
async function assertNoSymlinks(root) {
  const stat = await exists(root);
  if (!stat) return;
  if (stat.isSymbolicLink())
    throw new Error(
      'Export cannot follow a symbolic link inside the ui folder. Choose another folder.',
    );
  if (!stat.isDirectory()) throw new Error('The export destination must be a folder.');
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(`Export cannot follow the symbolic link ${entry.name}.`);
    if (entry.isDirectory()) await assertNoSymlinks(path.join(root, entry.name));
  }
}
function normalizeFiles(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 512)
    throw new Error('Invalid export file list.');
  const output = new Map();
  let size = 0;
  for (const entry of entries) {
    if (!entry || !safeRelative(entry.path) || entry.path === MANIFEST || output.has(entry.path))
      throw new Error('Invalid export path.');
    if (typeof entry.data !== 'string' && !(entry.data instanceof Uint8Array))
      throw new Error('Invalid export file data.');
    const bytes = Buffer.from(entry.data);
    size += bytes.length;
    if (size > 100 * 1024 * 1024) throw new Error('Export exceeds 100 MB.');
    output.set(entry.path, bytes);
  }
  if (!output.has('ui.h') || !output.has('ui.c') || !output.has('CMakeLists.txt'))
    throw new Error('This is not a valid LVGL ui package.');
  return output;
}
/* Build a complete replacement beside the destination, then swap it into place.
 * Unknown files and external edits are preserved. No partial file set is published. */
async function exportFolder(parent, entries, projectId, { replaceModified = false } = {}) {
  if (typeof projectId !== 'string' || !projectId || projectId.length > 160)
    throw new Error('Invalid project identity.');
  const files = normalizeFiles(entries);
  const target = path.join(parent, 'ui');
  await assertNoSymlinks(target);
  const targetStat = await exists(target);
  let previous = null;
  if (targetStat) {
    try {
      previous = JSON.parse(await fs.readFile(path.join(target, MANIFEST), 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw new Error('The ui export manifest is damaged. Choose a different folder.');
    }
    if (
      previous &&
      (previous.version !== 1 ||
        previous.projectId !== projectId ||
        !previous.files ||
        typeof previous.files !== 'object')
    )
      throw new Error('This ui folder belongs to a different project. Choose another destination.');
    if (!previous && (await fs.readdir(target)).length)
      throw new Error(
        'This ui folder already contains files from another project or tool. Choose a different destination to preserve them.',
      );
  }
  const preserved = [],
    conflicts = [],
    stale = [];
  const manifestFiles = {};
  for (const [name, bytes] of files) {
    const disk = await exists(path.join(target, name));
    const incomingHash = hash(bytes);
    if (disk) {
      if (!disk.isFile()) throw new Error(`A folder is blocking the export file ${name}.`);
      const currentHash = hash(await fs.readFile(path.join(target, name)));
      const baseline = previous?.files[name];
      if (currentHash !== incomingHash && currentHash !== baseline) {
        if (incomingHash === baseline) preserved.push(name);
        else if (!replaceModified) conflicts.push(name);
      }
    }
    // Keep the editor's baseline for preserved external edits, enabling three-way checks.
    manifestFiles[name] = incomingHash;
  }
  if (conflicts.length) return { ok: false, conflicts, path: target };
  for (const [name, baseline] of Object.entries(previous?.files ?? {})) {
    if (!safeRelative(name) || files.has(name)) continue;
    const stat = await exists(path.join(target, name));
    if (!stat?.isFile()) continue;
    if (hash(await fs.readFile(path.join(target, name))) === baseline) stale.push(name);
    else preserved.push(name);
  }
  const stage = path.join(parent, `.lge-ui-stage-${randomUUID()}`);
  const backup = path.join(parent, `.lge-ui-backup-${randomUUID()}`);
  let moved = false,
    published = false;
  try {
    if (targetStat)
      await fs.cp(target, stage, { recursive: true, errorOnExist: true, force: false });
    else await fs.mkdir(stage);
    for (const name of stale) await fs.rm(path.join(stage, name));
    for (const [name, bytes] of files) {
      if (preserved.includes(name)) continue;
      await fs.mkdir(path.dirname(path.join(stage, name)), { recursive: true });
      await fs.writeFile(path.join(stage, name), bytes);
    }
    await fs.writeFile(
      path.join(stage, MANIFEST),
      JSON.stringify({ version: 1, projectId, files: manifestFiles }, null, 2),
    );
    if (targetStat) {
      await fs.rename(target, backup);
      moved = true;
    }
    try {
      await fs.rename(stage, target);
      published = true;
    } catch (error) {
      if (moved) {
        await fs.rename(backup, target);
        moved = false;
      }
      throw error;
    }
  } finally {
    if (!published) await fs.rm(stage, { recursive: true, force: true });
    if (published && moved) await fs.rm(backup, { recursive: true, force: true });
  }
  return { ok: true, path: target, files: files.size, preserved, removed: stale };
}
module.exports = { exportFolder, normalizeFiles, safeRelative, hash };
