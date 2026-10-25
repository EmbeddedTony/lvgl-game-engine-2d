# Party, battles and inventory

Open **Help → Open RPG Battle Lab** for an editable game with two party members, two enemy species, a weighted encounter table, recovery items, poison, regeneration, stun, an attack buff, a rest event and animated water. Both Play and Native LVGL use the authored databases. P opens the party inventory; arrows select and E / Enter confirms. Buttons also support mouse/touch.

## Authoring a battle

1. In **Gameplay → RPG database**, create actors, set HP/MP, attack/defense/speed and per-level growth. Assign up to eight known skills. Enemy XP and gold are rewards.
2. Define skills with damage/healing, MP cost, accuracy and an enemy/ally/self/all target. Optional status effects reference **Party & battle** definitions. Create items and link each usable item to a saved inventory stack in **State & items**. An unlinked item is application-owned and cannot be consumed by the built-in controller.
3. In **Party & battle**, enable the party and select one to four starting actors and levels. Set starting gold, a deterministic nonzero seed and whether escape is permitted. Actor definitions can be shared; every member has independent HP, MP, XP and statuses.
4. Create an encounter table, choose one to four enemies and add weighted actor entries/level ranges. Each enemy is sampled independently; repeated species are supported.
5. Add a **Battle** action to a script. Choose the table and victory/defeat/escape destination steps, then attach the script to a button, interaction or area event. The action waits for battle acknowledgement. A blank destination continues to the next step. A **Rest party** action restores HP/MP and clears statuses.

The built-in rules intentionally stay small: stable speed initiative each round; attack/skill/item/guard/escape; simple enemy AI; XP shared between surviving members; linear level growth capped at level 100; capped HP/MP/stats and gold. Guard halves incoming damage until the actor's next activation. Healing skills target living actors; revive items target defeated party members. Items are consumed only when they change HP, MP or a status. Battles freeze world physics, while event scripts and update hooks continue.

Poison/regen apply their percentage of maximum HP at the affected actor's turn end. Stun skips an activation. Attack/defense buffs and slow modify the corresponding stat by a percentage. A reapplied status refreshes its duration; the same definition does not stack. Self-applied statuses start counting down on the next activation. Durations survive battle results and rooms; they advance during battles, not world walking. Defeat retains the party and inventory so your loss branch can rest, warp or implement other consequences. Victory rewards are committed once.

## C integration

The default `ui/` facade owns one optional battle context. `ui_rpg()` returns NULL when no party was authored. Portable applications may instead provide static `lge_rpg_t` storage and call `lge_rpg_init` with the generated immutable database/party definition and their story context.

```c
lge_rpg_t *party = ui_rpg();
const lge_party_member_t *arin = lge_party_member(party, 0);
int32_t potions = lge_inventory_count(party, UI_ITEM_POTION);
(void)arin; (void)potions;

/* Call outside another modal interaction. */
ui_battle_start(UI_ENCOUNTER_WOODS);
/* Valid only on the active party member's turn. 0–3 allies; 4–7 enemies. */
ui_battle_command(LGE_RPG_SKILL, UI_SKILL_SPARK_BURST, 4);
/* Acknowledge victory/defeat/escape after showing the result. */
lge_battle_acknowledge(party);
```

Use `lge_party_add/remove/rest/use_item` for recruitment, roster changes and recovery. Fixed slots prevent growth beyond four members. The automatic menu and a custom C controller share commands; do not issue competing commands from both. Engine APIs run on the LVGL/game thread. Use normal `lge_audio_play`/board audio adapter for custom battle sounds; combat contains no hardware audio dependency.

## Saves and MCU costs

`ui_save_size/write/read` serialize inventory/story state and the enabled party. Supply an exact-size caller buffer; the board owns file/flash access, atomic storage and wear policy. Preview **Session state → Save/Restore checkpoint** uses the same bytes in memory until Stop. Room positions and live script stacks are not saved. Save between battles; active battles return size 0 and reject writes/restores. Restore outside blocking interactions.

Party projects use an LGR2 little-endian envelope around the existing LGS1 story packet: 20 bytes framing/checksum + story packet + 12 bytes gold/RNG/member count + 28 bytes/member. Each member stores actor index, level, HP/MP, XP and sixteen status durations. Length, schemas, checksum and every field are checked before mutation. Mechanical database changes invalidate old packets; display-name changes do not. Projects without parties retain byte-identical LGS1 saves.

Maximums: four allies, four enemies, sixteen statuses, eight visible menu options, four 96-byte log lines. Automatic enemy/skip advancement yields after 32 activations per tick. All mutable battle data is fixed storage; no per-turn heap, runtime JSON, recursive AI or unbounded queue. On the tested arm64 ABI, `lge_rpg_t` is 712 bytes; measure `sizeof` with your MCU compiler. Menu building uses bounded stack scratch; LVGL allocates widgets when a menu opens and reuses them across turns, deleting them when it closes. Target guidance reserves 4 KiB as a context/stack allowance plus menu widgets; framebuffer, decoder and application reservations are separate. Ordinary MCU advice remains off on host/Linux.

Equipment, elemental/type charts, shops, animation choreography and specialized battle rules are extension points, not built-in mechanics. Save/checksum APIs provide corruption detection, not authentication or version migration.
