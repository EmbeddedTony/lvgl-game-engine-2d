#ifndef LGE_LVGL_COMPAT_H
#define LGE_LVGL_COMPAT_H
#include "lvgl.h"
/* Keep version-specific LVGL object policy in one adapter boundary. */
static inline void lge_lvgl_set_hidden(lv_obj_t *object, bool value) {
#if LVGL_VERSION_MINOR >= 6
    lv_obj_set_hidden(object, value);
#else
    lv_obj_set_flag(object, LV_OBJ_FLAG_HIDDEN, value);
#endif
}
static inline void lge_lvgl_set_scrollable(lv_obj_t *object, bool value) {
#if LVGL_VERSION_MINOR >= 6
    lv_obj_set_scrollable(object, value);
#else
    lv_obj_set_flag(object, LV_OBJ_FLAG_SCROLLABLE, value);
#endif
}
static inline void lge_lvgl_set_clickable(lv_obj_t *object, bool value) {
#if LVGL_VERSION_MINOR >= 6
    lv_obj_set_clickable(object, value);
#else
    lv_obj_set_flag(object, LV_OBJ_FLAG_CLICKABLE, value);
#endif
}
static inline void lge_lvgl_set_press_lock(lv_obj_t *object, bool value) {
#if LVGL_VERSION_MINOR >= 6
    lv_obj_set_press_lock(object, value);
#else
    lv_obj_set_flag(object, LV_OBJ_FLAG_PRESS_LOCK, value);
#endif
}
#endif
