import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { characterPreloadUrls, VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DEV_MODEL_LAB_MOBS } from '../src/sim/content/dev_model_lab';

const CASES = [
  {
    key: 'npc_aldric',
    url: 'models/chars/npcs/brother_aldric.glb',
    clip: 'Aldric_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
  {
    key: 'npc_foreman_odell',
    url: 'models/chars/npcs/foreman_odell.glb',
    clip: 'Foreman_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
  {
    key: 'npc_apothecary_lin',
    url: 'models/chars/npcs/apothecary_lin.glb',
    clip: 'Apothecary_Idle_A',
    maxBytes: 12 * 1024 * 1024,
  },
  {
    key: 'npc_fisherman_brandt',
    url: 'models/chars/npcs/fisherman_brandt.glb',
    clip: 'Fisherman_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
  {
    key: 'npc_trader_wilkes',
    url: 'models/chars/npcs/trader_wilkes.glb',
    clip: 'Trader_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
  {
    key: 'npc_smith_haldren',
    url: 'models/chars/npcs/smith_haldren.glb',
    clip: 'Smith_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
  {
    key: 'npc_marshal_redbrook',
    url: 'models/chars/npcs/marshal_redbrook.glb',
    clip: 'Marshal_Idle',
    maxBytes: 6 * 1024 * 1024,
  },
] as const;

describe('Meshy named NPC game imports', () => {
  for (const entry of CASES) {
    it(`${entry.key}: keeps one textured Mixamo skin and its authored idle`, () => {
      const bytes = fs.readFileSync(`public/${entry.url}`);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const def = VISUALS[entry.key];

      expect(def.url).toBe(entry.url);
      expect(def.preserveSkinnedParts).toBe(true);
      expect(def.attach).toBeUndefined();
      expect(def.clips).toMatchObject({
        idle: entry.clip,
        walk: entry.clip,
        run: entry.clip,
        death: entry.clip,
      });
      for (const standardMaterials of [true, false]) {
        expect(characterPreloadUrls(standardMaterials)).toContain(entry.url);
      }
      expect(glb.meshes).toHaveLength(1);
      expect(glb.skins).toHaveLength(1);
      expect(glb.materials).toHaveLength(1);
      expect(glb.animations.map((animation: { name: string }) => animation.name)).toEqual([
        entry.clip,
      ]);
      for (const channel of glb.animations[0].channels) {
        expect(glb.nodes[channel.target.node], 'idle targets an existing rig node').toBeDefined();
      }
      for (const primitive of glb.meshes[0].primitives) {
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
          expect(primitive.attributes[attribute], attribute).toBeTypeOf('number');
        }
      }
      // glTF packs the separately restored metallic and roughness source maps
      // into one metallicRoughness texture, alongside base color and normal.
      expect(glb.images).toHaveLength(3);
      expect(glb.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
      expect(glb.materials[0].pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
      expect(glb.materials[0].normalTexture).toBeDefined();
      for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
      expect(glb.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(MEDIA_ASSETS).toHaveProperty(entry.url);
      expect(bytes.length).toBeLessThan(entry.maxBytes);
    });
  }
});

const MINION_CASES = [
  {
    key: 'npc_dev_skeleton_minion',
    templateId: 'dev_skeleton_minion',
    url: 'models/chars/npcs/dev_skeleton_minion.glb',
    prefix: 'SkeletonMinion',
  },
  {
    key: 'npc_dev_rogue_assassin',
    templateId: 'dev_rogue_assassin',
    url: 'models/chars/npcs/dev_rogue_assassin.glb',
    prefix: 'RogueAssassin',
  },
  {
    key: 'npc_dev_skeleton_warrior',
    templateId: 'dev_skeleton_warrior',
    url: 'models/chars/npcs/dev_skeleton_warrior.glb',
    prefix: 'SkeletonWarrior',
  },
] as const;

describe('Meshy developer-island minions', () => {
  it('gives every combat model a real embedded death clip', () => {
    for (const templateId of Object.keys(DEV_MODEL_LAB_MOBS)) {
      const key = visualKeyFor({ kind: 'mob', templateId } as never);
      const def = VISUALS[key];
      const death = def.clips?.death;
      expect(death, templateId).toMatch(/Death|Dying/);
      const bytes = fs.readFileSync(`public/${def.url}`);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const names = glb.animations.map((animation: { name: string }) => animation.name);
      expect(names, `${templateId}: ${death}`).toContain(death);
    }
  });

  for (const entry of MINION_CASES) {
    it(`${entry.key}: retains the full sword-and-shield pack and source PBR material`, () => {
      const bytes = fs.readFileSync(`public/${entry.url}`);
      const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const names = glb.animations.map((animation: { name: string }) => animation.name);
      const def = VISUALS[entry.key];

      expect(def.url).toBe(entry.url);
      expect(visualKeyFor({ kind: 'mob', templateId: entry.templateId } as never)).toBe(entry.key);
      expect(def.preserveSkinnedParts).toBe(true);
      expect(def.attachmentRig).toBe('mixamo_standard');
      expect(glb.meshes).toHaveLength(1);
      expect(glb.skins).toHaveLength(1);
      expect(glb.materials).toHaveLength(1);
      expect(names).toHaveLength(18);
      expect(names).toEqual(
        expect.arrayContaining([
          `${entry.prefix}_Idle`,
          `${entry.prefix}_Walk`,
          `${entry.prefix}_Run`,
          `${entry.prefix}_Block_Idle`,
          `${entry.prefix}_Attack`,
          `${entry.prefix}_Attack_4`,
          `${entry.prefix}_Death`,
        ]),
      );
      expect(def.clips?.walk).toBe(`${entry.prefix}_Walk`);
      expect(def.clips?.run).toBe(`${entry.prefix}_Run`);
      expect(glb.images).toHaveLength(3);
      for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
      expect(glb.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
      );
      expect(MEDIA_ASSETS).toHaveProperty(entry.url);
      expect(bytes.length).toBeLessThan(7 * 1024 * 1024);
    });
  }

  it('uses the rogue minion melee pack with a single one-handed axe', () => {
    const url = 'models/chars/npcs/dev_rogue_minion.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const def = VISUALS.npc_dev_rogue_minion;

    expect(names).toHaveLength(21);
    expect(names).toEqual(
      expect.arrayContaining([
        'RogueMinion_Standing_Idle',
        'RogueMinion_Standing_Block_Idle',
        'RogueMinion_Standing_Walk_Forward',
        'RogueMinion_Standing_Run_Forward',
        'RogueMinion_Standing_Melee_Attack_Backhand',
        'RogueMinion_Standing_Melee_Combo_Attack_Ver_1',
        'RogueMinion_Standing_React_Death_Backward',
      ]),
    );
    expect(def.clips?.walk).toBe('RogueMinion_Standing_Walk_Forward');
    expect(def.clips?.run).toBe('RogueMinion_Standing_Run_Forward');
    expect(def.attach?.map((entry) => entry.url)).toEqual([
      'models/weapons/meshy/evolution_axe_1.glb',
    ]);
    expect(def.attach?.map((entry) => entry.calibrationSlot)).toEqual(['mainhand']);
    expect(def.weaponSlots).toEqual([0]);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
  });

  it('imports the kobold with its rusted pickaxe', () => {
    const url = 'models/chars/npcs/dev_kobold.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const def = VISUALS.npc_dev_kobold;

    expect(names).toHaveLength(21);
    expect(names).toEqual(
      expect.arrayContaining([
        'Kobold_Standing_Idle',
        'Kobold_Standing_Block_Idle',
        'Kobold_Standing_Walk_Forward',
        'Kobold_Standing_Run_Forward',
        'Kobold_Standing_Melee_Attack_Backhand',
        'Kobold_Standing_React_Death_Backward',
      ]),
    );
    expect(def).toMatchObject({
      url,
      height: 1.8,
      preserveSkinnedParts: true,
      clips: {
        walk: 'Kobold_Standing_Walk_Forward',
        run: 'Kobold_Standing_Run_Forward',
      },
    });
    expect(def.attach).toEqual([
      {
        url: 'models/weapons/rusted_kobold_pickaxe.glb',
        bone: 'mixamorig:RightHand',
        calibrationSlot: 'mainhand',
      },
    ]);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_kobold' } as never)).toBe('npc_dev_kobold');
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
  });

  it('imports the murlok with its native Meshy rig and animation pack', () => {
    const url = 'models/chars/npcs/dev_meshy_murlok.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const def = VISUALS.npc_dev_meshy_murlok;
    const rig = glb.nodes.find((entry: { name?: string }) => entry.name === 'dev_meshy_murlok_Rig');

    expect(names).toHaveLength(7);
    expect(names).toEqual(
      expect.arrayContaining([
        'MeshyMurlokNative_Idle',
        'MeshyMurlokNative_Walk',
        'MeshyMurlokNative_Run',
        'MeshyMurlokNative_AxeSpinAttack',
        'MeshyMurlokNative_Death',
      ]),
    );
    expect(rig.extras.animation_pipeline).toBe('Native 80-bone Meshy actions; no Mixamo retarget');
    expect(JSON.parse(rig.extras.omitted_source_meshes)).toEqual(['Icosphere']);
    expect(glb.skins[0].joints).toHaveLength(80);
    expect(def).toMatchObject({
      url,
      height: 2.2,
      preserveSkinnedParts: true,
      clips: {
        walk: 'MeshyMurlokNative_Walk',
        run: 'MeshyMurlokNative_Run',
      },
    });
    expect(def.attach).toEqual([
      {
        url: 'models/weapons/rusted_murloc_pitchfork.glb',
        bone: 'mixamorig:RightHand',
        calibrationSlot: 'mainhand',
      },
    ]);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_meshy_murlok' } as never)).toBe(
      'npc_dev_meshy_murlok',
    );
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(12 * 1024 * 1024);
  });

  it.each([
    {
      key: 'npc_dev_troll' as const,
      templateId: 'dev_troll',
      url: 'models/chars/npcs/dev_troll.glb',
      prefix: 'Troll',
      count: 21,
      walk: 'Troll_Standing_Walk_Forward',
      run: 'Troll_Standing_Run_Forward',
      attack: 'Troll_Standing_Melee_Attack_Backhand',
      death: 'Troll_Standing_React_Death_Backward',
      height: 2.4,
      maxBytes: 8 * 1024 * 1024,
    },
    {
      key: 'npc_dev_bone_golem' as const,
      templateId: 'dev_bone_golem',
      url: 'models/chars/npcs/dev_bone_golem.glb',
      prefix: 'BoneGolem',
      count: 13,
      walk: 'BoneGolem_Mutant_Walking',
      run: 'BoneGolem_Mutant_Run',
      attack: 'BoneGolem_Mutant_Swiping',
      death: 'BoneGolem_Mutant_Dying',
      height: 3.5,
      maxBytes: 8 * 1024 * 1024,
    },
    {
      key: 'npc_dev_meshy_treant' as const,
      templateId: 'dev_meshy_treant',
      url: 'models/chars/npcs/dev_meshy_treant.glb',
      prefix: 'MeshyTreant',
      count: 13,
      walk: 'MeshyTreant_Mutant_Walking',
      run: 'MeshyTreant_Mutant_Run',
      attack: 'MeshyTreant_Mutant_Swiping',
      death: 'MeshyTreant_Mutant_Dying',
      height: 3.2,
      maxBytes: 12 * 1024 * 1024,
    },
    {
      key: 'npc_dev_meshy_ogre' as const,
      templateId: 'dev_meshy_ogre',
      url: 'models/chars/npcs/dev_meshy_ogre.glb',
      prefix: 'MeshyOgreNative',
      count: 8,
      walk: 'MeshyOgreNative_WalkInPlace',
      run: 'MeshyOgreNative_Run',
      attack: 'MeshyOgreNative_Attack',
      death: 'MeshyOgreNative_Death',
      height: 3.6,
      maxBytes: 12 * 1024 * 1024,
      attach: [{ url: 'models/weapons/rusted_ogre_club.glb', bone: 'mixamorig:RightHand' }],
    },
    {
      key: 'npc_dev_skeleton_necromancer_v2' as const,
      templateId: 'dev_skeleton_necromancer_v2',
      url: 'models/chars/npcs/dev_skeleton_necromancer_v2.glb',
      prefix: 'Necromancer',
      count: 14,
      walk: 'Necromancer_Standing_Walk_Forward',
      run: 'Necromancer_Standing_Run_Forward',
      attack: 'Necromancer_Standing_1H_Magic_Attack_01',
      death: 'Necromancer_Standing_React_Death_Backward',
      height: 2.4,
      maxBytes: 12 * 1024 * 1024,
    },
    {
      key: 'npc_dev_skeleton_caster_v3' as const,
      templateId: 'dev_skeleton_caster_v3',
      url: 'models/chars/npcs/dev_skeleton_caster_v3.glb',
      prefix: '',
      count: 14,
      walk: 'CasterV3_WalkInPlace',
      run: 'CasterV3_Run',
      attack: 'CasterV3_Cast',
      death: 'CasterV3_Death',
      height: 2.4,
      maxBytes: 12 * 1024 * 1024,
    },
    {
      key: 'npc_dev_skeleton_rogue_v3' as const,
      templateId: 'dev_skeleton_rogue_v3',
      url: 'models/chars/npcs/dev_skeleton_rogue_v3.glb',
      prefix: '',
      count: 9,
      walk: 'RogueV3_WalkInPlace',
      run: 'RogueV3_Run',
      attack: 'RogueV3_DoubleComboAttack',
      death: 'RogueV3_Death',
      height: 2.4,
      maxBytes: 12 * 1024 * 1024,
    },
    {
      key: 'npc_dev_treant_v2' as const,
      templateId: 'dev_treant_v2',
      url: 'models/chars/npcs/dev_treant_v2.glb',
      prefix: 'TreantV2',
      count: 13,
      walk: 'TreantV2_Mutant_Walking',
      run: 'TreantV2_Mutant_Run',
      attack: 'TreantV2_Mutant_Swiping',
      death: 'TreantV2_Mutant_Dying',
      height: 4.0,
      maxBytes: 12 * 1024 * 1024,
    },
  ])('imports $templateId with native locomotion and combat clips', (entry) => {
    const bytes = fs.readFileSync(`public/${entry.url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const def = VISUALS[entry.key];

    expect(names).toHaveLength(entry.count);
    expect(names).toEqual(
      expect.arrayContaining([entry.walk, entry.run, entry.attack, entry.death]),
    );
    expect(def).toMatchObject({
      url: entry.url,
      height: entry.height,
      preserveSkinnedParts: true,
      clips: { walk: entry.walk, run: entry.run, death: entry.death },
    });
    expect(def.attach).toEqual('attach' in entry ? entry.attach : undefined);
    expect(visualKeyFor({ kind: 'mob', templateId: entry.templateId } as never)).toBe(entry.key);
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(MEDIA_ASSETS).toHaveProperty(entry.url);
    expect(bytes.length).toBeLessThan(entry.maxBytes);
  });

  it('retargets only the treant humanoid chain and omits its helper sphere', () => {
    const bytes = fs.readFileSync('public/models/chars/npcs/dev_meshy_treant.glb');
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const rig = glb.nodes.find((entry: { name?: string }) => entry.name === 'dev_meshy_treant_Rig');

    expect(Object.keys(JSON.parse(rig.extras.humanoid_bone_map))).toHaveLength(22);
    expect(JSON.parse(rig.extras.omitted_source_meshes)).toEqual(['Icosphere']);
    expect(glb.skins[0].joints).toHaveLength(77);
    expect(glb.meshes).toHaveLength(1);
    expect(glb.nodes.some((entry: { name?: string }) => entry.name === 'Icosphere')).toBe(false);
  });

  it('keeps the native ogre Meshy rig while omitting its helper sphere', () => {
    const bytes = fs.readFileSync('public/models/chars/npcs/dev_meshy_ogre.glb');
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const rig = glb.nodes.find((entry: { name?: string }) => entry.name === 'dev_meshy_ogre_Rig');

    expect(rig.extras.animation_pipeline).toBe('Native 86-bone Meshy actions; no Mixamo retarget');
    expect(JSON.parse(rig.extras.omitted_source_meshes)).toEqual(['Icosphere']);
    expect(glb.skins[0].joints).toHaveLength(86);
    expect(glb.meshes).toHaveLength(1);
    expect(glb.nodes.some((entry: { name?: string }) => entry.name === 'Icosphere')).toBe(false);
  });

  it('retargets the assassin pack onto the Meshy skeleton rogue', () => {
    const url = 'models/chars/npcs/dev_skeleton_rogue.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const rig = glb.nodes.find(
      (entry: { name?: string }) => entry.name === 'dev_skeleton_rogue_Rig',
    );
    const def = VISUALS.npc_dev_skeleton_rogue;

    expect(names).toHaveLength(18);
    expect(names).toEqual(
      expect.arrayContaining([
        'SkeletonRogue_Idle',
        'SkeletonRogue_Walk',
        'SkeletonRogue_Run',
        'SkeletonRogue_Attack',
        'SkeletonRogue_Death',
      ]),
    );
    expect(def).toMatchObject({
      url,
      height: 2.6,
      preserveSkinnedParts: true,
      attachmentRig: 'mixamo_standard',
      clips: {
        idle: 'SkeletonRogue_Idle',
        walk: 'SkeletonRogue_Walk',
        run: 'SkeletonRogue_Run',
        death: 'SkeletonRogue_Death',
      },
      weaponSlots: [0, 1],
    });
    expect(def.attach?.map((entry) => entry.url)).toEqual([
      'models/weapons/meshy/arcane_dagger_1.glb',
      'models/weapons/meshy/arcane_dagger_1.glb',
    ]);
    expect(def.attach?.map((entry) => entry.scaleMultiplier)).toEqual([0.55, 0.55]);
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_skeleton_rogue' } as never)).toBe(
      'npc_dev_skeleton_rogue',
    );
    expect(JSON.parse(rig.extras.retargeted_bones)).toHaveLength(65);
    expect(JSON.parse(rig.extras.omitted_source_meshes)).toEqual(['Icosphere']);
    expect(glb.skins[0].joints).toHaveLength(96);
    expect(glb.meshes).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.nodes.some((entry: { name?: string }) => entry.name === 'Icosphere')).toBe(false);
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(12 * 1024 * 1024);
  });

  it('repairs the skeleton warrior leg chain instead of shipping collapsed Mixamo joints', () => {
    const bytes = fs.readFileSync('public/models/chars/npcs/dev_skeleton_warrior.glb');
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const node = (name: string) =>
      glb.nodes.find((entry: { name?: string }) => entry.name === `mixamorig:${name}`);
    const length = (name: string) =>
      Math.hypot(...(node(name)?.translation ?? [0, 0, 0]).map(Number));

    expect(length('LeftLeg')).toBeGreaterThan(0.3);
    expect(length('RightLeg')).toBeGreaterThan(0.3);
    expect(length('LeftFoot')).toBeGreaterThan(0.3);
    expect(length('RightFoot')).toBeGreaterThan(0.3);
    expect(length('LeftToeBase')).toBeGreaterThan(0.1);
    expect(length('RightToeBase')).toBeGreaterThan(0.1);
    const body = glb.nodes.find(
      (entry: { name?: string }) => entry.name === 'dev_skeleton_warrior_Body',
    );
    expect(body?.extras?.mixamo_proxy_faces_removed).toBeGreaterThan(0);
  });

  it('keeps the rogue assassin equipped with fixed dual daggers', () => {
    const def = VISUALS.npc_dev_rogue_assassin;
    expect(def.attach?.map((entry) => entry.url)).toEqual([
      'models/weapons/meshy/arcane_dagger_1.glb',
      'models/weapons/meshy/arcane_dagger_1.glb',
    ]);
    expect(def.weaponSlots).toEqual([0, 1]);
    expect(def.offhandSlot).toBeUndefined();
    expect(def.attach?.map((entry) => entry.calibrationSlot)).toEqual(['mainhand', 'offhand']);
    expect(def.attach?.map((entry) => entry.scaleMultiplier)).toEqual([0.55, 0.55]);
  });

  it('keeps skeleton shields visible while giving both hands persistent fit slots', () => {
    for (const key of ['npc_dev_skeleton_minion', 'npc_dev_skeleton_warrior'] as const) {
      expect(VISUALS[key].weaponSlots).toEqual([0]);
      expect(VISUALS[key].offhandSlot).toBeUndefined();
      expect(VISUALS[key].attach?.map((entry) => entry.calibrationSlot)).toEqual([
        'mainhand',
        'offhand',
      ]);
    }
  });
});

describe('Meshy developer-island cultist', () => {
  it('retains the magic animation pack and compressed source PBR material', () => {
    const url = 'models/chars/npcs/dev_skeleton_cultist.glb';
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);

    expect(VISUALS.npc_dev_skeleton_cultist).toMatchObject({
      url,
      preserveSkinnedParts: true,
      clips: {
        idle: 'CultistMagic_Idle',
        run: 'Cultist_Standing_Run_Forward',
        death: 'Cultist_Standing_React_Death_Backward',
      },
    });
    expect(visualKeyFor({ kind: 'mob', templateId: 'dev_skeleton_cultist' } as never)).toBe(
      'npc_dev_skeleton_cultist',
    );
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(names).toHaveLength(14);
    expect(names).toEqual(
      expect.arrayContaining([
        'Cultist_Standing_Idle',
        'Cultist_Standing_1H_Magic_Attack_01',
        'Cultist_Standing_2H_Magic_Area_Attack_02',
        'Cultist_Standing_Run_Forward',
        'Cultist_Standing_React_Death_Backward',
      ]),
    );
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(glb.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
    expect(MEDIA_ASSETS).toHaveProperty(url);
    expect(bytes.length).toBeLessThan(7 * 1024 * 1024);
  });
});
