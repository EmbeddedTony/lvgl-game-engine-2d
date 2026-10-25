#define _POSIX_C_SOURCE 200809L
/* Desktop port for the exact generated firmware UI. Protocol uses fd 3 so printf remains a log. */
#include "ui.h"
#include <errno.h>
#include <math.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define PROTOCOL_FD 3
#define PACKET_STATE 1u
#define PACKET_FRAME 2u
#define PACKET_AUDIO 3u
#define PACKET_INPUTS 4u
static bool monitor_inputs;

static uint8_t *frame;
static bool frame_dirty, frame_pending, running = true;
static lv_point_t pointer;
static bool pointer_down;
static bool collision_debug;
static const char *start_scene, *start_sequence;

static bool write_all(const void *data, size_t size) {
    const uint8_t *cursor = data;
    while (size) {
        ssize_t count = write(PROTOCOL_FD, cursor, size);
        if (count < 0 && errno == EINTR)
            continue;
        if (count <= 0)
            return false;
        cursor += count;
        size -= (size_t)count;
    }
    return true;
}
static void u32le(uint8_t *out, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i)
        out[i] = (uint8_t)(value >> (i * 8));
}
static bool packet(uint32_t type, const void *data, uint32_t size) {
    uint8_t header[12] = {'L', 'G', 'P', '1'};
    u32le(header + 4, type);
    u32le(header + 8, size);
    bool ok = write_all(header, sizeof(header)) && write_all(data, size);
    if (!ok)
        running = false;
    return ok;
}
static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels) {
    unsigned source = 0;
    for (int32_t y = area->y1; y <= area->y2; ++y) {
        for (int32_t x = area->x1; x <= area->x2; ++x, ++source) {
            if (x < 0 || y < 0 || x >= GAME_WIDTH || y >= GAME_HEIGHT)
                continue;
            uint8_t *target = frame + ((size_t)y * GAME_WIDTH + (size_t)x) * 4;
#if GAME_COLOR_DEPTH == 16
            uint16_t color;
            memcpy(&color, pixels + source * 2, sizeof(color));
            target[0] = (uint8_t)(((color >> 11) & 31) * 255 / 31);
            target[1] = (uint8_t)(((color >> 5) & 63) * 255 / 63);
            target[2] = (uint8_t)((color & 31) * 255 / 31);
#else
            const lv_color32_t *color = (const lv_color32_t *)pixels + source;
            target[0] = color->red;
            target[1] = color->green;
            target[2] = color->blue;
#endif
            target[3] = 255;
        }
    }
    frame_dirty = true;
    lv_display_flush_ready(display);
}
static void read_pointer(lv_indev_t *indev, lv_indev_data_t *data) {
    (void)indev;
    data->point = pointer;
    data->state = pointer_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}
