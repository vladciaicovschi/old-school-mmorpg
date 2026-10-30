import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { characterPreloadUrls } from '../src/render/characters/manifest';
import {
  allEquipmentPartNodeNames,
  MESHY_TITAN_ARMOR_PARTS,
} from '../src/render/characters/meshy_titan_armor_core';
import {
  MESHY_TITAN_ATTACHMENT_UNIT_SCALE,
  MESHY_TITAN_HANDSLOT_POSITION,
  MESHY_TITAN_WEAPON_MODEL_URLS,
  meshyTitanHeldFinalTransformFor,
  meshyTitanHeldModelCorrectionFor,
  meshyTitanWeaponModelUrlFor,
} from '../src/render/characters/meshy_titan_weapon_models_core';

function glbJson(file: string): {
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  animations?: Array<{ name?: string; samplers?: Array<{ input: number }> }>;
  extensionsRequired?: string[];
  nodes?: Array<{
    name?: string;
    translation?: number[];
    scale?: number[];
    mesh?: number;
    skin?: number;
    extras?: { armor_set?: string; equipment_slot?: string };
  }>;
  skins?: Array<{ joints?: number[] }>;
} {
  const glb = fs.readFileSync(file);
  const jsonLength = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
}

describe('Meshy Titan tutorial-island weapon replacements', () => {
  it('keeps held props in the finalized metre-native Mixamo rig space', () => {
    expect(MESHY_TITAN_ATTACHMENT_UNIT_SCALE).toBe(1);
    expect(MESHY_TITAN_HANDSLOT_POSITION).toEqual([0, 0.075, 0]);
  });

  it('ships the body and hand bones in one metre-native coordinate space', () => {
    const file = path.join(process.cwd(), 'public/models/chars/players/meshy_titan.glb');
    const nodes = glbJson(file).nodes ?? [];
    const rig = nodes.find((node) => node.name === 'Titan_Rig');
    expect(rig).toBeDefined();
    expect(rig?.scale ?? [1, 1, 1]).toEqual([1, 1, 1]);

    for (const name of ['mixamorig:RightHand', 'mixamorig:LeftHand']) {
      const hand = nodes.find((node) => node.name === name);
      expect(hand, name).toBeDefined();
      expect(hand?.translation?.[1], `${name} local limb length`).toBeGreaterThan(0.2);
      expect(hand?.translation?.[1], `${name} is not still in FBX centimetres`).toBeLessThan(0.4);
    }
  });

  it('ships both idle states as the full retargeted sword-and-shield animation', () => {
    const file = path.join(process.cwd(), 'public/models/chars/players/meshy_titan.glb');
    const json = glbJson(file);
    for (const name of ['Titan_Idle', 'Titan_CombatIdle']) {
      const animation = json.animations?.find((candidate) => candidate.name === name);
      expect(animation, name).toBeDefined();
      const timeAccessors = new Set(animation?.samplers?.map((sampler) => sampler.input) ?? []);
      const timelines = [...timeAccessors].map((index) => json.accessors?.[index]);
      expect(Math.max(...timelines.map((accessor) => accessor?.count ?? 0))).toBeGreaterThan(100);
      expect(Math.max(...timelines.map((accessor) => accessor?.max?.[0] ?? 0))).toBeCloseTo(
        220 / 30,
        5,
      );
    }
  });

  it("ships all thirteen Knight's Valor segments as skinned named nodes", () => {
    const file = path.join(process.cwd(), 'public/models/chars/players/meshy_titan.glb');
    const json = glbJson(file);
    const expected = allEquipmentPartNodeNames(MESHY_TITAN_ARMOR_PARTS).sort();
    const armor = (json.nodes ?? [])
      .filter((node) => node.name?.startsWith('Armor_valor_'))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    expect(armor.map((node) => node.name)).toEqual(expected);
    for (const node of armor) {
      expect(node.mesh, `${node.name} mesh`).toBeTypeOf('number');
      expect(node.skin, `${node.name} skin`).toBeTypeOf('number');
      expect(node.extras?.armor_set, `${node.name} armor set`).toBe('knights_valor');
      expect(node.extras?.equipment_slot, `${node.name} slot`).toBeTypeOf('string');
      expect(json.skins?.[node.skin ?? -1]?.joints?.length, `${node.name} full rig`).toBe(41);
    }
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'KHR_texture_basisu']),
    );
  });

  it("maps the starter sword and shield to the Knight's Valor set", () => {
    expect(meshyTitanWeaponModelUrlFor('models/weapons/sword_a.glb')).toBe(
      'models/weapons/meshy/knights_valor_sword.glb',
    );
    expect(meshyTitanWeaponModelUrlFor('models/weapons/sword_1handed.glb')).toBe(
      'models/weapons/meshy/knights_valor_sword.glb',
    );
    expect(meshyTitanWeaponModelUrlFor('models/weapons/shield_round.glb')).toBe(
      'models/weapons/meshy/knights_valor_shield.glb',
    );
  });

  it("shrinks and turns both Knight's Valor props upright for Titan hands", () => {
    expect(
      meshyTitanHeldModelCorrectionFor('models/weapons/meshy/knights_valor_sword.glb'),
    ).toEqual({
      scale: 0.58,
      quaternion: [0, 0, 1, 0],
      modelOffset: [0, 0.65, 0],
    });
    expect(
      meshyTitanHeldModelCorrectionFor('models/weapons/meshy/knights_valor_shield.glb'),
    ).toEqual({
      scale: 0.52,
      quaternion: [-0.9238795325, 0, 0.3826834324, 0],
      modelOffset: [0, 0, 0.27],
    });
    expect(meshyTitanHeldModelCorrectionFor('models/weapons/staff.glb')).toBeNull();
  });

  it('applies the accepted editor fits as final hand-bone-local transforms', () => {
    expect(meshyTitanHeldFinalTransformFor('models/weapons/meshy/knights_valor_sword.glb')).toEqual(
      {
        position: [-0.277577, 0.103909, 0.241184],
        rotationDeg: [-177.354359, -38.19562, -90.674374],
        scale: 0.58,
      },
    );
    expect(
      meshyTitanHeldFinalTransformFor('models/weapons/meshy/knights_valor_shield.glb'),
    ).toEqual({
      position: [0.003375, 0.125017, 0.013552],
      rotationDeg: [-119.658012, 22.24252, 39.414969],
      scale: 0.310128,
    });
    expect(meshyTitanHeldFinalTransformFor('models/weapons/staff.glb')).toBeNull();
  });

  it('keeps unsupported equipment and non-weapon paths unchanged', () => {
    expect(meshyTitanWeaponModelUrlFor('models/weapons/staff.glb')).toBe(
      'models/weapons/staff.glb',
    );
    expect(meshyTitanWeaponModelUrlFor('models/chars/players/meshy_titan.glb')).toBe(
      'models/chars/players/meshy_titan.glb',
    );
  });

  it('ships both optimized replacements through the media manifest', () => {
    expect(new Set(MESHY_TITAN_WEAPON_MODEL_URLS).size).toBe(2);
    for (const url of MESHY_TITAN_WEAPON_MODEL_URLS) {
      const file = path.join(process.cwd(), 'public', url);
      expect(fs.existsSync(file), url).toBe(true);
      expect(MEDIA_ASSETS[url], `${url} should be in the media manifest`).toBeDefined();
      const binary = fs.readFileSync(file).toString('latin1');
      expect(binary, `${url} should use meshopt`).toContain('EXT_meshopt_compression');
      expect(binary, `${url} should not use Draco`).not.toContain('KHR_draco_mesh_compression');
    }
  });

  it('keeps the editor body and fitted equipment behind the launcher character gate', () => {
    const preload = new Set(characterPreloadUrls(true));
    expect(preload).toContain('models/chars/players/meshy_titan.glb');
    for (const url of MESHY_TITAN_WEAPON_MODEL_URLS) expect(preload).toContain(url);
  });
});
