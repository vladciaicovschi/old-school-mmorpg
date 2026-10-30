# Rigged model import and animation runbook

Status: living runbook.

For the user-approved Warlock caster motion and palm VFX reference, including
future Mage/Priest/caster-mob migration, see
[Caster animation and hand VFX runbook](caster-animation-runbook.md).

This runbook covers the proven pipeline for importing externally authored FBX assets as
optimized, animated GLBs for World of ClaudeCraft. It records the workflow validated by
the Meshy Iron Titan humanoid, the Meshy Emberclaw crab, and the Knight's Valor sword and
shield.

It complements `docs/image-to-glb-asset-workflow.md`. That document owns reference-image
intake and procedural static props. This document owns skinned characters, non-humanoid
rigs, animation retargeting, and held equipment.

Apply `docs/design/nhance-inspired-asset-style-guide.md` before this runbook. An asset
should pass the visual-direction gate before rigging and animation work begins.

The modular body and swappable armor problem is not solved here. That work needs a
separate contract for a shared skeleton, body-part visibility, armor skin weights,
material slots, and equipment compatibility.

## Proven outcomes and source of truth

The current examples are model-specific, but their stages are reusable:

| Asset type | Authoring script | Pipeline spec | Runtime contract test |
|---|---|---|---|
| Mixamo humanoid | `scripts/anim/blender_bake_meshy_titan.py` | `scripts/assets/specs/meshy_titan.json` | `tests/meshy_titan_weapon_models.test.ts` |
| Non-humanoid creature | `scripts/anim/blender_bake_emberclaw_crab.py` | `scripts/assets/specs/emberclaw_crab.json` | `tests/proving_shore_monster_visuals.test.ts` |
| Separate sword and shield | `scripts/assets/export_meshy_knights_valor_weapon.py` | `scripts/assets/specs/meshy_knights_valor_weapons.json` | `tests/meshy_titan_weapon_models.test.ts` |

The checked-in scripts and tests are authoritative. Examples in this document explain
the process, but a future change must re-read those files before running commands.

## The short version

Use this sequence for every imported animated model:

```text
source intake
  -> classify rig and animation strategy
  -> inspect FBX structure, transforms, bounds, skin, and textures
  -> prepare or validate the rig
  -> rebuild materials explicitly
  -> author or retarget animation on one final skeleton
  -> export a raw GLB under tmp/asset_src
  -> inspect and render the raw GLB
  -> run build_assets.mjs
  -> convert embedded textures to KTX2
  -> regenerate the media manifest
  -> run structural tests and typecheck
  -> inspect the shipping GLB in the game
```

Do not skip directly from an FBX that looks correct in a web viewer to runtime
integration. Each boundary can introduce a different class of defect.

## Meshy humanoid round trip through Mixamo

This is the proven character workflow for the Meshy warrior sets and Apothecary Lin.
Use it for the remaining named NPCs unless a model needs a documented exception.

The important separation is:

- The Mixamo upload is a compatibility intermediate. It contains one mesh and only a
  diffuse texture.
- The original Meshy archive is the visual source of truth. Its base-color, normal,
  metallic, and roughness maps are restored after rigging.
- The Mixamo download is the skeleton and animation source. Its embedded or recompressed
  texture is never the shipping texture source.

### Stage A: preserve the source package

Keep the original Meshy ZIP unchanged. It must contain one intended FBX and exactly one
map for each material channel:

```text
base color
normal
metallic
roughness
```

Record the archive name and character id before producing any derivative. Never overwrite
the archive with a prepared or rigged FBX.

### Stage B: build the Mixamo upload

The upload file must match the layout that passed for Apothecary Lin:

- one joined humanoid mesh;
- no armature, actions, armature modifiers, or skin vertex groups;
- neutral A-pose or T-pose with separated limbs;
- applied location, rotation, and scale;
- feet grounded at zero;
- 1.8 m reference height unless the character intentionally uses another documented height;
- no more than about 60,000 triangles for the current NPC pipeline;
- one opaque material with one embedded diffuse texture;
- UVs and source normals preserved.

For the current NPC batch, run Blender 5.2 from `D:/THE_GAME`:

```powershell
& "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" `
  --background --factory-startup `
  --python bible/models/npc/prepare_remaining_mixamo.py
```

The script reads the first-pass mesh-only FBXs from
`bible/models/npc/mixamo_ready/` and writes the repaired files to
`bible/models/npc/mixamo_ready_fixed/`. Each character folder contains:

