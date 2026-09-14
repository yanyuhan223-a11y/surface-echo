import * as THREE from 'three';
import { npcQuests } from './quests';

export interface NpcVisual {
  id: string;
  group: THREE.Group;
  marker: THREE.Sprite;
  ring: THREE.Mesh;
  color: THREE.Color;
}

/** Build a small canvas sprite for the floating quest marker ( ! / … / ✓ ). */
function markerSprite(): { sprite: THREE.Sprite; draw: (glyph: string, color: string) => void } {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(1.15, 1.15, 1);
  sprite.raycast = () => {}; // never block the camera obstruction ray
  const draw = (glyph: string, color: string) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,18,22,.82)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 74px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 64, 70);
    texture.needsUpdate = true;
  };
  return { sprite, draw };
}

function buildNpc(color: number): { group: THREE.Group; marker: THREE.Sprite; ring: THREE.Mesh; draw: (g: string, c: string) => void } {
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  const holo = (geo: THREE.BufferGeometry, y: number, opacity = .5) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 1.35, transparent: true, opacity,
      roughness: .4, metalness: 0,
    }));
    m.position.y = y; return m;
  };
  // torso + head, slightly translucent "hologram" survivor silhouette
  const torso = holo(new THREE.CapsuleGeometry(.32, .74, 6, 12), 1.16); group.add(torso);
  const head = holo(new THREE.SphereGeometry(.24, 18, 18), 1.86); group.add(head);
  const shoulder = holo(new THREE.BoxGeometry(.86, .16, .42), 1.5, .42); group.add(shoulder);
  const legL = holo(new THREE.CapsuleGeometry(.14, .6, 4, 8), .5, .42); legL.position.x = -.17; group.add(legL);
  const legR = holo(new THREE.CapsuleGeometry(.14, .6, 4, 8), .5, .42); legR.position.x = .17; group.add(legR);
  const armL = holo(new THREE.CapsuleGeometry(.1, .58, 4, 8), 1.16, .42); armL.position.x = -.44; armL.rotation.z = .12; group.add(armL);
  const armR = holo(new THREE.CapsuleGeometry(.1, .58, 4, 8), 1.16, .42); armR.position.x = .44; armR.rotation.z = -.12; group.add(armR);

  // ground projector ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(.5, .82, 40),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06; group.add(ring);

  // soft glow light
  const light = new THREE.PointLight(color, 16, 6, 2); light.position.set(0, 1.3, 0); group.add(light);

  // floating quest marker
  const { sprite, draw } = markerSprite(); sprite.position.set(0, 2.62, 0); group.add(sprite);

  return { group, marker: sprite, ring, draw };
}

export function createNpcs(scene: THREE.Scene) {
  const visuals: (NpcVisual & { draw: (g: string, c: string) => void })[] = [];
  for (const q of npcQuests) {
    const built = buildNpc(q.color);
    built.group.position.set(q.position[0], 0, q.position[2]);
    built.group.rotation.y = q.facing;
    built.group.userData.npc = true;
    scene.add(built.group);
    visuals.push({ id: q.id, group: built.group, marker: built.marker, ring: built.ring, color: new THREE.Color(q.color), draw: built.draw });
  }
  return visuals;
}
