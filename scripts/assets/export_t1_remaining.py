"""Export the remaining T1 Mixamo class bodies with original Meshy PBR maps."""
from __future__ import annotations
import argparse, json, sys, tempfile, zipfile
from dataclasses import dataclass
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
BIBLE=ROOT.parent/'bible/models/characters/t1'
sys.path.insert(0,str(ROOT/'scripts/anim'))
from blender_bake_meshy_titan import add_clip, clear_animation, export_glb, import_base
@dataclass(frozen=True)
class Build:
    folder:str; source_zip:str; pack:str; base:str; clips:tuple[tuple[str,str],...]; extras:tuple[tuple[Path,str,str],...]=()
B= BIBLE/'mixamo_rigged'
BUILDS={
'druid':Build('druid','Meshy_AI_Verdant_Warden_1009120544_texture_fbx.zip','Great Sword Pack.zip','Meshy_AI_Verdant_Warden_1009120544_texture_fbx_mixamo.fbx',(('great sword idle.fbx','T1Druid_Idle'),('great sword walk.fbx','T1Druid_Walk'),('great sword run.fbx','T1Druid_Run'),('great sword slash.fbx','T1Druid_Attack'),('two handed sword death.fbx','T1Druid_Death'))),
'hunter':Build('hunter','Meshy_AI_The_Hooded_Pathfinder_1009120609_texture_fbx.zip','Pro Longbow Pack.zip','Meshy_AI_The_Hooded_Pathfinder_1009120609_texture_fbx_mixamo.fbx',(('standing idle 01.fbx','T1Hunter_Idle'),('standing walk forward.fbx','T1Hunter_Walk'),('standing run forward.fbx','T1Hunter_Run'),('standing draw arrow.fbx','T1Hunter_Attack'),('standing death backward 01.fbx','T1Hunter_Death'))),
'mage':Build('mage','Meshy_AI_Runebound_Wanderer_1009120633_texture_fbx.zip','Pro Magic Pack.zip','Meshy_AI_Runebound_Wanderer_1009120633_texture_fbx_mixamo.fbx',(('standing idle.fbx','T1Mage_Idle'),('Standing Walk Forward.fbx','T1Mage_Walk'),('Standing Run Forward.fbx','T1Mage_Run'),('Standing 1H Magic Attack 01.fbx','T1Mage_Attack'),('Standing React Death Backward.fbx','T1Mage_Death'))),
'paladin':Build('paladin','Meshy_AI_Starwarden_Knight_1009120655_texture_fbx.zip','Pro Sword and Shield Pack.zip','Meshy_AI_Starwarden_Knight_1009120655_texture_fbx_mixamo.fbx',(('sword and shield idle.fbx','T1Paladin_Idle'),('sword and shield walk.fbx','T1Paladin_Walk'),('sword and shield run.fbx','T1Paladin_Run'),('sword and shield slash.fbx','T1Paladin_Attack'),('sword and shield death.fbx','T1Paladin_Death'))),
'priest':Build('prist','Meshy_AI_Golden_Oathkeeper_1009120831_texture_fbx.zip','Pro Magic Pack.zip','Meshy_AI_Golden_Oathkeeper_1009120831_texture_fbx_mixamo.fbx',(('standing idle.fbx','T1Priest_Idle'),('Standing Walk Forward.fbx','T1Priest_Walk'),('Standing Run Forward.fbx','T1Priest_Run'),('Standing 1H Magic Attack 01.fbx','T1Priest_Attack'),('Standing React Death Backward.fbx','T1Priest_Death'))),
'rogue':Build('rogue','Meshy_AI_Hooded_Wanderer_1009120808_texture_fbx.zip','Pro Sword and Shield Pack.zip','Meshy_AI_Hooded_Wanderer_1009120808_texture_fbx_mixamo.fbx',(('sword and shield idle.fbx','T1Rogue_Idle'),('sword and shield walk.fbx','T1Rogue_Walk'),('sword and shield run.fbx','T1Rogue_Run'),('sword and shield death.fbx','T1Rogue_Death')),((B/'rogue'/'Stabbing.fbx','Stabbing.fbx','T1Rogue_Attack'),)),
'shaman':Build('shaman','Meshy_AI_Ironbound_Highlander_1009120750_texture_fbx.zip','Pro Magic Pack.zip','Meshy_AI_Ironbound_Highlander_1009120750_texture_fbx_mixamo.fbx',(('standing idle.fbx','T1Shaman_Idle'),('Standing Walk Forward.fbx','T1Shaman_Walk'),('Standing Run Forward.fbx','T1Shaman_Run'),('Standing 2H Magic Attack 01.fbx','T1Shaman_Attack'),('Standing React Death Backward.fbx','T1Shaman_Death'))),
'warrior':Build('warior','Meshy_AI_Quilted_Wayfarer_1009120524_texture_fbx.zip','Great Sword Pack.zip','Meshy_AI_Quilted_Wayfarer_1009120524_texture_fbx_mixamo.fbx',(('great sword idle.fbx','T1Warrior_Idle'),('great sword walk.fbx','T1Warrior_Walk'),('great sword run.fbx','T1Warrior_Run'),('great sword slash.fbx','T1Warrior_Attack'),('two handed sword death.fbx','T1Warrior_Death'))),}
def maps(src,out):
 m={'base':lambda s:not any(x in s for x in ('normal','metallic','roughness')),'normal':lambda s:'normal'in s,'metallic':lambda s:'metallic'in s,'roughness':lambda s:'roughness'in s}; r={}
 with zipfile.ZipFile(src) as z:
  e=[x for x in z.infolist() if x.filename.lower().endswith(('.png','.jpg','.jpeg'))]
  for k,f in m.items():
   c=[x for x in e if f(Path(x.filename).stem.lower())]
   if len(c)!=1: raise RuntimeError(f'{src.name} {k}: {len(c)}')
   p=out/(k+Path(c[0].filename).suffix.lower());p.write_bytes(z.read(c[0]));r[k]=p
 return r
