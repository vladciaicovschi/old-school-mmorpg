# Warrior weapon carry trial

The T1 native locomotion and equipment-specific combat follow-up is documented
in [Warrior T1 native motion](warrior-t1-motion.md). Its authored travel gaits
supersede the arm-only prototype below on T1; the carry policy remains intact.

Implemented for the fixed T1 warrior and Recruit, Militia and Knight bodies in
the existing `character-model-slice` worktree. Other classes retain their policy.
The legacy composed KayKit warrior does not receive Mixamo travel clips.

The T1 follow-up uses the existing `models/chars/players/t1_warrior.glb` body:
one-handed weapons attach at the belt to `mixamorigHips`, two-handed weapons
remain on `mixamorigSpine2`, and shields remain on the back. Equipment handedness
chooses the anchor, not the size/family of a cosmetic skin. A second one-handed
weapon mirrors onto the other hip. The legacy Recruit/Militia/Knight bodies keep
their previous anchors; this new placement is enabled on T1 only.

| State | Equipment presentation | Body motion |
| --- | --- | --- |
| Exploration, idle, walk, run | T1 one-hander at belt; two-hander and shield on back | Relaxed arms over the body's own gait |
| Merely selected target | Remains stowed | Travel pose |
| Combat, attack intent, incoming aggro, warrior cast | Drawn | Existing combat stance and attacks |
| First resolved strike, including circular strike | Drawn immediately | Never delays the hit for a cosmetic gesture |
| Combat ends | Stow after 1 second | Standing gesture, or immediate carry swap while moving |
| Swimming or riding | Stowed overlay | Existing swim or mount animation |
| Death during a carry transition | Preserve the current attachment | Cancel pending swap, play death |
| Manual Z outside combat | Toggle visible carry | New combat clears the temporary override |

The simulation's gear, statistics, attacks and persisted cosmetic bit are not
modified by the renderer. One render-side carry writer combines manual choice,
warrior engagement, swimming and riding. Incoming aggro supplies peer engagement
when only self snapshots include the combat scalar.

## Animation scope

Nine clips are synthesized at asset preparation time from each body's own
idle/walk/run donors: travel idle/walk/run and back/hip/dual-hip draw/stow. Gaits
preserve every translation and lower-body track; upper-limb rotations are derived
from that body's rest rig. No foreign skeleton translations are copied.

Stationary carry gestures last 0.8 seconds and change anchors at the midpoint.
Starting movement, jumping, casting or sitting interrupts the cosmetic carry
gesture, snaps to its target attachment and restores the appropriate base pose.
This prototype does not layer upper-body gestures over running. Hand-to-carry
attachment changes remain discrete; they are not IK-driven prop transfers.
Changing equipment during a gesture settles it before applying the new loadout,
so a new two-hander never follows an obsolete belt-reach gesture.

Calibrated held-item scale now survives a carry-anchor change. Before/after
screenshots cover all four bodies under
`docs/screenshots/warrior-weapon-carry/`:

- `before-player_warrior_recruit-idle.png`
- `after-player_warrior_recruit-idle.png`
- `after-player_warrior_recruit-run.png`
- `after-player_warrior_recruit-draw.png`
- `after-player_warrior_knight-combat.png`
- `after-player_warrior-idle.png`
- `t1-onehand-belt-idle.png`
- `t1-onehand-belt-run.png`
- `t1-onehand-belt-draw.png`
- `t1-twohand-back-idle.png`

## Verification

T1 belt-carry follow-up: 78 tests passed in 9 files with the command below;
`npm run check:ts` and the changed-file Biome check passed. The mandatory selective
gate with `GATE_SELECT_BASE=HEAD` still stops at the worktree's i18n freshness check.
Browser assertions verify the actual T1 body URL, pelvis/chest parents, running
clip, absence of a shield on the two-handed loadout, and zero page errors.
The screenshots above were visually inspected after lowering the hip transform
to compensate for the real weapon mesh's internal grip offset.

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=2 tests/warrior_carry_visual.test.ts tests/weapon_carry_core.test.ts tests/back_grips.test.ts tests/warrior_travel_clips.test.ts tests/weapon_stow_single_writer.test.ts tests/weapon_stow_mount_overlay.test.ts tests/warrior_suits_asset.test.ts tests/t1_player_assets.test.ts tests/quaternius_character_body.test.ts
```

Initial state-table implementation check (131 tests, 12 files at that stage):

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=2 tests/pad_reel.test.ts tests/weapon_stow.test.ts tests/warrior_carry_visual.test.ts tests/weapon_carry_core.test.ts tests/warrior_travel_clips.test.ts tests/weapon_stow_single_writer.test.ts tests/weapon_stow_mount_overlay.test.ts tests/warrior_suits_asset.test.ts tests/stow_transition.test.ts tests/character_anim_state.test.ts tests/anim_state_entity_core.test.ts tests/sheathe_toggle.test.ts
```

- `npm run check:ts`: passed.
- Biome error-level check on the task's changed source/tests: passed.
- `npm run security:gate`: passed, zero high findings after priors.
- Local browser using the real GLBs and CharacterVisual: idle, run, draw, combat,
  attack and return-to-travel captured for all four bodies, zero page errors.
- Equipment, suit selection, back grips and warrior render contract tests:
  passed. The combined run with the monolith ratchet has 48 passing tests and
  five pre-existing oversized-coordinator failures. No ceilings were raised.

The complete repository gate is not green:

- `node scripts/gate_select.mjs` needs an explicit base because this local
  checkout has no release or remote base. With `GATE_SELECT_BASE=HEAD`, it runs
  the full plan for the existing dirty worktree and stops at i18n freshness:
  generated output reflects already-uncommitted model-studio/localization work.
  Nothing was staged or committed to bypass that check.
- `npm run build` transforms the modules but fails in the existing i18n
  modulepreload plugin: `__I18N_LOCALE_CHUNKS__` is absent from `index.html`.
- Broader clip-map tests expose existing incompatible legacy modular rigs,
  unregistered presentation-pose coverage and a Quaternius multipart mismatch.
- The architecture control-byte sweep rejects CRLF across the Windows checkout.

Do not treat this as a merge-ready whole-worktree result. Review the warrior
prototype in the development build before extending the policy to other classes.
