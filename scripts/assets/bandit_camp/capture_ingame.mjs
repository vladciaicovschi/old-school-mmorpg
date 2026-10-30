// Local, actual-game acceptance capture; never touches an account or remote game.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PATH } from '../../browser_path.mjs';
import { enterOfflineGame } from '../../enter_offline_game.mjs';

const output = path.resolve(process.env.OUT_DIR ?? '../artifacts/bandit-game-import-qa');
await fs.mkdir(output, { recursive: true });
const profiles = process.env.PROFILE_NAME ? [process.env.PROFILE_NAME] : ['desktop', 'low'];
const results = [];
for (const profile of profiles) {
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--use-angle=d3d11', '--disable-dev-shm-usage'],
  });
  const errors = [],
    failedAssets = [],
    requests = new Set();
  try {
    const page = await browser.newPage({
      viewport: profile === 'low' ? { width: 844, height: 390 } : { width: 1440, height: 900 },
    });
    const entryPage = {
      evaluate: page.evaluate.bind(page),
      keyboard: page.keyboard,
      waitForSelector: (s, o = {}) =>
        page.waitForSelector(s, { timeout: o.timeout, state: o.visible ? 'visible' : 'attached' }),
      waitForFunction: (f, o = {}) => page.waitForFunction(f, undefined, o),
    };
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('BROWSER', message.text().slice(0, 800));
    });
    page.on('response', (r) => {
      if (r.url().includes('bandit_camp')) {
        requests.add(r.url());
        if (r.status() >= 400) failedAssets.push([r.url(), r.status()]);
      }
    });
    await page.addInitScript((low) => {
      localStorage.setItem(
        'woc_settings',
        JSON.stringify({ graphicsPreset: low ? 1 : 4, brightness: 1, renderScale: 1 }),
      );
      localStorage.setItem('woc_spawn_intro_seen:offline:warrior:CampScout', '1');
      localStorage.setItem(
        'woc_gpu_notice_dismissed',
        'discrete-inactive,hybrid,requested-backend,software',
      );
    }, profile === 'low');
    await page.goto(
      `${process.env.GAME_URL ?? 'http://127.0.0.1:5190'}/?gfx=${profile === 'low' ? 'low' : 'ultra'}`,
      { waitUntil: 'networkidle', timeout: 120000 },
    );
    const booted = await enterOfflineGame(entryPage, {
      charName: 'CampScout',
      settleMs: 1000,
      gameBootTimeoutMs: 300000,
    });
    if (!booted) {
      await page.screenshot({ path: path.join(output, `boot-${profile}.png`) });
      const state = await page.evaluate(() => ({
        text: document.body.innerText.slice(-10000),
        game: !!window.__game,
      }));
      console.log(JSON.stringify({ booted, errors, failedAssets, state }, null, 2));
    }
    assert(booted, 'game did not boot');
    // Hide only HUD chrome for the visual-review frames, keeping the live
    // world, camera, simulation and its actual cutaway renderer untouched.
    await page.addStyleTag({ content: '#ui, .nameplate { visibility: hidden !important; }' });
    for (const view of ['overview', 'leader']) {
      await page.evaluate(async (view) => {
        const game = window.__game;
        const { terrainHeight } = await import('/src/sim/world.ts');
        const sim = game.sim,
          p = sim.player;
        sim.setGm();
        p.devNoAggro = true;
        const x = view === 'overview' ? 119 : 117.5,
          z = view === 'overview' ? 44 : 62;
        p.pos.x = x;
        p.pos.z = z;
        p.pos.y = terrainHeight(x, z, sim.cfg.seed);
        Object.assign(p.prevPos, p.pos);
        p.hp = p.maxHp = 999999;
        const vector = (x, y, z) => game.renderer.camera.position.clone().set(x, y, z);
        const y = terrainHeight(117.5, 65.5, sim.cfg.seed);
        game.renderer.editorCam =
          view === 'overview'
            ? { pos: vector(147, 31, 22), target: vector(111, y + 1, 52) }
            : { pos: vector(125, y + 9, 54), target: vector(117.5, y + 2, 65.5) };
      }, view);
      await page.waitForFunction(
        () => {
          const roots = [];
          window.__game.renderer.scene.traverse((o) => {
            if (o.name?.startsWith('settlementItem:gorrak-camp:')) roots.push(o);
          });
          return ['quarters', 'leader', 'sentries'].every((id) =>
            roots.some((o) => o.name.endsWith(`:${id}`) && o.visible),
          );
        },
        undefined,
        { timeout: 120000 },
      );
      await new Promise((r) => setTimeout(r, 4000));
      // A teleport has its own prewarm curtain after world entry. Loaded roots
      // alone are not proof that a real game frame is ready to review.
      await page.waitForFunction(
        () => !document.querySelector('#loading-screen')?.classList.contains('visible'),
        undefined,
        { timeout: 240000 },
      );
      await new Promise((r) => setTimeout(r, 600));
      await page.evaluate(() => document.querySelector('button.tut-skip')?.click());
      const state = await page.evaluate(async () => {
        const { GFX } = await import('/src/render/gfx.ts');
        const game = window.__game,
          tents = [],
          items = [],
          parts = [],
          root = game.renderer.scene;
        root.traverse((o) => {
          if (o.name?.startsWith('settlementItem:gorrak-camp:'))
            tents.push({ name: o.name, visible: o.visible, children: o.children.length });
          if (o.userData.itemIds) items.push(...o.userData.itemIds);
          if (o.userData.cutawayPart)
            parts.push({ part: o.userData.cutawayPart, hidden: o.userData.cutawayHidden });
        });
        return {
          tier: GFX.tier,
          tents,
          items,
          cutawayParts: parts.length,
          hiddenCutawayParts: parts.filter((p) => p.hidden).length,
          player: { ...game.sim.player.pos },
          playerHp: game.sim.player.hp,
          camera: { ...game.renderer.camera.position },
          renderer: game.renderer.webgl.info.render,
        };
      });
      assert.equal(state.tents.length, 3);
      assert(state.playerHp > 0, 'capture player must remain alive');
      assert(state.items.includes('weapons') && state.items.includes('cook-tripod'));
      assert(state.cutawayParts > 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      assert.equal(failedAssets.length, 0);
      const screenshot = path.join(output, `game-${profile}-${view}.png`);
      await page.screenshot({ path: screenshot });
      results.push({
        profile,
        view,
        screenshot,
        state,
        errors,
        failedAssets,
        requestedCampAssets: [...requests],
      });
      await fs.writeFile(path.join(output, 'browser.json'), JSON.stringify(results, null, 2));
      console.log(
        `PASS ${profile} ${view}: ${state.tents.length} tents, ${state.cutawayParts} cutaway pieces`,
      );
    }
  } finally {
    await browser.close();
  }
}
