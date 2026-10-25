# Public 2D edition

This repository is the standalone 2D edition of LVGL Game Engine. It has a fresh
history containing the editor, portable C runtime, 2D physics, scenes/prefabs,
tilemaps and animations, RPG tools, audio integration, typed hardware inputs,
CLI, target guidance, and STM32H7S78-DK integration.

The editor offers 2D projects only. Incompatible project dimensions are rejected
rather than silently converting their content. The private development edition
is maintained separately; its repository history is not included here. The desktop
app and CLI use a separate `LVGL Game Engine 2D` profile, and browser recovery uses
an edition-specific key, preserving private-edition documents and recovery data.

## License and redistribution

Read [LICENSE.md](../LICENSE.md). This is noncommercial source-available software,
not OSI-approved open source. Commercial games and commercial engine use require
separate written permission. Fork interfaces must preserve the persistent visible
attribution specified in the license. Independent games using an unmodified runtime
are not subject to a perpetual on-screen engine credit solely because they use it.
Engine source-sharing and noncommercial-use conditions still apply.

Purchased artwork, private pack-backed projects, device backups, SDK caches,
firmware archives, local evidence, and build outputs are excluded from this repo.
Import scripts require your own legally acquired packs. Vendor SDKs and libraries
are acquired separately and retain their original terms; see [ThirdParty](ThirdParty.md).

## Development

Use Node.js 22.12 or newer, npm, and a C99 compiler for native checks.

```sh
npm ci
npm run build
npm test
npm run test:runtime
npm run test:files
```

`npm run dev` starts the development editor; `npm run desktop:build` produces the
standalone macOS app using the existing native SDK workflow. Packaging requires
the toolchains documented in the repository. No board must be connected for these
checks. Publishing this edition does not program a board or change its saves.
