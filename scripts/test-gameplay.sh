#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
npx tsx scripts/export-starter.ts .cache/generated-gameplay examples/2DGameplayLab.lge.json
npx tsx -e "import {createGameplayDemo} from './src/gameplay/demo';import {createSession} from './src/gameplay/runtime';import {saveState} from './src/gameplay/save';import {writeFileSync} from 'node:fs';const p=createGameplayDemo(),s=createSession(p);s.values.quest=1;s.values.chest_opened=1;s.values.amber_key=2;s.values.second_chest_opened=1;writeFileSync('.cache/gameplay-save.bin',saveState(s,p));"
cmake -S tests/lvgl-gameplay -B ".cache/gameplay-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated-gameplay" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-gameplay-$LGE_VERSION.log" 2>&1
cmake --build ".cache/gameplay-$LGE_VERSION" -j 6 > ".cache/build-gameplay-$LGE_VERSION.log" 2>&1 || { tail -80 ".cache/build-gameplay-$LGE_VERSION.log"; exit 1; }
".cache/gameplay-$LGE_VERSION/lge_gameplay_test" "$LGE_ROOT/evidence/gameplay-$LGE_VERSION.ppm" "$LGE_ROOT/.cache/gameplay-save.bin"
