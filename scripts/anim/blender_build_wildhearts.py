"""Import the owner's complete native Wildheart packs and approved special clips.

All standard states use each body's own merged FBX. All supplied actions remain
available as Wildheart_Native_* with original duration and pose curves. Only
horizontal root travel and negative floor penetration are corrected on Hips.
Semantic travel aliases retime those same native curves for real entity scales.
The user-supplied reaction may be evaluated onto the other four native rigs.
Previously approved throws and Beastmaster gestures come from the explicit
frozen JSON source, after a strict native rest-binding comparison.
"""
from pathlib import Path
import hashlib,json,math,statistics,sys,tempfile
import bpy
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from blender_bake_meshy_titan import action_fcurves,export_glb
from blender_import_community_native import extract,snapshot,apply,blend,floor_height,material_from_original
from wildheart_frozen_throws import poses_for as approved_poses
WORK=ROOT/'tmp/wildhearts-native-import'
SOURCE=ROOT.parent/'bible/models/mobs/comunity/wildhearts'
FPS=60
REACTION_SHA='5c7ee80caf4751126249d03a86dbdfdfa67071040aa5e9d7b6f8f8ce93dea2f7'
MODELS={
 'cycle8':dict(archive='Meshy_AI_Cyclewarder_Troll_8_biped.zip',sha='5137b657e1ff1751b47453e548547394b215abc8c38908c0ef6985a4034b69f7',triangles=103884,bones=82,height=1.07,scale=2.8,combat='Idle_8',attack='mage_soell_cast_8',death='Dead',cast='mage_soell_cast_8',heal='mage_soell_cast_7',slam='Charged_Ground_Slam'),
 'silent1':dict(archive='Meshy_AI_Silentveil_Troll_1_biped.zip',sha='bb9823dd476ede9c165f3e3210969fb9bd84ad16ff8401ab7adef906efbf7c6a',triangles=103812,bones=83,height=1.25,scale=2.,combat='Idle_5',attack='Charged_Slash',death='dying_backwards'),
 'silent4':dict(archive='Meshy_AI_Silentveil_Troll_4_biped.zip',sha='0d65df1ec25ab87f49683fa6126562e8c125f7f8adc395dd850d8cafe202f10d',triangles=103557,bones=85,height=1.26,scale=1.9,combat='Idle_5',attack='mage_soell_cast_4',death='Dead',cast='mage_soell_cast_4',heal='mage_soell_cast_7',slam='Charged_Ground_Slam',hit='Hit_Reaction'),
 'silent6':dict(archive='Meshy_AI_Silentveil_Troll_6_biped.zip',sha='9a05fa6312cec38965a571ea579023284ba56c1f5d0a33fcbd644c2d42152867',triangles=103911,bones=66,height=1.15,scale=2.35,combat='Idle_5',attack='Double_Combo_Attack',death='Dead'),
 'silent8':dict(archive='Meshy_AI_Silentveil_Troll_8_biped.zip',sha='2b5325720ed5423fa65cbfa3e8650676bc5724b0ad7aace12029087c56a64615',triangles=104034,bones=28,height=1.3,scale=1.85,combat='Idle_5',attack='Double_Combo_Attack',death='dying_backwards'),
}


def bind_action(rig,action):
 rig.animation_data.action=action
 if action.slots:rig.animation_data.action_slot=action.slots[0]


def reset(rig):
 for bone in rig.pose.bones:bone.matrix_basis.identity()
 bpy.context.view_layer.update()


def shifted_copy(action,name,factor=1,offset=0):
 result=action.copy();result.name=name
 for curve in action_fcurves(result):
  for p in curve.keyframe_points:
   p.co.x=(p.co.x-offset)*factor;p.handle_left.x=(p.handle_left.x-offset)*factor;p.handle_right.x=(p.handle_right.x-offset)*factor
  curve.update()
 return result


def track(rig,action):
 rig.animation_data.action=None;t=rig.animation_data.nla_tracks.new();t.name=action.name;t.strips.new(action.name,0,action);t.mute=True


