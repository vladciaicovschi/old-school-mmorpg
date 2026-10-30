# Character-select resting presentation

The roster stage, its default subject, and creation/offline class selection use
the same `presentation: 'charselect'` policy. Equipment is retained on the model
and stowed through the existing carry anchors, not removed from the loadout.
All classes use a calm frame at 0.1 of the chosen idle, never an attack frame.

`previewPresentationPose` resolves the native travel idle first, then an explicit
presentation-only idle, then the body's normal idle. Hunter registers its own
`T1Hunter_Idle` for this purpose; its in-world bow/crossbow idle and motion remain
unchanged. The Mech cosmetic uses its own Idle rather than the wearer's T1 clips.
Before its asynchronous load finishes the temporary class body uses its own idle.

`CharacterPreview.applyPresentationPose` stows equipment before freezing and
retries the existing freeze path if clips are not ready. The shared turntable
clears presentation freeze/carry on live-sheet, class, modular or fitting-editor
transitions, including reuse of the same warm visual. No gameplay state, item,
save data, native body or animation GLB is changed.

Direct raw-key previews clear roster state too. Only `setAppearance` marks its
internal visual selection as appearance-managed, then applies the requested
presentation; repeated unchanged roster paints retain the frozen pose and warm rig.

## Verification

```powershell
npx vitest run tests/preview_appearance.test.ts tests/hunter_motion_visual.test.ts tests/remaining_player_motion_visual.test.ts tests/t1_player_assets.test.ts tests/appearance_creator_rows.test.ts --maxWorkers=2
npm run check:ts
npm run security:gate
npm run build:bundle
node scripts/gate_select.mjs
```

The focused batch passed, including real shipped Hunter and remaining-class
mixers, equipment parenting, roster-to-sheet/editor transitions and asynchronous
Mech fallback. Scoped eight-file Biome passed with existing non-null warnings;
including main.ts additionally reports its existing unrelated import-order error
(the menu call-site change does not touch imports). The shared gate still stops
at generated-i18n freshness against staged/committed files in the accumulated
worktree. Nothing was staged or bypassed. Browser visual acceptance stays with
the user: check all nine classes and representative two-hand/shield/ranged kits.

Final typecheck, security scan and production bundle passed. The raw-key reuse
follow-up passed the focused preview suite and a second bounded read-only
frontend/coverage review; no blocking scoped finding remains.
