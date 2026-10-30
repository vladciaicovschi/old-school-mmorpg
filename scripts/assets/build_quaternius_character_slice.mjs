// Builds the Modular Character Outfits - Fantasy player and Proving Shore NPC
// slice described in bible/game_bible_consolidated_v0.2.md. Fantasy Outfits is
// the body/clothing source. Its exports intentionally omit an uncovered face
// and most hairstyles, so Universal Base Characters supplies only the cropped
// head and hair. Both packs use the Universal Animation Library skeleton, so
// the merge keeps one skin and retargets every imported mesh by joint index.
//
// Expected extracted source layout under --source-root:
//   base/Universal Base Characters[Standard]/...
//   outfits/Modular Character Outfits - Fantasy[Standard]/...
//   anims/Universal Animation Library[Standard]/...
//
// Usage:
//   node scripts/assets/build_quaternius_character_slice.mjs \
//     --source-root tmp/asset_src/quaternius_character_slice
//   node scripts/assets/build_quaternius_character_slice.mjs --npc-only
//
// The official 2026-09-14 Standard downloads were recorded as:
//   Modular Character Outfits - Fantasy (primary character source)
//     c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70
//   Universal Base Characters (head and hair donor)
//     fdb1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40
//   Universal Animation Library
//     cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724
//
// MANDATORY final step after this exporter (scripts/assets/CLAUDE.md):
//   node scripts/assets/compress_glb_textures.mjs \
//     public/models/chars/players/quaternius_male_ranger.glb \
//     public/models/chars/players/quaternius_female_ranger.glb \
//     public/models/chars/npcs/quaternius_*.glb
//   node scripts/build_media_manifest.mjs generate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  compactPrimitive,
  dedup,
  mergeDocuments,
  meshopt,
  prune,
  resample,
  textureCompress,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_SOURCE_ROOT = path.join(ROOT, 'tmp', 'asset_src', 'quaternius_character_slice');
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, 'public');
const PLAYER_OUT_DIR = path.join('models', 'chars', 'players');
const NPC_OUT_DIR = path.join('models', 'chars', 'npcs');
const HEAD_BONES = new Set(['Head', 'neck_01']);
const HEAD_MIN_Y = 1.5;
const HEAD_MIN_WEIGHT = 0.5;
const KEEP_CLIPS = [
  'Death01',
  'Hit_Chest',
  'Hit_Head',
  'Idle_Loop',
  'Idle_Talking_Loop',
  'Jump_Land',
  'Jump_Loop',
  'Sitting_Enter',
  'Sitting_Idle_Loop',
  'Spell_Simple_Enter',
  'Spell_Simple_Exit',
  'Spell_Simple_Idle_Loop',
  'Spell_Simple_Shoot',
  'Sprint_Loop',
  'Swim_Fwd_Loop',
  'Swim_Idle_Loop',
  'Sword_Attack',
  'Sword_Idle',
  'Walk_Loop',
  'Dance_Loop',
];

const PLAYER_ITEMS = [
  {
    kind: 'player',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Ranger.gltf',
    outfitFamily: 'Ranger',
    outputName: 'quaternius_male_ranger.glb',
  },
  {
    kind: 'player',
    gender: 'female',
    baseName: 'Superhero_Female_FullBody.gltf',
    bodyNode: 'Superhero_Female',
    outfitName: 'Female_Ranger.gltf',
    outfitFamily: 'Ranger',
    outputName: 'quaternius_female_ranger.glb',
  },
];

