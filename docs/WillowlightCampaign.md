# Willowlight: The Names We Leave

The private campaign project is generated at `.local-examples/Willowlight-TheNamesWeLeave/Willowlight-TheNamesWeLeave.lge.json`. Open it in the standalone editor and press Play or Native LVGL. Choose **New Journey**. **Continue** loads the latest automatic or rest-lamp checkpoint in that preview’s own save slot.

The original `WillowlightH7-PackVillage` project remains unchanged. The current DK
campaign includes NeoChrom, native 800 × 480 artwork and persistent checkpoints.
On October 20, 2026, the application and preserved sector tail passed independent
byte-for-byte readback. After the user saved, removed power and successfully used
Continue, an independent flash read confirmed a valid 492-byte checkpoint and an
unchanged 48 KiB protected boot region. Only the reserved internal data sectors
changed; the bootloader and 26 checked option-byte fields were preserved. Backups
and verification logs are in `.local-examples/device-flash/checkpoints-20261020-192512/`.

Native Mac playtests and updated DK builds support persistent checkpoints. On the
DK, a REST / SAVE lamp commits the checkpoint to a two-sector journal in reserved
internal data flash; Continue reloads it after restart. The working bootloader is
outside that partition. See [DK checkpoint storage](../ports/stm32h7s78/CHECKPOINTS.md)
for the layout, recovery rules and tests. Automatic checkpoints cover major story
milestones; a rest lamp also saves progress between those milestones.

## Autosave policy

The opening, each witness testimony, completion of each chapter's three-record
collection, opening each bell seal, all eight town-story turn-ins, all six chapter
resolutions and the epilogue commit a checkpoint. This is **34 automatic commits**
for a complete first run. Saves include all persistent quest state and earned
rewards. Chapter resolutions commit the next settlement before warping; completed
campaigns Continue directly at the shore. Skipping a cutscene still runs its
completion and save actions. Normal saves are quiet; a failed autosave displays a
message and leaves the previous committed checkpoint available.

A small notice below the HUD now shows **Saving… / Keep power on**, then **Saved /
Safe to power off** after the checkpoint commit has completed. Success remains
visible for three seconds across chapter transitions; failures show **Not saved**.
This is feedback on the last committed checkpoint, not a guarantee that gameplay
changes made afterward have also been saved. It does not add saves or flash wear.

These are explicit actions in the editor's event/cutscene resources, compiled by
one `autosave()` helper in `campaign.ts`. There is no timer or per-frame save hook.
Existing one-time progress guards bypass the save on repeat conversations, record
reads and solved puzzles, even when unrelated state has changed. Individual hits,
movement, quest acceptance and ordinary road travel do not write. Later arrival
cutscenes do not immediately resave a chapter transition; a cold load may replay
that arrival. Rest lamps remain available for additional manual saves and healing.
Automatic saves preserve current health and tonics rather than granting a refill.

The autosave update was flashed on October 20, 2026 with NeoChrom enabled. An
independent application readback matched, all 64 KiB internal flash (bootloader
and existing checkpoint included) remained identical, and 26 option-byte fields
were unchanged before resetting into the game. Backups and verification are in
`.local-examples/device-flash/autosave-20261020-195417/`. The physical power-cycle
test above established the storage backend; this update's autosave paths were
tested in the exported C VM/journal and full campaign route audit.

The 492-byte save format/schema is unchanged, including the range of
`checkpoint_room`, so earlier DK checkpoints remain compatible. The existing
16 KiB journal fits 15 records per sector, appends without erasing per save, rotates
only when necessary and skips identical packets. No extra save buffer, persistent
field or journal metadata allocation was added.

## Playing

- Arrows/WASD or touch arrows move. SPACE/SWORD attacks. E/Enter/TALK interacts.
- One confirmation reveals a dialogue page; the next advances or confirms the selected choice. Up/down selects choices, and they are also clickable.
- Rest lamps restore health, refill tonics and save. TONIC restores three health. Defeated wards leave another tonic. A hit grants a short grace period; losing all health returns to the chapter settlement without deleting quest progress.
- JOURNAL gives the chapter objective, route and combat help. TOWN STORIES shows optional story progress and the person to return to.
- Follow physical east/west road signs. Each area beyond a settlement has a marked witness record. Speak to the named witness in the first area, then use the chapter’s three-bell clue to open its preservation ward. Release its three knots with your sword and inspect the chapter record.
- SAFE RETURN goes to the current chapter’s settlement. Completing Rowan’s optional story opens ROUTES between settlements already reached.
- After dawn, the shore road in Road Above the Clouds returns to the epilogue waterfront. Optional town stories remain available.

