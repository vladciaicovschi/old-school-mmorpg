"""Export approved study rigs with the crew-safe v21 jibs, leaving sources immutable."""
import ast
import bpy
import hashlib
import itertools
import json
import pathlib
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = pathlib.Path(__file__).resolve().parent
LIBRARY = HERE.parents[3] / 'bible/models/ambient/boats'
ROOT = LIBRARY / 'fleet-rigs-v1'
OUTPUT = ROOT / 'output'
OUTPUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'renders').mkdir(exist_ok=True)
BASE = LIBRARY / 'sailing-modular-v1'
REFINED = LIBRARY / 'sailing-refined-v21/output/sailing-refined.blend'
ROLES = set(json.loads((BASE / 'build-report.json').read_text())['roles'])
PATCH_ROLES = ['masts', 'rigging', 'sails', 'fittings', 'framing']
recipe = HERE / 'build_rig_refinement.py'
source = recipe.read_text()
helpers = '\n\n'.join(ast.get_source_segment(source, n) for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name in ['tree', 'signature', 'base_part', 'verify_canvases'])
exec(compile(helpers, str(recipe), 'exec'))
def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()
guarded = [BASE / 'output/sailing-modular.blend', BASE / 'output/sailing-modular.glb', REFINED]
guarded += [LIBRARY / ('sailing-rig-studies-v2/output/sailing-' + name + '.blend') for name in ['gaff', 'brig']]
hashes = {str(p): sha(p) for p in guarded}
reports = []
for rig, label, count in [('ketch', 'gaff', 4), ('brig', 'brig', 7)]:
    study = LIBRARY / ('sailing-rig-studies-v2/output/sailing-' + label + '.blend')
    bpy.ops.wm.open_mainfile(filepath=str(study))
    linen = bpy.data.materials['Native_Light_Linen']
    rope = bpy.data.objects['Upper_Jib_Canvas_Hem'].data.materials[0]
    retained = {o.name: signature(o) for o in bpy.data.objects if base_part(o) and o.get('role') not in PATCH_ROLES}
    for obj in list(bpy.data.objects):
        cloth = obj.get('role') == 'sails' and obj.name.startswith(('Upper_Jib_Canvas', 'Lower_Jib_Canvas'))
        line = obj.get('role') == 'rigging' and obj.name.startswith(('Upper_Forestay', 'Lower_Forestay', 'Upper_Jib_Head_Binding', 'Lower_Jib_Head_Binding', 'Upper_Jib_Sheet', 'Lower_Jib_Sheet'))
        if cloth or line:
            bpy.data.objects.remove(obj, do_unlink=True)
    with bpy.data.libraries.load(str(REFINED), link=False) as (src, dst):
        dst.objects = [name for name in src.objects if name.startswith(('Refined_Upper_', 'Refined_Lower_'))]
    for obj in dst.objects:
        bpy.context.collection.objects.link(obj)
        obj.data.materials.clear()
        obj.data.materials.append(linen if obj.get('is_canvas') else rope)
        obj.hide_render = False
    parts = [o for o in bpy.data.objects if base_part(o)]
    for obj in bpy.data.objects:
        if obj.type == 'MESH': obj.hide_render = obj not in parts
    canvases = [o for o in parts if o.get('is_canvas')]
    assert len(canvases) == count, [o.name for o in canvases]
    verify_canvases(canvases)
    cloth_trees = [(o.name, tree(o)) for o in canvases]
    crossings = []
    for obj in parts:
        if not obj.get('rope_line'): continue
        rings = [sum((v.co for v in obj.data.vertices[i:i+6]), Vector()) / 6 for i in range(0, len(obj.data.vertices), 6)]
        for a, b in zip(rings, rings[1:]):
            d = b-a
            if d.length < .002: continue
            for name, target in cloth_trees:
                if obj.get('attached_canvas') == name: continue
                if target.ray_cast(a+d.normalized()*.001, d.normalized(), d.length-.002)[0] is not None:
                    crossings.append([obj.name, name])
    assert not crossings, ('Independent rope crosses cloth', crossings)
    points, faces = [], []
    for obj in parts:
        if obj.get('role') not in ['deck', 'stairs']: continue
        start = len(points)
        points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        faces.extend(tuple(start+i for i in p.vertices) for p in obj.data.polygons)
    walk = BVHTree.FromPolygons(points, faces)
    gaps = []
    for obj in canvases:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            floor = walk.ray_cast(p-Vector((0,0,.01)), Vector((0,0,-1)), 25)[0]
            if floor is not None: gaps.append(p.z-floor.z-1.8)
    assert min(gaps) > .12, ('Crew head clearance', rig, min(gaps))
    poses = 0
    for ix in range(19):
        for iy in range(9):
            x,y = -6.5+ix*.25, -1+iy*.25
            support = []
            for a in np.linspace(0, np.pi*2, 8, endpoint=False):
                p = walk.ray_cast(Vector((x+.3*np.cos(a), y+.3*np.sin(a), 4)), Vector((0,0,-1)), 1)[0]
                if p is None or abs(p.z-3.4)>.1: break
                support.append(p.z)
            if len(support)!=8: continue
            poses += 1
            for dx in range(-3,4):
                for dy in range(-3,4):
                    if dx*dx+dy*dy>9: continue
                    for name,target in cloth_trees:
                        assert target.ray_cast(Vector((x+dx*.1,y+dy*.1,max(support)+.01)),Vector((0,0,1)),1.84)[0] is None, ('Foredeck blocked',rig,x,y,name)
    for x in [8.7,9,9.3]:
        for y in [-.28,0,.28]:
            for obj in canvases+[o for o in parts if o.get('role')=='masts']:
                assert tree(obj).ray_cast(Vector((x,y,3.42)),Vector((0,0,1)),1.85)[0] is None, ('Helm blocked',rig,obj.name)
    assert all(signature(bpy.data.objects[n]) == digest for n,digest in retained.items())
    for obj in parts: obj.data.calc_loop_triangles()
    role_counts = {r: sum(len(o.data.loop_triangles) for o in parts if o.get('role')==r) for r in sorted(ROLES)}
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / (rig+'.blend')))
    clones = []
    for role in PATCH_ROLES:
        copies = []
        for src in [o for o in parts if o.get('role') == role]:
            obj = src.copy(); obj.data = src.data.copy(); bpy.context.collection.objects.link(obj); copies.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in copies: obj.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        joined = bpy.context.object; joined.name='Modular_'+role; joined['role']=role; clones.append(joined)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in clones: obj.select_set(True)
    patch = OUTPUT / (rig+'.patch.glb')
    bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
    for obj in clones: bpy.data.objects.remove(obj,do_unlink=True)
    if '--no-render' not in sys.argv:
        scene = bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=12
        scene.render.resolution_x=1200; scene.render.resolution_y=900; scene.render.resolution_percentage=100
        camera=scene.camera; camera.data.type='ORTHO'; camera.data.ortho_scale=32
        for name, loc, target in [('exterior',(28,-38,24),(.8,0,7.1)),('side',(1,42,8),(1,0,7))]:
            camera.location=loc; camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(ROOT/'renders'/(rig+'-'+name+'.png')); bpy.ops.render.render(write_still=True)
    report = {'id':rig,'revision':'fleet-rigs-v1','file':'fleet-rigs-v1/output/'+rig+'.patch.glb','patchSha256':sha(patch),'studySha256':hashes[str(study)],'refinedJibSourceSha256':hashes[str(REFINED)],'roles':PATCH_ROLES,'roleTriangles':role_counts,'triangles':sum(role_counts.values()),'checks':{'canvasCount':count,'canvasIntersections':[],'ropeIntersections':[],'minimumCrewHeadGapM':min(gaps),'foredeckClearPoses':poses,'foredeckBodyRadiusM':.3,'helmClear':True,'unchangedBodyObjects':len(retained)}}
    reports.append(report)
    print('FLEET_RIG_VERIFIED',json.dumps(report),flush=True)
assert all(sha(pathlib.Path(p))==h for p,h in hashes.items())
report = {'sourceHashes':hashes,'sourcesUnchanged':True,'rigs':reports}
(ROOT/'verification.json').write_text(json.dumps(report,indent=2))
(HERE/'fleet_rigs.json').write_text(json.dumps(report,indent=2)+'\n')
