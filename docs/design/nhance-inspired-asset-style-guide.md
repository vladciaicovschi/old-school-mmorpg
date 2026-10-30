# World of ClaudeCraft: N-Hance-inspired asset style guide

Status: living visual direction for asset generation and selection.

This guide defines a visual corridor for concepts, 3D generation, cleanup, and asset
review. It does not authorize copying any specific N-Hance Studio asset, character,
silhouette, texture, or design. References to N-Hance describe a broad quality and style
direction only. Every shipped asset must remain original and comply with its source and
generation licenses.

Use this guide together with `docs/rigged-model-import-runbook.md`. This document decides
whether an asset belongs in the visual world. The runbook explains how an accepted asset
is rigged, animated, optimized, tested, and integrated.

## 1. Goal

World of ClaudeCraft assets should feel like one stylized fantasy RPG/MMO family:

- Characters, armor, weapons, and creatures remain readable at gameplay distance.
- Content from different sources still looks like part of one game.
- The rendering direction is stylized fantasy with a hand-painted PBR hybrid feel.
- Every asset works from a third-person gameplay camera.
- Assets are designed for modularity and reuse where the technical contract permits it.

## 2. Core visual principles

### 2.1 Silhouette first

Shape must read before detail:

- A character is identifiable by silhouette.
- A weapon is identifiable by its overall mass and profile.
- A creature is identifiable by its dominant form.

### 2.2 Broad, readable shapes

Prioritize large and medium forms over small surface noise. Details should support the
primary shape instead of competing with it.

### 2.3 Stylized realism

The target is neither chibi cartoon styling nor photorealism:

- Proportions may be slightly heroic.
- Forms are simplified deliberately.
- Details remain clean and suitable for gameplay.

### 2.4 Gameplay readability

Every asset must work in:

- Neutral pose.
- Idle.
- Locomotion.
- Combat.
- The normal game camera, not only a close studio render.

### 2.5 Modularity first

Humanoid assets should be planned as a system:

- Base body.
- Modular equipment.
- Interchangeable weapons.
- Compatibility through a shared skeleton and pose contract.

Modularity is a technical promise, not only a visual intention. Do not call an asset
modular until skeleton, weights, body masking, material slots, and equipment combinations
have been validated.

## 3. Character direction

### 3.1 Base body

The base body should be:

- Clean in shape.
- Suitable for rigging.
- Free of complex attached equipment.
- Dressed in non-removable underwear.
- Proportioned for a stylized fantasy RPG.

### 3.2 Proportions

- Slightly heroic physique.
- Athletic without being hyper-muscular by default.
- Clean, stylized anatomy.
- Readable shoulders, rib cage, pelvis, and limbs.
- No hyperreal muscle micro-detail.

### 3.3 Head and face

- A stylized, game-ready face with readable features.
- No beard on a base male body.
- Hair may be omitted on a base-body variant.
- Brows and eyes remain readable without photoreal detail.

### 3.4 Race silhouettes

#### Human

The baseline for shared proportions and equipment fit.

#### Elf

Slightly lighter and more elegant, with cleaner forms, while remaining part of the same
asset family.

#### Orc

Broader shoulders, greater mass, and rougher large forms.

#### Dwarf

Shorter, denser, and built around a lower and heavier center of mass.

The key rule is that races differ through silhouette while still looking like one product
line.

## 4. Armor and clothing

### 4.1 General construction

Armor and clothing should be built from large, readable layers:

- Chest piece.
- Shoulders.
- Gloves or bracers.
- Belt.
- Leg pieces.
- Boots.
- Cloak or robe panels only when they do not damage readability or animation.

### 4.2 New-player and early-game equipment

- Simple forms.
- Minimal small decoration.
- Clear silhouette.
- A believable starting-RPG-equipment feel, not an endgame set.

### 4.3 Mid-game and advanced equipment

Richer equipment is allowed, but:

- Form remains more important than ornament.
- Role is readable from silhouette.
- Small detail does not overwhelm the set.

### 4.4 Technical direction

- The body is a neutral, rig-friendly base.
- Equipment creates most of the character's visual identity.
- Modular equipment must comply with one shared skeleton contract.

## 5. Weapons

### 5.1 Visual language

Weapons should have:

- Slightly exaggerated readability.
- Large, confident forms.
- Limited small ornament.
- Clear material separation between metal, wood, leather, and cloth.

### 5.2 Type identity

- A sword needs a readable blade and simple guard.
- A shield needs a strong outer shape, clear face plane, and simple recognizable emblem.
- Axes, maces, spears, and bows must be identifiable immediately.

### 5.3 Gameplay rule

Avoid extremely thin or realistically fragile weapon proportions. Slightly thicker forms
usually read better from a third-person camera.

The exaggeration must remain coherent with hand size, character proportions, and combat
animation. Readability does not justify equipment so large that it obscures the character.

## 6. Creatures and animals

### 6.1 General direction

Creatures should be:

- Stylized without becoming comedic by default.
- Simple in their primary masses.
- Readable in motion and in groups.
- Compatible with humanoid shading and surface style.

