import * as THREE from 'three'

// Build a normal map + roughness map from an albedo image using a Sobel height estimate.
// Runs once per texture at load; keeps everything procedural so no extra downloads are needed.
export function derivePBR (image, { normalStrength = 2.2, roughBase = 0.72, roughVar = 0.4 } = {}) {
  const size = 256
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, size, size)
  const src = ctx.getImageData(0, 0, size, size).data
  const h = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) h[i] = (src[i*4]*0.299 + src[i*4+1]*0.587 + src[i*4+2]*0.114) / 255
  const nrm = ctx.createImageData(size, size), rough = ctx.createImageData(size, size)
  const at = (x, y) => h[((y+size)%size)*size + ((x+size)%size)]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x-1,y) - at(x+1,y)) * normalStrength
    const dy = (at(x,y-1) - at(x,y+1)) * normalStrength
    const len = Math.hypot(dx, dy, 1), i = (y*size+x)*4
    nrm.data[i] = (dx/len*0.5+0.5)*255; nrm.data[i+1] = (dy/len*0.5+0.5)*255; nrm.data[i+2] = (1/len*0.5+0.5)*255; nrm.data[i+3] = 255
    const r = clamp255((roughBase + (0.5 - h[y*size+x]) * roughVar) * 255)
    rough.data[i] = rough.data[i+1] = rough.data[i+2] = r; rough.data[i+3] = 255
  }
  const nCv = document.createElement('canvas'); nCv.width = nCv.height = size; nCv.getContext('2d').putImageData(nrm, 0, 0)
  const rCv = document.createElement('canvas'); rCv.width = rCv.height = size; rCv.getContext('2d').putImageData(rough, 0, 0)
  return { normalMap: new THREE.CanvasTexture(nCv), roughnessMap: new THREE.CanvasTexture(rCv) }
}
const clamp255 = v => Math.max(0, Math.min(255, v))

export function makePBRMaterial (albedoTex, opts = {}) {
  const { repeat = [3, 3], color = 0xffffff, metalness = 0.15, ...pbr } = opts
  const albedo = albedoTex.clone(); albedo.needsUpdate = true; albedo.colorSpace = THREE.SRGBColorSpace
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping; albedo.repeat.set(...repeat); albedo.anisotropy = 8
  const mat = new THREE.MeshStandardMaterial({ map: albedo, color, metalness, roughness: 0.85 })
  if (albedoTex.image) {
    const { normalMap, roughnessMap } = derivePBR(albedoTex.image, pbr)
    for (const t of [normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat) }
    mat.normalMap = normalMap; mat.normalScale = new THREE.Vector2(1, 1); mat.roughnessMap = roughnessMap
  }
  return mat
}
