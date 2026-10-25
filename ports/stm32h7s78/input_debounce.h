#ifndef LGE_INPUT_DEBOUNCE_H
#define LGE_INPUT_DEBOUNCE_H
#include <stdbool.h>
#include <stdint.h>
typedef struct { bool candidate, stable, initialized; uint32_t changed; } lge_dk_button_t;
bool lge_dk_button_sample(lge_dk_button_t *, bool raw, uint32_t now, uint16_t debounce_ms);
#endif