### 6.2 Dominant silhouette motif

Each creature needs one clear silhouette idea:

- Crab: claws and shell.
- Turtle: shell.
- Hydra or serpent: elongated body rhythm.
- Ape, ogre, or frog: distinctive torso mass and posture.

### 6.3 Color

- Hand-painted color variation is welcome.
- Fantasy colors are allowed.
- Color must not obscure the natural reading of the form.

## 7. Materials and textures

### 7.1 Material direction

The target is stylized PBR:

- Base color carries the main artistic information.
- Normal maps support form without filling it with noise.
- Roughness and metallic response make material families readable.
- A hand-painted impression is more important than scan-like realism.

### 7.2 Priority rule

Painted readability comes first. PBR response supports it.

A material should feel authored for a game, not like an untreated realistic scan. Judge
materials under the actual game lighting and graphics tiers, not only in a generator or
studio viewer.

## 8. Color discipline

### 8.1 Base palette

The main palette favors:

- Warm browns.
- Steel grays.
- Ochre.
- Olive.
- Muted blue.
- Burgundy.
- Natural cloth and leather colors.

### 8.2 Accents

Use accent colors with restraint:

- Blue stone or crystal.
- Red cloth accent.
- Green magical accent.
- Gold for heroic details.

### 8.3 Color rule

Color must not destroy the form. Establish mass and value readability before adding
decoration.

## 9. Animation readability

An asset is successful only when it remains readable in:

- A-pose or neutral pose.
- Idle.
- Walk and run.
- Attack wind-up.
- Hit reaction.
- Death pose.

If the form becomes difficult to read in motion, the asset may be overdesigned, poorly
weighted, or based on unsuitable proportions.

## 10. Avoid

Do not use:

- Thin, strictly historical weapon proportions that disappear from the game camera.
- Excessive small ornament or surface noise.
- Materials so dark or dirty that they erase the silhouette.
- Hyper-detailed armor without a strong large-form hierarchy.
- Excessively cartoonish proportions.
- Shading or forms that make an asset feel like it came from another game.
- AI-generated designs without a clear role and silhouette identity.
- Direct copies of distinctive third-party assets or recognizable proprietary designs.

## 11. Acceptance checklist for a new asset

A candidate is suitable when:

- [ ] It reads at normal gameplay distance.
- [ ] It has a strong silhouette.
- [ ] It is not overloaded with small detail.
- [ ] It belongs to the shared stylized fantasy RPG family.
- [ ] Its materials and shading match the surrounding world.
- [ ] It works from a third-person camera.
- [ ] It supports the applicable import and runtime pipeline.
- [ ] It remains readable in representative animation poses.
- [ ] It is original and has acceptable provenance and redistribution terms.

## 12. Production prompt template: base humanoid

This prompt is a starting point for generating a base male human concept. It is not a
substitute for originality review, turnaround views, topology inspection, or the modular
body contract.

### Full prompt

Create a full-body **stylized fantasy male human base body** concept for an RPG/MMO,
inspired by the broad N-Hance Studio style direction, but **do not copy any specific
existing asset**.

Requirements:

- Show one character only, full body, centered in frame.
- Use an A-pose, with arms slightly away from the torso and legs slightly apart, suitable
  for 3D generation and autorig.
- Dress the character only in non-removable underwear: simple dark fitted shorts or
  briefs, with no armor, clothing layers, or shoes.
- Use no beard and no hairstyle. The head should be bald so this remains a clean base-body
  concept.
- Use a slightly heroic, athletic build with stylized realism, clean anatomy, and clearly
  readable torso, pelvis, arms, and legs.
- Use a stylized fantasy RPG/MMO presentation with broad readable shapes, silhouette-first
  design, a hand-painted PBR feel, and clean game-ready rendering.
- Do not make the character photorealistic, chibi, or hyper-muscular like a bodybuilder.
- Keep the face stylized and game-friendly, with clear features and restrained detail.
- Keep surfaces clean and simplified, without unnecessary surface noise.
- Make the materials feel like a stylized game-asset preview.
- Use a neutral, clean studio background with no distracting elements.
- Present the result as a production-friendly character concept for 3D generation.
- Include no weapon, shield, armor, accessories, cloak, or hair.
- Make the design suitable for this later pipeline: concept -> 3D generation -> rig ->
  game.

### Short prompt

Stylized fantasy RPG/MMO male human base body, full body, centered, clean studio
background, A-pose, bald, no beard, athletic stylized anatomy, only dark non-removable
fitted underwear, no armor, no clothes, no shoes, silhouette-first, broad readable shapes,
hand-painted PBR feel, game-ready stylized character concept for 3D generation, not
photorealistic, not chibi.

## 13. Recommended next concepts

After the base male human, create and review candidates in this order:

1. Human female base body.
2. Elf male base body.
3. Orc male base body.
4. Dwarf male base body.
5. First new-player armor set.
6. Simple sword, shield, and axe family.
7. First modular shoulders, boots, and chest pieces.

Do not expand the race or equipment matrix until the shared skeleton and modular body
contract has passed a small end-to-end prototype.
