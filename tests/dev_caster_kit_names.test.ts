import { afterEach, describe, expect, it } from 'vitest';
import { DEV_CASTER_KITS } from '../src/sim/content/dev_caster_kits';
import { abilityDisplayNameFromSource } from '../src/ui/ability_display_name';
import { ensureLocaleLoaded, getLanguage, setLanguage } from '../src/ui/i18n';
import { localizeSimAuraName } from '../src/ui/sim_i18n';

const previousLanguage = getLanguage();
afterEach(() => setLanguage(previousLanguage));

describe('lab caster kit display names', () => {
  it('routes every reused utility and bolt through existing localized names', async () => {
    await ensureLocaleLoaded('es_ES');
    setLanguage('es_ES');
    for (const kit of Object.values(DEV_CASTER_KITS)) {
      const utilityName =
        'hex' in kit
          ? kit.hex.name
          : 'vulnerability' in kit
            ? kit.vulnerability.name
            : 'manaBurn' in kit
              ? kit.manaBurn.name
              : kit.spellReflect.name;
      expect(localizeSimAuraName(utilityName)).not.toBeNull();
      expect(abilityDisplayNameFromSource(utilityName)).not.toBe(utilityName);
      expect(abilityDisplayNameFromSource(kit.petSpell.name)).not.toBe(kit.petSpell.name);
    }
  });
});
