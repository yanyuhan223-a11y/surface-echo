import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * "灰烬探索大厅与撤离场景" environment pack — curated integration.
 *
 * The player is confined to the enclosed dome hall (walkable radius ~20.65, a raised
 * ring at r≈18.4–20.65 reached by four stairs, dome height ~15). The imported vista
 * was authored as an open wasteland, so dropping it whole just buries it inside the
 * walls. Instead we hand-place a small set of *hero* props as reachable landmarks on
 * the ring — an evacuation beacon, blue-crystal canopy trees, a quest terminal and a
 * railgun on a rack — plus the floating ring-lighthouse hung high under the dome.
 * Each prop is authored directly in world space (no global transform) so it lines up
 * with the hall floor and never collides with the player, NPCs or camera.
 */

/** Individual asset files inside public/assets/ashscape/ */
const FILES = {
  beacon: 'evac-beacon.glb',
  tree: 'crystal-tree.glb',
  terminal: 'quest-terminal.glb',
  railgun: 'railgun.glb',
  lighthouse: 'ring-lighthouse.glb',
  gate: 'blast-gate.glb',
  swamp: 'crystal-swamp.glb',
} as const;

interface Placement {
  file: string;
  /** world position [x, y, z] */
  t: [number, number, number];
  /** yaw in radians */
  ry: number;
  /** uniform scale */
  s: number;
  /** animation role */
  anim?: 'beacon' | 'lighthouse' | 'tree';
}

/**
 * Ring floor sits at y = 0.65 (see logic.floorHeight). Props are placed on the raised
 * ring (r≈19) at gaps between the three NPCs — warden (4.6,12.5), ranger (13.5,8.5),
 * signal (-12.5,-10.5) — and the four investigation-heavy quadrants.
 */
const RING_Y = 0.65;
const LAYOUT: Placement[] = [
  // Evacuation beacon — south landmark, the emotional anchor of the "撤离" theme.
  // (It is a bright emissive sphere on a mast, so it stays small so as not to blow out.)
  { file: FILES.beacon, t: [3.4, RING_Y, 19.2], ry: Math.PI, s: 0.5, anim: 'beacon' },
  // Blue-crystal canopy trees ringing the hall at wide angles.
  { file: FILES.tree, t: [-16.6, RING_Y, 9.6], ry: 0.5, s: 0.62, anim: 'tree' },
  { file: FILES.tree, t: [16.9, RING_Y, -9.0], ry: -1.1, s: 0.62, anim: 'tree' },
  { file: FILES.tree, t: [-9.6, RING_Y, -16.6], ry: 2.2, s: 0.58, anim: 'tree' },
  { file: FILES.tree, t: [9.6, RING_Y, 16.9], ry: -0.4, s: 0.55, anim: 'tree' },
  // Quest terminal — western wall, echoes the "任务接取终端" module.
  { file: FILES.terminal, t: [-19.2, RING_Y, 2.6], ry: 1.32, s: 1.05 },
  // Railgun on its rack — eastern wall trophy.
  { file: FILES.railgun, t: [19.0, RING_Y, 4.6], ry: -1.5, s: 1.0 },
  // Blue-crystal swamp bed tucked at the north-east ring for glow + colour.
  { file: FILES.swamp, t: [13.6, RING_Y, -13.6], ry: 0.4, s: 0.7 },
  // Floating ring-lighthouse hung high over the north-west quadrant (kept off the
  // central pillar so it reads against the dome), slowly rotating.
  { file: FILES.lighthouse, t: [-6.5, 9.4, -8.0], ry: 0, s: 0.55, anim: 'lighthouse' },
];

export interface AshscapeHandle {
  group: THREE.Group;
  /** animated actors (bobbing beacon / rotating lighthouse / swaying trees) */
  update: (time: number) => void;
}

export async function loadAshscape(baseUrl: string): Promise<AshscapeHandle> {
  const loader = new GLTFLoader();
  const uniqueFiles = [...new Set(LAYOUT.map(p => p.file))];
  const cache = new Map<string, THREE.Group>();
  await Promise.all(uniqueFiles.map(async file => {
    const gltf = await loader.loadAsync(`${baseUrl}assets/ashscape/${file}`);
    cache.set(file, gltf.scene);
  }));

  const group = new THREE.Group();
  group.name = 'ashscape';
  group.userData.npc = false;

  const drifters: { node: THREE.Object3D; base: THREE.Vector3; phase: number; anim: string }[] = [];

  for (const p of LAYOUT) {
    const proto = cache.get(p.file);
    if (!proto) continue;
    const node = proto.clone(true);
    node.position.set(p.t[0], p.t[1], p.t[2]);
    node.rotation.y = p.ry;
    node.scale.setScalar(p.s);
    node.traverse(o => {
      o.userData.ashscape = true;        // exclude from camera-collision raycast
      o.castShadow = false; o.receiveShadow = false;
      if (o instanceof THREE.Mesh) o.frustumCulled = true;
    });
    if (p.anim) {
      drifters.push({ node, base: node.position.clone(), phase: Math.random() * Math.PI * 2, anim: p.anim });
    } else {
      node.matrixAutoUpdate = false; node.updateMatrix();
    }
    group.add(node);
  }

  const update = (time: number) => {
    for (const d of drifters) {
      if (d.anim === 'beacon') {
        d.node.position.y = d.base.y + Math.sin(time * 1.6 + d.phase) * 0.14;
      } else if (d.anim === 'lighthouse') {
        d.node.rotation.y += 0.0016;
        d.node.position.y = d.base.y + Math.sin(time * 0.5 + d.phase) * 0.25;
      } else if (d.anim === 'tree') {
        d.node.rotation.z = Math.sin(time * 0.4 + d.phase) * 0.02;
      }
    }
  };

  return { group, update };
}
