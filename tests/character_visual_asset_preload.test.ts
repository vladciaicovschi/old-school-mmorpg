import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadGltf = vi.hoisted(() => vi.fn());
const mergeSkinnedParts = vi.hoisted(() => vi.fn());

vi.mock('../src/render/assets/loader', () => ({
  loadGltf,
  loadTexture: vi.fn(() => new Promise(() => undefined)),
  loadKtx2Texture: vi.fn(() => new Promise(() => undefined)),
  releaseGltf: vi.fn(),
}));

vi.mock('../src/render/characters/rig_merge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/render/characters/rig_merge')>()),
  mergeSkinnedParts,
}));

function skinnedPart(name: string, skeleton: THREE.Skeleton): THREE.SkinnedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const vertices = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(new Uint16Array(vertices * 4), 4),
  );
  const weights = new Float32Array(vertices * 4);
  for (let vertex = 0; vertex < vertices; vertex++) weights[vertex * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.bind(skeleton);
  return mesh;
}

function multipartGltf(): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'root';
  root.add(bone);
  const skeleton = new THREE.Skeleton([bone]);
  root.add(skinnedPart('outfit-a', skeleton), skinnedPart('outfit-b', skeleton));
  return { scene: root, animations: [] };
}

beforeEach(() => {
  loadGltf.mockReset();
  loadGltf.mockImplementation(() => Promise.resolve(multipartGltf()));
  mergeSkinnedParts.mockReset();
  mergeSkinnedParts.mockImplementation((root: THREE.Object3D) => {
    const parts = root.children.filter((child) => (child as THREE.SkinnedMesh).isSkinnedMesh);
    for (const part of parts.slice(1)) root.remove(part);
  });
});

describe('targeted character visual asset preload', () => {
  it('awaits an explicitly selected fitting weapon as well as the body', async () => {
    vi.resetModules();
    const { preloadCharacterVisualAssets } = await import('../src/render/characters/assets');
    await preloadCharacterVisualAssets('player_warrior', [
      'models/weapons/meshy/claymore_sword_1.glb',
    ]);
    expect(loadGltf.mock.calls.some(([url]) => String(url).includes('claymore_sword_1'))).toBe(
      true,
    );
  });
  it('loads the self-contained Meshy Titan body and its fallback props', async () => {
    vi.resetModules();
    const { preloadCharacterVisualAssets } = await import('../src/render/characters/assets');

    await preloadCharacterVisualAssets('player_meshy_titan');
    const loaded = loadGltf.mock.calls.map(([url]) => String(url));
    expect(loaded.some((url) => url.includes('meshy_titan'))).toBe(true);
    expect(loaded.some((url) => url.includes('sword_1handed'))).toBe(true);
    expect(loaded.some((url) => url.includes('shield_round'))).toBe(true);
    expect(loaded.some((url) => url.includes('quaternius_ual_standard'))).toBe(false);
  });

  it('loads the selected body, shared animation donor, and fallback props', async () => {
    vi.resetModules();
    const { preloadCharacterVisualAssets } = await import('../src/render/characters/assets');

    await preloadCharacterVisualAssets('player_quaternius_male_ranger');
    const loaded = loadGltf.mock.calls.map(([url]) => String(url));
    expect(loaded.some((url) => url.includes('quaternius_male_ranger'))).toBe(true);
    expect(loaded.some((url) => url.includes('quaternius_ual_standard'))).toBe(true);
    expect(loaded.some((url) => url.includes('sword_1handed'))).toBe(true);
    expect(loaded.some((url) => url.includes('shield_round'))).toBe(true);
  });

  it('loads the complete island-only Quaternius weapon slice', async () => {
    vi.resetModules();
    const { preloadQuaterniusWeaponAssets } = await import('../src/render/characters/assets');
    const { QUATERNIUS_WEAPON_MODEL_URLS } = await import(
      '../src/render/characters/quaternius_weapon_models_core'
    );

    await preloadQuaterniusWeaponAssets();
    const loaded = new Set(loadGltf.mock.calls.map(([url]) => String(url)));
    for (const url of QUATERNIUS_WEAPON_MODEL_URLS) expect(loaded, url).toContain(url);
  });

  it('loads the Meshy Titan sword and shield replacements', async () => {
    vi.resetModules();
    const { preloadMeshyTitanWeaponAssets } = await import('../src/render/characters/assets');
    const { MESHY_TITAN_WEAPON_MODEL_URLS } = await import(
      '../src/render/characters/meshy_titan_weapon_models_core'
    );

    await preloadMeshyTitanWeaponAssets();
    const loaded = new Set(loadGltf.mock.calls.map(([url]) => String(url)));
    for (const url of MESHY_TITAN_WEAPON_MODEL_URLS) expect(loaded, url).toContain(url);
  });

  it('rejects an unknown key without starting a load', async () => {
    vi.resetModules();
    const { preloadCharacterVisualAssets } = await import('../src/render/characters/assets');
    const before = loadGltf.mock.calls.length;

    await expect(preloadCharacterVisualAssets('missing_visual')).rejects.toThrow(
      "unknown character visual 'missing_visual'",
    );
    expect(loadGltf.mock.calls).toHaveLength(before);
  });

  it('keeps every multipart Quaternius outfit node through optimizedScene', async () => {
    vi.resetModules();
    const { characterAssetOptimizationInternalsForTest, preloadCharacterVisualAssets } =
      await import('../src/render/characters/assets');
    const { VISUALS } = await import('../src/render/characters/manifest');
    const key = 'player_quaternius_female_ranger';
    await preloadCharacterVisualAssets(key);

    const root = characterAssetOptimizationInternalsForTest.optimizedScene(VISUALS[key].url);
    const parts: THREE.SkinnedMesh[] = [];
    root.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) parts.push(object as THREE.SkinnedMesh);
    });
    expect(parts.map((part) => part.name)).toEqual(['outfit-a', 'outfit-b']);
    expect(mergeSkinnedParts).not.toHaveBeenCalled();
  });

  it('still applies the KayKit merge optimization to ordinary fixed creature bodies', async () => {
    vi.resetModules();
    const { characterAssetOptimizationInternalsForTest, preloadCharacterVisualAssets } =
      await import('../src/render/characters/assets');
    const { VISUALS } = await import('../src/render/characters/manifest');
    const key = 'mob_bandit';
    await preloadCharacterVisualAssets(key);

    const root = characterAssetOptimizationInternalsForTest.optimizedScene(VISUALS[key].url);
    const parts: THREE.SkinnedMesh[] = [];
    root.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) parts.push(object as THREE.SkinnedMesh);
    });
    expect(mergeSkinnedParts).toHaveBeenCalledOnce();
    expect(parts).toHaveLength(1);
  });
});
