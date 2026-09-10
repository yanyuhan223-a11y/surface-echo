import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.background = new THREE.Color('#071116');
  scene.fog = new THREE.FogExp2('#112832', .020);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .04);
  scene.environment = env.texture; scene.environmentIntensity = .3;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#91c4d2', '#192225', .46));
  RectAreaLightUniformsLib.init();
  const ceiling = new THREE.RectAreaLight('#a1ecf7', 2.6, 20, 20);
  ceiling.position.set(0, 11.2, 0); ceiling.lookAt(0, 0, 0); scene.add(ceiling);
  const fill = new THREE.RectAreaLight('#6b9bab', 1.6, 12, 5);
  fill.position.set(0, 5, 19); fill.lookAt(0, 4, 0); scene.add(fill);
  const spots: THREE.SpotLight[] = [];
  for (const [x, z] of [[-7, -5], [7, 4]]) {
    const spot = new THREE.SpotLight('#b0edff', 520, 45, .59, .7, 1.55);
    spot.position.set(x, 14.4, z); spot.target.position.set(x * .6, 0, z * .6);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -.0004; spot.shadow.normalBias = .035;
    spot.shadow.camera.near = .5; spot.shadow.camera.far = 40;
    scene.add(spot, spot.target); spots.push(spot);
  }
  const ringLights: THREE.PointLight[] = [], wallLights: THREE.PointLight[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const ring = new THREE.PointLight('#51dfec', 90, 22, 1.75);
    ring.position.set(Math.cos(a) * 11.8, 9.8, Math.sin(a) * 11.8); scene.add(ring); ringLights.push(ring);
    const wall = new THREE.PointLight('#ffae5e', 45, 10, 1.65);
    wall.position.set(Math.cos(a + .3) * 19.6, 2.4, Math.sin(a + .3) * 19.6); scene.add(wall); wallLights.push(wall);
  }
  const core = new THREE.PointLight('#6effff', 90, 20, 1.6); core.position.set(0, 2.4, 0); scene.add(core);
  return { ringLights, wallLights, core, spots, dispose: () => env.dispose() };
}

export async function applyHallMaterials(model: THREE.Object3D, renderer: THREE.WebGLRenderer) {
  const texture = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/industrial-steel.png`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const rough = texture.clone(); rough.colorSpace = THREE.NoColorSpace; rough.needsUpdate = true;
  const bumps = texture.clone(); bumps.colorSpace = THREE.NoColorSpace; bumps.repeat.set(1.7, 1.7); bumps.needsUpdate = true;
  const visited = new Set<THREE.Material>();
  model.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true; obj.receiveShadow = true;
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (visited.has(mat) || !(mat instanceof THREE.MeshStandardMaterial)) continue; visited.add(mat);
      const name = mat.name;
      if (/steel/.test(name)) {
        mat.map = texture; mat.color.set('#8fa5ac'); mat.metalness = .78;
        mat.roughnessMap = rough; mat.roughness = name === 'floor_steel' ? 1.15 : 1.35;
        mat.bumpMap = bumps; mat.bumpScale = name === 'floor_steel' ? .04 : .027;
        if (name === 'edge_steel') { mat.color.set('#b5c5ca'); mat.roughness = .85; }
        if (name === 'grate_steel') { mat.color.set('#647980'); mat.metalness = .7; }
        if (name === 'rust_steel') { mat.color.set('#917458'); mat.metalness = .6; }
      }
      if (name === 'cyan_emission') { mat.emissive.set('#40dce7'); mat.emissiveIntensity = 2.5; mat.color.set('#57b6bd'); }
      if (name === 'amber_emission') { mat.emissive.set('#ff903b'); mat.emissiveIntensity = 3; }
      if (name === 'yellow_warning') { mat.color.set('#ae7835'); mat.roughness = .68; }
      mat.needsUpdate = true;
    }
  });
}

export function createDust(scene: THREE.Scene, mobile: boolean) {
  const count = mobile ? 450 : 1250, positions = new Float32Array(count * 3), sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 21;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 1] = Math.random() * 14; positions[i * 3 + 2] = Math.sin(a) * r;
    sizes[i] = .5 + Math.random();
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: Math.min(devicePixelRatio, 1.6) } },
    vertexShader: `attribute float aSize; uniform float time; uniform float pixelRatio; varying float vAlpha;
    void main(){ vec3 p=position; p.x+=sin(time*.095+position.z)*.45; p.z+=cos(time*.07+position.x)*.3; p.y=mod(position.y+time*.055,14.); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(aSize*19.*pixelRatio/-mv.z,1.,4.); vAlpha=smoothstep(30.,3.,-mv.z)*(.10+aSize*.13); }`,
    fragmentShader: `varying float vAlpha; void main(){float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.05,d)*vAlpha; gl_FragColor=vec4(.48,.76,.79,a);}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dust = new THREE.Points(geometry, material); scene.add(dust);
  return { update: (t: number) => { material.uniforms.time.value = t; }, dispose: () => { geometry.dispose(); material.dispose(); } };
}

export function createLightShafts(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vView=normalize(-mv.xyz); vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),1.5); float ends=sin(vUv.y*3.14159); float bands=.85+.15*sin(vUv.y*31.+time*.25); gl_FragColor=vec4(.18,.43,.52,edge*ends*bands*.032);}`,
  });
  for (const [x, z] of [[-7, -5], [7, 4], [0, -12]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.35, 3.9, 13, 48, 1, true), material);
    cone.position.set(x, 7, z); scene.add(cone);
  }
  return (t: number) => { material.uniforms.time.value = t; };
}

export const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: .28 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time;uniform float vignette;varying vec2 vUv;
  float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233))+time)*43758.5453);}
  void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec2 p=(vUv-.5)*1.35;c*=1.-dot(p,p)*vignette;c+=(rand(vUv)-.5)*.016;gl_FragColor=vec4(c,1.);}`,
};
