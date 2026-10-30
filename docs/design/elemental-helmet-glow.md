# Elemental helmet light

All five elemental lab prototypes now have light inside their visor, matching
their core color: fire orange, ice blue, water cyan, storm violet-blue and muted
warm stone. `ElementalHelmetGlow` attaches one small emissive ellipsoid directly
to the original `vfx_eyes` socket. It is recessed behind the brow and nose plate,
so the helmet occludes it. The authored socket uses X across the visor, Y for
depth and Z vertically; its scale/offset are authored in that basis.

This adds one owned draw and 288 triangles per elemental. No GLB, body material,
texture, animation, light, skeleton or framebuffer is modified or introduced.
The additive volume has depth testing, no depth writes or shadows, and is tagged
out of shared material/tint/caster sweeps. It is created before the existing
whole-character compile gate. Missing sockets fail softly without an orb.

Both existing body-effect owners pass their visibility, death strength and
frozen reduced-motion clock to the visor. Disposal detaches it and releases its
own geometry and material once, without touching the bone or source assets.

The source asset is `public/models/creatures/ignivar_ashcaller.glb`, originally
provided as `Ignivar_Ashcaller.zip`. `CREDITS.md` records a World of ClaudeCraft
contributor handoff; no individual artist name is recorded there. The live
simulation uses the internal template ID `ignivar_heart_of_the_end`, with the
display name **Ignivar Ashcaller**. It is a stationary priority target in the
normal Ignivar intermission. It is the source of the five staff-free derivatives,
not a new independently generated elemental mesh.

QA: 40 focused effect/material tests pass, including all five owner integrations,
animated socket following under nonuniform scale, reduced motion, hiding,
death/revival, missing sockets and exactly-once disposal. TypeScript, production
build, scoped Biome and `security:gate` pass (9,164 files, zero high findings).
Fresh read-only render review found no blocking issue. The full gate remains
stopped at the existing staged/committed i18n freshness comparison; no staging
was performed to bypass it.

Standard/low captures are under `docs/screenshots/elemental-helmet/<variant>/`:
idle, close visor view, back view and runtime metadata. These are visual smoke
checks rather than hardware performance measurements.
All ten standard/low variant checks pass without page or shader errors, including
the recessed visor fit and the existing hidden/death/revive effect smoke checks.
`ci:changed` passes with zero selected files in this uncommitted continuation;
the scoped Biome run is the actual lint evidence.