def donated_reaction(rig,folder):
 before=set(bpy.data.objects);bpy.ops.import_scene.fbx(filepath=str(next(folder.rglob('*Animation_Hit_Reaction_withSkin.fbx'))),use_image_search=False)
 objects=set(bpy.data.objects)-before;donor=next(o for o in objects if o.type=='ARMATURE');action=donor.animation_data.action
 source_fps=bpy.context.scene.render.fps;start,end=action.frame_range;seconds=(end-start)/source_fps
 bones=sorted(rig.pose.bones,key=lambda b:len(b.parent_recursive));reset(rig)
 target_rest={b.name:rig.matrix_world@b.bone.matrix_local for b in bones};relative={b.name:b.parent.bone.matrix_local.inverted()@b.bone.matrix_local if b.parent else b.bone.matrix_local.copy()for b in bones}
 source_rest={b.name:donor.matrix_world@b.bone.matrix_local for b in donor.pose.bones};names={b.name.split(':')[-1]:b.name for b in donor.pose.bones};inv=rig.matrix_world.inverted()
 ratio=target_rest['mixamorig:Hips'].translation.z/source_rest[names['Hips']].translation.z;poses=[]
 for frame in range(round(start),round(end)+1):
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();solved={}
  for bone in bones:
   n=names.get(bone.name.split(':')[-1])
   if n:
    world=donor.matrix_world@donor.pose.bones[n].matrix;sq=source_rest[n].to_quaternion();tq=target_rest[bone.name].to_quaternion();swing=(tq@Vector((0,1,0))).rotation_difference(sq@Vector((0,1,0)))
    q=world.to_quaternion()@sq.inverted()@swing@tq
    loc=(solved[bone.parent.name]@relative[bone.name]).translation if bone.parent else inv@(target_rest[bone.name].translation+(world.translation-source_rest[n].translation)*ratio)
    matrix=Matrix.LocRotScale(loc,(inv.to_quaternion()@q).normalized(),Vector((1,1,1)))
   else:matrix=solved[bone.parent.name]@relative[bone.name]if bone.parent else bone.bone.matrix_local.copy()
   solved[bone.name]=matrix;bone.matrix_basis=relative[bone.name].inverted()@(solved[bone.parent.name].inverted()@matrix if bone.parent else matrix)
  bpy.context.view_layer.update();poses.append(snapshot(rig))
 for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
 if action.users==0:bpy.data.actions.remove(action)
 return poses,seconds


