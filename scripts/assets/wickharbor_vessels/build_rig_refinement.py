"""Refine the accepted brigantine rig without changing the accepted checkpoint."""
import ast
import bpy
import bmesh
import hashlib
import itertools
import json
import math
import pathlib
import sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

GAME = pathlib.Path(__file__).resolve().parents[3]
LIBRARY = GAME.parent / 'bible/models/ambient/boats'
BASE = LIBRARY / 'sailing-modular-v1'
ROOT = LIBRARY / 'sailing-refined-v21'
OUTPUT = ROOT / 'output'
RENDERS = ROOT / 'renders'
OUTPUT.mkdir(parents=True, exist_ok=True)
RENDERS.mkdir(exist_ok=True)
ROLES = set(json.loads((BASE/'build-report.json').read_text(encoding='utf-8'))['roles'])


def signature(obj):
    digest = hashlib.sha256()
    for v in obj.data.vertices:
        digest.update(np.array(v.co[:], dtype=np.float32).tobytes())
    for p in obj.data.polygons:
        digest.update(np.array(p.vertices[:], dtype=np.int32).tobytes())
    for layer in obj.data.uv_layers:
        for loop in layer.data:
            digest.update(np.array(loop.uv[:], dtype=np.float32).tobytes())
    digest.update(np.array(obj.matrix_world, dtype=np.float32).tobytes())
    return digest.hexdigest()

def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices], [tuple(p.vertices) for p in obj.data.polygons])

def base_part(obj):
    return obj.type == 'MESH' and obj.get('role') in ROLES

def remove_prefixes(prefixes):
    for obj in list(bpy.data.objects):
        if base_part(obj) and obj.name.startswith(tuple(prefixes)):
            bpy.data.objects.remove(obj, do_unlink=True)

def binding(ns, name, x, z, radius):
    ns['tube'](name, [(x + radius * math.cos(t), radius * math.sin(t), z) for t in np.linspace(0, math.tau, 25)], .025, ns['ROPE'], 'rigging', 6)

def existing_attachment(prefix, side=-1, preferred_x=5.75):
    candidates = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.get('role') != 'fittings' or not obj.name.startswith(prefix):
            continue
        pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
        centre = Vector(tuple((min(p[i] for p in pts) + max(p[i] for p in pts))*.5 for i in range(3)))
        if centre.y * side <= 0:
            continue
        point = tree(obj).find_nearest(centre + Vector((0, 0, .12)))[0]
        candidates.append((abs(centre.x-preferred_x), point, obj.name))
    assert candidates, ('Missing physical attachment', prefix, side)
    _, point, name = min(candidates, key=lambda item: item[0])
    return point, name

