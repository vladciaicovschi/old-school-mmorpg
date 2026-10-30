import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELD_EQUIPMENT_FIT_VISUALS } from '../scripts/lib/equipment_fit_payload.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { VISUALS } from '../src/render/characters/manifest';

const CLASSES = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'mage',
  'shaman',
  'druid',
] as const;
// Native companions replace ground routing, not the original body/death assets.
const GROUND_PREFIX: Record<(typeof CLASSES)[number], string> = {
  warrior: 'WarriorT1_OneHand_',
  paladin: 'T1Paladin_',
  hunter: 'HunterT1_Crossbow_',
  rogue: 'Warrior_Travel',
  shaman: 'Warrior_Travel',
  mage: 'T1MageMotion_Travel',
  priest: 'T1PriestMotion_Travel',
  druid: 'T1DruidMotion_Travel',
};

describe('T1 Mixamo player imports', () => {
  it('shows the selected fixed T1 rig in character creation', () => {
    const main = fs.readFileSync('src/main.ts', 'utf8');
    const preview = main.match(/function previewClassBody\([\s\S]*?\n\}/)?.[0] ?? '';

    expect(preview).toContain('previewCharselectClassBody(cls);');
    const stage = main.match(/function previewCharselectClassBody\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(stage).toContain("presentation: 'charselect'");
    expect(stage).toContain('characterPreview?.setAppearance(');
    expect(preview).not.toContain('setModular(');
    expect(main).toContain("e.kind === 'player' ? null : npcLookFor(e.templateId, e.kind)");
  });

  it('uses the fixed T1 portrait and stage for every character-select row', () => {
    const main = fs.readFileSync('src/main.ts', 'utf8');
    const roster = main.match(/for \(const c of chars\) \{[\s\S]*?row\.innerHTML =/)?.[0] ?? '';
    const stage = main.match(/function showCharselectCharacter\([\s\S]*?\n\}/)?.[0] ?? '';

    expect(roster).toContain('portraitChipHtml({');
    expect(roster).not.toContain('look: charselectLook(c)');
    expect(stage).toContain('characterPreview.setAppearance(charselectAppearance(c));');
    expect(stage).not.toContain('setModular(');
  });

  it.each(CLASSES)('makes %s available to the saved weapon-fitting studio', (playerClass) => {
    const studio = fs.readFileSync('src/ui/weapon_fit_studio.ts', 'utf8');
    const manifest = fs.readFileSync('src/render/characters/manifest.ts', 'utf8');
    const vite = fs.readFileSync('vite.config.ts', 'utf8');
    const key = `player_${playerClass}`;

    expect(studio.includes(`visualKey: '${key}'`)).toBe(true);
    expect(manifest).toContain(`heldAttachmentFit: HELD_ATTACHMENT_FITS.${key}`);
    expect(HELD_EQUIPMENT_FIT_VISUALS).toContain(key);
    expect(vite.includes('new Set(HELD_EQUIPMENT_FIT_VISUALS.filter')).toBe(true);
  });

  it.each(CLASSES)('%s keeps source PBR maps and a complete gameplay baseline', (playerClass) => {
    const prefix = `T1${playerClass[0].toUpperCase()}${playerClass.slice(1)}`;
    const url = `models/chars/players/t1_${playerClass}.glb`;
    const bytes = fs.readFileSync(`public/${url}`);
    const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = glb.animations.map((animation: { name: string }) => animation.name);
    const visual = VISUALS[`player_${playerClass}`];

    expect(visual).toMatchObject({
      url,
      preserveSkinnedParts: true,
      attachmentRig: 'mixamo_standard',
      clips: {
        idle: `${GROUND_PREFIX[playerClass]}Idle`,
        walk: `${GROUND_PREFIX[playerClass]}Walk`,
        run: `${GROUND_PREFIX[playerClass]}Run`,
        death: `${prefix}_Death`,
      },
    });
    const manifest = fs.readFileSync('src/render/characters/manifest.ts', 'utf8');
    expect(manifest).toContain(`heldAttachmentFit: HELD_ATTACHMENT_FITS.player_${playerClass}`);
    expect(names).toEqual(
      expect.arrayContaining([
        `${prefix}_Idle`,
        `${prefix}_Walk`,
        `${prefix}_Run`,
        `${prefix}_Attack`,
        `${prefix}_Death`,
      ]),
    );
    expect(glb.meshes).toHaveLength(1);
    expect(glb.skins).toHaveLength(1);
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(3);
    for (const image of glb.images) expect(image.mimeType).toBe('image/ktx2');
    expect(MEDIA_ASSETS).toHaveProperty(url);
  });
});