// The Standard outfit pack deliberately ships only ranger and peasant bodies.
// Unique hair and palette combinations keep the eight tutorial NPCs readable
// while the player continues to use the untouched ranger outputs above.
const NPC_ITEMS = [
  {
    kind: 'npc',
    npcId: 'instructor_maren',
    gender: 'female',
    baseName: 'Superhero_Female_FullBody.gltf',
    bodyNode: 'Superhero_Female',
    outfitName: 'Female_Ranger.gltf',
    outfitFamily: 'Ranger',
    outfitBaseColor: 'T_Ranger_3_BaseColor.png',
    outputName: 'quaternius_instructor_maren.glb',
  },
  {
    kind: 'npc',
    npcId: 'quartermaster_finch',
    gender: 'female',
    baseName: 'Superhero_Female_FullBody.gltf',
    bodyNode: 'Superhero_Female',
    outfitName: 'Female_Peasant.gltf',
    outfitFamily: 'Peasant',
    hairName: 'Hair_Buns.gltf',
    outputName: 'quaternius_quartermaster_finch.glb',
  },
  {
    kind: 'npc',
    npcId: 'bursar_wick',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Peasant.gltf',
    outfitFamily: 'Peasant',
    hairName: 'Hair_SimpleParted.gltf',
    outputName: 'quaternius_bursar_wick.glb',
  },
  {
    kind: 'npc',
    npcId: 'ferryman_odo',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Peasant.gltf',
    outfitFamily: 'Peasant',
    outfitBaseColor: 'T_Peasant_2_BaseColor.png',
    hairName: 'Hair_Beard.gltf',
    hairBaseColor: 'T_Hair_2_BaseColor.png',
    outputName: 'quaternius_ferryman_odo.glb',
  },
  {
    kind: 'npc',
    npcId: 'warden_tam',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Ranger.gltf',
    outfitFamily: 'Ranger',
    outfitBaseColor: 'T_Ranger_3_BaseColor.png',
    outputName: 'quaternius_warden_tam.glb',
  },
  {
    kind: 'npc',
    npcId: 'overseer_pell',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Peasant.gltf',
    outfitFamily: 'Peasant',
    hairName: 'Hair_Buzzed.gltf',
    hairBaseColor: 'T_Hair_2_BaseColor.png',
    outputName: 'quaternius_overseer_pell.glb',
  },
  {
    kind: 'npc',
    npcId: 'drillmaster_rook',
    gender: 'male',
    baseName: 'Superhero_Male_FullBody.gltf',
    bodyNode: 'SuperHero_Male',
    outfitName: 'Male_Ranger.gltf',
    outfitFamily: 'Ranger',
    hairName: 'Hair_Beard.gltf',
    outputName: 'quaternius_drillmaster_rook.glb',
  },
  {
    kind: 'npc',
    npcId: 'tidewarden_nel',
    gender: 'female',
    baseName: 'Superhero_Female_FullBody.gltf',
    bodyNode: 'Superhero_Female',
    outfitName: 'Female_Peasant.gltf',
    outfitFamily: 'Peasant',
    outfitBaseColor: 'T_Peasant_2_BaseColor.png',
    hairName: 'Hair_Long.gltf',
    hairBaseColor: 'T_Hair_2_BaseColor.png',
    outputName: 'quaternius_tidewarden_nel.glb',
  },
];

function parseArgs(argv) {
  let sourceRoot = DEFAULT_SOURCE_ROOT;
  let outputRoot = DEFAULT_OUTPUT_ROOT;
  let buildPlayers = true;
  let buildNpcs = true;
  let buildAnimations = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source-root' && argv[i + 1]) sourceRoot = path.resolve(argv[++i]);
    else if (argv[i] === '--output-root' && argv[i + 1]) outputRoot = path.resolve(argv[++i]);
    else if (argv[i] === '--npc-only') {
      buildPlayers = false;
      buildAnimations = false;
    } else if (argv[i] === '--player-only') buildNpcs = false;
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  return { sourceRoot, outputRoot, buildPlayers, buildNpcs, buildAnimations };
}