def gaff_sail(ns, name, x, mast_top, boom_z, boom_tip_x, throat_z, peak_x, peak_z, billow):
    tube, rope = ns['tube'], ns['rope']
    r0, r1 = (.245, .115) if x < 0 else (.205, .1)
    def mast_radius(z):
        return r0+(r1-r0)*(z-1.92)/(mast_top-1.92)
    assert peak_z < mast_top-.35, 'The peak halyard must support the gaff from above'
    assert boom_tip_x < 11.1, 'Keep the working boom inside the stern outline'
    boom_a, boom_b = Vector((x+.18, 0, boom_z)), Vector((boom_tip_x, 0, boom_z))
    gaff_a, gaff_b = Vector((x+.16, 0, throat_z)), Vector((peak_x, 0, peak_z))
    boom = tube(name+'_Boom', [boom_a, boom_b], .105, ns['WOOD'], 'masts', 10, end_radius=.072)
    tube(name+'_Gaff', [gaff_a, gaff_b], .095, ns['WOOD'], 'masts', 10, end_radius=.06)
    A, B = Vector((x+.32, 0, boom_z+.17)), Vector((boom_tip_x-.2, 0, boom_z+.17))
    C, D = Vector((peak_x-.18, 0, peak_z-.18)), Vector((x+.32, 0, throat_z-.16))
    def canvas(u, v):
        u, v = float(u), float(v)
        p = (1-u)*(1-v)*A + u*(1-v)*B + u*v*C + (1-u)*v*D
        p.y += billow*math.sin(math.pi*u)*math.sin(math.pi*v)
        p.x += .09*u**3*math.sin(math.pi*v)
        p.z += .09*math.sin(math.pi*u)*(1-v)
        return p
    cloth = ns['square'](name+'_Canvas', canvas, 24, 22)
    # Jaw bands support the spars against the mast; wood hoops carry the luff.
    for z in [boom_z, throat_z]:
        r = mast_radius(z)
        tube(name+'_Jaw_Band', [(x+(r+.02)*math.cos(t), (r+.02)*math.sin(t), z) for t in np.linspace(0, math.tau, 25)], .025, ns['IRON'], 'fittings', 6)
    for z in np.linspace(A.z, D.z, 9):
        r = mast_radius(z)+.04
        tube(name+'_Mast_Hoop', [(x+r*math.cos(t), r*math.sin(t), z) for t in np.linspace(0, math.tau, 25)], .016, ns['WOOD'], 'fittings', 6)
        rope(name+'_Luff_Seizing', (x+r, 0, z), (x+.32, 0, z), .012, 0)
    for u in np.linspace(0, 1, 10):
        p = canvas(float(u), 1)
        t = (p.x-gaff_a.x)/(gaff_b.x-gaff_a.x)
        rope(name+'_Head_Lacing', p, gaff_a.lerp(gaff_b, float(t)), .014, 0)
    for u in np.linspace(0, 1, 8):
        p = canvas(float(u), 0)
        rope(name+'_Foot_Lacing', p, (p.x, 0, boom_z), .014, 0)
    # Separate throat and peak halyards, with a two-point gaff bridle.
    upper = Vector((x+.12, -.2, mast_top-.25))
    bridle = gaff_a.lerp(gaff_b, .76)+Vector((0, -.12, .2))
    for t in [.55, .93]:
        rope(name+'_Peak_Bridle', gaff_a.lerp(gaff_b, t), bridle, .019, .015)
    rope(name+'_Peak_Halyard', upper, bridle, .027, .018)
    rope(name+'_Throat_Halyard', upper+Vector((-.1, 0, 0)), gaff_a, .026, .015)
    rope(name+'_Topping_Lift', (x, -.28, mast_top-.35), boom_b+Vector((0, -.13, 0)), .025, .025)
    root, support = existing_attachment('Aft_Chainplate' if x < 0 else 'Aft_Sheet_Cleat', -1 if x < 0 else 1, 5.75 if x < 0 else 10.8)
    rope(name+'_Boom_Sheet', boom_b, root, .032, .025, record=[boom.name, support])
    # Compact wooden halyard blocks sit on their upper mast bands.
    for dz in [0, -.3]:
        ns['make'](name+'_Halyard_Block', [(upper.x+dx, upper.y+dy, upper.z+dz+zz) for dx,dy,zz in [(-.055,-.045,-.1),(.055,-.045,-.1),(.055,.045,-.1),(-.055,.045,-.1),(-.055,-.045,.1),(.055,-.045,.1),(.055,.045,.1),(-.055,.045,.1)]], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], ns['WOOD'], 'fittings')
        rope(name+'_Block_Strop', (upper.x, upper.y, upper.z+dz+.1), (x, -mast_radius(upper.z)-.018, upper.z), .018, .01)
    for z in [2.15, 3.1, boom_z, throat_z, mast_top-.25]:
        binding(ns, name+'_Mast_Binding', x, z, mast_radius(z)+.018)
    return cloth

