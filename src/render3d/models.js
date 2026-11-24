// Modelos 3D dos carros (Car Kit do Kenney, licença CC0, em assets/models/kenney-car-kit).
// Carrega em segundo plano: enquanto não chega (ou se der erro), o jogo usa os carros feitos de caixas.
// Os modelos do Kenney pintam tudo com uma textura de paleta (colormap.png). Pra cada carro ter a cor
// do jogo, a faixa da paleta usada na lataria é repintada numa cópia da textura (uma por modelo + cor).
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/models/kenney-car-kit/';
// tipo do jogo -> modelo do Kenney. Tipos fora daqui (busão, moto, bugue, blindado) continuam com caixas.
export const CAR_MODELS = {
  jegue: 'hatchback-sports', brisa: 'sedan-sports', taxi: 'taxi', camin: 'truck', guincho: 'truck-flat',
  luxo: 'sedan', suv: 'suv', caminhao: 'delivery', viatura: 'police', swat: 'van', fbi: 'suv-luxury', exercito: 'suv',
};
// esses usam a pintura original do modelo (a viatura já vem com a pintura de polícia)
const KEEP_PAINT = new Set(['viatura']);

const proto = {};          // nome do modelo -> { scene, len, top, paint:{x,y,w,h} }
let palette = null;        // pixels do colormap.png
let baseMat = null;        // material com a paleta original (rodas, vidros, viatura)
let ready = false;
export const modelsReady = () => ready;

// lê os pixels de uma imagem (ImageBitmap ou <img>)
function pixelsOf(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// acha a faixa da paleta mais usada na lataria (pesando pela área de cada triângulo)
function paintCell(mesh) {
  const geo = mesh.geometry, uv = geo.attributes.uv, pos = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : pos.count, area = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const COLS = 16, ROWS = 4; // a paleta é uma grade de 16 faixas por 4 linhas
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const ar = b.sub(a).cross(c.sub(a)).length();
    const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
    const k = Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS))) + ',' + Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)));
    area.set(k, (area.get(k) || 0) + ar);
  }
  // a faixa 7,2 é o cinza do chassi/para-choque (todos os modelos usam): fica de fora.
  // Entre as outras, a lataria é a faixa colorida com mais área (se tiver área de lataria);
  // senão, a de mais área (carro branco/prata, como o guincho).
  const W = palette.width, H = palette.height;
  const sat = k => { const [cx, cy] = k.split(',').map(Number), x = Math.floor((cx + 0.5) * W / COLS), y = Math.floor((cy + 0.5) * H / ROWS), o = (y * W + x) * 4, d = palette.data;
    const mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]); return mx ? (mx - mn) / mx : 0; };
  let best = null, bv = -1, any = null, av = -1;
  for (const [k, v] of area) { if (k === '7,2') continue; if (v > av) { av = v; any = k; } if (sat(k) > 0.25 && v > bv) { bv = v; best = k; } }
  if (!best || bv < av * 0.3) best = any; // faixa colorida pequena (lanterna, giroflex) não é a lataria
  best = best || '7,2';
  const [cx, cy] = best.split(',').map(Number);
  return { x: Math.round(cx * W / COLS), y: Math.round(cy * H / ROWS), w: Math.round(W / COLS), h: Math.round(H / ROWS) };
}

export async function loadCarModels() {
  const loader = new GLTFLoader();
  const names = [...new Set(Object.values(CAR_MODELS))];
  for (const name of names) {
    try {
      const gltf = await loader.loadAsync(BASE + name + '.glb');
      const scene = gltf.scene; let body = null;
      scene.traverse(o => { if (o.isMesh) { if (o.name === 'body' || (o.parent && o.parent.name === 'body')) body = body || o; } });
      if (!body) { scene.traverse(o => { if (o.isMesh && !/wheel/.test(o.name)) body = body || o; }); }
      const map = body && body.material && body.material.map;
      if (!palette && map && map.image) {
        palette = pixelsOf(map.image);
        baseMat = new THREE.MeshLambertMaterial({ map }); baseMat.userData.pbr = { r: 0.4, m: 0.2 }; // pneus, vidros, viatura
      }
      if (!body || !palette) continue;
      const box = new THREE.Box3().setFromObject(scene);
      proto[name] = { scene, len: box.max.z - box.min.z, top: box.max.y, midZ: (box.max.z + box.min.z) / 2, paint: paintCell(body) };
    } catch (e) { console.warn('Modelo não carregou:', name, e); }
  }
  ready = Object.keys(proto).length > 0;
  return ready;
}

// cópia da paleta com a faixa da lataria repintada na cor pedida (guardada pra reaproveitar)
const paintCache = new Map();
function paintMat(name, hex) {
  const key = name + '|' + hex; if (paintCache.has(key)) return paintCache.get(key);
  const p = proto[name].paint, img = new ImageData(new Uint8ClampedArray(palette.data), palette.width, palette.height), d = img.data;
  const col = new THREE.Color(hex), tr = col.r * 255, tg = col.g * 255, tb = col.b * 255;
  // brilho médio da faixa original: mantém o degradê dela, só troca a cor
  let sum = 0, cnt = 0;
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { const o = (y * img.width + x) * 4; sum += d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114; cnt++; }
  const avg = Math.max(1, sum / cnt);
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
    const o = (y * img.width + x) * 4, l = (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114) / avg;
    d[o] = Math.min(255, tr * l); d[o + 1] = Math.min(255, tg * l); d[o + 2] = Math.min(255, tb * l);
  }
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const m = new THREE.MeshLambertMaterial({ map: tex }); m.userData.pbr = { car: true }; // lataria com verniz no modo realista
  paintCache.set(key, m); return m;
}

// monta um carro com modelo: devolve null se esse tipo não tem modelo (aí usa as caixas)
// L = comprimento do carro no jogo (em unidades 3D). O modelo é virado pra frente no +X, como os de caixa.
export function carModel(type, color, L) {
  const name = CAR_MODELS[type]; if (!ready || !name || !proto[name]) return null;
  const P = proto[name], s = L / P.len;
  const root = new THREE.Group(), inner = P.scene.clone(true);
  inner.rotation.y = Math.PI / 2; inner.scale.setScalar(s); inner.position.x = -P.midZ * s;
  root.add(inner);
  const wheels = [], paint = [];
  inner.traverse(o => {
    if (o.isMesh) {
      const isWheel = /wheel/.test(o.name) || (o.parent && /wheel/.test(o.parent.name));
      o.material = (isWheel || KEEP_PAINT.has(type)) ? baseMat : paintMat(name, color);
      if (!isWheel && !KEEP_PAINT.has(type)) paint.push(o);
      o.castShadow = true;
    }
    if (/^wheel-(front|back)-/.test(o.name)) wheels.push(o); // 'wheel-back' sozinho é o estepe pendurado atrás (SUV): não gira
  });
  return { root, wheels, paint, top: P.top * s, radius: 0.3 * s, name };
}
// troca a cor de um carro com modelo (carro repintado na Pintura Express, por exemplo)
export function repaint(info, color) { if (!info.paint.length) return; const m = paintMat(info.name, color); for (const o of info.paint) o.material = m; }
