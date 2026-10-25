#include "checkpoint_flash.h"
#include "checkpoint_journal.h"
#include "stm32h7rsxx_hal.h"
#include "generated/game_data.h"
#include "engine/lge_story.h"
#include "h7_checkpoint_layout.h"
#include <string.h>
extern const lge_story_def_t game_story;

/* Only sectors 6/7 are writable. Boot linker and build checks reserve these.
 * All executable code, ISR vectors and source data remain in external flash/RAM. */
#define SAVE_BASE UINT32_C(0x0800c000)
#if !defined(STM32H7S7xx) || FLASH_SECTOR_SIZE != 8192 || FLASH_SECTOR_NB != 8
#error "Checkpoint flash layout requires the verified H7S7 64KiB bootflash."
#endif
static bool ready;
static volatile bool guarded_read, read_failed;
static volatile uint32_t read_address;
static lge_checkpoint_journal_t journal;
/* Exactly one 16-bit LDR instruction. BusFault may skip ONLY this instruction,
 * ONLY during a guarded save-sector read with a matching flash ECC address. */
__attribute__((naked,noinline)) static uint32_t read_word(uint32_t address __attribute__((unused))) {
    __asm volatile("ldr r0, [r0]\n bx lr");
}
void lge_h7_checkpoint_busfault(uint32_t *frame) {
    uint32_t pc=(uint32_t)(uintptr_t)read_word&~1u;
    uint32_t failed=FLASH->ECCDFADDR;
    if(guarded_read && frame[6]==pc && (FLASH->ISR&FLASH_FLAG_DBECCERR) &&
       (SCB->CFSR&SCB_CFSR_PRECISERR_Msk) && failed>=SAVE_BASE && failed<SAVE_BASE+LGE_JOURNAL_BYTES &&
       (failed&~15u)==(read_address&~15u)) {
        read_failed=true;
        FLASH->ICR=FLASH_FLAG_DBECCERR;
        SCB->CFSR=SCB_CFSR_PRECISERR_Msk|SCB_CFSR_BFARVALID_Msk;
        frame[0]=0; frame[6]=pc+2;
        __DSB(); __ISB();
        return;
    }
    /* Preserve the port's fatal handling for every unrelated fault. */
    while(1) {}
}
static bool within(uint32_t offset,size_t size) {
    return ready && !(offset&15u) && !(size&15u) && offset<=LGE_JOURNAL_BYTES && size<=LGE_JOURNAL_BYTES-offset;
}
static bool read_flash(void *context,uint32_t offset,void *out,size_t size) {
    (void)context;
    if(!within(offset,size) || !out) return false;
    for(size_t i=0;i<size;i+=4) {
        read_address=SAVE_BASE+offset+(uint32_t)i; read_failed=false;
        __DMB(); guarded_read=true; __DMB();
        uint32_t value=read_word(read_address);
        __DMB(); guarded_read=false;
        if(read_failed) return false;
        memcpy((uint8_t *)out+i,&value,4);
    }
    return true;
}
static bool erase_flash(void *context,unsigned sector) {
    (void)context;
    if(!ready || sector>=2) return false;
    FLASH_EraseInitTypeDef erase={.TypeErase=FLASH_TYPEERASE_SECTORS,.Sector=6u+sector,.NbSectors=1};
    uint32_t error=0;
    __HAL_FLASH_CLEAR_FLAG(FLASH_FLAG_ISR_ERRORS);
    return HAL_FLASHEx_Erase(&erase,&error)==HAL_OK && error==UINT32_MAX;
}
static bool program_flash(void *context,uint32_t offset,const uint8_t data[16]) {
    (void)context;
    if(!within(offset,16)) return false;
    uint32_t aligned[4] __attribute__((aligned(16)));
    memcpy(aligned,data,16);
    __HAL_FLASH_CLEAR_FLAG(FLASH_FLAG_ISR_ERRORS);
    return HAL_FLASH_Program(FLASH_TYPEPROGRAM_QUADWORD,SAVE_BASE+offset,(uint32_t)(uintptr_t)aligned)==HAL_OK;
}
bool lge_h7_checkpoint_init(void) {
    ready=false;
    if(LGE_H7_BOOT_BYTES>49152u || !LGE_H7_BOOT_BYTES ||
       lge_checkpoint_crc32(0,(const void *)FLASH_BASE,LGE_H7_BOOT_BYTES)!=LGE_H7_BOOT_CRC32) return false;
    /* A device-type, non-executable region prevents speculative/cache-line reads
     * of an adjacent torn ECC flashword. Existing board MPU regions stay intact. */
    uint32_t mask=__get_PRIMASK(); __disable_irq();
    MPU->RNR=8;
    if(MPU->RASR&MPU_RASR_ENABLE_Msk) {__set_PRIMASK(mask);return false;}
    SCB_InvalidateDCache_by_Addr((void *)SAVE_BASE,LGE_JOURNAL_BYTES);
    HAL_MPU_Disable();
    MPU_Region_InitTypeDef region={.Enable=MPU_REGION_ENABLE,.Number=MPU_REGION_NUMBER8,
        .BaseAddress=SAVE_BASE,.Size=MPU_REGION_SIZE_16KB,.SubRegionDisable=0,
        .TypeExtField=MPU_TEX_LEVEL0,.AccessPermission=MPU_REGION_FULL_ACCESS,
        .DisableExec=MPU_INSTRUCTION_ACCESS_DISABLE,.IsShareable=MPU_ACCESS_SHAREABLE,
        .IsCacheable=MPU_ACCESS_NOT_CACHEABLE,.IsBufferable=MPU_ACCESS_BUFFERABLE};
    HAL_MPU_ConfigRegion(&region); HAL_MPU_Enable(MPU_PRIVILEGED_DEFAULT);
    SCB->SHCSR|=SCB_SHCSR_BUSFAULTENA_Msk;
    __DSB(); __ISB(); __set_PRIMASK(mask);
    journal=(lge_checkpoint_journal_t){.read=read_flash,.program=program_flash,.erase=erase_flash,.key=game_story.schema};
    ready=true;
    return true;
}
bool lge_h7_checkpoint_read(void *context,void *out,size_t size) {
    (void)context;
    return ready && lge_checkpoint_read(&journal,out,size);
}
bool lge_h7_checkpoint_write(void *context,const void *data,size_t size) {
    (void)context;
    if(!ready || HAL_FLASH_Unlock()!=HAL_OK) return false;
    bool ok=lge_checkpoint_write(&journal,data,size);
    /* Lock even when an erase/program/verification fails. Never alter option bytes. */
    if(HAL_FLASH_Lock()!=HAL_OK) ok=false;
    return ok;
}