def build(key):
 c=MODELS[key];file=SOURCE/c['archive']
 if hashlib.sha256(file.read_bytes()).hexdigest()!=c['sha']:raise RuntimeError('Native source SHA changed: '+key)
 folder=WORK/key;extract(file,folder);merged=next(folder.rglob('*Merged_Animations.fbx'))
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=str(merged),use_image_search=False)
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];scene=bpy.context.scene
 if len(meshes)!=1 or len(rig.data.bones)!=c['bones']or sum(p.loop_total-2 for m in meshes for p in m.data.polygons)!=c['triangles']:raise RuntimeError('Native topology changed: '+key)
 original_fps=scene.render.fps/scene.render.fps_base;originals={a.name.split('|')[-1]:a for a in bpy.data.actions}
 for needed in ['Idle_11',c['combat'],'Walking','Running',c['attack'],c['death']]:
  if needed not in originals:raise RuntimeError('Missing native standard action: '+key+' '+needed)
 rig.animation_data.action=None;reset(rig);source_height=max((m.matrix_world@Vector(p)).z for m in meshes for p in m.bound_box)-min((m.matrix_world@Vector(p)).z for m in meshes for p in m.bound_box)
 material=material_from_original(folder,'Wildheart_'+key)
 for mesh in meshes:
  mesh.data.materials.clear();mesh.data.materials.append(material);mesh['source_sha256']=c['sha'];mesh['original_triangles']=c['triangles'];mesh['original_joint_count']=c['bones'];mesh['native_animation_source']=merged.name;mesh['source']='Owner native merged FBX, native standard states, explicit supplied reaction and frozen approved ability exceptions'
 hips=rig.pose.bones['mixamorig:Hips'];inv=rig.matrix_world.inverted().to_3x3();report={};actions={};native_actions={}
 # Preserve original Euler/quaternion pose curves. Only correct Hips location.
 for source_name,original in sorted(originals.items()):
  reset(rig);bind_action(rig,original);start,end=original.frame_range;seconds=(end-start)/original_fps;count=round(seconds*FPS)
  centers=[]
  for f in [start,end]:scene.frame_set(round(f));bpy.context.view_layer.update();centers.append(rig.matrix_world@hips.head)
  origin,net=centers[0],centers[1]-centers[0];net.z=0;locations=[];feet={'LeftFoot':[],'RightFoot':[]};floors=[]
  for i in range(count+1):
   frame=start+(end-start)*i/count;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));bpy.context.view_layer.update();floor=floor_height(meshes)
   # Keep a planted model on the floor through its fall; preserve the original
   # airborne arc only for explicitly airborne source actions.
   ground = max(0,-floor) if source_name in ['Basic_Jump','Spartan_Kick'] else -floor
   correction=Vector((-origin.x,-origin.y,ground))-net*(i/count)
   for side in feet:feet[side].append(list((rig.matrix_world@rig.pose.bones['mixamorig:'+side].head)+correction))
   matrix=hips.matrix.copy();matrix.translation+=inv@correction;hips.matrix=matrix;locations.append(tuple(hips.location));floors.append(max(0,floor))
  action=shifted_copy(original,'Wildheart_Native_'+source_name,FPS/original_fps,start);bind_action(rig,action)
  path='pose.bones["mixamorig:Hips"].location'
  for axis in range(3):
   curve=next((f for f in action_fcurves(action)if f.data_path==path and f.array_index==axis),None)
   if curve is None:
    hips.keyframe_insert('location',index=axis,frame=0);curve=next(f for f in action_fcurves(action)if f.data_path==path and f.array_index==axis)
   curve.keyframe_points.clear();curve.keyframe_points.add(count+1)
   for i,p in enumerate(curve.keyframe_points):p.co=(i,locations[i][axis]);p.interpolation='LINEAR'
   curve.update()
  velocities={}
  for side,samples in feet.items():
   threshold=min(p[2]for p in samples)+.25*(max(p[2]for p in samples)-min(p[2]for p in samples));vs=[(b[1]-a[1])*FPS for a,b in zip(samples,samples[1:])if a[2]<=threshold and b[2]<=threshold and b[1]>a[1]];velocities[side]=statistics.median(vs)if vs else 0
  report[action.name]={'kind':'native','nativeAction':source_name,'seconds':count/FPS,'sourceSeconds':seconds,'stanceFootVelocitySourceUnits':velocities,'floorRange':[min(floors),max(floors)],'removedHorizontalRoot':list(net)}
  native_actions[source_name]=action;actions[action.name]=action;track(rig,action)
  print('NATIVE',key,source_name,flush=True)
 scene.render.fps=FPS
 def alias(name,source_name,seconds=None):
  source=native_actions[source_name];stats=report[source.name];seconds=seconds if seconds is not None else stats['seconds'];seconds=round(seconds*FPS)/FPS
  a=shifted_copy(source,'Wildheart_'+name,seconds/stats['seconds'])
  if name in ['Idle','CombatIdle']:
   # Blend the last tenth of the supplied stance back to its first pose.
   for curve in action_fcurves(a):
    end=seconds*FPS; start=end*.9; first=curve.evaluate(0); boundary=curve.evaluate(start)
    while len(curve.keyframe_points) and curve.keyframe_points[-1].co.x>=start:
     curve.keyframe_points.remove(curve.keyframe_points[-1],fast=True)
    for frame,value in [(start,boundary),(end,first)]:
     point=curve.keyframe_points.insert(frame,value,options={'FAST'});point.interpolation='LINEAR'
    curve.update()
  if name=='Death':
   # Play the complete fall, then hold its final pose for a quarter second.
   for curve in action_fcurves(a):
    final=curve.evaluate(seconds*FPS)
    point=curve.keyframe_points.insert((seconds+.25)*FPS,final,options={'FAST'});point.interpolation='LINEAR';curve.update()
   seconds+=.25
  track(rig,a);actions[a.name]=a
  item={**stats,'kind':'native-alias','seconds':seconds}
  if name in ['Walk','Run']:
   ratio=stats['seconds']/seconds;item['stanceFootVelocitySourceUnits']={k:v*ratio for k,v in stats['stanceFootVelocitySourceUnits'].items()};item['recommendedReferenceSpeed']=statistics.mean(item['stanceFootVelocitySourceUnits'].values())*c['height']/source_height*c['scale']
  report[a.name]=item
 alias('Idle','Idle_11');alias('CombatIdle',c['combat']);alias('Attack',c['attack']);alias('Death',c['death'])
 for name,source_name,target in [('Walk','Walking',3.3),('Run','Running',7.5)]:
  stats=report[native_actions[source_name].name];raw=statistics.mean(stats['stanceFootVelocitySourceUnits'].values())*c['height']/source_height*c['scale'];alias(name,source_name,stats['seconds']*raw/target)
 for name in ['cast','heal','slam','hit']:
  if name in c:alias(name.capitalize(),c[name])
 if key=='cycle8':
  # Existing pulse damage is instant. Replay only the supplied slam contact
  # and complete native recovery, without manufacturing a new pose sequence.
  source=native_actions['Charged_Ground_Slam'];start=50*FPS/original_fps;end=90*FPS/original_fps
  release=source.copy();release.name='Wildheart_Release'
  for curve in action_fcurves(release):
   first,last=curve.evaluate(start),curve.evaluate(end)
   inside=[(p.co.x-start,p.co.y)for p in curve.keyframe_points if start<p.co.x<end]
   points=[(0,first),*inside,(end-start,last)];curve.keyframe_points.clear();curve.keyframe_points.add(len(points))
   for p,value in zip(curve.keyframe_points,points):p.co=value;p.interpolation='LINEAR'
   curve.update()
  track(rig,release);actions[release.name]=release;report[release.name]={'kind':'native-source-slice','nativeAction':'Charged_Ground_Slam','sourceFrames':[51,91],'seconds':(end-start)/FPS,'impactSeconds':2/original_fps}

 def bake_poses(name,poses,seconds,kind,extra,ground=False):
  count=round(seconds*FPS);action=bpy.data.actions.new(name);bind_action(rig,action);previous={}
  for i in range(count+1):
   index=i/count*(len(poses)-1);lo=int(index);pose=blend(poses[lo],poses[min(lo+1,len(poses)-1)],index-lo);apply(rig,pose)
   if ground:
    p=rig.matrix_world@hips.head;matrix=hips.matrix.copy();floor=floor_height(meshes)
    contact=max(0,1-i/(FPS*.2),1-(count-i)/(FPS*.2))
    vertical=-floor if floor<0 else -floor*contact
    matrix.translation+=inv@Vector((-p.x,-p.y,vertical));hips.matrix=matrix;bpy.context.view_layer.update()
   for bone in rig.pose.bones:
    if bone.rotation_mode=='QUATERNION':prop='rotation_quaternion';bone.rotation_quaternion.normalize()
    else:
     prop='rotation_euler'
     if bone.name in previous:bone.rotation_euler.make_compatible(previous[bone.name])
     previous[bone.name]=bone.rotation_euler.copy()
    for path in ['location',prop,'scale']:bone.keyframe_insert(path,frame=i,group=bone.name)
  for curve in action_fcurves(action):
   for point in curve.keyframe_points:point.interpolation='LINEAR'
  track(rig,action);actions[name]=action;report[name]={'kind':kind,'seconds':count/FPS,**extra}
 if 'hit'not in c:
  reaction=SOURCE/'reaction.zip'
  if hashlib.sha256(reaction.read_bytes()).hexdigest()!=REACTION_SHA:raise RuntimeError('Supplied reaction SHA changed')
  rf=WORK/'reaction';extract(reaction,rf);rig.animation_data.action=None;poses,seconds=donated_reaction(rig,rf);scene.render.fps=FPS
  bake_poses('Wildheart_Hit',poses,seconds,'authorized-reaction-retarget',{'sourceArchive':'reaction.zip','sourceSha256':REACTION_SHA,'nativeAction':'Hit_Reaction'},ground=True)
 frozen=json.loads(Path(__file__).with_name('wildheart_approved_throws.json').read_text())
 for item in frozen['items']:
  if item['key']!=key:continue
  rig.animation_data.action=None;poses,metadata=approved_poses(rig,meshes,key,WORK,FPS,item['clip']);bake_poses(item['clip'],poses,item['duration'],'approved-frozen',metadata)
 for t in rig.animation_data.nla_tracks:t.mute=False
 rig.animation_data.action=None;reset(rig);scene.frame_set(0)
 for mesh in meshes:
  mesh['native_action_names']=json.dumps(sorted(originals))
  if 'hit'not in c:mesh['reaction_sha256']=REACTION_SHA
  if any(item['key']==key for item in frozen['items']):mesh['approved_animation_source_sha256']=hashlib.sha256(Path(__file__).with_name('wildheart_approved_throws.json').read_bytes()).hexdigest()
 out=ROOT/f'tmp/asset_src/community_wildhearts/community_wildheart_{key}.glb';export_glb(out,rig,meshes)
 metadata={'key':key,'sourceSha256':c['sha'],'triangles':c['triangles'],'bones':c['bones'],'sourceHeight':source_height,'visualHeight':c['height'],'entityScale':c['scale'],'nativeActions':sorted(originals),'clips':report}
 (WORK/(key+'-report.json')).write_text(json.dumps(metadata,indent=2));out.with_suffix('.json').write_text(json.dumps(metadata,indent=2));print('READY',key,flush=True)


def main():
 WORK.mkdir(parents=True,exist_ok=True);tempfile.tempdir=str(WORK)
 keys=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else list(MODELS)
 for key in keys:build(key)

if __name__=='__main__':main()