def rebuild_aft_shrouds(ns, top):
    for obj in list(bpy.data.objects):
        is_ratline = obj.type == 'MESH' and obj.name.startswith('Ratline') and min(v.co.x for v in obj.data.vertices) > 4.8
        if obj.name.startswith('Aft_Shroud') or is_ratline:
            bpy.data.objects.remove(obj, do_unlink=True)
    for side in [-1, 1]:
        roots = []
        for obj in bpy.data.objects:
            if obj.type == 'MESH' and obj.name.startswith('Aft_Chainplate') and obj.get('role') == 'fittings':
                pts = [v.co for v in obj.data.vertices]
                mid = sum(pts, Vector())/len(pts)
                if mid.y*side > 0:
                    root = tree(obj).find_nearest(mid+Vector((0, 0, .15)))[0]
                    roots.append((root, obj.name))
        roots.sort(key=lambda item: item[0].x)
        assert len(roots) == 3
        head = Vector((5.4, side*.09, top))
        for root, support in roots:
            ns['rope']('Study_Aft_Shroud', root, head, .028, .018, record=[support, 'aft mast band'])
        for t in np.linspace(.035, .68, 19):
            ns['rope']('Study_Aft_Ratline', roots[0][0].lerp(head, float(t)), roots[-1][0].lerp(head, float(t)), .014, .014)
    binding(ns, 'Study_Aft_Shroud_Band', 5.4, top, .13)

def yard_details(ns, x, top, z, half):
    for side in [-1, 1]:
        ns['rope']('Study_Yard_Lift', (x+.1, side*.08, top-.25), (x, side*half, z), .024, .025)
        # Fore braces belay before the after sails; after braces lead to stern posts.
        target = existing_attachment('Aft_Chainplate', side, 5.75)[0] if x < 0 else Vector((11.4, side*1.58, 4.42))
        ns['rope']('Study_Yard_Brace', (x, side*half, z), target, .025, .035)
    points = [(x+.24, (2*t-1)*half*.9, z-.34-.17*math.sin(math.pi*t)) for t in np.linspace(0, 1, 25)]
    footrope = ns['tube']('Study_Yard_Footrope', points, .017, ns['ROPE'], 'rigging', 6)
    footrope['rope_line'] = True
    for t in [.12, .35, .65, .88]:
        p = Vector((x+.24, (2*t-1)*half*.9, z-.34-.17*math.sin(math.pi*t)))
        ns['rope']('Study_Footrope_Stirrup', (x, p.y, z), p, .014, .01)

def verify_canvases(canvases):
    crossings = []
    for first, second in itertools.combinations(canvases, 2):
        target = tree(second)
        for edge in first.data.edges:
            a, b = [first.matrix_world @ first.data.vertices[i].co for i in edge.vertices]
            delta = b - a
            if delta.length < 1e-5:
                continue
            hit = target.ray_cast(a + delta.normalized() * .0001, delta.normalized(), delta.length - .0002)
            if hit[0] is not None:
                crossings.append([first.name, second.name])
                break
    assert not crossings, ('Sail surfaces intersect', crossings)
    return crossings

def render_scene(label):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = 1500
    scene.render.resolution_y = 1050
    scene.render.resolution_percentage = 100
    camera = scene.camera
    camera.data.type = 'ORTHO'
    for view, loc, target, scale in [
        ('exterior', (28, -38, 24), (.8, 0, 7.1), 32),
        ('side', (1, 42, 8.0), (1, 0, 7.0), 31),
    ]:
        camera.location = loc
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = str(RENDERS / (label + '-' + view + '.png'))
        bpy.ops.render.render(write_still=True)
        print('STUDY_RENDERED', label, view, flush=True)


def sha(file):
    return hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()