```text
<Name>_mixamo.fbx        upload this first
<Name>_mixamo.obj        local fallback source
<Name>_mixamo.mtl
diffuse.png              Mixamo compatibility texture
source_pbr/base.png      original high-quality Meshy maps
source_pbr/normal.png
source_pbr/metallic.png
source_pbr/roughness.png
```

The output root also contains `<Name>_mixamo_obj.zip`. If Mixamo rejects the FBX,
upload that ZIP intact. Do not unpack it before uploading.

The batch is accepted only when reimport validation confirms one mesh, no armature or
stale skin data, one material and image, the intended height, the triangle budget, valid
UVs, and a readable preview.

### Stage C: auto-rig and download from Mixamo

Upload one character at a time. Place the chin, wrists, elbows, knees, and groin markers
on the visible body rather than on armor protrusions. Use the standard Mixamo skeleton.

Download and keep:

1. One base FBX with skin, using the original neutral pose when possible.
2. Every selected animation as an FBX with skin or as an animation donor that exposes the
   same Mixamo hierarchy.
3. A small text manifest that records which downloaded file supplies each runtime clip.

Do not rename arbitrary bones or manually move a rigged mesh relative to the armature.
If the auto-rig is bad, return to Stage B and repair the upload geometry.

For disconnected skeleton anatomy or open bony fingers, a disposable inference
proxy may be added under the material name
`MIXAMO_RIG_PROXY_REMOVE_AFTER_RIG`. Keep that material in the Mixamo download.
The shared Blender importer removes every proxy face before rebuilding the PBR
material and exporting the game GLB; the proxy must never ship with the model.

### Stage D: rebuild the game asset

Import the rigged base FBX, normalize the Mixamo armature to metre-native transforms,
and retarget all selected clips onto that single final skeleton. The shipped GLB must
contain one skeleton and a stable runtime animation vocabulary.

Before GLB export, discard the material imported from the Mixamo download and rebuild a
Principled BSDF material from the preserved `source_pbr` maps or directly from the
unchanged Meshy ZIP:

| Source map | Blender input | Color space |
|---|---|---|
| base color | Base Color | sRGB |
| normal | Normal Map node to Normal | Non-Color |
| metallic | Metallic | Non-Color |
| roughness | Roughness | Non-Color |

Keep the material opaque unless the original asset intentionally requires alpha. Do not
connect base-color alpha by default. `scripts/assets/export_apothecary_lin.py` is the
current reference implementation: its `extract_maps` and `build_material` functions
restore all four maps from the original archive after the Mixamo rig and idle clips have
been imported.

### Stage E: optimize and validate for the game

Export a raw GLB under `tmp/asset_src/npcs/<character_id>/`, then run the normal asset
build and KTX2 texture conversion before copying it into `public/models/chars/npcs/`.
Validate all of the following before adding the manifest entry:

- one intended armature and skinned body;
- armature object scale is one;
- feet and held-item sockets remain aligned through every clip;
- animation names and loop ranges match the runtime manifest;
- original source maps, rather than the Mixamo diffuse, feed the shipping material;
- texture color spaces are correct;
- no transparent holes or missing backfaces;
- triangle count, texture dimensions, GLB bytes, and simultaneous NPC count are reasonable;
- the raw GLB and KTX2 GLB both load and retain their materials and clips.

Create a preview before integration. Perform the final visual judgment in the developer
model test island with `/dev lab`; automated checks do not replace that manual review.

## 1. Classify the asset before changing it

Choose one path before doing any Blender work.

### Humanoid with Mixamo-compatible proportions

Use Mixamo for the common skeleton and donor animations. Export one skinned base model,
then retarget every selected animation onto that base skeleton in Blender. Do not ship a
different skeleton per clip.

### Non-humanoid with a usable source rig

Keep the source skeleton. Search for animation donors only if they were authored for the
same hierarchy and rest pose. If compatible donors do not exist, author the minimum game
vocabulary directly on that rig: idle, locomotion, attack, hit, and death.

### Static or held equipment

Treat equipment as a separate static asset. Split combined meshes into semantic pieces,
put each origin at its intended grip, export each piece separately, then calibrate it on
the finalized character rig.

### Reject or regenerate early when appropriate

Rigging does not repair a poor art fit. Reject a candidate before animation work when its
silhouette, surface treatment, topology, or proportions are wrong for the target style.
Technical success is not a reason to keep an asset that still reads like the pack being
replaced.

## 2. Intake checklist

