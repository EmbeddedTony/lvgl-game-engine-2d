# Persistent DK checkpoints

The bundled STM32H7S78-DK builder connects the ordinary `ui_config_t.storage_read`
and `storage_write` callbacks to a bounded flash journal. Games use their existing
Save / load checkpoint actions; no game hook, SD card or filesystem is needed.

The last two 8 KiB internal flash sectors, `0x0800c000`–`0x0800ffff`, belong to
checkpoint data. The first 48 KiB are protected from this driver's writes and
erases. Code and graphics continue to execute/read from external flash. Boot
startup, security options and external-memory timings are unchanged. The builder
limits the Boot link region to 48 KiB, verifies its image fits and generates
`h7_checkpoint_layout.h` with that exact image's length/CRC. Runtime writes stay
disabled if the installed boot image differs. Installing a different boot image
requires a matching build and a fresh review of the reserved memory layout.

Records contain a versioned header, monotonic sequence, story-schema key, exact
packet length, payload and CRC32. A separate 128-bit commit flashword is programmed
last. The driver verifies programmed words and the complete committed payload
before reporting success. An interrupted append/erase leaves the previous commit
in the other sector or earlier in the active sector. Dirty/torn sectors are not
appended to. Rotation erases only the sector that does not contain the newest
commit. Unchanged checkpoints require no program or erase. For this campaign's
492-byte packet, each 8 KiB sector holds 15 records. No checkpoint writes occur
on movement, rendering, dialogue progression or startup.

Journal packets are capped at 4096 bytes, with no heap allocation or full-sector
RAM copy. Old records from incompatible schemas/projects are ignored. This is a
single active game's checkpoint slot, not a multi-user save database or a format
migration system. A compatible application-only flash update preserves saves.
Mass erase, replacing the reserved sectors or incompatible schema changes do not.

Partially programmed internal flash can report an ECC bus fault. Save data is
mapped as non-executable device memory in the pinned port's unused MPU region 8,
so a cache-line fetch cannot accidentally read an adjacent torn flashword. Reads
use one dedicated 16-bit LDR. The BusFault shim recovers only that instruction,
while a guarded read is active and the controller's ECC address matches the
reserved flashword. It rejects the record; unrelated faults retain fatal handling.
The controller is locked after every save attempt, including failures. Option-byte
programming and global interrupt masking during flash erases are not used.

Run `npm run test:runtime` for CRC, namespace, wraparound, rollover, duplicate-write,
partial-program, partial-erase and unreadable-word recovery checks. Hardware tests
must also exercise a rest lamp, cold boot, Continue and the protected boot prefix.
An erase can briefly pause the LVGL owner thread; checkpoint actions belong at
stable gameplay boundaries, rather than in a per-frame update hook.

References: [ST RM0477](https://www.st.com/resource/en/reference_manual/rm0477-stm32h7rx7sx-armbased-32bit-mcus-stmicroelectronics.pdf)
and the pinned STM32H7RS HAL Flash/FlashEx sources describe sector geometry,
128-bit programming and ECC BusFault handling. The two-sector replacement policy
also follows the recovery principles in [ST AN4894](https://www.st.com/resource/en/application_note/dm00311483-eeprom-emulation-techniques-and-software-for-stm32-microcontrollers-stmicroelectronics.pdf);
this implementation does not claim to be an ST X-CUBE-EEPROM port.
