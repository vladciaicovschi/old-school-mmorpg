import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CLASSES } from '../../sim/data';
import type { PlayerClass } from '../../sim/types';
import type {
  EquipmentCalibrationLocation,
  EquipmentCalibrationMode,
  EquipmentCalibrationTarget,
  EquipmentCalibrationTransform,
} from '../../ui/equipment_calibration_core';
import { EQUIPMENT_CALIBRATION_TARGETS } from '../../ui/equipment_calibration_core';
import { GPU_WORK_PRIORITY } from '../background_gpu_queue';
import { trackWebGLContext } from '../context_release';
import { gpuPrepNow, recordGpuPrepEvent } from '../gpu_prep_events';
import {
  type LinkedProgramTouchQueue,
  PREVIEW_LINKED_PROGRAM_TOUCH_LABEL,
  runLinkedProgramTouchLane,
} from '../linked_program_touch_lane';
import { shaderDebugRequested } from '../shader_debug_flag';
import {
  collectPrewarmTextures,
  uploadTexturesInSlices,
  yieldToMainThread,
} from '../texture_prewarm';
import {
  applyEquipmentCalibrationPivotTransform,
  mechAssetsReady,
  preloadMechAssets,
} from './assets';
import { EquipmentCarryPreview } from './equipment_carry_preview';
import {
  MESHY_SENTINEL_VISUAL_KEY,
  modularVisualKey,
  VISUALS,
  type WeaponLayoutOverride,
} from './manifest';
import {
  type ArmorLoadout,
  type ModularAppearance,
  type ModularLook,
  modularBuildSignature,
} from './modular';
import {
  appearanceSignature,
  type PreviewAppearance,
  previewAppearanceVisual,
  previewPresentationPose,
} from './preview_appearance';
import { PREVIEW_FRAMING, type PreviewFramingName } from './preview_framing';
import { createPreviewOpenGate, type PreviewOpenGate } from './preview_open_gate_core';
import { characterPreviewFrameVisible, resolveCharacterPreviewPolicy } from './preview_policy';
import { CharacterVisual } from './visual';

export type { PreviewAppearance } from './preview_appearance';

/** The 2D layer the HUD paints over the empty canvas while the open gate
 *  holds. Structural on purpose: the DOM lives in src/ui/preview_stand_in.ts,
 *  so nothing here reaches into the UI layer. */
export interface PreviewOpenStandIn {
  show(): void;
  hide(): void;
}

/** The gpu-prep key the bounded escape records under. The existing
 *  `gate-timeout` KIND is reused rather than minting a preview-specific one:
 *  it already means "a compile gate's bounded fail-soft escape fired", which
 *  is exactly this, and every capture reader, perf-overlay row and test that
 *  enumerates GpuPrepEventKind keeps working with the union at four members. */
export const PREVIEW_OPEN_ESCAPE_EVENT_KEY = 'preview-open';

export interface CharacterPreviewPose {
  clips: readonly string[];
  fraction: number;
}

export interface CharacterPreviewOptions {
  constrainedMemory?: boolean;
}

const PREVIEW_ANIM_STATE = {
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  submerged: false,
  swimPitch: 0,
  wading: false,
  sitting: false,
};

const LIVE_PREVIEW_X = 0;

export class CharacterPreview {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private characterGroup: THREE.Group;
  private currentVisual: CharacterVisual | null = null;
  private currentVisualSig: string | null = null;
  private currentSkin = 0;
  // The active Armory weapon-skin cosmetic, persisted across visual rebuilds
  // exactly like currentSkin so a class/appearance swap keeps the skinned
  // weapon (the in-world renderer and the store preview both apply it; the
  // paperdoll must match or a purchased skin reads as missing).
  private currentWeaponSkinId: string | null = null;
  // Final local transforms of the held payload roots as first assembled for
  // the active visual. The equipment fitting panel resets against these and
  // edits the same bone children the live renderer draws.
  private equipmentDefaultTransforms = new Map<
    EquipmentCalibrationTarget,
    EquipmentCalibrationTransform
  >();
  // The fitting editor may freeze its known test subject on an exact pose.
  // The flag is retained while another preview visual is open, but only takes
  // effect while that visual was requested explicitly as the calibration
  // subject, so a paused editor never freezes the normal character roster.
  private equipmentCalibrationActive = false;
  private equipmentCarryPreview: EquipmentCarryPreview | null = null;
  private equipmentCalibrationAnimationFrozen = false;
  private presentationAnimationFrozen = false;
  private presentationPoseSig: string | null = null;
  private presentationPose: ReturnType<typeof previewPresentationPose> = null;
  private equipmentManipulator: TransformControls | null = null;
  private equipmentManipulatorHelper: THREE.Object3D | null = null;
  private equipmentManipulatorObject: THREE.Object3D | null = null;
  private equipmentManipulatorChange: ((transform: EquipmentCalibrationTransform) => void) | null =
    null;
  // Identity of the appearance last requested via setAppearance, so an async mech
  // re-apply can bail out if a newer selection superseded it.
  private appearanceSig: string | null = null;
  /** Look handed to the next modular rebuild (setVisualKey reads it back). */
  private pendingLook: ModularLook | null = null;
  // THREE.Timer, not the r183-deprecated Clock: update() advances it once per
  // frame, reset() re-anchors it after a non-animating span (Clock's
  // discard-getDelta drain pattern).
  private timer = new THREE.Timer();
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unregisterContext: (() => void) | null = null;
  private cleanupDragControls: (() => void) | null = null;
  // Player-card shots render into a fixed offscreen target. Resizing the live
  // WebGL canvas forced a synchronous framebuffer reallocation (up to ~85 ms on
  // mobile GPUs) on every pose change. The target and readback buffer are kept
  // warm instead, and captures are serialized so concurrent pose clicks cannot
  // overwrite a readback that is still in flight.
  private captureTarget: THREE.WebGLRenderTarget | null = null;
  private capturePixels: Uint8Array | null = null;
  private captureQueue: Promise<void> = Promise.resolve();
  private closeupCache = new Map<string, HTMLCanvasElement>();
  // ResizeObserver owns this flag: a preview moved below a display:none window
  // keeps one cheap rAF subscription but performs no animation or WebGL work.
  private renderActive = false;
  // Set while prewarm() owns the renderer's buffer size for a warmup pass.
  private prewarming = false;
  // The latest activation request (from setContainer/the resize observer,
  // via syncSize) that arrived while prewarming; applied by prewarm's finally
  // instead of the renderActive it captured at entry, so a window opened or
  // closed mid-warmup is never clobbered back to a stale snapshot.
  private pendingActive: boolean | null = null;
  // The cold-open gate: while it is armed, both live draw sites (syncSize and
  // the animate loop) withhold their render and the HUD's stand-in covers the
  // empty canvas. It also carries the linked signature prewarm() shares.
  private openGate: PreviewOpenGate = createPreviewOpenGate();
  private standIn: PreviewOpenStandIn | null = null;
  // The WORLD renderer's background GPU queue, injected by the HUD. Right on a
  // foreign context because the queue arbitrates MAIN-THREAD time, not
  // programs: a getUniforms/getAttributes round trip blocks the same thread
  // and the same frame whichever context owns the program.
  private touchQueue: LinkedProgramTouchQueue | null = null;
  private yieldToMain: () => Promise<void> = yieldToMainThread;
  private destroyed = false;

