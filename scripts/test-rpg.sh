#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
npx tsx scripts/prepare-rpg-test.ts
npx tsx scripts/export-starter.ts .cache/generated-rpg examples/RpgBattleLab.lge.json
cmake -S tests/lvgl-rpg -B ".cache/rpg-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated-rpg" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-rpg-$LGE_VERSION.log" 2>&1
cmake --build ".cache/rpg-$LGE_VERSION" -j 6 > ".cache/build-rpg-$LGE_VERSION.log" 2>&1 || { tail -60 ".cache/build-rpg-$LGE_VERSION.log"; exit 1; }
".cache/rpg-$LGE_VERSION/lge_rpg_test" "$LGE_ROOT/.cache/rpg-save.bin" "$LGE_ROOT/.cache/rpg-final.bin"
