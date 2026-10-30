# Wildheart native animation reimport

The five updated owner-supplied packages in `bible/models/mobs/comunity/wildhearts`
provide the native rig, body, original maps and complete animation library for
each existing Wildheart. `scripts/anim/blender_build_wildhearts.py` exports the
native actions and gameplay aliases. The geometry-safe spec applies Meshopt and
the final scoped texture compression applies KTX2. Runtime authored-atlas matte
materials and existing weapon attachments remain in use.

Each model uses its own idle, combat stance, walking, running, attack and death.
All source clips are exposed in the animation editor. The supplied `reaction.zip`
provides Hit_Reaction: the female model uses its native clip and the other four
receive a rest-space adaptation to their respective rigs. Existing approved spear
and axe throws remain available. The beastmaster retains its previously approved
ability gestures where the native pack has no matching action. The priest's pulse
uses the contact and recovery portion of the supplied ground slam, while its full
slam remains available in the editor.

The original dungeon entity scales also apply to imported models. The visual
heights are calibrated against the 2.4-unit test-island troll so base variants
appear around 2.39 to 2.50 units tall, the beastmaster around 2.70 and the high
priest around 3.00. Simulation scales, collision and existing difficulty
overrides are not changed. Walk and run aliases are retimed against the new
visible size; their native source clips stay unchanged for the animation editor.
The renderer and simulation share the five visual height constants in
`src/sim/wildheart_visual_proportions.ts`. Wildheart melee reach uses their
actual rendered height relative to the 2.4-unit reference troll, including
the existing entity scale. The corresponding `dev_` trials use the same
profile. Pursuit retains its normal movement grace; projectile spell ranges
are unchanged. Melee-gated boss abilities now begin ticking at the shorter
contact range, consistent with the smaller body.

`scripts/anim/wildheart_approved_throws.json` preserves the previously approved
special motion with source and binding fingerprints. The helper verifies rest
bindings before reusing those motions. Source archives remain in the Bible.

Detailed source fingerprints and per-action gait measurements are recorded in
`tmp/wildhearts-native-import/*-report.json`; source archive hashes are also
stamped into the shipping mesh. Verification captures are in
`docs/screenshots/community-native-imports`.
