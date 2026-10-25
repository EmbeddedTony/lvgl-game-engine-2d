#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_ROOT=$(pwd)
LGE_VERSION=${LGE_LVGL_VERSION:-9.4.0}
LGE_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_ROOT/.cache/lvgl-$LGE_VERSION"}
for LGE_EXAMPLE in AmberTrail WillowlightAdventure; do
  npx tsx scripts/export-starter.ts ".cache/generated-$LGE_EXAMPLE" "examples/$LGE_EXAMPLE.lge.json"
  cmake -S tests/lvgl-examples -B ".cache/examples-$LGE_EXAMPLE-$LGE_VERSION" -G Ninja -DLVGL_SOURCE="$LGE_SOURCE" -DGENERATED_SOURCE="$LGE_ROOT/.cache/generated-$LGE_EXAMPLE" -DCMAKE_BUILD_TYPE=Debug > ".cache/configure-$LGE_EXAMPLE-$LGE_VERSION.log" 2>&1
  cmake --build ".cache/examples-$LGE_EXAMPLE-$LGE_VERSION" -j 6 > ".cache/build-$LGE_EXAMPLE-$LGE_VERSION.log" 2>&1 || { tail -70 ".cache/build-$LGE_EXAMPLE-$LGE_VERSION.log"; exit 1; }
  ".cache/examples-$LGE_EXAMPLE-$LGE_VERSION/lge_examples_test" "$LGE_ROOT/evidence/$LGE_EXAMPLE-$LGE_VERSION.ppm"
done