## Scope and playtime

The campaign has six chapters, 24 gameplay areas, a title scene and a separate epilogue, eight optional stories, six preservation encounters, ordinary patrol encounters, companion conversations, three dawn procedures and a continuing mystery. Its art comes from the supplied Country Woods, Modern+ and layered character packs. Water uses the imported animated terrain. Tall canopies, houses, station furnishings, crop rows, terminal courtyards and waterfront crossings retain the source pixels.

The design target is **2–4 hours for a first playthrough including exploration and optional stories**. That is a target, not a measured completion time. The generated report deliberately leaves human completion time null. Reading speed, familiarity, difficulty and how many optional stories are explored materially change the length. The deterministic route audit is fast because it directly drives authored events; it is not evidence of human playtime or combat balance.

Suggested playtest budget:

| Content | First-play target |
| --- | --- |
| Six chapters: dialogue, records, exploration, puzzles and combat | 90–150 minutes |
| Eight optional town stories and companion conversations | 35–75 minutes |
| Revisits, route finding and recovery | 5–15 minutes |

Before advertising a measured length, run complete human playtests and adjust meaningful encounters, discoveries and conversations. Do not stretch waits, walking speed or repeated encounters to meet a duration claim.

## Authoring and architecture

`src/examples/willowlight/story.ts` owns original writing and stable chapter/quest IDs. `world.ts` owns region layouts, native-pixel scenery and interaction approaches. `campaign.ts` compiles those definitions into ordinary scenes, state fields, event scripts and RPG item records. No private campaign logic is hidden in a native-only hook.

The cutscene maker edits the resulting resources directly. Chapter folders keep the scene list manageable. Each loaded area stays within the normal node budget; images/animation clips are shared across areas. The campaign uses a 48-projectile pool, small prescribed ward patrols, integer health/quest state, compressed maps, immutable command tables and precomposed layered animation frames. It does not stream every area into RAM.

The generator imports four additional layered outfits, alongside the existing protagonist, alchemist and cloaked traveller. Shared clips keep the campaign within the 64-clip limit. Physical footprints stay independent of tall visual bounds. Artwork is not downsampled to improve performance.

The authoring catalogs were expanded to support a longer campaign, while loaded node count, concurrent coroutines, projectile capacity and animation limits remain bounded. See [Cutscenes.md](Cutscenes.md) for track ownership, skip safety and firmware storage integration.

## Rebuild and verify

The generator reads the user’s licensed packs from Downloads and the existing pack-village project. It writes a separate campaign and provenance report; it never programs hardware. Keep paid art private and retain its original licenses.

```sh
npx tsx scripts/create-willowlight-campaign.ts
npx tsx scripts/test-willowlight.ts
npx tsx scripts/export-starter.ts .cache/autosave-generated .local-examples/Willowlight-TheNamesWeLeave/Willowlight-TheNamesWeLeave.lge.json
npm run test:campaign:native
npm test
npm run test:runtime
npx playwright test tests/ui/cutscenes.spec.ts tests/ui/gameplay.spec.ts
```

`campaign-report.json` records content counts, source/project hashes and the unmeasured duration target. `.cache/willowlight-route-audit.json` records chapter/quest/ending/save checks and interaction access. The route audit verifies all 34 automatic commits, cold Continue routing, repeat suppression, failure reporting and skipped-chapter saving. The native C99/UBSan test runs the actual exported campaign actions against the production journal with bounded flash emulation, including a sector rotation and failed-save recovery. `test:campaign:native` requires the exported private campaign and prepared native SDK; it does not program hardware. Native screenshots exercise real generated C/LVGL, rather than only the browser renderer. Native saves are additionally checked across separate game processes.

## Story structure — spoilers

The village’s memory archive began as an act of care and became an authority over the people it preserves. Elian searches for a missing sister, discovers the history of their own reconstruction, and meets the sister as Ada: a person whose life has continued beyond the role he remembers. Mira’s participation in the ward, Sera’s right to change her answer, Noor’s attendance records and Rowan’s slow-growing tree turn the abstract questions into specific relationships.

The chapter progression is: A Place at the Table; The Mercy Ledger; The Child in the Recording; Water Has No Original Shape; A Machine That Learns to Ask; The Right to Have a Tomorrow. Each resolves a local harm and complicates the next question. Optional stories supply independent witnesses for one of the dawn procedures. Other procedures remain available; neither a boundary nor an unwillingness to forgive is treated as a failure state.

The principal arc reaches a chosen dawn and a personal resolution at the shore. A transmission from beyond the known relay system opens a larger mystery without taking back the town’s resolution.
