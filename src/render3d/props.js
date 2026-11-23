// Modelos 3D do mapa e das pessoas (pacotes do Kenney, licença CC0, em assets/models/):
//  - árvores e coqueiros (Nature Kit), postes de rua e cones da blitz (City Kit Roads),
//    casas do Jardim e mansões do Alto da Maresia (City Kit Suburban)
//  - jogador e pedestres perto da câmera com animação (Mini Characters)
// Tudo carrega em segundo plano. Até chegar (ou se der erro), a cidade usa as peças feitas por código.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/three/addons/utils/SkeletonUtils.js';
import { T, trees, lamps, buildings, tileAt, ROAD, frontOf } from '../world/map.js';
import { U, houseSwap } from './build.js';

const DIR = 'assets/models/';
const TREES = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat'].map(n => DIR + 'kenney-nature-kit/' + n + '.glb');
const PALMS = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall'].map(n => DIR + 'kenney-nature-kit/' + n + '.glb');
const HOUSES = 'abcdefghijkl'.split('').map(c => DIR + 'kenney-city-suburban/building-type-' + c + '.glb');
const LAMP = DIR + 'kenney-city-roads/light-curved.glb';
const CONE = DIR + 'kenney-city-roads/construction-cone.glb';
export const CHARACTERS = ['male-a', 'female-a', 'male-c', 'female-c', 'male-e', 'female-e'].map(n => DIR + 'kenney-mini-characters/character-' + n + '.glb');

const loader = new GLTFLoader(), cache = new Map();
// troca os materiais PBR do pacote por Lambert (igual ao resto da cidade, e mais leve)
function lambertize(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mk = m => new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, transparent: !!m.transparent, opacity: m.opacity ?? 1 });
    o.material = Array.isArray(o.material) ? o.material.map(mk) : mk(o.material);
    // um pouco de brilho no reflexo (alta e realista): roupa, telhado e tronco não ficam chapados
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.userData.pbr = { r: 0.7 }; });
    o.castShadow = true;
  });
}
export function loadGLB(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then(g => { lambertize(g.scene); return g; }).catch(e => { console.warn('Modelo não carregou:', url, e); return null; }));
  return cache.get(url);
}
const hash = (a, b) => { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); };

// ---------- modelos estáticos em lote (instancing): uma malha por peça do modelo, todas as cópias de uma vez ----------
function bake(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  const parts = [], box = new THREE.Box3();
  scene.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.computeBoundingBox(); box.union(g.boundingBox); parts.push({ g, m: o.material }); } });
  return { parts, box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
}
function instance(model, matrices, scene, shadow = true) {
  const out = [];
  if (!matrices.length) return out;
  for (const p of model.parts) {
    const im = new THREE.InstancedMesh(p.g, p.m, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im); out.push(im);
  }
  return out;
}
// matriz que põe o modelo de pé no chão, centrado, girado e na escala pedida
const _M = new THREE.Matrix4(), _C = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function place(model, x, z, rotY, scale, pivot) {
  const c = pivot || model.center;
  _C.makeTranslation(-c.x, -model.box.min.y, -c.z);
  _M.compose(_p.set(x, 0, z), _q.setFromAxisAngle(_Y, rotY), _s.set(scale, scale, scale));
  return new THREE.Matrix4().multiplyMatrices(_M, _C);
}

