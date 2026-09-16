import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 灰烬地表 · Surface zone.
 *
 * The imported "灰烬探索大厅与撤离场景" pack is not decoration for the lighthouse hall —
 * it is a second, standalone level. Its authored layout already reads as a complete
 * mission:
 *
 *   西侧 (x≈-21)  破败地下甲板大厅 + 任务终端 + 电磁步枪   → 抵达 / 补给
 *   x≈-1.5        隔离闸                                  → 闸门，通往地表
 *   x≈2…28        灰烬地表 / 蓝晶孢沼泽 / 伞树 / 塔架 / 高架  → 战场
 *   (10,-3.5) (16,5) (21.7,5.2)  废土猎行怪 ×3             → 敌人（改为动态 AI）
 *   (24.5, 8.5)   撤离信标                                 → 撤离点 / 目标
 *   (26.2, 12.8)  远景异兽剪影                             → 压迫感
 *
 * So we rebuild it verbatim from the authored placements, strip out the static hunter
 * beasts (they become live enemies driven by combat.ts) and hand back the landmark
 * positions the game logic needs.
 *
 * The whole zone is parented under one group that the world offsets far below the hall
 * (SURFACE_Y), so both levels can live in a single scene and we simply swap which one
 * is visible.
 */

export const SURFACE_Y = -200;

interface Placement {
  id: string; kind: string; file: string;
  t: [number, number, number];
  r: [number, number, number, number];
  s: [number, number, number];
}

/** Parts that are runtime-only or become dynamic actors. */
const SKIP = new Set(['hud', 'root', 'mix-root']);
const BEAST_ID = 'hunter-beast';

/**
 * Paint the ash sky into an equirectangular canvas: a dim slate zenith fading into a
 * bright dust-loaded horizon, with a smeared sun and a few cloud bands.
 */
function makeAshGroundTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5b5145'; ctx.fillRect(0, 0, size, size);
  // scattered ash drifts and darker cinder patches so the ground is not a flat slab
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 3 + Math.random() * 34;
    ctx.globalAlpha = .05 + Math.random() * .1;
    ctx.fillStyle = Math.random() > .45 ? '#6f6454' : '#3a332b';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (.4 + Math.random() * .6), Math.random() * 3.14, 0, 6.283); ctx.fill();
  }
  // grit
  ctx.globalAlpha = .5;
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = Math.random() > .5 ? '#7d715e' : '#2e2822';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(11, 11);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeAshSky(): THREE.Texture {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2b343c');
  sky.addColorStop(.30, '#4c5760');
  sky.addColorStop(.46, '#8d8877');
  sky.addColorStop(.50, '#c9b795');
  sky.addColorStop(.54, '#7d7360');
  sky.addColorStop(.72, '#4a443c');
  sky.addColorStop(1, '#2a2622');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

  // a diffuse sun burning through the dust, low on the horizon
  // the run starts facing east, so put the sun where the player is actually looking
  const sunX = w * .74, sunY = h * .41;
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * .46);
  halo.addColorStop(0, 'rgba(255,244,214,1)');
  halo.addColorStop(.055, 'rgba(255,236,196,.92)');
  halo.addColorStop(.16, 'rgba(255,214,150,.5)');
  halo.addColorStop(.44, 'rgba(214,176,128,.16)');
  halo.addColorStop(1, 'rgba(180,150,110,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);

  // soft cloud banding so the dome is not a flat ramp
  ctx.globalAlpha = .12;
  for (let i = 0; i < 26; i++) {
    const y = h * (.16 + Math.random() * .3);
    const bandH = 5 + Math.random() * 26;
    const x = Math.random() * w, bandW = 130 + Math.random() * 420;
    ctx.fillStyle = Math.random() > .5 ? '#d8cdb6' : '#232a30';
    ctx.beginPath();
    ctx.ellipse(x, y, bandW, bandH, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface SurfaceHandle {
  group: THREE.Group;
  /** meshes used for the walk-on ground raycast */
  terrain: THREE.Object3D[];
  /** where the player materialises when teleporting in */
  spawn: THREE.Vector3;
  spawnYaw: number;
  /** extraction point — mission goal */
  beacon: THREE.Vector3;
  /** isolation gate between the deck and the open ash field */
  gate: THREE.Vector3;
  /** railgun pickup beside the deck */
  railgun: THREE.Vector3;
  /** authored hunter-beast positions, used as enemy spawns */
  beastSpawns: THREE.Vector3[];
  /** a clone-able hunter beast model for live enemies */
  beastModel: THREE.Object3D | null;
  lights: THREE.Light[];
  /** equirect ash sky used as scene.background while on the surface */
  sky: THREE.Texture;
  update: (time: number) => void;
}

export async function loadSurface(baseUrl: string): Promise<SurfaceHandle> {
  const dir = `${baseUrl}assets/ashscape/`;
  const placements: Placement[] = await fetch(`${dir}placements.json`).then(r => r.json());

  const loader = new GLTFLoader();
  const wanted = [...new Set(placements.filter(p => !SKIP.has(p.id)).map(p => p.file))];
  const models = new Map<string, THREE.Object3D>();
  await Promise.all(wanted.map(async file => {
    try {
      const gltf = await loader.loadAsync(dir + file);
      models.set(file, gltf.scene);
    } catch (err) { console.warn('surface part failed:', file, err); }
  }));

  const group = new THREE.Group();
  group.name = 'surface';
  group.visible = false;

  const terrain: THREE.Object3D[] = [];
  const beastSpawns: THREE.Vector3[] = [];
  let beacon = new THREE.Vector3(24.5, 0, 8.5);
  let gate = new THREE.Vector3(-1.5, 0, 0);
  let railgun = new THREE.Vector3(-22.2, 0, -7.9);
  const drift: { node: THREE.Object3D; base: number; phase: number; kind: string }[] = [];

  for (const p of placements) {
    if (SKIP.has(p.id)) continue;
    // Authored hunter beasts become live enemies; remember where they stood.
    if (p.id === BEAST_ID) { beastSpawns.push(new THREE.Vector3(p.t[0], 0, p.t[2])); continue; }
    const proto = models.get(p.file);
    if (!proto) continue;
    const node = proto.clone(true);
    node.position.set(p.t[0], p.t[1], p.t[2]);
    node.quaternion.set(p.r[0], p.r[1], p.r[2], p.r[3]);
    node.scale.set(p.s[0], p.s[1], p.s[2]);
    node.userData.surface = true;
    node.traverse(o => {
      o.userData.surface = true;
      if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = true; }
    });
    if (p.id === 'ash-ground' || p.id === 'crystal-swamp') terrain.push(node);
    if (p.id === 'evac-beacon') { beacon = new THREE.Vector3(p.t[0], 0, p.t[2]); drift.push({ node, base: p.t[1], phase: 0, kind: 'beacon' }); }
    if (p.id === 'blast-gate') gate = new THREE.Vector3(p.t[0], 0, p.t[2]);
    if (p.id === 'railgun') railgun = new THREE.Vector3(p.t[0], 0, p.t[2]);
    if (p.id === 'ring-lighthouse') drift.push({ node, base: p.t[1], phase: 1.1, kind: 'lighthouse' });
    if (p.id === 'crystal-tree') drift.push({ node, base: p.t[1], phase: Math.random() * 6.28, kind: 'tree' });
    group.add(node);
  }

  // ---- ground backing plane so there are never holes under the player ----
  const ash = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#544a3e', roughness: .96, metalness: .02, map: makeAshGroundTexture() }),
  );
  ash.rotation.x = -Math.PI / 2; ash.position.set(4, -0.05, 0); ash.receiveShadow = true;
  ash.userData.surface = true;
  group.add(ash); terrain.push(ash);

  // ---- extraction marker: a pulsing ring on the ground at the beacon ----
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.45, 64),
    new THREE.MeshBasicMaterial({ color: '#7ef0c4', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pad.rotation.x = -Math.PI / 2; pad.position.set(beacon.x, .12, beacon.z);
  pad.userData.surface = true; group.add(pad);
  drift.push({ node: pad, base: .12, phase: 0, kind: 'pad' });

  // ---- sky: painted as an equirect background texture. A mesh dome would sit
  // outside the camera's 100-unit far plane and get clipped, which is what left
  // the first pass with a pure black sky. ----
  const sky = makeAshSky();

  // ---- surface lighting: cold overcast sky + amber beacon + lighthouse wash ----
  const lights: THREE.Light[] = [];
  const hemi = new THREE.HemisphereLight('#a8bcc6', '#4a4034', 1.28); lights.push(hemi);
  const sun = new THREE.DirectionalLight('#cfd9de', 1.35);
  sun.position.set(-24, 26, -12); sun.castShadow = false; lights.push(sun);
  const beaconLight = new THREE.PointLight('#8effd0', 90, 26, 1.7);
  beaconLight.position.set(beacon.x, 3.4, beacon.z); lights.push(beaconLight);
  const towerLight = new THREE.PointLight('#7fd4ff', 70, 34, 1.8);
  towerLight.position.set(17, 9.4, 6); lights.push(towerLight);
  const deckLight = new THREE.PointLight('#ffb066', 55, 20, 1.7);
  deckLight.position.set(-21, 3.2, -2); lights.push(deckLight);
  for (const l of lights) { l.userData.surface = true; group.add(l); }

  // ---- drifting ash motes ----
  const moteCount = 700;
  const mp = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    mp[i * 3] = -30 + Math.random() * 66;
    mp[i * 3 + 1] = Math.random() * 16;
    mp[i * 3 + 2] = -22 + Math.random() * 44;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: Math.min(devicePixelRatio, 1.6) } },
    vertexShader: `uniform float time; uniform float pixelRatio; varying float vA;
      void main(){ vec3 p=position; p.x+=sin(time*.12+position.z*.3)*1.6; p.y=mod(position.y - time*.35, 16.); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(16.*pixelRatio/-mv.z,1.,4.); vA=smoothstep(60.,4.,-mv.z)*.5; }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(.72,.66,.58, smoothstep(.5,.05,d)*vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.userData.surface = true; group.add(motes);

  const update = (time: number) => {
    moteMat.uniforms.time.value = time;
    for (const d of drift) {
      if (d.kind === 'beacon') d.node.position.y = d.base + Math.sin(time * 1.7) * .1;
      else if (d.kind === 'lighthouse') { d.node.rotation.y += .0022; d.node.position.y = d.base + Math.sin(time * .45 + d.phase) * .3; }
      else if (d.kind === 'tree') d.node.rotation.z = Math.sin(time * .35 + d.phase) * .018;
      else if (d.kind === 'pad') {
        const m = (d.node as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = .38 + Math.sin(time * 2.4) * .22;
        d.node.scale.setScalar(1 + Math.sin(time * 2.4) * .05);
      }
    }
  };

  // Player arrives on the deck, facing east toward the gate.
  // just east of the blast gate (x = -1.5): the ash field, the crystal swamp and the
  // beacon are all in view the instant the player lands.
  const spawn = new THREE.Vector3(2.2, 0, 0.4);

  return {
    group, terrain, spawn, spawnYaw: -Math.PI / 2,
    beacon, gate, railgun, beastSpawns,
    beastModel: models.get('hunter-beast.glb') ?? null,
    lights,
    sky, update,
  };
}
