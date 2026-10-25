#include "input_monitor.h"
#include "input_monitor_text.h"
#include "stm32h7rsxx_hal.h"
#include "ui.h"
#if LGE_H7_HARDWARE_INPUTS
#include "hardware_inputs_config.h"
#endif
#include <string.h>

/* One immutable in-flight packet. Slow readers never create a queue. IRQ only
 * services the UART FIFO; sampling/formatting/UI reads stay on the LVGL thread. */
static char packet[512];
static volatile uint16_t cursor, packet_bytes;
static unsigned next_channel;
static bool button_candidate, button_stable;
static uint32_t button_changed;

void UART4_IRQHandler(void) {
    for (unsigned i = 0; i < 16 && (UART4->ISR & USART_ISR_TXE_TXFNF); ++i) {
        if (cursor >= packet_bytes) {
            CLEAR_BIT(UART4->CR1, USART_CR1_TXEIE_TXFNFIE);
            return;
        }
        UART4->TDR = (uint8_t)packet[cursor++];
    }
}

static void append(size_t *used, const char *id, lge_value_type_t type, lge_input_value_t v) {
    char line[96];
    size_t bytes = lge_monitor_line(line, sizeof(line), id, type, v);
    if (bytes && bytes <= sizeof(packet) - *used) {
        memcpy(packet + *used, line, bytes);
        *used += bytes;
    }
}
static void sample(lv_timer_t *timer) {
    (void)timer;
    if (UART4->CR1 & USART_CR1_TXEIE_TXFNFIE) return;
    bool pressed = false;
    lv_point_t point = {400, 240};
    for (lv_indev_t *d = lv_indev_get_next(NULL); d; d = lv_indev_get_next(d)) {
        if (lv_indev_get_type(d) == LV_INDEV_TYPE_POINTER) {
            pressed = lv_indev_get_state(d) == LV_INDEV_STATE_PRESSED;
            if (pressed) lv_indev_get_point(d, &point);
            break;
        }
    }
    uint32_t now = HAL_GetTick();
    bool button = HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_13) == GPIO_PIN_SET;
    if (button != button_candidate) { button_candidate = button; button_changed = now; }
    if (now - button_changed >= 25) button_stable = button_candidate;
    size_t used = 0;
#if LGE_H7_HARDWARE_INPUTS
    const char identity[]="@lge_hardware=" LGE_DK_HARDWARE_SIGNATURE "\n";
    memcpy(packet,identity,sizeof(identity)-1); used=sizeof(identity)-1;
#endif
    append(&used, "dk_touch_x", LGE_VALUE_INT, (lge_input_value_t){.integer = point.x});
    append(&used, "dk_touch_y", LGE_VALUE_INT, (lge_input_value_t){.integer = point.y});
    append(&used, "dk_touch_down", LGE_VALUE_BOOL, (lge_input_value_t){.boolean = pressed});
    append(&used, "dk_button", LGE_VALUE_BOOL, (lge_input_value_t){.boolean = button_stable});
    append(&used, "dk_uptime", LGE_VALUE_FLOAT, (lge_input_value_t){.real = now * 0.001f});
#if GAME_INPUT_COUNT > 0
    /* Rotate through all authored channels fairly, with complete lines only.
     * Maximum 512 bytes per 50ms: <=10,240 bytes/s vs 11,520 UART capacity.
     * Rendering may reduce sampling frequency; no backlog or catch-up burst. */
    for (unsigned seen = 0; seen < GAME_INPUT_COUNT; ++seen) {
        unsigned i = next_channel;
        if (sizeof(packet) - used < 96) break;
        next_channel = (next_channel + 1) % GAME_INPUT_COUNT;
        lge_input_value_t value;
        bool active = false;
        switch (game_inputs[i].type) {
        case LGE_VALUE_INT: active = ui_input_read_int(i, &value.integer); break;
        case LGE_VALUE_FLOAT: active = ui_input_read_float(i, &value.real); break;
        case LGE_VALUE_BOOL: active = ui_input_read_bool(i, &value.boolean); break;
        }
        const char *id = game_inputs[i].id;
        bool reserved = !strcmp(id, "dk_touch_x") || !strcmp(id, "dk_touch_y") ||
            !strcmp(id, "dk_touch_down") || !strcmp(id, "dk_button") || !strcmp(id, "dk_uptime");
        if (active && !reserved) append(&used, id, game_inputs[i].type, value);
    }
#endif
    cursor = 0;
    packet_bytes = (uint16_t)used;
    __DMB();
    SET_BIT(UART4->CR1, USART_CR1_TXEIE_TXFNFIE);
}

bool lge_h7_input_monitor_init(void) {
    /* ST UM3289/BSP: VCP UART4 TX = PD1 AF8. No RX pin or commands enabled.
     * Use the existing kernel clock mux; do not alter shared UART clocks. */
    uint32_t clock = HAL_RCCEx_GetPeriphCLKFreq(RCC_PERIPHCLK_USART234578);
    uint32_t divisor = (clock + 57600u) / 115200u;
    if (divisor < 16 || divisor > 65535) return false;
    __HAL_RCC_GPIOD_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_UART4_CLK_ENABLE();
    __HAL_RCC_UART4_FORCE_RESET();
    __HAL_RCC_UART4_RELEASE_RESET();
    GPIO_InitTypeDef gpio = {.Pin = GPIO_PIN_1, .Mode = GPIO_MODE_AF_PP,
        .Pull = GPIO_NOPULL, .Speed = GPIO_SPEED_FREQ_LOW, .Alternate = GPIO_AF8_UART4};
    HAL_GPIO_Init(GPIOD, &gpio);
    gpio = (GPIO_InitTypeDef){.Pin = GPIO_PIN_13, .Mode = GPIO_MODE_INPUT, .Pull = GPIO_PULLDOWN};
    HAL_GPIO_Init(GPIOC, &gpio);
    UART4->CR1 = 0;
    UART4->CR2 = 0;
    UART4->CR3 = 0;
    UART4->PRESC = 0;
    UART4->BRR = divisor;
    UART4->CR1 = USART_CR1_FIFOEN | USART_CR1_TE | USART_CR1_UE;
    uint32_t start = HAL_GetTick();
    while (!(UART4->ISR & USART_ISR_TEACK))
        if (HAL_GetTick() - start > 10) { UART4->CR1 = 0; return false; }
    cursor = packet_bytes = 0;
    HAL_NVIC_SetPriority(UART4_IRQn, 12, 0);
    HAL_NVIC_ClearPendingIRQ(UART4_IRQn);
    HAL_NVIC_EnableIRQ(UART4_IRQn);
    return lv_timer_create(sample, 50, NULL) != NULL;
}
