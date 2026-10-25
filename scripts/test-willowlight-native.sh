#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
LGE_CAMPAIGN_UI=${1:-.cache/autosave-generated/ui}
LGE_TEST_SDK=${LGE_NATIVE_SDK:-.cache/native-sdk}
test -f "$LGE_CAMPAIGN_UI/generated/game_data.c"
test -f "$LGE_TEST_SDK/include/lvgl.h"
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g \
  -DLV_CONF_INCLUDE_SIMPLE -isystem "$LGE_TEST_SDK" -isystem "$LGE_TEST_SDK/include" \
  -I"$LGE_CAMPAIGN_UI" -I"$LGE_CAMPAIGN_UI/engine" -Iports/stm32h7s78 \
  "$LGE_CAMPAIGN_UI/generated/game_data.c" "$LGE_CAMPAIGN_UI/generated/game_assets.c" \
  "$LGE_CAMPAIGN_UI/engine/lge.c" "$LGE_CAMPAIGN_UI/engine/lge_melee.c" \
  "$LGE_CAMPAIGN_UI/engine/lge_physics.c" "$LGE_CAMPAIGN_UI/engine/lge_gameplay.c" \
  "$LGE_CAMPAIGN_UI/engine/lge_story.c" "$LGE_CAMPAIGN_UI/engine/lge_rpg.c" \
  "$LGE_CAMPAIGN_UI/engine/lge_rpg_ui.c" "$LGE_CAMPAIGN_UI/engine/lge_rpg_save.c" \
  ports/stm32h7s78/checkpoint_journal.c tests/willowlight_autosave_test.c \
  -lm -o .cache/willowlight_autosave_test
.cache/willowlight_autosave_test
