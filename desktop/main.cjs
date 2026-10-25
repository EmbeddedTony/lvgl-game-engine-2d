// Select automation before registering GUI lifecycle handlers. Headless commands
// use the bundled Electron runtime and never need a browser or a dev server.
if (process.argv.includes('--cli')) {
  const { app } = require('electron');
  require('./cli-runner.cjs')
    .run(process.argv.slice(process.argv.indexOf('--cli') + 1))
    .then(
      (code) => app.exit(code),
      (error) => {
        process.stderr.write(error.stack + '\n');
        app.exit(6);
      },
    );
} else require('./editor-main.cjs');
