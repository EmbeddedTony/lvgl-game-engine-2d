#include "input_monitor_text.h"
#include <math.h>
#include <stdio.h>

size_t lge_monitor_line(char *out, size_t capacity, const char *id,
                        lge_value_type_t type, lge_input_value_t value) {
    if (!out || !capacity || !id) return 0;
    out[0] = 0;
    unsigned length = 0;
    for (; id[length]; ++length) {
        char c = id[length];
        bool letter = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
        if (length >= 64 || (!letter && (!length || (c != '_' && (c < '0' || c > '9')))))
            return 0;
    }
    if (!length) return 0;
    int bytes;
    switch (type) {
    case LGE_VALUE_INT: bytes = snprintf(out, capacity, "%s=%ld\n", id, (long)value.integer); break;
    case LGE_VALUE_FLOAT: {
        if (!isfinite(value.real)) return 0;
        /* Nine significant digits round-trip float32. Avoid newlib's floating
         * printf/dtoa workspace and hidden heap allocations. Float32's bounded
         * exponent needs at most 45 iterations; formatting below is integer. */
        double scaled = fabs((double)value.real);
        int exponent = 0;
        if (scaled) {
            while (scaled < 1) { scaled *= 10; --exponent; }
            while (scaled >= 10) { scaled /= 10; ++exponent; }
        }
        uint32_t digits = (uint32_t)(scaled * 100000000.0 + 0.5);
        if (digits == 1000000000u) { digits /= 10; ++exponent; }
        bytes = snprintf(out, capacity, "%s=%s%lue%d\n", id,
                         signbit(value.real) ? "-" : "", (unsigned long)digits, exponent - 8);
        break;
    }
    case LGE_VALUE_BOOL: bytes = snprintf(out, capacity, "%s=%s\n", id, value.boolean ? "true" : "false"); break;
    default: return 0;
    }
    if (bytes <= 0 || (size_t)bytes >= capacity || bytes > 95) {
        out[0] = 0;
        return 0;
    }
    return (size_t)bytes;
}
