#!/usr/bin/env bash
# Installs the pinned Blender for headless asset builds. Safe to rerun.
#
# Prefers a real Blender binary of the pinned version (BLENDER_BIN or `blender` on PATH).
# Otherwise installs the official bpy module from PyPI into a private venv, which
# tools/blender/run.sh then drives with the same `-b -P script -- args` contract.
#
# Env:
#   ALOFT_BLENDER_HOME  venv location (default: ~/.local/share/aloft-blender)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="$(tr -d '[:space:]' < "$here/VERSION")"
venv="${ALOFT_BLENDER_HOME:-$HOME/.local/share/aloft-blender}"

bin="${BLENDER_BIN:-$(command -v blender || true)}"
if [[ -n "$bin" ]] && "$bin" --version 2>/dev/null | head -1 | grep -q "Blender $version"; then
  echo "[blender] using binary $bin (Blender $version)"
  exit 0
fi

if [[ -x "$venv/bin/python" ]] && "$venv/bin/python" -c "import bpy, sys; sys.exit(0 if bpy.app.version_string.startswith('$version') else 1)" 2>/dev/null; then
  echo "[blender] bpy $version already installed in $venv"
  exit 0
fi

py="$(command -v python3.13 || true)"
if [[ -z "$py" ]]; then
  echo "[blender] bpy $version needs Python 3.13, which was not found" >&2
  exit 1
fi

echo "[blender] installing bpy $version into $venv"
rm -rf "$venv"
if command -v uv >/dev/null; then
  uv venv --quiet --python "$py" "$venv"
  uv pip install --quiet --python "$venv/bin/python" "bpy==$version"
else
  "$py" -m venv "$venv"
  "$venv/bin/pip" install --quiet "bpy==$version"
fi
"$venv/bin/python" -c "import bpy; print('[blender] installed', bpy.app.version_string)"
