#include "input_monitor_text.h"
#include "lge_input_codec.h"
#include <assert.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

/* Exercise the actual firmware decimal formatter through the actual fragmented
 * serial decoder, including float32 values that need nine significant digits. */
int main(void) {
    const lge_input_def_t defs[] = {
        {.id="integer", .source=0, .type=LGE_VALUE_INT, .minimum=-2147483648.0f, .maximum=2147483647.0f, .press=.6f, .release=.4f},
        {.id="real", .source=0, .type=LGE_VALUE_FLOAT, .minimum=-1, .maximum=1, .press=.6f, .release=.4f},
        {.id="pressed", .source=0, .type=LGE_VALUE_BOOL, .minimum=0, .maximum=1, .press=.6f, .release=.4f}
    };
    const lge_input_source_t source = {256};
    lge_inputs_t bank;
    assert(lge_inputs_init(&bank,defs,3,&source,1,NULL));
    lge_input_serial_t parser = {0};
    const lge_input_value_t values[] = {{.integer=INT32_MIN},{.integer=INT32_MAX},
        {.real=FLT_MIN},{.real=FLT_MAX},{.real=-0.0f},{.real=1.00000012f},
        {.boolean=true},{.boolean=false}};
    for (unsigned i=0;i<sizeof(values)/sizeof(values[0]);i++) {
        unsigned channel=i<2?0:i<6?1:2;
        char line[96];
        size_t n=lge_monitor_line(line,sizeof(line),defs[channel].id,defs[channel].type,values[i]);
        assert(n>0 && line[n-1]=='\n');
        for(size_t k=0;k<n;k++) assert(lge_inputs_serial_feed(&bank,&parser,0,line+k,1)==(k==n-1));
        lge_inputs_poll(&bank,100+i,1);
        lge_input_value_t actual;
        assert(lge_inputs_read(&bank,channel,defs[channel].type,&actual));
        if(channel==0)assert(actual.integer==values[i].integer);
        if(channel==1)assert(memcmp(&actual.real,&values[i].real,sizeof(float))==0);
        if(channel==2)assert(actual.boolean==values[i].boolean);
    }
    char line[96];
    assert(!lge_monitor_line(line,4,"integer",LGE_VALUE_INT,values[0]));
    assert(line[0]==0);
    assert(!lge_monitor_line(line,sizeof(line),"bad\ninjected",LGE_VALUE_INT,values[0]));
    assert(!lge_monitor_line(line,sizeof(line),"real",LGE_VALUE_FLOAT,(lge_input_value_t){.real=NAN}));
    uint32_t seed = 0x31415926;
    for (unsigned i=0;i<8192;i++) {
        seed = seed * 1664525u + 1013904223u;
        float raw; memcpy(&raw,&seed,4);
        if (!isfinite(raw)) continue;
        size_t n=lge_monitor_line(line,sizeof(line),"real",LGE_VALUE_FLOAT,(lge_input_value_t){.real=raw});
        assert(n && lge_inputs_serial_feed(&bank,&parser,0,line,n)==1);
        lge_inputs_poll(&bank,1000+i,1);
        lge_input_value_t actual;
        assert(lge_inputs_read(&bank,1,LGE_VALUE_FLOAT,&actual));
        assert(memcmp(&actual.real,&raw,4)==0);
    }
    puts("Firmware monitor text round-trips exact int32, float32 and bool through fragmented C serial decoding.");
}