  // Drag controls
  private isDragging = false;
  private previousMouseX = 0;

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    options: CharacterPreviewOptions = {},
  ) {
    this.container = container;
    this.canvas = canvas;
    // The launcher owns one canvas and moves it between online, creation and
    // offline hosts. A player can open a panel before its async assets finish;
    // in that race the preview is constructed for the newly visible host while
    // the canvas still belongs to the old hidden host. Constructor-time
    // ownership must therefore match setContainer(), not merely assume the
    // caller already moved the shared node.
    if (this.canvas.parentElement !== this.container) this.container.appendChild(this.canvas);
    const policy = resolveCharacterPreviewPolicy(options.constrainedMemory === true);

    // 1. Initialize WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: policy.antialias,
      preserveDrawingBuffer: policy.preserveDrawingBuffer,
    });
    this.renderer.debug.checkShaderErrors = shaderDebugRequested();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, policy.pixelRatioCap));
    const initialWidth = this.container.clientWidth;
    const initialHeight = this.container.clientHeight;
    this.renderer.setSize(initialWidth, initialHeight, false);
    this.renderActive = initialWidth > 0 && initialHeight > 0;
    this.renderer.shadowMap.enabled = false; // Preview doesn't need heavy shadows
    // Hand this context back on page teardown (see context_release.ts).
    this.unregisterContext = trackWebGLContext(this.renderer);

    // 2. Initialize Scene
    this.scene = new THREE.Scene();

    // 3. Initialize Camera
    const aspect =
      this.container.clientHeight > 0
        ? this.container.clientWidth / this.container.clientHeight
        : 1;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    // Default to the self character-sheet framing; the inspect window switches to
    // its pulled-back framing via setFraming('inspect') on mount.
    this.applyFraming(PREVIEW_FRAMING.sheet);

    // 4. Initialize Character Group
    this.characterGroup = new THREE.Group();
    this.scene.add(this.characterGroup);

    // 5. Add Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    this.scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight1.position.set(3, 5, 4);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-3, 3, -4);
    this.scene.add(dirLight2);

    // 6. Setup Drag Controls
    this.setupDragControls();

    // 7. Setup Resize Observer
    this.setupResizeObserver();

    // 8. Start loop
    this.animate();
  }

  /** Set the active character model by player class. Pass explicit hand ids for a
   *  character sheet; omit them to show the class starter equipment in creation. */
  setClass(cls: PlayerClass, weaponItemId?: string | null, offhandItemId?: string | null): void {
    if (this.destroyed) return;
    this.clearPresentationPose();
    // A class-driven selection (create/offline picker, or a panel switch) supersedes
    // any pending async mech re-apply, so invalidate the tracked appearance.
    this.appearanceSig = null;
    const weapon = weaponItemId !== undefined ? weaponItemId : (CLASSES[cls].startWeapon ?? null);
    const offhand =
      offhandItemId !== undefined ? offhandItemId : (CLASSES[cls].startOffhand ?? null);
    this.setVisualKey(`player_${cls}`, weapon, null, offhand);
  }

  /** Legacy shortcut for the Sentinel technical fitting subject. The normal
   *  studio calls setEquipmentCalibrationVisual with a T1 class key instead. */
  setEquipmentCalibrationTitan(): void {
    this.setEquipmentCalibrationVisual(MESHY_SENTINEL_VISUAL_KEY);
  }

  /** Show a manifest body in the weapon-positioning studio. Player class keys
   * use their real starter main/offhand loadout; technical subjects retain
   * their authored test loadout. The saved transform therefore applies to the
   * same payload the game attaches at runtime. */
  setEquipmentCalibrationVisual(
    visualKey: string,
    loadout?: { mainhandItemId: string; offhandItemId: string | null },
  ): void {
    if (this.destroyed) return;
    this.clearPresentationPose();
    this.appearanceSig = null;
    this.pendingLook = null;
    this.currentSkin = 0;
    this.currentWeaponSkinId = null;
    const usesEditorLoadout = visualKey === MESHY_SENTINEL_VISUAL_KEY;
    const classId = visualKey.startsWith('player_')
      ? (visualKey.slice('player_'.length) as PlayerClass)
      : null;
    const classLoadout = classId && Object.hasOwn(CLASSES, classId) ? CLASSES[classId] : null;
    this.setVisualKey(
      visualKey,
      loadout?.mainhandItemId ??
        classLoadout?.startWeapon ??
        (usesEditorLoadout ? 'worn_sword' : null),
      null,
      loadout
        ? loadout.offhandItemId
        : (classLoadout?.startOffhand ?? (usesEditorLoadout ? 'eastbrook_buckler' : null)),
      true,
    );
  }

  /** Show a character's real, in-world appearance: the class rig or the Combat Mech
   *  cosmetic body, its appearance skin, and the actually-equipped hands. Mirrors
   *  createCharacterVisual so the char-select roster and character sheet match the
   *  world. The mech's cosmetic assets load
   *  lazily; while they are not ready this shows the class body and re-applies once
   *  loaded, unless a newer selection has superseded this one. */
  setAppearance(a: PreviewAppearance): void {
    if (this.destroyed) return;
    this.currentSkin = a.skin;
    this.currentWeaponSkinId = a.weaponSkinId ?? null;
    const sig = appearanceSignature(a);
    this.appearanceSig = sig;
    if (a.skinCatalog === 'mech' && !mechAssetsReady()) {
      // The temporary class body must use the same equipped hands as the
      // eventual mech body, so the pose never appears without its weapon while
      // the cosmetic bundle is still arriving.
      const fallback = previewAppearanceVisual(a);
      this.setVisualKey(
        `player_${a.cls}`,
        fallback.weaponItemId,
        null,
        fallback.offhandItemId,
        false,
        true,
      );
      this.currentVisual?.setSkin(a.skin);
      this.applyPresentationPose({ ...a, skinCatalog: 'class' });
      void preloadMechAssets().then(() => {
        if (!this.destroyed && this.appearanceSig === sig) this.setAppearance(a);
      });
      return;
    }
    const v = previewAppearanceVisual(a);
    this.setVisualKey(v.visualKey, v.weaponItemId, v.weaponOverride, v.offhandItemId, false, true);
    // setVisualKey is intentionally idempotent. If only the skin changed, keep
    // the warm rig and update its shared material bindings in place.
    this.currentVisual?.setSkin(a.skin);
    this.applyPresentationPose(a);
  }

  private applyPresentationPose(a: PreviewAppearance): void {
    const pose = previewPresentationPose(a);
    this.currentVisual?.setWeaponStowed(a.presentation === 'charselect', true);
    const sig = pose ? JSON.stringify(pose) : null;
    if (sig === this.presentationPoseSig && this.presentationAnimationFrozen) return;
    this.presentationPoseSig = sig;
    this.presentationPose = pose;
    this.presentationAnimationFrozen = false;
    if (!pose) {
      this.currentVisual?.clearPose?.();
      return;
    }
    this.presentationAnimationFrozen =
      (this.currentVisual?.poseFreeze?.(pose.clips, pose.fraction) ?? null) !== null;
  }

  /** Shared preview also serves live sheets and the fitting editor. */
  private clearPresentationPose(): void {
    if (!this.presentationPose) return;
    this.presentationPose = null;
    this.presentationPoseSig = null;
    this.presentationAnimationFrozen = false;
    this.currentVisual?.clearPose();
    this.currentVisual?.setWeaponStowed(false, true);
  }

  /** Set the active model by raw visual key (e.g. `player_mech` for the cosmetic
   *  turntable). The asset must already be loaded — callers preload first.
   *  `weaponOverride` lets a cosmetic body adopt a class hand layout (including
   *  shields and dual wield), matching the in-world render. */
  /** Show the composed modular body (character creation's live turntable) for
   *  a class: its modular def carries the class clips and hand layout, and the
   *  starter weapons default from the class. Any change to gender/hair/brows/
   *  colour is a geometry or material change on a shared cached variant, so
   *  this just rebuilds, the variant cache makes a repeat selection nearly
   *  free. */
  setModular(
    app: ModularAppearance,
    worn: ArmorLoadout = {},
    cls: PlayerClass = 'warrior',
    weaponItemId?: string | null,
    // Both hands default to the class starters (creation, where nothing is
    // equipped yet). The character sheet passes what is ACTUALLY worn, so the
    // composed turntable holds the same shield / dual wield the world draws.
    offhandItemId?: string | null,
  ): void {
    if (this.destroyed) return;
    this.clearPresentationPose();
    this.appearanceSig = null;
    this.pendingLook = { app, worn };
    const weapon = weaponItemId !== undefined ? weaponItemId : (CLASSES[cls].startWeapon ?? null);
    const offhand =
      offhandItemId !== undefined ? offhandItemId : (CLASSES[cls].startOffhand ?? null);
    this.setVisualKey(modularVisualKey(cls), weapon, null, offhand);
    // The face/body sliders ride the live body rather than the rebuild
    // signature (see modularBuildSignature): the creator emits on every `input`
    // event, so a drag would otherwise dispose and recompose the character per
    // 5% step. Harmless after a rebuild, which composed with these already.
    this.currentVisual?.applyModularSliders(app);
  }

  setVisualKey(
    visualKey: string,
    weaponItemId: string | null = null,
    weaponOverride: WeaponLayoutOverride | null = null,
    offhandItemId: string | null = null,
    equipmentCalibrationActive = false,
    appearanceManaged = false,
  ): void {
    if (this.destroyed) return;
    if (!appearanceManaged) this.clearPresentationPose();
    this.equipmentCalibrationActive = equipmentCalibrationActive;
    if (!equipmentCalibrationActive) this.clearEquipmentCalibrationManipulator();
    const look = VISUALS[visualKey]?.modular ? this.pendingLook : null;
    const nextSig = JSON.stringify([
      visualKey,
      weaponItemId,
      weaponOverride,
      offhandItemId,
      equipmentCalibrationActive,
      look ? modularBuildSignature(look.app, look.worn) : null,
    ]);
    if (this.currentVisual && this.currentVisualSig === nextSig) return;
    this.presentationPoseSig = null;
    this.presentationAnimationFrozen = false;
    this.closeupCache.clear();
    if (this.currentVisual) {
      this.equipmentManipulator?.detach();
      this.equipmentManipulatorObject = null;
      // CharacterVisual keeps shared geometry/material caches but owns its
      // mixer and cloned skeleton bone textures, so a genuine replacement must
      // release those resources.
      this.characterGroup.remove(this.currentVisual.root);
      this.currentVisual.dispose();
      this.currentVisual = null;
      this.equipmentCarryPreview = null;
      this.equipmentDefaultTransforms.clear();
      // three releases a program with the last material holding it, so a
      // signature linked before this rebuild can be cold again afterwards:
      // the gate must not skip the warm on a return to an old look.
      this.openGate.forgetLinked();
    }
    this.currentVisualSig = null;

    try {
      this.currentVisual = new CharacterVisual(
        visualKey,
        0xffffff,
        this.currentSkin,
        weaponItemId,
        weaponOverride,
        offhandItemId,
        look,
        undefined,
        equipmentCalibrationActive
          ? {
              helmet: 'equipment_fit',
              shoulder: 'equipment_fit',
              chest: 'equipment_fit',
              waist: 'equipment_fit',
              legs: 'equipment_fit',
              gloves: 'equipment_fit',
              feet: 'equipment_fit',
            }
          : {},
        false,
      );
      this.currentVisualSig = nextSig;
      this.characterGroup.add(this.currentVisual.root);
      this.equipmentCarryPreview = equipmentCalibrationActive
        ? new EquipmentCarryPreview(
            this.currentVisual.root,
            VISUALS[visualKey]?.carriedAttachmentFit,
            visualKey,
          )
        : null;
      this.captureEquipmentDefaults();
      // Re-apply the persisted weapon-skin cosmetic to the rebuilt visual (the
      // constructor attaches the equipped item's own model).
      if (this.currentWeaponSkinId) this.currentVisual.setWeaponSkin(this.currentWeaponSkinId);

      // Reset rotation on a class swap so every new character greets the player
      // FACE-ON (the classic character-screen pose); dragging still spins freely.
      this.characterGroup.rotation.y = 0;
    } catch (err) {
      console.error(`Failed to load preview character visual for ${visualKey}:`, err);
    }
  }

  /** Apply or clear the Armory weapon-skin cosmetic; persists across
   *  setClass/setVisualKey rebuilds like the body skin. */
  setWeaponSkin(weaponSkinId: string | null): void {
    if (this.destroyed) return;
    this.currentWeaponSkinId = weaponSkinId;
    this.currentVisual?.setWeaponSkin(weaponSkinId);
  }

  /** Read the shipped or current final local transform of a held payload. The
   *  coordinates are relative to the hand bone after every grip adapter and
   *  rig-specific correction has run. */
  equipmentCalibrationTransform(
    slot: EquipmentCalibrationTarget,
    defaults = false,
  ): EquipmentCalibrationTransform | null {
    if (defaults) {
      const carry = this.equipmentCarryPreview?.defaultTransform(slot);
      if (carry) return carry;
      const transform = this.equipmentDefaultTransforms.get(slot);
      return transform ? this.cloneEquipmentTransform(transform) : null;
    }
    const payload = this.equipmentPayload(slot);
    return payload ? this.equipmentTransformOf(payload) : null;
  }

  /** Apply an editor fit directly to the held payload root. No character or
   *  animation rebuild is involved, so slider input remains immediate. */
  setEquipmentCalibrationTransform(
    slot: EquipmentCalibrationTarget,
    transform: EquipmentCalibrationTransform,
  ): boolean {
    if (this.destroyed) return false;
    const payload = this.equipmentPayload(slot);
    if (!payload) return false;
    const base = this.equipmentBasePosition(payload);
    payload.position.set(
      base[0] + transform.position[0],
      base[1] + transform.position[1],
      base[2] + transform.position[2],
    );
    payload.rotation.set(
      THREE.MathUtils.degToRad(transform.rotationDeg[0]),
      THREE.MathUtils.degToRad(transform.rotationDeg[1]),
      THREE.MathUtils.degToRad(transform.rotationDeg[2]),
      'XYZ',
    );
    payload.scale.setScalar(transform.scale);
    payload.updateMatrix();
    payload.updateMatrixWorld(true);
    applyEquipmentCalibrationPivotTransform(payload);
    this.closeupCache.clear();
    return true;
  }

  /** Freeze or resume the fitting subject without stopping preview rendering,
   *  so camera dragging and live equipment transforms keep working. */
  setEquipmentCalibrationAnimationPaused(paused: boolean): void {
    this.equipmentCalibrationAnimationFrozen = paused;
  }

  setEquipmentCalibrationCarryLocation(location: EquipmentCalibrationLocation): void {
    this.clearEquipmentCalibrationManipulator();
    this.equipmentCarryPreview?.setLocation(location);
    if (location === 'hand') this.currentVisual?.stopStudioPreviewClip();
    else if (this.currentVisual?.availableAnimationClips().includes('Warrior_TravelIdle'))
      this.currentVisual.playStudioPreviewClip('Warrior_TravelIdle');
    this.closeupCache.clear();
  }

  equipmentCalibrationAnimationPaused(): boolean {
    return this.equipmentCalibrationAnimationFrozen;
  }

  /** The fitting studio lists only actions actually loaded on its current rig. */
  equipmentCalibrationAnimationClips(): readonly string[] {
    return this.currentVisual?.availableAnimationClips() ?? [];
  }

  playEquipmentCalibrationAnimation(clip: string): boolean {
    if (this.destroyed || !this.equipmentCalibrationActive) return false;
    this.equipmentCalibrationAnimationFrozen = false;
    return this.currentVisual?.playStudioPreviewClip(clip) ?? false;
  }

  stopEquipmentCalibrationAnimation(): void {
    this.currentVisual?.stopStudioPreviewClip();
  }

  /** Attach a standard Three.js transform gizmo to the selected held payload.
   *  Scale keeps its numeric-only workflow because the editor stores one
   *  uniform scalar, while TransformControls exposes independent XYZ scale. */
  setEquipmentCalibrationManipulator(
    slot: EquipmentCalibrationTarget,
    mode: Exclude<EquipmentCalibrationMode, 'scale'>,
    onChange: (transform: EquipmentCalibrationTransform) => void,
  ): boolean {
    if (this.destroyed || !this.equipmentCalibrationActive) return false;
    const payload = this.equipmentPayload(slot);
    if (!payload) {
      this.clearEquipmentCalibrationManipulator();
      return false;
    }
    const controls = this.ensureEquipmentCalibrationManipulator();
    this.equipmentManipulatorObject = payload;
    this.equipmentManipulatorChange = onChange;
    controls.setMode(mode === 'position' ? 'translate' : 'rotate');
    controls.setSpace('local');
    payload.updateWorldMatrix(true, true);
    controls.attach(payload);
    return true;
  }

  clearEquipmentCalibrationManipulator(): void {
    this.equipmentManipulator?.detach();
    this.equipmentManipulatorObject = null;
    this.equipmentManipulatorChange = null;
    this.isDragging = false;
  }

  private ensureEquipmentCalibrationManipulator(): TransformControls {
    if (this.equipmentManipulator) return this.equipmentManipulator;
    const controls = new TransformControls(this.camera, this.canvas);
    controls.setSize(0.78);
    controls.setSpace('local');
    controls.addEventListener('dragging-changed', (event) => {
      if (event.value === true) this.isDragging = false;
    });
    controls.addEventListener('objectChange', () => {
      if (!this.equipmentManipulatorObject || !this.equipmentManipulatorChange) return;
      this.equipmentManipulatorChange(this.equipmentTransformOf(this.equipmentManipulatorObject));
    });
    const helper = controls.getHelper();
    this.scene.add(helper);
    this.equipmentManipulator = controls;
    this.equipmentManipulatorHelper = helper;
    return controls;
  }

  private equipmentPayload(slot: EquipmentCalibrationTarget): THREE.Object3D | null {
    if (slot.startsWith('mainhand_')) slot = 'mainhand';
    else if (slot.startsWith('offhand_')) slot = 'offhand';
    if (slot !== 'mainhand' && slot !== 'offhand') {
      let pivot: THREE.Object3D | null = null;
      this.currentVisual?.root.traverse((object) => {
        if (pivot === null && object.userData.equipmentCalibrationTarget === slot) pivot = object;
      });
      return pivot;
    }
    const heldSlot = slot === 'mainhand' ? 0 : 1;
    let found: THREE.Object3D | null = null;
    this.currentVisual?.root.traverse((object) => {
      if (found === null && object.userData.heldSlot === heldSlot) found = object;
    });
    return found;
  }

  private equipmentTransformOf(payload: THREE.Object3D): EquipmentCalibrationTransform {
    const euler = new THREE.Euler().setFromQuaternion(payload.quaternion, 'XYZ');
    const base = this.equipmentBasePosition(payload);
    return {
      position: [
        payload.position.x - base[0],
        payload.position.y - base[1],
        payload.position.z - base[2],
      ],
      rotationDeg: [
        THREE.MathUtils.radToDeg(euler.x),
        THREE.MathUtils.radToDeg(euler.y),
        THREE.MathUtils.radToDeg(euler.z),
      ],
      scale: payload.scale.x,
    };
  }

  private equipmentBasePosition(payload: THREE.Object3D): readonly [number, number, number] {
    const value = payload.userData.equipmentCalibrationBasePosition;
    return Array.isArray(value) && value.length === 3
      ? [Number(value[0]), Number(value[1]), Number(value[2])]
      : [0, 0, 0];
  }

  private cloneEquipmentTransform(
    transform: EquipmentCalibrationTransform,
  ): EquipmentCalibrationTransform {
    return {
      position: [...transform.position],
      rotationDeg: [...transform.rotationDeg],
      scale: transform.scale,
    };
  }

  private captureEquipmentDefaults(): void {
    this.equipmentDefaultTransforms.clear();
    for (const slot of EQUIPMENT_CALIBRATION_TARGETS) {
      if (slot.endsWith('_hip') || slot.endsWith('_back')) continue;
      const payload = this.equipmentPayload(slot);
      if (payload) this.equipmentDefaultTransforms.set(slot, this.equipmentTransformOf(payload));
    }
  }

  /** Swap the previewed skin (alternate body texture); persists across setClass. */
  setSkin(skinIndex: number): void {
    if (this.destroyed) return;
    // Same invalidation as setClass: a standalone skin change (dataset fallback,
    // char-create skin hover) is not the appearance a pending mech re-apply targets.
    this.appearanceSig = null;
    if (this.currentSkin === skinIndex) return;
    this.currentSkin = skinIndex;
    this.closeupCache.clear();
    this.currentVisual?.setSkin(skinIndex);
  }

  /** Dynamically shift the canvas to a new container */
  setContainer(container: HTMLElement): void {
    if (this.destroyed) return;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.container = container;
    this.container.appendChild(this.canvas);

    this.syncSize();

    // Re-observe the new container
    this.setupResizeObserver();
  }

  /** Switch the camera framing (see preview_framing.ts). The self character sheet
   *  uses 'sheet' (close, face-on); the inspect window uses 'inspect' (pulled back
   *  so a tall silhouette stays framed). Re-asserted on every mount so reopening
   *  the character sheet after inspecting restores the close framing. */
  setFraming(name: PreviewFramingName): void {
    if (this.destroyed) return;
    this.applyFraming(PREVIEW_FRAMING[name]);
  }

  private applyFraming(f: { y: number; z: number; lookY: number }): void {
    this.camera.position.set(LIVE_PREVIEW_X, f.y, f.z);
    this.camera.lookAt(new THREE.Vector3(LIVE_PREVIEW_X, f.lookY, 0));
    this.camera.updateProjectionMatrix();
  }

  /** Force the renderer to match the current visible container size. */
  syncSize(): void {
    if (this.destroyed) return;
    if (this.prewarming) {
      // prewarm() owns the renderer's buffer size until it finishes; record
      // the request instead of resizing out from under it, and let prewarm's
      // finally apply it once the buffer is the live preview's own again.
      this.pendingActive = this.container.clientWidth > 0 && this.container.clientHeight > 0;
      return;
    }
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderActive = width > 0 && height > 0;
    if (width > 0 && height > 0) {
      // The buffer, camera and aspect still follow the container while the
      // open gate holds: only the DRAW waits, so the reveal needs no resize.
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      if (this.gateAllowsDraw()) this.renderer.render(this.scene, this.camera);
    } else {
      this.standDownOpenGate();
    }
  }

  /** Inject the world renderer's background GPU queue, the one arbiter that
   *  paces main-thread preparation work. Without it the open gate still links
   *  and uploads; only its touch tail is skipped. */
  setTouchQueue(queue: LinkedProgramTouchQueue | null): void {
    this.touchQueue = queue;
  }

  /** The visual signature whose programs are linked on this context, written
   *  by BOTH prewarm() and the open gate so neither compiles what the other
   *  already did. */
  get linkedVisualSig(): string | null {
    return this.openGate.linkedSig();
  }

  /**
   * Arm the cold-open gate for whatever is mounted right now: hold both draw
   * sites, show `standIn`, then link, upload and touch before the first frame
   * the player sees. A no-op when the mounted signature is already linked (the
   * warm open, and the reason nothing pays twice).
   *
   * Called from every mount (Hud.mountSharedPreview), so the sheet, the skin
   * picker and Inspect all arm on the same rule; Inspect is the case the
   * background lane can never cover, because it mounts a peer's class rig this
   * context may never have linked.
   */
  armOpen(standIn: PreviewOpenStandIn | null = null): void {
    if (this.destroyed) return;
    const sig = this.currentVisualSig;
    if (!this.openGate.arm(sig, gpuPrepNow())) return;
    this.hideStandIn();
    // Always, even for a rebuild in the SAME container: setContainer and the
    // resize observer both run syncSize first, and setSize reassigns
    // canvas.width, which CLEARS the drawing buffer. There is no retained
    // frame left to stand in for the armed window, only a black panel.
    this.standIn = standIn;
    standIn?.show();
    const token = this.openGate.beginWarm();
    if (token === null) return;
    void this.prepareOpen(token, sig);
  }

  /** LINK, then UPLOAD, then TOUCH, then reveal. compileAsync in three r185
   *  both submits and polls COMPLETION_STATUS_KHR, so its resolution IS the
   *  settle and no separate wait step exists; the touch tail is what removes
   *  the first-use uniform-table query the reveal draw would otherwise pay. */
  private async prepareOpen(token: number, sig: string | null): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.destroyed) return;
      const textures = new Set<THREE.Texture>();
      collectPrewarmTextures(this.scene, textures);
      await uploadTexturesInSlices(this.renderer, textures, {
        yieldToMain: this.yieldToMain,
        isCancelled: () => this.destroyed,
      });
      if (this.destroyed) return;
      // ACTIONABLE_VIEW because a player CLICKED: the actionable floor is what
      // guarantees the open is never starved behind background preparation,
      // and one budgeted piece per program is what keeps a 15 to 17 ms driver
      // round trip out of the frame that carries the click.
      if (this.touchQueue) {
        await runLinkedProgramTouchLane(
          this.touchQueue,
          this.renderer.properties,
          this.characterGroup,
          GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
          // settled: the compileAsync above was awaited to completion, which is
          // what proves this context's programs linked.
          { label: PREVIEW_LINKED_PROGRAM_TOUCH_LABEL, settled: true },
        );
      }
    } catch (err) {
      // Fail-soft, like every other gate here: a refused context or a rejected
      // compile must reveal the character, never strand the panel empty.
      console.warn('[preview] cold-open warm failed', err);
    } finally {
      if (!this.destroyed && this.openGate.finishWarm(token, sig)) this.revealOpen();
    }
  }

  /** Whether a live draw site may draw, and the one place the bounded escape
   *  fires: past the soft deadline the gate releases, the escape is recorded
   *  once, and the frame draws whatever is ready. */
  private gateAllowsDraw(): boolean {
    const now = gpuPrepNow();
    const escapedAgeMs = this.openGate.takeEscape(now);
    if (escapedAgeMs !== null) {
      recordGpuPrepEvent({
        kind: 'gate-timeout',
        key: PREVIEW_OPEN_ESCAPE_EVENT_KEY,
        ageMs: escapedAgeMs,
      });
      this.hideStandIn();
    }
    return this.openGate.shouldRender(now);
  }

  private revealOpen(): void {
    this.hideStandIn();
    if (!this.renderActive) return;
    this.renderer.render(this.scene, this.camera);
  }

  private hideStandIn(): void {
    this.standIn?.hide();
    this.standIn = null;
  }

  /** The preview stopped drawing: its window closed, or its container was
   *  unmounted. Both draw sites are unreachable now, so the bounded escape can
   *  never fire and an armed gate would strand the stand-in layer and its
   *  aria-busy on a hidden container until the next mount. Drop the hold with
   *  it; the next mount arms again, and a warm still in flight records nothing
   *  because cancel() supersedes its arm. */
  private standDownOpenGate(): void {
    if (!this.openGate.isArmed() && !this.standIn) return;
    this.openGate.cancel();
    this.hideStandIn();
  }

  /** Compile and upload the current preview while a loading screen is visible.
   *  The hidden character window has no layout size, so use a temporary small
   *  drawing buffer and restore it without ever exposing the warmup frame. */
  async prewarm(skinIndices: readonly number[] = [this.currentSkin]): Promise<void> {
    if (this.destroyed || !this.currentVisual) return;
    const previousSize = new THREE.Vector2();
    this.renderer.getSize(previousSize);
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousAspect = this.camera.aspect;
    const previousSkin = this.currentSkin;
    const wasActive = this.renderActive;
    // What this pass linked, if anything: its touch tail runs after the
    // warmup buffer is handed back (see below).
    let compiledSig: string | null = null;
    this.renderActive = false;
    this.prewarming = true;
    this.pendingActive = null;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(320, 400, false);
      this.camera.aspect = 320 / 400;
      this.camera.updateProjectionMatrix();
      this.currentVisual.update(0, PREVIEW_ANIM_STATE, true);
      // One linked signature, shared with the open gate: a scheduled warm and
      // a player's open never compile the same visual twice, and the per-skin
      // units after the first still do their texture work while skipping a
      // compile that would link nothing new.
      const warmSig = this.currentVisualSig;
      if (!this.openGate.isLinked(warmSig)) {
        await this.renderer.compileAsync(this.scene, this.camera);
        compiledSig = warmSig;
      }
      // A chroma swap rebinds body textures. Upload every class variant now so
      // clicking a skin swatch cannot turn the preview's next rAF into a first-
      // use texture upload. The uploads themselves are prepaid in bounded
      // slices before each draw: a cold skin's render otherwise pays them all
      // in one synchronous block (128 to 155 ms per paced unit in production).
      const textures = new Set<THREE.Texture>();
      for (const skin of new Set(skinIndices)) {
        if (this.destroyed) break;
        this.currentVisual.setSkin(skin);
        textures.clear();
        collectPrewarmTextures(this.scene, textures);
        await uploadTexturesInSlices(this.renderer, textures, {
          yieldToMain: yieldToMainThread,
          isCancelled: () => this.destroyed,
        });
        if (this.destroyed) break;
        this.renderer.render(this.scene, this.camera);
        await yieldToMainThread();
      }
    } finally {
      this.currentSkin = previousSkin;
      this.currentVisual?.setSkin(previousSkin);
      this.renderer.setPixelRatio(previousPixelRatio);
      this.renderer.setSize(Math.max(1, previousSize.x), Math.max(1, previousSize.y), false);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      this.prewarming = false;
      // setContainer/the resize observer may have arrived mid-prewarm (the
      // window opened or closed while this buffer was repurposed for
      // warmup); apply that request instead of the wasActive snapshot
      // captured at entry, and resync to the real container size rather than
      // the stale pre-warmup size just restored above.
      const requestedActive = this.pendingActive;
      this.pendingActive = null;
      this.renderActive = requestedActive ?? wasActive;
      if (requestedActive !== null) this.syncSize();
      this.timer.reset();
    }
    // The tail, OUTSIDE the warmup window: it only walks programs that are
    // already linked, and holding the live preview inactive across a paced
    // per-program lane would keep the panel dark if the player opened the
    // sheet mid-warm.
    //
    // The signature counts as linked only once that tail has run, because the
    // skip it grants makes a later open bypass armOpen entirely, tail
    // included, and an open with no tail pays the first-use uniform-table
    // query per program (15 to 17 ms each on the Intel iGPU) inside the frame
    // that carries the click. With no queue injected there is no tail here, so
    // nothing is recorded and the open gate still touches.
    if (compiledSig === null || !this.touchQueue || this.destroyed) return;
    await runLinkedProgramTouchLane(
      this.touchQueue,
      this.renderer.properties,
      this.characterGroup,
      GPU_WORK_PRIORITY.BACKGROUND,
      // settled: reached only with a compiledSig, i.e. after the awaited
      // compileAsync above resolved for this signature.
      { label: PREVIEW_LINKED_PROGRAM_TOUCH_LABEL, settled: true },
    );
    // A rebuild in between released those programs (forgetLinked): what this
    // pass warmed is no longer what is mounted, so it records nothing.
    if (!this.destroyed && this.currentVisualSig === compiledSig) {
      this.openGate.noteLinked(compiledSig);
    }
  }

  /** Warm the exact offscreen player-card path while the loading screen is up. */
  async prewarmCloseupPoses(poses: readonly CharacterPreviewPose[]): Promise<void> {
    if (this.destroyed || !this.currentVisual) return;
    for (const pose of poses) {
      await this.captureCloseup({
        poseClips: pose.clips,
        poseFraction: pose.fraction,
      });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  private setupDragControls(): void {
    const onMouseDown = (e: MouseEvent) => {
      const manipulator = this.equipmentManipulator;
      if (manipulator && (manipulator.dragging || manipulator.axis !== null)) return;
      this.isDragging = true;
      this.previousMouseX = e.clientX;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || this.equipmentManipulator?.dragging) return;
      const deltaX = e.clientX - this.previousMouseX;
      this.characterGroup.rotation.y += deltaX * 0.01;
      this.previousMouseX = e.clientX;
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      const manipulator = this.equipmentManipulator;
      if (manipulator && (manipulator.dragging || manipulator.axis !== null)) return;
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.previousMouseX = e.touches[0].clientX;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDragging || this.equipmentManipulator?.dragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - this.previousMouseX;
      this.characterGroup.rotation.y += deltaX * 0.01;
      this.previousMouseX = e.touches[0].clientX;
    };

    const onTouchEnd = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    this.canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    this.cleanupDragControls = () => {
      this.canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.syncSize();
    });
    this.resizeObserver.observe(this.container);
  }

  private animate = (): void => {
    if (this.destroyed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    if (
      !characterPreviewFrameVisible(
        this.canvas.isConnected,
        this.container.clientWidth,
        this.container.clientHeight,
      )
    ) {
      // Re-anchor the timer while hidden so reopening cannot produce a large
      // animation step.
      this.timer.reset();
      this.standDownOpenGate();
      return;
    }

    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1); // cap dt to prevent huge jumps
    if (!this.renderActive) return;
    // The second live draw site: a gate covering only syncSize is not a gate,
    // because the loop draws the same cold scene on the very next frame.
    if (!this.gateAllowsDraw()) return;

    // No idle auto-rotation: the character holds its face-on pose (the classic
    // character-screen behavior) and only the player's drag spins the turntable.

    // Update animations inside visual
    if (
      this.currentVisual &&
      !(this.equipmentCalibrationActive && this.equipmentCalibrationAnimationFrozen) &&
      !this.presentationAnimationFrozen
    ) {
      this.currentVisual.update(dt, PREVIEW_ANIM_STATE, true);
    }
    // A visual may have been mounted before its donor actions finished loading.
    // Keep trying the selected roster pose until the first valid action exists.
    if (!this.presentationAnimationFrozen && this.presentationPose) {
      this.presentationAnimationFrozen =
        (this.currentVisual?.poseFreeze?.(
          this.presentationPose.clips,
          this.presentationPose.fraction,
        ) ?? null) !== null;
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Render a single crisp, deterministic close-up of the current character and
   * return it as an unencoded 2D canvas. Used to stamp the player's avatar onto
   * the shareable player card without an intermediate PNG encode/decode cycle.
   *
   * The scene is rendered into a persistent offscreen target, then copied back
   * asynchronously through a pixel-pack buffer. The live preview canvas is never
   * resized or repainted with the card pose, avoiding both framebuffer stalls and
   * visible intermediate frames.
   */
  captureCloseup(
    opts: {
      width?: number;
      height?: number;
      angle?: number;
      poseClips?: readonly string[];
      poseFraction?: number;
    } = {},
  ): Promise<HTMLCanvasElement> {
    const request = {
      ...opts,
      poseClips: opts.poseClips ? [...opts.poseClips] : undefined,
    };
    const capture = this.captureQueue.then(() => this.captureCloseupNow(request));
    this.captureQueue = capture.then(
      () => undefined,
      () => undefined,
    );
    return capture;
  }

  private async captureCloseupNow(
    opts: {
      width?: number;
      height?: number;
      angle?: number;
      poseClips?: readonly string[];
      poseFraction?: number;
    } = {},
  ): Promise<HTMLCanvasElement> {
    if (this.destroyed) throw new Error('character-preview: capture after destroy');
    const width = Math.max(1, Math.round(opts.width ?? 540));
    const height = Math.max(1, Math.round(opts.height ?? 720));
    const angle = opts.angle ?? -0.42; // gentle 3/4 turn for a heroic stance
    const cacheKey =
      opts.poseClips && opts.poseClips.length > 0
        ? JSON.stringify([width, height, angle, opts.poseClips, opts.poseFraction ?? 0.5])
        : null;
    const cached = cacheKey ? this.closeupCache.get(cacheKey) : null;
    if (cached) return cached;

    const prevAspect = this.camera.aspect;
    const prevPos = this.camera.position.clone();
    const prevRotY = this.characterGroup.rotation.y;
    const prevTarget = this.renderer.getRenderTarget();
    const prevCubeFace = this.renderer.getActiveCubeFace();
    const prevMipmapLevel = this.renderer.getActiveMipmapLevel();

    // Optionally lock a deliberate pose for the shot (e.g. a hero/cast/cheer
    // stance) instead of whatever idle frame is up. Restored via clearPose below.
    const posed =
      opts.poseClips && opts.poseClips.length > 0
        ? (this.currentVisual?.poseFreeze(opts.poseClips, opts.poseFraction ?? 0.5) ?? null)
        : null;

    let target = this.captureTarget;
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
      target.texture.colorSpace = this.renderer.outputColorSpace;
      target.texture.generateMipmaps = false;
      this.captureTarget = target;
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    const byteLength = width * height * 4;
    if (!this.capturePixels || this.capturePixels.byteLength !== byteLength) {
      this.capturePixels = new Uint8Array(byteLength);
    }

    let readback: Promise<THREE.TypedArray> | null = null;
    try {
      this.camera.aspect = width / height;
      // Pulled back to z=4.6, aimed at y=1.55 (eye 1.62) so the 45 degree,
      // 0.75-aspect frustum spans roughly y in [-0.3, 3.5] at the figure plane:
      // enough headroom above the 2.6 head-top to clear raised weapons and arms.
      this.camera.position.set(-0.1, 1.62, 4.6);
      this.camera.lookAt(new THREE.Vector3(-0.1, 1.55, 0));
      this.camera.updateProjectionMatrix();
      this.characterGroup.rotation.y = angle;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      readback = this.renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        width,
        height,
        this.capturePixels,
      );
    } finally {
      this.renderer.setRenderTarget(prevTarget, prevCubeFace, prevMipmapLevel);
      if (posed) this.currentVisual?.clearPose();
      this.camera.aspect = prevAspect;
      this.camera.position.copy(prevPos);
      this.camera.lookAt(new THREE.Vector3(LIVE_PREVIEW_X, 1.3, 0));
      this.camera.updateProjectionMatrix();
      this.characterGroup.rotation.y = prevRotY;
      if (this.renderActive) this.renderer.render(this.scene, this.camera);
    }

    if (!readback) throw new Error('character-preview: capture readback unavailable');
    await readback;
    if (this.destroyed) throw new Error('character-preview: destroyed during capture');

    // WebGL readback starts at the bottom-left; Canvas ImageData starts at the
    // top-left. Flip one scanline at a time into the returned canvas.
    const stride = width * 4;
    const topDown = new Uint8ClampedArray(byteLength);
    for (let y = 0; y < height; y++) {
      const source = (height - 1 - y) * stride;
      topDown.set(this.capturePixels.subarray(source, source + stride), y * stride);
    }
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width;
    captureCanvas.height = height;
    const context = captureCanvas.getContext('2d');
    if (!context) throw new Error('character-preview: could not create capture canvas');
    context.putImageData(new ImageData(topDown, width, height), 0, 0);
    if (cacheKey) this.closeupCache.set(cacheKey, captureCanvas);
    return captureCanvas;
  }

  /** Cleanup resources */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.cleanupDragControls?.();
    this.cleanupDragControls = null;
    this.clearEquipmentCalibrationManipulator();
    if (this.equipmentManipulatorHelper) {
      this.scene.remove(this.equipmentManipulatorHelper);
      this.equipmentManipulatorHelper = null;
    }
    this.equipmentManipulator?.dispose();
    this.equipmentManipulator = null;
    this.openGate.cancel();
    this.hideStandIn();
    if (this.currentVisual) {
      this.characterGroup.remove(this.currentVisual.root);
      this.currentVisual.dispose();
      this.currentVisual = null;
      // three releases a program with the last material holding it, so a
      // signature linked before this rebuild can be cold again afterwards:
      // the gate must not skip the warm on a return to an old look.
      this.openGate.forgetLinked();
    }
    this.currentVisualSig = null;
    this.closeupCache.clear();
    this.captureTarget?.dispose();
    this.captureTarget = null;
    this.capturePixels = null;

    this.unregisterContext?.();
    this.unregisterContext = null;
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* context may already be lost */
    }
    this.renderer.dispose();
    this.canvas.remove();
  }
}
