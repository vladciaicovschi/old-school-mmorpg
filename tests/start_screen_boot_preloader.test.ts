import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('start screen boot preloader', () => {
  for (const entry of ['index.html', 'play.html']) {
    it(`${entry}: paints a critical overlay before the app module loads`, () => {
      const html = fs.readFileSync(entry, 'utf8');
      const head = html.slice(0, html.indexOf('</head>'));

      expect(html.match(/id="boot-preloader"/g)).toHaveLength(1);
      expect(head).toContain('#boot-preloader');
      expect(html.indexOf('id="boot-preloader"')).toBeLessThan(
        html.indexOf('<script type="module"'),
      );
    });
  }

  it('waits for locale, fonts, and the character preview with a bounded fallback', () => {
    const source = fs.readFileSync('src/main.ts', 'utf8');

    expect(source).toContain('const BOOT_PRELOADER_MAX_WAIT_MS = 15_000');
    expect(source).toContain('document.fonts?.ready');
    expect(source).toContain('Promise.all([localeReady, fontsReady, previewReady])');
    expect(source).toContain('revealStartScreenWhenReady(localeReady, previewReady)');
  });
});