// carrega e monta árvores, postes, casas e cones. Devolve as malhas novas (pra esconder/mostrar juntas).
let cone = null;
export async function loadMapProps(scene) {
  const all = [];
  const [tm, pm, hm, lamp, cn] = await Promise.all([
    Promise.all(TREES.map(loadGLB)), Promise.all(PALMS.map(loadGLB)), Promise.all(HOUSES.map(loadGLB)), loadGLB(LAMP), loadGLB(CONE)]);
  const done = { trees: false, lamps: false, houses: false };
  // árvores: altura parecida com a das árvores feitas por código (2,4 a 3,4); coqueiros mais altos
  const tModels = tm.filter(Boolean).map(bake), pModels = pm.filter(Boolean).map(bake);
  if (tModels.length && pModels.length) {
    const byT = tModels.map(() => []), byP = pModels.map(() => []);
    for (const t of trees) {
      const x = t.x * U, z = t.y * U, h = hash(t.x, t.y), rot = h * Math.PI * 2;
      if (t.palm) { const k = Math.floor(h * pModels.length) % pModels.length, m = pModels[k]; byP[k].push(place(m, x, z, rot, (3.2 + h * 0.8) / m.size.y)); }
      else { const k = Math.floor(h * tModels.length) % tModels.length, m = tModels[k]; byT[k].push(place(m, x, z, rot, (2.2 * t.r / 16 + 0.6) / m.size.y)); }
    }
    tModels.forEach((m, k) => all.push(...instance(m, byT[k], scene)));
    pModels.forEach((m, k) => all.push(...instance(m, byP[k], scene)));
    done.trees = true;
  }
  // postes: braço virado pra rua mais perto, uns 3 de altura
  if (lamp) {
    const m = bake(lamp);
    // onde fica o pé do poste: média dos vértices mais baixos
    const base = new THREE.Vector3(); let n = 0;
    for (const p of m.parts) { const a = p.g.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) < m.box.min.y + m.size.y * 0.08) { base.x += a.getX(i); base.z += a.getZ(i); n++; } }
    if (n) base.multiplyScalar(1 / n);
    const armAng = Math.atan2(m.center.z - base.z, m.center.x - base.x);
    // até onde o braço chega (pra luz sair da cúpula, em cima da rua, e não do pé do poste)
    const ax = Math.cos(armAng), az = Math.sin(armAng); let reach = 0;
    for (const p of m.parts) { const a = p.g.attributes.position; for (let i = 0; i < a.count; i++) reach = Math.max(reach, (a.getX(i) - base.x) * ax + (a.getZ(i) - base.z) * az); }
    reach *= 3.0 / m.size.y;
    const mats = [];
    for (const l of lamps) {
      let dir = null;
      for (let d = 1; d <= 3 && !dir; d++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tileAt(l.x + dx * d * T, l.y + dy * d * T) === ROAD) { dir = [dx, dy]; break; }
      const ang = dir ? Math.atan2(dir[1], dir[0]) : 0;
      l.arm = { x: Math.cos(ang) * reach * 0.85, z: Math.sin(ang) * reach * 0.85 }; // luzes.js
      mats.push(place(m, l.x * U, l.y * U, -(ang - armAng), 3.0 / m.size.y, new THREE.Vector3(base.x, 0, base.z)));
    }
    all.push(...instance(m, mats, scene));
    done.lamps = true;
  }
  // casas: cabe no lote (mantendo a proporção), de frente pra rua
  const hModels = hm.filter(Boolean).map(bake);
  if (hModels.length) {
    const by = hModels.map(() => []);
    for (const b of buildings) {
      if (!houseSwap(b)) continue;
      const k = Math.floor(hash(b.x0, b.y0) * hModels.length) % hModels.length, m = hModels[k];
      const f = frontOf(b, 12), out = f ? f.out : [0, 1];
      const rot = Math.atan2(out[0], out[1]); // modelo de frente pro +Z
      const side = Math.abs(out[0]) > 0; // de lado: largura e fundo trocam
      const fw = (b.x1 - b.x0) * U, fd = (b.y1 - b.y0) * U, mw = side ? m.size.z : m.size.x, md = side ? m.size.x : m.size.z;
      const s = Math.min(fw / mw, fd / md) * 0.96;
      by[k].push(place(m, (b.x0 + b.x1) / 2 * U, (b.y0 + b.y1) / 2 * U, rot, s));
    }
    hModels.forEach((m, k) => all.push(...instance(m, by[k], scene)));
    done.houses = true;
  }
  if (cn) { const m = bake(cn); cone = { m, s: 0.45 / m.size.y }; }
  return { meshes: all, done };
}
// cone de trânsito (pra blitz): null se o modelo não chegou
export function coneMesh() {
  if (!cone) return null;
  const g = new THREE.Group();
  for (const p of cone.m.parts) { const ms = new THREE.Mesh(p.g, p.m); ms.castShadow = true; g.add(ms); }
  const inner = new THREE.Group(); inner.add(g);
  g.position.set(-cone.m.center.x, -cone.m.box.min.y, -cone.m.center.z); inner.scale.setScalar(cone.s);
  return inner;
}

// ---------- pessoas animadas ----------
const chars = [];        // modelos carregados: { gltf, height }
export const charsReady = () => chars.length > 0;
export async function loadCharacters() {
  const list = await Promise.all(CHARACTERS.map(loadGLB));
  for (const g of list) if (g && g.animations && g.animations.length) {
    const box = new THREE.Box3().setFromObject(g.scene);
    chars.push({ gltf: g, height: box.max.y - box.min.y, minY: box.min.y });
  }
  return chars.length > 0;
}
// um boneco animado: k escolhe o modelo, height = altura final em unidades 3D
export function makeCharacter(k, height) {
  const c = chars[k % chars.length], inner = cloneSkinned(c.gltf.scene);
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const s = height / c.height; inner.scale.setScalar(s); inner.position.y = -c.minY * s;
  const root = new THREE.Group(); root.add(inner);
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  for (const clip of c.gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  let cur = null;
  // troca de animação com uma transição curta; 'die' para no último quadro
  const play = (name) => {
    const a = actions[name] || actions.idle; if (!a || a === cur) return;
    a.reset(); a.setLoop(name === 'die' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = name === 'die';
    a.play(); if (cur) cur.crossFadeTo(a, 0.18, false); cur = a;
  };
  play('idle');
  return { root, mixer, play };
}
