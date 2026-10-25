# Optional touchscreen controls

Open **Project settings → Touchscreen controls**, or clear the object selection and use **Inspector → Scene settings → Touchscreen controls**. The option belongs to the active scene, so title screens and gameplay scenes can choose independently. It is enabled in the built-in **STM32H7S78-DK Adventure**.

Enabling it in a scene without mapped buttons creates an editable **Touch controls** group with four arrows, Action and Talk. Layout fits the current display; the preset needs at least 128 × 96. A platformer labels Action as Jump; small displays use compact A/B labels. Select a button in Hierarchy to move, resize, recolor or rename it, or change **Inspector → Controller input**. Positions remain authored when the display size changes. Save the group as a scene to share it across levels. Existing mapped buttons, including linked scene instances, are reused.

Hold an arrow to move. Slide onto another arrow to change direction without lifting. Crossing a gap stops movement until another arrow is reached; release, canceled input, pause and scene changes clear holds. Action jumps or starts configured player melee; Talk triggers the normal interaction/dialogue input. Disabling the option hides mapped controller buttons while preserving each button's authored visibility, layout and action for re-enabling. Ordinary UI buttons remain visible.

The fast preview, Native LVGL and firmware export use the same action mappings. Keyboard/physical input and touch have independent ownership, so releasing one does not cancel the other. Native LVGL tests inject a real pointer driver and exercise held movement, sliding through gaps, release outside controls, hidden-button release, camera scrolling and sword taps. These are host tests, not physical display tests.

## Firmware integration

Set up an LVGL pointer input device in your display port, with touch coordinates in display pixels. No engine-specific touchscreen HAL is needed. The DK build already initializes the reference board touch driver. Its driver reports one pointer: move with the D-pad, then lift and press Sword/Talk. Preview pointer ownership can support multiple fingers when the host provides them; the DK reference driver does not provide simultaneous move-and-attack touches.

You can add hardware keys later using the existing API:

```c
/* Poll only physical keys. Use zero when no physical key is held. */
ui_set_input(physical_actions); /* UI_INPUT_LEFT | UI_INPUT_ACTION, etc. */

/* Game hooks can read the merged physical/touch state. */
void game_on_update(lge_engine_t *game, float dt, void *user) {
    (void)dt; (void)user;
    if (lge_input(game) & LGE_INPUT_RIGHT) { /* custom behavior */ }
}
```

Built-in player controllers already consume these actions; custom movement code is optional. Short action taps are latched until a fixed simulation step. LVGL callbacks and game updates must run on the same LVGL thread.

## MCU costs

The preset adds seven normal nodes (one logical group and six buttons) against the existing 128-node scene limit. The group has no LVGL widget; buttons have their usual object/label costs. The editor checks the expanded node budget before inserting the preset. Disabling hides the buttons; it retains their nodes and widgets so authored layouts remain available. Delete the group to reclaim those slots. No additional framebuffer, per-frame heap allocation or separate touch task is introduced in the portable runtime. Repeated LVGL pressing events recompute the merged mask only when the held-button set changes.
