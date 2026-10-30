import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildingContainsPoint } from '../src/sim/building_layout';
import {
  colliderInternalsForTest,
  isBlocked,
  lineOfSightClear,
  pathCrossesFence,
} from '../src/sim/colliders';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { STATION_RADIUS, STATIONS } from '../src/sim/content/professions';
import { FURY_ENTITY_ID, FURY_NPC_ID } from '../src/sim/content/pvp_honor';
import { ZONE1_CAMPS, ZONE1_NPCS, ZONE1_PROPS, ZONE1_ROADS } from '../src/sim/content/zone1';
import { BUILTIN_WORLD, CAMPS, PLAYER_START, setActiveWorldContent } from '../src/sim/data';
import {
  EASTBROOK_LAYOUT,
  EASTBROOK_NPC_PLACEMENTS_BY_ID,
  EASTBROOK_STATIONS_BY_ID,
  localToWorld,
} from '../src/sim/eastbrook_layout';
import {
  findPath,
  PLAYER_BODY_RADIUS,
  PLAYER_MAX_CLIMB_SLOPE,
  PLAYER_SWIM_DEPTH,
} from '../src/sim/pathfind';
import { petOf, setPetMode, summonPet } from '../src/sim/pet/pet_commands';
import {
  type CharacterMoveResult,
  floorHeightAt,
  MAX_STEP_HEIGHT,
  moveCharacter,
} from '../src/sim/physics';
import { isSwimming, swimSurfaceY } from '../src/sim/player_motion';
import { isAtStation } from '../src/sim/professions/stations';
import { isResting } from '../src/sim/progression/xp';
import {
  SETTLEMENTS,
  settlementItemPlacement,
  settlementPlans,
} from '../src/sim/settlements_layout';
import { Sim } from '../src/sim/sim';
import { dist2d, type Entity, INTERACT_RANGE, type NpcDef } from '../src/sim/types';
import { localPoint } from '../src/sim/wickharbor_layout';
import { groundHeight, terrainHeight, waterLevelAt } from '../src/sim/world';

const SEED = 20061;
const approved = SETTLEMENTS.find((s) => s.id === 'eastbrook')!;
const approvedPlans = settlementPlans((x, z) => terrainHeight(x, z, SEED)).filter(
  (p) => p.settlement.id === 'eastbrook',
);
const boardDef = NOTICEBOARDS.find((p) => p.id === EASTBROOK_LAYOUT.services.noticeboard.id)!;
const mailboxDef = MAILBOXES[0];
function entranceFoot(plan: (typeof approvedPlans)[number]) {
  const p = plan.placement;
  return localPoint(plan.lot, (p.landing.minX + p.landing.maxX) / 2, p.approach.maxZ + 0.8);
}
const ZONE1_TOWN_NPC_IDS = EASTBROOK_LAYOUT.services.npcs
  .map((npc) => npc.id)
  .filter((id) => id in ZONE1_NPCS);

afterEach(() => setActiveWorldContent(null));

function npcEntity(sim: Sim, templateId: string): Entity {
  const entity = [...sim.entities.values()].find(
    (candidate) => candidate.kind === 'npc' && candidate.templateId === templateId,
  );
  if (!entity) throw new Error(`missing NPC entity ${templateId}`);
  return entity;
}

function standAt(sim: Sim, pid: number, target: { x: number; z: number }): Entity {
  const player = sim.entities.get(pid);
  if (!player) throw new Error(`missing player ${pid}`);
  player.pos = sim.groundPos(target.x, target.z);
  player.prevPos = { ...player.pos };
  sim.rebucket(player);
  return player;
}

function stableTownNpcPayload(): Record<string, Omit<NpcDef, 'pos' | 'facing'> | NpcDef> {
  return Object.fromEntries(
    Object.entries(ZONE1_NPCS).map(([id, def]) => {
      if (def.dynamic) return [id, def];
      const { pos: _pos, facing: _facing, ...stable } = def;
      return [id, stable];
    }),
  );
}

function standingBody(point: { x: number; z: number }, radius: number, label: string) {
  const y = floorHeightAt(
    SEED,
    point.x,
    point.z,
    radius,
    terrainHeight(point.x, point.z, SEED) + MAX_STEP_HEIGHT,
  );
  const probe: CharacterMoveResult = { ...point, y, blocked: false, stepped: 0 };
  moveCharacter(
    {
      seed: SEED,
      radius,
      stepHeight: MAX_STEP_HEIGHT,
      maxSlope: PLAYER_MAX_CLIMB_SLOPE,
      grounded: true,
      swimming: false,
      ignoreFences: false,
    },
    point.x,
    y,
    point.z,
    0,
    0,
    probe,
  );
  expect(
    Math.hypot(probe.x - point.x, probe.z - point.z),
    `${label} body overlaps at ${point.x},${y},${point.z}`,
  ).toBeLessThan(0.001);
  return { ...point, y };
}

function expectWalkableRoute(
  label: string,
  from: { x: number; z: number },
  to: { x: number; z: number },
  bodyRadius: number,
  maxSpan = 128,
): void {
  const options = {
    seed: SEED,
    bodyRadius,
    maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
    minGround: (x: number, z: number) => waterLevelAt(x, z, SEED) - PLAYER_SWIM_DEPTH,
    maxSpan,
  } as const;
  let route = findPath(from, to, options);
  expect(route.length, `${label} has no route`).toBeGreaterThan(0);
  let current = standingBody(from, bodyRadius, `${label} start`);
  standingBody(to, bodyRadius, `${label} destination`);
  const movement = {
    seed: SEED,
    radius: bodyRadius,
    stepHeight: MAX_STEP_HEIGHT,
    maxSlope: PLAYER_MAX_CLIMB_SLOPE,
    grounded: true,
    swimming: false,
    ignoreFences: false,
  };
  const resolved: CharacterMoveResult = { ...current, blocked: false, stepped: 0 };
  let waypointIndex = 0;
  let stalledTicks = 0;
  // Follow the actual open-world character solver, including standable treads
  // and raised floors. The retired 2D resolver cannot prove player movement
  // across those surfaces because it treats their supports as full-height walls.
  for (let stepIndex = 0; stepIndex < 2_000; stepIndex++) {
    if (Math.hypot(to.x - current.x, to.z - current.z) <= 0.2) break;
    while (
      waypointIndex < route.length - 1 &&
      Math.hypot(route[waypointIndex].x - current.x, route[waypointIndex].z - current.z) <= 0.25
    ) {
      waypointIndex++;
    }
    const waypoint = route[waypointIndex] ?? to;
    const dx = waypoint.x - current.x;
    const dz = waypoint.z - current.z;
    const distance = Math.max(Math.hypot(dx, dz), Number.EPSILON);
    const stride = Math.min(0.2, distance);
    const desired = {
      x: current.x + (dx / distance) * stride,
      z: current.z + (dz / distance) * stride,
    };
    movement.swimming = isSwimming({ pos: current } as Entity, SEED);
    movement.grounded = !movement.swimming;
    moveCharacter(
      movement,
      current.x,
      current.y,
      current.z,
      desired.x - current.x,
      desired.z - current.z,
      resolved,
    );
    expect(
      pathCrossesFence(current.x, current.z, resolved.x, resolved.z, bodyRadius),
      `${label} crosses a fence`,
    ).toBe(false);
    const moved = Math.hypot(resolved.x - current.x, resolved.z - current.z);
    const floor = floorHeightAt(SEED, resolved.x, resolved.z, bodyRadius, resolved.y + 0.001);
    expect(
      floor,
      `${label} enters deep water at ${resolved.x},${resolved.z}`,
    ).toBeGreaterThanOrEqual(waterLevelAt(resolved.x, resolved.z, SEED) - PLAYER_SWIM_DEPTH);
    current = {
      x: resolved.x,
      z: resolved.z,
      y: movement.swimming ? Math.max(floor, swimSurfaceY(resolved.x, resolved.z, SEED)) : floor,
    };
    stalledTicks = moved < 1e-4 ? stalledTicks + 1 : 0;
    if (stalledTicks >= 4) {
      route = findPath(current, to, options);
      waypointIndex = 0;
      stalledTicks = 0;
    }
  }
  expect(
    Math.hypot(to.x - current.x, to.z - current.z),
    `${label} endpoint at ${current.x},${current.y},${current.z}`,
  ).toBeLessThanOrEqual(0.2);
}

