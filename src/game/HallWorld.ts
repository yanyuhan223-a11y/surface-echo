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

export interface WorldState {
  mode: GameMode; ready: boolean; progress: number; objective: string; investigated: number;
  target: { id: string; title: string; hint: string } | null; activeRecord: RecordData | null;
  toast: string | null; muted: boolean; cinematic: boolean; activation: number; activated: boolean; overlooking: boolean;
  storyOpen: boolean; ending: 'human' | 'mimic' | 'future' | null;
  error: string | null;
}
export const initialState: WorldState = {
  mode: 'intro', ready: false, progress: 0, objective: '寻找配电终端，恢复备用供电', investigated: 0,
  target: null, activeRecord: null, toast: null, muted: false, cinematic: true, activation: 0, activated: false, overlooking: false, storyOpen: false, ending: null, error: null,
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
    this.dust = createDust(this.scene, this.mobile); this.shafts = createLightShafts(this.scene); this.props = createProps(this.scene);
    const avatar = this.createCharacter(); this.character = avatar.group; this.characterParts = avatar.parts; this.scene.add(this.character);
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
    this.camera.position.set(0, 2.6, 21.2); this.camera.lookAt(0, 6.4, 0);
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
      this.scene.add(gltf.scene); this.state.progress = 93; this.emit();
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
      if (clicked && this.state.target) this.interact();
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
    this.lights.core.color.setHex(outcome.color); this.audio.tone('power'); this.toast(outcome.text, 8); this.clearInput(); this.emit();
  };
  move = (direction: Direction, pressed: boolean) => {
    const key = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD' }[direction];
    if (pressed && this.state.mode === 'play' && !this.state.activeRecord) this.keys.add(key); else this.keys.delete(key);
  };
  hold = (_pressed: boolean) => {};
  interact = () => {
    if (this.state.mode !== 'play' || this.state.activeRecord || this.viewMode !== 'floor') return;
    const target = nearestTarget(this.player); if (!target) return;
    if (target.id === 'core') {
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
    this.emit();
  };
  restart = () => {
    this.clearInput(); this.inspected.clear(); this.state = { ...initialState, ready: this.state.ready, progress: 100, muted: this.state.muted };
    this.activationTime = -1; this.viewMode = 'floor'; this.player.set(0, .08, 15.9); this.yaw = 0; this.pitch = .17; this.character.rotation.y = Math.PI;
    this.emit();
  };

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
    if (length > 0) {
      dx /= length; dz /= length;
      const worldX = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw), worldZ = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      const candidate = constrainMovement(this.player, { x: this.player.x + worldX * speed * dt, z: this.player.z + worldZ * speed * dt });
      this.player.x = candidate.x; this.player.z = candidate.z;
      const facing = Math.atan2(worldX, worldZ); this.character.rotation.y = THREE.MathUtils.damp(this.character.rotation.y, facing, 14, dt);
      if (this.time - this.lastStep > (sprinting ? .3 : .47)) { this.audio.tone('step'); this.lastStep = this.time; }
    }
    const ground = floorHeight(this.player.x, this.player.z);
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
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const focus = new THREE.Vector3(this.player.x, this.player.y + (this.mobile ? 1.48 : 1.55), this.player.z);
    const cameraDistance = this.mobile ? 7.1 : 5.4;
    const cameraLift = this.mobile ? 2.65 : 2.15;
    let desiredCamera = focus.clone().addScaledVector(forward, -cameraDistance).add(new THREE.Vector3(0, cameraLift + this.pitch * 1.25, 0));
    const rayDirection = desiredCamera.clone().sub(focus), rayLength = rayDirection.length();
    this.cameraRay.set(focus, rayDirection.normalize()); this.cameraRay.far = rayLength;
    const obstruction = this.cameraRay.intersectObjects(this.scene.children, true).find(hit => {
      let object: THREE.Object3D | null = hit.object; while (object) { if (object === this.character) return false; object = object.parent; }
      return hit.distance > .65 && !(hit.object instanceof THREE.Points);
    });
    if (obstruction) desiredCamera = focus.clone().addScaledVector(rayDirection, Math.max(.85, obstruction.distance - .35));
    this.camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(focus.clone().addScaledVector(forward, 2.2));
    const target = nearestTarget(this.player);
    this.state.target = target ? { id: target.id, title: target.title, hint: target.id === 'core' ? this.state.ending ? '已写入新的现实' : !this.inspected.has('power') ? '需先恢复备用供电' : this.inspected.size >= 4 ? '打开叙事重构台' : `还需 ${4 - this.inspected.size} 条回声` : this.inspected.has(target.id) ? '再次查看记录' : '调查 / 读取记录' } : null;
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
      this.camera.position.set(Math.sin(this.time * .075) * .45, 2.6, 21.2); this.camera.lookAt(0, 6.4, 0);
    } else if (this.state.mode === 'tour') {
      this.character.visible = false;
      const t = this.time - this.tourStart, a = .2 + t * .04;
      this.camera.position.set(Math.sin(a) * 20.1, 6.1 + Math.sin(t * .1) * 3.7, Math.cos(a) * 20.1);
      this.camera.lookAt(0, 4.2, 0);
    } else if (this.state.mode === 'play' && !this.state.activeRecord && !this.state.storyOpen) this.updatePlayer(dt);
    this.dust.update(this.time); this.shafts(this.time); this.film.uniforms.time.value = milliseconds * .001;
    for (const [id, marker] of Object.entries(this.props.markers)) {
      marker.lookAt(this.camera.position); marker.position.y = 2.12 + Math.sin(this.time * 1.5) * .045;
      marker.visible = this.state.mode === 'play' && !this.state.activeRecord && this.viewMode === 'floor' && (!this.inspected.has(id) || id === 'core') && !(id === 'core' && this.state.activated);
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
  diagnostics() { return { ready: this.state.ready, mode: this.state.mode, player: this.player.toArray(), camera: this.camera.position.toArray(), heading: this.yaw * 180 / Math.PI, pitch: this.pitch * 180 / Math.PI, target: this.state.target?.id ?? null, record: this.state.activeRecord?.title ?? null, objective: this.state.objective, investigated: [...this.inspected], activation: this.state.activation, activated: this.state.activated, overlooking: this.state.overlooking, pixelRatio: this.renderer.getPixelRatio(), ao: this.ao.enabled }; }

  private registerAgentControls() {
    const context = (document as Document & { modelContext?: { registerTool(tool: unknown, options?: { signal: AbortSignal }): void | Promise<void> } }).modelContext;
    if (!context) return;
    const register = (tool: unknown) => { try { void Promise.resolve(context.registerTool(tool, { signal: this.abort.signal })).catch(error => console.warn('Agent controls unavailable', error)); } catch (error) { console.warn('Agent controls unavailable', error); } };
    register({ name: 'read_hall_state', title: 'Read exploration state', description: 'Read the current local hall exploration status, player position, heading, nearby interaction and investigation progress.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => this.diagnostics() });
    register({ name: 'control_hall_exploration', title: 'Control hall exploration', description: 'Play the hall using the same actions as keyboard/touch. Start, move for up to 4 seconds, turn to a heading (0 faces north, -90 east), inspect a nearby terminal, close its record, or hold the powered core. Movement respects collisions and core activation requires power and proximity. Only changes this local game session.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'tour', 'pause', 'resume', 'restart', 'move', 'look', 'interact', 'close_record', 'hold_core', 'view'] }, direction: { type: 'string', enum: ['forward', 'backward', 'left', 'right'] }, seconds: { type: 'number', minimum: .05, maximum: 4 }, heading: { type: 'number', minimum: -360, maximum: 360 }, pitch: { type: 'number', minimum: -54, maximum: 67 } }, required: ['action'], additionalProperties: false }, annotations: { readOnlyHint: false },
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