Keep purchased, generated, or user-provided source files outside the shipping tree. Raw
working outputs belong under `tmp/asset_src/`. Record redistributable attribution in
`CREDITS.md` before release.

For every candidate, inspect and record:

- The exact FBX or GLB file selected from the download.
- Mesh object count and armature object count.
- Mesh parent, armature modifier, and vertex groups.
- Bone names, hierarchy, and rest pose.
- Existing actions and frame ranges.
- Object location, rotation, scale, and world-space bounds.
- Whether the lowest visible vertex is on the ground plane.
- Material count, blend mode, and texture image paths.
- Base color, normal, roughness, and metallic files.
- Connected mesh components when props are combined in one object.
- Triangle count and whether the asset is intended for one hero or many simultaneous mobs.

Run inspection headlessly whenever possible. A repeatable Blender script is better than
manually opening, fixing, and exporting a file with no record of the changes.

## 3. Preparing a humanoid for Mixamo

### What Mixamo should receive

For a new auto-rig, upload a clean mesh-only FBX or OBJ:

- One coherent humanoid in a neutral T-pose or A-pose.
- Arms separated from the torso and legs separated from each other.
- No weapon, shield, cape, or loose prop attached to the body.
- No previous armature, actions, armature modifier, or stale skin vertex groups.
- Applied object rotation and scale.
- Feet on the ground plane and a sensible object origin.
- Opaque body material unless transparency is intentional.

If the source already contains a skeleton that Mixamo cannot recognize, do not keep
uploading the same FBX. Bake the currently visible mesh, remove the old armature and skin
data, normalize transforms, and export a mesh-only intermediate.

### Mixamo error: unable to map the existing skeleton

This normally means Mixamo detected an armature but could not classify it as a skeleton
it can reuse. The efficient recovery path is:

1. Confirm in Blender that the uploaded file actually contains an armature.
2. Preserve the original download.
3. Duplicate or bake the visible mesh in its neutral pose.
4. Remove the armature parent, armature modifier, animation data, and obsolete vertex
   groups from the upload copy.
5. Apply rotation and scale.
6. Seat the feet at ground level.
7. Export only the mesh and run Mixamo Auto-Rigger again.

Do not attempt to rename arbitrary source bones to Mixamo names. Names alone do not fix
hierarchy, joint locations, rest matrices, or skin weights.

### Model appears below Mixamo's grid

This is usually an origin or object-transform problem, not an animation problem. Fix it
before auto-rigging:

- Measure the world-space mesh bounds, not only the object origin.
- Move the mesh so its lowest intended contact point is at zero.
- Apply the object transforms before export.
- If a rig already exists, move or bake the armature and mesh together. Never move only
  the skinned mesh away from its skeleton.

### Downloads to keep

Keep one base FBX with skin and the final Mixamo skeleton. Keep animation donor FBXs for
the selected locomotion and combat clips. Donors may be downloaded without a useful
render mesh, but they must include the animated skeleton.

Preview each donor on the final character in Mixamo. This separates source-animation
problems from later retargeting problems.

## 4. Baking a Mixamo humanoid

The Titan implementation is the reference:
`scripts/anim/blender_bake_meshy_titan.py`.

Example from the repository root:

```powershell
& "<BLENDER_EXE>" --background --factory-startup --python scripts/anim/blender_bake_meshy_titan.py -- --source-fbx "D:/MODELS/Male Locomotion Pack/<MIXAMO_READY_BASE>.fbx" --locomotion-dir "D:/MODELS/Male Locomotion Pack" --combat-dir "D:/MODELS/Pro Sword and Shield Pack" --texture-dir "D:/MODELS/<TITAN_TEXTURE_FOLDER>" --armor-fbx "D:/MODELS/<SEGMENTED_ARMOR_FOLDER>/<ARMOR>.fbx" --armor-texture-dir "D:/MODELS/<SEGMENTED_ARMOR_FOLDER>" --preview-output "tmp/asset_src/meshy_titan/meshy_titan_segmented_preview.png"
```

The raw result is written to
`tmp/asset_src/meshy_titan/meshy_titan.glb` unless `--output` overrides it.

For a new humanoid, create a new model-specific script or extract a genuinely reusable
helper. Do not add another model's filenames, texture stems, and clip table to the Titan
script.

### Unit normalization is mandatory

Mixamo FBXs commonly import with a `0.01` armature object scale and a compensating child
mesh transform. A model may still render correctly through inverse bind matrices while
hand attachments are displaced by roughly two orders of magnitude.

