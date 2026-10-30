import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gfxInternalsForTest } from '../src/render/gfx';
import { propMaterialInternalsForTest } from '../src/render/props';

const { convertMaterial } = propMaterialInternalsForTest;
function source(name: string, strength: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name,
    normalMap: new THREE.Texture(),
    roughness: 0.97,
    metalness: 0,
  });
  material.normalScale.set(strength, strength);
  return material;
}

describe('authored vessel normal strength in prop materials', () => {
  it('keeps authored lantern emission on both vessel material profiles', () => {
    for (const standardMaterials of [true, false]) {
      const restore = gfxInternalsForTest.overrideSettings({ standardMaterials });
      try {
        const original = source('Lantern_Warm_Glass', 1);
        original.emissive.setRGB(0.45, 0.162, 0.02475);
        const converted = convertMaterial(
          original,
          'wickboats',
          false,
          null,
        ) as THREE.MeshStandardMaterial;
        expect(converted.emissive.toArray()).toEqual(original.emissive.toArray());
        expect(converted.emissive).not.toBe(original.emissive);
        expect(converted.emissiveIntensity).toBeCloseTo(standardMaterials ? 1 : 0.6, 5);
      } finally {
        restore();
      }
    }
  });

  it('preserves the subdued normal map and matte wood finish', () => {
    const restore = gfxInternalsForTest.overrideSettings({ standardMaterials: true });
    try {
      const original = source('Vessel_Normal_Strength', 0.25);
      const converted = convertMaterial(
        original,
        'wickboats',
        false,
        null,
      ) as THREE.MeshStandardMaterial;
      expect(converted.normalScale.toArray()).toEqual([0.25, 0.25]);
      expect(converted.roughness).toBe(0.97);
      expect(converted.metalness).toBe(0);
      expect(converted.normalMap).toBe(original.normalMap);
      expect(converted.normalScale).not.toBe(original.normalScale);
    } finally {
      restore();
    }
  });

  it('does not share a cached material between different normal strengths', () => {
    const restore = gfxInternalsForTest.overrideSettings({ standardMaterials: true });
    try {
      const soft = convertMaterial(
        source('Vessel_Shared_Normal', 0.25),
        'wickboats',
        false,
        null,
      ) as THREE.MeshStandardMaterial;
      const strong = convertMaterial(
        source('Vessel_Shared_Normal', 1),
        'wickboats',
        false,
        null,
      ) as THREE.MeshStandardMaterial;
      expect(soft).not.toBe(strong);
      expect(soft.normalScale.toArray()).toEqual([0.25, 0.25]);
      expect(strong.normalScale.toArray()).toEqual([1, 1]);
    } finally {
      restore();
    }
  });
});
