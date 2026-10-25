#include "hardware_inputs_config.h"
#include "input_debounce.h"
#include "ui.h"
#include <string.h>

volatile uint32_t lge_h7_input_faults;
static bool ready;
static lge_dk_button_t buttons[LGE_DK_GPIO_COUNT ? LGE_DK_GPIO_COUNT : 1];
#if LGE_DK_ADC_COUNT > 0
typedef struct {
    ADC_HandleTypeDef handle;
    uint8_t count, received, indices[LGE_DK_ADC_COUNT];
    bool invalid;
    lge_input_sample_t samples[LGE_DK_ADC_COUNT];
} adc_group_t;
static adc_group_t groups[2];

void ADC1_2_IRQHandler(void) {
    if (groups[0].count) HAL_ADC_IRQHandler(&groups[0].handle);
    if (groups[1].count) HAL_ADC_IRQHandler(&groups[1].handle);
}
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *handle) {
    adc_group_t *g = handle == &groups[0].handle ? &groups[0] : &groups[1];
    uint32_t value = HAL_ADC_GetValue(handle);
    if (!ready || g->invalid || g->received >= g->count) return;
    const lge_dk_pin_t *pin = &lge_dk_adc_pins[g->indices[g->received]];
    g->samples[g->received++] = (lge_input_sample_t){.channel=pin->channel,.type=LGE_VALUE_INT,.value.integer=(int32_t)value};
    if (g->received == g->count) ui_input_publish(g->samples,g->count);
}
void HAL_ADC_ErrorCallback(ADC_HandleTypeDef *handle) {
    adc_group_t *g = handle == &groups[0].handle ? &groups[0] : &groups[1];
    g->invalid = true;
    ++lge_h7_input_faults;
}
static bool init_adc(void) {
    __HAL_RCC_ADC12_CLK_ENABLE();
    /* Never reset an ADC that user code already owns. Retain the inherited
     * kernel clock mux; the pinned port supplies PLL2P, safely divided by 16. */
    uint32_t clock = HAL_RCCEx_GetPeriphCLKFreq(RCC_PERIPHCLK_ADC);
    if (!clock || clock / 16 > 25000000 || (ADC1->CR & ADC_CR_ADEN) || (ADC2->CR & ADC_CR_ADEN)) return false;
    for (unsigned i=0;i<LGE_DK_ADC_COUNT;i++) {
        adc_group_t *g=&groups[lge_dk_adc_pins[i].adc-1];
        g->indices[g->count++]=(uint8_t)i;
    }
    for (unsigned i=0;i<2;i++) {
        adc_group_t *g=&groups[i];
        if (!g->count) continue;
        g->handle.Instance=i ? ADC2 : ADC1;
        g->handle.Init=(ADC_InitTypeDef){.ClockPrescaler=ADC_CLOCK_ASYNC_DIV16,.Resolution=ADC_RESOLUTION_12B,
            .DataAlign=ADC_DATAALIGN_RIGHT,.ScanConvMode=ADC_SCAN_ENABLE,.EOCSelection=ADC_EOC_SINGLE_CONV,
            .NbrOfConversion=g->count,.ExternalTrigConv=ADC_EXTERNALTRIG_T3_TRGO,
            .ExternalTrigConvEdge=ADC_EXTERNALTRIGCONVEDGE_RISING,.SamplingMode=ADC_SAMPLING_MODE_NORMAL,
            .ConversionDataManagement=ADC_CONVERSIONDATA_DR,.Overrun=ADC_OVR_DATA_PRESERVED};
        if (HAL_ADC_Init(&g->handle)!=HAL_OK) return false;
        for (unsigned j=0;j<g->count;j++) {
            const lge_dk_pin_t *p=&lge_dk_adc_pins[g->indices[j]];
            static const uint32_t ranks[]={ADC_REGULAR_RANK_1,ADC_REGULAR_RANK_2,ADC_REGULAR_RANK_3,ADC_REGULAR_RANK_4,ADC_REGULAR_RANK_5};
            ADC_ChannelConfTypeDef c={.Channel=p->adc_channel,.Rank=ranks[j],.SamplingTime=ADC_SAMPLETIME_247CYCLES_5,
                .SingleDiff=ADC_SINGLE_ENDED,.OffsetNumber=ADC_OFFSET_NONE};
            if (HAL_ADC_ConfigChannel(&g->handle,&c)!=HAL_OK) return false;
        }
        if (HAL_ADCEx_Calibration_Start(&g->handle,ADC_SINGLE_ENDED)!=HAL_OK) return false;
    }
    HAL_NVIC_SetPriority(ADC1_2_IRQn,13,0);
    HAL_NVIC_ClearPendingIRQ(ADC1_2_IRQn);
    HAL_NVIC_EnableIRQ(ADC1_2_IRQn);
    for (unsigned i=0;i<2;i++)
        if (groups[i].count && HAL_ADC_Start_IT(&groups[i].handle)!=HAL_OK) return false;
    return true;
}
#endif