guarded = [BASE/'output/sailing-modular.blend', BASE/'output/sailing-modular.glb']
guarded += [LIBRARY/p for p in [
    'sailing-rig-studies-v2/output/sailing-gaff.blend',
    'sailing-rig-studies-v2/output/sailing-brig.blend',
]]
source_hashes = {str(p): sha(p) for p in guarded}
source_recipe = BASE/'build_modular.py'
source_text = source_recipe.read_text(encoding='utf-8')
helpers = {'finish', 'make', 'tube', 'rope', 'square', 'triangle'}
definitions = '\n\n'.join(ast.get_source_segment(source_text, n) for n in ast.parse(source_text).body if isinstance(n, ast.FunctionDef) and n.name in helpers)
assert 'def triangle(name,A,B,C,billow=.35,sub=20):' in definitions
definitions = definitions.replace('def triangle(name,A,B,C,billow=.35,sub=20):', 'def triangle(name,A,B,C,billow=.35,sub=20,foot_lift=0):')
definitions = definitions.replace('p.y+=billow*27*u*v*w;return p', 'p.y+=billow*27*u*v*w;p.z+=foot_lift*4*v*w;return p')
bpy.ops.wm.open_mainfile(filepath=str(BASE/'output/sailing-modular.blend'))
parts = [o for o in bpy.data.objects if base_part(o)]
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.hide_render = not base_part(obj)
kept = {o.name: signature(o) for o in parts if o.get('role') not in ['masts', 'rigging', 'sails']}
ns = {'bpy': bpy, 'bmesh': bmesh, 'np': np, 'math': math, 'Vector': Vector, 'objects': [], 'lines': [], 'cloths': []}
ns['WOOD'] = bpy.data.objects['Main_Mast'].data.materials[0]
ns['ROPE'] = bpy.data.objects['Main_Course_Canvas_Hem'].data.materials[0]
ns['CLOTH'] = bpy.data.objects['Main_Course_Canvas'].data.materials[0]
ns['IRON'] = bpy.data.materials['Dark forged iron']
exec(compile(definitions, str(source_recipe), 'exec'), ns)
primitive_rope = ns['rope']
def marked_rope(*args, **kwargs):
    obj = primitive_rope(*args, **kwargs)
    obj['rope_line'] = True
    return obj
ns['rope'] = marked_rope
tube, rope, square = ns['tube'], ns['rope'], ns['square']
bob = bpy.data.objects['Bowsprit_Bobstay']
bob_points = [sum((v.co for v in bob.data.vertices[i:i+6]), Vector())/6 for i in range(0,len(bob.data.vertices),6)]
for obj in list(parts):
    if obj.get('role') in ['sails', 'rigging'] or obj.name in ['Gaff', 'Boom']:
        bpy.data.objects.remove(obj, do_unlink=True)

mast = bpy.data.objects['Aft_Mast']
for v in mast.data.vertices:
    v.co.z = 1.92+(v.co.z-1.92)*(15.2-1.92)/(12.05-1.92)
mast.data.update()

def course(u,v):
    half = 3.8*(1-v)+4.6*v
    z = (5.1-.9*(2*u-1)**2)*(1-v)+9.72*v
    return Vector((-.98-.62*math.sin(math.pi*u)*math.sin(math.pi*v),(2*u-1)*half,z))

def topsail(u,v):
    half = 4.3*(1-v)+3.2*v
    z = (10.15+.28*(1-(2*u-1)**2))*(1-v)+13.77*v
    return Vector((-.98-.4*math.sin(math.pi*u)*math.sin(math.pi*v),(2*u-1)*half,z))

square('Refined_Fore_Course_Canvas',course,20,14)
square('Refined_Fore_Topsail_Canvas',topsail,20,14)
for fn,z in [(course,9.9),(topsail,13.95)]:
    for u in np.linspace(0,1,11):
        p=fn(float(u),1)
        rope('Refined_Yard_Head_Lacing',p,(-.95,p.y,z),.014,0)
for z,half in [(9.9,4.85),(13.95,3.43)]:
    yard_details(ns,-.95,15.55,z,half)
for side,u in [(-1,0),(1,1)]:
    root,support=existing_attachment('Course_Sheet_Cleat',side,1.5)
    rope('Refined_Course_Sheet',root,course(u,0),.032,.035,record=[support,'course clew'])
    rope('Refined_Topsail_Sheet',topsail(u,0),(-.95,side*4.85,9.9),.025,.015)

gaff = gaff_sail(ns,'Refined_Main_Gaff',5.4,15.2,5.55,11.05,10.4,13.6,14.4,.42)

