/* Exercise the actual reference board's LVGL heap budget in the host harness. */
#include "../lvgl/lv_conf.h"
#undef LV_MEM_SIZE
#define LV_MEM_SIZE (300 * 1024)
#if LGE_TEST_STYLE_CACHE
#undef LV_OBJ_STYLE_CACHE
#define LV_OBJ_STYLE_CACHE 1
#endif
