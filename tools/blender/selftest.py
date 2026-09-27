"""Smoke test for the headless Blender install.

Builds a small mesh with a part-ID UV layer, exports GLB with the project export settings,
then reads the file back and checks the generator string and attribute slots.

Usage: tools/blender/run.sh tools/blender/selftest.py -- --out /tmp/selftest.glb
"""

import argparse
import json
import struct
import sys

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def build() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    obj = bpy.context.active_object
    obj.name = "selftest_box"
    mesh = obj.data
    # The primitive already has UVMap in slot 0, so PartID lands in slot 1 (TEXCOORD_1).
    parts = mesh.uv_layers.new(name="PartID")
    for loop in parts.data:
        loop.uv = (3.0, 0.5)


def export(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="NONE",
        export_animations=False,
    )


def verify(path: str) -> None:
    with open(path, "rb") as f:
        data = f.read()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB file"
    chunk_len, _chunk_type = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20 : 20 + chunk_len])
    generator = gltf["asset"]["generator"]
    attrs = gltf["meshes"][0]["primitives"][0]["attributes"]
    assert "TEXCOORD_1" in attrs, f"part-ID UV layer missing: {sorted(attrs)}"
    assert "TEXCOORD_2" not in attrs, f"unexpected extra UV layer: {sorted(attrs)}"
    # Read the first TEXCOORD_1 value from the binary chunk and check it holds the part ID.
    accessor = gltf["accessors"][attrs["TEXCOORD_1"]]
    view = gltf["bufferViews"][accessor["bufferView"]]
    bin_start = 20 + chunk_len + 8
    offset = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    u, v = struct.unpack_from("<ff", data, offset)
    # glTF flips V (v_gltf = 1 - v_blender), so 0.5 stays 0.5.
    assert (round(u), v) == (3, 0.5), f"part ID not in TEXCOORD_1: got {(u, v)}"
    print(f"[selftest] Blender {bpy.app.version_string}")
    print(f"[selftest] generator: {generator}")
    print(f"[selftest] attributes: {sorted(attrs)}")
    print("[selftest] ok")


def main() -> None:
    args = parse_args()
    build()
    export(args.out)
    verify(args.out)


if __name__ == "__main__":
    main()
