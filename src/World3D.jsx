import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { makePBRMaterial } from './pbr'
import xuePortrait from './assets/xue2.png'
import npcRangerUrl from './assets/npc_ranger.png'
import npcOperatorUrl from './assets/npc_operator.png'
import concreteUrl from './assets/tex/concrete.jpg'
import metalUrl from './assets/tex/metal.jpg'
import floorUrl from './assets/tex/floor.jpg'
import hazardUrl from './assets/tex/hazard.jpg'
import pipeUrl from './assets/tex/pipe.jpg'
import panoUrl from './assets/tex/panorama.jpg'
import beastWalkUrl from './assets/beast_walk.png'
import beastAlertUrl from './assets/beast_alert.png'
import beastLungeUrl from './assets/beast_lunge.png'
import colossusUrl from './assets/colossus.jpg'
// ---- Blender 程序化生成的废土资产（tools/blender/build_assets.py）----
import tunnelUrl from './assets/models/tunnel_module.glb'
import hallUrl from './assets/models/station_hall.glb'
import containerUrl from './assets/models/prop_container.glb'
import lockerUrl from './assets/models/prop_locker.glb'
import crateUrl from './assets/models/prop_crate.glb'
import ammoUrl from './assets/models/prop_ammo.glb'
import debrisUrl from './assets/models/prop_debris.glb'
import barrierUrl from './assets/models/prop_barrier.glb'
import seatUrl from './assets/models/prop_seat.glb'
import consoleUrl from './assets/models/prop_console.glb'
import beaconUrl from './assets/models/prop_beacon.glb'
import propPipesUrl from './assets/models/prop_pipes.glb'
import { CLUES, SUPPLIES, NPCS, QUEST_OBJECTS } from './gameData'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const dist2 = (a, b) => Math.hypot(a.x - b[0], a.z - b[2])

