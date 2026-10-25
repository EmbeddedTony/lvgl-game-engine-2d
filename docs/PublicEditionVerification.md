# Public 2D edition verification

Validated locally before the initial public source release on 25 October 2026:

| Check | Result |
| --- | --- |
| TypeScript and Vite production build | Passed |
| Unit tests, including edition boundaries and exported license | 162 passed |
| Electron/desktop service tests | 27 passed |
| CLI tests, including native playtest | 7 passed; none skipped |
| Editor, workbench, navigation and input UI tests | 13 passed |
| 2D project wizard and absence of private templates | 1 passed |
| Packaged desktop CLI, offline editor connection and native rendering | 1 passed |
| Portable C99 runtime and undefined-behavior checks | Passed |
| Native LVGL exported C rendering and scene lifecycle | Passed; 66 flushes |
| ARM Cortex-M0+ soft-float and Cortex-M7 hard-float compile/link checks | Passed |
| STM32H7S78-DK 2D firmware cross-build | Passed; NeoChrom configuration |

The firmware build produced a 1,973,120-byte application and a 21,416-byte vendor
Boot image. The Boot image SHA-256 matched the existing pinned build:
`0db68f9487ce4583539f704dfadd4fc85ebb0e3afaab9e3a3a6ce179f7d8d169`.
These are build results, not new hardware measurements. This release process did
not flash, reset, or write a connected board or save storage.

The upload audit excludes purchased pack projects, cached SDKs, build outputs,
firmware archives, local evidence and device backups. Secret-pattern scanning
found no credential matches. The initial commit starts a fresh history and does
not include the private repository's history.
