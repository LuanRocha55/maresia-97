// Modelos gerados no Meshy (plano grátis, licença CC BY 4.0: crédito "Meshy" na tela de créditos/README).
// Viraram GLB leves (malha reduzida, cor por vértice, compressão meshopt) em assets/models/meshy/.
// Já vêm no tamanho do jogo (pessoa ~1,2 de altura), com a base no chão e o centro no meio.
//  - hatch (Jegue), ônibus (Busão) e sedã (Sedã Executivo, o carro do agiota): a lataria ("body") é pintada na cor de cada carro
//  - orelhão, banca de jornal e barco de pesca: no mapa, no lugar das peças feitas por código
//  - protagonista: malha única em A-pose, animada por ossos com a mesma pose do boneco de peças (gente97.js)
// Carrega em segundo plano. Até chegar (ou se der erro), o jogo usa as peças antigas.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/meshopt/meshopt_decoder.module.js';
import { setPlayerModel } from './gente97.js';

const DIR = 'assets/models/meshy/';
const SEC = 24; // tamanho do setor dos lotes (unidades 3D)
// tipo do jogo -> modelo. Os dois modelos têm a frente no -X; o jogo usa a frente no +X (gira meia volta).
export const MESHY_CARS = { jegue: 'hatch', busao: 'onibus', luxo: 'sedan' };
const PROPS = ['orelhao', 'banca', 'barco'];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const proto = {};   // nome -> { body: geometry|null, detail: geometry|null, top, len }
let ready = false;
export const meshyReady = () => ready;

const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true }); detailMat.userData.pbr = { r: 0.7 };
const bodyMats = new Map();
function bodyMat(hex) {
  let m = bodyMats.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.pbr = { car: true }; bodyMats.set(hex, m); }
  return m;
}

// GLB quantizado -> geometria em float, já na posição do nó
function plainGeo(o) {
  const geo = o.geometry.clone();
  for (const k of ['position', 'normal']) { const a = geo.attributes[k]; if (a && !(a.array instanceof Float32Array)) { const f = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } geo.setAttribute(k, new THREE.BufferAttribute(f, 3)); } }
  geo.applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
}
async function loadPlayer() {
  try {
    const g = await loader.loadAsync(DIR + 'protagonista.glb'); g.scene.updateMatrixWorld(true);
    let geo = null; g.scene.traverse(o => { if (o.isMesh && !geo) geo = plainGeo(o); });
    if (geo) setPlayerModel(geo);
  } catch (e) { console.warn('Protagonista Meshy não carregou:', e); }
}

export async function loadMeshy() {
  const names = [...Object.values(MESHY_CARS), ...PROPS];
  loadPlayer();
  await Promise.all(names.map(async name => {
    try {
      const g = await loader.loadAsync(DIR + name + '.glb');
      g.scene.updateMatrixWorld(true);
      const P = { body: null, detail: null };
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone();
        // a quantização deixa posição/normal em inteiros: volta pra float antes de aplicar a escala do nó
        for (const k of ['position', 'normal']) { const a = geo.attributes[k]; if (a && !(a.array instanceof Float32Array)) { const f = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } geo.setAttribute(k, new THREE.BufferAttribute(f, 3)); } }
        geo.applyMatrix4(o.matrixWorld);
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        if (o.name === 'body' || (o.parent && o.parent.name === 'body')) P.body = geo; else P.detail = geo;
      });
      const box = new THREE.Box3().setFromObject(g.scene);
      P.top = box.max.y; P.len = box.max.x - box.min.x; P.box = box;
      proto[name] = P;
    } catch (e) { console.warn('Modelo Meshy não carregou:', name, e); }
  }));
  ready = Object.keys(proto).length > 0;
  return ready;
}

// carro com modelo Meshy (null se o tipo não tem ou ainda não carregou). Mesmo formato do models.js.
export function meshyCar(type, color, scale = 1) {
  const name = MESHY_CARS[type], P = proto[name]; if (!P) return null;
  const root = new THREE.Group(), inner = new THREE.Group(); inner.rotation.y = Math.PI; inner.scale.setScalar(scale); root.add(inner);
  const paint = [];
  if (P.detail) { const m = new THREE.Mesh(P.detail, detailMat); m.castShadow = true; inner.add(m); }
  if (P.body) { const m = new THREE.Mesh(P.body, bodyMat(color)); m.castShadow = true; inner.add(m); paint.push(m); }
  return { root, wheels: [], paint, top: P.top * scale, radius: 0.3 * scale, name, repaint: hex => { for (const m of paint) m.material = bodyMat(hex); } };
}

// objetos do mapa em lote (instancing). list: [{ name, x, z, y?, rot }] em unidades 3D. Devolve as malhas novas.
export function meshyProps(scene, list) {
  const out = [], by = new Map(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P3 = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
  // um lote por modelo e por setor do mapa (assim o que está fora da tela nem vai pra GPU)
  for (const it of list) { if (!proto[it.name]) continue; const k = it.name + '|' + Math.floor(it.x / SEC) + ',' + Math.floor(it.z / SEC); (by.get(k) || by.set(k, []).get(k)).push(it); }
  for (const [key, items] of by) {
    const P = proto[key.split('|')[0]];
    for (const geo of [P.detail, P.body]) {
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, detailMat, items.length);
      items.forEach((it, i) => { M.compose(P3.set(it.x, it.y || 0, it.z), Q.setFromAxisAngle(Y, it.rot || 0), S1); im.setMatrixAt(i, M); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      scene.add(im); out.push(im);
    }
  }
  return out;
}
export const hasMeshyProp = name => !!proto[name];