function placeEntity(sim: Sim, entity: Entity, point: { x: number; z: number }): void {
  entity.pos = sim.groundPos(point.x, point.z);
  entity.prevPos = { ...entity.pos };
  entity.vx = 0;
  entity.vy = 0;
  entity.vz = 0;
  entity.onGround = true;
  entity.fallStartY = entity.pos.y;
  sim.rebucket(entity);
}

describe('Eastbrook authored gameplay data integration', () => {
  it('replaces the approved town inventory and preserves remote camps and landmarks', () => {
    expect(ZONE1_PROPS.buildings).toHaveLength(18);
    expect(ZONE1_PROPS.buildings.map((b) => b.id)).toEqual(
      [
        'bank-hall',
        'hearth-inn',
        'chapel',
        'smith-house',
        'weaver-house',
        'toolworks',
        'market-home',
        'east-home',
        'harbor-apothecary',
        'harbor-office',
        'dock-home',
        'quay-warehouse',
        'quay-smokehouse',
        'quay-cottage',
        'ridge-home',
        'lane-home',
        'green-home',
        'craft-cottage',
      ].map((id) => `settlement:eastbrook:${id}`),
    );
    expect(ZONE1_PROPS.buildings.some((b) => b.landmark)).toBe(false);
    expect(ZONE1_PROPS.wells).toEqual([]);
    expect(ZONE1_PROPS.stalls).toEqual([]);
    expect(ZONE1_PROPS.benches).toEqual([]);
    expect(ZONE1_PROPS.walls).toEqual([]);
    expect(ZONE1_PROPS.fences).toEqual([]);
    expect(approved.dressing.filter((p) => p.modelId === approved.models.stall)).toHaveLength(2);
    expect(approved.dressing.filter((p) => p.id.startsWith('chapel-grave-'))).toHaveLength(9);
    expect(approved.landmarks).toEqual([
      expect.objectContaining({
        id: 'monument',
        modelId: 'eastbrook:monument',
        x: -14.75,
        z: -102,
      }),
    ]);
    expect(ZONE1_PROPS.mines).toEqual([{ x: -38, z: 138, rot: 0.8 }]);
    expect(ZONE1_PROPS.docks).toEqual([
      { x: -64, z: 60, rot: -2.2, hutLocal: { x: 2.8, z: 2.4, hw: 1.7, hd: 1.5 } },
    ]);
    expect(ZONE1_PROPS.tents).toEqual([
      { x: 58, z: 25, rot: 0.4, scale: 1 },
      { x: 68, z: 16, rot: 2.1, scale: 1 },
      { x: 113, z: 47, rot: 1.2, scale: 1.3 },
      { x: 119, z: 39, rot: -0.6, scale: 1 },
      { x: -90.5, z: -78.5, rot: -0.9, scale: 1 },
    ]);
    expect(ZONE1_PROPS.crates).toEqual([
      [56, 22],
      [64, 26],
      [112, 44],
      [118, 40],
      [66, 14],
    ]);
    expect(ZONE1_PROPS.campfires).toEqual([
      [59, 17],
      [111, 46],
      [-30, 146],
      [-61, 56],
    ]);
    expect(ZONE1_PROPS.mudHuts).toEqual([
      [-73, 59],
      [-78, 54],
      [-69, 55],
    ]);
    expect(ZONE1_PROPS.ruinRings).toEqual([
      { x: 80, z: 78, ringR: 7, columns: 7 },
      { x: -5, z: -60, ringR: 8, columns: 6 },
    ]);
    expect(ZONE1_PROPS.graveyards).toEqual([{ x: -22, z: 118 }]);
    expect(ZONE1_PROPS.delveMarkers).toEqual([{ x: -136, z: 112, delveId: 'collapsed_reliquary' }]);
  });

  // Re-pinned 2026-08-18 for the harbor move (commit d19aa33f76,
  // docs/design/eastbrook-revamp/site-plan.md), then for owner refinement
  // round 3: the wall and its gates are retired by design, so every road
  // carries gateId null and there is no gate crossing to contain. Round 3
  // added the inn lane (appended last, the by-index spread rule), trimmed
  // the beach promenade to the pulled-in strand, and re-tied the coast
  // track to hug the new waterline.
  it('connects the approved roads while retaining the remote road endpoints', () => {
    for (const endpoint of [
      { x: -32, z: 140 },
      { x: -92, z: -56 },
      { x: 65, z: -65 },
    ])
      expect(
        ZONE1_ROADS.some((r) => r.some((p) => p.x === endpoint.x && p.z === endpoint.z)),
        JSON.stringify(endpoint),
      ).toBe(true);
    for (const road of approved.roads)
      expect(ZONE1_ROADS).toContainEqual(road.points.map(([x, z]) => ({ x, z })));
    expect(approved.roads.length).toBeGreaterThan(3);
    expect(EASTBROOK_LAYOUT.wall.gates).toEqual([]);
  });

  it('moves only the 15 town NPC placement fields and preserves key order and all other payload', () => {
    expect(Object.keys(ZONE1_NPCS)).toEqual([
      'the_merchant',
      'marshal_redbrook',
      'trader_wilkes',
      'apothecary_lin',
      'brother_aldric',
      'smith_haldren',
      'fisherman_brandt',
      'foreman_odell',
      'bursar_fernando',
      'card_master',
      'chronicler_saul',
      'forgemistress_darva',
      'cook_marlow',
      'weaver_ottilie',
      'tinker_gizzel',
      'farmer_jessica',
    ]);
    // Reminted for the paladin-only Dawnbound Tome chain, which hangs q_divine_tome
    // off Brother Aldric. The payload covers everything but pos/facing, so a quest
    // added to a town NPC moves it; the placement assertions below still pin every
    // position independently.
    // Everything except pos/facing, hashed: the placement rebuild must not have
    // touched any other NpcDef field. Re-minted deliberately when the gathered
    // materials came off the station masters' vendorItems rows (the ruling that
    // no NPC stocks a gathered material), which is a content change to this
    // payload, not placement drift. Any UNEXPLAINED move here is the bug it
    // was written to catch.
    //
    // Re-minted a second time when Eastbrook stopped stocking the tier-2 and
    // tier-3 land tools, the hub rule that a zone sells the tiers its own
    // nodes use (Eastbrook is entirely tier-1 ground). Exactly three of the 16
    // payloads moved and all three moves are vendorItems rows: trader_wilkes
    // (six tools dropped, both rods kept), forgemistress_darva (two picks
    // dropped) and tinker_gizzel (four axes and sickles dropped). Nothing else
    // in any def, and no placement field, changed. The three row assertions
    // that follow re-check that those are still the rows this case owns.
    //
    // Re-minted a third time by phase 05 of the bank-storage packet, which put
    // the Burlap Reagent Pouch (the one vendor-sold materials-only bag) on the
    // two counters that already stock bags: trader_wilkes and weaver_ottilie,
    // appended at the END of both lists. Exactly two of the payloads moved and
    // both moves are vendorItems rows. Nothing else in any def, and no
    // placement field, changed.
    //
    // The moved rows, asserted BEFORE the digest below so they actually
    // run: a failing expect throws, so stating them after the hash meant they
    // never evaluated in the one case they exist to describe. Ordered this way
    // a drift in some OTHER field of some other NPC moves the hash while these
    // stay green, which is the diagnostic the digest alone cannot give.
    //
    // Re-minted a third time at the farming go-live, when the kitchens
    // master took on the two produce work orders: exactly one payload moved
    // and the move is cook_marlow's questIds row (two order ids appended
    // after q_prof_workorder_kitchens). The row assertion below re-checks
    // that this is still the row this case owns.
    expect(ZONE1_NPCS.cook_marlow.questIds).toEqual([
      'q_prof_attune_apothecary',
      'q_prof_amends_apothecary',
      'q_prof_workorder_kitchens',
      'q_prof_workorder_kitchens_wheat',
      'q_prof_workorder_kitchens_rice',
    ]);
    // Re-minted again at the release/v0.41.0 sync, where the Sowfield
    // demolition retired Groundskeeper Bram with the Vale Cup module: his
    // whole record (the one dynamic payload) left the table, and no other def
    // or placement field moved. MEASURED on the merged tree.
    // Re-minted for Intentional Gathering (PR3): field_kit, the
    // corpse-harvest key, joined six vendorItems rows: trader_wilkes,
    // forgemistress_darva, weaver_ottilie, and tinker_gizzel (each one row,
    // ahead of that counter's existing final row), fisherman_brandt
    // (appended last, after simple_fishing_pole, his only prior row), and
    // farmer_jessica (appended last, after garden_hoe; see her own row
    // assertion below). Nothing else in any def, and no placement field,
    // changed. The counterfactual ahead of the digest strips exactly these
    // six field_kit rows and reproduces the PRE-PR3 hash byte for byte,
    // isolating the digest move to those six single-row insertions.
    expect(ZONE1_NPCS.trader_wilkes.vendorItems).toEqual([
      'baked_bread',
      'spring_water',
      'roasted_boar',
      'tough_jerky',
      'minor_healing_potion',
      'minor_mana_potion',
      'linen_pouch',
      'travelers_knapsack',
      'copper_mining_pick',
      'handaxe',
      'gathering_sickle',
      'ironreel_fishing_rod',
      'silverstream_fishing_rod',
      'field_kit',
      'burlap_reagent_pouch',
    ]);
    expect(ZONE1_NPCS.fisherman_brandt.vendorItems).toEqual(['simple_fishing_pole', 'field_kit']);
    expect(ZONE1_NPCS.weaver_ottilie.vendorItems).toEqual([
      'linen_pouch',
      'travelers_knapsack',
      'gathering_sickle',
      'field_kit',
      'spool_of_thread',
      'burlap_reagent_pouch',
    ]);
    expect(ZONE1_NPCS.forgemistress_darva.vendorItems).toEqual([
      'copper_mining_pick',
      'field_kit',
      'smithing_flux',
    ]);
    expect(ZONE1_NPCS.tinker_gizzel.vendorItems).toEqual([
      'handaxe',
      'simple_fishing_pole',
      'field_kit',
      'arcanite_bar',
    ]);
    // Re-minted a third time for the farming go-live: farmer_jessica joined
    // ZONE1_NPCS as the seventeenth def (a non-town NPC with an inline pos
    // outside the wall, like Bram, so the 15 town placements below are
    // untouched and ZONE1_TOWN_NPC_IDS keeps its length). Her payload is the
    // only new row; the sixteen prior payloads are byte-identical (zone1.ts
    // diff-checked). The row assertion that follows owns her stock.
    // Re-minted a fifth time for Intentional Gathering (PR3): field_kit
    // appended last, after garden_hoe (see the row-assertion group above).
    expect(ZONE1_NPCS.farmer_jessica.vendorItems).toEqual([
      'vale_wheat_seed',
      'brook_carrot_seed',
      'brook_carrot',
      'compost',
      'garden_hoe',
      'field_kit',
    ]);
    // Re-minted a fourth time (2026-08-18) for the harbor move (commit
    // d19aa33f76, docs/design/eastbrook-revamp/site-plan.md; the reword
    // itself landed with the wave D waterfront, 88f14c6078): exactly one
    // non-placement field moved, Apothecary Lin's greeting, because the
    // spider wood she warns about sits northeast of the harbor site instead
    // of east of the old ring. Asserted BEFORE the digest, same as the
    // vendor rows above, so the one moved field is described where it can
    // actually fail.
    expect(ZONE1_NPCS.apothecary_lin.greeting).toBe(
      'Careful where you step in the northeastern woods, friend.',
    );
    // Re-minted at the merge of release/v0.41.0 into feature/masterwrought
    // (base 9a89e3483e, release tip ff2837da1f): the branch's farmer_jessica
    // row and the two produce work orders on cook_marlow combine with the
    // release's Bram retirement, Lin's harbor greeting and the Eastbrook
    // rebuild rounds, so the merged payload hashes to a value matching
    // NEITHER parent. Parent values for the record: ours
    // 7f0a09f0bd4c4d83845c57e760b92981af62338feab28ed570ec1390eedfd5e9, the
    // release 2f6072ad2baa2341ce32484144915a0d6cbc9836d0ed4c9d70112e3dbeb87146.
    // Measured on the merged working tree (npx vitest run
    // tests/eastbrook_gameplay_integration.test.ts, with zone1.ts and the
    // layout both conflict-free) and set to exactly what it reported.
    //
    // Re-minted at the 11n vendor floor (qr-11n-WIDE): exactly one payload
    // moved and the move is smith_haldren's vendorItems row, the four
    // byte-identical crafted gear rows pulled (eastbrook_arming_sword,
    // eastbrook_chain_vest, eastbrook_wool_trousers, tanned_leather_jerkin).
    // Nothing else in any def, and no placement field, changed. The row
    // assertion below is asserted BEFORE the digest, same as the vendor rows
    // above, so the one moved field is described where it can actually fail;
    // tests/vendor_floor.test.ts owns the deeper per-id keeps.
    expect(ZONE1_NPCS.smith_haldren.vendorItems).toEqual([
      'eastbrook_greatsword',
      'bronzework_mace',
      'vale_carving_knife',
      'hickory_shortstaff',
      'eastbrook_buckler',
      'valespun_robe',
      'hobnail_boots',
    ]);
    // Re-minted at the merge of release/v0.41.0 (tip d3f8bae369 onward) into
    // feature/masterwrought: the branch's 11n vendor floor pull combines with
    // the release's Burlap Reagent Pouch rows on trader_wilkes and
    // weaver_ottilie (bank-storage phase 05), so the merged payload hashes to
    // a value matching NEITHER parent. Parent values for the record: ours
    // a9448fdddffaac362da8792a7a013d2a840122c2c12a25adb73779767952e14d, the
    // release 3943f298cc9eff07d9dc040c8ff68d401da70e4a1ba9c17efc681aebc0fede44.
    // Measured on the merged working tree (zone1.ts conflict-free) and set to
    // exactly what it reported.
    //
    // Re-minted at the Phase 18 seed-feeding copy pass (commit 58e904a4b6),
    // which cleared the grandfathered em dashes out of the prose the mediawiki
    // seed publishes. Exactly two payload fields moved, both greetings, both
    // rewordings of a dash: The Merchant's market line takes a comma and
    // Brandt's takes an ellipsis. No other field, no placement field, and no
    // key order changed (proved by replaying the pre-pass zone1.ts against the
    // current siblings: the payload reproduces the previous digest above with
    // only these two strings restored). Both are asserted BEFORE the digest,
    // same as the vendor and greeting rows above, so each moved field is
    // described where it can actually fail.
    expect(ZONE1_NPCS.the_merchant.greeting).toBe(
      'Welcome to the World Market, $C. Buy from every adventurer in the realm, or set out your own wares and let coin find you.',
    );
    expect(ZONE1_NPCS.fisherman_brandt.greeting).toBe(
      'Blrb-glub... sorry, been listening to those fish-men too long.',
    );
    // PRE-PR3 counterfactual: strip exactly the six field_kit rows the
    // row-assertion group above just proved are real (trader_wilkes,
    // fisherman_brandt, forgemistress_darva, weaver_ottilie, tinker_gizzel,
    // farmer_jessica), one row each, and the remaining payload reproduces the
    // digest that was pinned here before PR3 (Intentional Gathering) landed,
    // byte for byte. That is the proof the whole hash move is these six
    // insertions and nothing else: any other drift in any other field would
    // still show up as a mismatch on THIS expectation.
    const PR3_FIELD_KIT_VENDOR_ROWS = [
      'trader_wilkes',
      'fisherman_brandt',
      'forgemistress_darva',
      'weaver_ottilie',
      'tinker_gizzel',
      'farmer_jessica',
    ] as const;
    function withoutPr3FieldKitRows(): Record<string, Omit<NpcDef, 'pos' | 'facing'> | NpcDef> {
      const payload = stableTownNpcPayload();
      for (const id of PR3_FIELD_KIT_VENDOR_ROWS) {
        const def = payload[id];
        const items = def.vendorItems;
        if (!items) throw new Error(`${id} has no vendorItems to strip field_kit from`);
        const idx = items.indexOf('field_kit');
        if (idx < 0) throw new Error(`${id} vendorItems carries no field_kit row to strip`);
        payload[id] = {
          ...def,
          vendorItems: [...items.slice(0, idx), ...items.slice(idx + 1)],
        };
      }
      return payload;
    }
    expect(
      createHash('sha256').update(JSON.stringify(withoutPr3FieldKitRows())).digest('hex'),
      'stripping exactly the six PR3 field_kit rows reproduces the pre-PR3 digest',
    ).toBe('ef35b8640f9ed213e86dbac9b04ba7a8ec9cdde6179d3859e833519dcaabb6c2');
    // CURRENT digest, WITH the six field_kit rows. Measured on the merged
    // working tree; the counterfactual above already proves the only content
    // difference from the pre-PR3 payload is those six rows.
    expect(createHash('sha256').update(JSON.stringify(stableTownNpcPayload())).digest('hex')).toBe(
      'ecc22e457d1f325155266ede8bd5306f73d9d5057854316b502f43c9e4dcd8a3',
    );
    expect(ZONE1_TOWN_NPC_IDS).toHaveLength(15);
    for (const id of ZONE1_TOWN_NPC_IDS) {
      const placement = EASTBROOK_NPC_PLACEMENTS_BY_ID[id];
      expect(ZONE1_NPCS[id].pos).toEqual(placement.position);
      expect(ZONE1_NPCS[id].facing).toBe(placement.facing);
    }
    // Groundskeeper Bram's inline placement pin stood here until the release
    // retired him with the Sowfield and the Vale Cup; Farmer Jessica's is now
    // the one non-layout Eastbrook placement.
    // The farmer's inline seat beside the allotments (the go-live), pinned
    // here as the non-layout Eastbrook placement; the world-side proof (never
    // nudged, beside the beds, off the road) lives in
    // tests/farmer_npc_placement.test.ts.
    expect(ZONE1_NPCS.farmer_jessica).toMatchObject({
      pos: { x: -15.5, z: -81.5 },
      facing: -Math.PI / 2,
      farmer: true,
    });
    expect(ZONE1_NPCS.farmer_jessica.dynamic).toBeUndefined();
  });

  // Re-pinned 2026-08-18 for the harbor move (commit d19aa33f76,
  // docs/design/eastbrook-revamp/site-plan.md): FURY moved with the chapel
  // to the chapel green; position and facing probed from the live layout.
  // Re-pinned for owner round 6b: FURY is the honor quartermaster, a service
  // NPC, so he left the chapel step (7 yd from Brother Aldric) for the town's
  // eastern edge; his facing is still derived, so it moved with him.
  it('spawns layout-authored FURY under a reserved id without shifting nextId or RNG', () => {
    expect(EASTBROOK_NPC_PLACEMENTS_BY_ID.fury).toEqual({
      id: 'fury',
      position: { x: 16, z: -78 },
      facing: -2.2455372690184494,
      anchorId: 'eastbrook_chapel',
      bodyRadius: 0.6,
    });
    expect(BUILTIN_WORLD.npcs[FURY_NPC_ID]).toMatchObject({
      id: 'fury',
      pos: { x: 16, z: -78 },
      facing: -2.2455372690184494,
      dynamic: true,
    });
    expect(FURY_ENTITY_ID).toBe(1_000_000_001);

    const npcsWithoutFury = { ...BUILTIN_WORLD.npcs };
    delete npcsWithoutFury[FURY_NPC_ID];
    const worldWithoutFury = { ...BUILTIN_WORLD, npcs: npcsWithoutFury };
    setActiveWorldContent(worldWithoutFury);
    const withoutFury = new Sim({
      seed: SEED,
      playerClass: 'warrior',
      noPlayer: true,
      world: worldWithoutFury,
    });
    setActiveWorldContent(BUILTIN_WORLD);
    const withFury = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true });

    expect(withoutFury.entities.has(FURY_ENTITY_ID)).toBe(false);
    const fury = withFury.entities.get(FURY_ENTITY_ID);
    if (!fury) throw new Error('missing reserved FURY entity');
    expect({
      id: fury.id,
      kind: fury.kind,
      templateId: fury.templateId,
      x: fury.pos.x,
      z: fury.pos.z,
      spawnX: fury.spawnPos.x,
      spawnZ: fury.spawnPos.z,
      facing: fury.facing,
      prevFacing: fury.prevFacing,
    }).toEqual({
      id: 1_000_000_001,
      kind: 'npc',
      templateId: 'fury',
      x: 16,
      z: -78,
      spawnX: 16,
      spawnZ: -78,
      facing: -2.2455372690184494,
      prevFacing: -2.2455372690184494,
    });
    expect([...withFury.entities.keys()].filter((id) => id !== FURY_ENTITY_ID)).toEqual([
      ...withoutFury.entities.keys(),
    ]);
    expect(withFury.nextId).toBe(withoutFury.nextId);
    expect(withFury.rng.next()).toBe(withoutFury.rng.next());
  });

  // Owner round 6b widened the station-to-master band from 3 yd to 4.5 yd:
  // forgemistress_darva now stands 4.2 yd out and tinker_gizzel 3.2 yd out, on
  // opposite sides of their adjacent benches, so the crafts lane stops reading
  // as one huddle. Each master still works their own station, which is the
  // failure this bound exists to catch.
  it('moves the four Eastbrook stations with their masters and preserves every other station field', () => {
    for (const station of STATIONS.slice(0, 4)) {
      const placement = EASTBROOK_STATIONS_BY_ID[station.id];
      expect(station.pos).toEqual(placement.position);
      expect(station.type).toBe(placement.type);
      expect(station.masterNpcId).toBe(placement.masterNpcId);
      expect(
        Math.hypot(
          station.pos.x - ZONE1_NPCS[station.masterNpcId].pos.x,
          station.pos.z - ZONE1_NPCS[station.masterNpcId].pos.z,
        ),
      ).toBeGreaterThanOrEqual(1);
      expect(
        Math.hypot(
          station.pos.x - ZONE1_NPCS[station.masterNpcId].pos.x,
          station.pos.z - ZONE1_NPCS[station.masterNpcId].pos.z,
        ),
      ).toBeLessThanOrEqual(4.5);
    }
    expect(STATIONS.slice(4)).toEqual([
      {
        id: 'station_fenbridge_tannery',
        type: 'tannery',
        zoneId: 'mirefen_marsh',
        pos: { x: 1.0670827486441765, z: 315.3263500973041 },
        masterNpcId: 'tanner_hesk',
      },
      {
        id: 'station_highwatch_apothecary',
        type: 'apothecary',
        zoneId: 'thornpeak_heights',
        pos: { x: 7, z: 660 },
        masterNpcId: 'alchemist_verane',
      },
    ]);
    expect(STATION_RADIUS).toBe(20);
  });

  it('moves the approved settlement mailboxes and preserves the other service rows', () => {
    expect(MAILBOXES).toEqual([
      { x: 19.646446609406723, z: -100.1317279836453, facing: (-3 * Math.PI) / 4 },
      { x: 6, z: 294 },
      { x: 6, z: 654 },
      { x: -33, z: 1025 },
      { x: 397, z: 1905 },
      { x: -43.8, z: 1556, facing: Math.PI / 2 },
      { x: -353, z: 2067 },
      { x: -354, z: 356 },
      { x: -364, z: 1415 },
      { x: 354, z: 1436, facing: 0 },
      { x: -294, z: 815 },
      { x: 314, z: 816 },
      { x: 420, z: 352 },
      { x: 300.4, z: 69.1, facing: Math.PI / 2 },
      { x: -306, z: 56, facing: Math.PI },
    ]);
    expect(PLAYER_START).toEqual({ x: -94, z: -58 });
    expect(EASTBROOK_LAYOUT.services.graveyard.position).toEqual({ x: -2, z: -70 });
    expect(EASTBROOK_LAYOUT.services.graveyard.legacyReleasePoint).toEqual({ x: 0, z: -70 });
  });
});

