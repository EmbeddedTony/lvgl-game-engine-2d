#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
npx tsx scripts/export-starter.ts .cache/generated-toolkit examples/2DToolkitLab.lge.json
cmake -S tests/lvgl-toolkit -B ".cache/toolkit-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated-toolkit" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-toolkit-$LGE_VERSION.log" 2>&1
cmake --build ".cache/toolkit-$LGE_VERSION" -j 6 > ".cache/build-toolkit-$LGE_VERSION.log" 2>&1 || { tail -60 ".cache/build-toolkit-$LGE_VERSION.log"; exit 1; }
".cache/toolkit-$LGE_VERSION/lge_toolkit_test" "$LGE_ROOT/evidence/toolkit-$LGE_VERSION.ppm"
