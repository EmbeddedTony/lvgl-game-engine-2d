#ifndef LGE_INPUT_MONITOR_TEXT_H
#define LGE_INPUT_MONITOR_TEXT_H
#include "lge_inputs.h"
/* One complete ASCII channel=value\n line, or zero on invalid/truncated input.
 * Owner thread only. Capacity includes the terminating NUL. No allocation. */
size_t lge_monitor_line(char *out, size_t capacity, const char *id,
                        lge_value_type_t type, lge_input_value_t value);
#endif
