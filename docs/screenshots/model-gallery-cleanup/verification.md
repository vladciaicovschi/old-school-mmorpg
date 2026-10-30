# Default gallery cleanup

`missing.png` shows the retained old boar and its missing-replacement flag,
with the new cultist and skeleton models behind it and their old counterparts
absent. `npcs.png` and `npcs-narrow.png` show the new Apothecary Lin alone;
NPCs without replacements remain visible with their existing labels.

The earlier paired gallery is in `../model-comparisons/`. The first animal
capture in this run still showed a teleport loading curtain and was discarded.
The retained images were inspected after capture. The runtime subject audit
still covers every row and confirms 202 gallery subjects, including 158 missing
rows, with no replaced old models. The full default island has 234 subjects,
45 fewer than before. Wolf V1 is absent and Wolf V2 is present once.

`smoke.json` contains the exact counts and zero uncaught page errors. These are
offline headless Chrome/SwiftShader visibility checks at 1440x900 and 960x540,
not performance measurements. The command for rebuilding an existing user's
subjects after reloading is `/dev lab`.
