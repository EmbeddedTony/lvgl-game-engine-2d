#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache
${CC:-cc} -std=c99 -O2 -Wall -Wextra -Werror -pedantic -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/performance_bench.c -lm -o .cache/performance_bench
.cache/performance_bench
