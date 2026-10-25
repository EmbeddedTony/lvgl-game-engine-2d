"""Reproducible, build-only STM32H7S78-DK integration. Never flashes hardware.

Vendor boot, memory timings, linker regions and interrupt handlers come from the
pinned LVGL board port. Generated UI remains isolated from HAL initialization.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
COMMIT = '4e6609de729e9807f27031a4799f92cdee9a833b'

def prepare_application_main(source):
    """Retain vendor bring-up, but never let a game update program option bytes.

    The existing Boot image owns the board's boot/memory preparation. Application
    startup only checks the same requirements and stops on an incompatible setup.
    """
    marker = 'static void MX_FLASH_Init(void)\n{'
    start = source.index(marker)
    body = source.index('{', start)
    depth = 1
    end = body + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    readonly = 'static void MX_FLASH_Init(void)\n{\n  FLASH_OBProgramInitTypeDef configuration = {0};\n  HAL_FLASHEx_OBGetConfig(&configuration);\n  /* A game update must not change watchdog, IO-voltage or boot options. */\n  if ((configuration.USERConfig1 & OB_IWDG_SW) != OB_IWDG_SW ||\n      (configuration.USERConfig1 & OB_XSPI1_HSLV_ENABLE) != OB_XSPI1_HSLV_ENABLE ||\n      (configuration.USERConfig1 & OB_XSPI2_HSLV_ENABLE) != OB_XSPI2_HSLV_ENABLE ||\n      (configuration.USERConfig2 & OB_I2C_NI3C_I2C) != OB_I2C_NI3C_I2C) {\n    Error_Handler();\n  }\n}'
    prepared = source[:start] + readonly + source[end:]
    if re.search('HAL_FLASH(?:Ex_OBProgram|_OB_Unlock|_Unlock)\\s*\\(', prepared):
        raise RuntimeError('Application startup still contains a flash/option-byte write path')
    return prepared

def prepare_nema_image(source):
    """Source copy avoids destination reads for opaque nearest RGB565/XRGB8888 images.

    Alpha, masks, recolor, AA and special blends retain the vendor path.
    Only the prepared build copy is changed; the pinned checkout stays intact.
    """
    anchor = '    uint32_t src_nema_cf = lv_nemagfx_cf_to_nema(src_cf);'
    if source.count(anchor) != 1:
        raise RuntimeError('Pinned Nema image source changed; review the opaque-copy patch')
    return source.replace(anchor, '    if((src_cf == LV_COLOR_FORMAT_RGB565 || src_cf == LV_COLOR_FORMAT_XRGB8888) && dsc->opa == LV_OPA_COVER &&\n       dsc->blend_mode == LV_BLEND_MODE_NORMAL && !dsc->antialias && !masked && !recolor && !dsc->colorkey) {\n        blending_mode = NEMA_BL_SRC;\n    }\n\n' + anchor)

def prepare_psram_linear_reads(source):
    memory_start = '  /* MPU Configuration--------------------------------------------------------*/'
    if source.count(memory_start) != 1:
        raise RuntimeError('Pinned application entry changed')
    source = source.replace(memory_start, '  /* Only XSPI1 PSRAM: disable wrapped transactions inherited from Boot.\n   * This occurs before the CPU cache and all display/GPU bus masters start. */\n  for (volatile uint32_t wait = 0; (XSPI1->SR & XSPI_SR_BUSY) && wait < 600000u; ++wait) {}\n  if (XSPI1->SR & XSPI_SR_BUSY) Error_Handler();\n  CLEAR_BIT(XSPI1->DCR2, XSPI_DCR2_WRAPSIZE);\n  __DSB();\n\n' + memory_start)
    return source
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--ui', type=Path, default=ROOT / '.cache/generated-h7/ui')
p.add_argument('--out', type=Path, default=ROOT / '.cache/h7-firmware')
p.add_argument('--toolchain-bin', type=Path, help='ARM GNU bin directory (including newlib)')
p.add_argument('--cache', type=Path, default=ROOT / '.cache')
p.add_argument('--renderer', choices=['neochrom', 'software'], default='neochrom')
p.add_argument('--fps', type=int, choices=[30, 60], help='Refresh requests: default 60 for 2D; measured FPS depends on the scene.')
p.add_argument('--debug-swd', action='store_true', help='Enable versioned SWD game controls in this development build.')
p.add_argument('--input-monitor', action='store_true', help='Stream typed input telemetry over ST-LINK VCP (UART4 TX, 115200 8N1); no serial commands.')
p.add_argument('--profile-2d', action='store_true', help='Enable SWD-only repeatable 2D movement; off in normal builds.')
p.add_argument('--terrain-cache-kib', type=int, default=0, choices=[0, 32, 128, 512, 2048], help='Fixed external PSRAM terrain cache for 2D NeoChrom builds; 0 disables it (default off: measured faster on this board).')
p.add_argument('--optimization', choices=['speed', 'size'], default='speed', help='Optimize engine/LVGL for speed or size; board startup/HAL/Boot retain -Os.')
a = p.parse_args()
if a.debug_swd and a.profile_2d:
    p.error('SWD control cannot share input with the legacy engineering controllers')
if a.toolchain_bin:
    os.environ['PATH'] = str(a.toolchain_bin.resolve()) + os.pathsep + os.environ['PATH']
if not a.toolchain_bin:
    compiler = shutil.which('arm-none-eabi-gcc')
    probe = subprocess.run([compiler, '-E', '-x', 'c', '-'], input='#include <stdint.h>\n', text=True, capture_output=True) if compiler else None
    if not probe or probe.returncode:
        candidates = sorted(Path('/Applications/STM32CubeIDE.app/Contents/Eclipse/plugins').glob('com.st.stm32cube.ide.mcu.externaltools.gnu-tools-for-stm32.*/tools/bin'))
        if candidates:
            os.environ['PATH'] = str(candidates[-1]) + os.pathsep + os.environ['PATH']
(ui, out) = (a.ui.resolve(), a.out.resolve())
out.mkdir(parents=True, exist_ok=True)
(out / 'build-report.json').unlink(missing_ok=True)
swd_tag = [int.from_bytes(os.urandom(4), 'little') for _ in range(4)] if a.debug_swd else []
if a.debug_swd and (not (ui / 'ports/debug_swd.c').exists()):
    p.error('Re-export with current SWD control sources first')
if a.input_monitor and (not (ui / 'ports/input_monitor.c').exists()):
    p.error('Re-export with current input monitor bridge sources first')
if not (ui / 'ports/board.json').exists():
    p.error('Export a project configured for STM32H7S78-DK first; --ui must name its ui folder.')
if json.loads((ui / 'ports/board.json').read_text())['board'] != 'stm32h7s78-dk':
    p.error('Unexpected board manifest')
hardware_path = ui / 'ports/hardware-inputs.json'
hardware = json.loads(hardware_path.read_text()) if hardware_path.exists() else None
hardware_adc = bool(hardware and hardware.get('adcCount'))
image_manifest_path = ui / 'image-manifest.json'
image_manifest = json.loads(image_manifest_path.read_text()) if image_manifest_path.exists() else None
if a.renderer == 'neochrom':
    if not image_manifest or image_manifest.get('packing') != 'direct' or image_manifest.get('alignment', 0) < 4:
        p.error('Re-export this project with the current editor: NeoChrom needs the direct-color image contract; older indexed exports can render incorrect colors.')
    for image in image_manifest.get('images', []):
        if image['format'] not in ('ARGB8888', 'XRGB8888') or image['stride'] != image['width'] * 4 or image['bytes'] != image['stride'] * image['height']:
            p.error(f"Invalid GPU image layout: {image['symbol']}. Re-export the project.")
if a.fps is None:
    a.fps = 60
for tool in ['git', 'cmake', 'ninja', 'arm-none-eabi-gcc', 'arm-none-eabi-g++']:
    if not shutil.which(tool):
        p.error(f'Missing {tool}; install CMake, Ninja and the ARM GNU embedded toolchain.')
a.cache.mkdir(parents=True, exist_ok=True)
port = a.cache.resolve() / 'stm32h7s78-upstream'

def run(*cmd):
    subprocess.run([str(c) for c in cmd], check=True)
if not port.exists():
    run('git', 'clone', 'https://github.com/lvgl/lv_port_stm32h7s78-dk.git', port)
run('git', '-C', port, 'checkout', '--detach', COMMIT)
run('git', '-C', port, 'submodule', 'update', '--init', '--depth', '1')
out.mkdir(parents=True, exist_ok=True)
(out / 'build-report.json').unlink(missing_ok=True)
lvgl = port / 'STM32CubeIDE/Appli/lvgl'
conf = (port / 'STM32CubeIDE/Appli/lv_conf.h').read_text()
conf = re.sub('(#define LV_BUILD_DEMOS) 1', '\\1 0', conf)
conf = re.sub('(#define LV_DEF_REFR_PERIOD)\\s+16', lambda m: m.group(1) + ' ' + str(1000 // a.fps), conf)
if a.optimization == 'speed':
    conf = re.sub('(#define LV_OBJ_STYLE_CACHE)\\s+0\\b', '\\1 1', conf)
conf = conf.replace('#endif /*LV_CONF_H*/', '#include "lv_conf_acceleration.h"\n#endif /*LV_CONF_H*/')
if '#include "lv_conf_acceleration.h"' not in conf:
    idx = conf.rfind('#endif')
    conf = conf[:idx] + '#include "lv_conf_acceleration.h"\n' + conf[idx:]

def write_changed(path, text):
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
if a.renderer == 'software':
    conf += '\n#undef LV_USE_NEMA_GFX\n#define LV_USE_NEMA_GFX 0\n'
write_changed(out / 'lv_conf.h', conf)
main = prepare_application_main((port / 'Appli/Core/Src/main.c').read_text())
main = main.replace('#include "lvgl/demos/lv_demos.h"', '#include "stm32h7s78_dk.h"')
main = main.replace('lv_demo_benchmark();', 'if (!lge_h7s78_start()) Error_Handler();')
if a.optimization == 'speed':
    service_loop = 'lv_timer_handler();\n\n    HAL_Delay(1);'
    if main.count(service_loop) != 1:
        raise RuntimeError('Pinned board service loop changed; review before modifying frame pacing')
    main = main.replace(service_loop, 'lv_timer_handler();\n\n    /* This HAL adds one guard tick even for zero: poll once per tick,\n     * without changing CPU sleep/debug or peripheral clock policy. */\n    HAL_Delay(0);')
write_changed(out / 'main.c', main)
it = (port / 'Appli/Core/Src/stm32h7rsxx_it.c').read_text()
it = '#include "stm32h7s78_dk.h"\n' + it.replace('HAL_GPU2D_IRQHandler(&hgpu2d);', 'HAL_GPU2D_IRQHandler(&hgpu2d);\n  lge_h7_gpu_interrupt();')
write_changed(out / 'stm32h7rsxx_it.c', it)
app_linker = (port / 'STM32CubeIDE/Appli/STM32H7S7L8HXH_RAMxspi1_ROMxspi2.ld').read_text()
app_linker = app_linker.replace('*(Nemagfx_Memory_Pool_Buffer Nemagfx_Memory_Pool_Buffer.*)', '*(Nemagfx_Memory_Pool_Buffer Nemagfx_Memory_Pool_Buffer.*)\n    . = ALIGN(32);\n    KEEP(*(LgeTelemetry))')
app_linker = app_linker.replace('*(Framebuffer Framebuffer.*)', '*(Framebuffer Framebuffer.*)\n    . = ALIGN(32);\n    *(LgeTerrainCache)')
write_changed(out / 'appli.ld', app_linker)
checkpoint_enabled = (ui / 'ports/checkpoint_flash.c').exists()
boot_linker = next((port / 'STM32CubeIDE/Boot').glob('*.ld'))
if checkpoint_enabled:
    (text, count) = re.subn('(\\bFLASH\\s+\\(xrw\\)\\s*:\\s*ORIGIN\\s*=\\s*0x08000000,\\s*LENGTH\\s*=\\s*)0x00010000', '\\g<1>0x0000C000', boot_linker.read_text())
    if count != 1:
        raise RuntimeError('Pinned boot linker changed; checkpoint reservation not applied')
    boot_linker = out / 'boot.ld'
    write_changed(boot_linker, text)
    marker = 'void BusFault_Handler(void)'
    begin = it.index(marker)
    brace = it.index('{', begin)
    (depth, end) = (1, brace + 1)
    while depth:
        depth += (it[end] == '{') - (it[end] == '}')
        end += 1
    handler = '__attribute__((naked)) void BusFault_Handler(void)\n{\n  __asm volatile("tst lr, #4\\n"\n                 "ite eq\\n"\n                 "mrseq r0, msp\\n"\n                 "mrsne r0, psp\\n"\n                 "tst lr, #16\\n"\n                 "it eq\\n"\n                 "addeq r0, r0, #72\\n"\n                 "b lge_h7_checkpoint_busfault");\n}'
    write_changed(out / 'stm32h7rsxx_it.c', it[:begin] + handler + it[end:])
(out / 'toolchain.cmake').write_text('set(CMAKE_SYSTEM_NAME Generic)\nset(CMAKE_SYSTEM_PROCESSOR arm)\nset(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)\nset(CMAKE_C_COMPILER "{gcc}")\nset(CMAKE_CXX_COMPILER "{gxx}")\nset(CMAKE_ASM_COMPILER "{gcc}")\n'.format(gcc=shutil.which('arm-none-eabi-gcc'), gxx=shutil.which('arm-none-eabi-g++')))

def quote(path):
    return '"' + str(path).replace('\\', '/') + '"'

def linked_sources(kind):
    project = port / f'STM32CubeIDE/{kind}'
    sources = []
    for link in ET.parse(project / '.project').findall('.//linkedResources/link'):
        location = link.findtext('locationURI', '')
        if location.startswith('PARENT-2-PROJECT_LOC/'):
            source = port / location.split('/', 1)[1]
            if kind == 'Appli' and source.name in ['main.c', 'stm32h7rsxx_it.c']:
                source = out / source.name
            if source.suffix in ['.c', '.s', '.S']:
                sources.append(source)
    sources += list((project / 'Application').rglob('*.c'))
    sources += list((project / 'Application').rglob('*.s'))
    return sources
hal = port / 'Drivers/STM32H7RSxx_HAL_Driver'
common_inc = [hal / 'Inc', hal / 'Inc/Legacy', port / 'Drivers/CMSIS/Include', port / 'Drivers/CMSIS/Device/ST/STM32H7RSxx/Include']
app_inc = common_inc + [port / 'Appli/Core/Inc', out, lvgl.parent, lvgl, lvgl / 'libs/nema_gfx/include', ui, ui / 'ports', ui / 'engine']
if hardware_adc:
    app_inc.insert(0, ui / 'ports/vendor/adc')
boot_inc = common_inc + [port / 'Boot/Core/Inc']
manager = port / 'Middlewares/ST/STM32_ExtMem_Manager'
boot_inc += [manager] + [d for d in manager.rglob('*') if d.is_dir()]
lvgl_sources = sorted((lvgl / 'src').rglob('*.c'))
if a.renderer == 'neochrom' and a.optimization == 'speed':
    original_nema_image = lvgl / 'src/draw/nema_gfx/lv_draw_nema_gfx_img.c'
    prepared_nema_image = out / 'lv_draw_nema_gfx_img.c'
    image_source = prepare_nema_image(original_nema_image.read_text())
    image_source = image_source.replace('#include "lv_draw_nema_gfx.h"', '#include ' + quote(original_nema_image.with_name('lv_draw_nema_gfx.h')))
    write_changed(prepared_nema_image, image_source)
    lvgl_sources = [prepared_nema_image if source == original_nema_image else source for source in lvgl_sources]
cmake = 'cmake_minimum_required(VERSION 3.20)\nproject(lge_h7 C CXX ASM)\nset(CMAKE_C_STANDARD 99)\nadd_compile_options(-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard -Os -ffunction-sections -fdata-sections)\nadd_link_options(-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard --specs=nano.specs --specs=nosys.specs -Wl,--gc-sections -Wl,--print-memory-usage)\nadd_compile_definitions(USE_HAL_DRIVER STM32H7S7xx)\n'
if a.renderer == 'software':
    cmake += 'add_compile_definitions(LGE_H7_SOFTWARE_COMPARE=1 LGE_REQUIRE_NEOCHROM=0)\n'
cmake += 'add_library(lvgl STATIC\n' + '\n'.join(map(quote, lvgl_sources)) + '\n)\n'
cmake += 'target_include_directories(lvgl PUBLIC ' + ' '.join(map(quote, app_inc)) + ')\n'
cmake += 'target_compile_definitions(lvgl PUBLIC LV_CONF_INCLUDE_SIMPLE)\n'
cmake += f'add_compile_definitions(LGE_H7_TERRAIN_CACHE_BYTES={a.terrain_cache_kib * 1024})\n'
cmake += f'add_subdirectory({quote(ui)} ui-build)\n'
if a.optimization == 'speed':
    cmake += 'target_compile_options(lvgl PRIVATE -O2)\n'
    cmake += 'target_compile_options(lvgl_game_ui PRIVATE -O2)\n'
for (kind, name, inc) in [('Boot', 'boot', boot_inc), ('Appli', 'appli', app_inc)]:
    sources = linked_sources(kind)
    if kind == 'Appli':
        sources.append(ui / 'ports/stm32h7s78_dk.c')
        if hardware:
            sources += [ui / 'ports/hardware_inputs.c', ui / 'ports/hardware_inputs_config.c', ui / 'ports/input_debounce.c']
        if hardware_adc:
            sources += [ui / 'ports/vendor/adc/stm32h7rsxx_hal_adc.c', ui / 'ports/vendor/adc/stm32h7rsxx_hal_adc_ex.c']
        if a.input_monitor:
            sources += [ui / 'ports/input_monitor.c', ui / 'ports/input_monitor_text.c']
        if a.debug_swd:
            sources += [ui / 'ports/debug_swd.c', ui / 'ports/debug_mailbox.c']
        if checkpoint_enabled:
            sources += [ui / 'ports/checkpoint_flash.c', ui / 'ports/checkpoint_journal.c']
    cmake += f'add_executable({name}.elf\n' + '\n'.join(map(quote, sources)) + '\n)\n'
    cmake += f'target_include_directories({name}.elf PRIVATE ' + ' '.join(map(quote, inc)) + ')\n'
    linker = out / 'appli.ld' if kind == 'Appli' else boot_linker
    cmake += f'target_link_options({name}.elf PRIVATE "-T{linker}" -Wl,-Map={name}.map)\n'
    if kind == 'Appli':
        if hardware:
            cmake += 'target_compile_definitions(appli.elf PRIVATE LGE_H7_HARDWARE_INPUTS=1)\n'
        if hardware_adc:
            cmake += 'target_compile_definitions(appli.elf PRIVATE HAL_ADC_MODULE_ENABLED)\n'
        if a.input_monitor:
            cmake += 'target_compile_definitions(appli.elf PRIVATE LGE_H7_INPUT_MONITOR=1)\n'
        if a.debug_swd:
            cmake += 'target_compile_definitions(appli.elf PRIVATE LGE_H7_DEBUG_SWD=1 ' + ' '.join((f'LGE_SWD_TAG{i}=0x{tag:08x}u' for (i, tag) in enumerate(swd_tag))) + ')\n'
        if a.profile_2d:
            cmake += 'target_compile_definitions(appli.elf PRIVATE LGE_H7_BENCHMARK=1)\n'
        lib = lvgl / 'libs/nema_gfx/lib/core/cortex_m7/gcc/libnemagfx-float-abi-hard.a'
        cmake += f'target_link_libraries({name}.elf PRIVATE "-Wl,--start-group" lvgl_game_ui lvgl {quote(lib)} m "-Wl,--end-group")\n'
    else:
        cmake += f'target_link_libraries({name}.elf PRIVATE m)\n'
    cmake += f'add_custom_command(TARGET {name}.elf POST_BUILD COMMAND arm-none-eabi-objcopy -O binary $<TARGET_FILE:{name}.elf> {name}.bin COMMAND arm-none-eabi-size $<TARGET_FILE:{name}.elf>)\n'
(out / 'CMakeLists.txt').write_text(cmake)
run('cmake', '-S', out, '-B', out / 'build', '-G', 'Ninja', f"-DCMAKE_TOOLCHAIN_FILE={out / 'toolchain.cmake'}")
if checkpoint_enabled:
    run('cmake', '--build', out / 'build', '--target', 'boot.elf', '--parallel', '6')
    boot_image = (out / 'build/boot.bin').read_bytes()
    if not 0 < len(boot_image) <= 49152:
        raise RuntimeError('Boot image overlaps checkpoint sectors')
    write_changed(out / 'h7_checkpoint_layout.h', '#define LGE_H7_BOOT_BYTES ' + str(len(boot_image)) + 'u\n' + '#define LGE_H7_BOOT_CRC32 0x' + format(zlib.crc32(boot_image), '08x') + 'u\n')
run('cmake', '--build', out / 'build', '--parallel', '6')
map_text = (out / 'build/appli.map').read_text()
required = ['lv_draw_nema_gfx_init', 'nema_sys_init', 'nema_bind_lut_tex', 'HAL_GPU2D_CommandListCpltCallback', 'Nemagfx_Memory_Pool_Buffer', 'Framebuffer']
if a.renderer == 'software':
    required = ['Framebuffer', 'lge_h7_telemetry']
for symbol in required:
    if symbol not in map_text:
        raise RuntimeError(f'Acceleration integration missing from application map: {symbol}')
symbols = subprocess.check_output(['arm-none-eabi-nm', '-g', '--defined-only', str(out / 'build/appli.elf')], text=True)
telemetry = re.search('^([0-9a-fA-F]+) [A-Za-z] lge_h7_telemetry$', symbols, re.M).group(1)
image_checks = []
all_symbols = subprocess.check_output(['arm-none-eabi-nm', '-S', '--defined-only', str(out / 'build/appli.elf')], text=True)
if checkpoint_enabled:
    guarded_load = subprocess.check_output(['arm-none-eabi-objdump', '-d', '--disassemble=read_word', str(out / 'build/appli.elf')], text=True)
    if not re.search('\\b6800\\s+ldr\\s+r0,\\s*\\[r0', guarded_load) or not re.search('\\b4770\\s+bx\\s+lr', guarded_load):
        raise RuntimeError('Checkpoint ECC recovery requires the reviewed 16-bit LDR/BX sequence')
if image_manifest:
    texture_symbols = {name: (int(address, 16), int(size, 16)) for (address, size, name) in re.findall('^([0-9a-fA-F]+) ([0-9a-fA-F]+) [rR] (game_image_\\d+_data)$', all_symbols, re.M)}
    for image in image_manifest['images']:
        name = image['symbol'] + '_data'
        (address, size) = texture_symbols.get(name, (0, 0))
        if address % image_manifest['alignment'] or size != image['bytes'] or (not 1879048192 <= address < address + size <= 2013265920):
            raise RuntimeError(f'GPU image address/size/alignment check failed: {name}')
        image_checks.append({'symbol': name, 'address': hex(address), 'bytes': size})
cache_symbol = re.search('^([0-9a-fA-F]+) ([0-9a-fA-F]+) [bB] h7_terrain_pixels$', all_symbols, re.M)
cache_address = int(cache_symbol.group(1), 16) if cache_symbol else None
cache_bytes = a.terrain_cache_kib * 1024 if cache_symbol else 0
if cache_symbol and int(cache_symbol.group(2), 16) != cache_bytes:
    raise RuntimeError('Terrain cache size differs from the requested budget')
if cache_address is not None and (cache_address % 32 or not 2415919104 <= cache_address < cache_address + cache_bytes <= 2449473536):
    raise RuntimeError('Terrain cache is outside the board external PSRAM')
benchmark_symbol = re.search('^([0-9a-fA-F]+) [A-Za-z] lge_h7_benchmark_mode$', symbols, re.M)
benchmark_state = re.search('^([0-9a-fA-F]+) [A-Za-z] lge_h7_benchmark_state$', symbols, re.M)
swd_symbol = re.search('^([0-9a-fA-F]+) ([0-9a-fA-F]+) [bB] lge_h7_swd_mailbox$', all_symbols, re.M)
if a.debug_swd and (not swd_symbol or int(swd_symbol.group(2), 16) != 512 or (not 604422144 <= int(swd_symbol.group(1), 16) <= 604446720 - 512)):
    raise RuntimeError('SWD mailbox must fit uncached RAM_CMD')
report = {'debugSwd': {'address': '0x' + swd_symbol.group(1), 'bytes': 512, 'version': 1, 'magic': '0x4c475357', 'buildTag': swd_tag, 'requestWords': 32, 'responseWords': 96, 'maximumLeaseMs': 120000} if swd_symbol else None, 'telemetryAddress': '0x' + telemetry, 'benchmarkControlAddress': '0x' + benchmark_symbol.group(1) if benchmark_symbol else None, 'benchmarkStateAddress': '0x' + benchmark_state.group(1) if benchmark_state else None, 'terrainCache': {'pixelBytes': cache_bytes, 'address': hex(cache_address) if cache_address else None, 'metadataAllowanceBytes': 8192 if cache_bytes else 0}, 'benchmarkEnabled': a.profile_2d, 'fpsTarget': a.fps, 'compiler': subprocess.check_output(['arm-none-eabi-gcc', '--version'], text=True).splitlines()[0], 'optimization': {'engineAndLvgl': '-O2' if a.optimization == 'speed' else '-Os', 'boardHalAndBoot': '-Os', 'objectStyleCache': a.optimization == 'speed', 'serviceLoop': 'single-tick HAL polling' if a.optimization == 'speed' else 'vendor HAL_Delay(1)', 'fastMath': False, 'lto': False, 'opaqueNearestXrgb8888Copy': a.renderer == 'neochrom' and a.optimization == 'speed', 'opaqueNearestRgb565Copy': a.renderer == 'neochrom' and a.optimization == 'speed'}, 'accelerationMapSymbols': required, 'framebufferBytes': 1536000, 'nemaPoolBytes': 10240 if a.renderer == 'neochrom' else 0, 'portCommit': COMMIT, 'lvglCommit': subprocess.check_output(['git', '-C', str(lvgl), 'rev-parse', 'HEAD'], text=True).strip(), 'board': 'STM32H7S78-DK', 'display': [800, 480], 'renderer': 'NeoChrom M7' if a.renderer == 'neochrom' else 'Software comparison', 'dma2d': 'LTDC flush', 'hardwareTested': False, 'applicationOptionBytes': 'read-only compatibility check', 'hardwareInputs': hardware, 'inputMonitor': {'enabled': a.input_monitor, 'transport': 'UART4 TX / ST-LINK VCP', 'baud': 115200, 'packetBytes': 512, 'minimumPeriodMs': 50, 'serialCommands': False}, 'checkpoints': {'enabled': checkpoint_enabled, 'address': '0x0800c000' if checkpoint_enabled else None, 'bytes': 16384 if checkpoint_enabled else 0, 'protectedBootBytes': 49152, 'maxPacketBytes': 4096, 'policy': 'two-sector append journal; last commit survives interrupted replacement'}, 'imagePacking': image_manifest['packing'] if image_manifest else 'legacy', 'imageAlignment': image_manifest['alignment'] if image_manifest else None, 'imageBytes': sum((image['bytes'] for image in image_checks)), 'imageAddressesVerified': image_checks, 'outputs': {name: (out / 'build' / name).stat().st_size for name in ['boot.bin', 'appli.bin']}, 'outputSha256': {name: hashlib.sha256((out / 'build' / name).read_bytes()).hexdigest() for name in ['boot.bin', 'appli.bin']}}
(out / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
