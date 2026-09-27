"""Bakes Aloft's tileable, wind-aligned sea foam texture.

Usage: tools/blender/run.sh tools/blender/foam_texture.py -- --out public/assets/tex/foam.png

Channels (linear data, not color):
  R  foam lace: the network of bright bubble walls that sea foam forms (Voronoi distance to edge)
  G  fine bubbles: small, dense cells for close-up detail
  B  wind streaks: long thin lines along +U, the direction the wind blows foam
  A  breakup: low-frequency mask that thins foam into patches

Tiling: every noise is sampled in 4D on a torus, (cos u, sin u, cos v) * R with W = sin v * R, so the
texture repeats seamlessly. A smaller torus radius along U than V stretches features along U, which is
how the streak channel gets its direction.
"""

import json
import math
import os

import bpy

from common import parse_args, reset_scene, use_cycles_cpu


def torus_coords(nodes, links, uv_out, radius_u: float, radius_v: float):
    """Returns (vector, w) sockets for a point on a 4D torus parameterised by the UV coordinates."""
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(uv_out, sep.inputs[0])

    def angle(socket):
        m = nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        m.inputs[1].default_value = 2 * math.pi
        links.new(socket, m.inputs[0])
        return m.outputs[0]

    def trig(socket, op, radius):
        t = nodes.new("ShaderNodeMath")
        t.operation = op
        links.new(socket, t.inputs[0])
        s = nodes.new("ShaderNodeMath")
        s.operation = "MULTIPLY"
        s.inputs[1].default_value = radius
        links.new(t.outputs[0], s.inputs[0])
        return s.outputs[0]

    au = angle(sep.outputs[0])
    av = angle(sep.outputs[1])
    combine = nodes.new("ShaderNodeCombineXYZ")
    links.new(trig(au, "COSINE", radius_u), combine.inputs[0])
    links.new(trig(au, "SINE", radius_u), combine.inputs[1])
    links.new(trig(av, "COSINE", radius_v), combine.inputs[2])
    return combine.outputs[0], trig(av, "SINE", radius_v)


def voronoi(nodes, links, coords, feature: str, scale: float, randomness: float = 1.0, output="Distance"):
    vec, w = coords
    v = nodes.new("ShaderNodeTexVoronoi")
    v.voronoi_dimensions = "4D"
    v.feature = feature
    v.inputs["Scale"].default_value = scale
    v.inputs["Randomness"].default_value = randomness
    links.new(vec, v.inputs["Vector"])
    links.new(w, v.inputs["W"])
    return v.outputs[output]


def noise(nodes, links, coords, scale: float, detail: float, roughness: float):
    vec, w = coords
    n = nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = "4D"
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = roughness
    links.new(vec, n.inputs["Vector"])
    links.new(w, n.inputs["W"])
    return n.outputs["Fac"]


def remap(nodes, links, socket, from_min, from_max, to_min=0.0, to_max=1.0):
    m = nodes.new("ShaderNodeMapRange")
    m.clamp = True
    m.inputs["From Min"].default_value = from_min
    m.inputs["From Max"].default_value = from_max
    m.inputs["To Min"].default_value = to_min
    m.inputs["To Max"].default_value = to_max
    links.new(socket, m.inputs["Value"])
    return m.outputs["Result"]


def build_material(image: bpy.types.Image, channel: str) -> bpy.types.Material:
    """Emission material whose output is one channel of the foam texture, as grey."""
    mat = bpy.data.materials.new(f"foam_{channel}")
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    tex_coord = nodes.new("ShaderNodeTexCoord")
    uv = tex_coord.outputs["UV"]

    if channel == "R":
        # Lace: thin bright walls between medium bubbles, warped slightly so cells are not uniform.
        coords = torus_coords(nodes, links, uv, 1.0, 1.0)
        edge = voronoi(nodes, links, coords, "DISTANCE_TO_EDGE", 4.2, 1.0)
        value = remap(nodes, links, edge, 0.0, 0.11, 1.0, 0.0)
    elif channel == "G":
        coords = torus_coords(nodes, links, uv, 1.0, 1.0)
        d = voronoi(nodes, links, coords, "F1", 26.0, 1.0)
        value = remap(nodes, links, d, 0.0, 0.55, 1.0, 0.0)
    elif channel == "B":
        # Streaks: long along U (radius 0.5) and narrow across V (radius 8).
        coords = torus_coords(nodes, links, uv, 0.5, 8.0)
        n = noise(nodes, links, coords, 2.2, 6.0, 0.62)
        value = remap(nodes, links, n, 0.5, 0.72)
    else:
        coords = torus_coords(nodes, links, uv, 1.0, 1.0)
        n = noise(nodes, links, coords, 1.6, 3.0, 0.5)
        value = remap(nodes, links, n, 0.36, 0.64)

    emission = nodes.new("ShaderNodeEmission")
    links.new(value, emission.inputs["Color"])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs[0], out.inputs["Surface"])
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    return mat


def bake_channel(scene, obj, size: int, channel: str):
    image = bpy.data.images.new(f"bake_{channel}", width=size, height=size, alpha=False, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    obj.data.materials.clear()
    obj.data.materials.append(build_material(image, channel))
    bpy.ops.object.bake(type="EMIT", margin=0, use_clear=True)
    return list(image.pixels)


def main() -> None:
    args = parse_args({"out": "public/assets/tex/foam.png", "size": 1024})
    scene = reset_scene()
    use_cycles_cpu(scene, samples=1)

    bpy.ops.mesh.primitive_plane_add(size=2.0)
    obj = bpy.context.active_object
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    size = args.size
    channels = {c: bake_channel(scene, obj, size, c) for c in "RGBA"}

    out = bpy.data.images.new("foam", width=size, height=size, alpha=True, float_buffer=False)
    out.colorspace_settings.name = "Non-Color"
    pixels = [0.0] * (size * size * 4)
    for i in range(size * size):
        for k, c in enumerate("RGBA"):
            pixels[i * 4 + k] = channels[c][i * 4]
    out.pixels = pixels
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    out.filepath_raw = os.path.abspath(args.out)
    out.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    out.save()
    write_manifest(args.out, size)
    print(f"[foam] wrote {args.out} ({size}x{size})")


def write_manifest(out_path: str, size: int) -> None:
    """Records the texture's color space and channel meaning in the shared texture manifest."""
    manifest_path = os.path.join(os.path.dirname(os.path.abspath(out_path)), "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    manifest[os.path.basename(out_path)] = {
        "script": "tools/blender/foam_texture.py",
        "colorSpace": "linear",
        "size": [size, size],
        "tiling": "seamless",
        "channels": {
            "r": "foam lace",
            "g": "fine bubbles",
            "b": "wind streaks along +U",
            "a": "breakup mask",
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
