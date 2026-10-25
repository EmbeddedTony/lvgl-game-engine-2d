#include "lge_input_codec.h"
#include <limits.h>
#include <math.h>
#include <string.h>
/* Decimal parsing is bounded and allocation-free. Avoid libc strtof: embedded
 * implementations may allocate conversion buffers and carry an errno context. */
static bool decimal_int(const char *p, int32_t *out) {
    bool negative = *p == '-';
    if (*p == '-' || *p == '+')
        p++;
    if (*p < '0' || *p > '9')
        return false;
    uint32_t magnitude = 0, limit = negative ? UINT32_C(2147483648) : INT32_MAX;
    while (*p >= '0' && *p <= '9') {
        unsigned digit = (unsigned)(*p++ - '0');
        if (magnitude > (limit - digit) / 10)
            return false;
        magnitude = magnitude * 10 + digit;
    }
    if (*p)
        return false;
    *out = negative ? (magnitude == UINT32_C(2147483648) ? INT32_MIN : -(int32_t)magnitude)
                    : (int32_t)magnitude;
    return true;
}
static bool decimal_float(const char *p, float *out) {
    bool negative = *p == '-', dot = false, any = false;
    if (*p == '-' || *p == '+')
        p++;
    /* Accumulate/scale above float32 precision. Scaling in float loses several
     * ULPs (or overflows FLT_MAX) even for a nine-digit round-trip string. This
     * is a bounded transport path, never a physics/render inner loop. */
    double mantissa = 0;
    unsigned kept = 0;
    int exponent = 0;
    while ((*p >= '0' && *p <= '9') || (*p == '.' && !dot)) {
        if (*p == '.') {
            dot = true;
            p++;
            continue;
        }
        unsigned digit = (unsigned)(*p++ - '0');
        any = true;
        if (kept < 9) {
            mantissa = mantissa * 10 + (double)digit;
            if (dot)
                exponent--;
            if (mantissa != 0 || kept)
                kept++;
        } else if (!dot)
            exponent++;
    }
    if (!any)
        return false;
    if (*p == 'e' || *p == 'E') {
        p++;
        bool minus = *p == '-';
        if (*p == '-' || *p == '+')
            p++;
        if (*p < '0' || *p > '9')
            return false;
        int e = 0;
        while (*p >= '0' && *p <= '9') {
            if (e > 1000)
                return false;
            e = e * 10 + (*p++ - '0');
        }
        exponent += minus ? -e : e;
    }
    if (*p)
        return false;
    if (mantissa == 0 || exponent < -70) {
        *out = negative ? -0.0f : 0;
        return true;
    }
    if (exponent > 60)
        return false;
    while (exponent >= 10) {
        mantissa *= 1e10;
        exponent -= 10;
    }
    while (exponent <= -10) {
        mantissa /= 1e10;
        exponent += 10;
    }
    while (exponent > 0) {
        mantissa *= 10;
        exponent--;
    }
    while (exponent < 0) {
        mantissa /= 10;
        exponent++;
    }
    float result = (float)mantissa;
    if (!isfinite(result))
        return false;
    *out = negative ? -result : result;
    return true;
}
static bool serial_line(lge_inputs_t *bank, unsigned source, char *line) {
    char *eq = strchr(line, '=');
    if (!eq || eq == line)
        return false;
    *eq++ = 0;
    for (unsigned i = 0; i < bank->count; i++) {
        const lge_input_def_t *d = bank->definitions + i;
        if (d->source != source || strcmp(d->id, line))
            continue;
        if (d->type == LGE_VALUE_BOOL) {
            if (!strcmp(eq, "true") || !strcmp(eq, "1"))
                return lge_inputs_set_bool(bank, i, true);
            if (!strcmp(eq, "false") || !strcmp(eq, "0"))
                return lge_inputs_set_bool(bank, i, false);
            return false;
        }
        if (d->type == LGE_VALUE_INT) {
            int32_t v;
            return decimal_int(eq, &v) && lge_inputs_set_int(bank, i, v);
        }
        float v;
        return decimal_float(eq, &v) && lge_inputs_set_float(bank, i, v);
    }
    return false;
}
unsigned lge_inputs_serial_feed(lge_inputs_t *bank, lge_input_serial_t *parser, unsigned source,
                                const void *bytes, size_t size) {
    if (!bank || !parser || source >= bank->source_count || (!bytes && size))
        return 0;
    const uint8_t *data = bytes;
    unsigned accepted = 0;
    for (size_t i = 0; i < size; i++) {
        uint8_t c = data[i];
        if (c == '\n') {
            parser->line[parser->length] = 0;
            if (!parser->dropping && serial_line(bank, source, parser->line))
                accepted++;
            parser->length = 0;
            parser->dropping = false;
        } else if (c != '\r') {
            if (c < 32 || c > 126 || parser->length >= sizeof(parser->line) - 1)
                parser->dropping = true;
            if (!parser->dropping)
                parser->line[parser->length++] = (char)c;
        }
    }
    return accepted;
}
bool lge_inputs_report(lge_inputs_t *bank, unsigned source, const void *bytes, size_t size) {
    if (!bank || source >= bank->source_count || !bytes || !size || size > 64)
        return false;
    const uint8_t *data = bytes;
    unsigned report = bank->sources[source].report_id;
    if (report < 256 && data[0] != report)
        return false;
    lge_input_sample_t samples[LGE_INPUT_MAX_CHANNELS];
    size_t count = 0;
    for (unsigned i = 0; i < bank->count; i++) {
        const lge_input_def_t *d = bank->definitions + i;
        if (d->source != source || d->encoding == LGE_WIRE_NONE)
            continue;
        unsigned width = d->encoding == LGE_WIRE_I32_LE || d->encoding == LGE_WIRE_F32_LE   ? 4
                         : d->encoding == LGE_WIRE_I16_LE || d->encoding == LGE_WIRE_U16_LE ? 2
                                                                                            : 1;
        if ((size_t)d->offset + width > size)
            return false;
        uint32_t raw = 0;
        for (unsigned j = 0; j < width; j++)
            raw |= (uint32_t)data[d->offset + j] << (8 * j);
        lge_input_sample_t s = {(uint8_t)i, d->type, {.integer = 0}};
        if (d->encoding == LGE_WIRE_BIT) {
            if (d->type != LGE_VALUE_BOOL)
                return false;
            s.value.boolean = (raw & (1u << d->bit)) != 0;
        } else if (d->encoding == LGE_WIRE_F32_LE) {
            if (d->type != LGE_VALUE_FLOAT || sizeof(float) != 4)
                return false;
            memcpy(&s.value.real, &raw, 4);
            if (!isfinite(s.value.real))
                return false;
        } else {
            int32_t value;
            if (d->encoding == LGE_WIRE_I8)
                value = (raw & 128) ? (int32_t)raw - 256 : (int32_t)raw;
            else if (d->encoding == LGE_WIRE_I16_LE)
                value = (raw & 32768) ? (int32_t)raw - 65536 : (int32_t)raw;
            else if (d->encoding == LGE_WIRE_I32_LE)
                value = (raw & UINT32_C(0x80000000))
                            ? INT32_MIN + (int32_t)(raw - UINT32_C(0x80000000))
                            : (int32_t)raw;
            else
                value = (int32_t)raw;
            if (d->type == LGE_VALUE_INT)
                s.value.integer = value;
            else if (d->type == LGE_VALUE_FLOAT)
                s.value.real = (float)value;
            else
                return false;
        }
        samples[count++] = s;
    }
    return count && lge_inputs_publish(bank, samples, count);
}
