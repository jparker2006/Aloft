# Blender asset scripts

Every 3D asset in `public/assets/` is built by a script in this folder, run headless with the Blender version pinned in `VERSION`.

## Setup

```bash
bash tools/blender/install.sh
```

- **Real binary.** If a Blender binary of the pinned version is on PATH (or in `BLENDER_BIN`), the install script uses it.
- **Fallback.** Otherwise it installs the official `bpy` module from PyPI into a private venv at `~/.local/share/aloft-blender`, which requires Python 3.13.
- **Rerunning** is safe. If the pinned version is already installed, the script does nothing.

## Running a script

```bash
tools/blender/run.sh tools/blender/<asset>.py -- --out public/assets/<asset>.glb
```

- With a real binary this is exactly `blender -b --factory-startup --python-exit-code 1 -P <script> -- args`.
- With the venv, `bpy_cli.py` gives scripts the same `sys.argv` shape.
- Either way, a Python exception exits non-zero.
- Scripts read their own arguments after `--`.

## Self-test

```bash
tools/blender/run.sh tools/blender/selftest.py -- --out /tmp/selftest.glb
```

It exports a small mesh and reads the GLB back. It checks two things:
- the exporter generator string
- that the part-ID UV layer lands in `TEXCOORD_1` with the right value

The UV-slot check is the contract drift the reference project shipped with.
