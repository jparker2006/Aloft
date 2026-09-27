#!/usr/bin/env bash
# Captures from a frozen copy of the working tree, so edits made while a slow capture runs cannot leak
# into it. Outputs (captures/, docs/critiques/, baselines) still land in the real tree.
# Usage: npm run capture:snapshot -- [capture options]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
snap="$(mktemp -d "${TMPDIR:-/tmp}/aloft-snap-XXXXXX")"
tar -C "$root" --exclude=./node_modules --exclude=./captures --exclude=./.git --exclude=./reference -cf - . | tar -C "$snap" -xf -
ln -s "$root/node_modules" "$snap/node_modules"
trap 'rm -rf "$snap"' EXIT
node "$root/tools/capture/capture.mjs" --root "$snap" "$@"