function sourcePaths(sourceRoot, item) {
  return {
    base: path.join(
      sourceRoot,
      'base',
      'Universal Base Characters[Standard]',
      'Base Characters',
      'Godot - UE',
      item.baseName,
    ),
    outfit: path.join(
      sourceRoot,
      'outfits',
      'Modular Character Outfits - Fantasy[Standard]',
      'Exports',
      'glTF (Godot-Unreal)',
      'Outfits',
      item.outfitName,
    ),
    outfitBaseColor: item.outfitBaseColor
      ? path.join(
          sourceRoot,
          'outfits',
          'Modular Character Outfits - Fantasy[Standard]',
          'Textures',
          item.outfitFamily,
          item.outfitBaseColor,
        )
      : null,
    hair: item.hairName
      ? path.join(
          sourceRoot,
          'base',
          'Universal Base Characters[Standard]',
          'Hairstyles',
          'Rigged to Head Bone',
          'glTF (Godot -Unreal)',
          item.hairName,
        )
      : null,
    hairBaseColor: item.hairBaseColor
      ? path.join(
          sourceRoot,
          'base',
          'Universal Base Characters[Standard]',
          'Hairstyles',
          'Textures',
          item.hairBaseColor,
        )
      : null,
    animations: path.join(
      sourceRoot,
      'anims',
      'Universal Animation Library[Standard]',
      'Unreal-Godot',
      'UAL1_Standard.glb',
    ),
  };
}

function replaceBaseColorTexture(doc, materialName, imagePath, label) {
  if (!imagePath) return;
  assertFile(imagePath);
  const material = doc
    .getRoot()
    .listMaterials()
    .find((candidate) => candidate.getName() === materialName);
  const texture = material?.getBaseColorTexture();
  if (!material || !texture) {
    throw new Error(`${label}: material '${materialName}' has no base-color texture`);
  }
  texture
    .setImage(fs.readFileSync(imagePath))
    .setMimeType('image/png')
    .setName(path.basename(imagePath));
}

function assertFile(file) {
  if (!fs.existsSync(file)) throw new Error(`missing source file: ${file}`);
}

/**
 * The current Standard base-character glTFs refer to two image names with an
 * extra `_png` suffix. The archive contains the correctly named files. Create
 * local aliases beside the maintainer-only extracted source so NodeIO can read
 * the official file without rewriting it.
 */
function ensureBrokenImageAliases(gltfPath) {
  const dir = path.dirname(gltfPath);
  const json = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  for (const image of json.images ?? []) {
    const uri = image.uri;
    if (typeof uri !== 'string' || fs.existsSync(path.join(dir, uri))) continue;
    const corrected = uri.replace(/_png(?=\.png$)/i, '');
    const correctedPath = path.join(dir, corrected);
    if (corrected === uri || !fs.existsSync(correctedPath)) {
      throw new Error(`missing image '${uri}' referenced by ${gltfPath}`);
    }
    fs.copyFileSync(correctedPath, path.join(dir, uri));
  }
}

function requireNode(root, name) {
  const node = root.listNodes().find((candidate) => candidate.getName() === name);
  if (!node) throw new Error(`node '${name}' not found`);
  return node;
}

function skinJointNames(skin) {
  return skin.listJoints().map((joint) => joint.getName());
}

function assertSharedRig(baseSkin, outfitSkin, label) {
  const baseNames = skinJointNames(baseSkin);
  const outfitNames = skinJointNames(outfitSkin);
  if (
    baseNames.length !== outfitNames.length ||
    baseNames.some((name, index) => name !== outfitNames[index])
  ) {
    throw new Error(`${label}: base and outfit joint order differ`);
  }
}