static bool audio_play(void *ctx, uint32_t voice, const lge_cue_t *cue, float gain) {
    (void)ctx;
    char message[256];
    int size = snprintf(message, sizeof(message),
                        "{\"op\":\"play\",\"voice\":%u,\"cue\":\"%s\",\"gain\":%.6f,\"loop\":%s}",
                        voice, cue->id, (double)gain, cue->loop ? "true" : "false");
    return size > 0 && (size_t)size < sizeof(message) &&
           packet(PACKET_AUDIO, message, (uint32_t)size);
}
static void audio_stop(void *ctx, uint32_t voice) {
    (void)ctx;
    char message[96];
    int size = snprintf(message, sizeof(message), "{\"op\":\"stop\",\"voice\":%u}", voice);
    packet(PACKET_AUDIO, message, (uint32_t)size);
}
static void audio_pause(void *ctx, bool paused) {
    (void)ctx;
    const char *message =
        paused ? "{\"op\":\"pause\",\"paused\":true}" : "{\"op\":\"pause\",\"paused\":false}";
    packet(PACKET_AUDIO, message, (uint32_t)strlen(message));
}
static void audio_gain(void *ctx, uint32_t voice, float gain) {
    (void)ctx;
    char message[128];
    int size = snprintf(message, sizeof(message), "{\"op\":\"gain\",\"voice\":%u,\"gain\":%.6f}",
                        voice, (double)gain);
    packet(PACKET_AUDIO, message, (uint32_t)size);
}
static bool checkpoint_read(void *ctx, void *data, size_t size) {
    (void)ctx;
    const char *path = getenv("LGE_SAVE_PATH");
    if (!path)
        return false;
    FILE *f = fopen(path, "rb");
    if (!f)
        return false;
    bool ok = fread(data, 1, size, f) == size && fgetc(f) == EOF;
    fclose(f);
    return ok;
}
static bool checkpoint_write(void *ctx, const void *data, size_t size) {
    (void)ctx;
    const char *path = getenv("LGE_SAVE_PATH");
    if (!path || strlen(path) > 3900)
        return false;
    char temp[4096];
    snprintf(temp, sizeof(temp), "%s.tmp", path);
    FILE *f = fopen(temp, "wb");
    if (!f)
        return false;
    bool ok = fwrite(data, 1, size, f) == size;
    if (ok)
        ok = fflush(f) == 0 && fsync(fileno(f)) == 0;
    if (fclose(f) != 0)
        ok = false;
    if (ok)
        ok = rename(temp, path) == 0;
    if (!ok)
        unlink(temp);
    return ok;
}
static bool start_game(void) {
    static const lge_audio_backend_t audio = {NULL, audio_play, audio_stop, audio_pause,
                                              audio_gain};
    const ui_config_t config = {.audio = &audio,
                                .start_scene = start_scene,
                                .start_sequence = start_sequence,
                                .storage_read = checkpoint_read,
                                .storage_write = checkpoint_write};
    bool ok = ui_init_with_config(&config);
    if (ok)
        ui_set_collision_debug(collision_debug);
    return ok;
}
static void send_state(void) {
    const char *scene = ui_current_scene(), *sequence = ui_current_sequence(),
               *step = ui_current_step();
    lge_engine_t *game = ui_game();
    char message[512];
    int size =
        snprintf(message, sizeof(message),
                 "{\"scene\":\"%s\",\"sequence\":\"%s\",\"step\":\"%s\",\"paused\":%s,\"score\":%u,"
                 "\"total\":%u}",
                 scene ? scene : "", sequence ? sequence : "", step ? step : "",
                 ui_is_paused() ? "true" : "false", game ? game->score : 0, game ? game->total : 0);
    if (size > 0 && (size_t)size < sizeof(message))
        packet(PACKET_STATE, message, (uint32_t)size);
}
/* Host-only instrumentation. Firmware banks and board ports need no monitor RAM. */
static void send_inputs(void) {
    char message[8192];
    size_t used = 0;
    lge_engine_t *game = ui_game();
    int written =
        snprintf(message, sizeof(message), "{\"actions\":%u,\"x\":%.9g,\"y\":%.9g,\"channels\":[",
                 game ? game->controller_input : 0, (double)(game ? game->controller_x : 0),
                 (double)(game ? game->controller_y : 0));
    if (written < 0 || (size_t)written >= sizeof(message))
        return;
    used = (size_t)written;
    for (unsigned i = 0; i < GAME_INPUT_COUNT; i++) {
        char value[48] = "null";
        int32_t integer;
        float real;
        bool boolean;
        if (game_inputs[i].type == LGE_VALUE_INT && ui_input_read_int(i, &integer))
            snprintf(value, sizeof(value), "%ld", (long)integer);
        else if (game_inputs[i].type == LGE_VALUE_FLOAT && ui_input_read_float(i, &real))
            snprintf(value, sizeof(value), "%.9g", (double)real);
        else if (game_inputs[i].type == LGE_VALUE_BOOL && ui_input_read_bool(i, &boolean))
            snprintf(value, sizeof(value), "%s", boolean ? "true" : "false");
        written = snprintf(message + used, sizeof(message) - used,
                           "%s{\"channel\":%u,\"value\":%s,\"normalized\":%.9g,\"active\":%s}",
                           i ? "," : "", i, value, (double)ui_input_normalized(i),
                           ui_input_active(i) ? "true" : "false");
        if (written < 0 || (size_t)written >= sizeof(message) - used)
            return;
        used += (size_t)written;
    }
    if (used + 2 >= sizeof(message))
        return;
    message[used++] = ']';
    message[used++] = '}';
    packet(PACKET_INPUTS, message, (uint32_t)used);
}
static void physical_input(const char *line) {
    unsigned count;
    int consumed = 0;
    if (sscanf(line, "V %u%n", &count, &consumed) != 1 || !count || count > GAME_INPUT_COUNT ||
        count > 32)
        return;
    const char *cursor = line + consumed;
    lge_input_sample_t samples[32];
    bool pulses[32];
    uint32_t seen = 0;
    for (unsigned i = 0; i < count; i++) {
        unsigned channel, type, pulse;
        double value;
        if (sscanf(cursor, " %u %u %lf %u%n", &channel, &type, &value, &pulse, &consumed) != 4 ||
            channel >= GAME_INPUT_COUNT || type != (unsigned)game_inputs[channel].type ||
            pulse > 1 || !isfinite(value) || (seen & (UINT32_C(1) << channel)) ||
            (type == LGE_VALUE_INT &&
             (value < INT32_MIN || value > INT32_MAX || trunc(value) != value)) ||
            (type == LGE_VALUE_BOOL && (value != 0 && value != 1)) ||
            (type == LGE_VALUE_FLOAT && !isfinite((float)value)) ||
            (pulse && type != LGE_VALUE_BOOL))
            return;
        cursor += consumed;
        seen |= UINT32_C(1) << channel;
        pulses[i] = pulse != 0;
        samples[i].channel = (uint8_t)channel;
        samples[i].type = (lge_value_type_t)type;
        if (type == LGE_VALUE_INT)
            samples[i].value.integer = (int32_t)value;
        else if (type == LGE_VALUE_FLOAT)
            samples[i].value.real = (float)value;
        else
            samples[i].value.boolean = value != 0;
    }
    if (*cursor)
        return;
    for (unsigned i = 0; i < count; i++)
        if (pulses[i]) {
            /* A release/repress can occur between monitor frames even when
             * the previous native sample was held. Recreate its rising edge. */
            ui_input_set_bool(samples[i].channel, false);
            ui_input_set_bool(samples[i].channel, true);
        }
    (void)ui_input_publish(samples, count);
}
static void command(const char *line, lv_indev_t *indev) {
    unsigned value;
    int x, y, down;
    if (line[0] == 'V')
        physical_input(line);
    else if (sscanf(line, "X %u", &value) == 1)
        (void)ui_input_disconnect(value);
    else if (sscanf(line, "M %u", &value) == 1)
        monitor_inputs = value != 0;
    else if (sscanf(line, "I %u", &value) == 1)
        ui_set_input((uint8_t)(value & 127));
    else if (sscanf(line, "P %u", &value) == 1) {
        ui_set_paused(value != 0);
        if (value) {
            ui_set_input(0);
            pointer_down = false;
            lv_indev_read(indev);
        }
    } else if (sscanf(line, "D %u", &value) == 1)
        ui_audio_complete(value);
    else if (sscanf(line, "C %u", &value) == 1) {
        collision_debug = value != 0;
        ui_set_collision_debug(collision_debug);
    } else if (sscanf(line, "T %d %d %d", &x, &y, &down) == 3) {
        pointer.x = x < 0 ? 0 : x >= GAME_WIDTH ? GAME_WIDTH - 1 : x;
        pointer.y = y < 0 ? 0 : y >= GAME_HEIGHT ? GAME_HEIGHT - 1 : y;
        pointer_down = down != 0;
        lv_indev_read(indev);
    } else if (!strcmp(line, "A"))
        frame_pending = false;
    else if (!strcmp(line, "N"))
        (void)ui_sequence_next();
    else if (!strcmp(line, "R")) {
        ui_deinit();
        pointer_down = false;
        if (!start_game())
            running = false;
        lv_obj_invalidate(lv_screen_active());
    } else if (!strcmp(line, "Q"))
        running = false;
}
static void drain_commands(lv_indev_t *indev) {
    static char line[8192];
    static size_t used;
    char data[512];
    ssize_t count;
    while ((count = read(STDIN_FILENO, data, sizeof(data))) > 0) {
        for (ssize_t i = 0; i < count; ++i) {
            if (data[i] == '\n') {
                line[used] = '\0';
                command(line, indev);
                used = 0;
            } else if (used < sizeof(line) - 1)
                line[used++] = data[i];
            else {
                fprintf(stderr, "Playtest command exceeds protocol limit.\n");
                running = false;
                return;
            }
        }
    }
    if (count == 0 || (count < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR))
        running = false;
}
static uint64_t monotonic_ms(void) {
    struct timespec time;
    clock_gettime(CLOCK_MONOTONIC, &time);
    return (uint64_t)time.tv_sec * 1000 + (uint64_t)time.tv_nsec / 1000000;
}
int main(int argc, char **argv) {
    signal(SIGPIPE, SIG_IGN);
    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IOLBF, 0);
    if (argc == 3 && !strcmp(argv[1], "scene"))
        start_scene = argv[2];
    else if (argc == 3 && !strcmp(argv[1], "sequence"))
        start_sequence = argv[2];
    else if (argc != 1) {
        fprintf(stderr, "Invalid playtest start target.\n");
        return 2;
    }
    if (fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK) < 0)
        return 2;
    lv_init();
    frame = calloc((size_t)GAME_WIDTH * GAME_HEIGHT, 4);
    const size_t draw_bytes = (size_t)GAME_WIDTH * 32 * (GAME_COLOR_DEPTH / 8);
    void *draw_buffer = malloc(draw_bytes);
    if (!frame || !draw_buffer) {
        fprintf(stderr, "Playtest display allocation failed.\n");
        return 2;
    }
    lv_display_t *display = lv_display_create(GAME_WIDTH, GAME_HEIGHT);
    lv_display_set_color_format(display, GAME_COLOR_DEPTH == 16 ? LV_COLOR_FORMAT_RGB565
                                                                : LV_COLOR_FORMAT_ARGB8888);
    lv_display_set_buffers(display, draw_buffer, NULL, (uint32_t)draw_bytes,
                           LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    lv_indev_t *indev = lv_indev_create();
    lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(indev, read_pointer);
    lv_indev_set_display(indev, display);
    if (!start_game()) {
        fprintf(stderr, "Game initialization failed. Check the selected scene/sequence.\n");
        return 2;
    }
    uint64_t previous = monotonic_ms(), last_state = 0, last_frame = 0;
    while (running) {
        drain_commands(indev);
        uint64_t now = monotonic_ms();
        lv_tick_inc((uint32_t)(now - previous));
        previous = now;
        lv_timer_handler();
        if (now - last_state >= 100) {
            send_state();
            if (monitor_inputs)
                send_inputs();
            last_state = now;
        }
        if (frame_dirty && !frame_pending && now - last_frame >= 33) {
            frame_pending = true;
            frame_dirty = false;
            last_frame = now;
            packet(PACKET_FRAME, frame, (uint32_t)((size_t)GAME_WIDTH * GAME_HEIGHT * 4));
        }
        const struct timespec delay = {0, 2000000};
        nanosleep(&delay, NULL);
    }
    ui_deinit();
    lv_indev_delete(indev);
    lv_display_delete(display);
    lv_deinit();
    free(draw_buffer);
    free(frame);
    return 0;
}
