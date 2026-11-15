"""
Bakes the arm and hand that the app uses for its skin.

Run inside Blender with the MPFB (MakeHuman) add-on enabled, in a scene that
holds an MPFB human named "Human" with the default rig ("Human.rig"):

    p = r"<repository>/tools/limb/bake_limb.py"
    exec(compile(open(p).read(), p, "exec"), {"__file__": p})

It writes two files, which belong together:

    public/models/limb.bin.gz   signed distance to the skin on a regular grid
    src/lib/anatomy/limb.ts     finger joints and cross-sections of the same arm

The arm is the left one, in the anatomical position, in the app's frame:
centimetres, x from the elbow toward the hand, y toward the thumb, z toward the
palm. The body is not changed apart from its build and the pose of its left arm.
"""

import array
import gzip
import math
import os
import struct

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BIN = os.path.join(ROOT, "public", "models", "limb.bin.gz")
TS = os.path.join(ROOT, "src", "lib", "anatomy", "limb.ts")

# Build of the body: an adult man of average weight with some muscle.
BODY = dict(gender=1.0, muscle=0.72, weight=0.5, height=0.6)

SCALE = 0.94  # brings the forearm to 26.7 cm between elbow and wrist joints
ELBOW_X = -0.3  # the joint centre lies just above the flexion crease
TWIST = (1.0, 23.5)  # where along the forearm supination begins and ends, cm before scaling
CUT = -15.5  # the upper arm is taken from here…
EXTEND = -34.0  # …and carried straight up to here, clear of the shoulder
WRIST_EXTENSION = 7.0  # degrees, to lay the hand in line with the forearm
THUMB_ADDUCTION = 22.0  # degrees, to bring the thumb toward the plane of the palm
KNUCKLE_SHIFT = 1.2  # the rig bends the fingers at the web; the joint itself is this far back

GRID = 0.2  # spacing of the distance field, cm
UNIT = 0.005  # cm per stored step
GRID_X0 = -22.4
PAD = 1.0
FAR = 3.0  # distances outside the limb are not stored beyond this

rig = bpy.data.objects["Human.rig"]
human = bpy.data.objects["Human"]
Y = Vector((0, 1, 0))
Z = Vector((0, 0, 1))


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0), 1)
    return t * t * (3 - 2 * t)


def set_body():
    from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    for key, value in BODY.items():
        HumanObjectProperties.set_value(key, value, entity_reference=human)
    TargetService.reapply_macro_details(human)
    HumanService.refit(human)
    bpy.context.view_layer.update()


def straighten():
    """Extend the left elbow fully. Returns the axes of the arm and the elbow joint, in world space."""
    for pb in rig.pose.bones:
        if pb.name.endswith(".L"):
            pb.rotation_euler = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    bones = rig.data.bones
    shoulder = bones["upperarm02.L"].head_local.copy()
    elbow = bones["lowerarm01.L"].head_local.copy()
    wrist = bones["wrist.L"].head_local.copy()
    along = (elbow - shoulder).normalized()
    forearm = (wrist - elbow).normalized()
    anterior = (forearm - forearm.dot(along) * along).normalized()
    radial = anterior.cross(along).normalized()
    axis = forearm.cross(along)
    angle = math.atan2(axis.length, forearm.dot(along))
    axis.normalize()
    pb = rig.pose.bones["lowerarm01.L"]
    pb.matrix = Matrix.Translation(elbow) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-elbow) @ pb.matrix
    bpy.context.view_layer.update()
    return along, anterior, radial, elbow


