#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
if [ "$LGE_VERSION" = "9.4.0" ] && [ -d "$LGE_ROOT/.cache/lvgl-9.4" ]; then LGE_SOURCE="$LGE_ROOT/.cache/lvgl-9.4"; fi
if [ ! -d "$LGE_SOURCE" ]; then
  git clone --depth 1 --branch "v$LGE_VERSION" https://github.com/lvgl/lvgl.git "$LGE_SOURCE"
fi
npx tsx scripts/export-starter.ts
cmake -S tests/lvgl -B ".cache/host-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-$LGE_VERSION.log" 2>&1
cmake --build ".cache/host-$LGE_VERSION" -j 6 > ".cache/build-$LGE_VERSION.log" 2>&1 || { tail -80 ".cache/build-$LGE_VERSION.log"; exit 1; }
".cache/host-$LGE_VERSION/lge_host_test" "$LGE_ROOT/evidence/lvgl-$LGE_VERSION.ppm"