describe('Eastbrook runtime collision, spawn, and services', () => {
  it('spawns every moved NPC exactly at its authored point and facing without safe-position drift', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true });
    for (const placement of EASTBROOK_LAYOUT.services.npcs) {
      const entity = npcEntity(sim, placement.id);
      expect({ x: entity.pos.x, z: entity.pos.z }, placement.id).toEqual(placement.position);
      expect(entity.facing, `${placement.id} facing`).toBe(placement.facing);
      expect(entity.prevFacing, `${placement.id} previous facing`).toBe(placement.facing);
      expect(isBlocked(SEED, entity.pos.x, entity.pos.z, placement.bodyRadius), placement.id).toBe(
        false,
      );
    }
  });

  it('keeps the retired stone wall and gate rows absent', () => {
    expect(EASTBROOK_LAYOUT.wall.segments).toEqual([]);
    expect(EASTBROOK_LAYOUT.wall.gates).toEqual([]);
    expect(ZONE1_PROPS.walls).toEqual([]);
  });

  it('uses the native settlement prop footprints and active noticeboard dimensions', () => {
    const colliders = colliderInternalsForTest.staticWorldColliders(SEED);
    for (const item of [
      ...approved.dressing.filter((p) => p.modelId === approved.models.stall),
      ...approved.landmarks,
    ]) {
      const seated = settlementItemPlacement(item, (x, z) => terrainHeight(x, z, SEED)),
        r = seated.seating.rect,
        center = localPoint(
          { ...item, rot: item.rot ?? 0 },
          (r.minX + r.maxX) / 2,
          (r.minZ + r.maxZ) / 2,
        );
      expect(colliders).toContainEqual(
        expect.objectContaining({
          type: 'obb',
          x: center.x,
          z: center.z,
          hw: (r.maxX - r.minX) / 2,
          hd: (r.maxZ - r.minZ) / 2,
          rot: item.rot ?? 0,
        }),
      );
    }
    expect(
      colliders.some((c) => c.type === 'circle' && c.x === -14.75 && c.z === -102),
      'retired monument cylinder',
    ).toBe(false);
    expect(EASTBROOK_LAYOUT.wall.segments).toHaveLength(0);
    expect(EASTBROOK_LAYOUT.wall.gates).toHaveLength(0);
    const board = boardDef;
    const collider = colliders.find((c) => c.type === 'obb' && c.x === board.x && c.z === board.z);
    expect(collider).toMatchObject({
      type: 'obb',
      hw: board.width / 2,
      hd: board.depth / 2,
      rot: board.rotation,
    });
    expect(collider?.cameraTopY).toBeCloseTo(groundHeight(board.x, board.z, SEED) + board.height);
  });

  it('keeps approved entrance feet, stations, quest NPCs and service standing points clear', () => {
    for (const plan of approvedPlans) {
      const point = entranceFoot(plan);
      // A stair foot can overlap its standable support in the old 2D query.
      // Resolve a full body at the actual floor, then the route proof below
      // verifies the player can reach this point from the square.
      standingBody(point, PLAYER_BODY_RADIUS, plan.lot.id);
    }
    expect(
      isBlocked(SEED, boardDef.frontStandingPoint.x, boardDef.frontStandingPoint.z, 0.6),
      'noticeboard',
    ).toBe(false);
    for (const station of EASTBROOK_LAYOUT.services.stations) {
      expect(isBlocked(SEED, station.position.x, station.position.z, 0.8), station.id).toBe(false);
      expect(isAtStation(STATIONS, station.position, station.type), station.id).toBe(true);
    }
    for (const id of ZONE1_TOWN_NPC_IDS) {
      const npc = ZONE1_NPCS[id];
      expect(isBlocked(SEED, npc.pos.x, npc.pos.z, 0.6), id).toBe(false);
    }
    const grave = EASTBROOK_LAYOUT.services.graveyard.position;
    expect(isBlocked(SEED, grave.x, grave.z, 0.5), 'spirit release').toBe(false);
  });

  // Re-anchored 2026-08-18 for the harbor move (commit d19aa33f76,
  // docs/design/eastbrook-revamp/site-plan.md): the square anchor moved to
  // the new market square and the six retired gate destinations left the
  // list with the wall (36 became 30). Round 3 promoted the trio of decor
  // homes into layout buildings, adding their entrances (33). Round 4
  // retired the preserved armoury from placement, dropping its entrance (32).
  // Round 6 removed eastbrook_home_rise from the layout after live review,
  // dropping its entrance too (31), then appended the harbour quarter's three
  // coastal buildings along the dock road, each bringing its own entrance
  // back into the proof (34).
  it('pathfinds bidirectionally from the square to every service, NPC, station, and entrance', () => {
    // A standing spot in the square, DERIVED from the centrepiece rather than
    // hardcoded. It used to be (-12.5, -100.5), which was clear of the well
    // beacon's 1.5 cylinder and is now buried inside the Realm Builder
    // monument's 3.19 one: round 8 doubled the statue, and the square's old
    // middle is the statue. Deriving it keeps this proof honest through the
    // next resize instead of quietly starting a route inside a collider.
    // A yard and a bit off the plinth, on the open east quadrant the layout
    // deliberately leaves clear as the spawn-to-square arrival lane (east is
    // NEGATIVE x here).
    const monumentCentre = EASTBROOK_LAYOUT.civic.monument;
    const square = {
      x: monumentCentre.position.x - (monumentCentre.radius + 1.2),
      z: monumentCentre.position.z,
    };
    const destinations = [
      ...EASTBROOK_LAYOUT.services.npcs.map((npc) => ({ id: npc.id, point: npc.position })),
      ...EASTBROOK_LAYOUT.services.stations.map((station) => ({
        id: station.id,
        point: station.position,
      })),
      {
        id: EASTBROOK_LAYOUT.services.mailbox.id,
        point: {
          x: mailboxDef.x + Math.sin(mailboxDef.facing ?? 0) * 1.5,
          z: mailboxDef.z + Math.cos(mailboxDef.facing ?? 0) * 1.5,
        },
      },
      {
        id: EASTBROOK_LAYOUT.services.noticeboard.id,
        point: boardDef.frontStandingPoint,
      },
      {
        id: EASTBROOK_LAYOUT.services.graveyard.id,
        point: EASTBROOK_LAYOUT.services.graveyard.position,
      },
      ...approvedPlans.map((plan) => ({
        id: `${plan.lot.id}:entrance`,
        point: entranceFoot(plan),
      })),
    ];
    expect(destinations).toHaveLength(41);
    // Player and pet navigation share the same body radius. Prove the shared
    // geometry once here; the next case drives an actual following pet.
    for (const destination of destinations) {
      expectWalkableRoute(
        `${destination.id} outbound r${PLAYER_BODY_RADIUS}`,
        square,
        destination.point,
        PLAYER_BODY_RADIUS,
      );
      expectWalkableRoute(
        `${destination.id} inbound r${PLAYER_BODY_RADIUS}`,
        destination.point,
        square,
        PLAYER_BODY_RADIUS,
      );
    }
  });

  it('summons a passive pet and follows its owner along an approved square lane in both directions', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warlock', noPlayer: true }),
      pid = sim.addPlayer('warlock', 'Follower');
    const owner = sim.entities.get(pid)!;
    summonPet(sim.ctx, owner, 'gloomshade');
    const pet = petOf(sim.ctx, pid)!;
    expect(pet).toBeDefined();
    setPetMode(sim.ctx, 'passive', pid);
    for (const [ownerPoint, petPoint] of [
      [
        { x: -19, z: -100 },
        { x: -19, z: -105 },
      ],
      [
        { x: -19, z: -105 },
        { x: -19, z: -100 },
      ],
    ]) {
      placeEntity(sim, owner, ownerPoint);
      placeEntity(sim, pet, petPoint);
      pet.aggroTargetId = null;
      pet.petPath = [];
      pet.inCombat = false;
      for (let tick = 0; tick < 100 && dist2d(owner.pos, pet.pos) > 3.5; tick++) sim.tick();
      expect(dist2d(owner.pos, pet.pos)).toBeLessThanOrEqual(3.5);
    }
  });

  it('makes the new inn the sole Eastbrook rest area and uses rotation-correct local transforms', () => {
    const inn = ZONE1_PROPS.buildings.find(
      (building) => building.id === 'settlement:eastbrook:hearth-inn',
    );
    if (!inn) throw new Error('missing Eastbrook rest fixtures');
    // Round 4: the armoury retired from placement, so no zone1 building row
    // carries its landmark and the barracks lot front grants no rest.
    expect(ZONE1_PROPS.buildings.some((building) => building.landmark)).toBe(false);
    const innPlacement = approvedPlans.find((p) => p.lot.id === 'hearth-inn')!;
    const restPoint = localPoint(innPlacement.lot, 0, innPlacement.placement.landing.maxZ);
    const barracksFront = { x: 12, z: -5.5 };

    expect(isResting({ inCombat: false, pos: { ...restPoint, y: 0 } } as Entity)).toBe(true);
    expect(isResting({ inCombat: false, pos: { ...barracksFront, y: 0 } } as Entity)).toBe(false);

    const arbitrary = { kind: 'inn', x: 37, z: -19, w: 8, d: 3, rot: 0.731 } as const;
    const inside = localToWorld({ x: arbitrary.x, z: arbitrary.z }, arbitrary.rot, 3.9, 1.4);
    const outside = localToWorld({ x: arbitrary.x, z: arbitrary.z }, arbitrary.rot, 4.1, 1.4);
    expect(buildingContainsPoint(arbitrary, inside.x, inside.z)).toBe(true);
    expect(buildingContainsPoint(arbitrary, outside.x, outside.z)).toBe(false);
  });

  it('keeps targetless Saul interaction outside mailbox reach at his measured face point', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Chronicler Visitor');
    const saul = npcEntity(sim, 'chronicler_saul');
    const mailbox = sim.entities.get(sim.postOffice.mailboxIds[0]);
    if (!mailbox) throw new Error('missing Eastbrook mailbox');
    // Approach the NPC along his actual facing. The mailbox now belongs at
    // the hall entrance, so its service reach must not steal this interaction.
    const facePoint = {
      x: saul.pos.x + Math.sin(saul.facing) * 1.5,
      z: saul.pos.z + Math.cos(saul.facing) * 1.5,
    };

    expect(Math.hypot(facePoint.x - saul.pos.x, facePoint.z - saul.pos.z)).toBeCloseTo(1.5, 12);
    const mailboxDistance = Math.hypot(facePoint.x - mailbox.pos.x, facePoint.z - mailbox.pos.z);
    expect(mailboxDistance).toBeCloseTo(
      Math.hypot(facePoint.x - mailboxDef.x, facePoint.z - mailboxDef.z),
      8,
    );
    expect(mailboxDistance).toBeGreaterThan(INTERACT_RANGE);

    const talkToNpc = vi.spyOn(sim, 'talkToNpc');
    const visitor = standAt(sim, pid, facePoint);
    visitor.targetId = null;
    sim.drainEvents();
    sim.interact(pid);
    expect(talkToNpc).toHaveBeenCalledTimes(1);
    expect(talkToNpc).toHaveBeenCalledWith(saul.id, pid);
    expect(sim.drainEvents()).not.toContainEqual(expect.objectContaining({ type: 'mailbox' }));
  });

  it('keeps bank, market, mail, noticeboard, card, vendor, quest, and crafting interactions live', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior', noPlayer: true });
    const first = sim.addPlayer('warrior', 'First');
    const second = sim.addPlayer('mage', 'Second');

    const banker = npcEntity(sim, 'bursar_fernando');
    const firstPlayer = standAt(sim, first, banker.pos);
    firstPlayer.targetId = banker.id;
    sim.interact(first);
    expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'bank', pid: first }));

    const merchant = npcEntity(sim, 'the_merchant');
    standAt(sim, first, merchant.pos);
    expect(sim.marketInfoFor(first)).not.toBeNull();

    const mailbox = sim.entities.get(sim.postOffice.mailboxIds[0]);
    if (!mailbox) throw new Error('missing Eastbrook mailbox');
    const atMailbox = standAt(sim, first, mailbox.pos);
    atMailbox.targetId = mailbox.id;
    sim.interact(first);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'mailbox', pid: first }),
    );

    const noticeboard = [...sim.entities.values()].find(
      (entity) => entity.kind === 'object' && entity.templateId === 'noticeboard_eastbrook',
    );
    if (!noticeboard) throw new Error('missing Eastbrook noticeboard');
    const atNoticeboard = standAt(sim, first, boardDef.frontStandingPoint);
    atNoticeboard.targetId = noticeboard.id;
    sim.interact(first);
    expect(sim.drainEvents()).toContainEqual({
      type: 'noticeboard',
      noticeboardId: 'noticeboard_eastbrook',
      state: 'empty',
      pid: first,
    });
    expect(noticeboard.lootable).toBe(true);

    const trader = npcEntity(sim, 'trader_wilkes');
    const buyer = standAt(sim, first, trader.pos);
    buyer.targetId = trader.id;
    const buyerMeta = sim.meta(first);
    if (!buyerMeta) throw new Error('missing buyer metadata');
    buyerMeta.copper = 10_000;
    sim.buyItem(trader.id, 'baked_bread', undefined, first);
    expect(sim.countItem('baked_bread', first)).toBeGreaterThan(0);

    const marshal = npcEntity(sim, 'marshal_redbrook');
    const quester = standAt(sim, first, marshal.pos);
    quester.targetId = marshal.id;
    sim.interact(first);
    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'questAccepted', questId: 'q_wolves', pid: first }),
    );

    const cardMaster = npcEntity(sim, 'card_master');
    standAt(sim, first, cardMaster.pos);
    standAt(sim, second, cardMaster.pos);
    sim.joinCardDuelQueue(first);
    sim.joinCardDuelQueue(second);
    sim.tick();
    expect(sim.cardDuelMatchFor(first)).not.toBeNull();
    expect(sim.cardDuelMatchFor(second)).not.toBeNull();

    for (const station of EASTBROOK_LAYOUT.services.stations) {
      expect(isAtStation(STATIONS, station.position, station.type), station.id).toBe(true);
    }
  });

  it('keeps the fixed-seed world projection stable through wandering and respawn', {
    // Two complete shipped-world simulations run through wandering and respawn.
    // Loaded five-worker CI can exceed the old 90s budget while the bounded
    // projection still completes deterministically.
    timeout: 180000,
  }, () => {
    const stabilitySeed = 4_242;
    // Both hosts consume the same approved geometry. Comparing a custom world
    // with retired solid building rows no longer represents identical collision.
    const legacy = new Sim({ seed: stabilitySeed, playerClass: 'warrior', noPlayer: true });
    const rebuilt = new Sim({ seed: stabilitySeed, playerClass: 'warrior', noPlayer: true });

    const stableProjection = (sim: Sim) =>
      [...sim.entities.values()]
        .filter((entity) => entity.kind === 'mob' || entity.kind === 'object')
        .map((entity) => ({
          id: entity.id,
          kind: entity.kind,
          templateId: entity.templateId,
          x: entity.pos.x,
          z: entity.pos.z,
          facing: entity.facing,
          level: entity.level,
          dead: entity.dead,
          hp: entity.hp,
          spawnPos: entity.spawnPos,
          wanderTarget: entity.wanderTarget,
          wanderTimer: entity.wanderTimer,
          respawnTimer: entity.respawnTimer,
        }));
    expect(stableProjection(rebuilt)).toEqual(stableProjection(legacy));
    expect(rebuilt.postOffice.mailboxIds).toEqual(legacy.postOffice.mailboxIds);
    expect(rebuilt.entities.get(rebuilt.postOffice.mailboxIds[0])?.pos).toMatchObject({
      x: mailboxDef.x,
      z: mailboxDef.z,
    });
    expect(CAMPS).toEqual(BUILTIN_WORLD.camps);
    expect(ZONE1_CAMPS).toHaveLength(14);

    // Both hosts use the same content. Swapping it before each tick would
    // invalidate terrain/collider caches through contentGeneration, measuring
    // thousands of editor world reloads rather than normal runtime ticks.
    setActiveWorldContent(BUILTIN_WORLD);
    for (let tick = 0; tick < 2_500; tick++) {
      legacy.tick();
      rebuilt.tick();
    }
    expect(rebuilt.tickCount).toBe(2_500);
    expect(legacy.tickCount).toBe(2_500);
    expect(stableProjection(rebuilt)).toEqual(stableProjection(legacy));
    expect(rebuilt.nextId).toBe(legacy.nextId);

    const rebuiltWolf = [...rebuilt.entities.values()].find(
      (entity) => entity.kind === 'mob' && entity.templateId === 'forest_wolf',
    );
    const legacyWolf = rebuiltWolf ? legacy.entities.get(rebuiltWolf.id) : undefined;
    if (!rebuiltWolf || !legacyWolf) throw new Error('missing fixed-seed wolf pair');
    for (const wolf of [legacyWolf, rebuiltWolf]) {
      wolf.dead = true;
      wolf.hp = 0;
      wolf.lootable = false;
      wolf.corpseTimer = 0;
      wolf.respawnTimer = 0;
    }
    legacy.ctx.respawnMob(legacyWolf);
    rebuilt.ctx.respawnMob(rebuiltWolf);
    expect(stableProjection(rebuilt)).toEqual(stableProjection(legacy));
    expect(rebuilt.rng.next()).toBe(legacy.rng.next());
  });
});

