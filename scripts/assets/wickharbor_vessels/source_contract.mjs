import { createHash } from 'node:crypto';

export const FINGERPRINT_INPUTS = [
  'scripts/assets/wickharbor_vessels/prepare_sources.mjs',
  'scripts/assets/wickharbor_vessels/source_contract.mjs',
  'scripts/assets/wickharbor_vessels/upstream.json',
  'scripts/assets/wickharbor_vessels/build_rig_refinement.py',
  'scripts/assets/wickharbor_vessels/record_rig_refinement.mjs',
  'scripts/assets/wickharbor_vessels/refine_vessel.mjs',
  'scripts/assets/wickharbor_vessels/merge_vessel_patch.mjs',
  'scripts/assets/wickharbor_vessels/rig_refinement.json',
  'scripts/assets/specs/wickharbor_vessels.json',
  'scripts/assets/build_assets.mjs',
  'pnpm-lock.yaml',
];

export function sourceFingerprint(inputs) {
  const hash = createHash('sha256');
  for (const [name, bytes] of inputs) hash.update(name).update('\0').update(bytes).update('\0');
  return hash.digest('hex');
}
