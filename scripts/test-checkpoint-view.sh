#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_INDICATOR_UI=${1:-.cache/saving-generated/ui}
LGE_INDICATOR_SDK=${LGE_NATIVE_SDK:-.cache/native-sdk}
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g \
  -DLV_CONF_INCLUDE_SIMPLE -DLGE_DESKTOP_PLAYTEST=1 \
  -isystem "$LGE_INDICATOR_SDK" -isystem "$LGE_INDICATOR_SDK/include" \
  -I"$LGE_INDICATOR_UI" -I"$LGE_INDICATOR_UI/engine" \
  "$LGE_INDICATOR_UI"/*.c "$LGE_INDICATOR_UI"/engine/*.c \
  "$LGE_INDICATOR_UI"/generated/*.c "$LGE_INDICATOR_UI"/user/*.c \
  tests/checkpoint_view_test.c "$LGE_INDICATOR_SDK/liblvgl.a" -lm -o .cache/checkpoint_view_test
.cache/checkpoint_view_test .cache/checkpoint-saving.ppm .cache/checkpoint-saved.ppm .cache/checkpoint-failed.ppm
