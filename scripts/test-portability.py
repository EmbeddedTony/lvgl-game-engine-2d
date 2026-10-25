#!/usr/bin/env python3
"""Compile/link portable core math with actual ARM ABIs. No board access or flashing."""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
out = ROOT / '.cache/portability'
out.mkdir(parents=True, exist_ok=True)
candidates = [os.environ.get('LGE_ARM_CC'), shutil.which('arm-none-eabi-gcc')]
candidates += [str(p) for p in sorted(Path('/Applications/STM32CubeIDE.app/Contents/Eclipse/plugins').glob('com.st.stm32cube.ide.mcu.externaltools.gnu-tools-for-stm32.*/tools/bin/arm-none-eabi-gcc'), reverse=True)]
compiler = None
for candidate in filter(None, candidates):
    probe = subprocess.run([candidate, '-E', '-x', 'c', '-'], input='#include <stdint.h>\n#include <math.h>\n', text=True, capture_output=True)
    if probe.returncode == 0:
        compiler = candidate
        break
if not compiler:
    raise SystemExit('Install ARM GNU/newlib or set LGE_ARM_CC to a complete toolchain.')
main = out / 'main.c'
main.write_text('''#include "lge.h"
#include "lge_input_codec.h"
static lge_inputs_t inputs;
static lge_input_serial_t parser;
static const lge_input_source_t input_source[]={{256}};
static const lge_input_def_t input_def[]={{.id="axis",.type=LGE_VALUE_INT,.binding=LGE_INPUT_BIND_MOVE_X,.maximum=4095,.center=2048,.press=.6f,.release=.4f,.encoding=LGE_WIRE_U16_LE}};
static lge_engine_t game;
static const lge_node_def_t nodes[]={{.id="hero",.kind=LGE_RECT,.player=true,.visible=true,.width=8,.height=8,.speed=32}};
static const lge_scene_def_t scene={.id="main",.width=64,.height=64,.count=1,.nodes=nodes};
int main(void) {
    lge_init(&game,0,0,0);
    if(!lge_load(&game,&scene)) return 1;
    if(!lge_inputs_init(&inputs,input_def,1,input_source,1,0))return 2;
    lge_inputs_serial_feed(&inputs,&parser,0,"axis=4095\\n",10);
    const uint8_t report[]={0xff,0xf};lge_inputs_report(&inputs,0,report,2);
    lge_input_frame_t input=lge_inputs_poll(&inputs,1,16);
    lge_set_controller_input(&game,input.actions,input.pressed,input.x,input.y);
    lge_set_input(&game,LGE_INPUT_RIGHT);
    lge_update(&game,16);
    lge_destroy(&game);
    return 0;
}
''')
profiles = {
    'm0plus-soft': ['-mcpu=cortex-m0plus', '-mfloat-abi=soft'],
    'm7-hard': ['-mcpu=cortex-m7', '-mfpu=fpv5-d16', '-mfloat-abi=hard'],
}
results = {}
for name, cpu in profiles.items():
    elf = out / (name + '.elf')
    command = [compiler, '-std=c99', '-mthumb', *cpu, '-Os', '-ffunction-sections', '-fdata-sections',
        '-Wall', '-Wextra', '-Werror', '-Wdouble-promotion', '-Iengine',
        '-DLGE_MAX_NODES=4',  '-fstack-usage', '-nostartfiles',
        '--specs=nano.specs', '--specs=nosys.specs', '-Wl,--gc-sections,-e,main',
        'engine/lge_inputs.c', 'engine/lge_input_codec.c', 'engine/lge.c', 'engine/lge_physics.c', 'engine/lge_melee.c', 'engine/lge_gameplay.c', str(main), '-lm', '-o', str(elf)]
    subprocess.run(command, check=True)
    size = subprocess.check_output([str(Path(compiler).with_name('arm-none-eabi-size')), str(elf)], text=True)
    assembly = subprocess.check_output([str(Path(compiler).with_name('arm-none-eabi-objdump')), '-d', str(elf)], text=True)
    if name == 'm0plus-soft':
        assert '__aeabi_fadd' in assembly, 'Missing software floating-point support'
    else:
        assert 'vadd.f32' in assembly or 'vmul.f32' in assembly, 'Missing hardware FPU instructions'
    fields = size.splitlines()[-1].split()
    results[name] = dict(text=int(fields[0]), data=int(fields[1]), bss=int(fields[2]), abi=cpu)
sizes = {}
layout = out / 'layout.c'
layout.write_text('#include "lge.h"\nunsigned char lge_engine_storage[sizeof(lge_engine_t)];\n')
for capacity in (8, 88, 128):
    obj = out / ('layout-' + str(capacity) + '.o')
    subprocess.run([compiler, '-mcpu=cortex-m7', '-mthumb', '-mfpu=fpv5-d16', '-mfloat-abi=hard',
        '-Iengine', '-DLGE_MAX_NODES='+str(capacity), '-c', str(layout), '-o', str(obj)], check=True)
    symbols = subprocess.check_output([str(Path(compiler).with_name('arm-none-eabi-nm')), '-S', str(obj)], text=True)
    symbol = next(line for line in symbols.splitlines() if line.endswith(' lge_engine_storage'))
    sizes[str(capacity)] = int(symbol.split()[1], 16)
report = dict(compiler=compiler, profiles=results, engine_bytes_arm_32bit=sizes, hardware_execution=False,
    scope='Core-only bare link; no LVGL/BSP/boot image or hardware initialization. Four node slots; portable scalar math uses the matching soft/hard-float ABI.')
(ROOT / 'evidence/optimization-portability.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
