"""Replay the two frozen, previously approved throws on the identical native rig.

The JSON beside this helper is an offline animation source, not a runtime asset.
Rest bindings are checked before reuse. No pose is invented or transferred to a
foreign skeleton; evaluated glTF matrices are converted back to Blender axes.
"""
from pathlib import Path
import bisect
import hashlib
import json
import math
import struct
import bpy
from mathutils import Matrix, Quaternion, Vector

SOURCE = Path(__file__).with_name('wildheart_approved_throws.json')


def local_matrix(node):
    if 'matrix' in node:
        v=node['matrix']
        return Matrix([[v[c*4+r] for c in range(4)] for r in range(4)])
    q=node.get('rotation',[0,0,0,1])
    if any(abs(v)>1.001 for v in q) or sum(v*v for v in q)<.99:raise RuntimeError('Invalid decoded quaternion in approved source')
    return Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(node.get('scale',[1,1,1])))


def world_matrices(nodes):
    by_name={n['name']:n for n in nodes}
    result={}
    def visit(name):
        if name not in result:
            node=by_name[name]
            result[name]=(visit(node['parent']) if node.get('parent') in by_name else Matrix.Identity(4))@local_matrix(node)
        return result[name]
    for name in by_name:visit(name)
    return result


def sample(channel,time):
    times=channel['times'];size=4 if channel['path']=='rotation' else 3
    upper=bisect.bisect_right(times,time)
    lo=max(0,upper-1);hi=min(len(times)-1,upper)
    a=channel['values'][lo*size:(lo+1)*size]
    b=channel['values'][hi*size:(hi+1)*size]
    if hi==lo or channel['interpolation']=='STEP':return a
    p=max(0,min(1,(time-times[lo])/(times[hi]-times[lo])))
    if size==4:
        qa=Quaternion((a[3],a[0],a[1],a[2]));qb=Quaternion((b[3],b[0],b[1],b[2]));q=qa.slerp(qb,p)
        return [q.x,q.y,q.z,q.w]
    return list(Vector(a).lerp(Vector(b),p))


def poses_for(rig,meshes,key,work,fps,clip=None):
    library=json.loads(SOURCE.read_text())
    source=next((v for v in library['items'] if v['key']==key and (clip is None or v['clip']==clip)),None)
    if source is None:return None,None
    rig.animation_data.action=None
    for b in rig.pose.bones:b.matrix_basis.identity()
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for mesh in meshes:mesh.select_set(True)
    bpy.context.view_layer.objects.active=rig
    file=work/(key+'-checked-native-bind.glb')
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_animations=False,export_materials='NONE',export_yup=True,export_cameras=False,export_lights=False)
    raw=file.read_bytes();doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    parent={child:i for i,n in enumerate(doc['nodes']) for child in n.get('children',[])}
    nodes=[{**n,'parent':doc['nodes'][parent[i]]['name'] if i in parent else None}for i,n in enumerate(doc['nodes'])]
    native=world_matrices(nodes)
    if set(b.name for b in rig.pose.bones)!=set(v['name'] for v in source['binding']):
        raise RuntimeError('Approved throw joint inventory differs: '+key)
    max_difference=0
    for old in source['binding']:
        current=native[old['name']]
        for r in range(4):
            for c in range(4):max_difference=max(max_difference,abs(current[r][c]-old['matrixWorld'][c*4+r]))
        current_node=next(n for n in nodes if n['name']==old['name'])
        if current_node['parent']!=old['parent']:raise RuntimeError('Approved throw hierarchy differs: '+old['name'])
    if max_difference>source['bindingTolerance']:
        raise RuntimeError('Approved throw rest bindings differ: '+key+' '+str(max_difference))
    rest=world_matrices(source['nodes'])
    convert=Matrix.Rotation(math.pi/2,4,'X')
    native_rest={b.name:rig.matrix_world@b.bone.matrix_local for b in rig.pose.bones}
    bridge={name:(convert@rest[name]).inverted()@matrix for name,matrix in native_rest.items()}
    relative={b.name:b.parent.bone.matrix_local.inverted()@b.bone.matrix_local if b.parent else b.bone.matrix_local.copy() for b in rig.pose.bones}
    to_rig=rig.matrix_world.inverted();poses=[]
    count=round(source['duration']*fps)
    for frame in range(count+1):
        time=min(source['duration'],frame/fps)
        current={n['name']:{**n}for n in source['nodes']}
        for channel in source['channels']:
            current[channel['node']][channel['path']]=sample(channel,time)
        world=world_matrices(list(current.values()))
        solved={name:to_rig@convert@world[name]@bridge[name]for name in native_rest}
        for bone in rig.pose.bones:
            matrix=solved[bone.parent.name].inverted()@solved[bone.name]if bone.parent else solved[bone.name]
            bone.matrix_basis=relative[bone.name].inverted()@matrix
        bpy.context.view_layer.update()
        poses.append({b.name:b.matrix_basis.copy()for b in rig.pose.bones})
    metadata={k:source[k]for k in ['clip','duration','sourceShippingGlbSha256','legacyArchiveSha256','bindingFingerprint']}
    metadata.update({'sourceJsonSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'maxNativeBindDifference':max_difference,'frames':count+1})
    return poses,metadata