def build_arm(name="ArmL"):
    """The posed arm as a closed mesh in the app's frame, with the joints of its hand."""
    along, anterior, radial, elbow = straighten()
    R = Matrix((along, radial, anterior))
    pb = rig.pose.bones

    def frame(p):
        return (R @ (Vector(p) - elbow)) * 100.0

    # Supination: turn the hand until the knuckles lie across the limb, thumb outward.
    across = frame(pb["finger2-1.L"].head) - frame(pb["finger5-1.L"].head)
    total = -math.atan2(across.z, across.y)
    ct, st = math.cos(total), math.sin(total)
    T = Matrix(((1, 0, 0), (0, ct, -st), (0, st, ct)))

    if THUMB_ADDUCTION:
        b = pb["finger1-1.L"]
        d = T @ frame(pb["finger1-2.L"].tail) - T @ frame(b.head)
        k = Vector((-d.y, d.x, 0)).normalized()  # in the plane of the palm, across the thumb
        world = (R.transposed() @ (T.transposed() @ k)).normalized()
        b.matrix = Matrix.Translation(b.head) @ Matrix.Rotation(math.radians(THUMB_ADDUCTION), 4, world) @ Matrix.Translation(-b.head) @ b.matrix
        bpy.context.view_layer.update()

    wrist_x = frame(pb["wrist.L"].head).x
    extension = math.radians(WRIST_EXTENSION)

    def shape(p):
        a = total * smoothstep(TWIST[0], TWIST[1], p.x)
        c, s = math.cos(a), math.sin(a)
        q = Vector((p.x, p.y * c - p.z * s, p.y * s + p.z * c))
        b = extension * smoothstep(wrist_x - 2.0, wrist_x + 2.5, q.x)
        if b:
            dx, dz = q.x - wrist_x, q.z
            cb, sb = math.cos(b), math.sin(b)
            q = Vector((wrist_x + dx * cb + dz * sb, q.y, -dx * sb + dz * cb))
        q = q * SCALE
        q.x += ELBOW_X
        return q

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    bm = bmesh.new()
    bm.from_mesh(evaluated.to_mesh())
    evaluated.to_mesh_clear()
    for v in bm.verts:
        v.co = frame(v.co)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(CUT, 0, 0), plane_no=(-1, 0, 0), clear_outer=True)
    # Keep only what is joined to the middle fingertip.
    tip = frame(pb["finger3-3.L"].tail)
    bm.verts.ensure_lookup_table()
    seed = min(bm.verts, key=lambda v: (v.co - tip).length_squared)
    keep = {seed}
    stack = [seed]
    while stack:
        v = stack.pop()
        for e in v.link_edges:
            o = e.other_vert(v)
            if o not in keep:
                keep.add(o)
                stack.append(o)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in keep], context="VERTS")
    rim = bmesh.ops.extrude_edge_only(bm, edges=[e for e in bm.edges if e.is_boundary])
    for g in rim["geom"]:
        if isinstance(g, bmesh.types.BMVert):
            g.co.x = EXTEND
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    for v in bm.verts:
        v.co = shape(v.co)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    arm = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(arm)
    arm.modifiers.new("Subsurf", "SUBSURF").levels = 2
    for p in arm.data.polygons:
        p.use_smooth = True
    bpy.context.view_layer.update()

    def joint(bone, end=False):
        return shape(frame(pb[bone].tail if end else pb[bone].head))

    def direction(bone, v):
        """A direction fixed in a bone, carried into the final frame."""
        w = pb[bone].matrix.to_3x3() @ Vector(v)
        return (shape(frame(pb[bone].head + w * 0.01)) - shape(frame(pb[bone].head))).normalized()

    return arm, joint, direction


