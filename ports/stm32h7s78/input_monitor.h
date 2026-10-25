#ifndef LGE_H7_INPUT_MONITOR_H
#define LGE_H7_INPUT_MONITOR_H
#include <stdbool.h>
/* Explicit development build option; owns UART4 TX/PD1, 115200 8N1.
 * Read-only telemetry: no serial command, flash, save or option-byte writes. */
bool lge_h7_input_monitor_init(void);
#endif