old_report=json.loads((BASE/'build-report.json').read_text(encoding='utf-8'))
lower_anchor=Vector(next(v for v in old_report['jib_suspensions'] if v['name']=='Lower')['bow_anchor'])
jibs=[]
for label,anchor,head_anchor,clew,billow in [
    ('Upper',Vector((-12,0,5.91)),Vector((-.98,0,14.75)),Vector((-5.6,.3,7.2)),.35),
    ('Lower',lower_anchor,Vector((-1.01,0,10.28)),Vector((-3.15,.28,6.4)),.28),
]:
    direction=(head_anchor-anchor).normalized()
    tack=anchor+direction*.4
    head=head_anchor-direction*.35
    cloth=ns['triangle']('Refined_'+label+'_Jib_Canvas',tack,head,clew,billow,foot_lift=.6 if label=='Lower' else 0)
    stay=rope('Refined_'+label+'_Forestay',anchor,head_anchor,.034,0)
    stay['attached_canvas']=cloth.name
    rope('Refined_'+label+'_Tack_Lashing',anchor,tack,.022,0)
    rope('Refined_'+label+'_Head_Lashing',head,head_anchor,.022,0)
    root,support=existing_attachment(label+'_Jib_Sheet_Cleat',1,-4.15 if label=='Upper' else -2.58)
    rope('Refined_'+label+'_Jib_Sheet',root,clew,.032,.035,record=[support,cloth.name])
    radius=.245+(.115-.245)*(head_anchor.z-1.92)/(15.55-1.92)+.018
    binding(ns,'Refined_'+label+'_Head_Binding',-.85,head_anchor.z,radius)
    jibs.append({'label':label,'tack':list(tack),'head':list(head),'clew':list(clew)})

def shrouds(prefix,x,top):
    for side in [-1,1]:
        roots=[]
        for o in bpy.data.objects:
            if o.type=='MESH' and o.name.startswith(prefix+'_Chainplate') and o.get('role')=='fittings':
                p=sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
                if p.y*side>0:
                    roots.append((tree(o).find_nearest(p+Vector((0,0,.15)))[0],o.name))
        roots.sort(key=lambda item:item[0].x)
        assert len(roots)==3
        head=Vector((x,side*.09,top))
        for root,support in roots:
            rope('Refined_'+prefix+'_Shroud',root,head,.028,.018,record=[support,'mast band'])
        for t in np.linspace(.035,.68,19):
            rope('Refined_'+prefix+'_Ratline',roots[0][0].lerp(head,float(t)),roots[-1][0].lerp(head,float(t)),.014,.014)

shrouds('Main',-.85,14.2)
shrouds('Aft',5.4,14.45)
for side in [-1,1]:
    root,support=existing_attachment('Aft_Chainplate',side,5.75)
    rope('Refined_Fore_Backstay',(-.85,side*.1,15.3),root,.029,.025,record=['fore mast band',support])
    rope('Refined_Aft_Backstay',(5.4,side*.1,14.95),(11.4,side*1.58,4.42),.026,.025)
rope('Refined_Mast_Link',(-.85,0,15.25),(5.4,0,14.95),.032,.1)
rope('Refined_Bowsprit_Bobstay',bob_points[0],bob_points[-1],.04,.035)
for z in [2.15,3.1,9.9,13.95]:
    binding(ns,'Refined_Fore_Binding',-.85,z,.245+(.115-.245)*(z-1.92)/(15.55-1.92)+.018)
tube('Refined_Fore_Crosstree',[(-.85,-.76,10.02),(-.85,.76,10.02)],.065,ns['WOOD'],'masts',8)

parts=[o for o in bpy.data.objects if base_part(o)]
canvases=[o for o in parts if o.get('is_canvas')]
assert len(canvases)==5
verify_canvases(canvases)
for name,digest in kept.items():
    assert name in bpy.data.objects and signature(bpy.data.objects[name])==digest,('Changed accepted hull/equipment',name)
cloth_trees=[(o.name,tree(o)) for o in canvases]
rope_crossings=[]
for obj in ns['objects']:
    if not obj.get('rope_line'):
        continue
    rings=[sum((v.co for v in obj.data.vertices[i:i+6]),Vector())/6 for i in range(0,len(obj.data.vertices),6)]
    for a,b in zip(rings,rings[1:]):
        d=b-a
        if d.length<.002:continue
        for name,target in cloth_trees:
            if obj.get('attached_canvas')==name:continue
            if target.ray_cast(a+d.normalized()*.001,d.normalized(),d.length-.002)[0] is not None:
                rope_crossings.append([obj.name,name])
assert not rope_crossings,('Rope crosses independent cloth',rope_crossings)
points=[];faces=[]
for obj in parts:
    if obj.get('role') not in ['deck','stairs']:continue
    offset=len(points);points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
    faces.extend(tuple(offset+i for i in p.vertices) for p in obj.data.polygons)