The proven fix is:

1. Apply the armature object rotation and scale so the armature and child mesh are both
   metre-native.
2. Verify the operation does not change the mesh's world-space dimensions.
3. Convert animated bone translations from FBX centimetres to metres separately.
4. Assert the exported armature scale is one.
5. Assert a known limb translation is plausible in metres.

Do this before calibrating weapons. Any grip offset measured against a centimetre-space
or mixed-space skeleton will be invalid after normalization.

### Identical bone names do not prove compatible rest poses

The base FBX and animation-only FBXs can expose the same Mixamo bone names while using
different rest axes or pre-rotations. Copying raw F-curves between them caused forearms
and elbows to fold into the torso even though the animations looked correct in Mixamo.

Retarget evaluated poses instead:

1. Import the donor on its own armature.
2. Require the donor and base bone-name sets to match.
3. Evaluate the donor at every source frame.
4. Read the donor's evaluated armature-space pose matrices.
5. Rebuild the target matrices on the base skeleton in parent-first order.
6. Convert each target matrix to the base bone's `matrix_basis`.
7. Key location, quaternion rotation, and scale on the base skeleton.

Do not assign a child pose from a target matrix while its parent is still carrying the
previous frame. Blender can decompose the child relative to that stale parent and create
huge local translation keys. The hierarchy then appears to settle over the first several
frames, producing a visible twitch every time the clip loops.

The Titan baker avoids this by calculating all target matrices for a frame in
parent-first order and deriving every `matrix_basis` algebraically from the already
computed parent target.

### Animation export rules

- Name actions with the runtime vocabulary expected by the visual manifest.
- Put each action in a named NLA track before GLB export.
- Map source frames to an output range that starts at zero.
- Keep quaternion signs continuous between consecutive frames.
- Use linear interpolation for fully sampled retargeted clips.
- Remove unwanted horizontal root motion while preserving vertical motion.
- Export all clips on one armature and one skinned mesh.
- Keep idle as a real moving clip. A copied first frame is not an idle animation.

### Retarget validation

Do not rely only on successful export. Re-evaluate the baked action at several early
frames and the final frame, then compare every bone's actual pose matrix with the target
matrix saved during the bake. The Titan script treats position or rotation error above
its small numeric tolerance as a hard failure.

Also inspect loop continuity in the serialized GLB. Compare the final sample with the
first sample for the hips, torso, forearms, and hands. A large first-frame jump usually
means stale-parent baking, a time-range mismatch, or a source clip that is not actually a
loop.

### Baking the first segmented armor set onto the Titan

The Knight's Valor experiment starts from one unrigged floating armor mesh. The Titan
baker separates loose components, classifies the known 15 source components into 13
semantic nodes, joins two tiny details to their nearest substantial part, fits them to
the Titan rest pose, reduces them before skinning, and exports them on the same Mixamo
armature as the body.

Hard-surface segments must not use unrestricted nearest-surface weight transfer. That
made the chest wrinkle, collapsed the belt into an accordion, and bent solid plates like
cloth even in the rest pose. The proven prototype assigns each finished segment rigidly
to its semantic bone: head, upper spine, hips, upper arms, forearms, hands, upper legs,
or lower legs. More sophisticated split weights can be introduced per segment only when
an animation test demonstrates that the rigid result is insufficient.

Always render the true armature rest pose before retargeting or export. Removing an
action does not guarantee Blender has stopped displaying its last evaluated pose. The
baker explicitly switches armatures to `REST` for the preview, then restores `POSE`.
Use `--preview-only` while fitting so a bad shoulder or glove offset does not pay for all
ten retargeted clips on every iteration.

The exported node names and `equipment_slot` extras are runtime API. They are pinned by
`MESHY_TITAN_ARMOR_PARTS` and the shipping-GLB test; do not rename them casually. The
current prototype maps any occupied gameplay armor slot to the corresponding Knight's
Valor node group. Item identity is intentionally deferred until a second visual armor
set exists.

### Fine-fitting weapons in the developer screen

Run `npm run dev` and open `/?weaponfit=1`. This explicit development route keeps the
normal character editor on the ordinary start flow. Choose the fitting subject from the
Model selector in the common tool strip. It contains every current T1 player class as
well as the armed murloc, ogre, and skeleton bodies used by the game. The preview equips
that class's ordinary starter loadout: sword and shield for the shield classes, staff for
casters, and both daggers for the rogue; mob entries load their actual rusted prop. Select
a held target, then use the local-space 3D gizmo or the numeric position, rotation, and
uniform-scale controls. Pause the idle loop when checking the grip through its animation.

