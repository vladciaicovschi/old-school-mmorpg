import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_CALIBRATION_TARGETS } from '../src/ui/equipment_calibration_core';

const io = vi.hoisted(() => ({ json: '', titan: '', writes: [] as string[] }));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) =>
      String(args[0]).endsWith('held_attachment_fit.generated.json')
        ? io.json
        : fs.readFileSync(...args),
    writeFileSync: (file: unknown, data: string) => {
      if (String(file).endsWith('held_attachment_fit.generated.json')) io.json = data;
      else if (String(file).endsWith('meshy_titan_equipment_fit.generated.ts')) io.titan = data;
      else throw new Error('Unexpected output file');
      io.writes.push(String(file));
    },
  };
});
type Middleware = (
  req: EventEmitter & { method: string },
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  },
) => void;
// Keep Vite's build-only config outside the client tsconfig import graph.
const { default: config } = await vi.importActual<{ default: { plugins: unknown[] } }>(
  '../vite.config',
);
let middleware: Middleware;
const plugin = (config as { plugins: unknown[] }).plugins.find(
  (entry) => (entry as { name?: string }).name === 'woc-equipment-calibration-save',
) as { configureServer(server: unknown): void };
plugin.configureServer({
  middlewares: {
    use: (route: string, callback: Middleware) => {
      if (route === '/__equipment_calibration/save') middleware = callback;
    },
  },
});

const transform = { position: [0.12, -0.23, 0.34], rotationDeg: [10, 20, -30], scale: 0.78 };
const transforms = () =>
  Object.fromEntries(
    EQUIPMENT_CALIBRATION_TARGETS.map((slot) => [slot, structuredClone(transform)]),
  );
function post(
  visualKey: string,
  options: { method?: string; version?: number; raw?: string } = {},
) {
  const req = Object.assign(new EventEmitter(), { method: options.method ?? 'POST' });
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  middleware(req, res);
  req.emit(
    'data',
    options.raw ??
      JSON.stringify({ version: options.version ?? 2, visualKey, transforms: transforms() }),
  );
  req.emit('end');
  return res;
}
beforeEach(() => {
  io.json = JSON.stringify({ player_warrior: { mainhand: { ...transform, scale: 0.5 } } });
  io.writes = [];
  io.titan = '';
});
describe('real equipment project-save middleware', () => {
  it('keeps Titan armor on its dedicated writer and saves only carry extras in JSON', () => {
    expect(post('player_meshy_titan').statusCode).toBe(200);
    expect(io.writes).toHaveLength(2);
    expect(io.titan).toContain('Armor_valor_Chest: {');
    expect(io.titan).toContain('scale: 0.78');
    const titan = JSON.parse(io.json).player_meshy_titan;
    expect(titan.mainhand).toBeUndefined();
    expect(titan.Armor_valor_Chest).toBeUndefined();
    expect(titan.mainhand_back).toEqual(transform);
  });
  it.each([
    'npc_dev_rogue_minion',
    'npc_dev_rogue_assassin',
    'npc_dev_skeleton_minion',
    'npc_dev_skeleton_warrior',
    'npc_dev_skeleton_cultist',
    'npc_dev_skeleton_acolyte',
    'npc_dev_kobold',
    'npc_dev_troll',
    'npc_dev_bone_golem',
    'npc_dev_meshy_murlok',
    'npc_dev_meshy_ogre',
    'npc_dev_skeleton_necromancer_v2',
    'npc_dev_skeleton_caster_v3',
    'npc_dev_skeleton_rogue_v3',
    'npc_dev_treant_v2',
  ])('saves %s to the fixed JSON destination without overwriting another body', (key) => {
    expect(post(key).statusCode).toBe(200);
    expect(io.writes).toHaveLength(1);
    const saved = JSON.parse(io.json);
    expect(saved[key].mainhand).toEqual(transform);
    expect(saved[key].offhand).toEqual(transform);
    expect(saved[key].mainhand_back).toEqual(transform);
    expect(saved.player_warrior.mainhand.scale).toBe(0.5);
  });
  it('rejects unknown identities, malformed or oversized payloads and non-POST requests', () => {
    for (const key of ['__proto__', 'constructor', '../anything', 'npc_dev_missing'])
      expect(post(key).statusCode).toBe(400);
    expect(post('npc_dev_meshy_ogre', { version: 1 }).statusCode).toBe(400);
    expect(post('npc_dev_meshy_ogre', { raw: '{broken' }).statusCode).toBe(400);
    expect(post('npc_dev_meshy_ogre', { raw: 'x'.repeat(64_001) }).statusCode).toBe(413);
    expect(post('npc_dev_meshy_ogre', { method: 'GET' }).statusCode).toBe(405);
    expect(io.writes).toEqual([]);
  });
});
