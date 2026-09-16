import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { setupLighting, applyHallMaterials, createDust, createLightShafts, FilmShader } from './atmosphere';
import { createProps } from './props';
import { HallAudio } from './Audio';
import { investigations, nearestTarget, constrainMovement, floorHeight } from './logic';
import type { Direction, GameMode, RecordData } from './logic';
import { createNpcs } from './npcs';
import type { NpcVisual } from './npcs';
import { loadSurface, SURFACE_Y } from './surface';
import type { SurfaceHandle } from './surface';
import {
  createBeasts, createVitals, createWeapon, stepBeast, applyDamage, tickWeapon,
  canFire, startReload, hitscan, damageBeast, beastsAlive, atExtraction, constrainSurface,
  aimVector,
} from './combat';
import type { Beast, Weapon, Vitals } from './combat';
import { npcQuests, nearestNpc, resolveQuestStatus, questReadyToTurnIn, questProgress, levelFromExp } from './quests';
import type { NpcQuest, QuestStatus, DialogueLine } from './quests';
import type { DialogueView, QuestView, PlayerProgress, RewardView, SurfaceView, Zone } from '../contracts';

export interface WorldState {
  mode: GameMode; ready: boolean; progress: number; objective: string; investigated: number;
  target: { id: string; title: string; hint: string } | null; activeRecord: RecordData | null;
  toast: string | null; muted: boolean; cinematic: boolean; activation: number; activated: boolean; overlooking: boolean;
  storyOpen: boolean; ending: 'human' | 'mimic' | 'future' | null;
  error: string | null;
  dialogue: DialogueView | null; quests: QuestView[];
  /** cumulative exp granted by quests */
  exp: number; echo: number; energy: number;
  progressStats: PlayerProgress; reward: RewardView | null;
  /** which level the player is standing in */
  zone: Zone;
  /** combat readouts, only while zone === 'surface' */
  surface: SurfaceView | null;
  /** hall teleport pad is charged, so the surface drop is available */
  canDeploy: boolean;
}
const BASE_ECHO = 40, BASE_ENERGY = 20;
export const initialState: WorldState = {
  mode: 'intro', ready: false, progress: 0, objective: '寻找配电终端，恢复备用供电', investigated: 0,
  target: null, activeRecord: null, toast: null, muted: false, cinematic: true, activation: 0, activated: false, overlooking: false, storyOpen: false, ending: null, error: null,
  dialogue: null, quests: [],
  exp: 0, echo: BASE_ECHO, energy: BASE_ENERGY,
  progressStats: { level: 1, levelInto: 0, levelSpan: 300, echo: BASE_ECHO, energy: BASE_ENERGY, questsDone: 0, questsTotal: npcQuests.length },
  reward: null,
  zone: 'hall', surface: null, canDeploy: false,
};

