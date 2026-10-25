#ifndef LGE_INPUT_CODEC_H
#define LGE_INPUT_CODEC_H
#include "lge_inputs.h"
#ifdef __cplusplus
extern "C" {
#endif
/* Caller-owned, one parser per serial stream. Overflow discards through newline. */
typedef struct {
    char line[96];
    uint8_t length;
    bool dropping;
} lge_input_serial_t;
/* UTF-8/ASCII channel_id=value\n. Returns accepted lines, not bytes. Fragment-safe.
 * One stream has one producer. Never invoke concurrently for the same parser. */
unsigned lge_inputs_serial_feed(lge_inputs_t *, lge_input_serial_t *, unsigned source,
                                const void *bytes, size_t size);
/* BLE GATT/HID or binary UART report. All mapped fields validate before publishing.
 * Max 64 bytes; little endian; offsets include optional report-ID prefix. */
bool lge_inputs_report(lge_inputs_t *, unsigned source, const void *bytes, size_t size);
#ifdef __cplusplus
}
#endif
#endif