walk=BVHTree.FromPolygons(points,faces)
crew_gaps=[]
for obj in canvases:
    for v in obj.data.vertices:
        p=obj.matrix_world@v.co
        floor=walk.ray_cast(p-Vector((0,0,.01)),Vector((0,0,-1)),25)[0]
        if floor is not None:crew_gaps.append(p.z-floor.z-1.8)
assert min(crew_gaps)>.12,('Cloth too low over deck',min(crew_gaps))
foredeck_poses=0
for ix in range(19):
    for iy in range(9):
        x,y=-6.5+ix*.25,-1+iy*.25
        support=[]
        for a in np.linspace(0,math.tau,8,endpoint=False):
            p=walk.ray_cast(Vector((x+.3*math.cos(a),y+.3*math.sin(a),4)),Vector((0,0,-1)),1)[0]
            if p is None or abs(p.z-3.4)>.1:break
            support.append(p.z)
        if len(support)!=8:continue
        floor=max(support)
        foredeck_poses+=1
        for dx in range(-3,4):
            for dy in range(-3,4):
                if dx*dx+dy*dy>9:continue
                for name,target in cloth_trees:
                    assert target.ray_cast(Vector((x+dx*.1,y+dy*.1,floor+.01)),Vector((0,0,1)),1.84)[0] is None,('Foredeck crew blocked',x,y,name)
binding_gaps=[]
for obj in parts:
    if 'Binding' not in obj.name or not (obj.name.startswith('Refined_') or obj.name.startswith('Study_')):continue
    target=tree(bpy.data.objects['Main_Mast' if obj.name.startswith('Refined_Fore_') or '_Head_Binding' in obj.name else 'Aft_Mast'])
    gap=min(target.find_nearest(v.co)[3] for v in obj.data.vertices)
    assert gap<.012,('Mast binding floats',obj.name,gap)
    binding_gaps.append(gap)
for x in [8.7,9,9.3]:
    for y in [-.28,0,.28]:
        for obj in canvases+[o for o in parts if o.get('role')=='masts']:
            assert tree(obj).ray_cast(Vector((x,y,3.42)),Vector((0,0,1)),1.85)[0] is None,('Helm blocked',obj.name)
for obj in parts:obj.data.calc_loop_triangles()
role_counts={role:sum(len(o.data.loop_triangles) for o in parts if o.get('role')==role) for role in ROLES}
report={'revision':'rig-refinement-v21','acceptedSourceHashes':source_hashes,'baseHelperSha256':sha(source_recipe),'canvasCount':5,'canvasIntersections':[],'ropeIntersections':[],'minimumCrewHeadGapM':min(crew_gaps),'crewSamples':len(crew_gaps),'foredeckBodyRadiusM':.3,'foredeckClearPoses':foredeck_poses,'maximumBindingGapM':max(binding_gaps),'unchangedBodyObjects':len(kept),'jibs':jibs,'roleTriangles':role_counts,'triangles':sum(role_counts.values()),'newRopeLines':sum(bool(o.get('rope_line')) for o in ns['objects'])}
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'sailing-refined.blend'))
patch_roles=['masts','rigging','sails','fittings']
clones=[]
for role in patch_roles:
    copies=[]
    for source in [o for o in parts if o.get('role')==role]:
        obj=source.copy();obj.data=source.data.copy();bpy.context.collection.objects.link(obj);copies.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join();joined=bpy.context.object;joined.name='Modular_'+role;joined['role']=role;clones.append(joined)
bpy.ops.object.select_all(action='DESELECT')
for obj in clones:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'rig.patch.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
for obj in clones:bpy.data.objects.remove(obj,do_unlink=True)
report['patchSha256']=sha(OUTPUT/'rig.patch.glb')
if '--no-render' not in sys.argv:render_scene('brigantine')
assert all(sha(pathlib.Path(p))==h for p,h in source_hashes.items())
(ROOT/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('RIG_REFINEMENT_VERIFIED',json.dumps({'triangles':report['triangles'],'minimumCrewHeadGapM':min(crew_gaps)}),flush=True)