/** Keep only the head/neck triangles from the base body's full-body primitive. */
function cropBaseBodyToHead(doc, nodeName, label) {
  const root = doc.getRoot();
  const node = requireNode(root, nodeName);
  const skin = node.getSkin();
  const mesh = node.getMesh();
  if (!skin || !mesh) throw new Error(`${label}: '${nodeName}' is not a skinned mesh`);
  const jointNames = skinJointNames(skin);
  const headIndices = new Set(
    jointNames
      .map((name, index) => (HEAD_BONES.has(name) ? index : -1))
      .filter((index) => index >= 0),
  );
  if (headIndices.size !== HEAD_BONES.size) throw new Error(`${label}: head bones are incomplete`);

  let keptTriangles = 0;
  let sourceTriangles = 0;
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    const joints = primitive.getAttribute('JOINTS_0');
    const weights = primitive.getAttribute('WEIGHTS_0');
    const indices = primitive.getIndices();
    if (!position || !joints || !weights || !indices) {
      throw new Error(`${label}: head source primitive lacks indexed skin attributes`);
    }
    const positions = position.getArray();
    const jointArray = joints.getArray();
    const weightArray = weights.getArray();
    const sourceIndices = indices.getArray();
    const kept = [];
    const isHeadVertex = (vertex) => {
      if (positions[vertex * 3 + 1] < HEAD_MIN_Y) return false;
      let weight = 0;
      for (let lane = 0; lane < 4; lane++) {
        if (headIndices.has(jointArray[vertex * 4 + lane]))
          weight += weightArray[vertex * 4 + lane];
      }
      return weight >= HEAD_MIN_WEIGHT;
    };
    for (let i = 0; i < sourceIndices.length; i += 3) {
      sourceTriangles++;
      const a = sourceIndices[i];
      const b = sourceIndices[i + 1];
      const c = sourceIndices[i + 2];
      if (!isHeadVertex(a) || !isHeadVertex(b) || !isHeadVertex(c)) continue;
      kept.push(a, b, c);
      keptTriangles++;
    }
    if (!kept.length) throw new Error(`${label}: head crop removed every triangle`);
    const IndexArray = sourceIndices.constructor;
    indices.setArray(new IndexArray(kept));
    compactPrimitive(primitive);
  }
  mesh.setName(`${label}_Head`);
  node.setName(`${label}_Head`);
  console.log(`  ${label}: head crop ${keptTriangles}/${sourceTriangles} triangles`);
}

function consolidateBuffers(root) {
  const mainBuffer = root.listBuffers()[0];
  if (!mainBuffer) return;
  for (const accessor of root.listAccessors()) accessor.setBuffer(mainBuffer);
  for (const buffer of root.listBuffers()) if (buffer !== mainBuffer) buffer.dispose();
}

async function mergeRiggedParts(io, doc, sourcePath, label, partKind, prepareSource = () => {}) {
  const root = doc.getRoot();
  const baseNodes = new Set(root.listNodes());
  const baseScenes = new Set(root.listScenes());
  const baseSkins = new Set(root.listSkins());
  const baseSkin = root.listSkins()[0];
  const baseArmature = requireNode(root, 'Armature');
  if (!baseSkin) throw new Error(`${label}: base skin missing`);

  const outfitDoc = await io.read(sourcePath);
  prepareSource(outfitDoc);
  const outfitSkin = outfitDoc.getRoot().listSkins()[0];
  if (!outfitSkin) throw new Error(`${label}: outfit skin missing`);
  assertSharedRig(baseSkin, outfitSkin, label);
  mergeDocuments(doc, outfitDoc);

  const outfitNodes = root.listNodes().filter((node) => !baseNodes.has(node));
  const outfitArmature = outfitNodes.find((node) => node.getName() === 'Armature');
  if (!outfitArmature) throw new Error(`${label}: imported outfit armature missing`);
  const keptMeshNodes = outfitNodes.filter((node) => node.getMesh());
  if (!keptMeshNodes.length) throw new Error(`${label}: outfit contains no mesh nodes`);
  for (const meshNode of keptMeshNodes) {
    outfitArmature.removeChild(meshNode);
    meshNode.setSkin(baseSkin);
    baseArmature.addChild(meshNode);
  }
  for (const scene of root.listScenes()) if (!baseScenes.has(scene)) scene.dispose();
  for (const node of outfitNodes) if (!keptMeshNodes.includes(node)) node.dispose();
  for (const skin of root.listSkins()) if (!baseSkins.has(skin)) skin.dispose();
  consolidateBuffers(root);
  console.log(`  ${label}: merged ${keptMeshNodes.length} ${partKind} mesh nodes onto shared rig`);
}