export class HallWorld {
  private state: WorldState = { ...initialState };
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, .08, 100);
  private cameraRay = new THREE.Raycaster();
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private ao: GTAOPass;
  private film: ShaderPass;
  private lights: ReturnType<typeof setupLighting>;
  private dust: ReturnType<typeof createDust>;
  private shafts: ReturnType<typeof createLightShafts>;
  private props: ReturnType<typeof createProps>;
  private character: THREE.Group;
  private characterParts: { leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; coatLeft: THREE.Mesh; coatRight: THREE.Mesh };
  private audio = new HallAudio();
  private keys = new Set<string>();
  private abort = new AbortController();
  private inspected = new Set<string>();
  private npcVisuals: (NpcVisual & { draw: (g: string, c: string) => void })[] = [];
  /** everything that belongs to the lighthouse hall, so the whole level can be hidden */
  private hallGroup = new THREE.Group();
  // ---- surface zone ----
  private surfaceHandle: SurfaceHandle | null = null;
  private zone: Zone = 'hall';
  private beasts: Beast[] = [];
  private beastNodes: { node: THREE.Object3D; bar: THREE.Sprite; mat: THREE.SpriteMaterial }[] = [];
  private weapon: Weapon = createWeapon();
  private vitals: Vitals = createVitals();
  private hurt = 0;
  private outcome: 'alive' | 'down' | 'extracted' = 'alive';
  private groundRay = new THREE.Raycaster();
  private weaponView: THREE.Group | null = null;
  private muzzle: THREE.PointLight | null = null;
  private muzzleUntil = 0;
  private tracers: { line: THREE.Line; until: number }[] = [];
  private recoil = 0;
  /** set on a level change so the camera jumps straight to its new pose */
  private cameraSnap = false;
  private sparks: { node: THREE.Mesh; until: number }[] = [];
  /** XZ point the crosshair actually looks through (offset over the shoulder) */
  private aimOrigin = new THREE.Vector2(0, 0);
  private questStatus = new Map<string, QuestStatus>();
  private activeNpcId: string | null = null;
  private disposed = false;
  private previousTime = 0;
  private time = 0;
  private lastEmit = 0;
  private lastStep = 0;
  private toastUntil = 0;
  private yaw = 0;
  private pitch = .17;
  private dragging: { id: number; x: number; y: number; time: number; moved: boolean } | null = null;
  private mobile = matchMedia('(pointer: coarse)').matches;
  private viewMode: 'floor' | 'overlook' = 'floor';
  private tourStart = 0;
  private tourFromIntro = false;
  private beforePause: GameMode = 'play';
  private player = new THREE.Vector3(0, .08, 16);
  private activationTime = -1;
  private performanceSamples: number[] = [];
  private emitCallback: (state: WorldState) => void;
  private commandBusy = false;

  constructor(private container: HTMLDivElement, onState: (state: WorldState) => void) {
    this.emitCallback = onState;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .93;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '可探索的三维传送大厅，拖动画面环视');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.lights = setupLighting(this.scene, this.renderer);
    this.scene.add(this.hallGroup);
    this.dust = createDust(this.hallGroup, this.mobile); this.shafts = createLightShafts(this.hallGroup); this.props = createProps(this.hallGroup);
    const avatar = this.createCharacter(); this.character = avatar.group; this.characterParts = avatar.parts; this.scene.add(this.character);
    this.npcVisuals = createNpcs(this.hallGroup);
    for (const q of npcQuests) this.questStatus.set(q.id, q.id === 'warden' ? 'available' : 'available');
    this.refreshQuestViews();
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mobile ? 0 : 2 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1); this.ao.blendIntensity = .85;
    this.ao.updateGtaoMaterial({ radius: .65, distanceExponent: 1.7, thickness: .65, scale: 1, samples: 8 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, rings: 2, samples: 8 });
    this.ao.enabled = !this.mobile; this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .36, .35, 1.05); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader); this.composer.addPass(this.film);
    this.resize(); this.bindInput(); this.registerAgentControls();
    this.camera.position.set(0, 5.4, 16.8); this.camera.lookAt(0, 4.8, 0);
    this.renderer.setAnimationLoop(this.animate);
    void this.load();
  }

  private createCharacter() {
    const group = new THREE.Group();
    group.name = 'MarkThirdPersonAvatar';
    const white = new THREE.MeshStandardMaterial({ color: 0xdfe3e5, roughness: .62, metalness: .08 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: .72 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc7c9cc, roughness: .78 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c9b9, roughness: .8 });
    const purple = new THREE.MeshStandardMaterial({ color: 0x8569ff, emissive: 0x6542ff, emissiveIntensity: 2.2, roughness: .35 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: .85 });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number, parent = group) => {
      const part = new THREE.Mesh(geometry, material); part.position.y = y; part.castShadow = true; part.receiveShadow = true; parent.add(part); return part;
    };
    mesh(new THREE.CapsuleGeometry(.42, .78, 6, 12), dark, 1.72);
    mesh(new THREE.SphereGeometry(.43, 18, 12), skin, 2.55);
    const hair = mesh(new THREE.SphereGeometry(.47, 18, 12, 0, Math.PI * 2, 0, Math.PI * .72), silver, 2.7);
    hair.scale.set(1.05, .92, 1.06);
    for (let i = 0; i < 7; i++) {
      const lock = mesh(new THREE.ConeGeometry(.12, .42, 7), silver, 2.56);
      const a = i / 7 * Math.PI * 2; lock.position.x = Math.sin(a) * .34; lock.position.z = Math.cos(a) * .34; lock.rotation.z = Math.sin(a) * .25;
    }
    const hood = mesh(new THREE.TorusGeometry(.49, .14, 8, 20, Math.PI * 1.45), white, 2.27); hood.rotation.set(Math.PI / 2, 0, -.7);
    const coatLeft = mesh(new THREE.BoxGeometry(.48, 1.35, .42), white, 1.33); coatLeft.position.x = -.27; coatLeft.rotation.z = -.055;
    const coatRight = mesh(new THREE.BoxGeometry(.48, 1.35, .42), white, 1.33); coatRight.position.x = .27; coatRight.rotation.z = .055;
    mesh(new THREE.BoxGeometry(.72, .1, .5), strap, 1.63);
    const glowL = mesh(new THREE.BoxGeometry(.055, .75, .025), purple, 1.68); glowL.position.set(-.31, 1.68, .224); glowL.rotation.z = -.08;
    const glowR = mesh(new THREE.BoxGeometry(.055, .75, .025), purple, 1.68); glowR.position.set(.31, 1.68, .224); glowR.rotation.z = .08;
    const limb = (x: number, y: number, material: THREE.Material, leg = false) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); group.add(pivot);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(leg ? .13 : .105, leg ? .58 : .52, 5, 9), material); upper.position.y = leg ? -.37 : -.33; upper.castShadow = true; pivot.add(upper);
      const end = new THREE.Mesh(new THREE.CapsuleGeometry(leg ? .15 : .11, leg ? .2 : .12, 4, 8), leg ? white : dark); end.position.set(0, leg ? -.78 : -.69, leg ? .05 : 0); end.castShadow = true; pivot.add(end);
      return pivot;
    };
    const leftArm = limb(-.58, 2.02, white), rightArm = limb(.58, 2.02, white);
    const leftLeg = limb(-.22, 1.1, white, true), rightLeg = limb(.22, 1.1, white, true);
    const badge = mesh(new THREE.CylinderGeometry(.13, .13, .025, 3), purple, 2.06); badge.rotation.x = Math.PI / 2;
    group.scale.setScalar(.88); group.rotation.y = Math.PI; group.visible = false;
    return { group, parts: { leftArm, rightArm, leftLeg, rightLeg, coatLeft, coatRight } };
  }

  private async load() {
    try {
      this.state.progress = 5; this.emit();
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/surface_echo_hall.glb`, event => {
        this.state.progress = 8 + 64 * (event.total ? event.loaded / event.total : Math.min(.95, event.loaded / 9_000_000)); this.emit();
      });
      if (this.disposed) return;
      this.state.progress = 76; this.emit();
      await applyHallMaterials(gltf.scene, this.renderer);
      if (this.disposed) return;
      this.hallGroup.add(gltf.scene); this.state.progress = 93; this.emit();
      // Second level: the ash surface & extraction site, from the imported pack.
      try {
        this.surfaceHandle = await loadSurface(import.meta.env.BASE_URL);
        if (this.disposed) return;
        this.surfaceHandle.group.position.y = SURFACE_Y;
        this.scene.add(this.surfaceHandle.group);
        this.buildBeasts();
        this.buildWeaponView();
      } catch (err) { console.warn('surface zone skipped:', err); }
      this.state.progress = 96; this.emit();
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.disposed) return;
      this.renderer.shadowMap.needsUpdate = true;
      this.state.ready = true; this.state.progress = 100; this.emit();
    } catch (error) {
      if (this.disposed) return;
      console.error('Hall scene loading failed', error);
      this.state.error = '大厅资源暂时未能载入，请检查网络后重试。'; this.emit();
    }
  }

  private emit() { this.emitCallback({ ...this.state }); }

  // ==========================================================================
  // 地表 · Surface zone: build, deploy, combat
  // ==========================================================================

  /** Spawn the live hunter beasts from the authored positions. */
  private buildBeasts() {
    const handle = this.surfaceHandle;
    if (!handle) return;
    const spawns = handle.beastSpawns.length
      ? handle.beastSpawns
      : [new THREE.Vector3(10, 0, -3.5), new THREE.Vector3(16, 0, 5), new THREE.Vector3(21.7, 0, 5.2)];
    // keep them out in the open ash: the authored spots sit partly inside the deck
    for (const v of spawns) if (v.x < 4) v.x = 6 + Math.random() * 4;
    this.beasts = createBeasts(spawns.map(v => ({ x: v.x, z: v.z })));
    for (const beast of this.beasts) {
      // the authored beast GLB reads as an unlit slab in engine, so we always use
      // the hand-built creature for the live enemies
      const node = this.fallbackBeast();
      node.userData.surface = true; node.userData.beast = true;
      node.traverse(o => { o.userData.surface = true; o.userData.beast = true; });
      node.position.set(beast.x, 0, beast.z);
      // the authored model is roughly 1.5 units tall — too small to read as a threat
      // next to a 2.7-unit avatar, so bulk it up.
      const beastScale = 1.42;
      node.scale.setScalar(beastScale);
      node.userData.baseScale = beastScale;
      // A small health bar floats above each beast.
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 16;
      const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
      const bar = new THREE.Sprite(mat);
      bar.scale.set(1.9, .24, 1); bar.position.y = 2.45; bar.raycast = () => {};
      bar.userData.surface = true; node.add(bar);
      handle.group.add(node);
      this.beastNodes.push({ node, bar, mat });
    }
    this.drawBeastBars();
  }

  /**
   * The hunter beast: a hunched quadruped, roughly a head taller than Mark, with a
   * pale carapace so it stays legible against the ash, plus hot orange eyes.
   */
  private fallbackBeast() {
    const g = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: '#241d1a', roughness: .74, metalness: .12 });
    const plate = new THREE.MeshStandardMaterial({ color: '#1a1413', roughness: .5, metalness: .34 });
    const limb = new THREE.MeshStandardMaterial({ color: '#2c2320', roughness: .7 });
    const ember = new THREE.MeshStandardMaterial({ color: '#320c04', emissive: '#ff5220', emissiveIntensity: 7.5, roughness: .28 });

    // torso: heavy at the shoulders, tapering back
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.52, 1.5, 8, 16), hide);
    torso.rotation.z = Math.PI / 2; torso.position.set(0, 1.42, 0);
    torso.scale.set(1, 1, 1.18); g.add(torso);

    const hump = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), hide);
    hump.position.set(0, 1.72, .42); hump.scale.set(.92, .74, 1.05); g.add(hump);

    // dorsal plates
    for (let i = 0; i < 5; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(.16, .52 - i * .05, 4), plate);
      spine.position.set(0, 1.97 - i * .04, .55 - i * .34);
      spine.rotation.x = -.22; g.add(spine);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.3, .05, .1), ember);
      vent.position.set(0, 1.78 - i * .05, .5 - i * .34); g.add(vent);
    }
    const throat = new THREE.PointLight('#ff4a1e', 5.5, 7, 2);
    throat.position.set(0, 1.6, 0); g.add(throat);

    // neck + skull, carried low like a stalking animal
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .5, 6, 12), hide);
    neck.position.set(0, 1.5, 1.0); neck.rotation.x = 1.16; g.add(neck);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(.46, .38, .78), plate);
    skull.position.set(0, 1.24, 1.44); g.add(skull);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(.34, .16, .6), limb);
    jaw.position.set(0, 1.03, 1.5); g.add(jaw);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), ember);
      eye.position.set(side * .16, 1.33, 1.72); g.add(eye);
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(.06, .3, 5), plate);
      tusk.position.set(side * .16, 1.06, 1.76); tusk.rotation.x = Math.PI; g.add(tusk);
    }
    const glow = new THREE.PointLight('#ff7a3c', 7, 6, 2);
    glow.position.set(0, 1.3, 1.7); g.add(glow);

    // four legs, front pair braced forward
    for (const side of [-1, 1]) {
      for (const [z, lift] of [[.72, .12], [-.66, 0]] as [number, number][]) {
        const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .58, 6, 10), limb);
        thigh.position.set(side * .44, 1.06 + lift, z);
        thigh.rotation.x = z > 0 ? .3 : -.3; g.add(thigh);
        const shin = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .62, 6, 10), limb);
        shin.position.set(side * .48, .44, z + (z > 0 ? .16 : -.14));
        shin.rotation.x = z > 0 ? -.22 : .2; g.add(shin);
        const paw = new THREE.Mesh(new THREE.BoxGeometry(.26, .13, .38), plate);
        paw.position.set(side * .48, .08, z + (z > 0 ? .26 : -.22)); g.add(paw);
      }
    }

    // tail
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .9, 6, 10), hide);
    tail.position.set(0, 1.34, -1.12); tail.rotation.x = 1.02; g.add(tail);

    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    return g;
  }

  private drawBeastBars() {
    for (let i = 0; i < this.beasts.length; i++) {
      const beast = this.beasts[i], entry = this.beastNodes[i];
      if (!entry) continue;
      const tex = entry.mat.map as THREE.CanvasTexture;
      const canvas = tex.image as HTMLCanvasElement;
      const c = canvas.getContext('2d')!;
      c.clearRect(0, 0, 128, 16);
      if (beast.state !== 'dead') {
        c.fillStyle = 'rgba(6,10,12,.72)'; c.fillRect(0, 4, 128, 8);
        const pct = beast.hp / beast.maxHp;
        c.fillStyle = pct > .5 ? '#ff9a5c' : '#ff4d3d';
        c.fillRect(1, 5, Math.max(0, 126 * pct), 6);
        c.strokeStyle = 'rgba(255,190,150,.6)'; c.lineWidth = 1; c.strokeRect(.5, 4.5, 127, 7);
      }
      tex.needsUpdate = true;
      entry.bar.visible = beast.state !== 'dead';
    }
  }

  /** Railgun view-model carried by the avatar while on the surface. */
  private buildWeaponView() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#59636d', roughness: .48, metalness: .72 });
    const glow = new THREE.MeshStandardMaterial({ color: '#0b1418', emissive: '#63e6f0', emissiveIntensity: 2.6, roughness: .3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.14, .17, 1.05), steel); body.position.z = .3; g.add(body);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 1.25), glow); rail.position.set(0, .12, .38); g.add(rail);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.11, .28, .13), steel); grip.position.set(0, -.19, -.02); grip.rotation.x = .22; g.add(grip);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(.1, .24, .18), steel); mag.position.set(0, -.16, .26); g.add(mag);
    const muzzle = new THREE.PointLight('#9ff4ff', 0, 8, 1.6); muzzle.position.set(0, .06, .95); g.add(muzzle);
    this.muzzle = muzzle;
    g.traverse(o => { o.userData.surface = true; o.castShadow = false; });
    // Held at the right hand, angled forward.
    g.position.set(.54, 1.44, .42); g.rotation.set(-.06, .14, -.08);
    g.scale.setScalar(1.45);
    g.visible = false;
    this.weaponView = g; this.character.add(g);
  }

  /** Ground height under a surface point, sampled off the imported terrain. */
  private surfaceGroundY(x: number, z: number) {
    const handle = this.surfaceHandle;
    if (!handle || !handle.terrain.length) return 0;
    this.groundRay.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
    this.groundRay.far = 80;
    const hits = this.groundRay.intersectObjects(handle.terrain, true);
    return hits.length ? hits[0].point.y : 0;
  }

  /** Drop from the charged hall pad down to the ash surface. */
  deploy = () => {
    if (!this.surfaceHandle || this.zone === 'surface') return;
    if (!this.state.activated) { this.toast('传送环尚未蓄能，先在中央控制台按住 E。'); return; }
    const handle = this.surfaceHandle;
    this.zone = 'surface'; this.state.zone = 'surface';
    this.outcome = 'alive';
    this.vitals = createVitals();
    this.weapon = createWeapon();
    this.beasts = [];
    this.beastNodes.length = 0;
    // rebuild enemies fresh on every drop
    for (const child of [...handle.group.children]) {
      if (child.userData.beast) handle.group.remove(child);
    }
    this.buildBeasts();
    // move the player into the surface zone
    this.player.set(handle.spawn.x, SURFACE_Y + this.surfaceGroundY(handle.spawn.x, handle.spawn.z) + .08, handle.spawn.z);
    this.yaw = handle.spawnYaw; this.pitch = .08;
    this.viewMode = 'floor';
    this.hallGroup.visible = false;
    for (const l of this.lights.all) l.visible = false;
    handle.group.visible = true;
    for (const l of handle.lights) l.visible = true;
    if (this.weaponView) this.weaponView.visible = true;
    this.scene.background = handle.sky;
    this.scene.fog = new THREE.FogExp2('#8a7f6b', .019);
    this.scene.environmentIntensity = .58;
    this.bloom.strength = .2;
    this.renderer.toneMappingExposure = .95;
    this.cameraSnap = true;
    this.state.objective = '击退全部猎行怪，然后抵达撤离信标';
    this.state.target = null; this.state.dialogue = null; this.activeNpcId = null;
    this.toast('已投放至灰烬地表', 4);
    this.audio.tone('power');
    this.emit();
  };

  /** Return to the hall — either after a successful extraction or after going down. */
  extract = () => {
    if (this.zone !== 'surface') return;
    const handle = this.surfaceHandle;
    this.zone = 'hall'; this.state.zone = 'hall';
    this.hallGroup.visible = true;
    for (const l of this.lights.all) l.visible = true;
    if (handle) { handle.group.visible = false; for (const l of handle.lights) l.visible = false; }
    if (this.weaponView) this.weaponView.visible = false;
    this.scene.background = new THREE.Color('#071116');
    this.scene.fog = new THREE.FogExp2('#112832', .020);
    this.scene.environmentIntensity = .3;
    this.bloom.strength = .36;
    this.renderer.toneMappingExposure = .93;
    this.cameraSnap = true;
    this.player.set(0, .08, 6.4);
    this.yaw = Math.PI; this.pitch = .12;
    if (this.outcome === 'extracted') {
      this.state.exp += 420; this.state.echo += 12; this.state.energy += 30;
      this.state.reward = {
        questTitle: '地表撤离', npcName: '撤离信标', color: '#7ef0c4',
        exp: 420, echo: 12, energy: 30,
        rewardTitle: '地表归返者', unlock: '灰烬地表 · 可重复投放',
        leveledUp: levelFromExp(this.state.exp).level > levelFromExp(this.state.exp - 420).level,
        newLevel: levelFromExp(this.state.exp).level, allDone: false,
      };
      this.state.objective = '地表撤离成功 · 可再次投放或继续调查';
      this.toast('撤离成功 · 你带回了地表的回声', 5);
    } else {
      this.state.objective = '重伤撤回大厅 · 恢复后可再次投放';
      this.toast('生命维持系统强制撤回', 5);
    }
    this.state.surface = null;
    this.refreshProgressStats();
    this.emit();
  };

  fire = () => {
    if (this.zone !== 'surface' || this.outcome !== 'alive') return;
    if (this.weapon.reloading > 0) return;
    if (this.weapon.mag <= 0) { this.reload(); return; }
    if (!canFire(this.weapon)) return;
    this.weapon = { ...this.weapon, mag: this.weapon.mag - 1, fireCd: 0.42 };
    this.recoil = 1;
    this.muzzleUntil = this.time + .07;
    this.audio.tone('shot');
    // Aim straight out of the camera on the XZ plane.
    const aim = aimVector(this.yaw);
    const dirX = aim.x, dirZ = aim.z;
    const origin = { x: this.aimOrigin.x, z: this.aimOrigin.y };
    const hit = hitscan(origin, dirX, dirZ, this.beasts);
    this.spawnTracer(dirX, dirZ, hit);
    if (hit) {
      const killed = damageBeast(hit);
      this.drawBeastBars();
      if (killed) {
        this.state.echo += 3; this.state.exp += 60;
        this.toast(beastsAlive(this.beasts) === 0 ? '猎行怪已全部清除 · 撤离信标已激活' : `猎行怪已击杀 · 剩余 ${beastsAlive(this.beasts)}`, 3);
        this.refreshProgressStats();
      }
      this.audio.tone('scan');
    }
    this.emit();
  };

  reload = () => {
    if (this.zone !== 'surface') return;
    const next = startReload(this.weapon);
    if (next !== this.weapon) { this.weapon = next; this.toast('换弹中…', 1.4); }
    this.emit();
  };

  private spawnTracer(dirX: number, dirZ: number, hit: Beast | null) {
    const handle = this.surfaceHandle;
    if (!handle) return;
    const localY = this.player.y - SURFACE_Y + 1.55;
    const ox = this.aimOrigin.x, oz = this.aimOrigin.y;
    const from = new THREE.Vector3(ox + dirX * .6, localY, oz + dirZ * .6);
    const dist = hit ? Math.hypot(hit.x - ox, hit.z - oz) : 40;
    const to = new THREE.Vector3(ox + dirX * dist, localY + (hit ? .1 : -.4), oz + dirZ * dist);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: '#cdf6ff', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.userData.surface = true; line.raycast = () => {};
    handle.group.add(line);
    this.tracers.push({ line, until: this.time + .26 });
    // muzzle flare at the barrel
    const flare = new THREE.Mesh(
      new THREE.SphereGeometry(.3, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flare.position.copy(from);
    flare.userData.surface = true; flare.raycast = () => {};
    handle.group.add(flare);
    this.sparks.push({ node: flare, until: this.time + .14 });
    if (hit) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(.42, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      spark.position.set(to.x, to.y + .5, to.z);
      spark.userData.surface = true; spark.raycast = () => {};
      handle.group.add(spark);
      this.sparks.push({ node: spark, until: this.time + .22 });
    }
  }

  /** One surface frame: beasts hunt, weapon cools, extraction check. */
  private stepSurface(dt: number) {
    const handle = this.surfaceHandle;
    if (!handle) return;
    this.weapon = tickWeapon(this.weapon, dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.muzzle) this.muzzle.intensity = this.time < this.muzzleUntil ? 26 : 0;
    for (const s2 of [...this.sparks]) {
      const life = Math.min(1, (s2.until - this.time) / .22);
      if (life <= 0) {
        handle.group.remove(s2.node);
        s2.node.geometry.dispose(); (s2.node.material as THREE.Material).dispose();
        this.sparks.splice(this.sparks.indexOf(s2), 1);
      } else {
        (s2.node.material as THREE.MeshBasicMaterial).opacity = life * .85;
        s2.node.scale.setScalar(1 + (1 - life) * 1.7);
      }
    }
    for (const t of [...this.tracers]) {
      if (this.time >= t.until) {
        handle.group.remove(t.line);
        t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }

    if (this.outcome === 'alive') {
      let incoming = 0;
      for (const beast of this.beasts) {
        incoming += stepBeast(beast, { x: this.player.x, z: this.player.z }, dt);
      }
      if (incoming > 0) {
        this.vitals = applyDamage(this.vitals, incoming);
        this.hurt = 1;
        this.audio.tone('hurt');
        if (this.vitals.hp <= 0) {
          this.outcome = 'down';
          this.toast('生命信号临界 · 需要立即撤回', 6);
        }
      }
      if (beastsAlive(this.beasts) === 0 && atExtraction({ x: this.player.x, z: this.player.z }, handle.beacon)) {
        this.outcome = 'extracted';
        this.toast('撤离信标同步完成', 4);
      }
    }

    // mirror beasts onto their meshes
    for (let i = 0; i < this.beasts.length; i++) {
      const beast = this.beasts[i], entry = this.beastNodes[i];
      if (!entry) continue;
      if (beast.state === 'dead') {
        entry.node.visible = true;
        entry.node.rotation.z = Math.min(Math.PI / 2, entry.node.rotation.z + dt * 3.2);
        entry.node.position.y = Math.max(-.4, entry.node.position.y - dt * .5);
        continue;
      }
      const gy = this.surfaceGroundY(beast.x, beast.z);
      entry.node.position.set(beast.x, gy, beast.z);
      entry.node.rotation.y = beast.facing;
      const lunge = beast.state === 'attack' ? Math.sin(this.time * 9) * .12 : Math.sin(this.time * 5 + beast.id) * .05;
      entry.node.position.y = gy + Math.abs(lunge);
      const base = (entry.node.userData.baseScale as number) ?? 1;
      entry.node.scale.setScalar(base * (beast.flash > 0 ? 1.08 : 1));
    }
    this.drawBeastBars();
    handle.update(this.time);
  }

  private surfaceView(): SurfaceView {
    const handle = this.surfaceHandle;
    const beacon = handle ? handle.beacon : new THREE.Vector3(24.5, 0, 8.5);
    const dist = Math.hypot(this.player.x - beacon.x, this.player.z - beacon.z);
    const alive = beastsAlive(this.beasts);
    const stressed = this.hurt > .05 || alive > 0;
    // Radar: rotate world offsets into view space (forward = up).
    const sin = Math.sin(-this.yaw), cos = Math.cos(-this.yaw);
    const blips: SurfaceView['blips'] = [];
    const project = (wx: number, wz: number, kind: 'beast' | 'beacon') => {
      const dx = wx - this.player.x, dz = wz - this.player.z;
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      const range = 34;
      const x = Math.max(-1, Math.min(1, rx / range));
      const y = Math.max(-1, Math.min(1, -rz / range));
      blips.push({ x, y, kind });
    };
    for (const b of this.beasts) if (b.state !== 'dead') project(b.x, b.z, 'beast');
    project(beacon.x, beacon.z, 'beacon');
    return {
      hp: this.vitals.hp, maxHp: this.vitals.maxHp,
      armor: this.vitals.armor, maxArmor: this.vitals.maxArmor,
      mag: this.weapon.mag, magSize: this.weapon.magSize, reserve: this.weapon.reserve,
      reloading: this.weapon.reloading > 0,
      beastsAlive: alive, beastsTotal: this.beasts.length,
      extractionOpen: alive === 0,
      onPad: dist <= 3.1,
      beaconDistance: Math.round(dist),
      temp: -23.7 + Math.sin(this.time * .07) * .6,
      humidity: 12 + Math.sin(this.time * .11) * 2,
      pressure: 0.71 + Math.sin(this.time * .05) * .01,
      wind: 9.4 + Math.sin(this.time * .23) * 2.6,
      elevation: Math.round(812 + (this.player.y - SURFACE_Y)),
      fogDensity: 62 + Math.sin(this.time * .09) * 6,
      heartRate: Math.round((stressed ? 168 : 96) + Math.sin(this.time * 2.4) * 9 + this.hurt * 22),
      spo2: Math.round(97 - this.hurt * 4),
      stress: Math.round(Math.min(99, (stressed ? 78 : 24) + this.hurt * 18 + Math.sin(this.time * .8) * 4)),
      hurt: this.hurt,
      outcome: this.outcome,
      blips,
    };
  }

  private toast(text: string, seconds = 4) { this.state.toast = text; this.toastUntil = this.time + seconds; this.emit(); }
  private clearInput() { this.keys.clear(); this.dragging = null; }
  private bindInput() {
    const options = { signal: this.abort.signal };
    window.addEventListener('resize', this.resize, options);
    window.addEventListener('blur', () => { this.clearInput(); if (this.state.mode === 'play') this.pause(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clearInput(); if (this.state.mode === 'play') this.pause(); } }, options);
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && !event.repeat) {
        if (this.state.activeRecord) this.closeRecord();
        else if (this.state.mode === 'paused') this.resume();
        else if (this.state.mode !== 'intro') this.pause();
        return;
      }
      if (this.state.mode !== 'play' || this.state.activeRecord || this.state.storyOpen) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'KeyE' && !event.repeat) this.interact();
      if (event.code === 'KeyV' && !event.repeat) this.toggleView();
      if (event.code === 'KeyR' && !event.repeat) this.reload();
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); this.fire(); }
    }, options);
    window.addEventListener('keyup', event => { this.keys.delete(event.code); }, options);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    canvas.addEventListener('pointerdown', event => {
      if (this.state.mode !== 'play' || this.state.activeRecord || this.state.storyOpen) return;
      canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
      this.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), moved: false };
    }, options);
    canvas.addEventListener('pointermove', event => {
      if (!this.dragging || this.dragging.id !== event.pointerId || this.state.mode !== 'play' || this.state.activeRecord) return;
      const dx = event.clientX - this.dragging.x, dy = event.clientY - this.dragging.y;
      this.yaw -= dx * .0031; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .0026, -.95, 1.18);
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragging.moved = true;
      this.dragging.x = event.clientX; this.dragging.y = event.clientY;
    }, options);
    canvas.addEventListener('pointerup', event => {
      if (!this.dragging || this.dragging.id !== event.pointerId) return;
      const clicked = !this.dragging.moved && performance.now() - this.dragging.time < 300;
      this.dragging = null;
      if (!clicked) return;
      // On the surface a tap shoots, unless you are standing on the extraction pad.
      if (this.zone === 'surface') {
        if (this.state.target) this.interact(); else this.fire();
        return;
      }
      if (this.state.target) this.interact();
    }, options);
    canvas.addEventListener('pointercancel', () => { this.dragging = null; }, options);
    canvas.addEventListener('lostpointercapture', () => { this.dragging = null; }, options);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.pause(); this.state.error = '图形上下文已中断。点击重新载入可恢复大厅。'; this.emit(); }, options);
  }

  start = () => {
    if (!this.state.ready) return;
    this.audio.start(); this.clearInput();
    if (this.state.mode === 'intro' || this.tourFromIntro) {
      this.player.set(0, .08, 15.9); this.yaw = 0; this.pitch = .17; this.character.rotation.y = Math.PI; this.tourFromIntro = false;
    }
    this.viewMode = 'floor'; this.state.overlooking = false; this.state.mode = 'play'; this.state.activeRecord = null;
    this.camera.position.copy(this.player);
    this.toast(this.inspected.has('power') ? '沿着回声，继续调查大厅。' : '马克：灯还亮着。先看看这里留下了什么。', 5);
  };
  tour = () => {
    if (!this.state.ready) return;
    this.audio.start(); this.clearInput(); this.tourFromIntro = this.state.mode === 'intro';
    this.state.mode = 'tour'; this.state.activeRecord = null; this.state.target = null; this.tourStart = this.time;
    this.emit();
  };
  pause = () => {
    this.beforePause = this.state.mode === 'tour' ? 'tour' : 'play';
    this.state.mode = 'paused'; this.clearInput(); this.emit();
  };
  resume = () => { this.state.mode = this.beforePause; this.clearInput(); this.emit(); };
  toggleMute = () => { this.state.muted = !this.state.muted; this.audio.mute(this.state.muted); if (!this.state.muted && this.state.mode !== 'intro') this.audio.start(); this.emit(); };
  toggleView = () => {
    if (this.state.mode === 'play' && !this.state.activeRecord) {
      this.viewMode = this.viewMode === 'floor' ? 'overlook' : 'floor';
      this.state.overlooking = this.viewMode === 'overlook';
      this.toast(this.viewMode === 'overlook' ? '高位观察 · 再次点击「视角」返回探索' : '返回地面视角');
      this.clearInput();
    } else { this.state.cinematic = !this.state.cinematic; this.emit(); }
  };
  closeRecord = () => { this.state.activeRecord = null; this.clearInput(); this.emit(); };
  closeStory = () => { this.state.storyOpen = false; this.clearInput(); this.emit(); };
  chooseStory = (ending: 'human' | 'mimic' | 'future') => {
    const outcomes = {
      human: { objective: '版本已定稿：打开通往地表的回应通道', color: 0x72d6ba, text: '你选择相信呼救。大厅的灯光变得温暖，远方传来人的回应。' },
      mimic: { objective: '版本已定稿：封锁拟态信号，保存所有证据', color: 0xd09a6b, text: '你将信号定义为拟态。隔离门落下，黑暗中有什么停止了呼吸。' },
      future: { objective: '版本已定稿：建立时间回路，等待未来的自己', color: 0x967cff, text: '你接受了时间回路。紫色回声沿着大厅倒流，另一个脚步与你重合。' },
    } as const;
    const outcome = outcomes[ending]; this.state.storyOpen = false; this.state.ending = ending; this.state.activated = true; this.state.activation = 1;
    this.state.objective = outcome.objective; this.activationTime = this.time; this.props.glow.color.setHex(outcome.color); this.props.glow.emissive.setHex(outcome.color);
    this.lights.core.color.setHex(outcome.color); this.audio.tone('power'); this.toast(outcome.text, 8);
    // The charged ring is now a working teleport: it can drop Mark onto the surface.
    this.state.objective = '传送环已蓄能 · 回到中央控制台按 E 降至灰烬地表';
    this.refreshQuestViews(); this.clearInput(); this.emit();
  };
  move = (direction: Direction, pressed: boolean) => {
    const key = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD' }[direction];
    if (pressed && this.state.mode === 'play' && !this.state.activeRecord) this.keys.add(key); else this.keys.delete(key);
  };
  hold = (_pressed: boolean) => {};
  interact = () => {
    if (this.state.mode !== 'play' || this.state.activeRecord || this.state.dialogue || this.state.storyOpen || this.viewMode !== 'floor') return;
    // ---- surface: E at the extraction pad ----
    if (this.zone === 'surface') {
      const handle = this.surfaceHandle;
      if (!handle) return;
      const dist = Math.hypot(this.player.x - handle.beacon.x, this.player.z - handle.beacon.z);
      if (dist > 4.2) return;
      const alive = beastsAlive(this.beasts);
      if (alive > 0) { this.toast(`撤离信标被压制 · 还有 ${alive} 只猎行怪`); return; }
      this.outcome = 'extracted';
      this.extract();
      return;
    }
    // NPCs take priority when you are standing close to one
    const npc = nearestNpc(this.player);
    if (npc) { this.openDialogue(npc); return; }
    const target = nearestTarget(this.player); if (!target) return;
    if (target.id === 'core') {
      // Once the ring is charged the console becomes the drop to the surface.
      if (this.state.activated && this.state.ending && this.surfaceHandle) { this.deploy(); return; }
      if (this.state.ending) { this.toast('你写下的版本已经成为大厅的新现实。仍可继续寻找遗漏的回声。', 5); return; }
      if (!this.inspected.has('power')) { this.toast('供电中断 · 请先调查配电终端'); return; }
      if (this.inspected.size < 4) { this.toast(`叙事样本不足 · 还需找到 ${4 - this.inspected.size} 条回声`); return; }
      this.state.storyOpen = true; this.state.target = null; this.clearInput(); this.audio.tone('scan'); this.emit(); return;
    }
    const data = investigations.find(v => v.id === target.id)!;
    this.inspected.add(data.id); this.state.investigated = this.inspected.size;
    this.state.activeRecord = data.record; this.state.target = null; this.clearInput(); this.audio.tone('scan');
    if (data.id === 'power' && !this.state.ending) this.state.objective = '收集至少 4 条回声，在中央控制台重构事件';
    if (this.inspected.size >= 4 && !this.state.ending) this.state.objective = '返回中央控制台，写下你相信的真相';
    this.refreshQuestViews();
    this.emit();
  };
  restart = () => {
    if (this.zone === 'surface') { this.outcome = 'down'; this.extract(); }
    this.vitals = createVitals(); this.weapon = createWeapon(); this.hurt = 0; this.outcome = 'alive';
    this.clearInput(); this.inspected.clear(); this.state = { ...initialState, ready: this.state.ready, progress: 100, muted: this.state.muted };
    this.activationTime = -1; this.viewMode = 'floor'; this.player.set(0, .08, 15.9); this.yaw = 0; this.pitch = .17; this.character.rotation.y = Math.PI;
    this.activeNpcId = null; this.questStatus.clear(); for (const q of npcQuests) this.questStatus.set(q.id, 'available');
    this.refreshQuestViews();
    this.emit();
  };

  // ---- NPC dialogue & quests ----
  private questFacts() {
    return { powered: this.inspected.has('power'), echoCount: this.inspected.size, ending: this.state.ending };
  }
  private refreshQuestViews() {
    const facts = this.questFacts();
    this.state.quests = npcQuests.map(q => {
      const raw = this.questStatus.get(q.id) ?? 'available';
      const status = resolveQuestStatus(q.id, { status: raw, ...facts });
      const p = questProgress(q.id, { status: raw, ...facts });
      return { id: q.id, title: q.questTitle, objective: q.objective, npcName: q.npcName, status, current: p.current, goal: p.goal };
    });
    this.refreshProgressStats();
  }
  private refreshProgressStats() {
    const lv = levelFromExp(this.state.exp);
    const done = [...this.questStatus.values()].filter(s => s === 'done').length;
    this.state.progressStats = {
      level: lv.level, levelInto: lv.into, levelSpan: lv.span,
      echo: this.state.echo, energy: this.state.energy,
      questsDone: done, questsTotal: npcQuests.length,
    };
  }
  private lineView(npc: NpcQuest, lines: DialogueLine[], action: 'accept' | 'turnin' | 'close'): DialogueView {
    return { npcName: npc.npcName, npcRole: npc.npcRole, color: '#' + npc.color.toString(16).padStart(6, '0'), lines, action, questTitle: npc.questTitle };
  }
  private openDialogue(npc: NpcQuest) {
    const facts = this.questFacts();
    const raw = this.questStatus.get(npc.id) ?? 'available';
    this.activeNpcId = npc.id;
    this.audio.tone('scan');
    if (raw === 'done') {

      this.state.dialogue = this.lineView(npc, npc.afterDone, 'close');
    } else if (raw === 'active') {
      if (questReadyToTurnIn(npc.id, { status: 'active', ...facts })) {

        this.state.dialogue = this.lineView(npc, npc.turnIn, 'turnin');
      } else {

        this.state.dialogue = this.lineView(npc, npc.inProgress, 'close');
      }
    } else {

      this.state.dialogue = this.lineView(npc, npc.offer, 'accept');
    }
    this.state.target = null; this.clearInput(); this.emit();
  }
  dialogueAction = (action: 'accept' | 'turnin' | 'close') => {
    const npc = npcQuests.find(q => q.id === this.activeNpcId);
    if (npc) {
      if (action === 'accept') {
        this.questStatus.set(npc.id, 'active');
        this.state.objective = npc.objective;
        this.audio.tone('scan');
        this.toast(`任务已接取 · ${npc.questTitle}`, 3);
      } else if (action === 'turnin') {
        this.grantReward(npc);
      }
    }
    this.state.dialogue = null; this.activeNpcId = null; this.refreshQuestViews(); this.clearInput(); this.emit();
  };
  /** Grant a quest's reward bundle, apply level-up, and open the settlement panel. */
  private grantReward(npc: NpcQuest) {
    this.questStatus.set(npc.id, 'done');
    const before = levelFromExp(this.state.exp).level;
    this.state.exp += npc.reward.exp;
    this.state.echo += npc.reward.echo;
    this.state.energy += npc.reward.energy;
    const after = levelFromExp(this.state.exp).level;
    const done = [...this.questStatus.values()].filter(s => s === 'done').length;
    const allDone = done >= npcQuests.length;
    this.audio.tone('power');
    this.state.reward = {
      questTitle: npc.questTitle, npcName: npc.npcName,
      color: '#' + npc.color.toString(16).padStart(6, '0'),
      exp: npc.reward.exp, echo: npc.reward.echo, energy: npc.reward.energy,
      unlock: npc.reward.unlock, rewardTitle: npc.reward.title,
      leveledUp: after > before, newLevel: after, allDone,
    };
  }
  closeReward = () => { this.state.reward = null; this.clearInput(); this.emit(); };
  closeDialogue = () => { this.state.dialogue = null; this.activeNpcId = null; this.clearInput(); this.emit(); };

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.fov = this.mobile && h > w ? 54 : 68; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h);
    this.ao.setSize(Math.ceil(w * .75), Math.ceil(h * .75));
  };

  private updatePlayer(dt: number) {
    if (this.viewMode === 'overlook') {
      this.character.visible = true;
      const a = .74 + Math.sin(this.time * .04) * .06;
      this.camera.position.lerp(new THREE.Vector3(Math.sin(a) * 20.3, 11.8, Math.cos(a) * 20.3), 1 - Math.exp(-dt * 2));
      this.camera.lookAt(0, 3.6, 0); this.state.target = null; return;
    }
    this.character.visible = true;
    let dx = 0, dz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    const length = Math.hypot(dx, dz), sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), speed = sprinting ? 5.5 : 3.1;
    const onSurface = this.zone === 'surface';
    if (length > 0) {
      dx /= length; dz /= length;
      const worldX = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw), worldZ = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      const wanted = { x: this.player.x + worldX * speed * dt, z: this.player.z + worldZ * speed * dt };
      const candidate = onSurface ? constrainSurface(wanted) : constrainMovement(this.player, wanted);
      this.player.x = candidate.x; this.player.z = candidate.z;
      const facing = Math.atan2(worldX, worldZ); this.character.rotation.y = THREE.MathUtils.damp(this.character.rotation.y, facing, 14, dt);
      if (this.time - this.lastStep > (sprinting ? .3 : .47)) { this.audio.tone('step'); this.lastStep = this.time; }
    }
    // On the surface the avatar keeps facing where the camera aims, so shots line up.
    if (onSurface && length === 0) {
      this.character.rotation.y = THREE.MathUtils.damp(this.character.rotation.y, this.yaw, 10, dt);
    }
    const ground = onSurface
      ? SURFACE_Y + this.surfaceGroundY(this.player.x, this.player.z)
      : floorHeight(this.player.x, this.player.z);
    this.player.y = THREE.MathUtils.damp(this.player.y, ground, 12, dt);
    this.character.position.set(this.player.x, this.player.y, this.player.z);
    const stride = length > 0 ? Math.sin(this.time * (sprinting ? 12 : 8)) * (sprinting ? .72 : .48) : 0;
    this.characterParts.leftArm.rotation.x = THREE.MathUtils.damp(this.characterParts.leftArm.rotation.x, stride, 12, dt);
    this.characterParts.rightArm.rotation.x = THREE.MathUtils.damp(this.characterParts.rightArm.rotation.x, -stride, 12, dt);
    this.characterParts.leftLeg.rotation.x = THREE.MathUtils.damp(this.characterParts.leftLeg.rotation.x, -stride, 12, dt);
    this.characterParts.rightLeg.rotation.x = THREE.MathUtils.damp(this.characterParts.rightLeg.rotation.x, stride, 12, dt);
    this.characterParts.coatLeft.rotation.z = -.055 - Math.abs(stride) * .06;
    this.characterParts.coatRight.rotation.z = .055 + Math.abs(stride) * .06;
    const bob = length > 0 ? Math.abs(Math.sin(this.time * (sprinting ? 12 : 8))) * .045 : 0;
    this.character.position.y += bob;
    const aim = aimVector(this.yaw);
    const forward = new THREE.Vector3(aim.x, 0, aim.z);
    const focus = new THREE.Vector3(this.player.x, this.player.y + (this.mobile ? 1.48 : 1.55), this.player.z);
    // Surface combat pulls the camera in over the shoulder so aiming reads clearly.
    const cameraDistance = onSurface ? (this.mobile ? 6.4 : 5.2) : this.mobile ? 7.1 : 5.4;
    const cameraLift = onSurface ? (this.mobile ? 2.5 : 2.2) : this.mobile ? 2.65 : 2.15;
    const shoulder = onSurface ? (this.mobile ? .66 : 1.05) : 0;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    // Shift the whole aim frame sideways and up: the avatar drops to the lower-left
    // and the crosshair looks down clear air instead of the back of his helmet.
    if (onSurface) {
      focus.addScaledVector(right, shoulder).setY(focus.y + .42);
      // shots originate on the crosshair line, not from the avatar's centre
      this.aimOrigin.set(focus.x, focus.z);
    }
    let desiredCamera = focus.clone()
      .addScaledVector(forward, -cameraDistance)
      .add(new THREE.Vector3(0, cameraLift + this.pitch * 1.25, 0));
    if (this.recoil > 0) desiredCamera.addScaledVector(forward, -this.recoil * .12);
    const rayDirection = desiredCamera.clone().sub(focus), rayLength = rayDirection.length();
    this.cameraRay.set(focus, rayDirection.normalize()); this.cameraRay.far = rayLength;
    const obstruction = this.cameraRay.intersectObjects(this.scene.children, true).find(hit => {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        // never let the avatar, NPC holograms, beasts or dressing block the lens
        if (object === this.character || object.userData.npc || object.userData.beast) return false;
        object = object.parent;
      }
      return hit.distance > .65 && !(hit.object instanceof THREE.Points) && !(hit.object instanceof THREE.Sprite) && !(hit.object instanceof THREE.Line);
    });
    if (obstruction) desiredCamera = focus.clone().addScaledVector(rayDirection, Math.max(.85, obstruction.distance - .35));
    if (this.cameraSnap) { this.camera.position.copy(desiredCamera); this.cameraSnap = false; }
    else this.camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(focus.clone().addScaledVector(forward, 2.2));
    if (onSurface) {
      // Weapon recoil kick on the held railgun.
      if (this.weaponView) {
        this.weaponView.rotation.x = THREE.MathUtils.damp(this.weaponView.rotation.x, -this.recoil * .34, 14, dt);
        this.weaponView.position.z = THREE.MathUtils.damp(this.weaponView.position.z, .34 - this.recoil * .1, 14, dt);
        this.weaponView.position.x = .54; this.weaponView.position.y = 1.44;
      }
      const handle = this.surfaceHandle;
      if (handle) {
        const dist = Math.hypot(this.player.x - handle.beacon.x, this.player.z - handle.beacon.z);
        const alive = beastsAlive(this.beasts);
        this.state.target = dist < 4.2
          ? { id: 'evac', title: '撤离信标', hint: alive === 0 ? '按 E 撤离' : `先清除 ${alive} 只猎行怪` }
          : null;
      }
      this.state.activation = 0;
      return;
    }
    const npc = nearestNpc(this.player);
    if (npc) {
      const raw = this.questStatus.get(npc.id) ?? 'available';
      const st = resolveQuestStatus(npc.id, { status: raw, ...this.questFacts() });
      const hint = st === 'done' ? '交谈' : st === 'ready' ? '交付任务' : st === 'active' ? '进行中 · 交谈' : '接取任务';
      this.state.target = { id: 'npc:' + npc.id, title: npc.npcName, hint };
    } else {
      const target = nearestTarget(this.player);
      this.state.target = target ? { id: target.id, title: target.title, hint: target.id === 'core' ? this.state.ending ? '已写入新的现实' : !this.inspected.has('power') ? '需先恢复备用供电' : this.inspected.size >= 4 ? '打开叙事重构台' : `还需 ${4 - this.inspected.size} 条回声` : this.inspected.has(target.id) ? '再次查看记录' : '调查 / 读取记录' } : null;
    }
    this.state.activation = 0;
  }

  private animate = (milliseconds: number) => {
    if (this.disposed) return;
    const rawDt = this.previousTime ? (milliseconds - this.previousTime) / 1000 : .016;
    this.previousTime = milliseconds;
    const dt = Math.min(.05, rawDt);
    if (this.state.mode !== 'paused' && !this.state.activeRecord) this.time += dt;
    if (this.state.mode === 'intro') {
      this.character.visible = false;
      const sway = this.time * .05;
      this.camera.position.set(Math.sin(sway) * 1.4, 5.4, 16.8); this.camera.lookAt(Math.sin(sway) * .5, 4.8, 0);
    } else if (this.state.mode === 'tour') {
      this.character.visible = false;
      const t = this.time - this.tourStart, a = .2 + t * .04;
      this.camera.position.set(Math.sin(a) * 20.1, 6.1 + Math.sin(t * .1) * 3.7, Math.cos(a) * 20.1);
      this.camera.lookAt(0, 4.2, 0);
    } else if (this.state.mode === 'play' && !this.state.activeRecord && !this.state.storyOpen) this.updatePlayer(dt);
    this.dust.update(this.time); this.shafts(this.time); this.film.uniforms.time.value = milliseconds * .001;
    if (this.zone === 'surface') {
      // ---- surface frame: enemies, weapon, extraction ----
      if (this.state.mode === 'play' && !this.state.activeRecord && !this.state.storyOpen) this.stepSurface(dt);
      this.state.surface = this.surfaceView();
      this.state.canDeploy = false;
      this.film.uniforms.time.value = milliseconds * .001;
      if (this.state.toast && this.time > this.toastUntil) this.state.toast = null;
      this.composer.render();
      if (milliseconds - this.lastEmit > 100) { this.lastEmit = milliseconds; this.emit(); }
      return;
    }
    this.state.surface = null;
    this.state.canDeploy = this.state.activated && !!this.surfaceHandle;
    for (const [id, marker] of Object.entries(this.props.markers)) {
      marker.lookAt(this.camera.position); marker.position.y = 2.12 + Math.sin(this.time * 1.5) * .045;
      marker.visible = this.state.mode === 'play' && !this.state.activeRecord && this.viewMode === 'floor' && (!this.inspected.has(id) || id === 'core') && !(id === 'core' && this.state.activated);
    }
    // NPC hologram markers + live quest status
    if (this.npcVisuals.length) {
      const facts = this.questFacts();
      const showNpc = this.state.mode === 'play' && this.viewMode === 'floor';
      for (const v of this.npcVisuals) {
        const npc = npcQuests.find(q => q.id === v.id)!;
        const raw = this.questStatus.get(v.id) ?? 'available';
        const st = resolveQuestStatus(v.id, { status: raw, ...facts });
        const glyph = st === 'ready' ? '✓' : st === 'active' ? '…' : st === 'done' ? '·' : '!';
        const mColor = st === 'ready' ? '#8effc0' : st === 'done' ? '#7f9799' : '#' + npc.color.toString(16).padStart(6, '0');
        const key = glyph + mColor;
        if ((v as { _mk?: string })._mk !== key) { v.draw(glyph, mColor); (v as { _mk?: string })._mk = key; }
        v.marker.position.y = 2.62 + Math.sin(this.time * 1.6 + v.group.position.x) * .07;
        v.marker.visible = showNpc && st !== 'done';
        const s = 1 + Math.sin(this.time * 2 + v.group.position.z) * .04;
        v.ring.scale.setScalar(s);
        (v.ring.material as THREE.MeshBasicMaterial).opacity = .34 + Math.sin(this.time * 2.2) * .12;
        v.group.visible = showNpc || this.state.mode === 'intro';
        v.group.position.y = Math.sin(this.time * 1.1 + v.group.position.x) * .04;
      }
      // keep the "ready to turn in" highlight fresh in the tracker
      this.refreshQuestViews();
    }
    let pulse = 1;
    if (this.activationTime >= 0) { const t = this.time - this.activationTime; pulse = 1.15 + Math.exp(-t * .9) * 1.2 * Math.max(0, Math.sin(t * 3)); }
    this.props.waves.forEach((wave, index) => {
      const elapsed = this.activationTime < 0 ? -1 : this.time - this.activationTime - index * .9;
      wave.visible = elapsed >= 0 && elapsed < 5;
      if (wave.visible) { const radius = 1.8 + elapsed * 2.2; wave.scale.set(radius, radius, 1); wave.material.opacity = Math.sin(elapsed / 5 * Math.PI) * .5; }
    });
    this.lights.ringLights.forEach((light, i) => { light.intensity = 62 * pulse * (1 + Math.sin(this.time * .6 + i) * .018); });
    this.lights.core.intensity = (this.state.activated ? 40 : 14) + this.state.activation * 18;
    this.bloom.strength = .36 + (pulse - 1) * .2;
    if (this.state.toast && this.time > this.toastUntil) this.state.toast = null;
    this.composer.render();
    if (milliseconds - this.lastEmit > 120) { this.lastEmit = milliseconds; this.emit(); }
    if (this.state.ready && this.performanceSamples.length < 180) {
      this.performanceSamples.push(rawDt);
      if (this.performanceSamples.length === 180 && this.performanceSamples.slice(30).reduce((a, b) => a + b, 0) / 150 > .042) {
        this.ao.enabled = false; this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.resize();
      }
    }
  };

  /** Read-only local diagnostics: real renderer state, never a gameplay shortcut. */
  diagnostics() { return { ready: this.state.ready, mode: this.state.mode, player: this.player.toArray(), camera: this.camera.position.toArray(), heading: this.yaw * 180 / Math.PI, pitch: this.pitch * 180 / Math.PI, target: this.state.target?.id ?? null, record: this.state.activeRecord?.title ?? null, objective: this.state.objective, investigated: [...this.inspected], activation: this.state.activation, activated: this.state.activated, overlooking: this.state.overlooking, pixelRatio: this.renderer.getPixelRatio(), ao: this.ao.enabled, quests: this.state.quests.map(q => ({ id: q.id, status: q.status, progress: `${q.current}/${q.goal}` })), progressStats: this.state.progressStats, reward: this.state.reward ? { title: this.state.reward.rewardTitle, exp: this.state.reward.exp, leveledUp: this.state.reward.leveledUp, allDone: this.state.reward.allDone } : null,
      zone: this.zone, canDeploy: this.state.canDeploy,
      surface: this.zone === 'surface' ? {
        hp: this.vitals.hp, armor: this.vitals.armor,
        mag: this.weapon.mag, reserve: this.weapon.reserve,
        beastsAlive: beastsAlive(this.beasts), beastsTotal: this.beasts.length,
        beasts: this.beasts.map(b => ({ id: b.id, hp: b.hp, state: b.state, at: [Math.round(b.x), Math.round(b.z)] })),
        beacon: this.surfaceHandle ? [Math.round(this.surfaceHandle.beacon.x), Math.round(this.surfaceHandle.beacon.z)] : null,
        outcome: this.outcome,
      } : null }; }

  private registerAgentControls() {
    const context = (document as Document & { modelContext?: { registerTool(tool: unknown, options?: { signal: AbortSignal }): void | Promise<void> } }).modelContext;
    if (!context) return;
    const register = (tool: unknown) => { try { void Promise.resolve(context.registerTool(tool, { signal: this.abort.signal })).catch(error => console.warn('Agent controls unavailable', error)); } catch (error) { console.warn('Agent controls unavailable', error); } };
    register({ name: 'read_hall_state', title: 'Read exploration state', description: 'Read the current local hall exploration status, player position, heading, nearby interaction and investigation progress.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => this.diagnostics() });
    register({ name: 'control_hall_exploration', title: 'Control hall exploration', description: 'Play the hall using the same actions as keyboard/touch. Start, move for up to 4 seconds, turn to a heading (0 faces north, -90 east), inspect a nearby terminal, close its record, or hold the powered core. Movement respects collisions and core activation requires power and proximity. Only changes this local game session.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'tour', 'pause', 'resume', 'restart', 'move', 'look', 'interact', 'close_record', 'hold_core', 'view', 'deploy', 'fire', 'reload', 'extract'] }, direction: { type: 'string', enum: ['forward', 'backward', 'left', 'right'] }, seconds: { type: 'number', minimum: .05, maximum: 4 }, heading: { type: 'number', minimum: -360, maximum: 360 }, pitch: { type: 'number', minimum: -54, maximum: 67 } }, required: ['action'], additionalProperties: false }, annotations: { readOnlyHint: false },
      execute: async (input: unknown) => {
        if (!input || typeof input !== 'object' || !('action' in input)) throw new Error('action is required');
        const args = input as { action: string; direction?: Direction; seconds?: number; heading?: number; pitch?: number };
        if (this.commandBusy) throw new Error('An exploration action is already running');
        if (!this.state.ready) throw new Error('Wait for the scene to finish loading');
        const duration = args.seconds ?? 1;
        if (!Number.isFinite(duration) || duration < .05 || duration > 4) throw new Error('seconds must be between .05 and 4');
        this.commandBusy = true;
        try {
          switch (args.action) {
            case 'start': this.start(); break;
            case 'tour': this.tour(); break;
            case 'pause': this.pause(); break;
            case 'resume': this.resume(); break;
            case 'restart': this.restart(); break;
            case 'close_record': this.closeRecord(); break;
            case 'view': this.toggleView(); break;
            case 'deploy': this.deploy(); break;
            case 'fire': this.fire(); break;
            case 'reload': this.reload(); break;
            case 'extract': this.extract(); break;
            case 'interact': if (!nearestTarget(this.player)) throw new Error('No terminal within reach'); this.interact(); break;
            case 'move':
              if (this.state.mode !== 'play' || this.state.activeRecord || this.state.overlooking) throw new Error('Return to ground exploration before moving');
              if (!args.direction || !['forward', 'backward', 'left', 'right'].includes(args.direction)) throw new Error('Valid direction required');
              this.move(args.direction, true); await new Promise(resolve => setTimeout(resolve, duration * 1000)); this.move(args.direction, false); break;
            case 'look':
              if (typeof args.heading !== 'number' || !Number.isFinite(args.heading) || Math.abs(args.heading) > 360) throw new Error('heading must be -360..360 degrees');
              if (args.pitch !== undefined && (!Number.isFinite(args.pitch) || args.pitch < -54 || args.pitch > 67)) throw new Error('pitch must be -54..67 degrees');
              this.yaw = args.heading * Math.PI / 180; if (args.pitch !== undefined) this.pitch = args.pitch * Math.PI / 180; break;
            case 'hold_core':
              if (this.state.mode !== 'play' || this.state.activeRecord || nearestTarget(this.player)?.id !== 'core' || !this.inspected.has('power')) throw new Error('Restore power and approach the core in exploration mode first');
              this.hold(true); await new Promise(resolve => setTimeout(resolve, 3000)); this.hold(false); break;
            default: throw new Error('Unknown exploration action');
          }
          await new Promise(resolve => setTimeout(resolve, 100)); this.emit(); return this.diagnostics();
        } finally { this.commandBusy = false; this.keys.clear(); }
      },
    });
  }
  dispose() {
    this.disposed = true; this.abort.abort(); this.clearInput(); this.renderer.setAnimationLoop(null); this.audio.dispose();
    this.dust.dispose(); this.lights.dispose();
    const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (materials.has(material)) continue; materials.add(material);
        Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }); material.dispose();
      }
    });
    textures.forEach(texture => texture.dispose());
    this.composer.passes.forEach(pass => pass.dispose()); this.composer.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
