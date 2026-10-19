#!/usr/bin/env bash
# Build helper macOS universal → helpers/mac/bin/camguard-helper-mac
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/helpers/mac"
BIN="$PKG/bin"
mkdir -p "$BIN"

if ! command -v swift >/dev/null 2>&1; then
  echo "Không tìm thấy swift. Cài Xcode Command Line Tools: xcode-select --install" >&2
  exit 1
fi

echo "[helper:mac] swift build universal (arm64 + x86_64)"
cd "$PKG"
swift build -c release --arch arm64 --arch x86_64

BUILT="$PKG/.build/apple/Products/Release/camguard-helper-mac"
if [ ! -f "$BUILT" ]; then
  # fallback đường dẫn một kiến trúc
  BUILT="$(find "$PKG/.build" -name camguard-helper-mac -type f | head -n1)"
fi
if [ -z "${BUILT:-}" ] || [ ! -f "$BUILT" ]; then
  echo "Không thấy binary output" >&2
  exit 1
fi

cp "$BUILT" "$BIN/camguard-helper-mac"
chmod +x "$BIN/camguard-helper-mac"
echo "[helper:mac] xong → helpers/mac/bin/camguard-helper-mac"