function stampProvenance(root, kind) {
  root.setExtras({
    ...root.getExtras(),
    wocAssetSource:
      'Quaternius Modular Character Outfits - Fantasy, with Universal Base Characters head/hair and Universal Animation Library clips (downloaded 2026-09-14)',
    wocAssetKind: kind,
    wocLicense: 'CC0-1.0',
    wocSourceArchivesSha256: {
      modularCharacterOutfitsFantasy:
        'c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70',
      universalBaseCharacters: 'fdb1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40',
      universalAnimationLibrary: 'cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724',
    },
  });
}

async function buildBody(io, sourceRoot, outputRoot, item) {
  const sources = sourcePaths(sourceRoot, item);
  assertFile(sources.base);
  assertFile(sources.outfit);
  if (sources.hair) assertFile(sources.hair);
  ensureBrokenImageAliases(sources.base);
  const doc = await io.read(sources.base);
  const label = item.npcId
    ? `Quaternius_Npc_${item.npcId}`
    : `Quaternius_${item.gender[0].toUpperCase()}${item.gender.slice(1)}_Ranger`;
  const hairMaterial = item.gender === 'female' ? 'MI_Hair_2' : 'MI_Hair_1';
  cropBaseBodyToHead(doc, item.bodyNode, label);
  if (sources.hairBaseColor) {
    replaceBaseColorTexture(doc, hairMaterial, sources.hairBaseColor, label);
  }
  await mergeRiggedParts(
    io,
    doc,
    sources.outfit,
    label,
    item.outfitFamily.toLowerCase(),
    (partDoc) => {
      replaceBaseColorTexture(partDoc, `MI_${item.outfitFamily}`, sources.outfitBaseColor, label);
    },
  );
  if (sources.hair) {
    await mergeRiggedParts(io, doc, sources.hair, label, 'hair', (partDoc) => {
      replaceBaseColorTexture(partDoc, hairMaterial, sources.hairBaseColor, label);
    });
  }
  stampProvenance(
    doc.getRoot(),
    item.npcId ? `Proving Shore NPC body: ${item.npcId}` : `${item.gender} ranger body`,
  );
  await doc.transform(
    resample(),
    prune({ keepExtras: true }),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const outDir = item.kind === 'npc' ? NPC_OUT_DIR : PLAYER_OUT_DIR;
  const outPath = path.join(outputRoot, outDir, item.outputName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  console.log(
    `  ${path.relative(ROOT, outPath)} ${(fs.statSync(outPath).size / 1024).toFixed(0)}KB`,
  );
}

async function buildAnimationDonor(io, sourceRoot, outputRoot) {
  const animationPath = sourcePaths(sourceRoot, PLAYER_ITEMS[0]).animations;
  assertFile(animationPath);
  const doc = await io.read(animationPath);
  const root = doc.getRoot();
  for (const animation of root.listAnimations()) {
    if (!KEEP_CLIPS.includes(animation.getName())) animation.dispose();
  }
  const missing = KEEP_CLIPS.filter(
    (name) => !root.listAnimations().some((animation) => animation.getName() === name),
  );
  if (missing.length) throw new Error(`animation source is missing: ${missing.join(', ')}`);
  for (const node of root.listNodes()) if (node.getMesh()) node.dispose();
  stampProvenance(root, 'Universal Animation Library clip donor');
  await doc.transform(
    resample(),
    prune({ keepExtras: true }),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const outPath = path.join(outputRoot, PLAYER_OUT_DIR, 'quaternius_ual_standard.glb');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  console.log(
    `  ${path.relative(ROOT, outPath)} ${(fs.statSync(outPath).size / 1024).toFixed(0)}KB (${root.listAnimations().length} clips)`,
  );
}

async function main() {
  const { sourceRoot, outputRoot, buildPlayers, buildNpcs, buildAnimations } = parseArgs(
    process.argv.slice(2),
  );
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  console.log(`source: ${sourceRoot}`);
  if (buildPlayers)
    for (const item of PLAYER_ITEMS) await buildBody(io, sourceRoot, outputRoot, item);
  if (buildNpcs) for (const item of NPC_ITEMS) await buildBody(io, sourceRoot, outputRoot, item);
  if (buildAnimations) await buildAnimationDonor(io, sourceRoot, outputRoot);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