def measure(arm, joint, direction):
    """Joints and widths of the digits, and cross-sections of the limb."""
    bvh = BVHTree.FromObject(arm, bpy.context.evaluated_depsgraph_get())

    def span(p, d, far=14.0):
        a = bvh.ray_cast(p, d, far)
        b = bvh.ray_cast(p, -d, far)
        return (a[3] if a[0] else None, b[3] if b[0] else None)

    def centre(p, back, side=None):
        """Move p to the middle of the tissue along `back`, then along `side`; return half-extents."""
        thick = width = None
        fb = span(p, back)
        if None not in fb:
            p = p + back * ((fb[0] - fb[1]) / 2)
            thick = (fb[0] + fb[1]) / 2
        if side is not None:
            sd = span(p, side)
            if None not in sd:
                p = p + side * ((sd[0] - sd[1]) / 2)
                width = (sd[0] + sd[1]) / 2
        return p, thick, width

    # Bones flex about their local X, so local Z points to the back or the front of a finger.
    sign = -1.0 if direction("finger3-1.L", (0, 0, 1)).z > 0 else 1.0
    wrist = joint("wrist.L")
    carpus = joint("wrist.L", True)
    ulnar_base = joint("metacarpal3.L")

    digits = []
    for i, name in enumerate(["Thumb", "Index", "Middle", "Ring", "Little"]):
        f = i + 1
        raw = [joint(f"finger{f}-1.L"), joint(f"finger{f}-2.L"), joint(f"finger{f}-3.L"), joint(f"finger{f}-3.L", True)]
        J, thick, width = [], [], []
        for k in range(4):
            kk = min(k, 2)
            axis = (raw[kk + 1] - raw[kk]).normalized()
            back = direction(f"finger{f}-{kk + 1}.L", (0, 0, 1)) * sign
            back = (back - back.dot(axis) * axis).normalized()
            p = raw[k].copy()
            if k == 3:
                p = p - axis * 0.75  # measure a little short of the very end
            p, t, w = centre(p, back, back.cross(axis).normalized() if k else None)
            if k == 3:
                # The last point is the centre of the rounded tip, not its surface.
                hit = bvh.ray_cast(p, axis, 5.0)
                p = (p + axis * hit[3] if hit[0] else raw[3]) - axis * (t or 0.6)
            J.append(p)
            thick.append(t)
            width.append(w)
        nail = (direction(f"finger{f}-3.L", (0, 0, 1)) * sign).normalized()

        if i == 0:
            # The carpometacarpal joint of the thumb lies at the radial side of the carpus.
            J[0], t0, _ = centre(wrist + Vector((2.3, 2.1, 0.3)), -Z)
        else:
            base = carpus if i < 3 else ulnar_base
            J[0], t0, _ = centre(J[0] - (J[0] - base).normalized() * KNUCKLE_SHIFT, -Z)
        # Half-width of the first segment, measured clear of the web.
        axis = (J[1] - J[0]).normalized()
        back = (nail - nail.dot(axis) * axis).normalized()
        _, _, w0 = centre(J[0] + (J[1] - J[0]) * 0.72, back, back.cross(axis).normalized())
        radii = [min(w0 or 1.0, 1.45) if i else 1.3, width[1], width[2], thick[3]]
        if i == 0:
            radii[1] = min(radii[1], 1.15)
        digits.append(dict(name=name, joints=J, radii=radii, back=nail, knuckle=Vector((J[0].x, J[0].y, J[0].z - t0))))

    sections = []
    middle = digits[2]["joints"][0]
    for xi in range(-22, 39):
        x = float(xi)
        if x <= 27:
            c = Vector((x, 0, 0))
            for _ in range(3):
                sy, sz = span(c, Y), span(c, Z)
                c = Vector((x, c.y + (sy[0] - sy[1]) / 2, c.z + (sz[0] - sz[1]) / 2))
            sy, sz = span(c, Y), span(c, Z)
            sections.append((x, c.y, c.z, (sy[0] + sy[1]) / 2, (sz[0] + sz[1]) / 2))
        else:
            # In the hand, depth is taken along the line of the middle metacarpal.
            t = (x - wrist.x) / (middle.x - wrist.x)
            c = Vector((x, middle.y * min(max(t, 0), 1.15), middle.z * min(max(t, 0), 1)))
            sz = span(c, Z)
            if None not in sz:
                sections.append((x, c.y, c.z + (sz[0] - sz[1]) / 2, 0.0, (sz[0] + sz[1]) / 2))
    return bvh, digits, wrist, sections