The editor keeps drafts in guarded local storage, but local storage is not the authored
result. Press the disk icon (`Save fit to project`) to POST the complete version-2 fit to
the dev-only Vite endpoint. The endpoint validates the exact visual key, exact target set,
finite values, and bounds before writing only
the Titan fit module or the selected body's entry in
`src/render/characters/held_attachment_fit.generated.json`. It cannot select an arbitrary
output path. The open preview already has the chosen values, so the plugin
suppresses a disruptive full-page HMR reload; the next page load and normal world render
read the generated fit.

Do not copy browser JSON into the weapon or armor code by hand. Both held-prop attachment
and segmented armor assembly consume the generated module. The Reset icon restores the
checked-in/generated baseline captured when the preview was built, while Copy remains a
diagnostic escape hatch.

## 5. Baking a non-humanoid creature

The Emberclaw reference is
`scripts/anim/blender_bake_emberclaw_crab.py`.

Example:

```powershell
& "<BLENDER_EXE>" --background --factory-startup --python scripts/anim/blender_bake_emberclaw_crab.py -- --source "D:/MODELS/<SMART_RIG_FOLDER>/<SMART_RIG_OUTPUT>.fbx" --texture-dir "D:/MODELS/<SMART_RIG_FOLDER>"
```

The raw result is written to
`tmp/asset_src/emberclaw_crab/emberclaw_crab.glb`. The script also renders representative
action samples unless `--no-preview` is supplied.

### First prove that the downloaded file contains the rig

A web preview showing bones is not proof that the local file being processed contains
them. Generated-asset folders often contain several similarly named exports. Inspect the
exact file and require:

- One intended armature.
- One intended skinned mesh.
- The expected bone set and hierarchy.
- An armature modifier that points to that armature.
- Non-empty vertex groups with plausible weights.

If Blender imports only a mesh, stop. Find or re-download the smart-rig output instead of
authoring animation against the wrong source.

### Author the minimum runtime vocabulary

When no compatible donor library exists, author actions directly on the source skeleton.
For the crab this means:

- `Idle`
- `Locomotion`
- `Attack`
- `Hit`
- `Death`

Define semantic chains such as body root, claws, and each leg. Keep the mapping in the
model-specific Blender script. Do not guess that an arbitrary `Bone_###` naming scheme
will match another generated creature.

For looping actions, key the same neutral pose at the first and last frame. Animate
intermediate body bob, opposing leg phases, and small asymmetry. For one-shot actions,
start from neutral, make the readable contact or reaction pose, and return only when the
gameplay animation requires it.

This procedural animation is appropriate for a technical prototype and ordinary mob.
Hero creatures may need manual animation or a purpose-built animation service after the
pipeline is proven.

### Mesh cost and skinning

Generated creatures may arrive with far more triangles than a multi-spawn mob can
justify. The crab path deliberately decimates the mesh and then:

- Limits every vertex to four bone influences.
- Normalizes all remaining weights.
- Validates the mesh after modifier application.
- Records polygon counts before and after.
- Reviews the silhouette and claw/leg deformation in action previews.

Choose the decimation ratio per asset. Do not copy the crab's ratio without comparing
the new model before and after, especially around joints and thin appendages.

## 6. Rebuilding materials and avoiding transparent holes

Do not trust absolute image paths stored inside an FBX. Rebuild the Blender material
from the source texture folder:

- Base color uses the normal color space.
- Normal, roughness, and metallic images use `Non-Color`.
- The normal image goes through a Normal Map node.
- Base color alpha is not connected unless transparency is intentional.
- The material remains opaque unless the asset really needs an alpha mode.

Transparent body sections usually come from one of these causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Holes follow texture regions | Base-color alpha was imported into material alpha | Disconnect alpha and use an opaque material |
| Whole surface vanishes from one side | Reversed normals or single-sided material | Recalculate normals and inspect winding before using double-sided as a fallback |
| Texture is white or missing | FBX points to an unavailable absolute path | Rebuild nodes from verified local files |
| Normal map looks glossy or distorted | Normal image is treated as color | Set `Non-Color` and route through a Normal Map node |
| Roughness or metallic is visibly wrong | Packed-map assumptions do not match the delivered files | Inspect channels and wire the actual delivered maps explicitly |

Validate materials in Blender, the raw GLB, and the KTX2 shipping GLB. Passing one stage
does not prove the next stage retained the intended material.

