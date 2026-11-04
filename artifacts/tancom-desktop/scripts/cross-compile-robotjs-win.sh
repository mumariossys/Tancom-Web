#!/usr/bin/env bash
# Cross-compile robotjs for Electron on Windows (x64) from Linux.
#
# Electron 28 is built with V8 pointer compression. A native addon compiled
# without the matching defines reads compressed values with the wrong layout
# and access-violates on the first JavaScript call (setMouseDelay), so the
# installed app exits before it opens a window. node-gyp applies these defines
# from the Electron headers' config.gypi; a hand-rolled cross-compile must
# pass them itself.
#
# Required environment:
#   WIN_SYSROOT    xwin splat (MSVC + Windows SDK), case-sensitive symlinks on
#   NODE_HEADERS   electron headers include/ directory (the parent of node/)
#   NODE_LIB       electron win-x64 node.lib (import library named node.exe)
#   NAN            path to the nan package
#   ROBOTJS_DIR    robotjs package root (contains src/ and binding sources)
#   OUT            output path for robotjs.node
# Optional:
#   CLANG          clang binary that accepts --driver-mode=cl (default clang-19)
#   DELAY_HOOK     node-gyp src/win_delay_load_hook.cc
set -euo pipefail

: "${WIN_SYSROOT:?}"
: "${NODE_HEADERS:?}"
: "${NODE_LIB:?}"
: "${NAN:?}"
: "${ROBOTJS_DIR:?}"
: "${OUT:?}"

CLANG="${CLANG:-clang-19}"
if [[ -z "${DELAY_HOOK:-}" ]]; then
  DELAY_HOOK="$(node -p "require('path').join(require('path').dirname(require.resolve('node-gyp/package.json')), 'src/win_delay_load_hook.cc')")"
fi

SDK_VER="$(basename "$(echo "$WIN_SYSROOT"/Windows\ Kits/10/Lib/*)")"
MSVC_VER="$(basename "$(echo "$WIN_SYSROOT"/VC/Tools/MSVC/*)")"
SDKLIB="$WIN_SYSROOT/Windows Kits/10/Lib/$SDK_VER"
CRTLIB="$WIN_SYSROOT/VC/Tools/MSVC/$MSVC_VER/lib/x64"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# These four V8 defines come from Electron's config.gypi via node-gyp's
# common.gypi. Omitting them is what made TanCom.Setup.1.0.0.exe exit on launch.
V8_DEFS=(
  /DV8_COMPRESS_POINTERS
  /DV8_COMPRESS_POINTERS_IN_SHARED_CAGE
  /DV8_ENABLE_SANDBOX
  /DV8_31BIT_SMIS_ON_64BIT_ARCH
  /DUSING_ELECTRON_CONFIG_GYPI
  /DBUILDING_V8_SHARED=1
  /DBUILDING_UV_SHARED=1
)

COMMON=(
  "$CLANG" --driver-mode=cl --target=x86_64-pc-windows-msvc
  /winsysroot "$WIN_SYSROOT"
  /nologo /MD /O2 /DNDEBUG
  /DWIN32 /D_WIN32 /DIS_WINDOWS
  /D_CRT_SECURE_NO_WARNINGS /D_CRT_SECURE_NO_DEPRECATE /D_CRT_NONSTDC_NO_DEPRECATE
  /DBUILDING_NODE_EXTENSION
  /DUSING_UV_SHARED=1 /DUSING_V8_SHARED=1
  /DNODE_GYP_MODULE_NAME=robotjs
  "/DHOST_BINARY=\"node.exe\""
  "${V8_DEFS[@]}"
  /I"$NODE_HEADERS/node" /I"$NAN" /I"$ROBOTJS_DIR/src"
)

for src in deadbeef_rand.c mouse.c keypress.c keycode.c screen.c screengrab.c snprintf.c MMBitmap.c; do
  "${COMMON[@]}" /std:c17 /c "/Fo$WORKDIR/${src%.c}.obj" "$ROBOTJS_DIR/src/$src"
done

"${COMMON[@]}" /std:c++17 /EHsc /c "/Fo$WORKDIR/robotjs.obj" "$ROBOTJS_DIR/src/robotjs.cc"
"${COMMON[@]}" /std:c++17 /EHsc /c "/Fo$WORKDIR/win_delay_load_hook.obj" "$DELAY_HOOK"

lld-link /nologo /DLL "/OUT:$OUT" /delayload:node.exe \
  /libpath:"$CRTLIB" \
  /libpath:"$SDKLIB/um/x64" \
  /libpath:"$SDKLIB/ucrt/x64" \
  "$WORKDIR"/*.obj \
  "$NODE_LIB" delayimp.lib user32.lib gdi32.lib kernel32.lib

echo "wrote $OUT"
