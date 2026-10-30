# Infected sporeling: complete supplied native pack

This import supersedes the earlier retargeted infected mushroom derivative. The
ordinary sporeling and its model, animations, palette and source archive stay as
previously installed. Shared gameplay mappings are maintained separately in the
character manifest; this note records the infected asset's native provenance.

## Sources and rig

Primary archive: `bible/models/mobs/comunity/sporling-infected.zip`.
SHA256: `18559f9d58a1c88e9ac8d904e7e200931cc2e26b866b6eefc9138625cac2689b`.

The selected body and skeleton come together from
`Meshy_AI_Mushroom_Menace_biped_Meshy_Merged_Animations.fbx` inside
`Meshy_AI_Mushroom_Menace_biped/`. The import keeps its native 66-joint rig,
104386 triangles, skin weights, UVs and original base-color, normal, metallic and
roughness maps. The separate Character_output FBX is retained as a source, but
its mesh and animation channels are not substituted for the merged FBX body.

Supplemental reaction archive: `bible/models/mobs/comunity/sporling-reaction.zip`.
SHA256: `be163d6475363392f26bb9e61dffaed2dccd734277072435a063738c00c679d0`.
It contains
`Meshy_AI_Mushroom_Menace_biped_Animation_Hit_Reaction_withSkin.fbx`.
Its 66 bone names, hierarchy, local rest matrices and armature transforms match
the merged body exactly (measured matrix error zero). Therefore the supplied
Hit_Reaction is sampled directly on the matching native rig. No retarget or
invented reaction is needed. The supplemental mesh is discarded after sampling;
the primary merged mesh and original maps remain the shipping body.

## Native actions and runtime aliases

The primary pack contains these full supplied actions:

| Native action | Shipping clip |
|---|---|
| Idle_8 | Infected_Idle |
| Idle_5 | Infected_CombatIdle |
| Walking | Infected_Walk |
| Running | Infected_Run |
| dying_backwards | Infected_Death |
| Axe_Spin_Attack | Infected_Axe_Spin_Attack |
| Basic_Jump | Infected_Basic_Jump |
| Charged_Slash | Infected_Charged_Slash |
| Left_Hook_from_Guard | Infected_Left_Hook_from_Guard |
| Proud_Strut | Infected_Proud_Strut |
| Right_Hand_Sword_Slash | Infected_Right_Hand_Sword_Slash |
| Simple_Kick | Infected_Simple_Kick |
| Spartan_Kick | Infected_Spartan_Kick |
| Triple_Combo_Attack | Infected_Triple_Combo_Attack |

The supplied Hit_Reaction becomes `Infected_Hit` at its complete native duration
of 49/30 seconds. It was missing from the primary pack and was reported before
the owner supplied the matching reaction archive.

`Infected_Attack` uses only source frames 1 to 29 of Triple_Combo_Attack. This is
the first strike and its low-handed recovery, ending before the next windup and
spin. It lasts 28/30 seconds and contains no invented recovery poses. The full
combo remains separate for the animation studio. Left_Hook_from_Guard is also
retained in full, but is not the default attack: its whole-body turn exposes the
back during the strike. The complete source vocabulary, reaction and native
first-strike slice remain inspectable through the ordinary model studio.

## Technical baking

`scripts/anim/blender_build_infected_sporeling.py` imports no ordinary mushroom
or unrelated motion pack. Its shared native-importer dependencies only provide
safe extraction, pose interpolation, original-map material setup and export
helpers. Sources stay unchanged. Native matrices are sampled before any new
NLA actions are assigned, and all resulting channels target the primary rig.

Horizontal root travel is removed before loop closure; common ground contact
is baked from evaluated deformed bounds. The native death plays its complete
2.2-second fall and then holds the landing for 0.25 seconds. Basic_Jump retains
its full 176/30-second trajectory, including native airtime and landing; it is
not flattened by the floor correction used for grounded actions.

Only the native locomotion cycles are retimed for the existing short-legged
mob's game speed. The output uses a 120 Hz bake to retain detail through these
short cycles. At visual height 1.45, source height 1.7 and entity scale 0.85, the
measured references are recorded in
`tmp/infected-sporeling-native/report.json`. The recommended gait uses runEnter
3.5 and runExit 3.0, so ordinary wander (7.5 times 0.35) uses Walk and pursuit
uses Run. The source frame ranges and original durations remain in that report.
No combat stats, aggression, loot or Pack Frenzy numbers are changed here.

The geometry-safe spec `scripts/assets/specs/community_sporeling_infected.json`
builds `public/models/creatures/community_sporeling_infected.glb`. Meshopt and
scoped KTX2 compression retain the original maps at a maximum 2048. The existing
runtime matte treatment and reversible infected palette continue to consume
those maps; source texture pixels are not repainted by this import.

## Evidence and checks

`tests/community_infected_sporeling.test.ts` pins both archive fingerprints,
merged-FBX provenance, native topology and skin, every supplied clip, loop
closure, native source pose samples, physical first-strike facing, actual wander
and pursuit gait, full jump airtime, grounded held death and unchanged combat
identity. Independent source-FBX joint samples are compared relative to Hips,
so native phrasing is checked separately from ground and root normalization.
The held landing is checked in world space for every joint, within 2 mm and
0.02 radians across the final 0.1 seconds. This tolerates the subpixel finger
drift introduced by compression while still detecting visible corpse motion.

Source inventories, rig matching, native pose seals, raw and shipping validation,
rendered previews and scoped test logs live in `tmp/infected-sporeling-native/`.
The parent contribution owns shared manifest integration, guide regeneration,
production build and the full repository gate. Source author/license terms are
not inferred from a community download; the archives and original maps remain
preserved under the owner's supplied asset terms.
