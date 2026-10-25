import { ChevronRight, Copy, Terminal } from 'lucide-react';
import type { Project, Scene } from '../model';
import { uiIds } from '../ui-api';
import { desktop } from '../desktop';
const sections = [
  {
    title: 'Prefabs',
    items: [
      [
        'ui_prefab_spawn(id, x, y)',
        'Acquire a reserved copy at a world position. Returns a zero handle when full. No runtime allocation.',
      ],
      [
        'ui_prefab_node(handle, childPath)',
        'Find a child relative to the prefab source, or pass NULL for its root. Stale handles return NULL.',
      ],
      [
        'ui_prefab_despawn(handle)',
        'Retire the copy; cancel scripts, clear contacts/projectiles/attacks, and make its slot reusable.',
      ],
    ],
  },
  {
    title: 'Gameplay & saves',
    items: [
      [
        'ui_state_get(key,&value)',
        'Read a bounded session value: flags, health, currency or item stack.',
      ],
      [
        'ui_state_set(key,value) / ui_state_add(key,delta)',
        'Assign or saturating-add without integer overflow.',
      ],
      [
        'ui_node_state_get(node,key,&value)',
        'Read through an instance’s authored state remaps; set/add variants also exist.',
      ],
      [
        'ui_script_start(id,owner)',
        'Run a reusable event script with a node context; false if busy/full/unknown.',
      ],
      [
        'ui_dialogue_text() / ui_dialogue_choose(index)',
        'Read the complete wrapped page; confirm first reveals unfinished text, then advances or chooses an answer.',
      ],
      [
        'ui_dialogue_revealing() / ui_dialogue_visible_bytes()',
        'Check typing and read the visible UTF-8 prefix length without allocating another page buffer.',
      ],
      [
        'ui_request_scene_at(id,x,y)',
        'Defer a room change and place its player in world pixels before START.',
      ],
      [
        'ui_save_size() / ui_save_write(buffer,size)',
        'Produce a small versioned, checksummed state packet for your board storage.',
      ],
      [
        'ui_save_read(buffer,size)',
        'Validate identity/schema/checksum/bounds before applying any saved values.',
      ],
    ],
  },
  {
    title: 'Lifecycle',
    items: [
      ['ui_init()', 'Start the authored Game entry on the active screen.'],
      ['ui_deinit()', 'Release objects, timer and audio voices.'],
    ],
  },
  {
    title: 'Scenes & sequences',
    items: [
      ['ui_request_scene(id)', 'Queue a scene safely from any hook.'],
      ['ui_sequence_start(id)', 'Start a named journey from its first step.'],
      ['ui_sequence_next()', 'Advance once; repeated queued calls return false.'],
      ['ui_sequence_stop()', 'Cancel the sequence and keep the current scene.'],
      ['ui_current_step()', 'Read the stable step ID; NULL outside a sequence.'],
      [
        'ui_input_set_int(channel,value)',
        'Publish ADC/encoder counts; Project → Inputs & controllers.',
      ],
      ['ui_input_set_float(channel,value)', 'Publish a finite measured sensor value.'],
      ['ui_input_set_bool(channel,pressed)', 'Publish a button; short taps are latched.'],
      [
        'ui_input_read_int/float/bool(channel,&out)',
        'Read an active typed channel in a game hook.',
      ],
      ['ui_input_normalized(channel)', 'Calibrated/dead-zone value, -1..1.'],
      ['ui_input_report(device,bytes,size)', 'Publish a configured BLE/HID/binary report.'],
      ['ui_input_serial_feed(&parser,device,bytes,size)', 'Parse fragmented channel=value lines.'],
      ['ui_input_disconnect(device)', 'Release a disconnected controller.'],
      ['ui_set_input(actions)', 'Feed directional input from your board.'],
      ['ui_set_paused(paused)', 'Pause game time and audio together.'],
    ],
  },
  {
    title: 'Objects & labels',
    items: [
      ['ui_find_node(id)', 'Get a node in the current scene.'],
      ['ui_node_set_position(id, x, y)', 'Move an object in logical pixels.'],
      ['ui_node_set_local_position(id, x, y)', 'Move relative to its parent; descendants follow.'],
      ['ui_node_parent(id)', 'Get the parent path, or NULL at the scene root.'],
      ['ui_node_set_visible(id, visible)', 'Show or hide an object.'],
      ['ui_label_set_text(id, text)', 'Set a static label; LVGL copies the text.'],
    ],
  },
  {
    title: 'Physics & hitboxes',
    items: [
      ['ui_node_bounds(id, &box)', 'Read the independent world collider rectangle.'],
      ['ui_body_set_velocity(id, vx, vy)', 'Move a code-driven character, pixels/second.'],
      ['ui_body_velocity(id, &vx, &vy)', 'Read actual velocity in pixels/second.'],
      ['ui_node_set_speed(id, speed)', 'Change the built-in controller speed at runtime.'],
      [
        'ui_time_seconds() / ui_delta_seconds()',
        'Scene simulation time and fixed-step delta. The hook dt_seconds is 1/60.',
      ],
      [
        'ui_platform_move(id, vx * dt, vy * dt)',
        'Move a code-driven platform now, carrying riders and stopping before crushing.',
      ],
      ['ui_emitter_set_enabled(id, enabled)', 'Start/stop an authored bullet pattern.'],
      ['ui_projectile_hit()', 'Callback-only swept hit: pattern damage, position and owner.'],
      [
        'ui_rpg_database()',
        'Immutable items, skills, actors/species and weighted encounters. Query with lge_rpg_* helpers.',
      ],
      ['ui_body_jump(id, speed)', 'Jump only when grounded.'],
      ['ui_body_is_on_floor(id)', 'Read the last fixed-step floor contact.'],
      ['ui_area_contains(area, other)', 'Read filtered overlap state.'],
      ['ui_event_other()', 'Other node ID in AREA_ENTER / AREA_EXIT.'],
      ['ui_set_collision_debug(true)', 'Draw colliders using LVGL.'],
    ],
  },
  {
    title: 'Tilemaps',
    items: [
      ['ui_tile_at(id, column, row)', 'Read a stable map-bank value; 0 is empty/outside.'],
      ['ui_tile_is_solid(id, column, row)', 'Query full-cell tile collision, up to 255 types.'],
    ],
  },
  {
    title: 'Audio',
    items: [
      ['ui_audio_play(cue_id)', 'Play a cue; returns a voice token or 0.'],
      ['ui_audio_set_bus(bus, gain)', 'Set a bus gain from 0 to 1.'],
      ['ui_audio_complete(voice)', 'Report completion on the LVGL thread.'],
    ],
  },
];
export function ApiReference({
  project,
  scene,
  onShowHeader,
  onNotify,
}: {
  project: Project;
  scene: Scene;
  onShowHeader: () => void;
  onNotify: (text: string) => void;
}) {
  const definitions = uiIds(project)
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('#define UI_') && scene.nodes.some((n) => line.endsWith(`"${n.id}"`)),
    );
  return (
    <aside className="api-reference">
      <div className="api-reference-title">
        <Terminal size={15} />
        <strong>Public C API</strong>
        <span>ui.h</span>
      </div>
      <p>
        Small functions. Stable IDs.
        <br />
        All calls run on the LVGL thread.
      </p>
      {sections.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map(([name, description]) => (
            <div className="api-function" key={name}>
              <code>{name}</code>
              <small>{description}</small>
            </div>
          ))}
        </section>
      ))}
      <section>
        <h3>IDs in this scene</h3>
        {definitions.slice(-8).map((line) => {
          const [_, name, ,] = line.split(' ');
          return (
            <button
              className="api-id"
              key={name}
              title="Copy ID"
              onClick={() => {
                void (desktop ? desktop.copyText(name) : navigator.clipboard.writeText(name)).then(
                  () => onNotify(`Copied ${name}`),
                );
              }}
            >
              <code>{name}</code>
              <Copy size={11} />
            </button>
          );
        })}
      </section>
      <button className="api-full-header" onClick={onShowHeader}>
        Read the full header <ChevronRight size={13} />
      </button>
      <div className="api-contract">
        Native LVGL compiles and runs your C here. Play uses the fast built-in preview.
      </div>
    </aside>
  );
}
