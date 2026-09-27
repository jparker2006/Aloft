#!/usr/bin/env bash
# Runs a Blender Python script headless with the pinned Blender.
#
# Usage: tools/blender/run.sh <script.py> [-- script args]
# Example: tools/blender/run.sh tools/blender/graybox_ship.py -- --out public/assets/graybox_ship.glb
#
# With a real Blender binary this is exactly `blender -b --factory-startup -P <script> -- args`.
# Without one it runs the same script through the bpy module installed by install.sh.
# A Python exception in the script always gives a non-zero exit code.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="$(tr -d '[:space:]' < "$here/VERSION")"
venv="${ALOFT_BLENDER_HOME:-$HOME/.local/share/aloft-blender}"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <script.py> [-- script args]" >&2
  exit 2
fi
script="$1"; shift
if [[ "${1:-}" == "--" ]]; then shift; fi

bin="${BLENDER_BIN:-$(command -v blender || true)}"
if [[ -n "$bin" ]] && "$bin" --version 2>/dev/null | head -1 | grep -q "Blender $version"; then
  exec "$bin" -b --factory-startup --python-exit-code 1 -P "$script" -- "$@"
fi

if [[ ! -x "$venv/bin/python" ]]; then
  echo "[blender] Blender $version not found. Run tools/blender/install.sh first." >&2
  exit 1
fi
exec "$venv/bin/python" "$here/bpy_cli.py" "$script" -- "$@"
