const path = require('node:path');
const esbuild = require('esbuild');
require('./sync-board-sources.cjs');
async function build() {
  const result = await esbuild.build({
    entryPoints: ['src/cli/entry.ts'],
    outfile: 'desktop/cli/entry.cjs',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    write: false,
    define: { LGE_SCHEMAS: JSON.stringify(require('./cli-schema.cjs')()) },
    plugins: [
      {
        name: 'engine-source',
        setup(build) {
          build.onResolve({ filter: /\?raw$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
            namespace: 'raw-source',
          }));
          build.onLoad({ filter: /.*/, namespace: 'raw-source' }, async (args) => ({
            contents: await require('node:fs/promises').readFile(args.path, 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
  });
  const fs = require('node:fs/promises');
  await fs.mkdir('desktop/cli', { recursive: true });
  const temporary = 'desktop/cli/entry.' + require('node:crypto').randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, result.outputFiles[0].contents);
    await fs.rename(temporary, 'desktop/cli/entry.cjs');
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
