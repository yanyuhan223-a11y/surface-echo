"""
地表回声 · Blender 程序化废土资产管线
====================================
用 Blender 的 Python API 程序化生成《灵笼》风格的废土地铁 / 地表设施 3D 资产，
导出为 GLB，供 Three.js 的 GLTFLoader 直接加载，替代代码里手搓的 BoxGeometry。

重新生成资产：
    blender --background --python tools/blender/build_assets.py

输出目录： src/assets/models/*.glb

设计约定
--------
1. 低模优先：每个资产控制在数百~数千三角面，全部走 flat/低细分，靠贴图撑质感。
2. 破损感来自三层处理：bevel 倒角 -> 顶点噪声位移 -> 随机切口/缺角布尔。
3. 每个物体都做 smart UV 展开，法线重算朝外，方便前端直接贴 PBR 贴图。
4. 材质只作为"插槽标记"存在（MAT_CONCRETE / MAT_METAL / MAT_HAZARD / MAT_PIPE），
   前端加载后按材质名替换为项目里已有的 PBR 材质，GLB 里不打包任何贴图，包体极小。
5. 兼容 Blender 3.4.x：只用 bmesh + 基础 ops，不依赖 4.x 才有的参数。
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

# ----------------------------------------------------------------------------
# 路径 / 全局
# ----------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(PROJECT, "src", "assets", "models")
os.makedirs(OUT_DIR, exist_ok=True)

SEED = 20240
random.seed(SEED)

MAT_COLORS = {
    "MAT_CONCRETE": (0.52, 0.56, 0.55, 1.0),
    "MAT_METAL": (0.44, 0.47, 0.50, 1.0),
    "MAT_HAZARD": (0.72, 0.60, 0.26, 1.0),
    "MAT_PIPE": (0.46, 0.36, 0.28, 1.0),
}


def log(msg):
    print("[assets] %s" % msg)
    sys.stdout.flush()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, color in MAT_COLORS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = color
            bsdf.inputs["Roughness"].default_value = 0.85
            bsdf.inputs["Metallic"].default_value = 0.6 if "METAL" in name else 0.05


def mat(name):
    return bpy.data.materials[name]


# ----------------------------------------------------------------------------
# bmesh 基础构件
# ----------------------------------------------------------------------------
def bm_box(bm, size, loc=(0, 0, 0), rot=(0, 0, 0)):
    """往 bmesh 里塞一个盒子，支持缩放 / 位移 / 欧拉旋转。"""
    from mathutils import Matrix

    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    m = Matrix.Translation(Vector(loc))
    if any(rot):
        m = m @ (
            Matrix.Rotation(rot[0], 4, "X")
            @ Matrix.Rotation(rot[1], 4, "Y")
            @ Matrix.Rotation(rot[2], 4, "Z")
        )
    m = m @ Matrix.Diagonal(Vector(size).to_4d())
    bmesh.ops.transform(bm, matrix=m, verts=verts)
    return verts


def bm_cylinder(bm, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), segments=10):
    from mathutils import Matrix

    res = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    m = Matrix.Translation(Vector(loc))
    if any(rot):
        m = m @ (
            Matrix.Rotation(rot[0], 4, "X")
            @ Matrix.Rotation(rot[1], 4, "Y")
            @ Matrix.Rotation(rot[2], 4, "Z")
        )
    bmesh.ops.transform(bm, matrix=m, verts=res["verts"])
    return res["verts"]


def roughen(bm, verts, amount=0.03):
    """顶点噪声位移：制造混凝土/金属被侵蚀的不规则轮廓。"""
    for v in verts:
        v.co.x += random.uniform(-amount, amount)
        v.co.y += random.uniform(-amount, amount)
        v.co.z += random.uniform(-amount, amount)


def bevel_all(bm, width=0.02, segments=1):
    edges = [e for e in bm.edges]
    if not edges:
        return
    try:
        bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=width,
            segments=segments,
            profile=0.5,
            affect="EDGES",
        )
    except TypeError:  # 老版本参数名兜底
        bmesh.ops.bevel(bm, geom=edges, offset=width, segments=segments)


def finalize(bm, name, material="MAT_CONCRETE", smart_uv=True):
    """bmesh -> Object：重算法线、建 mesh、挂材质、smart UV 展开。"""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(mat(material))
    bpy.context.collection.objects.link(obj)

    if smart_uv and len(me.polygons):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        except Exception:
            bpy.ops.uv.cube_project(cube_size=2.0)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return obj


def carve(obj, cuts):
    """布尔挖洞：制造塌陷缺口 / 弹孔 / 结构断裂。cuts = [(loc, size), ...]"""
    for i, (loc, size) in enumerate(cuts):
        bm = bmesh.new()
        bm_box(bm, size, loc, (random.uniform(0, 0.5), random.uniform(0, 0.6), random.uniform(0, 0.5)))
        cutter = finalize(bm, "%s_cut%d" % (obj.name, i), smart_uv=False)
        mod = obj.modifiers.new("cut%d" % i, "BOOLEAN")
        mod.object = cutter
        mod.operation = "DIFFERENCE"
        try:
            mod.solver = "FAST"
        except Exception:
            pass
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            obj.modifiers.remove(mod)
        bpy.data.objects.remove(cutter, do_unlink=True)
    return obj


def export(objects, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_yup=True,
    )
    tris = sum(len(o.data.loop_triangles) if o.data.loop_triangles else len(o.data.polygons) * 2 for o in objects)
    log("导出 %s (%d 物体, ~%d 面) -> %.1f KB" % (filename, len(objects), tris, os.path.getsize(path) / 1024))


# ----------------------------------------------------------------------------
# 资产 1：隧道 / 站台模块（沿 Z 轴每 20m 拼接一段）
# ----------------------------------------------------------------------------
def build_tunnel_module():
    reset_scene()
    L = 20.0  # 模块长度
    objs = []

    # --- 地面板：分块拼出高低起伏的破损地坪 ---
    bm = bmesh.new()
    for i in range(10):
        z = -L / 2 + 1.0 + i * 2.0
        for xo in (-6.0, -2.0, 2.0, 6.0):
            sag = random.uniform(-0.06, 0.02)
            vs = bm_box(bm, (4.0, 2.0, 0.4), (xo, z, -0.2 + sag))
            roughen(bm, vs, 0.035)
    bevel_all(bm, 0.03)
    floor = finalize(bm, "TunnelFloor", "MAT_CONCRETE")
    objs.append(floor)

    # --- 两侧墙体：竖向壁板 + 检修凹槽 ---
    bm = bmesh.new()
    for side in (-1, 1):
        for i in range(10):
            z = -L / 2 + 1.0 + i * 2.0
            h = 8.2 + random.uniform(-0.15, 0.15)
            vs = bm_box(bm, (0.7, 1.92, h), (side * 10.6, z, h / 2 - 0.3))
            roughen(bm, vs, 0.04)
            # 壁板压条
            bm_box(bm, (0.16, 1.7, 0.22), (side * 10.2, z, 2.2))
            bm_box(bm, (0.16, 1.7, 0.22), (side * 10.2, z, 5.0))
    bevel_all(bm, 0.025)
    wall = finalize(bm, "TunnelWall", "MAT_CONCRETE")
    carve(
        wall,
        [
            ((-10.6, random.uniform(-8, 8), random.uniform(3, 6)), (2.0, 1.6, 1.8)),
            ((10.6, random.uniform(-8, 8), random.uniform(4, 7)), (2.0, 1.9, 1.5)),
        ],
    )
    objs.append(wall)

    # --- 承重柱：底座 + 柱身 + 柱头，带钢筋外露感 ---
    bm = bmesh.new()
    for side in (-1, 1):
        for i in range(3):
            z = -L / 2 + 3.5 + i * 6.5
            x = side * 8.6
            bm_box(bm, (1.9, 1.9, 0.5), (x, z, 0.15))  # 底座
            vs = bm_box(bm, (1.35, 1.35, 6.6), (x, z, 3.4))  # 柱身
            roughen(bm, vs, 0.05)
            bm_box(bm, (2.1, 2.1, 0.45), (x, z, 6.8))  # 柱头
            # 外露钢筋
            for r in range(3):
                bm_cylinder(
                    bm, 0.035, 1.1,
                    (x + random.uniform(-0.6, 0.6), z + random.uniform(-0.6, 0.6), 7.4),
                    (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0), 5,
                )
    bevel_all(bm, 0.035)
    pillars = finalize(bm, "TunnelPillars", "MAT_CONCRETE")
    objs.append(pillars)

    # --- 顶部横梁 / 拱肋：部分塌陷 ---
    bm = bmesh.new()
    for i in range(6):
        z = -L / 2 + 2.0 + i * 3.4
        if i == 3:  # 塌陷段：断成两截并下垂
            bm_box(bm, (8.0, 1.0, 0.85), (-5.4, z, 7.1), (0, random.uniform(0.12, 0.2), 0))
            bm_box(bm, (7.0, 1.0, 0.85), (5.8, z, 7.3), (0, random.uniform(-0.2, -0.1), 0))
            continue
        vs = bm_box(bm, (21.5, 1.05, 0.9), (0, z, 7.3))
        roughen(bm, vs, 0.03)
        # 拱肋加强筋
        bm_box(bm, (21.5, 0.35, 0.3), (0, z, 7.85))
    bevel_all(bm, 0.03)
    beams = finalize(bm, "TunnelBeams", "MAT_CONCRETE")
    objs.append(beams)

    # --- 轨道：钢轨 + 枕木 + 道砟侧沿 ---
    bm = bmesh.new()
    for x in (-2.35, 2.35):
        bm_box(bm, (0.16, L, 0.14), (x, 0, 0.09))
        bm_box(bm, (0.30, L, 0.05), (x, 0, 0.02))
    for i in range(28):
        z = -L / 2 + 0.35 + i * 0.72
        bm_box(bm, (6.1, 0.24, 0.13), (0, z, 0.02))
    bevel_all(bm, 0.012)
    rails = finalize(bm, "TunnelRails", "MAT_METAL")
    objs.append(rails)

    # --- 管线束：沿墙顶铺设，带吊架 ---
    bm = bmesh.new()
    for side in (-1, 1):
        for k, (dz, r) in enumerate([(0.0, 0.20), (0.46, 0.14), (0.24, 0.10)]):
            bm_cylinder(bm, r, L, (side * 9.4, 0, 6.0 + dz), (math.pi / 2, 0, 0), 8)
        for i in range(5):
            bm_box(bm, (0.9, 0.12, 0.12), (side * 9.4, -L / 2 + 2 + i * 4, 6.55))
    pipes = finalize(bm, "TunnelPipes", "MAT_PIPE")
    objs.append(pipes)

    # --- 站台边缘警戒条 + 检修梯 ---
    bm = bmesh.new()
    for side in (-1, 1):
        bm_box(bm, (0.5, L, 0.06), (side * 7.2, 0, 0.24))
    for i in range(2):
        z = -L / 2 + 5 + i * 9
        for r in range(4):
            bm_cylinder(bm, 0.04, 1.0, (-10.1, z, 0.6 + r * 0.55), (0, math.pi / 2, 0), 6)
    hazard = finalize(bm, "TunnelHazard", "MAT_HAZARD")
    objs.append(hazard)

    export(objs, "tunnel_module.glb")


# ----------------------------------------------------------------------------
# 资产 2：换乘大厅（一次性地标建筑，含闸机 / 楼梯 / 塌顶）
# ----------------------------------------------------------------------------
def build_station_hall():
    reset_scene()
    objs = []

    # 夹层楼板 + 塌陷缺口
    bm = bmesh.new()
    vs = bm_box(bm, (21.0, 16.0, 0.7), (0, 0, 8.6))
    roughen(bm, vs, 0.05)
    bevel_all(bm, 0.05)
    slab = finalize(bm, "HallSlab", "MAT_CONCRETE")
    carve(
        slab,
        [
            ((-3.0, 1.5, 8.6), (7.0, 6.0, 2.0)),
            ((6.5, -4.5, 8.6), (5.0, 4.5, 2.0)),
        ],
    )
    objs.append(slab)

    # 通向夹层的楼梯
    bm = bmesh.new()
    for i in range(22):
        bm_box(bm, (4.2, 0.5, 0.38), (-6.5, -7.5 + i * 0.5, 0.2 + i * 0.38))
    bm_box(bm, (0.25, 11.5, 0.9), (-4.5, -5.0, 5.2), (0.6, 0, 0))  # 扶手
    bevel_all(bm, 0.02)
    objs.append(finalize(bm, "HallStairs", "MAT_CONCRETE"))

    # 闸机阵列
    bm = bmesh.new()
    for i in range(5):
        x = -6.0 + i * 3.0
        vs = bm_box(bm, (0.75, 2.6, 1.15), (x, 6.0, 0.6))
        roughen(bm, vs, 0.02)
        bm_box(bm, (0.5, 0.5, 0.35), (x, 5.0, 1.3))  # 读卡头
        if i != 2:  # 未损坏的闸机保留挡板
            bm_box(bm, (0.1, 1.5, 0.9), (x + 0.85, 6.0, 0.9), (0, 0, 0.15))
    bevel_all(bm, 0.02)
    objs.append(finalize(bm, "HallGates", "MAT_METAL"))

    # 大厅立柱
    bm = bmesh.new()
    for x in (-8.0, 8.0):
        for y in (-6.0, 0.0, 6.0):
            bm_box(bm, (2.2, 2.2, 0.4), (x, y, 0.1))
            vs = bm_box(bm, (1.6, 1.6, 8.6), (x, y, 4.4))
            roughen(bm, vs, 0.045)
    bevel_all(bm, 0.04)
    objs.append(finalize(bm, "HallColumns", "MAT_CONCRETE"))

    # 悬挂指示牌 + 吊杆
    bm = bmesh.new()
    for i, x in enumerate((-5.0, 3.5)):
        bm_box(bm, (4.4, 0.14, 1.15), (x, -2.0 - i * 4, 5.6), (0, 0, 0.06 * (1 if i else -1)))
        for dx in (-1.7, 1.7):
            bm_cylinder(bm, 0.035, 2.6, (x + dx, -2.0 - i * 4, 6.9), (0, 0, 0), 6)
    objs.append(finalize(bm, "HallSigns", "MAT_HAZARD"))

    export(objs, "station_hall.glb")


# ----------------------------------------------------------------------------
# 资产 3~N：可复用道具（对应物资点 / 场景细节）
# ----------------------------------------------------------------------------
def build_prop_container():
    reset_scene()
    bm = bmesh.new()
    vs = bm_box(bm, (2.6, 1.7, 1.7), (0, 0, 0.85))
    roughen(bm, vs, 0.02)
    for i in range(9):  # 波纹侧板
        x = -1.15 + i * 0.29
        bm_box(bm, (0.09, 1.74, 1.5), (x, 0, 0.85))
    bm_box(bm, (0.12, 1.72, 1.72), (1.3, 0, 0.85))  # 门框
    bm_box(bm, (0.09, 0.16, 0.8), (1.38, -0.35, 0.9))  # 门闩
    bm_box(bm, (0.09, 0.16, 0.8), (1.38, 0.35, 0.9))
    bevel_all(bm, 0.02)
    o = finalize(bm, "PropContainer", "MAT_METAL")
    carve(o, [((-0.9, 0.9, 1.35), (0.9, 0.5, 0.6))])
    export([o], "prop_container.glb")


def build_prop_locker():
    reset_scene()
    bm = bmesh.new()
    bm_box(bm, (1.15, 0.62, 2.0), (0, 0, 1.0))
    for i in (-1, 1):  # 两扇柜门，其中一扇歪斜敞开
        rot = (0, 0, 0.55) if i > 0 else (0, 0, 0)
        loc = (i * 0.3 + (0.25 if i > 0 else 0), -0.34 + (0.2 if i > 0 else 0), 1.0)
        bm_box(bm, (0.52, 0.06, 1.86), loc, rot)
        bm_box(bm, (0.05, 0.05, 0.22), (i * 0.5, -0.4, 1.15))
    bm_box(bm, (1.05, 0.55, 0.06), (0, 0, 1.1))  # 内部隔板
    bevel_all(bm, 0.015)
    export([finalize(bm, "PropLocker", "MAT_METAL")], "prop_locker.glb")


def build_prop_crate():
    reset_scene()
    bm = bmesh.new()
    vs = bm_box(bm, (1.3, 1.3, 1.1), (0, 0, 0.55))
    roughen(bm, vs, 0.02)
    for a in range(4):  # 加固棱条
        ang = a * math.pi / 2
        bm_box(bm, (1.36, 0.11, 0.12), (0, 0, 1.03), (0, 0, ang))
        bm_box(bm, (1.36, 0.11, 0.12), (0, 0, 0.08), (0, 0, ang))
    bm_box(bm, (1.34, 1.34, 0.1), (0, 0, 1.12), (0.05, 0.03, 0))  # 撬开的盖子
    bevel_all(bm, 0.02)
    export([finalize(bm, "PropCrate", "MAT_HAZARD")], "prop_crate.glb")


def build_prop_ammo():
    reset_scene()
    bm = bmesh.new()
    bm_box(bm, (1.2, 0.78, 0.62), (0, 0, 0.31))
    bm_box(bm, (1.24, 0.82, 0.08), (0, 0, 0.64))
    bm_box(bm, (0.34, 0.1, 0.14), (0, 0, 0.72))  # 提手
    bm_box(bm, (1.16, 0.06, 0.16), (0, -0.42, 0.4))  # 标识条
    bevel_all(bm, 0.02)
    export([finalize(bm, "PropAmmo", "MAT_HAZARD")], "prop_ammo.glb")


def build_prop_debris():
    reset_scene()
    bm = bmesh.new()
    for i in range(16):
        s = random.uniform(0.35, 1.15)
        vs = bm_box(
            bm,
            (s, s * random.uniform(0.6, 1.3), s * random.uniform(0.4, 0.9)),
            (random.uniform(-1.5, 1.5), random.uniform(-1.5, 1.5), random.uniform(0.05, 0.75)),
            (random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3)),
        )
        roughen(bm, vs, 0.12)
    for i in range(5):  # 混在碎石里的钢筋
        bm_cylinder(
            bm, 0.04, random.uniform(1.2, 2.6),
            (random.uniform(-1.2, 1.2), random.uniform(-1.2, 1.2), random.uniform(0.3, 0.9)),
            (random.uniform(1.0, 1.8), random.uniform(0, 3), 0), 5,
        )
    bevel_all(bm, 0.02)
    export([finalize(bm, "PropDebris", "MAT_CONCRETE")], "prop_debris.glb")


def build_prop_barrier():
    reset_scene()
    bm = bmesh.new()
    bm_box(bm, (2.2, 0.16, 0.28), (0, 0, 1.0))
    bm_box(bm, (2.2, 0.16, 0.28), (0, 0, 0.55))
    for x in (-1.0, 1.0):  # A 字支脚
        bm_box(bm, (0.14, 0.9, 1.25), (x, 0, 0.62), (0.22, 0, 0))
        bm_box(bm, (0.5, 0.7, 0.09), (x, 0, 0.05))
    bevel_all(bm, 0.015)
    export([finalize(bm, "PropBarrier", "MAT_HAZARD")], "prop_barrier.glb")


def build_prop_seat():
    reset_scene()
    bm = bmesh.new()
    bm_box(bm, (3.4, 0.62, 0.12), (0, 0, 0.52))  # 座面
    bm_box(bm, (3.4, 0.12, 0.66), (0, 0.3, 0.88), (0.16, 0, 0))  # 靠背
    for x in (-1.4, 0.0, 1.4):
        bm_box(bm, (0.12, 0.55, 0.52), (x, 0, 0.26))
    bm_box(bm, (0.9, 0.6, 0.1), (1.9, 0.1, 0.18), (0.4, 0.3, 0.5))  # 掰断掉落的一段
    bevel_all(bm, 0.015)
    export([finalize(bm, "PropSeat", "MAT_METAL")], "prop_seat.glb")


def build_prop_console():
    """故障终端 / 可交互控制台，也用作樰任务里的信号中继装置。"""
    reset_scene()
    bm = bmesh.new()
    bm_box(bm, (1.5, 1.0, 0.25), (0, 0, 0.12))  # 底座
    vs = bm_box(bm, (1.25, 0.75, 1.35), (0, 0, 0.8))  # 机身
    roughen(bm, vs, 0.015)
    bm_box(bm, (1.2, 0.5, 0.55), (0, -0.24, 1.62), (0.55, 0, 0))  # 倾斜屏幕面板
    bm_box(bm, (0.9, 0.16, 0.1), (0, -0.42, 1.2))  # 键盘台
    for i in range(3):  # 侧面散热格栅
        bm_box(bm, (0.06, 0.6, 0.1), (0.64, 0, 0.55 + i * 0.28))
    bm_cylinder(bm, 0.05, 1.5, (0.5, 0.35, 2.3), (0, 0, 0), 6)  # 天线
    bevel_all(bm, 0.02)
    export([finalize(bm, "PropConsole", "MAT_METAL")], "prop_console.glb")


def build_prop_beacon():
    """信标塔：任务目标物，顶部留出发光体位置由前端接管。"""
    reset_scene()
    bm = bmesh.new()
    bm_cylinder(bm, 0.65, 0.24, (0, 0, 0.12), (0, 0, 0), 8)
    for a in range(3):  # 三脚支架
        ang = a * math.pi * 2 / 3
        bm_box(bm, (0.12, 0.12, 2.1), (math.cos(ang) * 0.42, math.sin(ang) * 0.42, 1.1), (0.1 * math.sin(ang), 0.1 * math.cos(ang), 0))
    bm_box(bm, (0.62, 0.62, 0.7), (0, 0, 2.35))  # 主机箱
    bm_cylinder(bm, 0.28, 0.5, (0, 0, 2.9), (0, 0, 0), 8)  # 发射头
    bm_cylinder(bm, 0.03, 1.2, (0, 0, 3.6), (0, 0, 0), 5)  # 鞭状天线
    bevel_all(bm, 0.02)
    export([finalize(bm, "PropBeacon", "MAT_METAL")], "prop_beacon.glb")


def build_prop_pipes():
    reset_scene()
    bm = bmesh.new()
    for i, (dy, dz, r) in enumerate([(0, 0, 0.22), (0.5, 0.1, 0.16), (0.22, 0.46, 0.13)]):
        bm_cylinder(bm, r, 6.0, (0, dy, dz), (math.pi / 2, 0, 0), 8)
        for k in range(4):  # 法兰
            bm_cylinder(bm, r * 1.35, 0.1, (0, dy, dz), (math.pi / 2, 0, 0), 8)
    for i in range(3):
        bm_box(bm, (0.1, 0.1, 1.0), (0, 0.24, 0.9), (0, 0, 0))
    export([finalize(bm, "PropPipes", "MAT_PIPE")], "prop_pipes.glb")


BUILDERS = [
    build_tunnel_module,
    build_station_hall,
    build_prop_container,
    build_prop_locker,
    build_prop_crate,
    build_prop_ammo,
    build_prop_debris,
    build_prop_barrier,
    build_prop_seat,
    build_prop_console,
    build_prop_beacon,
    build_prop_pipes,
]


def main():
    log("Blender %s · 输出到 %s" % (bpy.app.version_string, OUT_DIR))
    for fn in BUILDERS:
        random.seed(SEED + BUILDERS.index(fn) * 7)
        log("构建 %s ..." % fn.__name__)
        fn()
    log("全部资产构建完成")


if __name__ == "__main__":
    main()
