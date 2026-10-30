import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  QUATERNIUS_WEAPON_MODEL_URLS,
  quaterniusWeaponModelUrlFor,
} from '../src/render/characters/quaternius_weapon_models_core';

describe('Quaternius tutorial-island weapon replacements', () => {
  it('maps supported KayKit categories to the restrained Quaternius set', () => {
    expect(quaterniusWeaponModelUrlFor('models/weapons/sword_a.glb')).toBe(
      'models/weapons/quaternius/sword.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/dagger_a.glb')).toBe(
      'models/weapons/quaternius/dagger.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/hammer_a.glb')).toBe(
      'models/weapons/quaternius/hammer_small.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/axe_a.glb')).toBe(
      'models/weapons/quaternius/axe_small.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/shield_round.glb')).toBe(
      'models/weapons/quaternius/shield_round.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/spear_a.glb')).toBe(
      'models/weapons/quaternius/spear.glb',
    );
  });

  it('keeps unsupported categories and non-weapon paths unchanged', () => {
    expect(quaterniusWeaponModelUrlFor('models/weapons/staff.glb')).toBe(
      'models/weapons/staff.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/weapons/crossbow_1handed.glb')).toBe(
      'models/weapons/crossbow_1handed.glb',
    );
    expect(quaterniusWeaponModelUrlFor('models/chars/players/knight.glb')).toBe(
      'models/chars/players/knight.glb',
    );
  });

  it('ships every preloaded replacement model', () => {
    expect(new Set(QUATERNIUS_WEAPON_MODEL_URLS).size).toBe(6);
    for (const url of QUATERNIUS_WEAPON_MODEL_URLS) {
      const file = path.join(process.cwd(), 'public', url);
      expect(fs.existsSync(file), url).toBe(true);
      expect(MEDIA_ASSETS[url], `${url} should be in the media manifest`).toBeDefined();
      const binary = fs.readFileSync(file).toString('latin1');
      expect(binary, `${url} should use meshopt`).toContain('EXT_meshopt_compression');
      expect(binary, `${url} should not use Draco`).not.toContain('KHR_draco_mesh_compression');
    }
  });
});
