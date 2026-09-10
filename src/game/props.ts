import * as THREE from 'three';
import { investigations, corePosition } from './logic';

function textTexture(lines: string[], color = '#8bdae0', width = 1024, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#061519'; c.fillRect(0, 0, width, height);
  c.strokeStyle = '#25474e'; c.lineWidth = 2; c.strokeRect(16, 16, width - 32, height - 32);
  c.fillStyle = color;
  lines.forEach((line, i) => { c.font = `${i === 0 ? 54 : 23}px ${i === 0 ? 'monospace' : 'sans-serif'}`; c.fillText(line, 42, 82 + i * 56); });
  for (let i = 0; i < height; i += 4) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, i, width, 1); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
function screen(lines: string[], w: number, h: number) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(lines), toneMapped: false }));
}
function box(w: number, h: number, d: number, material: THREE.Material) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); }

export function createProps(scene: THREE.Scene) {
  const steel = new THREE.MeshStandardMaterial({ color: '#35444a', metalness: .8, roughness: .4 });
  const edge = new THREE.MeshStandardMaterial({ color: '#55646b', metalness: .85, roughness: .35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#0b1418', metalness: .7, roughness: .55 });
  const glow = new THREE.MeshStandardMaterial({ color: '#8ef2ef', emissive: '#76ebef', emissiveIntensity: 2 });
  const targets = [...investigations, { id: 'core', title: '传送控制台', position: corePosition }];
  const markers: Record<string, THREE.Group> = {};
  for (const [i, target] of targets.entries()) {
    const group = new THREE.Group(); group.position.fromArray(target.position);
    const base = box(.9, .18, .85, dark); base.position.y = .09; group.add(base);
    const stem = box(.58, .82, .5, steel); stem.position.y = .54; group.add(stem);
    const head = box(1.25, .45, .68, edge); head.position.set(0, 1.18, 0); head.rotation.x = -.28; group.add(head);
    const terminalLabels = ['AUX POWER', 'ARCHIVE / 07', 'ECHO / 000', 'B-27 / TRACE', 'TEMPORAL SCAN', 'VOICE CACHE'];
    const terminalStates = ['STANDBY > ONLINE', 'RECOVERED LOG', 'SIGNAL DETECTED', 'OWNER UNKNOWN', 'DIRECTION ERROR', 'UNSENT MESSAGE'];
    const isCore = target.id === 'core';
    const face = screen([isCore ? 'TRANSFER / 04' : terminalLabels[i], isCore ? 'HOLD TO INITIALIZE' : terminalStates[i]], 1.08, .33);
    face.position.set(0, 1.215, .354); face.rotation.x = -.28; group.add(face);
    const bar = box(.12, .035, .04, glow); bar.position.set(.45, 1.02, .36); group.add(bar);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .07, 12), dark); dial.rotation.x = Math.PI / 2; dial.position.set(-.43, 1.02, .37); group.add(dial);
    for (let j = 0; j < 4; j++) { const rail = box(.055, .65, .025, edge); rail.position.set(-.21 + j * .14, .5, .264); group.add(rail); }
    if (!isCore) group.rotation.y = Math.atan2(-target.position[0], -target.position[2]);
    group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(group);
    const marker = new THREE.Group(); marker.position.set(target.position[0], 2.15, target.position[2]);
    const square = new THREE.Mesh(new THREE.RingGeometry(.07, .085, 4), new THREE.MeshBasicMaterial({ color: '#9ddde0', transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }));
    square.rotation.z = 0; marker.add(square); scene.add(marker); markers[target.id] = marker;
    const light = new THREE.PointLight('#50c2d7', 2.7, 2.5, 1.5); light.position.set(target.position[0], 1.8, target.position[2]); scene.add(light);
  }
  const centerSign = screen(['Deck 04', 'SURFACE TRANSFER'], 3.4, .68); centerSign.position.set(0, 5.67, 1.429); scene.add(centerSign);
  const backSign = centerSign.clone(); backSign.position.z = -1.429; backSign.rotation.y = Math.PI; scene.add(backSign);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const sign = screen([['04 / ARRIVAL', '01 / SURFACE', '02 / SERVICE', '03 / TRANSIT'][i], 'LIGHTHOUSE · TRANSFER DECK'], 3.8, .68);
    sign.position.set(Math.sin(angle) * 21.46, 6.65, Math.cos(angle) * 21.46); sign.rotation.y = angle + Math.PI; scene.add(sign);
  }
  // Scale cue: an unoccupied expedition helmet and work lights beside the first terminal.
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * .8), edge);
  helmet.position.set(-7.25, .21, 10.1); helmet.rotation.z = .3; scene.add(helmet);
  const waves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < 3; i++) {
    const wave = new THREE.Mesh(new THREE.RingGeometry(1, 1.022, 128), new THREE.MeshBasicMaterial({ color: '#78e5ed', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    wave.rotation.x = -Math.PI / 2; wave.position.y = .115; scene.add(wave); waves.push(wave);
  }
  return { markers, glow, waves };
}