## 7. Exporting held weapons and shields

The Knight's Valor reference is
`scripts/assets/export_meshy_knights_valor_weapon.py`.

Inspect first without writing GLBs:

```powershell
& "<BLENDER_EXE>" --background --factory-startup --python scripts/assets/export_meshy_knights_valor_weapon.py -- --source-fbx "D:/MODELS/<WEAPON_FOLDER>/<WEAPON>.fbx" --inspect-only --preview-output "tmp/asset_src/meshy_knights_valor/source-preview.png"
```

The inspection reports objects, materials, connected components, and bounds. If the
combined source has the expected components, export them:

```powershell
& "<BLENDER_EXE>" --background --factory-startup --python scripts/assets/export_meshy_knights_valor_weapon.py -- --source-fbx "D:/MODELS/<WEAPON_FOLDER>/<WEAPON>.fbx" --output-dir "tmp/asset_src/meshy_knights_valor"
```

The exporter isolates connected components, rebuilds the PBR material, places the sword
origin at the handle, places the shield origin at its rear grip, applies a controlled
scale, and exports each as a static GLB.

### Calibrate only after the character rig is final

Held-equipment corrections for the Titan live in
`src/render/characters/meshy_titan_weapon_models_core.ts` and are pinned by
`tests/meshy_titan_weapon_models.test.ts`. They are scoped to this rig so other
characters keep their own equipment calibration.

Adjust in this order, one variable at a time:

1. Character and attachment unit scale.
2. Weapon scale.
3. Axis correction, including whether the blade and shield are upside down.
4. Longitudinal grip offset so the palm encloses the middle of the handle.
5. Shield depth so the hand sits behind the plate without protruding through its face.
6. Small angular polish only after every translation is accepted.

Do not change scale, rotation, and offset together. Record the last accepted values before
each experiment.

An important attachment lesson is that rotating a weapon can also rotate its offset
vector. A visually small quaternion change may swing the blade through the character or
move the handle out of the palm. When angular polish is needed, rotate around the actual
grip point or solve the translation again after rotation. The in-game character is the
final authority for attachment placement.

### Use the in-client equipment fitting panel

Open the separate `/?weaponfit=1` development route. It opens on the T1 warrior and its
Model selector can switch to every T1 class or a technical NPC subject. It edits the
final held payload after every grip adapter and rig-specific correction has run. The
ordinary online and offline character creators continue to show the player-facing
appearance editor.

1. Select the class and its available held item. Rogue exposes both dagger hands; a
   class with no equipped offhand exposes only its main-hand item.
2. Pause the animation when an exact hand pose is easier to fit against.
3. Select Position, Rotation, or Scale.
4. In Position or Rotation, drag the 3D gizmo axes, planes, or rings directly
   in the preview. Use the sliders for broad movement and the number fields for exact values.
5. Resume the animation to verify that the fit holds throughout the clip.
6. Press **Save fit to project**. This writes the selected body's shared runtime fit;
   Copy values remains useful only for review or debugging.

The panel persists a draft under a per-model `woc.equipmentCalibration.<visualKey>.v2`
key. Its project export is versioned and records:

- `space: "hand-bone-local"`
- final local `position`
- XYZ `rotationDeg`
- the equivalent `quaternion`
- uniform `scale`

These are final payload transforms, not the earlier model-space correction fields. When
promoting an accepted fit into production code, either apply the exported local transform
as the rig-specific final override or solve the equivalent model correction explicitly.
Do not copy a local position into `modelOffset` without that conversion.

The accepted Meshy Titan sword and shield fit uses the first option. Its copied Position,
Rotation, and Scale values live in `meshy_titan_weapon_models_core.ts` and are applied after
the Mixamo hand adapter, which keeps the editor output and the in-world result identical.

### Common held-equipment failures

| Symptom | Check |
|---|---|
| Weapon is missing | Replacement URL, preload list, media manifest, attachment bone, and rig-specific branch |
| Weapon is enormous | Mixed centimetre and metre spaces, unapplied source scale, or duplicate runtime scaling |
| Weapon is upside down | Source up axis and handslot correction quaternion |
| Hand holds the blade or guard | Model origin and longitudinal model offset |
| Hand holds the middle of the whole sword | Export origin was centered on bounds instead of the handle |
| Shield shows the hand through its front | Shield face orientation and depth offset |
| Blade intersects the torso after a rotation | Rotation pivot and the rotated grip-offset vector |

## 8. Build the shipping assets