// subtle vignette + chromatic aberration + film grain, kept mild to preserve readability
const GradePass = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.0016 }, vig: { value: 0.9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform float vig;
    float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 d=vUv-0.5;
      vec4 c; c.r=texture2D(tDiffuse,vUv+d*amount).r; c.g=texture2D(tDiffuse,vUv).g; c.b=texture2D(tDiffuse,vUv-d*amount).b; c.a=1.0;
      float v=smoothstep(0.95,vig*0.35,length(d)); c.rgb*=mix(0.72,1.0,v);
      float g=(rnd(vUv*vec2(1920.0,1080.0)+time)-0.5)*0.05; c.rgb+=g;
      gl_FragColor=c; }`
}

export default function World3D ({ running, paused, found, threatDone, meeting, confirmed, flashlight, scannerPulse, audio, collected, dialog, quests, trackTarget, onStatus, onDiscover, onThreat, onSafe, onMeet, onConfirm, onCollect, onTalk, onScanTarget, onActivate }) {
  const mount = useRef(null), live = useRef({})
  const [touch, setTouch] = useState(false), [stick, setStick] = useState({ x: 0, y: 0 })
  const [progress, setProgress] = useState(0), [ready, setReady] = useState(false)
  live.current = { ...live.current, running, paused, found, threatDone, meeting, confirmed, flashlight, scannerPulse, audio, collected, dialog, quests, trackTarget, onStatus, onDiscover, onThreat, onSafe, onMeet, onConfirm, onCollect, onTalk, onScanTarget, onActivate, stick }

  useEffect(() => {
    const host = mount.current
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x11262b, .0122)
    const camera = new THREE.PerspectiveCamera(68, host.clientWidth / host.clientHeight, .08, 320); camera.position.set(0, 1.7, 5)
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
    const dbgThreat = params.has('threat'), dbgAt = parseFloat(params.get('at')), dbgAx = parseFloat(params.get('ax'))
    if (dbgThreat) camera.position.set(0, 1.7, -30)
    if (!isNaN(dbgAt)) camera.position.set(isNaN(dbgAx) ? 0 : dbgAx, 1.7, dbgAt)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45; host.prepend(renderer.domElement)

    // ---- lighting (balanced for readability, cinematic tone) ----
    const hemi = new THREE.HemisphereLight(0x9fd0d4, 0x243033, 1.2); scene.add(hemi)
    const ambient = new THREE.AmbientLight(0x54727a, .55); scene.add(ambient)
    const keyDir = new THREE.DirectionalLight(0xbfe4e6, .85); keyDir.position.set(-9, 26, 14); keyDir.castShadow = true; keyDir.shadow.mapSize.set(1024, 1024); keyDir.shadow.camera.left = -22; keyDir.shadow.camera.right = 22; keyDir.shadow.camera.top = 22; keyDir.shadow.camera.bottom = -22; keyDir.shadow.camera.far = 90; keyDir.shadow.bias = -.0006; keyDir.shadow.autoUpdate = false; keyDir.shadow.needsUpdate = true; scene.add(keyDir)
    const flashlightSpot = new THREE.SpotLight(0xdff6f6, 26, 44, Math.PI / 4.4, .5, 1.0); flashlightSpot.castShadow = false; scene.add(flashlightSpot, flashlightSpot.target)

    const redLights = [], glowSprites = []
    const spriteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const grd = g.createRadialGradient(64,64,0,64,64,64); grd.addColorStop(0,'rgba(255,255,255,1)'); grd.addColorStop(.4,'rgba(255,255,255,.5)'); grd.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c) })()
    const addLamp = (col, x, y, z, intensity, range, list) => {
      const l = new THREE.PointLight(col, intensity, range, 1.6); l.position.set(x, y, z); scene.add(l)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), new THREE.MeshBasicMaterial({ color: col })); bulb.position.copy(l.position); scene.add(bulb)
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: col, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.set(2.4, 2.4, 1); spr.position.copy(l.position); scene.add(spr); glowSprites.push(spr)
      if (list) list.push(l)
      return l
    }
    for (const z of [-8, -46]) addLamp(0xff3b20, z % 3 ? 6 : -6, 3.6, z, 16, 26, redLights)
    for (const [zx, zz, warm] of [[7,-37,1],[-7,-56,0],[6,-78,1],[-8,-104,0]]) addLamp(warm ? 0xffb057 : 0x69d8e0, zx, 3.3, zz, 13, 26)

    // ---- loading ----
    const manager = new THREE.LoadingManager()
    manager.onProgress = (u, loaded, total) => setProgress(Math.round(loaded / total * 100))
    const loader = new THREE.TextureLoader(manager)
    const load = url => new Promise(res => loader.load(url, res))
    const gltf = new GLTFLoader(manager)
    const loadGLB = url => new Promise(res => gltf.load(url, g => res(g.scene), undefined, () => res(null)))

    let raf, composer, disposed = false
    const clock = new THREE.Clock()
    const keys = {}, velocity = new THREE.Vector3(), direction = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ')
    let yaw = 0, pitch = 0, bob = 0, scanStart = -99, hidden = 0, threatStarted = false, lastInteraction = 0, statusAt = 0, searching = null, mouseHeld = false
    const dbgYaw = parseFloat(params.get('yaw')); if (!isNaN(dbgYaw)) yaw = dbgYaw // 静态审查用：直接指定初始朝向
    // moving parts referenced in the frame loop, assigned after assets load
    let flicker = redLights, apparition = null, xueMat = null, xueGlow = null, threat = null, dust = null, pulse = null, beaconLight = null
    let beastMat = null, beastGlow = null, beastLight = null, beastPoses = {}, colossus = null, dangerPlane = null, dangerLevel = 0, growlAt = 0, poseKey = 'walk'
    const npcNodes = [], beaconNodes = {}, consoleNodes = {}

    Promise.all([
      load(concreteUrl), load(metalUrl), load(floorUrl), load(hazardUrl), load(pipeUrl), load(panoUrl),
      loadGLB(tunnelUrl), loadGLB(hallUrl), loadGLB(containerUrl), loadGLB(lockerUrl), loadGLB(crateUrl),
      loadGLB(ammoUrl), loadGLB(debrisUrl), loadGLB(barrierUrl), loadGLB(seatUrl), loadGLB(consoleUrl),
      loadGLB(beaconUrl), loadGLB(propPipesUrl)
    ]).then(([concreteT, metalT, floorT, hazardT, pipeT, panoT, gTunnel, gHall, gContainer, gLocker, gCrate, gAmmo, gDebris, gBarrier, gSeat, gConsole, gBeacon, gPipes]) => {
      if (disposed) return
      // skybox + environment reflections from AI panorama
      panoT.mapping = THREE.EquirectangularReflectionMapping; panoT.colorSpace = THREE.SRGBColorSpace
      const pmrem = new THREE.PMREMGenerator(renderer); const envRT = pmrem.fromEquirectangular(panoT)
      scene.background = panoT; scene.environment = envRT.texture; scene.backgroundIntensity = .55; pmrem.dispose()

      const concrete = makePBRMaterial(concreteT, { repeat: [4, 10], color: 0x8fa2a6, metalness: .06, roughBase: .82 })
      const wall = makePBRMaterial(concreteT, { repeat: [3, 3], color: 0x869a9e, metalness: .06 })
      const metal = makePBRMaterial(metalT, { repeat: [2, 2], color: 0x9aa7ad, metalness: .7, roughBase: .55 })
      const floor = makePBRMaterial(floorT, { repeat: [10, 40], color: 0x9fb0b3, metalness: .25, roughBase: .5 })
      const hazard = makePBRMaterial(hazardT, { repeat: [1, 1], color: 0xd9c37a, metalness: .4 })
      const pipe = makePBRMaterial(pipeT, { repeat: [1, 3], color: 0xb08a6a, metalness: .55 })

      // Blender 里只写入材质"插槽名"，这里统一换成项目的 PBR 材质，GLB 本身不带贴图
      const SLOT = { MAT_CONCRETE: concrete, MAT_METAL: metal, MAT_HAZARD: hazard, MAT_PIPE: pipe }
      const slotOf = m => SLOT[(m && m.name) || ''] || concrete

      // 把一个 GLB 的所有子 mesh 烘到世界空间，再按给定变换批量实例化（每个子 mesh 仅 1 个 drawcall）
      const instanceGLB = (root, transforms, cast = false) => {
        if (!root || !transforms.length) return
        root.updateMatrixWorld(true)
        const dummy = new THREE.Object3D()
        root.traverse(o => {
          if (!o.isMesh) return
          const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld)
          const im = new THREE.InstancedMesh(geo, slotOf(o.material), transforms.length)
          im.castShadow = cast; im.receiveShadow = true
          transforms.forEach((t, i) => {
            dummy.position.set(t.p[0], t.p[1], t.p[2])
            dummy.rotation.set(0, t.ry || 0, 0)
            dummy.scale.setScalar(t.s || 1)
            dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix)
          })
          im.instanceMatrix.needsUpdate = true
          scene.add(im)
        })
      }
      // 单体摆放：克隆 GLB 并换材质
      const placeGLB = (root, p, ry = 0, s = 1) => {
        if (!root) return new THREE.Group()
        const g = root.clone(true)
        g.traverse(o => { if (o.isMesh) { o.material = slotOf(o.material); o.castShadow = false; o.receiveShadow = true } })
        g.position.set(p[0], p[1], p[2]); g.rotation.y = ry; g.scale.setScalar(s); scene.add(g); return g
      }

      // ---- 主结构：Blender 隧道/站台模块沿 Z 轴拼接，中段插入换乘大厅 ----
      const tunnelTiles = [0, -20, -40, -60, -80, -124, -144, -164].map(z => ({ p: [0, 0, z] }))
      instanceGLB(gTunnel, tunnelTiles, true)
      placeGLB(gHall, [0, 0, -104])

      // 地坪兜底（大厅段与模块缝隙），避免视觉漏空
      const ground = new THREE.Mesh(new THREE.BoxGeometry(30, .4, 240), floor); ground.position.set(0, -.42, -90); ground.receiveShadow = true; scene.add(ground)
      const puddleMat = new THREE.MeshStandardMaterial({ color: 0x1a2b2f, metalness: .95, roughness: .12, envMapIntensity: 1.2 })
      for (const [px, pz, s] of [[-3,-20,5],[4,-52,7],[-2,-88,6],[5,-108,5]]) { const pd = new THREE.Mesh(new THREE.CircleGeometry(s*.5, 20), puddleMat); pd.rotation.x = -Math.PI/2; pd.position.set(px, .02, pz); scene.add(pd) }

      // ---- Blender 道具实例化铺陈：碎石堆 / 长椅 / 护栏 / 管束 ----
      const rnd = (a, b, i) => a + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * (b - a)
      // 交互点周围留出净空，避免道具遮挡 NPC / 物资 / 线索 / 任务装置
      const keepOut = [
        ...NPCS.map(n => ({ p: n.position, r: 5.5 })),
        ...SUPPLIES.map(s => ({ p: s.position, r: 4 })),
        ...CLUES.map(c => ({ p: c.position, r: 4 })),
        ...QUEST_OBJECTS.beacons.map(b => ({ p: b.position, r: 4 })),
        ...QUEST_OBJECTS.consoles.map(c => ({ p: c.position, r: 4 }))
      ]
      const free = t => !keepOut.some(k => Math.hypot(t.p[0] - k.p[0], t.p[2] - k.p[2]) < k.r)
      const scatter = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).filter(free)

      instanceGLB(gDebris, scatter(26, i => ({ p: [rnd(-9.2, 9.2, i), 0, -6 - rnd(0, 150, i + 3)], ry: rnd(0, 6.2, i + 7), s: rnd(.28, .6, i + 11) })))
      instanceGLB(gSeat, scatter(10, i => ({ p: [i % 2 ? 8.6 : -8.6, 0, -14 - i * 13], ry: i % 2 ? -Math.PI / 2 + .12 : Math.PI / 2 - .1, s: .9 })))
      instanceGLB(gBarrier, scatter(14, i => ({ p: [rnd(-8.6, 8.6, i + 21), 0, -10 - rnd(0, 140, i + 5)], ry: rnd(0, 3.1, i + 2), s: .8 })))
      instanceGLB(gPipes, scatter(8, i => ({ p: [i % 2 ? 9.0 : -9.0, 3.4 + (i % 3) * .6, -12 - i * 18], ry: 0, s: 1 })))
      instanceGLB(gContainer, scatter(8, i => ({ p: [rnd(-8, 8, i + 31), 0, -18 - i * 19], ry: rnd(0, 3.1, i + 13), s: .95 })))
      instanceGLB(gCrate, scatter(10, i => ({ p: [rnd(-8.6, 8.6, i + 41), 0, -12 - rnd(0, 145, i + 17)], ry: rnd(0, 3.1, i + 19), s: rnd(.6, .9, i + 23) })))

      // ---- clue pylons with glow ----
      CLUES.forEach((c, i) => {
        const g = new THREE.Group(); g.position.set(...c.position)
        const core = new THREE.Mesh(new THREE.CylinderGeometry(.24 + i*.06, .38, 1 + i*.3, 10), new THREE.MeshStandardMaterial({ color: 0x2c3b40, emissive: 0x63e0d6, emissiveIntensity: 2.4, roughness: .35, metalness: .55, envMapIntensity: 1 })); core.position.y = -.3; core.castShadow = true
        const halo = new THREE.Mesh(new THREE.TorusGeometry(.6 + i*.1, .05, 10, 32), new THREE.MeshBasicMaterial({ color: 0x8ff6ec })); halo.rotation.x = Math.PI/2
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, .18, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x8ff6ec, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 2.6
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: 0x8ff6ec, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.set(2.6, 2.6, 1); spr.position.y = .3; glowSprites.push(spr)
        g.add(core, halo, beam, spr, new THREE.PointLight(0x7cf0e4, 5, 8, 2)); scene.add(g)
      })

      // ---- 物资点：直接使用 Blender 道具模型 ----
      const supplyModel = { container: gContainer, locker: gLocker, corpse: gDebris, ammo: gAmmo, crate: gCrate }
      const supplyMeshes = {}
      SUPPLIES.forEach(s => {
        const grp = new THREE.Group(); grp.position.set(s.position[0], 0, s.position[2])
        const model = (supplyModel[s.kind] || gCrate)
        if (model) { const m = model.clone(true); m.traverse(o => { if (o.isMesh) { o.material = slotOf(o.material); o.castShadow = false; o.receiveShadow = true } }); m.rotation.y = s.position[2] * .3; grp.add(m) }
        const markColor = s.key ? 0xffc24d : 0x74e8dd
        const edge = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshBasicMaterial({ color: markColor })); edge.position.y = 2.1
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: markColor, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.set(1.5, 1.5, 1); spr.position.copy(edge.position); glowSprites.push(spr)
        grp.add(edge, spr); grp.userData = { id: s.id, marker: edge, spr }
        scene.add(grp); supplyMeshes[s.id] = grp
      })
      live.current.supplyMeshes = supplyMeshes

      // ---- 任务交互物：信标（脉冲扫描目标）与中继台（现场操作目标）----
      QUEST_OBJECTS.beacons.forEach(b => {
        const g = placeGLB(gBeacon, [b.position[0], 0, b.position[2]], b.position[2] * .2)
        const halo = new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7bf0ff })); halo.position.y = 3.2
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: 0x7bf0ff, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.set(2.4, 2.4, 1); spr.position.y = 3.2
        const lt = new THREE.PointLight(0x6fe6ff, 3.5, 12, 2); lt.position.y = 3.2
        g.add(halo, spr, lt); g.userData = { id: b.id, halo, spr, light: lt }
        beaconNodes[b.id] = g
      })
      QUEST_OBJECTS.consoles.forEach(c => {
        const g = placeGLB(gConsole, [c.position[0], 0, c.position[2]], c.position[0] > 0 ? -Math.PI / 2.2 : Math.PI / 2.2)
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .5), new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }))
        screen.position.set(0, 1.62, -.34); screen.rotation.x = -.55
        const lt = new THREE.PointLight(0xff6a3a, 2.6, 9, 2); lt.position.set(0, 1.7, -.4)
        g.add(screen, lt); g.userData = { id: c.id, screen, light: lt }
        consoleNodes[c.id] = g
      })

      // ---- far suspended lighthouse ----
      const farBox = (sx, sy, sz, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), metal); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m) }
      farBox(20, 2.6, 8, 22, 24, -170, -.12); farBox(8, 18, 5, 22, 15, -170, -.12)
      beaconLight = addLamp(0x93dbe0, 22, 26, -170, 9, 120)

      // ---- distant colossus silhouette (high-res impostor plane, additive so black background vanishes) ----
      const colTex = new THREE.TextureLoader(manager).load(colossusUrl); colTex.colorSpace = THREE.SRGBColorSpace
      colossus = new THREE.Mesh(new THREE.PlaneGeometry(150, 84), new THREE.MeshBasicMaterial({ map: colTex, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      colossus.position.set(-28, 30, -205); scene.add(colossus)

      // ---- threat creature: textured billboard impostor (walk / alert / lunge poses) ----
      const bLoad = u => { const t = new THREE.TextureLoader(manager).load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
      beastPoses = { walk: bLoad(beastWalkUrl), alert: bLoad(beastAlertUrl), lunge: bLoad(beastLungeUrl) }
      threat = new THREE.Group()
      beastMat = new THREE.MeshBasicMaterial({ map: beastPoses.walk, transparent: true, alphaTest: .28, depthWrite: false, color: 0xbcd6d4, fog: true })
      const beastPlane = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 8.2), beastMat); beastPlane.position.y = 0
      beastGlow = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 8.7), new THREE.MeshBasicMaterial({ map: beastPoses.walk, transparent: true, alphaTest: .28, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, color: 0xff2a12, fog: false }))
      beastGlow.position.y = 0
      beastLight = new THREE.PointLight(0xff3018, 6, 16, 2); beastLight.position.set(0, 1.2, .3)
      threat.add(beastPlane, beastGlow, beastLight); threat.position.set(10, 4.2, -48); threat.visible = false; scene.add(threat)

      // ---- fullscreen danger flash (child of camera, additive red) ----
      dangerPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xff1707, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      dangerPlane.position.set(0, 0, -.5); dangerPlane.renderOrder = 999; camera.add(dangerPlane); scene.add(camera)

      // ---- NPC：高精度立绘 billboard，站立于地面，带轮廓补光与呼吸浮动 ----
      const npcArt = { ranger: npcRangerUrl, operator: npcOperatorUrl, xue: xuePortrait }
      NPCS.forEach(n => {
        if (n.id === 'xue') return // 樰由既有的“显影”流程单独驱动
        const grp = new THREE.Group(); grp.position.set(n.position[0], n.scale * .5, n.position[2])
        const tex = new THREE.TextureLoader(manager).load(npcArt[n.art], t => {
          // 按立绘真实宽高比修正 billboard，避免人物被拉伸
          const ar = t.image && t.image.width ? t.image.width / t.image.height : .68
          plane.scale.set(ar * n.scale, n.scale, 1)
          glow.scale.set(ar * n.scale * 1.06, n.scale * 1.05, 1)
        })
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .22, depthWrite: false, color: n.tint }))
        plane.scale.set(n.scale * .68, n.scale, 1)
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .22, depthWrite: false, opacity: .1, blending: THREE.AdditiveBlending, color: n.tint, fog: false }))
        glow.scale.set(n.scale * .74, n.scale * 1.05, 1)
        const rim = new THREE.PointLight(n.tint, 2.4, 10, 2); rim.position.set(0, .4, .8)
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: n.tint, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false })); spr.scale.set(2.6, 2.6, 1); spr.position.y = -n.scale * .18
        grp.add(glow, plane, rim, spr); grp.userData = { id: n.id, base: n.scale * .5, glow, rim }
        scene.add(grp); npcNodes.push(grp)
      })

      // ---- Xue: layered billboard, portrait plane + additive glow halo ----
      const xTex = new THREE.TextureLoader(manager).load(xuePortrait); xTex.colorSpace = THREE.SRGBColorSpace
      apparition = new THREE.Group(); apparition.position.set(1.6, 3.4, -92)
      xueGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 10), new THREE.MeshBasicMaterial({ map: xTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x7fd7d4 }))
      xueMat = new THREE.MeshBasicMaterial({ map: xTex, alphaMap: xTex, transparent: true, opacity: 0, depthWrite: false, color: 0xcfeeec })
      const portrait = new THREE.Mesh(new THREE.PlaneGeometry(5, 7.5), xueMat)
      apparition.add(xueGlow, portrait); scene.add(apparition)
      const xueLight = new THREE.PointLight(0x8fe0dc, 0, 12, 2); xueLight.position.copy(apparition.position); scene.add(xueLight); apparition.userData.light = xueLight

      // ---- floating ash ----
      const count = 1600, positions = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) { positions[i*3] = (Math.random()-.5)*40; positions[i*3+1] = Math.random()*9; positions[i*3+2] = 8-Math.random()*185 }
      const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: spriteTex, color: 0x8fb0ad, size: .06, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(dust)
      pulse = new THREE.Mesh(new THREE.RingGeometry(.3, .36, 56), new THREE.MeshBasicMaterial({ color: 0x7df4e8, side: THREE.DoubleSide, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); pulse.rotation.x = -Math.PI/2; scene.add(pulse)

      // ---- postprocessing ----
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth * .5, host.clientHeight * .5), .62, .55, .82); composer.addPass(bloom)
      const grade = new ShaderPass(GradePass); composer.addPass(grade)
      composer.addPass(new OutputPass())
      composer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); composer.setSize(host.clientWidth, host.clientHeight)
      live.current.grade = grade
      keyDir.shadow.needsUpdate = true // 结构模型就位后重烘一次静态阴影
      setReady(true)
    })

    const keyDown = e => { keys[e.code] = true; if (e.code === 'KeyE') interact(); if (e.code === 'KeyQ') performScan() }
    const keyUp = e => { keys[e.code] = false }
    const mouseMove = e => { if (document.pointerLockElement === renderer.domElement && live.current.running && !live.current.paused) { yaw -= e.movementX * .0022; pitch = clamp(pitch - e.movementY * .0018, -.78, .78) } }
    const lock = () => { if (live.current.running && !live.current.paused && !('ontouchstart' in window)) renderer.domElement.requestPointerLock() }
    const mouseDown = e => { if (e.button !== 0) return; mouseHeld = true; if (!live.current.running || live.current.paused) return; interact(); if (!('ontouchstart' in window) && document.pointerLockElement !== renderer.domElement) lock() }
    const mouseUp = e => { if (e.button === 0) mouseHeld = false }

    // 脉冲扫描：既用于确认樰的存在，也用于点亮岑苓的定位任务信标
    const performScan = () => {
      if (!live.current.running || live.current.paused) return
      scanStart = performance.now(); live.current.audio?.scan()
      const forward = new THREE.Vector3(); camera.getWorldDirection(forward)
      const flat = new THREE.Vector3(forward.x, 0, forward.z).normalize()
      for (const b of QUEST_OBJECTS.beacons) {
        const to = new THREE.Vector3(b.position[0] - camera.position.x, 0, b.position[2] - camera.position.z)
        const d = to.length()
        if (d < 18 && to.clone().normalize().dot(flat) > .55) { live.current.onScanTarget?.('beacons', b.id); break }
      }
      if (live.current.meeting && apparition) { const to = new THREE.Vector3().subVectors(apparition.position, camera.position).normalize(); if (to.dot(forward) > .84 && camera.position.distanceTo(apparition.position) < 24) live.current.onConfirm() }
    }

    // 最近的可交互对象（NPC > 中继台 > 线索），保证提示出现即可执行
    const nearestNPC = () => {
      let best = null, nd = 99
      for (const n of NPCS) {
        if (n.requires === 'meeting' && !live.current.meeting) continue
        const d = dist2(camera.position, n.position); if (d < nd) { nd = d; best = n }
      }
      return best && nd < 5.0 ? best : null
    }
    const nearestConsole = () => {
      const q = live.current.quests?.q_relay
      if (!q || q.state !== 'active') return null
      let best = null, nd = 99
      for (const c of QUEST_OBJECTS.consoles) { if (q.done?.includes(c.id)) continue; const d = dist2(camera.position, c.position); if (d < nd) { nd = d; best = c } }
      return best && nd < 4.2 ? best : null
    }
    const interact = () => {
      if (!live.current.running || live.current.paused || live.current.dialog) return
      if (performance.now() - lastInteraction < 250) return; lastInteraction = performance.now()
      const npc = nearestNPC()
      if (npc) { live.current.onTalk?.(npc.id); live.current.audio?.tone(420, .28, .12); return }
      const con = nearestConsole()
      if (con) { live.current.onActivate?.('consoles', con.id); live.current.audio?.tone(680, .4, .16); return }
      const forward = new THREE.Vector3(); camera.getWorldDirection(forward)
      let best = null, score = -1, closest = null, cd = 99
      CLUES.forEach(c => { if (live.current.found.includes(c.id)) return; const to = new THREE.Vector3(c.position[0]-camera.position.x, 0, c.position[2]-camera.position.z); const d = to.length(); if (d < cd) { cd = d; closest = c } const dot = to.clone().normalize().dot(new THREE.Vector3(forward.x,0,forward.z).normalize()); if (d < 5 && dot > .2 && dot/d > score) { best = c; score = dot/d } })
      const target = best || (closest && cd < 4.8 ? closest : null)
      if (target) { live.current.onDiscover(target.id); live.current.audio?.tone(320, .35, .14) }
    }
    const nearestSupply = () => {
      let best = null, nd = 99
      for (const s of SUPPLIES) { if (live.current.collected?.includes(s.id)) continue; const d = dist2(camera.position, s.position); if (d < nd) { nd = d; best = s } }
      return best && nd < 3.6 ? best : null
    }
    addEventListener('keydown', keyDown); addEventListener('keyup', keyUp); addEventListener('mousemove', mouseMove); addEventListener('mouseup', mouseUp); renderer.domElement.addEventListener('mousedown', mouseDown)
    const resize = () => { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); composer?.setSize(host.clientWidth, host.clientHeight) }; addEventListener('resize', resize)

        // ---- 自适应画质：连续掉帧时逐级降级（分辨率 -> 后期 -> 阴影/粒子），保证弱显卡也能玩 ----
    let fpsAcc = 0, fpsFrames = 0, tier = 0
    const lite = params.get('lite') === '1'   // 低配模式：直接跳过后期与阴影
    const degrade = () => {
      tier++
      if (tier === 1) { renderer.setPixelRatio(1); composer?.setPixelRatio(1) }
      else if (tier === 2) { composer = null }
      else if (tier === 3) { renderer.shadowMap.enabled = false; if (dust) dust.visible = false; scene.background = null }
      else if (tier === 4) { renderer.setPixelRatio(0.6) }   // 极低配：降采样渲染
      else if (tier === 5) { renderer.setPixelRatio(0.4) }
    }

    if (lite) { composer = null; renderer.shadowMap.enabled = false; renderer.setPixelRatio(.7); if (dust) dust.visible = false; tier = 3 }

    const frame = now => {
      raf = requestAnimationFrame(frame); const dt = Math.min(clock.getDelta(), .035), state = live.current
      // 用真实墙钟时间统计帧率（dt 被 clamp 过，不能用来计时）
      if (!fpsAcc) fpsAcc = now
      fpsFrames++
      if (now - fpsAcc > 1500) { const fps = fpsFrames * 1000 / (now - fpsAcc); fpsAcc = now; fpsFrames = 0; if (fps < 26 && tier < 5) degrade() }
      const frozen = state.paused || state.dialog
      if (state.running && !frozen) {
        if (state.lookDelta) { yaw -= state.lookDelta.x * .006; pitch = clamp(pitch - state.lookDelta.y * .005, -.78, .78); state.lookDelta = null }
        const sprint = keys.ShiftLeft || keys.ShiftRight, crouch = keys.KeyC, joy = state.stick || {x:0,y:0}
        const inputX = (keys.KeyD ? 1:0)-(keys.KeyA ? 1:0)+joy.x, inputZ = (keys.KeyS ? 1:0)-(keys.KeyW ? 1:0)+joy.y
        direction.set(inputX, 0, inputZ); if (direction.lengthSq() > 1) direction.normalize()
        const speed = crouch ? 2.2 : sprint ? 7.5 : 4.2
        velocity.x = THREE.MathUtils.damp(velocity.x, direction.x * speed, 9, dt); velocity.z = THREE.MathUtils.damp(velocity.z, direction.z * speed, 9, dt)
        const sin = Math.sin(yaw), cos = Math.cos(yaw), dx = velocity.x*cos + velocity.z*sin, dz = velocity.z*cos - velocity.x*sin
        camera.position.x = clamp(camera.position.x + dx*dt, -9, 9)
        let nextZ = camera.position.z + dz*dt
        if (!state.threatDone && threatStarted) nextZ = Math.max(nextZ, -53)
        camera.position.z = clamp(nextZ, -112, 6)
        const moving = Math.abs(inputX)+Math.abs(inputZ) > .15
        if (moving) { bob += dt * (sprint ? 12 : crouch ? 4 : 7.5); state.audio?.step() } else bob += dt * 1.3
        const eyeY = crouch ? 1.12 : 1.7; camera.position.y = THREE.MathUtils.lerp(camera.position.y, eyeY + Math.sin(bob)*(moving ? .045 : .012), .12)
        euler.set(pitch + Math.sin(bob*.5)*.004, yaw, moving ? Math.sin(bob*.5)*.006 : 0); camera.quaternion.setFromEuler(euler)
        flashlightSpot.visible = state.flashlight; flashlightSpot.position.copy(camera.position); const target = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(8).add(camera.position); flashlightSpot.target.position.copy(target)
        if (!threatStarted && (dbgThreat || (state.found.length >= 2 && camera.position.z < -40)) && !state.threatDone) { threatStarted = true; state.onThreat(); state.audio?.alert() }
        const threatActive = threat && threatStarted && !state.threatDone
        if (threat) threat.visible = threatActive
        // ---- scavenge search state machine (hold to search, needs crouch for some, interruptible) ----
        const sup = nearestSupply(), searchHeld = (keys.KeyR || state.searchHeld || mouseHeld) && !moving
        if (sup && searchHeld && (!sup.time_crouch || crouch)) {
          if (!searching || searching.id !== sup.id) searching = { id: sup.id, t: 0 }
          searching.t += dt; if (Math.floor(searching.t*6) !== Math.floor((searching.t-dt)*6)) state.audio?.tone(240, .05, .05)
          if (threatActive) { hidden = clamp(hidden - dt*1.6, 0, 3.2); state.audio?.step() }
          if (searching.t >= sup.time) { state.onCollect(sup); state.audio?.tone(540, .3, .16); searching = null }
        } else if (searching) searching = null
        let threatPrompt = null, lootPrompt = null, cluePrompt = null, npcPrompt = null
        const npcNear = nearestNPC(), conNear = nearestConsole()
        if (npcNear) npcPrompt = `[ E / 左键 ] 与 ${npcNear.name} 对话`
        else if (conNear) npcPrompt = `[ E / 左键 ] 接入 ${conNear.label}`
        if (threatActive) { try {
          const exposed = !dbgThreat && ((sup && searchHeld) || !crouch)
          const closeIn = exposed ? dt*2.1 : -dt*1.0
          threat.position.x = clamp(THREE.MathUtils.damp(threat.position.x, camera.position.x + Math.sin(now*.0006)*5, 1.2, dt), -9, 9)
          threat.userData.z = dbgThreat ? -43 : clamp((threat.userData.z ?? -48) + closeIn, -53, camera.position.z - 3)
          threat.position.z = threat.userData.z
          threat.rotation.y = Math.atan2(camera.position.x - threat.position.x, camera.position.z - threat.position.z)
          const gap = camera.position.distanceTo(threat.position), prox = clamp((26 - gap) / 20, 0, 1)
          const breathe = (1 + Math.sin(now*.004)*.05) * (1 + prox*.5)
          threat.scale.set(breathe, breathe + Math.sin(now*.005)*.03, 1); threat.rotation.z = Math.sin(now*.0016)*.06
          const wantPose = (exposed && prox > .55) ? 'lunge' : prox > .35 ? 'alert' : 'walk'
          if (wantPose !== poseKey) { poseKey = wantPose; beastMat.map = beastPoses[poseKey]; beastGlow.material.map = beastPoses[poseKey]; beastMat.needsUpdate = beastGlow.material.needsUpdate = true; if (poseKey === 'lunge') state.audio?.growl?.() }
          beastGlow.material.opacity = prox*.55 + (poseKey === 'lunge' ? .25 : 0) + Math.sin(now*.02)*.05*prox
          beastLight.intensity = 5 + prox*22 + Math.sin(now*.03)*2
          const inShadow = camera.position.x < -4.2 && camera.position.z < -43 && camera.position.z > -53 && crouch
          if (!searching) hidden = clamp(hidden + (inShadow ? dt : -dt*1.4), 0, 3.2)
          if (hidden >= 3) { state.onSafe(); threatStarted = false; state.audio?.tone(55,.8,.18) }
          if (exposed && prox > .5) { dangerLevel = Math.min(1, dangerLevel + dt*2.2); if (now - growlAt > 1400) { growlAt = now; state.audio?.growl?.() } }
          else dangerLevel = Math.max(0, dangerLevel - dt*1.6)
          threatPrompt = (sup && searchHeld) ? '它听见了你…蹲下！' : inShadow ? '屏住呼吸…' : '蹲伏进入左侧阴影'
        } catch (err) { threatPrompt = 'ERR:' + (err && err.message || err) } } else {
          let nearest = null, nd = 99
          CLUES.forEach(c => { if (!state.found.includes(c.id)) { const d = dist2(camera.position,c.position); if (d<nd){nd=d;nearest=c} } })
          if (nearest && nd < 4.8) cluePrompt = `[ E / 左键 ] 检查 ${nearest.label}`
        }
        if (sup && !threatActive) lootPrompt = sup.time_crouch && !crouch ? `[ C 蹲下 ] 翻找 ${sup.label}` : `[ 长按 R / 左键 ] 搜寻 ${sup.label}`
        // ---- 任务方向指引：把追踪目标换算成相对玩家朝向的罗盘角度 + 距离 ----
        let guide = null
        if (state.trackTarget) {
          const t = state.trackTarget
          const to = new THREE.Vector3(t.position[0] - camera.position.x, 0, t.position[2] - camera.position.z)
          const d = to.length()
          const bearing = Math.atan2(to.x, -to.z)
          let rel = bearing - yaw
          while (rel > Math.PI) rel -= Math.PI * 2
          while (rel < -Math.PI) rel += Math.PI * 2
          guide = { label: t.label, dist: Math.round(d), angle: rel }
        }
        if (now - statusAt > 90) { statusAt = now; state.onStatus({ threat: threatActive, hidden: hidden/3, crouch, position: camera.position.clone(), guide, searching: searching ? { label: (SUPPLIES.find(s=>s.id===searching.id)||{}).label, p: searching.t / (SUPPLIES.find(s=>s.id===searching.id)?.time||1) } : null, prompt: npcPrompt || threatPrompt || lootPrompt || cluePrompt || (state.meeting && !state.confirmed ? '[ Q ] 脉冲扫描 · 对准人影' : '') }) }
        if (state.supplyMeshes) for (const s of SUPPLIES) { const g = state.supplyMeshes[s.id]; if (!g) continue; const done = state.collected?.includes(s.id); g.visible = !done; if (!done && g.userData.marker) { const k = .6 + Math.sin(now*.004 + s.position[2])*.4; g.userData.marker.scale.setScalar(k*1.4); g.userData.spr.material.opacity = .45 + k*.4 } }
        if (state.found.length === 3 && state.threatDone && camera.position.z < -78 && !state.meeting) state.onMeet()
      }
      // ---- 任务物件 & NPC 的常驻表现（暂停/对话时也保持呼吸感）----
      const st = live.current
      const bq = st.quests?.q_beacon
      for (const b of QUEST_OBJECTS.beacons) {
        const g = beaconNodes[b.id]; if (!g) continue
        const lit = bq?.done?.includes(b.id)
        const k = lit ? 1 : .35 + Math.abs(Math.sin(now * .0025)) * .65
        g.userData.light.intensity = (lit ? 7 : 3) * k
        g.userData.halo.material.color.setHex(lit ? 0x9dffc8 : 0x7bf0ff)
        g.userData.spr.material.color.setHex(lit ? 0x9dffc8 : 0x7bf0ff)
        g.userData.spr.material.opacity = .35 + k * .55
      }
      const rq = st.quests?.q_relay
      for (const c of QUEST_OBJECTS.consoles) {
        const g = consoleNodes[c.id]; if (!g) continue
        const on = rq?.done?.includes(c.id)
        g.userData.screen.material.color.setHex(on ? 0x64ffd8 : 0xff6a3a)
        g.userData.light.color.setHex(on ? 0x64ffd8 : 0xff6a3a)
        g.userData.light.intensity = on ? 5 : 2 + Math.abs(Math.sin(now * .006)) * 2.2
      }
      npcNodes.forEach((g, i) => {
        g.lookAt(camera.position.x, g.position.y, camera.position.z)
        g.position.y = g.userData.base + Math.sin(now * .0016 + i) * .05
        g.userData.rim.intensity = 2.6 + Math.sin(now * .0025 + i) * .8
        g.userData.glow.material.opacity = .06 + Math.abs(Math.sin(now * .0018 + i)) * .07
      })
      if (apparition && xueMat) { apparition.lookAt(camera.position.x, apparition.position.y, camera.position.z); const o = live.current.meeting ? .78 + Math.sin(now*.003)*.14 : 0; xueMat.opacity = o; xueGlow.material.opacity = o*.5; apparition.userData.light.intensity = live.current.meeting ? 3.5 + Math.sin(now*.004)*1.5 : 0 }
      flicker.forEach((l,i)=>{l.intensity=12+Math.sin(now*.004+i)*3.5})
      if (!(threat && threat.visible)) dangerLevel = Math.max(0, dangerLevel - .02)
      if (dangerPlane) dangerPlane.material.opacity = dangerLevel*.4 + (dangerLevel>.02 ? Math.abs(Math.sin(now*.02))*.14*dangerLevel : 0)
      if (dangerLevel>.02 && !frozen) { camera.position.x = clamp(camera.position.x + (Math.random()-.5)*dangerLevel*.06, -9, 9); camera.position.y += (Math.random()-.5)*dangerLevel*.05 }
      if (colossus) colossus.material.opacity = .6 + Math.sin(now*.0006)*.14
      if (beaconLight) beaconLight.intensity = 7 + Math.sin(now*.0015)*3
      if (pulse) { const elapsed = (now-scanStart)/1000; if (elapsed < 1.15) { pulse.material.opacity = (1-elapsed/1.15)*.7; pulse.scale.setScalar(1+elapsed*26); pulse.position.set(camera.position.x, .1, camera.position.z) } else pulse.material.opacity=0 }
      if (dust) { dust.rotation.y += dt*.004; const arr = dust.geometry.attributes.position.array; for(let i=1;i<arr.length;i+=3){arr[i]-=dt*.12;if(arr[i]<0)arr[i]=9}dust.geometry.attributes.position.needsUpdate=true }
      glowSprites.forEach((s,i)=>{ s.material.opacity = .6 + Math.sin(now*.003+i)*.25 })
      if (live.current.grade) live.current.grade.uniforms.time.value = now*.001
      if (composer) composer.render(); else renderer.render(scene, camera)
    }
    frame(performance.now())
    return () => { disposed = true; cancelAnimationFrame(raf); removeEventListener('keydown',keyDown); removeEventListener('keyup',keyUp); removeEventListener('mousemove',mouseMove); removeEventListener('mouseup',mouseUp); removeEventListener('resize',resize); renderer.domElement.removeEventListener('mousedown',mouseDown); composer?.dispose?.(); renderer.dispose(); if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement) }
  }, [])

  const startStick = e => { setTouch(true); e.currentTarget.setPointerCapture(e.pointerId) }
  const moveStick = e => { if (!touch) return; const r=e.currentTarget.getBoundingClientRect(), x=(e.clientX-r.left-r.width/2)/(r.width/2), y=(e.clientY-r.top-r.height/2)/(r.height/2); setStick({x:clamp(x,-1,1),y:clamp(y,-1,1)}) }
  const stopStick = () => { setTouch(false); setStick({x:0,y:0}) }
  const lookStart = useRef(null)
  const startLook = e => { lookStart.current={x:e.clientX,y:e.clientY}; e.currentTarget.setPointerCapture(e.pointerId) }
  const moveLook = e => { if(!lookStart.current)return; const dx=e.clientX-lookStart.current.x,dy=e.clientY-lookStart.current.y; live.current.lookDelta={x:dx,y:dy}; lookStart.current={x:e.clientX,y:e.clientY} }
  return <div className="threeHost" ref={mount}>
    <div className={`loadgate ${ready?'gone':''}`}><div className="loadinner"><span>SIGNAL SYNC</span><div className="loadbar"><i style={{width:`${progress}%`}}/></div><small>正在解析地表结构数据 {progress}%</small></div></div>
    <div className="touchLook" onPointerDown={startLook} onPointerMove={moveLook} onPointerUp={()=>lookStart.current=null}/>
    <div className="joystick" onPointerDown={startStick} onPointerMove={moveStick} onPointerUp={stopStick} onPointerCancel={stopStick}><i style={{transform:`translate(${stick.x*24}px,${stick.y*24}px)`}}/></div>
    <button className="searchBtn" onPointerDown={()=>{live.current.searchHeld=true}} onPointerUp={()=>{live.current.searchHeld=false}} onPointerCancel={()=>{live.current.searchHeld=false}}>搜寻</button>
  </div>
}
