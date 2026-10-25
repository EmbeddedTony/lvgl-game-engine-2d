#include "lge_rpg_view.h"
#include <string.h>
static void click(lv_event_t *e) {
    lge_rpg_view_t *v = lv_event_get_user_data(e);
    if (v->game->paused)
        return;
    lv_obj_t *target = lv_event_get_target(e);
    if (target == v->launcher) {
        if (lge_party_open(v->session))
            v->game->simulation_blocked = true;
        return;
    }
    for (unsigned i = 0; i < 8; ++i)
        if (target == v->buttons[i]) {
            lge_rpg_select(v->session, i);
            v->game->simulation_blocked = lge_story_blocking(v->session->story);
            return;
        }
}
static lv_obj_t *label(lv_obj_t *p, int x, int y, int w) {
    lv_obj_t *o = lv_label_create(p);
    lv_obj_set_pos(o, x, y);
    lv_obj_set_width(o, w);
    lv_obj_set_style_text_color(o, lv_color_hex(0xdce7ee), 0);
    lv_obj_set_style_text_font(o, &lv_font_montserrat_14, 0);
    return o;
}
void lge_rpg_view_forget(lge_rpg_view_t *v) {
    memset(v, 0, sizeof(*v));
}
void lge_rpg_view_sync(lge_rpg_view_t *v, lge_rpg_t *r, lv_obj_t *parent, unsigned w, unsigned h,
                       lge_engine_t *game) {
    if (!r || !parent)
        return;
    v->session = r;
    v->game = game;
    if (!v->launcher) {
        v->launcher = lv_button_create(parent);
        lv_obj_set_pos(v->launcher, (int)w - 80, 4);
        lv_obj_set_size(v->launcher, 76, 24);
        lv_obj_t *l = lv_label_create(v->launcher);
        lv_label_set_text(l, "Party [P]");
        lv_obj_center(l);
        lv_obj_add_event_cb(v->launcher, click, LV_EVENT_CLICKED, v);
    }
    lge_lvgl_set_hidden(v->launcher, r->menu_open || lge_story_blocking(r->story));
    if (!r->menu_open) {
        if (v->panel) {
            lv_obj_delete(v->panel);
            v->panel = NULL;
        }
        return;
    }
    if (!v->panel) {
        v->panel = lv_obj_create(parent);
        lv_obj_remove_style_all(v->panel);
        lv_obj_set_size(v->panel, w, h);
        lv_obj_set_style_bg_color(v->panel, lv_color_hex(0x1d2938), 0);
        lv_obj_set_style_bg_opa(v->panel, LV_OPA_COVER, 0);
        lge_lvgl_set_scrollable(v->panel, false);
        v->title = label(v->panel, 8, 4, w - 16);
        v->party = label(v->panel, 8, h * 28 / 240, w / 2 - 12);
        v->enemies = label(v->panel, w / 2 + 4, h * 28 / 240, w / 2 - 12);
        v->log = label(v->panel, 8, h * 100 / 240, w - 16);
        for (unsigned i = 0; i < 8; ++i) {
            v->buttons[i] = lv_button_create(v->panel);
            lv_obj_set_pos(v->buttons[i], 8 + (i % 2) * (w - 8) / 2,
                           h * (142 + (i / 2) * 23) / 240);
            lv_obj_set_size(v->buttons[i], (w - 24) / 2, h * 20 / 240);
            lv_obj_set_style_pad_all(v->buttons[i], 0, 0);
            v->labels[i] = label(v->buttons[i], 2, 0, (w - 28) / 2);
            lv_obj_add_event_cb(v->buttons[i], click, LV_EVENT_CLICKED, v);
        }
        v->revision = ~r->revision;
    }
    if (v->revision == r->revision && v->state_revision == r->story->revision)
        return;
    v->revision = r->revision;
    v->state_revision = r->story->revision;
    char title[96], party[256], enemies[256], log[192];
    lge_rpg_summary(r, title, sizeof(title), party, sizeof(party), enemies, sizeof(enemies), log,
                    sizeof(log));
    lv_label_set_text(v->title, title);
    lv_label_set_text(v->party, party);
    lv_label_set_text(v->enemies, enemies);
    lv_label_set_text(v->log, log);
    lge_rpg_option_t options[8];
    unsigned n = lge_rpg_options(r, options);
    for (unsigned i = 0; i < 8; ++i) {
        lge_lvgl_set_hidden(v->buttons[i], i >= n);
        if (i < n) {
            lv_label_set_text(v->labels[i], options[i].label);
            lv_obj_set_style_bg_color(v->buttons[i],
                                      lv_color_hex(i == r->selected ? 0x547d9e : 0x35475b), 0);
        }
    }
}
