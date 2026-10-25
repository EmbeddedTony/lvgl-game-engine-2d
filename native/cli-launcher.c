/* macOS CLI entry point: a Mach-O helper can be sealed and signed with the app. */
#include <errno.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#ifndef LGE_APP_EXECUTABLE
#error Define the packaged application executable name
#endif
int main(int argc, char **argv) {
    char raw[PATH_MAX], resolved[PATH_MAX], executable[PATH_MAX], runner[PATH_MAX];
    uint32_t size = sizeof(raw);
    if (_NSGetExecutablePath(raw, &size) || !realpath(raw, resolved)) {
        fprintf(stderr, "Cannot locate packaged CLI: %s\n", strerror(errno));
        return 6;
    }
    char *slash = strrchr(resolved, '/');
    if (!slash) return 6;
    *slash = '\0';
    int a = snprintf(executable, sizeof(executable), "%s/%s", resolved, LGE_APP_EXECUTABLE);
    int b = snprintf(runner, sizeof(runner), "%s/../Resources/app.asar/desktop/cli-runner.cjs", resolved);
    if (a < 0 || (size_t)a >= sizeof(executable) || b < 0 || (size_t)b >= sizeof(runner)) return 6;
    char **arguments = calloc((size_t)argc + 2, sizeof(*arguments));
    if (!arguments || setenv("ELECTRON_RUN_AS_NODE", "1", 1)) { free(arguments); return 6; }
    arguments[0] = executable;
    arguments[1] = runner;
    for (int i = 1; i < argc; ++i) arguments[i + 1] = argv[i];
    execv(executable, arguments);
    fprintf(stderr, "Cannot start packaged CLI: %s\n", strerror(errno));
    free(arguments);
    return 6;
}
