const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const source = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const target = path.resolve('.cache/desktop-app');
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  await fs.copyFile('LICENSE.md', path.join(target, 'LICENSE.md'));
  await fs.cp('dist', path.join(target, 'dist'), { recursive: true });
  await fs.cp('desktop', path.join(target, 'desktop'), {
    recursive: true,
    filter: (source) => path.basename(source) !== 'resources',
  });
  await fs.writeFile(
    path.join(target, 'package.json'),
    JSON.stringify(
      {
        name: source.name,
        version: source.version,
        description: source.description,
        main: source.main,
        author: source.author,
        license: source.license,
      },
      null,
      2,
    ),
  );
  console.log('Prepared bundled desktop app (no Node.js or dev server required).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
