# Native buffalo verification

The owner-supplied body is installed as `smart_bufalo.glb`, with thirteen native
clips and an isolated test-island subject at `(812, 72)`. The original mesh,
52-joint rig, skin weights and PBR maps are retained. The shipping asset uses
Meshopt and three 2048px KTX2 textures and remains below the creature size budget.

Compare the [native bind pose](before-native.png) with the [pose overview](overview.png).
The source view loads the unsimplified exported body at the same presentation
height, without playing an authored clip. Watch the final
[walk](walk.gif), [trot](trot.gif), [run](run.gif),
[lateral horn strike](headbutt.gif), [charge](ram.gif),
[bellow](bleat.gif) and [death](death.gif).

The gait accounts for staggered source forefeet. `authoring.json` records zero
reach clamping in every solved clip, with the closest gait folding margin above
0.09 source units. No body-scale channel expands the torso. The horn-bearing
outer chains stay fixed on the skull; a new rigidity guard failed on the initial
independent horn motion and passes on the final export. Contact poses keep the
horns ahead of the nose. Upper death limbs release downward rather than retaining
their standing silhouette.

`floor.json` samples every deformed vertex at 41 phases of all clips. The lowest
vertex is about -0.0026 source units, within the existing -0.025 contact tolerance.
`runtime.json` records actual displayed-motion tracking at walking speed 1.0
and chase speed 4.2, the complete alternating attack cycle, recovery and death.
Run is selected even while the global humanoid tracker reports `running=false`.

The proposed pad was checked independently on seeds 1, 42 and 20061, using 625
samples per seed over a six-yard radius. Height stays 1.7, water is absent and
static collision resolution does not displace a body of radius 1.2. The nearest
other subject is the goat, 24 yards away.

Passed, 97 tests across nine files:

```text
npx vitest run tests/smart_bufalo_asset.test.ts tests/dev_model_lab.test.ts tests/equipment_fit_payload.test.ts tests/model_gait_core.test.ts tests/dev_model_lab_terrain.test.ts tests/smart_goat_asset.test.ts tests/smart_wolf_asset.test.ts tests/wolf_muzzle_skin.test.ts tests/animal_contact_pose.test.ts --maxWorkers=2
```

Also passed:

```text
npm run check:ts
node scripts/malware_scan.mjs --gate
node_modules/.bin/biome.cmd check tests/smart_bufalo_asset.test.ts src/render/characters/manifest.ts src/sim/content/dev_model_lab.ts src/ui/world_entity_i18n.ts scripts/lib/equipment_fit_payload.mjs tests/dev_model_lab.test.ts scripts/assets/specs/smart_bufalo.json
node tmp/bufalo-motion/capture.mjs
```

Biome retains one existing non-null-assertion warning outside the new manifest
entry. The production Vite bundle passed in an owned temporary directory with
public copying disabled. The final compressed model was checked in the real
renderer. Media, English entity translations and wiki content were regenerated.

The first wider test attempt ran out of disk space. Clearing the regenerable
Vitest module cache freed about 5.8 GB; the final scoped run above is green.
The separate `mob_equipment_fit.test.ts` suite still fails for eight older armed
models because its Svelte testing wrapper cannot resolve
`/@fs/.../@testing-library/svelte-core/src/wrapper-scaffold.svelte` from the shared
dependency directory. These are test-harness failures, not buffalo assertions.

`GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` stops at i18n freshness
differences between generated and staged/committed files. No files were staged
to bypass that check. The complete worktree gate is not green.