Raw GLBs stay under `tmp/asset_src`. The shared optimizer writes shipping files under
`public/`:

```powershell
node scripts/assets/build_assets.mjs scripts/assets/specs/meshy_titan.json scripts/assets/specs/emberclaw_crab.json scripts/assets/specs/meshy_knights_valor_weapons.json
```

`build_assets.mjs` performs animation resampling, pruning, deduplication, texture resize,
and high-level meshopt compression. It does not simplify skinned geometry. Any intentional
decimation must happen in the model-specific Blender stage where deformation can be
reviewed.

Convert only the new or changed GLBs to KTX2 instead of scanning the entire model tree:

```powershell
node scripts/assets/compress_glb_textures.mjs public/models/chars/players/meshy_titan.glb public/models/creatures/proving_shore_scuttler.glb public/models/weapons/meshy/knights_valor_sword.glb public/models/weapons/meshy/knights_valor_shield.glb
```

The compressor requires Khronos KTX-Software. Put `ktx` on `PATH`, or on Windows set
`KTX_BIN` to the directory containing the executable. The compressor preserves and
compares the structural inventory before replacing a file. Treat an aborted structural
comparison as a real failure.

Regenerate the stable URL to hashed URL map:

```powershell
node scripts/build_media_manifest.mjs generate
```

Never hand-edit `src/render/assets/manifest.generated.ts`.

## 9. Inspect both raw and shipping GLBs

Run structural tools against both artifacts:

```powershell
npx gltf-transform inspect tmp/asset_src/meshy_titan/meshy_titan.glb
npx gltf-transform validate tmp/asset_src/meshy_titan/meshy_titan.glb
npx gltf-transform inspect public/models/chars/players/meshy_titan.glb
npx gltf-transform validate public/models/chars/players/meshy_titan.glb
```

Repeat for the creature and equipment assets. Confirm:

- Expected node and bone names.
- One intended skin per skinned character.
- Expected animation names and durations.
- No accidental cameras or lights.
- Correct material and texture count.
- Meshopt on the shipping artifact.
- KTX2 images on textured shipping assets.
- Plausible bounds and scale.
- No duplicate skeletons or donor meshes.

Render representative action frames from front, side, back, and three-quarter views.
Inspect idle near the beginning, middle, and end of the loop. A single hero frame cannot
reveal a loop pop, a backward shield, or a hand that enters the torso later in the clip.

## 10. Runtime integration

Keep replacement scope narrow while proving a new asset family. The current trial limits
the changes to the tutorial island.

Character and creature integration lives behind the visual manifest in
`src/render/characters/manifest.ts`. Equipment replacement and grip calibration live in a
small rig-specific core rather than in generic item data. Preload and visual override
behavior are pinned by:

- `tests/character_visual_asset_preload.test.ts`
- `tests/character_visual_override.test.ts`
- `tests/proving_shore_monster_visuals.test.ts`
- `tests/meshy_titan_weapon_models.test.ts`
- `tests/meshy_titan_armor_core.test.ts`

When replacing a creature only in one area, test both sides of the boundary: the intended
template and location use the new visual, while the same template outside that location
and related templates retain their existing visual.

The runtime clip map must match the exported action names exactly. Do not depend on a
fallback clip silently selecting the wrong action.

## 11. Verification ladder

Use the cheapest relevant check first, but do not stop before the shipping artifact and
runtime integration are covered.

### Blender scripts

```powershell
python -m py_compile scripts/anim/blender_bake_meshy_titan.py scripts/anim/blender_bake_emberclaw_crab.py scripts/assets/export_meshy_knights_valor_weapon.py
```

### Focused contracts

```powershell
npx vitest run tests/meshy_titan_weapon_models.test.ts tests/proving_shore_monster_visuals.test.ts tests/character_visual_asset_preload.test.ts tests/character_visual_override.test.ts tests/glb_texture_compression.test.ts
```

### Type and production build

```powershell
npx tsc --noEmit
npm run build:bundle
git diff --check
```

Before a mergeable contribution, run the repository-selected gate:

```powershell
node scripts/gate_select.mjs
```

The final in-game pass remains operator-owned. Fully reload the page after changing a GLB
or attachment transform because the loader may retain an in-memory cached asset. Inspect
idle, movement, combat, death, front and rear shield views, and the transition between
clips. Test from normal gameplay camera distance before judging close-up cosmetic issues.

## 12. Troubleshooting map

