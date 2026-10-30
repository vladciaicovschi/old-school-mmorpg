# Buffalo stride and attack revision

The source front fetlocks leaned at different angles, and their walking paths
had different fore/aft centers. The revision uses length-preserving support
vectors and matching front hoof centers. Walk footfalls follow the bovine lateral
sequence; sagittal body/head motion repeats twice per walk/trot cycle so one side
does not carry a different pitch phase. Lateral weight transfer remains opposed
between sides. The walk starts with the source's leading front foot forward to
reduce the transition gap from idle.

Both lateral attacks bow the head farther and add 0.05 source units of body
drive; Charge adds 0.07. The body settles slightly under the forward load. Actual
horn tips lead the muzzle on contact. All limb solves stay inside their reach
limits, with no body scaling or geometry changes.

Compare the final compressed assets in the ordinary renderer:

| Motion | Before | After |
| --- | --- | --- |
| Walk cycle | [Animation](walk-before.gif), [poses](walk-before-sequence.png) | [Animation](walk-after.gif), [poses](walk-after-sequence.png) |
| Idle to walk | [Animation](start-before.gif) | [Animation](start-after.gif) |
| Charge | [Animation](charge-before.gif), [poses](charge-before-sequence.png) | [Animation](charge-after.gif), [poses](charge-after-sequence.png) |

The cycle marker changes to align walk entry with the planted leading forefoot;
the before/after walk sheets therefore show the same normalized times, not the
same footfall phase. `runtime.json` records actual walk startup, native run
selection at world speed 4.2, both horn strikes, Charge and idle recovery.
The startup capture checks that animation time advances continuously. Recovery
accepts the normal AlertLook idle variant as well as the primary idle clip.

`authoring.json` reports zero reach clamping for every revised clip. The smallest
folding margin remains above 0.09 source units. `floor.json` samples every
deformed vertex at 41 phases of each revised clip; the worst penetration is about
0.0011 source units, below the existing 0.025 contact tolerance.
`preservation.json` confirms identical mesh attributes, indices and textures and
exact animation channels for all seven untouched clips, including Death.

Five of the strengthened contact/symmetry checks failed on the previous asset.
The final run passed 93 tests across eight files:

```text
npx vitest run tests/smart_bufalo_asset.test.ts tests/smart_goat_asset.test.ts tests/smart_wolf_asset.test.ts tests/wolf_muzzle_skin.test.ts tests/animal_motion_flow.test.ts tests/animal_contact_pose.test.ts tests/quadruped_death_pose.test.ts tests/model_gait_core.test.ts --maxWorkers=2
```

Also passed: `npm run check:ts`, scoped Biome on the buffalo asset test,
`node scripts/malware_scan.mjs --gate`, and a production Vite bundle in an owned
temporary directory with public copying disabled. Texture finalization confirmed
KTX2 was retained, and the media manifest was regenerated.

A separate read-only audit sampled all joints at 241 phases per revised clip,
confirmed positive extension/folding reserves, and checked the actual horn tips.
Its idle-entry concern is covered by the new entry-gap test and rendered
transition comparison. The shared `paw(..., hock_offset=None)` path retains the
previous support vector for other authors.

The canonical `GATE_SELECT_BASE=HEAD node scripts/gate_select.mjs` remains blocked
by existing i18n freshness differences between generated and staged/committed
files. No files were staged to bypass that check.
