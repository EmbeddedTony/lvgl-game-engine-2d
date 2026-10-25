#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge_inputs.c engine/lge_input_codec.c engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/inputs_test.c -lm -o .cache/inputs_test
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -pthread -Iengine engine/lge_inputs.c tests/inputs_thread_test.c -lm -o .cache/inputs_thread_test
.cache/inputs_thread_test
.cache/inputs_test
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iports/stm32h7s78 ports/stm32h7s78/checkpoint_journal.c tests/checkpoint_journal_test.c -o .cache/checkpoint_journal_test
.cache/checkpoint_journal_test
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/runtime_test.c -lm -o .cache/runtime_test
.cache/runtime_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge_flow.c tests/flow_test.c -o .cache/flow_test
.cache/flow_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/scenes_test.c -lm -o .cache/scenes_test
.cache/scenes_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/physics_test.c -lm -o .cache/physics_test
.cache/physics_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/tiles_test.c -lm -o .cache/tiles_test
.cache/tiles_test



cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c engine/lge_story.c engine/lge_rpg.c engine/lge_rpg_ui.c engine/lge_rpg_save.c tests/story_test.c -lm -o .cache/story_test
.cache/story_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c engine/lge_story.c engine/lge_rpg.c engine/lge_rpg_ui.c engine/lge_rpg_save.c tests/cinematics_test.c -lm -o .cache/cinematics_test
.cache/cinematics_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/toolkit_test.c -lm -o .cache/toolkit_test
.cache/toolkit_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c engine/lge_story.c engine/lge_rpg.c engine/lge_rpg_ui.c engine/lge_rpg_save.c tests/rpg_test.c -lm -o .cache/rpg_test
.cache/rpg_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/melee_test.c -lm -o .cache/melee_test
.cache/melee_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c engine/lge_story.c engine/lge_rpg.c engine/lge_rpg_ui.c engine/lge_rpg_save.c tests/prefabs_test.c -lm -o .cache/prefabs_test
.cache/prefabs_test

# Non-byte-aligned capacities exercise contact bitsets and last-byte prefab clearing.
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -DLGE_MAX_NODES=7 -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c tests/runtime_test.c -lm -o .cache/runtime_small_test
.cache/runtime_small_test
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -DLGE_MAX_NODES=9 -Iengine engine/lge.c engine/lge_melee.c engine/lge_physics.c engine/lge_gameplay.c engine/lge_story.c engine/lge_rpg.c engine/lge_rpg_ui.c engine/lge_rpg_save.c tests/prefabs_test.c -lm -o .cache/prefabs_small_test
.cache/prefabs_small_test

cc -std=c99 -Wall -Wextra -Werror -pedantic -fsanitize=undefined -g -Iports/stm32h7s78 ports/stm32h7s78/debug_mailbox.c tests/debug_mailbox_test.c -o .cache/debug_mailbox_test
.cache/debug_mailbox_test
