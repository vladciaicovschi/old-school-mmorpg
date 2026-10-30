import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbilityVfxFx } from '../src/render/ability_vfx/fx';
import { abilityVfxTextures } from '../src/render/ability_vfx/fx_textures';
import { GroundAuras } from '../src/render/ability_vfx/ground_auras';
import { OverlaySprites } from '../src/render/ability_vfx/overlay_sprites';
import { AbilityVfxRibbons } from '../src/render/ability_vfx/ribbons';
import { ABILITY_VFX_FULL_SPECS } from '../src/render/ability_vfx_full_specs';
import { abilityVfxFullSpec } from '../src/render/ability_vfx_registry';
import { createVfxAnchor } from '../src/render/vfx_anchor';

// The steady-state combat cost of the ability-VFX subsystem: anchors resolved
// every frame must not allocate, and the two immediate-mode buffers must upload
// only the prefix the frame wrote instead of their whole worst-case capacity.
// Both are driven through the REAL classes here (not a stub), because the
// regression these guard against is a call site quietly dropping its scratch or
// its update range, which only shows up when the live update() walk runs.

const FIREBALL_SPEC = ABILITY_VFX_FULL_SPECS.fireball;

function installCanvasStub(): void {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const context = {
    arc: noop,
    beginPath: noop,
    clip: noop,
    closePath: noop,
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    ellipse: noop,
    fill: noop,
    fillRect: noop,
    lineTo: noop,
    moveTo: noop,
    putImageData: noop,
    rect: noop,
    restore: noop,
    rotate: noop,
    save: noop,
    scale: noop,
    stroke: noop,
    translate: noop,
  };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  });
}

/** The renderer's real anchor, wrapped to record how each resolve was made. */
function countingAnchor(heightById: (id: number) => number | null) {
  const counts = { withScratch: 0, allocating: 0 };
  const base = createVfxAnchor((id, pose) => {
    const height = heightById(id);
    if (height === null) return false;
    pose.x = id * 2;
    pose.y = 0;
    pose.z = -5;
    pose.height = height;
    return true;
  });
  const anchor = (id: number, frac: number, out?: THREE.Vector3) => {
    if (out) counts.withScratch++;
    else counts.allocating++;
    return base(id, frac, out);
  };
  return { anchor, counts };
}

