# Native wolf V2 motion transfer

The owner source is `bible/models/mobs/animals/wolf_v2.glb`, SHA-256
`840671509d895aec77813cadf6ffcab2cd7af87f6545da48d112553fa39ef419`.
It has an open mouth, teeth and 47 native joints. The old wolf has 43 joints;
copying local rotation keys by bone number would animate the wrong anatomy.

`scripts/anim/blender_bake_smart_wolf_v2.py` adapts the accepted `WolfAuthor`
timelines through an anatomical map. It removes the source's diagonal heading,
straightens the axial chain and matches the paw supports. That evaluated pose
is baked into the mesh and inverse binds before animation. Native joint lengths,
the additional hind fetlocks, body triangle topology, UVs and PBR maps survive.
The owner source remains untouched. The subsequent mouth correction preserves
body faces and locally splits the source's fused canine stalks, adding small
closed caps and pointed ends. See the newer
[mouth correction evidence](../screenshots/wolf-mouth/verification.md).

The source assigns much of the nose and upper lip to the lower jaw. Before
normalization, the V2 profile in `repair_smart_wolf_muzzle.mjs` transfers the
entire upper snout and upper lip to the skull. Its CLI also invokes
`repair_wolf_v2_teeth.mjs`: the upper and lower canines are geometrically fused
in the source, so a narrow local gap with four closed tapered caps is required
before the two dental surfaces can follow separate jaws. Upper teeth follow
the skull; lower lips, teeth and chin retain jaw motion. The brow controls remain attached to the head;
they influence broad cheek regions and cannot safely act as isolated eyeballs.
The supplied resting mouth aperture is retained, with a smaller added jaw opening
than the closed-mouth donor used.

All twelve clip names and their timing survive: idle, combat idle, walk, trot,
run, left/right bite, lunge, hit, death, howl and alert look. Paw trajectories
and body height are adapted to the shorter forelegs. The native three-segment
forelegs and four-segment hind legs are solved offline, with no runtime IK.
The longer tail is lifted during movement to clear the floor. Death grounds
the flank before releasing each tail segment toward the floor; the actual
distal fur contacts the floor while its centreline retains the fur thickness.
The October 19 attacks add stronger body commitment and staggered hind-paw
steps. The original wolf's author defaults remain unchanged. Body scale is
never animated. See `animal-attack-expression.md` for validation and evidence.

The original wolf remains at `(812, 24)`. The new `dev_smart_wolf_v2` subject is
at `(788, 72)` on the developer island, using the same stationary, direct-damage
only, no-loot policy. The weapon-fit studio includes both versions. Walk/run
reference speeds use support velocity and the actual evaluated idle height.

Both wolf versions randomly select their basic attacks using the existing
weighted presentation picker: left bite 40%, right bite 40%, lunge 20%.
Repeated sides are allowed. `ClipMap.attackWeights` opts these two models into
random selection; unweighted models retain cycling and equipped weapon
profiles retain ownership of their own selection policy. The simulation's
combat RNG, damage and attack frequency are unchanged.

Rebuild from `character-model-slice`:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/anim/blender_bake_smart_wolf_v2.py
node scripts/assets/build_assets.mjs scripts/assets/specs/smart_wolf_v2.json
$env:KTX_BIN=(Resolve-Path tmp/ktx-software-4.4.2/bin).Path
node scripts/assets/compress_glb_textures.mjs --dir public/models/creatures --jobs 1
node scripts/build_media_manifest.mjs generate
npm run i18n:gen
```

`tests/smart_wolf_v2_asset.test.ts` checks the shipped compressed model, native
topology, complete vocabulary, finite rotations, constant scale, loop seams,
joint continuity, heading, supported bites, actual nose/lip skin motion, ground
clearance and island wiring. See [visual evidence](../screenshots/wolf-v2/verification.md).
