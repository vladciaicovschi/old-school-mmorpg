// One batch of the large-scale animation authoring initiative (issue #2889):
// warlock ability-specific spellcasts + the nightkin family's bespoke attack.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';

const ROOT = join(__dirname, '..');

function glbDocument(glbPath: string): {
  animations?: { name?: string }[];
  meshes?: unknown[];
} {
  const glb = readFileSync(join(ROOT, glbPath));
  const jsonLen = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
}

function clipNamesOf(glbPath: string): string[] {
  const doc = glbDocument(glbPath);
  return (doc.animations ?? [])
    .map((a: { name?: string }) => a.name)
    .filter((name): name is string => name !== undefined);
}

function meshCountOf(glbPath: string): number {
  return (glbDocument(glbPath).meshes ?? []).length;
}

const MANIFEST_SRC = readFileSync(join(ROOT, 'src/render/characters/manifest.ts'), 'utf8');

function manifestBlock(startAnchor: string, endAnchor: string): string {
  const start = MANIFEST_SRC.indexOf(startAnchor);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  const end = MANIFEST_SRC.indexOf(endAnchor, start);
  expect(end, `${startAnchor} .. ${endAnchor}`).toBeGreaterThan(start);
  return MANIFEST_SRC.slice(start, end);
}

describe('warlock ability-specific spellcasts (issue #2889)', () => {
  const WARLOCK_CAST_LOOPS = [
    'WarlockT1_CastShadow_Loop',
    'WarlockT1_CastFire_Loop',
    'WarlockT1_CastDrain_Loop',
    'WarlockT1_CastSelf_Loop',
    'WarlockT1_CastAlly_Loop',
  ];
  const WARLOCK_CAST_RELEASES = [
    'WarlockT1_CastShadow_Release',
    'WarlockT1_CastFire_Release',
    'WarlockT1_CastDrain_Release',
    'WarlockT1_CastSelf_Release',
    'WarlockT1_CastAlly_Release',
  ];

  it('ships mesh-free loop/release casts baked from the warlock T1 rig', () => {
    const glbPath = 'public/models/chars/players/warlock_ability_anims.glb';
    expect(clipNamesOf(glbPath)).toEqual(
      expect.arrayContaining([
        ...WARLOCK_CAST_LOOPS,
        ...WARLOCK_CAST_RELEASES,
        'WarlockT1_JumpClassic',
      ]),
    );
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('fits the full casting gesture to the cast clock and releases through attackByAbility', () => {
    const block = manifestBlock('player_warlock: swims({', 'player_druid: swims({');
    expect(block).toContain('warlock_ability_anims.glb');
    expect(block).not.toContain('castHoldPointByAbility');
    expect(block).toContain('castDurationFit:');
    expect(block).toContain("jump: 'WarlockT1_JumpClassic'");
    expect(block).toContain('attackByAbility');
    for (const clip of [...WARLOCK_CAST_LOOPS, ...WARLOCK_CAST_RELEASES]) {
      expect(block).toContain(`'${clip}'`);
    }
  });

  it('every mapped ability id is a real warlock ability, and every referenced clip is shipped', () => {
    const warlockBlock = manifestBlock('player_warlock: swims({', 'player_druid: swims({');
    const abilityStart = warlockBlock.indexOf('attackByAbility: {');
    expect(abilityStart).toBeGreaterThanOrEqual(0);
    const abilityEnd = warlockBlock.indexOf('\n      },', abilityStart);
    expect(abilityEnd).toBeGreaterThan(abilityStart);
    const block = warlockBlock.slice(abilityStart, abilityEnd);
    const rows = [...block.matchAll(/^\s*([a-z_]+): '([A-Za-z0-9_]+)',$/gm)];
    expect(rows.length).toBe(12); // catches a wholesale accidental deletion
    for (const [, abilityId, clip] of rows) {
      const ability = ABILITIES[abilityId];
      expect(ability, `attackByAbility key '${abilityId}' is not a real ability id`).toBeTruthy();
      expect(ability?.class, `attackByAbility key '${abilityId}' is not a warlock ability`).toBe(
        'warlock',
      );
      expect(
        WARLOCK_CAST_RELEASES,
        `attackByAbility value '${clip}' for '${abilityId}' is not a shipped clip`,
      ).toContain(clip);
    }
    // Every non-pet warlock ability is mapped; the pet-summon channels
    // (summon_imp/voidwalker/succubus/felhunter/felguard/infernal/doomguard)
    // have no combat swing and stay unmapped.
    const map = Object.fromEntries(rows.map(([, id, clip]) => [id, clip]));
    expect(map.shadow_bolt).toBe('WarlockT1_CastShadow_Release');
    expect(map.corruption).toBe('WarlockT1_CastShadow_Release');
    expect(map.curse_of_agony).toBe('WarlockT1_CastShadow_Release');
    expect(map.immolate).toBe('WarlockT1_CastFire_Release');
    expect(map.searing_pain).toBe('WarlockT1_CastFire_Release');
    expect(map.rain_of_fire).toBe('WarlockT1_CastFire_Release');
    expect(map.drain_life).toBe('WarlockT1_CastDrain_Release');
    expect(map.shadowburn).toBe('WarlockT1_CastShadow_Release');
    expect(map.fear).toBe('WarlockT1_CastShadow_Release');
    expect(map.life_tap).toBe('WarlockT1_CastSelf_Release');
    expect(map.demon_skin).toBe('WarlockT1_CastSelf_Release');
    expect(map.spell_lock).toBe('WarlockT1_CastShadow_Release');
    // The seven pet-summon abilities stay on the default wand zap.
    for (const petAbility of [
      'summon_imp',
      'summon_voidwalker',
      'summon_succubus',
      'summon_felhunter',
      'summon_felguard',
      'summon_infernal',
      'summon_doomguard',
    ]) {
      expect(
        map[petAbility],
        `${petAbility} should not have an authored cast clip`,
      ).toBeUndefined();
    }
  });
});

describe('nightkin family bespoke attack (issue #2889)', () => {
  it('ships Nightkin_Attack in a mesh-free donor GLB', () => {
    const glbPath = 'public/models/creatures/nightkin_ability_anims.glb';
    expect(clipNamesOf(glbPath)).toEqual(['Nightkin_Attack']);
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('gives mob_nightkin its own ClipMap instead of mutating the shared FLOATING constant', () => {
    const nightkinBlock = manifestBlock('mob_nightkin: {', 'mob_ghost: {');
    expect(nightkinBlock).toContain('nightkin_ability_anims.glb');
    expect(nightkinBlock).toContain('clips: NIGHTKIN_FLOATING');
    expect(nightkinBlock).not.toContain('clips: FLOATING,');

    // FLOATING itself (the constant definition, not a VisualDef using it) must
    // still read the original shared attack: every other family sharing it by
    // reference must be untouched by this change.
    const floatingConstBlock = manifestBlock('const FLOATING: ClipMap = {', '};');
    expect(floatingConstBlock).toContain("attack: ['Headbutt', 'Punch']");

    // Every other VisualDef still pointing at the shared constant is untouched
    // by THIS migration. The ghost family's own follow-up migration to
    // GHOST_FLOATING (tests/anim_pipeline_hunter_ghost.test.ts), the round-2
    // glub migration (tests/anim_pipeline_glub.test.ts), the dragonkin
    // family's own follow-up migration to DRAGONKIN_FLOATING
    // (tests/anim_pipeline_druid_dragonkin.test.ts), and the flying demon's
    // own migration to DEMON_FLYING_FLOATING
    // (tests/anim_pipeline_shaman_demonflying.test.ts) also land on this
    // branch, leaving exactly 3 remaining direct `clips: FLOATING,` usages
    // (other batches migrating other members land as separate PRs).
    const remaining = [...MANIFEST_SRC.matchAll(/clips: FLOATING,/g)].length;
    expect(remaining).toBe(3);
  });
});
