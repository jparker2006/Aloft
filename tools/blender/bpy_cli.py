"""Runs a Blender script through the bpy module with the same argv shape as `blender -b -P`.

Scripts read their own arguments after the `--` separator, so they behave identically
under a real Blender binary and under this shim.
"""

import runpy
import sys

import bpy


def main() -> None:
    script = sys.argv[1]
    rest = sys.argv[2:]
    if rest and rest[0] == "--":
        rest = rest[1:]
    sys.argv = ["blender", "-b", "--factory-startup", "-P", script, "--", *rest]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main()
