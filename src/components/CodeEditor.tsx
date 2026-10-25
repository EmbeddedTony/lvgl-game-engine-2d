import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion } from '@codemirror/autocomplete';
const api = [
  ['ui_prefab_spawn', 'lge_prefab_handle_t ui_prefab_spawn(const char *id, float x, float y)'],
  [
    'ui_prefab_node',
    'lge_node_t *ui_prefab_node(lge_prefab_handle_t handle, const char *child_path)',
  ],
  ['ui_prefab_despawn', 'bool ui_prefab_despawn(lge_prefab_handle_t handle)'],
  ['ui_init', 'bool ui_init(void)'],
  ['ui_init_with_config', 'bool ui_init_with_config(const ui_config_t *)'],
  ['ui_deinit', 'void ui_deinit(void)'],
  ['ui_state_get', 'bool ui_state_get(const char *key, int32_t *out)'],
  ['ui_state_set', 'bool ui_state_set(const char *key, int32_t value)'],
  ['ui_state_add', 'bool ui_state_add(const char *key, int32_t delta)'],
  ['ui_node_state_get', 'bool ui_node_state_get(const char *node, const char *key, int32_t *out)'],
  ['ui_node_state_set', 'bool ui_node_state_set(const char *node, const char *key, int32_t value)'],
  ['ui_node_state_add', 'bool ui_node_state_add(const char *node, const char *key, int32_t delta)'],
  ['ui_script_start', 'bool ui_script_start(const char *id, const char *owner)'],
  [
    'ui_request_scene_at',
    'bool ui_request_scene_at(const char *id, float player_x, float player_y)',
  ],
  ['ui_dialogue', 'const lge_action_t *ui_dialogue(void)'],
  ['ui_dialogue_text', 'const char *ui_dialogue_text(void)'],
  ['ui_dialogue_choose', 'bool ui_dialogue_choose(unsigned choice)'],
  ['ui_dialogue_revealing', 'bool ui_dialogue_revealing(void)'],
  ['ui_dialogue_visible_bytes', 'size_t ui_dialogue_visible_bytes(void)'],
  ['ui_save_size', 'size_t ui_save_size(void)'],
  ['ui_save_write', 'bool ui_save_write(void *out, size_t exact_size)'],
  ['ui_save_read', 'bool ui_save_read(const void *data, size_t exact_size)'],
  ['ui_request_scene', 'bool ui_request_scene(const char *scene_id)'],
  ['ui_current_scene', 'const char *ui_current_scene(void)'],
  ['ui_sequence_start', 'bool ui_sequence_start(const char *sequence_id)'],
  ['ui_sequence_next', 'bool ui_sequence_next(void)'],
  ['ui_sequence_stop', 'void ui_sequence_stop(void)'],
  ['ui_current_sequence', 'const char *ui_current_sequence(void)'],
  ['ui_current_step', 'const char *ui_current_step(void)'],
  ['ui_find_node', 'lge_node_t *ui_find_node(const char *node_id)'],
  ['ui_find_object', 'lv_obj_t *ui_find_object(const char *node_id)'],
  ['ui_node_set_position', 'bool ui_node_set_position(const char *id, float x, float y)'],
  [
    'ui_node_set_local_position',
    'bool ui_node_set_local_position(const char *id, float x, float y)',
  ],
  ['ui_node_parent', 'const char *ui_node_parent(const char *id)'],
  ['ui_node_set_visible', 'bool ui_node_set_visible(const char *id, bool visible)'],
  ['ui_node_bounds', 'bool ui_node_bounds(const char *id, lge_box_t *out)'],
  ['ui_nodes_overlap', 'bool ui_nodes_overlap(const char *a, const char *b)'],
  ['ui_body_set_velocity', 'bool ui_body_set_velocity(const char *id, float vx, float vy)'],
  ['ui_body_velocity', 'bool ui_body_velocity(const char *id, float *vx, float *vy)'],
  ['ui_node_set_speed', 'bool ui_node_set_speed(const char *id, float speed)'],
  ['ui_node_speed', 'float ui_node_speed(const char *id)'],
  ['ui_time_seconds', 'float ui_time_seconds(void)'],
  ['ui_delta_seconds', 'float ui_delta_seconds(void)'],
  ['ui_platform_move', 'bool ui_platform_move(const char *id, float dx, float dy)'],
  ['ui_emitter_set_enabled', 'bool ui_emitter_set_enabled(const char *id, bool enabled)'],
  ['ui_projectile_hit', 'const lge_projectile_t *ui_projectile_hit(void)'],
  ['ui_projectiles_count', 'unsigned ui_projectiles_count(void)'],
  ['ui_projectiles_dropped', 'uint32_t ui_projectiles_dropped(void)'],
  ['ui_melee_start', 'bool ui_melee_start(const char *id)'],
  ['ui_melee_active', 'bool ui_melee_active(const char *id)'],
  ['ui_melee_hit', 'const lge_melee_hit_t *ui_melee_hit(void)'],
  ['ui_rpg', 'lge_rpg_t *ui_rpg(void)'],
  ['ui_party_open', 'bool ui_party_open(void)'],
  ['ui_party_rest', 'bool ui_party_rest(void)'],
  ['ui_battle_start', 'bool ui_battle_start(const char *encounter)'],
  [
    'ui_battle_command',
    'bool ui_battle_command(lge_battle_action_t action, const char *resource, unsigned target)',
  ],
  ['lge_party_add', 'bool lge_party_add(lge_rpg_t *, const char *actor, unsigned level)'],
  ['lge_party_remove', 'bool lge_party_remove(lge_rpg_t *, unsigned slot)'],
  ['lge_party_use_item', 'bool lge_party_use_item(lge_rpg_t *, const char *item, unsigned target)'],
  ['lge_inventory_count', 'int32_t lge_inventory_count(const lge_rpg_t *, const char *item)'],
  ['lge_battle_acknowledge', 'bool lge_battle_acknowledge(lge_rpg_t *)'],
  ['ui_rpg_database', 'const lge_rpg_database_t *ui_rpg_database(void)'],
  [
    'lge_rpg_item',
    'const lge_rpg_item_t *lge_rpg_item(const lge_rpg_database_t *db, const char *id)',
  ],
  [
    'lge_rpg_actor',
    'const lge_rpg_actor_def_t *lge_rpg_actor(const lge_rpg_database_t *db, const char *id)',
  ],
  [
    'lge_rpg_skill',
    'const lge_rpg_skill_t *lge_rpg_skill(const lge_rpg_database_t *db, const char *id)',
  ],
  [
    'lge_rpg_encounter',
    'const lge_rpg_encounter_t *lge_rpg_encounter(const lge_rpg_database_t *db, const char *id)',
  ],
  [
    'lge_rpg_stats',
    'bool lge_rpg_stats(const lge_rpg_actor_def_t *actor, unsigned level, lge_rpg_stats_t *out)',
  ],
  [
    'lge_rpg_skill_amount',
    'uint16_t lge_rpg_skill_amount(const lge_rpg_skill_t *skill, uint16_t attack, uint16_t defense, uint32_t roll)',
  ],
  [
    'lge_rpg_choose',
    'const char *lge_rpg_choose(const lge_rpg_encounter_t *table, uint32_t roll, uint32_t level_roll, uint8_t *level)',
  ],
  ['ui_body_jump', 'bool ui_body_jump(const char *id, float speed)'],
  ['ui_body_is_on_floor', 'bool ui_body_is_on_floor(const char *id)'],
  ['ui_area_contains', 'bool ui_area_contains(const char *area, const char *other)'],
  ['ui_tile_at', 'uint16_t ui_tile_at(const char *tilemap_id, int column, int row)'],
  ['ui_tile_is_solid', 'bool ui_tile_is_solid(const char *tilemap_id, int column, int row)'],
  ['ui_event_other', 'const char *ui_event_other(void)'],
  ['ui_label_set_text', 'bool ui_label_set_text(const char *id, const char *text)'],
  ['ui_audio_play', 'uint32_t ui_audio_play(const char *cue_id)'],
  ['ui_audio_stop', 'void ui_audio_stop(uint32_t voice)'],
  ['ui_input_set_int', 'bool ui_input_set_int(unsigned channel, int32_t value)'],
  ['ui_input_set_float', 'bool ui_input_set_float(unsigned channel, float value)'],
  ['ui_input_set_bool', 'bool ui_input_set_bool(unsigned channel, bool value)'],
  ['ui_input_read_int', 'bool ui_input_read_int(unsigned channel, int32_t *out)'],
  ['ui_input_read_float', 'bool ui_input_read_float(unsigned channel, float *out)'],
  ['ui_input_read_bool', 'bool ui_input_read_bool(unsigned channel, bool *out)'],
  ['ui_input_normalized', 'float ui_input_normalized(unsigned channel)'],
  ['ui_input_active', 'bool ui_input_active(unsigned channel)'],
  ['ui_input_publish', 'bool ui_input_publish(const lge_input_sample_t *samples, size_t count)'],
  ['ui_input_disconnect', 'bool ui_input_disconnect(unsigned device)'],
  ['ui_input_report', 'bool ui_input_report(unsigned device, const void *bytes, size_t size)'],
  [
    'ui_input_serial_feed',
    'unsigned ui_input_serial_feed(lge_input_serial_t *, unsigned device, const void *bytes, size_t size)',
  ],
  ['ui_set_input', 'void ui_set_input(uint8_t mask)'],
  ['ui_set_paused', 'void ui_set_paused(bool paused)'],
  ['ui_audio_set_bus', 'void ui_audio_set_bus(lge_bus_t bus, float gain)'],
  [
    'ui_camera_position',
    'bool ui_camera_position(float *x, float *y) /* drawing offset; gameplay uses world coordinates */',
  ],
  ['ui_game', 'lge_engine_t *ui_game(void)'],
];
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  label = 'Native C code',
  ids = '',
  revealLine,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  label?: string;
  ids?: string;
  revealLine?: number;
}) {
  const parent = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange),
    symbols = useRef(ids);
  change.current = onChange;
  symbols.current = ids;
  useEffect(() => {
    if (!parent.current) return;
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          cpp(),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.keyword, color: '#c3a9e1' },
              { tag: [tags.typeName, tags.className], color: '#89cbbb' },
              {
                tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
                color: '#b9d69c',
              },
              { tag: tags.variableName, color: '#c5d8ce' },
              { tag: [tags.string, tags.character], color: '#d5c295' },
              { tag: [tags.number, tags.bool], color: '#d6b390' },
              { tag: tags.comment, color: '#829d91' },
              { tag: [tags.operator, tags.punctuation], color: '#9fb6ac' },
              { tag: tags.meta, color: '#9cb7d0' },
            ]),
          ),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({
            'aria-label': label,
            'aria-multiline': 'true',
            role: 'textbox',
          }),
          autocompletion({
            override: [
              (context) => {
                const word = context.matchBefore(/[A-Za-z_][A-Za-z_0-9]*/);
                if (!word || (!context.explicit && !word.text.length)) return null;
                return {
                  from: word.from,
                  options: [
                    ...api.map(([name, detail]) => ({
                      label: name,
                      type: 'function',
                      detail,
                      boost: 5,
                    })),
                    ...[
                      ...symbols.current.matchAll(
                        /\b(UI_(?:CHANNEL|DEVICE)_[A-Z0-9_]+)\s*=\s*(\d+)/g,
                      ),
                    ].map((m) => ({
                      label: m[1],
                      type: 'constant',
                      detail: 'Physical input ID ' + m[2],
                      boost: 4,
                    })),
                    ...[...symbols.current.matchAll(/#define\s+(UI_[A-Z0-9_]+)\s+"([^"]+)"/g)].map(
                      (m) => ({ label: m[1], type: 'constant', detail: m[2], boost: 4 }),
                    ),
                  ],
                };
              },
            ],
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.state.readOnly)
              change.current(update.state.doc.toString());
          }),
          EditorView.theme(
            {
              '&': { height: '100%', background: '#171d24', color: '#c5d8ce', fontSize: '12px' },
              '.cm-scroller': { fontFamily: '"IBM Plex Mono", monospace', lineHeight: '1.85' },
              '.cm-content': { padding: '18px 0', caretColor: '#b5e6c9' },
              '.cm-line': { padding: '0 16px' },
              '.cm-gutters': {
                background: '#171d24',
                color: '#596d6a',
                border: 'none',
                fontSize: '11px',
                minWidth: '45px',
              },
              '.cm-activeLineGutter': { background: '#25332d', color: '#9abca7' },
              '.cm-activeLine': { background: '#b0d7c208' },
              '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
                background: '#476e5c66!important',
              },
              '.cm-tooltip': {
                background: '#27372d',
                color: '#cbdac9',
                border: '1px solid #566e59',
                borderRadius: '5px',
              },
              '.cm-completionIcon': { color: '#91c9a8' },
            },
            { dark: true },
          ),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [readOnly, label]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || revealLine === undefined) return;
    const line = editor.state.doc.line(Math.min(editor.state.doc.lines, Math.max(1, revealLine)));
    editor.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    editor.focus();
  }, [revealLine, readOnly, label]);
  return <div className="native-code-editor" ref={parent} />;
}
