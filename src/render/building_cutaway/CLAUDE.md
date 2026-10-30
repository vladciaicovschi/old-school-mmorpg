# Selective building cutaway

`index.ts` is the public adapter used by `wickharbor_occlusion.ts` for the
approved settlement buildings. `visibility_core.ts` owns deterministic
partition and sightline decisions. `geometry.ts` partitions immutable source
geometry once, before town reveal/prewarm, and shares the results per view.

Keep furniture, stairs and supporting floors readable. Remove only obstructing
shell pieces from the colour/depth pass, using the existing shadow-only
material recipe. Preserve source materials, hooks, attributes and shadows.
Do not add per-frame geometry scans, allocations, shader mutations or sim writes.
Tests: `building_cutaway_core.test.ts`, `building_cutaway.test.ts`, and
`wickharbor_occlusion.test.ts`.