void TIM3_IRQHandler(void) {
    if (!(TIM3->SR & TIM_SR_UIF)) return;
    TIM3->SR=~TIM_SR_UIF;
    if (!ready) return;
#if LGE_DK_ADC_COUNT > 0
    /* Trigger and GPIO sampling share this periodic boundary. A missed ADC rank
     * invalidates that scan; do not mix values from successive scans. */
    for(unsigned i=0;i<2;i++) { groups[i].received=0; groups[i].invalid=false; }
#endif
#if LGE_DK_GPIO_COUNT > 0
    lge_input_sample_t samples[LGE_DK_GPIO_COUNT];
    uint32_t now=HAL_GetTick();
    for(unsigned i=0;i<LGE_DK_GPIO_COUNT;i++) {
        const lge_dk_pin_t *p=&lge_dk_gpio_pins[i];
        bool pressed=(HAL_GPIO_ReadPin(p->port,p->pin)==GPIO_PIN_SET) != p->active_low;
        samples[i]=(lge_input_sample_t){.channel=p->channel,.type=LGE_VALUE_BOOL,
            .value.boolean=lge_dk_button_sample(&buttons[i],pressed,now,p->debounce_ms)};
    }
    ui_input_publish(samples,LGE_DK_GPIO_COUNT);
#endif
}
static void init_pin(const lge_dk_pin_t *p, bool analog) {
    GPIO_InitTypeDef gpio={.Pin=p->pin,.Mode=analog?GPIO_MODE_ANALOG:GPIO_MODE_INPUT,.Pull=p->pull};
    HAL_GPIO_Init(p->port,&gpio);
}
bool lge_h7_inputs_init(void) {
    ready=false;
    __HAL_RCC_TIM3_CLK_ENABLE();
    if (TIM3->CR1 & TIM_CR1_CEN) { ++lge_h7_input_faults; return false; }
    /* Match ST's APB1 timer-clock calculation, including TIMPRE. Never alter it. */
    RCC_ClkInitTypeDef config; uint32_t latency;
    HAL_RCC_GetClockConfig(&config,&latency);
    uint32_t clock=HAL_RCC_GetPCLK1Freq();
    if(config.APB1CLKDivider==RCC_APB1_DIV2) clock*=2u;
    else if(config.APB1CLKDivider!=RCC_APB1_DIV1)
        clock*=__HAL_RCC_GET_TIMCLKPRESCALER()==RCC_TIMPRES_DISABLE ? 2u : 4u;
    uint32_t divider=clock/1000000u;
    if(!divider || divider>65536 || clock%1000000u) { ++lge_h7_input_faults; return false; }
    __HAL_RCC_GPIOC_CLK_ENABLE(); __HAL_RCC_GPIOD_CLK_ENABLE(); __HAL_RCC_GPIOF_CLK_ENABLE();
    for(unsigned i=0;i<LGE_DK_GPIO_COUNT;i++) init_pin(&lge_dk_gpio_pins[i],false);
    for(unsigned i=0;i<LGE_DK_ADC_COUNT;i++) init_pin(&lge_dk_adc_pins[i],true);
    memset(buttons,0,sizeof(buttons));
    TIM3->CR1=TIM_CR1_ARPE;
    TIM3->PSC=divider-1; TIM3->ARR=1000000u/LGE_DK_SAMPLE_HZ-1;
    TIM3->EGR=TIM_EGR_UG; TIM3->SR=0; TIM3->CNT=0;
    TIM3->CR2=TIM_CR2_MMS_1; /* Update is TRGO; GPIO timer works without ADC. */
#if LGE_DK_ADC_COUNT > 0
    if(!init_adc()) { ++lge_h7_input_faults; HAL_NVIC_DisableIRQ(ADC1_2_IRQn); return false; }
#endif
    TIM3->DIER=TIM_DIER_UIE;
    HAL_NVIC_SetPriority(TIM3_IRQn,13,0); HAL_NVIC_ClearPendingIRQ(TIM3_IRQn);
    ready=true; __DMB();
    HAL_NVIC_EnableIRQ(TIM3_IRQn); TIM3->CR1|=TIM_CR1_CEN;
    return true;
}
