#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache
${CC:-cc} -std=c99 -Wall -Wextra -Werror -pedantic -Itests/hardware-driver -Iports/stm32h7s78 -Iengine \
  tests/hardware-driver/main.c ports/stm32h7s78/hardware_inputs.c ports/stm32h7s78/input_debounce.c \
  engine/lge_inputs.c -o .cache/hardware-driver-test
.cache/hardware-driver-test
