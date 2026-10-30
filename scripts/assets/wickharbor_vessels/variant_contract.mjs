import { FINGERPRINT_INPUTS, sourceFingerprint } from './source_contract.mjs';

export const VARIANT_FINGERPRINT_INPUTS = [
  ...FINGERPRINT_INPUTS,
  'scripts/assets/wickharbor_vessels/build_fleet_rigs.py',
  'scripts/assets/wickharbor_vessels/fleet_rigs.json',
  'scripts/assets/wickharbor_vessels/fleet_rig.mjs',
  'scripts/assets/wickharbor_vessels/fleet_compositions.json',
  'scripts/assets/wickharbor_vessels/build_variants.py',
  'scripts/assets/wickharbor_vessels/sailship_variants.json',
  'scripts/assets/wickharbor_vessels/prepare_variants.mjs',
  'scripts/assets/wickharbor_vessels/record_variant_sources.mjs',
  'scripts/assets/wickharbor_vessels/variant_contract.mjs',
  'scripts/assets/wickharbor_vessels/variant_sources.json',
  'scripts/assets/wickharbor_vessels/upstream.json',
  'scripts/assets/wickharbor_vessels/source_contract.mjs',
  'scripts/assets/specs/wickharbor_sailship_variants.json',
  'scripts/assets/build_assets.mjs',
  'pnpm-lock.yaml',
];

export const variantFingerprint = sourceFingerprint;
