// Small layout corrections after measuring the enlarged walls and roof eaves.
const offsets: Readonly<Record<string, readonly [number, number]>> = {
  'eastbrook:craft-cottage': [-1.5, -1],
  'eastbrook:green-home': [4.5, 3],
  'eastbrook:lane-home': [-1.5, 0.5],
  'eastbrook:market-home': [-3, 2.5],
  'eastbrook:quay-cottage': [0, -5],
  'eastbrook:quay-smokehouse': [0, 2.5],
  'eastbrook:toolworks': [2, 1],
  'eastbrook:weaver-house': [0, -4.5],
  'gibbetmere:candle-home': [0, -1.5],
  'gullhaven:family-home': [-1, 3],
  'gullhaven:fisher-home': [-0.3, 0],
  'gullhaven:menders-hall': [1.5, 0],
  'wickharbor:h02': [0, 2],
  'wickharbor:h04': [2.5, 3],
  'wickharbor:h09': [5.5, -3.5],
  'wickharbor:h10': [-3.0, 0.5],
  'wickharbor:h12': [1.5, -1],
  'wickharbor:hall': [-1.5, 0],
  'wickharbor:inn': [0, -3.7],
  'wickharbor:market': [-2, 0],
  'wickharbor:warehouse': [3, 4],
  'wickharbor:workshop': [-2, 0],
};

export function architectureLotOffset(modelId: string, lotId: string): readonly [number, number] {
  const region = modelId.includes(':') ? modelId.split(':')[0] : 'wickharbor';
  return offsets[`${region}:${lotId}`] ?? [0, 0];
}

/** Leave a visible gap beside entrance stairs without changing the native meshes. */
export function architecturePropOffset(
  name: string,
  existing: readonly [number, number] = [0, 0],
): [number, number] {
  const dx = name === 'Bench' ? -0.3 : name === 'FarmCrate_Apple' ? 0.3 : 0;
  return [existing[0] + dx, existing[1]];
}
