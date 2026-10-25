const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_PROJECT = 24 * 1024 * 1024;
function validateProjectText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_PROJECT)
    throw new Error('Project exceeds 24 MB.');
  const value = JSON.parse(text);
  if (
    !value ||
    value.version !== 1 ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.scenes)
  )
    throw new Error('Invalid LVGL game project.');
  return value;
}
async function atomicWrite(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, contents, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
async function readProject(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_PROJECT)
    throw new Error('Choose a .lge.json file under 24 MB.');
  const text = await fs.readFile(file, 'utf8');
  validateProjectText(text);
  return text;
}
module.exports = { atomicWrite, readProject, validateProjectText };
