#include "input_debounce.h"
bool lge_dk_button_sample(lge_dk_button_t *s, bool raw, uint32_t now, uint16_t debounce_ms) {
    if (!s->initialized) {
        s->candidate = s->stable = raw; s->changed = now; s->initialized = true;
    }
    if (raw != s->candidate) { s->candidate = raw; s->changed = now; }
    if ((uint32_t)(now - s->changed) >= debounce_ms) s->stable = s->candidate;
    return s->stable;
}