| Symptom | Most likely cause | First corrective action |
|---|---|---|
| Mixamo cannot map the existing skeleton | Unsupported source armature is still embedded | Export a clean mesh-only neutral pose and auto-rig again |
| Model is below Mixamo's grid | Bounds and object origin disagree or transforms are unapplied | Seat world-space bounds at zero and apply transforms before upload |
| Local file has no rig although the web preview did | Wrong export file was selected | Inspect every candidate and use the smart-rig character output |
| Mixamo preview is correct but elbows enter the torso in game | Raw animation curves were copied across different rest matrices | Retarget evaluated donor matrices to the base rig |
| Animation twitches during the first frames or every loop | Child transforms were solved against stale parent poses | Compute parent-first target matrices and key `matrix_basis` |
| Idle is frozen or pops at the loop | Only one pose was copied or clip endpoints differ | Export the full clip and measure first-to-last continuity |
| Character looks correct but weapon is far away | Mesh and skeleton use different unit spaces | Normalize the armature, mesh, translations, and attachments to metres |
| Textures disappear after FBX import | Embedded absolute paths are invalid | Rebuild the PBR material from verified texture files |
| Body has transparent patches | Imported alpha or blend mode is unintended | Force opaque material and leave base-color alpha disconnected |
| Crab animates but feet slide badly | Leg phase mapping or root motion is wrong | Review semantic leg chains and loop poses in side view |
| Thin legs or claws collapse after optimization | Decimation damaged weighted joint topology | Raise the ratio or protect joint regions before decimation |
| Weapon or shield does not render | URL, manifest, preload, or bone attachment is missing | Trace the stable asset URL through all four seams |
| Grip correction helps one character but breaks others | Correction was added to a generic equipment path | Scope corrections to the intended rig visual key |
| Raw GLB works but shipping GLB fails | Optimization or texture compression changed structure | Compare raw and shipping inventories and stop on mismatch |
| A rotation makes the sword enter the body | Offset rotated around the wrong pivot | Restore the last accepted state and rotate around the grip point |
| Armor gizmo appears at the feet and the part does not move | Rigid-skinned nodes share the armature origin, while attached skinning cancels model transforms | Drive a bounds-centred calibration proxy and compose its delta into the mesh bind matrix |

## 13. Definition of done for the next imported model

- [ ] Source provenance and redistribution terms are recorded.
- [ ] The exact source file, object inventory, transforms, bounds, textures, and rig are inspected.
- [ ] The asset follows the humanoid, non-humanoid, or static-equipment path deliberately.
- [ ] Mesh, armature, animation translations, and attachments share one metre-native space.
- [ ] Materials are rebuilt explicitly and unintended alpha is removed.
- [ ] Every required runtime clip exists on the final skeleton with stable names.
- [ ] Looping clips have measured continuity and no first-frame settling.
- [ ] A multi-spawn creature has an intentional triangle and skin-influence budget.
- [ ] Held equipment origins and rig-specific corrections are calibrated after the rig is final.
- [ ] Segmented hard-surface armor keeps its shape and follows the intended semantic bones.
- [ ] Every runtime armor-node name and slot assignment exists in the optimized shipping GLB.
- [ ] Raw GLBs are inspected and rendered from multiple angles.
- [ ] Shared optimization and KTX2 compression complete without structural drift.
- [ ] The media manifest is regenerated through its owning script.
- [ ] Runtime manifest, preload, scope, and clip maps have focused tests.
- [ ] Focused tests, typecheck, production build, and the selected repository gate pass.
- [ ] The operator approves the fully reloaded in-game result.

## 14. Handoff from the Titan experiment to modular bodies and equipment

The Titan experiment proves runtime slot toggling on one body and one armor set. Before
mass replacement or interchangeable armor across bodies, write a separate design
contract that answers at least:

- Which skeleton and rest pose every body and armor piece must share.
- Whether equipment is skinned, socketed, or a mixture of both.
- How hidden body regions prevent clipping through chest, leg, hand, and foot armor.
- How body proportions are constrained across race and sex variants.
- How armor weights are transferred and validated.
- Which material slots, dye masks, and texture budgets are permitted.
- How animation compatibility is tested across every supported body.
- How attachment offsets are represented without per-item trial-and-error tables growing
  without bound.
- Which body, armor, and weapon combinations form the minimum regression matrix.

The current pipeline supplies the foundation: normalized rigs, reliable animation baking,
explicit materials, optimized GLBs, scoped runtime integration, and structural tests. It
does not by itself guarantee interchangeable skinned equipment.
