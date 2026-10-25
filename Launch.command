#!/bin/zsh
set -eu
cd "${0:A:h}"
LGE_APP="$PWD/release/mac-arm64/LVGL Game Engine 2D.app"
if [ -d "$LGE_APP" ]; then
  open "$LGE_APP"
else
  print "The desktop app has not been built. From this folder run: npm ci && npm run desktop:build"
  read -r "?Press Enter to close."
fi
