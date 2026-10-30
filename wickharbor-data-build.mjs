import { readFile, writeFile } from 'node:fs/promises';
import { LOTS, ROADS, FIXED } from '../artifacts/eastbrook-megakit-study/wickharbor/layout.mjs';
import { modelForLot } from '../artifacts/eastbrook-megakit-study/wickharbor/village-models.mjs';
const study = new URL('../artifacts/eastbrook-megakit-study/', import.meta.url);
const ids = [...new Set(LOTS.map(modelForLot)), 'lighthouse-round'];
const metadata = {};
for (const id of ids) {
  const file = /^(civic-|yard-|fixture-|entrance-)/.test(id) ? `wickharbor/${id}.glb` : `${id}.glb`;
  const bytes = await readFile(new URL(file, study));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const extras = gltf.scenes[0].extras ?? {};
  metadata[id] = Object.fromEntries(Object.entries(extras).filter(([key]) => ['footprint', 'entrance', 'foundationTop', 'foundationPad', 'additionalFoundations', 'bellTower', 'walkColliders', 'interior', 'staircase', 'openAirMarket', 'openWorkArea', 'terrainProps'].includes(key)));
}
await writeFile(new URL('src/sim/wickharbor_data.json', import.meta.url), JSON.stringify({
  source: 'Approved Quaternius Wickharbor assembly, 2026-10-20',
  lots: LOTS.map(({ id, kind, x, z, w, d, front, rot, yard }) => ({ id, kind, x, z, w, d, front, rot, yard, modelId: modelForLot({ id, kind }) })),
  roads: ROADS.map(({id,width,points}) => ({id,width,points})),
  fixtures: FIXED.map(({id,x,z,r,type}) => ({id,x,z,r,type})), metadata,
}, null, 2) + '\n');
