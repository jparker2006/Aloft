"""Shared helpers for Aloft's headless Blender asset scripts.

Every script starts from factory settings, takes its output path after `--`, and writes deterministic
results (fixed seeds, no dependence on a saved .blend).
"""

import argparse
import sys

import bpy


def parse_args(defaults: dict) -> argparse.Namespace:
    """Parses arguments after the `--` separator (Blender's own arguments come before it)."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    for name, value in defaults.items():
        parser.add_argument(f"--{name}", type=type(value), default=value)
    return parser.parse_args(argv)


def reset_scene() -> bpy.types.Scene:
    """Empties the scene and returns it, starting from factory settings."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def use_cycles_cpu(scene: bpy.types.Scene, samples: int = 1) -> None:
    """Configures Cycles on the CPU with a fixed seed, for deterministic bakes."""
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.cycles.use_denoising = False
