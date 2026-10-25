# Contributing

Anyone with a GitHub account can suggest improvements in an issue or submit a
pull request from a fork. Repository write access is not required.

1. Read [LICENSE.md](LICENSE.md). This project is noncommercial source-available;
   contributions must comply with that license and preserve required attribution.
2. Fork the public repository and create a branch for one focused change.
3. Make your change, explain its purpose, and run the relevant checks below.
4. Open a pull request against `EmbeddedTony/lvgl-game-engine-2d:main`.

## Review and merge

`@EmbeddedTony` owns every file, including repository settings files and this
contribution guide. Changes to `main` require a pull request; direct pushes are
blocked. Only `@EmbeddedTony` can merge. Contributions require the maintainer's
review, and new reviewable commits dismiss earlier approvals. Review conversations
must be resolved before a normal merge. Automatic merging is disabled.

The maintainer has a pull-request-only exception so they can explicitly accept
their own PRs; GitHub does not allow authors to approve their own PRs. This
exception does not permit direct pushes to `main`. Force pushes and deletion of
`main` are blocked by a separate rule with no bypass actors.

Do not submit purchased asset packs, vendor binaries, credentials, device dumps,
or code from the separate private edition. A contribution must be yours to
license, or have clearly documented compatible third-party permissions. Submitting
changes does not transfer copyright or create permission to commercially license
another contributor's work.

## Validation

```sh
npm ci
npm run build
npm test
npm run test:runtime
npm run test:files
```

Run relevant editor or native LVGL tests when changing those areas. Board-specific
changes should state the target and whether validation was a build, simulation,
or actual hardware test. A contribution does not require flashing a board.

For bugs, provide reproduction steps, expected and actual behavior, the engine
commit, host OS, and target MCU/LVGL version when relevant. Do not include private
projects or credentials in reports.
