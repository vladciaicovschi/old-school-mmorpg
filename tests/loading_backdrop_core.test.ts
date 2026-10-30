import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { LOADING_BACKDROP_PATHS, selectLoadingBackdropPath } from '../src/ui/loading_backdrop_core';

describe('loading backdrop selection', () => {
  it('ships the maintainer-selected optimized artwork exactly once', () => {
    expect(LOADING_BACKDROP_PATHS).toEqual([
      '/textures/loading/hollow-crypt-empty.webp',
      '/textures/loading/crystal-delve.webp',
      '/textures/loading/duskmoor-eclipse.webp',
      '/textures/loading/thornpeak-storm.webp',
      '/textures/loading/eastbrook-mine-duel.webp',
      '/textures/loading/veiled-hollow-stag.webp',
      '/textures/loading/hollow-crypt-party.webp',
      '/textures/loading/eastbrook-square.webp',
      '/textures/loading/drakemaw-caldera.webp',
      '/textures/loading/fenbridge-march.webp',
      '/textures/loading/fenbridge-rain-skiff.webp',
    ]);
    expect(new Set(LOADING_BACKDROP_PATHS).size).toBe(LOADING_BACKDROP_PATHS.length);

    for (const logicalPath of LOADING_BACKDROP_PATHS) {
      const diskPath = join(process.cwd(), 'public', logicalPath);
      expect(existsSync(diskPath), logicalPath).toBe(true);
      expect(
        statSync(diskPath).size,
        `${logicalPath} should stay under 300 KB`,
      ).toBeLessThanOrEqual(300_000);
    }
  });

  it('pins the catalog against the shipped directory and the media manifest, both ways', () => {
    // The reverse of the existence pin above: an orphan file committed under
    // public/textures/loading/ that no rotation can ever reach fails here.
    const loadingDir = join(process.cwd(), 'public', 'textures', 'loading');
    const onDisk = readdirSync(loadingDir).filter((name) => !name.startsWith('.'));
    expect(new Set(onDisk)).toEqual(
      new Set(LOADING_BACKDROP_PATHS.map((logicalPath) => logicalPath.split('/').at(-1))),
    );

    // assetUrl falls back to the raw path on a manifest miss, so a backdrop
    // absent from MEDIA_ASSETS would 404 in production while the disk pins
    // above stay green: assert each path resolves to a content-hashed url.
    for (const logicalPath of LOADING_BACKDROP_PATHS) {
      const manifestKey = logicalPath.replace(/^\/+/, '');
      expect(MEDIA_ASSETS[manifestKey], manifestKey).toMatch(
        /^\/media\/textures\/loading\/[^/]+\.webp$/,
      );
      const hash = createHash('sha256')
        .update(readFileSync(join(process.cwd(), 'public', logicalPath)))
        .digest('hex')
        .slice(0, 12);
      expect(MEDIA_ASSETS[manifestKey], `${manifestKey} must not serve stale artwork`).toBe(
        `/media/${manifestKey.replace(/\.webp$/, `.${hash}.webp`)}`,
      );
    }
  });

  it('keeps the repainted backgrounds decodable, opaque, correctly sized and distinct', async () => {
    const hashes = new Set<string>();
    for (const logicalPath of LOADING_BACKDROP_PATHS) {
      const bytes = readFileSync(join(process.cwd(), 'public', logicalPath));
      const metadata = await sharp(bytes).metadata();
      expect(metadata, logicalPath).toMatchObject({
        format: 'webp',
        width: 1600,
        height: 900,
        space: 'srgb',
        hasAlpha: false,
      });
      await sharp(bytes).raw().toBuffer();
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(hashes.size).toBe(LOADING_BACKDROP_PATHS.length);

    // The guide and server-unavailable page still reference this raw legacy URL.
    const legacy = readFileSync(join(process.cwd(), 'public', 'loading-screen.jpg'));
    expect(await sharp(legacy).metadata()).toMatchObject({
      format: 'jpeg',
      width: 1538,
      height: 1023,
      space: 'srgb',
      hasAlpha: false,
    });
    expect(legacy.length).toBeLessThanOrEqual(600_000);
    await sharp(legacy).raw().toBuffer();
  });

  it('maps the random-unit boundaries safely', () => {
    expect(selectLoadingBackdropPath(0)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(0.999_999)).toBe(LOADING_BACKDROP_PATHS.at(-1));
    expect(selectLoadingBackdropPath(-1)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(1)).toBe(LOADING_BACKDROP_PATHS.at(-1));
    expect(selectLoadingBackdropPath(Number.NaN)).toBe(LOADING_BACKDROP_PATHS[0]);
    expect(selectLoadingBackdropPath(Number.POSITIVE_INFINITY)).toBe(LOADING_BACKDROP_PATHS[0]);
  });

  it('reaches every alternative without repeating any previous backdrop', () => {
    const selectableCount = LOADING_BACKDROP_PATHS.length - 1;

    for (const previousPath of LOADING_BACKDROP_PATHS) {
      const reached = new Set<string>();
      for (let bucket = 0; bucket < selectableCount; bucket++) {
        const randomUnit = (bucket + 0.5) / selectableCount;
        const selected = selectLoadingBackdropPath(randomUnit, previousPath);
        expect(selected).not.toBe(previousPath);
        reached.add(selected);
      }

      expect(reached).toEqual(new Set(LOADING_BACKDROP_PATHS.filter((p) => p !== previousPath)));
    }
  });
});
