#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_INPUT_ROOT=$(pwd)
mkdir -p .cache
${CC:-cc} -std=c99 -Wall -Wextra -Werror -pedantic -Iports/stm32h7s78 -Iengine \
  tests/input-monitor-wire.c ports/stm32h7s78/input_monitor_text.c \
  engine/lge_inputs.c engine/lge_input_codec.c -o .cache/input-monitor-wire
.cache/input-monitor-wire
LGE_INPUT_SOURCE=${LGE_LVGL_SOURCE:-"$LGE_INPUT_ROOT/.cache/lvgl-9.4.0"}
if [ ! -d "$LGE_INPUT_SOURCE" ]; then
  echo "Run npm run test:lvgl first, or set LGE_LVGL_SOURCE." >&2
  exit 1
fi
npx tsx scripts/export-starter.ts .cache/generated-inputs examples/PhysicalControllers.lge.json > .cache/inputs-export.log
cmake -S tests/lvgl-inputs -B .cache/host-inputs -G Ninja -DLVGL_SOURCE="$LGE_INPUT_SOURCE" -DGENERATED_SOURCE="$LGE_INPUT_ROOT/.cache/generated-inputs" -DCMAKE_BUILD_TYPE=Debug > .cache/inputs-configure.log 2>&1
cmake --build .cache/host-inputs -j 6 > .cache/inputs-build.log 2>&1 || { tail -60 .cache/inputs-build.log; exit 1; }
.cache/host-inputs/lge_inputs_host
