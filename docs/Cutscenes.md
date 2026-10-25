# Cutscenes and checkpoints

Open **Gameplay → Cutscene maker → New cutscene**. A cutscene is an ordinary event script with cinematic metadata, so the preview, agent CLI and exported LVGL runtime use the same commands.

1. Name the cutscene and give it a chapter folder.
2. Add a **Camera cue**, **Stage actor movement**, **Dialogue / choice**, or **Wait** beat. Beats play in list order; the existing reorder controls preserve stable step links.
3. Pick actors from the current scene. Enter destination world pixels and duration, or copy an actor’s authored position. Camera cues can frame an actor or return to the scene’s normal follow camera. Zero duration makes an immediate cut.
4. Attach the script to an object’s **Start**, **Enter**, **Interact**, or **Click** event in the Scene inspector. Play from that scene; use Native LVGL to check the exported C implementation.
5. If the sequence is skippable, choose **Skip continues at**. Point it at a completion beat before the quest changes or rewards that must still happen. Leave **Skip disabled** for sequences containing decisions that cannot be bypassed.

The timed-beat total excludes reading time and branch-dependent duration. Dialogue remains player paced: reveal, then advance. The campaign uses unskippable conversations where a player must make a choice, and skippable arrivals/testimony where completion can safely be committed.

Staged actor movement follows a straight line and intentionally bypasses collision. It is a director tool, rather than a pathfinder; lay out clear routes. Movement and camera cues require a blocking cinematic script. Ordinary velocity scripts remain appropriate for gameplay patrols and moving platforms.

Only one cinematic director runs at a time. Finishing, skipping, changing scenes, or retiring an owned prefab releases its camera/track state. Skip cannot rewind behind a completion beat. Modal player input cannot launch a second journal or interaction over a running cutscene. Camera output is clamped and rounded to whole pixels.

## Portable implementation

The implementation extends the bounded event VM with `move`, `camera` and `checkpoint` actions. Eight runner slots and the 32-instruction per-tick budget remain unchanged. A runner holds one sequential track; actor positions and facing animation advance even while gameplay physics is locked. There is no per-frame track allocation, general-purpose scripting evaluator or second timeline engine.

`EventScript.kind = 'cutscene'` and optional `skipTo` are authoring metadata exported into immutable `lge_script_def_t` data. `skipCutscene()` and `ui_cutscene_skip()` use the explicit completion step. Actor references use normal scene paths and the aliases `self`, `player`, `other`. The CLI’s generated schema and normal script resource commands expose the same data.

Authoring catalogs allow 512 scripts with 128 beats each and 2048 source sprite layers. Loaded scenes still have at most 128 nodes, animation catalogs have 64 clips, and the runtime still runs eight scripts concurrently. Larger catalogs cost flash; they do not allocate more runners. Guidance includes script tables, used image variants and checkpoint scratch storage.

## Checkpoint storage

**Save / load checkpoint** branches on success or failure. Fast preview stores the checked packet in project/schema-specific local storage. Native LVGL stores it in a private profile’s `Cache/cli-native-playtest/saves/` or native playtest cache directory. Writes use a temporary file, flush/fsync and atomic rename. A different project or incompatible state schema cannot load that slot.

The exported firmware owns its storage implementation:

```c
static bool read_checkpoint(void *context, void *buffer, size_t exact_size);
static bool write_checkpoint(void *context, const void *buffer, size_t exact_size);

const ui_config_t config = {
    .storage_context = &game_storage,
    .storage_read = read_checkpoint,
    .storage_write = write_checkpoint,
};
ui_init_with_config(&config);
```

Callbacks run synchronously on the LVGL thread and must not reenter game execution. Return false on unavailable storage, short reads/writes or storage failure. The backend owns atomic replacement, wear management and board-specific media. No bootloader, option bytes or flash region is selected implicitly.

The packet saves persistent story fields and optional party state. It excludes coroutine stacks and room positions. A game should save a stable checkpoint ID and reconstruct its room after loading. Willowlight saves `checkpoint_room` at rest lamps and major one-time story milestones, then routes from that checkpoint with `continue`; completed campaigns route to the shore. Defeated wards, records, side quests, endings and companion choices persist. Rest lamps refill health/tonics; automatic saves preserve the earned state. See [the campaign's autosave policy](WillowlightCampaign.md#autosave-policy).

To author an autosave, put **Save checkpoint** after the complete reward/state changes and before the scene-warp action. Set the stable resume area first. Place the one-time completion guard before that block so revisiting a completed interaction bypasses storage. Keep the failure branch playable and report that the save failed; avoid timers or unbounded retries. The DK journal skips identical packets, but content guards also prevent writes when unrelated counters changed since the last visit. A save belongs before a warp because scene changes retire the current event runner.

The default UI shows a small **Saving… / Keep power on** notice for checkpoint
actions. It waits for a rendered frame and a 160 ms viewing interval before
starting synchronous storage IO, without reentering the LVGL handler. Only a
successful durable `storage_write` result changes it to **Saved / Safe to power
off** for three seconds. Failed or cancelled saves show **Not saved / Try a rest
lamp** instead. Success persists across scene changes, not across app restarts;
Continue/read-only loads and RAM packet serialization do not claim a new save.
`ui_checkpoint_status()` exposes this transient status to game code. Low-level
story users can install the optional `checkpoint_feedback` presentation gate;
without it, storage executes immediately as before. The notice creates at most
one small LVGL label per loaded scene, never adds flash writes, and is omitted
from serialized state. Projects without checkpoint packets install no refresh
listener. Fast preview uses the same transient feedback policy. Run
`npm run test:checkpoint-view` against an exported private campaign to check real
LVGL painting, result ordering, scene continuity, failure and listener cleanup.

The exporter sets `LGE_CHECKPOINT_BYTES` to the exact maximum packet size for the project. Its cold-path scratch is static, so a save never places a 4 KiB temporary buffer on an embedded task stack. Projects without authored checkpoint actions compile this buffer out. Firmware without storage callbacks follows the failure branch and remains playable.

The bundled STM32H7S78-DK builder now installs a two-sector persistent checkpoint
backend automatically. Rest lamps and Continue use the same actions as desktop
playtests. No SD card is required. See [DK checkpoint storage](../ports/stm32h7s78/CHECKPOINTS.md)
for its reserved internal data-flash partition, boot-image guard, atomic commits,
wear policy and integration requirements for custom board builds.