function rangeOf(attr: THREE.BufferAttribute): { start: number; count: number } | null {
  const ranges = attr.updateRanges;
  return ranges.length === 1 ? { start: ranges[0].start, count: ranges[0].count } : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ability VFX steady-state frame cost', () => {
  it('keeps Hunter arrow ribbons thin for entity and ground targets without shrinking comets', () => {
    installCanvasStub();
    const { anchor } = countingAnchor(() => 2);
    const fx = new AbilityVfxFx(new THREE.Scene(), new THREE.PerspectiveCamera(), anchor, () => 0);
    const entity = vi.spyOn(AbilityVfxRibbons.prototype, 'spawnTrailStyled');
    const ground = vi.spyOn(AbilityVfxRibbons.prototype, 'spawnTrailStyledTo');
    const arrow = abilityVfxFullSpec('arcane_shot');
    if (!arrow) throw new Error('Hunter projectile spec missing');
    const comet = { ...arrow, bolt: { ...arrow.bolt, style: 'comet' as const } };
    try {
      fx.sequenceBolt('arcane_shot', arrow, 1, 2, 0xffffff, 0.16, 0);
      expect(entity.mock.calls[0][3]).toBeCloseTo(0.08, 6);
      fx.sequenceBolt('arcane_shot', comet, 1, 2, 0xffffff, 0.16, 0);
      expect(entity.mock.calls[1][3]).toBeCloseTo(0.32, 6);
      fx.sequenceBoltAt('arcane_shot', arrow, 1, 10, 20, 0xffffff, 0.16, 0);
      expect(ground.mock.calls[0][5]).toBeCloseTo(0.08, 6);
      fx.sequenceBoltAt('arcane_shot', comet, 1, 10, 20, 0xffffff, 0.16, 0);
      expect(ground.mock.calls[1][5]).toBeCloseTo(0.32, 6);
    } finally {
      entity.mockRestore();
      ground.mockRestore();
      fx.dispose();
    }
  });
  it('draws hand preparation only for a refreshed live cast, never at release or after disposal', () => {
    installCanvasStub();
    const handGlow = vi.fn().mockReturnValue(true);
    const fx = new AbilityVfxFx(
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      createVfxAnchor((_id, pose) => {
        pose.height = 2;
        return true;
      }),
      () => 0,
      undefined,
      handGlow,
    );
    fx.windup(7, 0x6622cc, 0.5, 'orb', false, 1, 0xddbbff);
    fx.update(1 / 60, true);
    expect(handGlow).toHaveBeenCalledTimes(1);
    expect(handGlow.mock.calls[0].slice(0, 4)).toEqual([7, 0x6622cc, 0xddbbff, 0.5]);
    // Completion, interruption and death stop refreshing the windup stamp.
    fx.update(1 / 60);
    expect(handGlow).toHaveBeenCalledTimes(1);
    fx.windup(7, 0xff6600, 0.1);
    fx.update(1 / 60);
    expect(handGlow).toHaveBeenCalledTimes(2);
    fx.dispose();
    fx.windup(7, 1, 1);
    fx.update(1 / 60);
    expect(handGlow).toHaveBeenCalledTimes(2);
  });

  it('resolves every per-frame anchor into a scratch vector, allocating none', () => {
    installCanvasStub();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const { anchor, counts } = countingAnchor(() => 2);
    const fx = new AbilityVfxFx(new THREE.Scene(), camera, anchor, () => 0);
    fx.setDelegates(vi.fn(), vi.fn(), vi.fn(), vi.fn());

    // The held families are frame-stamped, so the painter re-holds them every
    // frame: mirror that, or the pools sweep themselves and the walk goes quiet.
    const holdHeldFamilies = () => {
      for (const id of [7, 8]) {
        fx.windup(id, 0xff0000, 0.5, 'runes');
        fx.orbit(id, 'runes', 0x00ff00);
        fx.holdShell(id, 0x0000ff);
        fx.holdGroundAura(id, 0, 0x00ffff, true);
        fx.holdCcBand(id, 'stun', 3);
      }
    };
    holdHeldFamilies();
    // travelling ribbons (both anchored ends) and a live sequence, whose
    // per-frame transients (the release flash) anchor the caster every frame
    fx.cometTrail(7, 8, 0xffff00, 0.2, false);
    fx.jaggedBolt(7, 8, 0xffffff);
    fx.sequenceInstant('fireball', FIREBALL_SPEC, 7, 8, 0xff8800, 0);

    fx.update(1 / 60);
    counts.withScratch = 0;
    counts.allocating = 0;
    // three more frames of the same live state: the steady state is what costs
    for (let i = 0; i < 3; i++) {
      holdHeldFamilies();
      fx.update(1 / 60);
    }

    expect(counts.withScratch).toBeGreaterThan(20);
    expect(counts.allocating).toBe(0);
  });

  it('drops a per-frame anchor cleanly when the entity loses its view', () => {
    installCanvasStub();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    const alive = new Set([7, 8]);
    const { anchor, counts } = countingAnchor((id) => (alive.has(id) ? 2 : null));
    const fx = new AbilityVfxFx(new THREE.Scene(), camera, anchor, () => 0);
    fx.setDelegates(vi.fn(), vi.fn(), vi.fn(), vi.fn());
    fx.holdShell(8, 0x0000ff);
    fx.holdGroundAura(8, 0, 0x00ffff, true);
    fx.update(1 / 60);
    expect(fx.groundAuraCountOf(8)).toBe(1);

    alive.delete(8);
    fx.update(1 / 60);
    // the null reading releases the pools rather than drawing at a stale point
    expect(fx.groundAuraCountOf(8)).toBe(0);
    expect(counts.allocating).toBe(0);
  });

  it('stops re-draping a standing wearer once, instead of chasing the breath', () => {
    installCanvasStub();
    const auras = new GroundAuras(new THREE.Scene(), abilityVfxTextures());
    let samples = 0;
    const groundY = () => {
      samples++;
      return 0;
    };
    const { anchor } = countingAnchor(() => 2);
    auras.hold(7, 0, 0x00ffff, true, 0);
    // Four seconds of a perfectly still wearer: more than a full breath cycle
    // (0.4 Hz), which used to cross the old absolute scale threshold several
    // times a second and re-drape all 42 vertices each time.
    let settledFrom = 0;
    for (let frame = 1; frame <= 240; frame++) {
      auras.hold(7, 0, 0x00ffff, true, frame);
      auras.update(1 / 60, frame / 60, frame, anchor, groundY, 0, 0);
      if (frame === 120) settledFrom = samples;
    }
    // the disc drapes while it grows in, then settles: the whole second half is
    // one center-height read per frame and not a single vertex resample
    expect(samples - settledFrom).toBe(120);
    // 3 drapes in all, every one of them inside the 0.4s grow-in, at the full
    // 42 vertices (this disc is 15 yards from the camera, inside the exact band)
    expect(samples).toBe(240 + 3 * 42);

    // ...and real movement still re-drapes: the terrain under the disc changed
    let moved = 0;
    const movingAnchor = (id: number, frac: number, out?: THREE.Vector3) => {
      const at = anchor(id, frac, out);
      if (at) at.x += moved;
      return at;
    };
    const before = samples;
    for (let frame = 241; frame <= 250; frame++) {
      moved += 0.4;
      auras.hold(7, 0, 0x00ffff, true, frame);
      auras.update(1 / 60, frame / 60, frame, movingAnchor, groundY, 0, 0);
    }
    expect(samples - before).toBeGreaterThan(100);
  });

  it('uploads only the ribbon prefix the frame wrote', () => {
    installCanvasStub();
    const { anchor } = countingAnchor(() => 2);
    const scene = new THREE.Scene();
    const ribbons = new AbilityVfxRibbons(scene, anchor, abilityVfxTextures());
    const geo = (ribbons as unknown as { geo: THREE.BufferGeometry }).geo;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.aCol as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const index = geo.index as THREE.BufferAttribute;

    ribbons.spawnBoltPoints(0, 0, 0, 4, 0, 0, 0xffffff, 0.5, 0.1, 1);
    ribbons.update(1 / 60, new THREE.Vector3(0, 2, 8));

    const drawn = geo.drawRange.count;
    expect(drawn).toBeGreaterThan(0);
    // the strip is two vertices per point, and the index prefix IS the draw range
    const verts = (rangeOf(pos)?.count ?? 0) / 3;
    expect(verts).toBeGreaterThan(0);
    expect(rangeOf(pos)).toEqual({ start: 0, count: verts * 3 });
    expect(rangeOf(col)).toEqual({ start: 0, count: verts * 3 });
    expect(rangeOf(uv)).toEqual({ start: 0, count: verts * 2 });
    expect(rangeOf(index)).toEqual({ start: 0, count: drawn });
    // and that prefix is a small fraction of the worst-case buffers it lives in
    expect(verts * 3).toBeLessThan(pos.array.length / 4);

    // a second frame REPLACES the range instead of stacking one per frame
    ribbons.update(1 / 60, new THREE.Vector3(0, 2, 8));
    expect(pos.updateRanges.length).toBe(1);
    expect(index.updateRanges.length).toBe(1);
  });

  it('uploads only the overlay sprites the frame pushed', () => {
    installCanvasStub();
    const overlay = new OverlaySprites(new THREE.Scene(), abilityVfxTextures());
    const geo = (overlay as unknown as { geo: THREE.BufferGeometry }).geo;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const size = geo.attributes.aSize as THREE.BufferAttribute;
    const capacity = pos.array.length / 3;

    overlay.beginFrame();
    for (let i = 0; i < 3; i++) overlay.push(i, 1, 0, 0xffffff, 0.3, 0, 1);
    overlay.commit();
    expect(geo.drawRange.count).toBe(3);
    expect(rangeOf(pos)).toEqual({ start: 0, count: 9 });
    expect(rangeOf(size)).toEqual({ start: 0, count: 3 });
    expect(capacity).toBeGreaterThan(3);

    // a busier frame widens the range; a quieter one narrows it back
    overlay.beginFrame();
    for (let i = 0; i < 40; i++) overlay.push(i, 1, 0, 0xffffff, 0.3, 0, 1);
    overlay.commit();
    expect(rangeOf(pos)).toEqual({ start: 0, count: 120 });
    overlay.beginFrame();
    overlay.push(0, 1, 0, 0xffffff, 0.3, 0, 1);
    overlay.commit();
    expect(rangeOf(pos)).toEqual({ start: 0, count: 3 });
    expect(pos.updateRanges.length).toBe(1);
  });
});
