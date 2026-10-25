#ifndef LGE_H
#define LGE_H
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include "lge_config.h"
#ifdef __cplusplus
extern "C" {
#endif

#ifndef LGE_MAX_NODES
#define LGE_MAX_NODES 128
#endif
#if LGE_MAX_NODES < 1 || LGE_MAX_NODES > 128
#error "LGE_MAX_NODES must be in 1..128"
#endif
#define LGE_NODE_CONTACT_BYTES ((LGE_MAX_NODES + 7) / 8)
#define LGE_MAX_VOICES 8
#define LGE_FIXED_SECONDS (1.0f / 60.0f)
typedef enum {
    LGE_RECT,
    LGE_SPRITE,
    LGE_LABEL,
    LGE_BUTTON,
    LGE_TILEMAP,
    LGE_GROUP,
    LGE_INSTANCE,
    LGE_AREA
} lge_kind_t;
typedef enum { LGE_BIND_NONE, LGE_BIND_SCORE, LGE_BIND_STATUS } lge_binding_t;
typedef enum {
    LGE_EVENT_START,
    LGE_EVENT_COLLECT,
    LGE_EVENT_COMPLETE,
    LGE_EVENT_CLICK,
    LGE_EVENT_EXIT,
    LGE_EVENT_AREA_ENTER,
    LGE_EVENT_AREA_EXIT,
    LGE_EVENT_PROJECTILE_HIT,
    LGE_EVENT_SPAWN,  /* Each member after the reserved branch has been reset. */
    LGE_EVENT_DESPAWN /* Each member before retirement; cancel owner-bound work. */
} lge_event_t;
#define LGE_EVENT_HIT LGE_EVENT_PROJECTILE_HIT /* Generic hit; query projectile/melee metadata. */
typedef enum {
    LGE_BODY_NONE,
    LGE_BODY_STATIC,
    LGE_BODY_CHARACTER,
    LGE_BODY_AREA,
    LGE_BODY_PLATFORM
} lge_body_type_t;
typedef enum {
    LGE_MOTION_TOPDOWN,
    LGE_MOTION_PLATFORMER,
    LGE_MOTION_CODE,
    LGE_MOTION_GRID
} lge_motion_t;
enum {
    LGE_LAYER_WORLD = 1,
    LGE_LAYER_PLAYER = 2,
    LGE_LAYER_ENEMY = 4,
    LGE_LAYER_HITBOX = 8,
    LGE_LAYER_HURTBOX = 16,
    LGE_LAYER_PICKUP = 32,
    LGE_LAYER_TRIGGER = 64,
    LGE_LAYER_CUSTOM = 128
};
typedef enum { LGE_SLOPE_BOX, LGE_SLOPE_UP, LGE_SLOPE_DOWN } lge_slope_t;
typedef struct {
    float x, y, width, height;
} lge_box_t;
typedef struct {
    lge_body_type_t body;
    lge_motion_t motion;
    lge_box_t box; /* Local offset and size; width=height=0 follows visual bounds. */
    uint8_t layer, mask;
    float gravity, jump_speed, velocity_x, velocity_y;
    bool world_bounds;
    uint8_t grid_size;
    bool one_way;
    float coyote_ms, buffer_ms;
    lge_slope_t slope; /* 0=box, 1=rises right, 2=falls right. Floor-only ramps. */
    float travel_x, travel_y, travel_seconds; /* Relative ping-pong endpoint; 0=code. */
} lge_physics_def_t;
enum {
    LGE_INPUT_LEFT = 1,
    LGE_INPUT_RIGHT = 2,
    LGE_INPUT_UP = 4,
    LGE_INPUT_DOWN = 8,
    LGE_INPUT_ACTION = 16,
    LGE_INPUT_MENU = 64,
    LGE_INPUT_INTERACT = 32
};
typedef enum { LGE_BUS_SFX, LGE_BUS_MUSIC, LGE_BUS_UI, LGE_BUS_COUNT } lge_bus_t;
typedef struct {
    const char *id, *uri; /* URI is resolved by the board, never opened by the engine. */
    uint32_t sample_rate;
    uint8_t channels;
    lge_bus_t bus;
    float gain;
    bool loop;
    uint8_t priority;
} lge_cue_t;
/* All callbacks must return promptly. Decode/mix/DMA in the board's audio worker. */
typedef struct {
    void *context;
    bool (*play)(void *, uint32_t voice, const lge_cue_t *, float gain);
    void (*stop)(void *, uint32_t voice);
    void (*pause)(void *, bool paused);
    void (*set_gain)(void *, uint32_t voice, float gain);
} lge_audio_backend_t;
typedef struct {
    const void *const *frames;
    uint8_t count, fps;
} lge_tile_animation_t;
typedef struct {
    uint16_t tile_size, columns, rows, tile_count;
    const void *const *tiles;
    const uint16_t *runs; /* count,value pairs, value 0 is empty. */
    const uint8_t *cells; /* RAW8 fallback for maps where RLE would grow. */
    uint32_t run_count, solid_mask;
    const uint8_t
        *solid_bits; /* Optional ceil(tile_count/8) bytes; NULL uses legacy 32-bit mask. */
    const lge_tile_animation_t *const *animations; /* Optional tile_count flash pointers. */
    const uint8_t *slopes;    /* Optional tile_count bytes, 0=box, 1=up, 2=down. */
    const uint32_t *run_seek; /* Optional cumulative cell offset at runs 0,16,32,... in flash. */
    const void *const *row_strips; /* Optional tile_count native-pixel repeated images in flash. */
    bool opaque; /* Export-verified: no holes, every used tile/animation frame fully opaque. */
} lge_tilemap_t;
/* Caller-owned sequential cursor: O(1) RAM; safe to interleave maps/engine instances.
 * Authored maps are immutable. Legacy RLE without an index remains supported. */
typedef struct {
    const lge_tilemap_t *map;
    uint32_t run, start, end;
} lge_tile_cursor_t;
uint16_t lge_tile_cursor_at(lge_tile_cursor_t *, const lge_tilemap_t *, int column, int row);
const void *lge_tile_image(const lge_tilemap_t *, uint16_t value, uint32_t scene_ticks);
uint16_t lge_tile_at(const lge_tilemap_t *, int column, int row);
bool lge_tile_is_solid(const lge_tilemap_t *, uint16_t tile_value);
typedef struct {
    const void *const *frames;
    uint8_t count, fps;
    bool loop;
} lge_animation_clip_t;
typedef struct {
    const lge_animation_clip_t *idle, *move, *jump, *fall;
    const lge_animation_clip_t *attack, *attack_up, *attack_down, *attack_left, *attack_right;
    const lge_animation_clip_t *idle_up, *move_up, *idle_down, *move_down, *idle_left, *move_left,
        *idle_right, *move_right;
} lge_animator_def_t;
typedef struct {
    const char *id, *name;
    lge_kind_t kind;
    float x, y;
    uint16_t width, height;
    uint32_t color;
    uint8_t radius;
    const char *text;
    const void *image;
    bool visible, solid, player, collectible;
    float speed;
    lge_binding_t binding;
    const lge_cue_t *cue;
    const lge_tilemap_t *tilemap;
    uint16_t parent; /* Parent index + 1; 0 is scene root. Parents precede children. */
    bool ui_layer;
    uint8_t input_action;
    const lge_physics_def_t *physics; /* NULL preserves v0.1 player/solid/collectible behavior. */
    const struct lge_event_page *event_pages;
    uint8_t event_count;
    const lge_animator_def_t *animator;
    int8_t z_index;
    bool sort_y;
    const struct lge_state_binding *state_bindings;
    uint8_t state_binding_count;
    const struct lge_pattern *pattern;
    bool emitter_autoplay;
    const struct lge_melee_def *melee;
    const char *prefab; /* Non-NULL only on reserved instance roots; source resource ID. */
} lge_node_def_t;
typedef struct {
    uint16_t world_width, world_height, follow; /* follow = resolved node index + 1. */
    bool follow_y;
} lge_camera2d_def_t;
typedef struct {
    const char *id, *name;
    uint16_t width, height;
    uint32_t background;
    const char *objective, *completion;
    const lge_node_def_t *nodes;
    uint16_t count;
    const lge_cue_t *music;
    const lge_camera2d_def_t *camera2d;
    uint8_t projectile_capacity; /* 0 uses 64; pool allocated only for emitter scenes. */
} lge_scene_def_t;
typedef struct lge_engine lge_engine_t;
typedef struct {
    const lge_node_def_t *definition;
    lge_engine_t *owner;
    float x, y;
    bool visible;
    bool effective_visible;         /* Own visibility AND all ancestors. */
    float hierarchy_x, hierarchy_y; /* Last synchronized world position. */
    float speed;                    /* Mutable controller speed, definition stays in flash. */
    float platform_phase, platform_offset_x, platform_offset_y;
    float velocity_x, velocity_y; /* Pixels/second, bounded to +/-1200. */
    bool on_floor, on_wall, on_ceiling;
    const void *image;
    const lge_animation_clip_t *animation;
    float animation_time;
    float grid_x, grid_y, coyote_ms, buffer_ms;
    bool grid_active;
    uint8_t facing;
    float emitter_time, emitter_angle;
    bool emitter_enabled;
    bool active; /* Separate from visibility: hidden slots cannot be reactivated by scripts. */
    bool collectible_counted, collected;
    uint32_t generation; /* Nonzero only during a live prefab acquisition. */
} lge_node_t;
typedef struct {
    uint32_t generation;
    uint16_t index;
} lge_prefab_handle_t;
typedef void (*lge_event_cb)(lge_engine_t *, lge_event_t, lge_node_t *, void *);
typedef void (*lge_update_cb)(lge_engine_t *, float fixed_seconds, void *);
typedef struct {
    uint32_t handle;
    const lge_cue_t *cue;
} lge_voice_t;
struct lge_engine {
    const lge_scene_def_t *scene;
    lge_node_t nodes[LGE_MAX_NODES];
    lge_audio_backend_t audio;
    lge_voice_t voices[LGE_MAX_VOICES];
    uint32_t next_voice;
    float bus_gain[LGE_BUS_COUNT], master_gain, accumulator;
    uint16_t score, total;
    uint8_t input, virtual_input, controller_input, override_mask;
    float controller_x, controller_y;
    bool input_overridden;
    uint32_t held_buttons[4];
    uint8_t previous_input;
    uint8_t pressed_input, step_input, step_pressed;
    bool stepping;
    struct lge_melee *melee;
    struct lge_projectiles *projectiles;         /* Optional caller-owned pool. */
    const struct lge_projectile *projectile_hit; /* Internal callback-scoped payload. */
    uint32_t ticks; /* Scene-local simulation ticks; freezes while paused. */
    uint8_t area_contacts[LGE_MAX_NODES][LGE_NODE_CONTACT_BYTES]; /* Bounded bitsets, no heap. */
    lge_node_t *event_other; /* Valid only during AREA_ENTER/EXIT callbacks. */
    bool paused, complete;
    bool simulation_blocked; /* Modal event scripts freeze physics, never the VM clock. */
    bool camera_override;
    float camera_x, camera_y;
    bool prefab_mutating; /* Lifecycle callbacks cannot recursively acquire/retire slots. */
    lge_event_cb on_event;
    lge_update_cb on_update;
    void *user;
};
/* Zero-initialize once; destroy before releasing the instance. No gameplay heap. */
void lge_init(lge_engine_t *, const lge_audio_backend_t *, lge_event_cb, void *user);
bool lge_scene_valid(const lge_scene_def_t *);
bool lge_load(lge_engine_t *, const lge_scene_def_t *);
void lge_destroy(lge_engine_t *);
void lge_update(lge_engine_t *, uint32_t elapsed_ms);
void lge_set_input(lge_engine_t *, uint8_t mask);
/* Owner-thread persistent controller state; presses latched separately. +Y is up. */
void lge_set_controller_input(lge_engine_t *, uint8_t mask, uint8_t pressed, float x, float y);
void lge_move_input(const lge_engine_t *, float *x, float *y);
/* Owner-thread temporary automation input; release clears held input and edges. */
void lge_override_input(lge_engine_t *, bool enabled, uint8_t mask);
/* Touch buttons combine with physical keys, preserving taps between fixed steps. */
void lge_button_input(lge_node_t *, bool held);
uint8_t lge_input(const lge_engine_t *);
uint8_t lge_input_pressed(const lge_engine_t *);
void lge_pause(lge_engine_t *, bool paused);
void lge_click(lge_node_t *);
lge_node_t *lge_find(lge_engine_t *, const char *id);
lge_node_t *lge_node_parent(lge_node_t *);
void lge_sync_hierarchy(lge_engine_t *);
/* Drawing offset only; physics and API coordinates always stay in world space. */
bool lge_camera_position(const lge_engine_t *, float *x, float *y);
bool lge_node_set_position(lge_node_t *, float world_x, float world_y);
bool lge_node_set_local_position(lge_node_t *, float local_x, float local_y);
void lge_node_set_visible(lge_node_t *, bool visible);
/* Bounded pools are authored in the editor and created once with the scene.
 * No heap allocation during spawn/despawn. Zero handle means full/missing pool.
 * Handles expire on despawn or scene change; never retain raw node pointers across either. */
lge_prefab_handle_t lge_prefab_spawn(lge_engine_t *, const char *source, float world_x,
                                     float world_y);
lge_node_t *lge_prefab_node(lge_engine_t *, lge_prefab_handle_t, const char *child_path);
bool lge_prefab_despawn(lge_engine_t *, lge_prefab_handle_t);
/* Physics uses independent, axis-aligned rectangle bounds. Queries use world pixels. */
lge_body_type_t lge_body_type(const lge_node_t *);
lge_box_t lge_node_bounds(const lge_node_t *);
bool lge_nodes_overlap(const lge_node_t *, const lge_node_t *);
bool lge_body_set_velocity(lge_node_t *, float x_pixels_per_second, float y_pixels_per_second);
bool lge_body_velocity(const lge_node_t *, float *x, float *y);
bool lge_node_set_speed(lge_node_t *, float pixels_per_second);
float lge_time_seconds(const lge_engine_t *);
float lge_delta_seconds(const lge_engine_t *); /* Fixed dt in an update callback, 0 outside. */
/* Kinematic displacement, max 20px/axis/call. Carries riders and stops before crushing.
 * Position setters are teleports and deliberately do not carry passengers. */
bool lge_platform_move(lge_node_t *, float dx, float dy);
bool lge_body_jump(lge_node_t *, float speed); /* Only grounded characters; positive speed. */
bool lge_area_contains(const lge_node_t *area, const lge_node_t *other); /* Last physics sample. */
/* Internal fixed-step entry points, independent of LVGL. */
bool lge_physics_valid(const lge_node_def_t *);
void lge_physics_step(lge_engine_t *);
uint32_t lge_audio_play(lge_engine_t *, const lge_cue_t *);
void lge_audio_stop(lge_engine_t *, uint32_t handle);
void lge_audio_stop_all(lge_engine_t *);
/* Completion must be marshalled from the audio worker onto the LVGL thread. */
void lge_audio_complete(lge_engine_t *, uint32_t handle);
void lge_audio_set_bus(lge_engine_t *, lge_bus_t, float gain);
void lge_audio_set_master(lge_engine_t *, float gain);
#ifdef __cplusplus
}
#endif
#endif