describe('the first sixty seconds: starter pull lanes from spawn', () => {
  // The town is furnished with solid props now, so pin explicitly what the
  // fixtures that moved to open ground implied: a new character can walk out
  // of the spawn square to each nearby starter camp, and at the camp's edge
  // a ranged pull has a clear 25 yd sight lane to the camp's heart.
  it('walks out to the starter camps and sights a ranged pull at each', () => {
    // The level-1 quest targets: the first camps a fresh character is sent
    // at. (The spider wood is a later, longer walk whose winding route the
    // simple follower here cannot prove; its lane is covered by the
    // route-existence check below.)
    // The furthest starter camp is 152 yards east of spawn. Its search box
    // includes the pathfinder's margins, so a 160-cell cap silently returned
    // a straight-line fallback instead of searching around the coastal rise.
    const maxSpan = 192;
    const starterMobs = new Set(['wild_boar', 'forest_wolf']);
    const nearest = [...CAMPS]
      .map((camp) => ({
        camp,
        d: Math.hypot(camp.center.x - PLAYER_START.x, camp.center.z - PLAYER_START.z),
      }))
      .filter(({ camp }) => starterMobs.has(camp.mobId))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    expect(nearest.length).toBe(2);
    for (const { camp } of nearest) {
      // The pull spot as a player finds it: walk the pathfinder's own route
      // out of town and stop at the first waypoint inside ranged pull
      // distance of the camp's heart. That keeps the spot on walkable
      // ground even where the beeline crosses a rim.
      const route = findPath(PLAYER_START, camp.center, {
        seed: SEED,
        bodyRadius: 0.5,
        maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
        minGround: (x: number, z: number) => waterLevelAt(x, z, SEED) - PLAYER_SWIM_DEPTH,
        maxSpan,
      });
      expect(route.length, `${camp.mobId} has a route from spawn`).toBeGreaterThan(0);
      const pull =
        route.find((p) => Math.hypot(p.x - camp.center.x, p.z - camp.center.z) <= 25) ??
        route[route.length - 1];
      expect(isBlocked(SEED, pull.x, pull.z, 0.5), `${camp.mobId} pull spot`).toBe(false);
      expectWalkableRoute(`${camp.mobId} camp approach`, PLAYER_START, pull, 0.5, maxSpan);
      expect(lineOfSightClear(SEED, pull, camp.center), `${camp.mobId} pull sight lane`).toBe(true);
      expect(
        Math.hypot(pull.x - camp.center.x, pull.z - camp.center.z),
        `${camp.mobId} pull distance`,
      ).toBeLessThanOrEqual(25);
    }
  });

  it('every camp within 90 yd of spawn keeps a route and a pull sight lane', () => {
    for (const camp of CAMPS) {
      const d = Math.hypot(camp.center.x - PLAYER_START.x, camp.center.z - PLAYER_START.z);
      if (d > 90) continue;
      const route = findPath(PLAYER_START, camp.center, {
        seed: SEED,
        bodyRadius: 0.5,
        maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
        minGround: (x: number, z: number) => waterLevelAt(x, z, SEED) - PLAYER_SWIM_DEPTH,
        maxSpan: 160,
      });
      expect(route.length, `${camp.mobId} at ${camp.center.x},${camp.center.z}`).toBeGreaterThan(0);
      const pull =
        route.find((p) => Math.hypot(p.x - camp.center.x, p.z - camp.center.z) <= 25) ??
        route[route.length - 1];
      expect(lineOfSightClear(SEED, pull, camp.center), `${camp.mobId} pull sight lane`).toBe(true);
    }
  });
});
