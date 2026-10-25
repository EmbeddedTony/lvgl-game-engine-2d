#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
npx tsx scripts/export-starter.ts .cache/generated-h7 examples/WillowlightH7.lge.json
cmake -S tests/lvgl-h7 -B ".cache/h7-host-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated-h7" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-h7-host-$LGE_VERSION.log" 2>&1
cmake --build ".cache/h7-host-$LGE_VERSION" -j 6 > ".cache/build-h7-host-$LGE_VERSION.log" 2>&1 || { tail -60 ".cache/build-h7-host-$LGE_VERSION.log"; exit 1; }
".cache/h7-host-$LGE_VERSION/lge_h7_host_test" "$LGE_ROOT/evidence/h7-native-$LGE_VERSION.ppm"
