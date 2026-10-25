#ifndef LGE_RPG_VIEW_H
#define LGE_RPG_VIEW_H
#include "lge_rpg.h"
#include "lge_lvgl_compat.h"
typedef struct {
    lv_obj_t *panel, *launcher, *title, *party, *enemies, *log, *buttons[8], *labels[8];
    lge_rpg_t *session;
    lge_engine_t *game;
    uint32_t revision, state_revision;
} lge_rpg_view_t;
void lge_rpg_view_sync(lge_rpg_view_t *, lge_rpg_t *, lv_obj_t *parent, unsigned width,
                       unsigned height, lge_engine_t *game);
/* Called before the scene's LVGL parent deletes its children. */
void lge_rpg_view_forget(lge_rpg_view_t *);
#endif