def material(p):
 m=bpy.data.materials.new('t1_source_pbr');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear();o=n.new('ShaderNodeOutputMaterial');s=n.new('ShaderNodeBsdfPrincipled');l.new(s.outputs['BSDF'],o.inputs['Surface'])
 for k,slot in (('base','Base Color'),('roughness','Roughness'),('metallic','Metallic')):
  t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(p[k]),check_existing=False);t.image.colorspace_settings.name='sRGB' if k=='base' else 'Non-Color';l.new(t.outputs['Color'],s.inputs[slot])
 t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(p['normal']),check_existing=False);t.image.colorspace_settings.name='Non-Color';no=n.new('ShaderNodeNormalMap');l.new(t.outputs['Color'],no.inputs['Color']);l.new(no.outputs['Normal'],s.inputs['Normal']);return m
def main():
 a=argparse.ArgumentParser();a.add_argument('--class',dest='cls',choices=BUILDS,required=True);x=a.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);c=BUILDS[x.cls];pack=B/c.folder/c.pack;src=BIBLE/c.source_zip;out=ROOT/'tmp/asset_src/players'/f't1_{x.cls}';tmp=out/'tmp';tmp.mkdir(parents=True,exist_ok=True);tempfile.tempdir=str(tmp)
 with tempfile.TemporaryDirectory(prefix='t1_') as d:
  d=Path(d)
  with zipfile.ZipFile(pack) as z:
   (d/c.base).write_bytes(z.read(c.base))
   for f,_ in c.clips:(d/f).write_bytes(z.read(f))
  for p,f,_ in c.extras:(d/f).write_bytes(p.read_bytes())
  rig,mesh=import_base(d/c.base);rig.name=f't1_{x.cls}_Rig';mesh.name=f't1_{x.cls}_Body';mesh.data.name=mesh.name;ax,az=clear_animation(rig)
  for f,name in c.clips: add_clip(rig,d/f,name,ax,az)
  for _,f,name in c.extras:add_clip(rig,d/f,name,ax,az)
  with tempfile.TemporaryDirectory(prefix='maps_') as md:
   mesh.data.materials.clear();mesh.data.materials.append(material(maps(src,Path(md))));rig['source']=f'Original {src.name}; Mixamo {c.pack}';export_glb(out/f't1_{x.cls}.glb',rig,[mesh])
 print(json.dumps({'class':x.cls,'output':str(out),'clips':[n for _,n in c.clips]+[n for _,_,n in c.extras]}))
if __name__=='__main__':main()