def bake(arm, bvh):
    """Signed distance to the skin on a regular grid, as the bytes of the shipped file."""
    mesh = arm.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    lo = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
    ox = GRID_X0
    oy = math.floor((lo[1] - PAD) / GRID) * GRID
    oz = math.floor((lo[2] - PAD) / GRID) * GRID
    nx = int(math.ceil((hi[0] + PAD - ox) / GRID)) + 1
    ny = int(math.ceil((hi[1] + PAD - oy) / GRID)) + 1
    nz = int(math.ceil((hi[2] + PAD - oz) / GRID)) + 1
    data = array.array("h", bytes(2 * nx * ny * nz))
    far = int(FAR / UNIT)
    for i in range(nx):
        x = ox + i * GRID
        for j in range(ny):
            y = oy + j * GRID
            # Inside or outside comes from counting the surfaces crossed on the way up this column.
            crossings = []
            z = oz - 1.0
            while True:
                hit = bvh.ray_cast(Vector((x, y, z)), Z, 60.0)
                if hit[0] is None:
                    break
                crossings.append(hit[0].z)
                z = hit[0].z + 1e-4
            c = 0
            for k in range(nz):
                zz = oz + k * GRID
                while c < len(crossings) and crossings[c] < zz:
                    c += 1
                d = int(round(bvh.find_nearest(Vector((x, y, zz)))[3] / UNIT))
                data[i + nx * (j + ny * k)] = -min(d, 32000) if c % 2 else min(d, far)
    head = struct.pack("<4sIII5f", b"VLMB", nx, ny, nz, ox, oy, oz, GRID, UNIT)
    return gzip.compress(head + data.tobytes(), 9, mtime=0)


def number(v, places=2):
    s = ("%.*f" % (places, math.floor(v * 10**places + 0.5) / 10**places)).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def vec(v, places=2):
    return "[" + ", ".join(number(c, places) for c in v) + "]"


def typescript(digits, wrist, sections):
    out = [
        "/**",
        " * Measurements of the modelled limb, taken from the same mesh as the distance",
        " * field in /public/models/limb.bin.gz. Both are written by tools/limb/bake_limb.py.",
        " *",
        " * Units are centimetres, in the frame described in skin.ts.",
        " */",
        "",
        "export type Vec3 = [number, number, number];",
        "",
        "export interface Digit {",
        "  name: string;",
        "  /** Joint centres from the base of the digit to the centre of the fingertip. */",
        "  joints: Vec3[];",
        "  /** Half-width of the digit at each joint. */",
        "  radii: number[];",
        "  /** Direction the nail faces. */",
        "  back: Vec3;",
        "  /** The skin over the knuckle on the back of the hand. */",
        "  knuckle: Vec3;",
        "}",
        "",
        "/** Thumb, index, middle, ring and little finger of a relaxed hand. */",
        "export const DIGITS: Digit[] = [",
    ]
    for d in digits:
        out += [
            "  {",
            '    name: "%s",' % d["name"],
            "    joints: [%s]," % ", ".join(vec(j) for j in d["joints"]),
            "    radii: %s," % vec(d["radii"]),
            "    back: %s," % vec(d["back"], 3),
            "    knuckle: %s," % vec(d["knuckle"]),
            "  },",
        ]
    out += [
        "];",
        "",
        "/** Centre of the wrist joint. */",
        "export const WRIST: Vec3 = %s;" % vec(wrist),
        "",
        "/**",
        " * Cross-sections at each centimetre along the limb:",
        " * [x, centre y, centre z, half-width, half-depth]. Beyond the wrist only the",
        " * depth is given (width 0), measured along the middle metacarpal.",
        " */",
        "export const SECTIONS: ReadonlyArray<readonly [number, number, number, number, number]> = [",
    ]
    out += ["  %s," % vec(s) for s in sections]
    out += ["];", ""]
    return "\n".join(out)


set_body()
arm, joint, direction = build_arm()
bvh, digits, wrist, sections = measure(arm, joint, direction)
with open(BIN, "wb") as f:
    f.write(bake(arm, bvh))
with open(TS, "w", newline="\n") as f:
    f.write(typescript(digits, wrist, sections))
