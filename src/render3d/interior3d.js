// Interiores em 3D: a mesma planta em texto de game/interior.js vira uma sala 3D.
// Desde a 1.16 na mesma qualidade da rua: materiais com reflexo (PBR), piso e azulejo com textura, luz de lâmpada
// (fluorescente nas lojas, amarelada em casa e na lanchonete) e sombra, móveis de 1997 feitos por código
// (gôndola de mercadinho, geladeira de vidro, balcão com vitrine, mesa de bar de lata e cadeira de plástico,
// carteira escolar, computador de tubo, televisão de tubo...) e as mesmas pessoas da rua (gente97).
// A porta de saída é uma porta de verdade na parede da frente, com a calçada lá fora.
// Câmera: 3/4 atrás do jogador, seguindo macia (a mesma da rua). Na câmera de cima (tecla C) enquadra a sala inteira.
// A parede da frente fica baixinha pra dar pra ver dentro.
import * as THREE from '../../vendor/three/three.module.min.js';
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { clamp, lerp } from '../core/utils.js';
import { ITS, THEME, NPC_SHIRT, nearestPoint, interiorTitle } from '../game/interior.js';
import { drawKeycap, drawInteriorHUD } from '../render/hud.js';
import { S, player } from '../core/state.js';
import { darkness } from '../world/time.js';
import { Geo } from './build.js';
import { getRenderer, getQuality, R } from './r3d.js';
import { makePeopleSet, usePeopleSet, beginPeople, putPerson, endPeople, lookOf, PLAYER_LOOK } from './gente97.js';

const WH = 2.5;              // altura das paredes
const PS = 1.42;             // escala das pessoas (1 tile daqui = 48 px, menor que o da rua)
let scene = null, camera = null, built = null, rings = [], envTex = null, people = null, dyn = null;
const C = h => new THREE.Color(h);
const WALL = { farmacia: '#e9f1ec', mercadinho: '#f1e6cf', padaria: '#f3e2c6', lojaposto: '#ececec', lanchonete: '#f6e7b5', hospital: '#eef4f7', policia: '#d5dee9', armas: '#7a6250', escola: '#efe4c8', casa: '#ecd9bb' };
// barra de baixo da parede: azulejo (textura) ou tinta mais escura
const BARRA = { padaria: 'azulejo', lanchonete: 'azulejo', hospital: 'azulejo', farmacia: 'azulejo', lojaposto: 'azulejo', mercadinho: 'azulejo',
  escola: '#4f7f5a', policia: '#5a7090', armas: '#4a3426', casa: null };
const FLOOR = { farmacia: ['ceramica', '#f2f4f1', '#dfe8e1'], mercadinho: ['ceramica', '#efe6d2', '#d9cdb2'], padaria: ['ceramica', '#e9d6b9', '#c9a77f'],
  lojaposto: ['ceramica', '#e6e6e6', '#cfcfcf'], lanchonete: ['xadrez', '#f2efe8', '#2b2b2e'], hospital: ['granilite', '#dfe3e3'], policia: ['granilite', '#c9cdd2'],
  armas: ['cimento', '#6f6a63'], escola: ['taco', '#b8864f'], casa: ['taco', '#a8743f'] };
const WARM = new Set(['casa', 'lanchonete', 'padaria', 'armas']);
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------- texturas desenhadas (sem foto, sem letra) ----------
function canvasTex(size, draw, rep) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (rep) t.repeat.set(rep[0], rep[1]); return t;
}
function noise(g, n, a, w, h, col) { for (let i = 0; i < n; i++) { g.fillStyle = col || (Math.random() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a + ')'); g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }
// textura do piso cobre 2 x 2 tiles
function floorTex(kind) {
  const [type, c1, c2] = FLOOR[kind] || FLOOR.mercadinho;
  return canvasTex(512, (g, S) => {
    const q = S / 2;
    if (type === 'ceramica') { for (let y = 0; y < 2; y++)for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? c2 : c1; g.fillRect(x * q, y * q, q, q); }
      noise(g, 5000, 0.035, S, S); g.strokeStyle = 'rgba(90,80,70,0.55)'; g.lineWidth = 3; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * q, 0); g.lineTo(k * q, S); g.moveTo(0, k * q); g.lineTo(S, k * q); g.stroke(); } }
    else if (type === 'xadrez') { const s = S / 4; for (let y = 0; y < 4; y++)for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? c2 : c1; g.fillRect(x * s, y * s, s, s); } noise(g, 4000, 0.04, S, S);
      g.strokeStyle = 'rgba(120,120,120,0.4)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, S); g.moveTo(0, k * s); g.lineTo(S, k * s); g.stroke(); } }
    else if (type === 'granilite') { g.fillStyle = c1; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 9000; i++) { const r = Math.random(); g.fillStyle = r < 0.4 ? 'rgba(60,60,60,0.5)' : r < 0.7 ? 'rgba(255,255,255,0.6)' : r < 0.85 ? 'rgba(150,110,80,0.45)' : 'rgba(30,30,30,0.6)'; const d = 1 + Math.random() * 3.5; g.fillRect(Math.random() * S, Math.random() * S, d, d * (0.6 + Math.random() * 0.6)); }
      g.strokeStyle = 'rgba(70,70,70,0.6)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2); }
    else if (type === 'taco') { const pw = S / 8, pl = S / 2; // taco em espinha de peixe simples: blocos de 4 tacos alternando
      for (let by = 0; by < 2; by++)for (let bx = 0; bx < 2; bx++)for (let k = 0; k < 4; k++) {
        const base = C(c1).offsetHSL(0, (hash(bx * 4 + k, by) - 0.5) * 0.08, (hash(k, bx + by * 7) - 0.5) * 0.12).getStyle();
        g.fillStyle = base; const vert = (bx + by) % 2 === 0;
        const x = bx * pl + (vert ? k * pw * 2 : 0), y = by * pl + (vert ? 0 : k * pw * 2), w = vert ? pw * 2 : pl, h = vert ? pl : pw * 2;
        g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(40,20,5,0.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
        g.globalAlpha = 0.12; for (let l = 0; l < 6; l++) { g.strokeStyle = '#3a2210'; g.beginPath(); if (vert) { const xx = x + Math.random() * w; g.moveTo(xx, y); g.lineTo(xx + 3, y + h); } else { const yy = y + Math.random() * h; g.moveTo(x, yy); g.lineTo(x + w, yy + 3); } g.stroke(); } g.globalAlpha = 1; } }
    else { g.fillStyle = c1; g.fillRect(0, 0, S, S); noise(g, 14000, 0.06, S, S); g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2); }
  });
}
// azulejo branco 15 x 15 (4 por tile), com uma faixa colorida em cima
let azulejo = null;
function azulejoTex() {
  return azulejo || (azulejo = canvasTex(256, (g, S) => { const s = S / 4;
    for (let y = 0; y < 4; y++)for (let x = 0; x < 4; x++) { g.fillStyle = C('#f4f4ef').offsetHSL(0, 0, (hash(x, y) - 0.5) * 0.03).getStyle(); g.fillRect(x * s, y * s, s, s); }
    g.strokeStyle = 'rgba(150,150,140,0.8)'; g.lineWidth = 2; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, S); g.moveTo(0, k * s); g.lineTo(S, k * s); g.stroke(); } }));
}
// ambiente pra reflexo: uma sala clara com painéis de luz no teto (gerado uma vez)
function envMap(renderer) {
  if (envTex) return envTex;
  const es = new THREE.Scene(), room = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10), new THREE.MeshBasicMaterial({ color: '#8a8680', side: THREE.BackSide }));
  room.position.y = 2; es.add(room);
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#5a554e' })); flo.rotation.x = -Math.PI / 2; flo.position.y = 0.01; es.add(flo);
  for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5], [0, 0]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.6) })); p.rotation.x = Math.PI / 2; p.position.set(x, 3.95, z); es.add(p); }
  const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(es, 0.03).texture; pm.dispose();
  return envTex;
}

// ---------- produtos (instanciados: centenas de caixinhas, latas e garrafas em poucas chamadas) ----------
const PG = {
  box: (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })(),
  can: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); g.translate(0, 0.5, 0); return g; })(),
  bottle: (() => { const a = new THREE.CylinderGeometry(0.5, 0.5, 0.62, 8); a.translate(0, 0.31, 0); const b = new THREE.CylinderGeometry(0.18, 0.5, 0.28, 8); b.translate(0, 0.76, 0);
    const c = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 8); c.translate(0, 0.96, 0); return mergeG([a, b, c]); })(),
  bun: (() => { const g = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.9, 0.75); return g; })(),
};
function mergeG(list) { const pos = [], nor = []; for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; const P = g.attributes.position, N = g.attributes.normal; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); } }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return o; }

// ---------- montagem da sala ----------
function build(it) {
  const renderer = getRenderer();
  if (scene) scene.traverse(o => { if (o.geometry && !Object.values(PG).includes(o.geometry) && !o.isInstancedMesh) o.geometry.dispose(); if (o.material && !Array.isArray(o.material)) { if (o.material.map && o.material.map !== azulejo) o.material.map.dispose(); o.material.dispose(); } });
  scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0b0f');
  scene.environment = envMap(renderer); scene.environmentIntensity = 0.35;
  const kind = it.kind, th = THEME[kind] || THEME.mercadinho, wallCol = WALL[kind] || '#e8e2d6', warm = WARM.has(kind);
  const W = it.W, H = it.H, P = it.plan;
  // geometrias por material: G fosco, Gg brilhante (fórmica, louça, pintura de geladeira), Gm metal, Gw vidro, Ge acesa (luz, tela)
  const G = new Geo(), Gg = new Geo(), Gm = new Geo(), Gw = new Geo(), Ge = new Geo(), Gt = new Geo(), Gwin = new Geo();
  const box = (x0, y0, z0, x1, y1, z1, col, top, geo = G) => geo.box(x0, z0, x1, z1, y0, y1, top === undefined ? col : top, col, false);
  const ob = (geo, cx, cz, a, hw, hd, y0, y1, col) => geo.obox(cx, cz, a, hw, hd, y0, y1, col, col);
  const prods = { box: [], can: [], bottle: [], bun: [] };
  const prod = (t, x, y, z, sx, sy, sz, col, ry = 0) => prods[t].push([x, y, z, sx, sy, sz, col, ry]);
  const isWall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || P[y][x] === '#';
  const at = (x, y) => isWall(x, y) ? '#' : P[y][x];
  const extra = [];
  const pc = k => th.prod.length ? th.prod[Math.floor(hash(k * 1.7, k * 0.3 + 5) * th.prod.length)] : '#999';

  // ---- piso (textura) ----
  { const fg = new THREE.PlaneGeometry(W, H); fg.rotateX(-Math.PI / 2); const ft = floorTex(kind); ft.repeat.set(W / 2, H / 2);
    const type = (FLOOR[kind] || FLOOR.mercadinho)[0];
    const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: type === 'taco' ? 0.5 : type === 'cimento' ? 0.85 : 0.28, metalness: 0, envMapIntensity: 0.9 });
    const f = new THREE.Mesh(fg, fm); f.position.set(W / 2, 0, H / 2); f.receiveShadow = true; scene.add(f); }

  // ---- paredes ----
  const exits = it.exit.map(e => Math.floor(e.x / ITS)), ex0 = Math.min(...exits), ex1 = Math.max(...exits) + 1, eRow = Math.floor(it.exit[0].y / ITS);
  const barra = BARRA[kind];
  const wallH = (x, y) => { const border = x === 0 || y === 0 || x === W - 1 || y === H - 1; return y === H - 1 ? 0.22 : border ? WH : 1.25; };
  for (let y = 0; y < H; y++)for (let x = 0; x < W; x++) {
    if (P[y][x] !== '#') continue;
    if (y === H - 1 && x >= ex0 && x < ex1) continue; // vão da porta
    const h = wallH(x, y);
    box(x, 0, y, x + 1, h, y + 1, wallCol, C(wallCol).multiplyScalar(0.8).getStyle());
    // faces de dentro: rodapé e barra (azulejo ou tinta)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWall(x + dx, y + dy) || h < 1) continue;
      const fx = dx > 0 ? x + 1 : dx < 0 ? x : null, fz = dy > 0 ? y + 1 : dy < 0 ? y : null, e = 0.012;
      const pl = (y0, y1, col, geo, d = e) => { if (fx !== null) box(fx + (dx > 0 ? 0 : -d), y0, y, fx + (dx > 0 ? d : 0), y1, y + 1, col, undefined, geo); else box(x, y0, fz + (dy > 0 ? 0 : -d), x + 1, y1, fz + (dy > 0 ? d : 0), col, undefined, geo); };
      pl(0, 0.12, '#5d4a3a', Gg, 0.025);
      if (barra === 'azulejo') { // azulejo: quad com textura (u ao longo da parede, v na altura)
        const y0 = 0.12, y1 = 1.05; const q = fx !== null ? [[fx + dx * 0.014, y0, y], [fx + dx * 0.014, y0, y + 1], [fx + dx * 0.014, y1, y + 1], [fx + dx * 0.014, y1, y]] : [[x, y0, fz + dy * 0.014], [x + 1, y0, fz + dy * 0.014], [x + 1, y1, fz + dy * 0.014], [x, y1, fz + dy * 0.014]];
        Gt.face(q[0], q[1], q[2], q[3], dx, 0, dy, C('#ffffff')); Gt.uv = Gt.uv || [];
        for (let i = Gt.p.length - 18; i < Gt.p.length; i += 3) Gt.uv.push(fx !== null ? Gt.p[i + 2] : Gt.p[i], Gt.p[i + 1] - y0); // u ao longo da parede, v na altura
        pl(1.05, 1.11, kind === 'hospital' ? '#4f9fd0' : kind === 'farmacia' ? '#2e9e4a' : kind === 'lanchonete' ? '#c0392b' : '#3f6fb0', Gg, 0.02);
      } else if (barra) { pl(0.12, 1.1, barra, G, 0.008); pl(1.1, 1.14, C(barra).multiplyScalar(0.7).getStyle(), G, 0.012); }
    }
  }
  // janelas basculantes nas paredes do lado (a luz de fora muda com a hora: vidro "aceso")
  for (const x of [0, W - 1]) for (let y = 2; y < H - 2; y += 4) {
    if (!isWall(x, y) || isWall(x === 0 ? 1 : W - 2, y)) continue;
    const ix = x === 0 ? 1 : W - 1, d = x === 0 ? 1 : -1;
    box(ix - (d > 0 ? 0 : 0.03), 1.15, y + 0.1, ix + (d > 0 ? 0.03 : 0), 2.05, y + 0.9, '#d9d6cc', undefined, Gg);
    box(ix + (d > 0 ? 0.031 : -0.032), 1.2, y + 0.15, ix + (d > 0 ? 0.032 : -0.031), 2.0, y + 0.85, '#ffffff', undefined, Gwin);
    for (const yy of [1.45, 1.72]) box(ix - 0.01, yy, y + 0.15, ix + 0.01 + (d > 0 ? 0.03 : 0) - (d < 0 ? 0.03 : 0), yy + 0.025, y + 0.85, '#bdb9ae', undefined, Gm);
  }
  // luminárias de parede (tubo fluorescente ou arandela) no fundo e nos lados
  const lampPos = [];
  for (let x = 3; x < W - 2; x += 5) if (isWall(x, 0) && !isWall(x, 1) && !'KRF'.includes(at(x, 1))) { box(x - 0.45, 2.12, 1, x + 0.45, 2.2, 1.09, '#cfcfcf', undefined, Gm); box(x - 0.42, 2.13, 1.09, x + 0.42, 2.19, 1.13, warm ? '#ffe3b0' : '#f4f8ff', undefined, Ge); }
  for (let y = 3; y < H - 2; y += 4) for (const x of [1, W - 1]) { if (!isWall(x === 1 ? 0 : W - 1, y)) continue; const d = x === 1 ? 1 : -1, xx = x === 1 ? 1 : W - 1;
    box(Math.min(xx, xx + d * 0.09), 2.12, y + 0.05, Math.max(xx, xx + d * 0.09), 2.2, y + 0.95, '#cfcfcf', undefined, Gm); box(Math.min(xx + d * 0.09, xx + d * 0.13), 2.13, y + 0.08, Math.max(xx + d * 0.09, xx + d * 0.13), 2.19, y + 0.92, warm ? '#ffe3b0' : '#f4f8ff', undefined, Ge); }
  // relógio de parede e quadros (sem letra) no fundo
  { const cx = Math.floor(W / 2) + 0.5; if (isWall(Math.floor(cx), 0) && !isWall(Math.floor(cx), 1) && at(Math.floor(cx), 1) !== 'K') {
      const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), new THREE.MeshStandardMaterial({ color: '#f5f5f0', roughness: 0.4 })); cl.rotation.x = Math.PI / 2; cl.position.set(cx, 1.85, 1.03); extra.push(cl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.4 })); rim.position.set(cx, 1.85, 1.04); extra.push(rim);
      box(cx - 0.007, 1.85, 1.055, cx + 0.007, 1.99, 1.062, '#111'); box(cx, 1.845, 1.055, cx + 0.1, 1.858, 1.062, '#111'); } }
  for (let x = 2; x < W - 2; x += 7) { if (!isWall(x, 0) || isWall(x, 1) || 'KRFS'.includes(at(x, 1)) || 'KRFS'.includes(at(x + 1, 1))) continue;
    const c1 = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad'][Math.floor(hash(x, 3) * 5)];
    box(x + 0.2, 1.3, 1, x + 0.9, 1.85, 1.03, '#3a2a1e'); box(x + 0.25, 1.35, 1.03, x + 0.85, 1.8, 1.04, c1); box(x + 0.32, 1.42, 1.041, x + 0.78, 1.6, 1.045, '#f4efe6'); }

  // ---- porta de saída de verdade, com a calçada lá fora ----
  // (a parede da frente é cortada baixinha; a porta também, senão tampa a sala: fica o batente, a soleira e a calçada lá fora)
  { const z = H - 1, fr = kind === 'casa' ? '#f4efe6' : '#3a3d42', ph = 0.42;
    box(ex0 - 0.14, 0, z, ex0, ph, z + 0.3, fr, undefined, Gm); box(ex1, 0, z, ex1 + 0.14, ph, z + 0.3, fr, undefined, Gm);
    box(ex0, 0, z, ex1, 0.03, z + 0.3, '#bdb6a8', undefined, Gg); // soleira de pedra
    // meio-fio e a rua lá fora
    box(ex0 - 3, 0, H + 2.2, ex1 + 3, 0.08, H + 2.35, '#9a958c');
    // capacho e a calçada (cor muda com a hora em dyn.out)
    box(ex0 + 0.1, 0, eRow + 0.05, ex1 - 0.1, 0.02, z - 0.02, '#3b3b3e');
    const og = new THREE.PlaneGeometry(ex1 - ex0 + 6, 2.2); og.rotateX(-Math.PI / 2);
    const outMat = new THREE.MeshBasicMaterial({ color: '#cfcac0' }); const out = new THREE.Mesh(og, outMat); out.position.set((ex0 + ex1) / 2, -0.01, H + 1.1); scene.add(out);
    dyn = { outMat, winMat: null, sun: null };
  }

  // ---- móveis ----
  const nb = (x, y, ch) => at(x, y) === ch;
  for (let y = 0; y < H; y++)for (let x = 0; x < W; x++) {
    const ch = P[y][x], x0 = x, x1 = x + 1, z0 = y, z1 = y + 1, cx = x + 0.5, cz = y + 0.5;
    switch (ch) {
      case 'S': { // gôndola / estante
        if (kind === 'escola') { box(x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 1.9, z0 + 0.4, '#7a5230');
          for (let lv = 0; lv < 4; lv++) { const yy = 0.15 + lv * 0.45; box(x0 + 0.08, yy, z0 + 0.08, x1 - 0.08, yy + 0.03, z0 + 0.4, '#5d3d22');
            let u = x0 + 0.1; while (u < x1 - 0.16) { const w = 0.05 + hash(u * 9, yy) * 0.06, h = 0.26 + hash(u, yy * 3) * 0.12; prod('box', u + w / 2, yy + 0.03, z0 + 0.25, w, h, 0.24, ['#8e2b2b', '#2b4f8e', '#2f6b3a', '#c9a23b', '#5a3b6b'][Math.floor(hash(u * 3, yy) * 5)]); u += w + 0.008; } } break; }
        if (kind === 'armas') { box(x0 + 0.05, 0, z0 + 0.1, x1 - 0.05, 1.6, z1 - 0.1, '#3a3d42', undefined, Gm);
          for (let lv = 0; lv < 3; lv++) for (let k = 0; k < 3; k++) prod('box', x0 + 0.2 + k * 0.3, 0.2 + lv * 0.5, cz, 0.22, 0.16, 0.5, ['#4b5320', '#6b5a3a', '#3a3a3a'][(k + lv) % 3]); break; }
        const frame = kind === 'farmacia' ? '#f2f2f2' : kind === 'padaria' ? '#8d5a2b' : '#c9cdd2', geoF = kind === 'padaria' ? G : Gm;
        const left = !nb(x - 1, y, 'S'), right = !nb(x + 1, y, 'S');
        box(x0 + (left ? 0.06 : 0), 0, cz - 0.05, x1 - (right ? 0.06 : 0), 1.5, cz + 0.05, frame, undefined, geoF);      // costas da gôndola
        if (left) box(x0 + 0.04, 0, z0 + 0.12, x0 + 0.08, 1.52, z1 - 0.12, frame, undefined, geoF);
        if (right) box(x1 - 0.08, 0, z0 + 0.12, x1 - 0.04, 1.52, z1 - 0.12, frame, undefined, geoF);
        for (let lv = 0; lv < 4; lv++) { const yy = 0.1 + lv * 0.36;
          box(x0, yy, z0 + 0.12, x1, yy + 0.03, z1 - 0.12, frame, undefined, geoF);
          for (const sd of [-1, 1]) { box(x0, yy + 0.03, sd < 0 ? z0 + 0.1 : z1 - 0.12, x1, yy + 0.07, sd < 0 ? z0 + 0.12 : z1 - 0.1, lv % 2 ? '#ffd21f' : '#e53935', undefined, Gg); // etiqueta de preço (faixa)
            if (lv === 3) continue;
            const zz = sd < 0 ? z0 + 0.3 : z1 - 0.3;
            if (kind === 'padaria') { for (let k = 0; k < 4; k++) prod('bun', x0 + 0.14 + k * 0.24, yy + 0.03, zz, 0.2, 0.15, 0.18, ['#d9a05b', '#c98a4b', '#e8c07a'][(k + lv) % 3], hash(k, lv) * 3); continue; }
            const t = (kind === 'mercadinho' && lv === 0) || (kind === 'lojaposto' && lv === 1) ? 'bottle' : (lv === 1 && kind === 'mercadinho') ? 'can' : 'box';
            const n = t === 'box' ? (kind === 'farmacia' ? 7 : 5) : t === 'can' ? 7 : 6, w = 0.96 / n;
            for (let k = 0; k < n; k++) { const col = pc(x * 31 + y * 7 + lv * 3 + k + (sd > 0 ? 50 : 0)), px = x0 + 0.02 + w * (k + 0.5);
              if (t === 'box') { const h = kind === 'farmacia' ? 0.14 + hash(k, lv) * 0.08 : 0.2 + hash(px, lv) * 0.1; prod('box', px, yy + 0.03, zz, w * 0.82, h, 0.24, col); prod('box', px, yy + 0.03, zz + sd * 0.0 - sd * 0.12, w * 0.82, h, 0.12, col); }
              else if (t === 'can') prod('can', px, yy + 0.03, zz, w * 0.75, 0.16, w * 0.75, col);
              else prod('bottle', px, yy + 0.03, zz, w * 0.7, 0.3, w * 0.7, col); } } }
        break; }
      case 'F': { // geladeira
        if (kind === 'casa') { // geladeira de casa: branca, duas portas, puxador
          box(x0 + 0.06, 0, z0 + 0.05, x1 - 0.06, 1.85, z1 - 0.2, '#f1f1ec', undefined, Gg); box(x0 + 0.07, 1.25, z1 - 0.2, x1 - 0.07, 1.26, z1 - 0.19, '#cfcfca', undefined, Gg);
          box(x1 - 0.2, 0.75, z1 - 0.19, x1 - 0.16, 1.15, z1 - 0.15, '#9a9a96', undefined, Gm); box(x1 - 0.2, 1.35, z1 - 0.19, x1 - 0.16, 1.6, z1 - 0.15, '#9a9a96', undefined, Gm);
          if (!nb(x - 1, y, 'F')) { const f2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.32, 12), new THREE.MeshStandardMaterial({ color: '#b5653e', roughness: 0.8 })); f2.position.set(x0 - 0.3, 0.16, z0 + 0.35); extra.push(f2); } // filtro de barro do lado
          break; }
        // geladeira de vidro (refrigerante), acesa por dentro
        const L = !nb(x - 1, y, 'F'), Rr = !nb(x + 1, y, 'F');
        box(x0 + (L ? 0.04 : 0), 0, z0 + 0.04, x1 - (Rr ? 0.04 : 0), 2.0, z1 - 0.25, '#e9ecef', undefined, Gg);
        box(x0 + (L ? 0.04 : 0), 1.85, z1 - 0.26, x1 - (Rr ? 0.04 : 0), 2.0, z1 - 0.2, kind === 'lojaposto' ? '#c9342a' : '#d32f2f', undefined, Gg); // faixa de cima (sem marca)
        box(x0 + 0.1, 0.2, z0 + 0.12, x1 - 0.1, 1.8, z0 + 0.14, '#e8f6ff', undefined, Ge);           // luz do fundo
        for (let lv = 0; lv < 4; lv++) { const yy = 0.25 + lv * 0.4; box(x0 + 0.08, yy, z0 + 0.12, x1 - 0.08, yy + 0.02, z1 - 0.3, '#bcc6cc', undefined, Gm);
          for (let k = 0; k < 4; k++) prod('bottle', x0 + 0.2 + k * 0.2, yy + 0.02, z0 + 0.45, 0.11, 0.3, 0.11, ['#c62828', '#1e7b34', '#f9a825', '#3a1d0e', '#1565c0'][(k + lv + x) % 5]); }
        box(x0 + 0.06, 0.08, z1 - 0.27, x1 - 0.06, 1.83, z1 - 0.25, '#a9cfe4', undefined, Gw);
        box(x0 + 0.02, 0.05, z1 - 0.26, x0 + 0.06, 1.85, z1 - 0.22, '#9aa3aa', undefined, Gm); box(x1 - 0.12, 0.7, z1 - 0.25, x1 - 0.09, 1.2, z1 - 0.2, '#9aa3aa', undefined, Gm);
        break; }
      case 'C': { // balcão
        const L = !nb(x - 1, y, 'C'), Rr = !nb(x + 1, y, 'C'), U = !nb(x, y - 1, 'C'), D = !nb(x, y + 1, 'C');
        const body = kind === 'hospital' ? '#e6eef2' : kind === 'policia' ? '#7a8798' : kind === 'casa' ? '#f1f1ec' : kind === 'lanchonete' ? '#c0392b' : kind === 'padaria' ? '#8d5a2b' : '#8d6e63';
        const top = kind === 'casa' ? '#d9d6cf' : kind === 'lanchonete' ? '#d9d9d6' : '#2f2b29';
        box(x0 + (L ? 0.04 : 0), 0.06, z0 + (U ? 0.04 : 0), x1 - (Rr ? 0.04 : 0), 0.92, z1 - (D ? 0.04 : 0), body, undefined, kind === 'lanchonete' ? Gg : G);
        box(x0 + (L ? 0.04 : 0), 0, z0 + (U ? 0.04 : 0), x1 - (Rr ? 0.04 : 0), 0.06, z1 - (D ? 0.04 : 0), '#2a2522');                       // rodapé
        box(x0 - (L ? 0 : 0.001), 0.92, z0 - 0.02 * +U, x1, 0.97, z1 + 0.02 * +D, top, undefined, Gg);                                         // tampo de granito/fórmica
        if (kind === 'lanchonete' && D) box(x0, 0.6, z1 - 0.04, x1, 0.65, z1 + 0.06, '#b0b5ba', undefined, Gm); // apoio de pé
        if (kind === 'padaria' && D) { box(x0 + 0.04, 0.97, z0 + 0.15, x1 - 0.04, 1.33, z1 - 0.1, '#bfe0ee', undefined, Gw); // vitrine de salgados
          for (let k = 0; k < 3; k++) prod('bun', x0 + 0.2 + k * 0.3, 0.98, cz, 0.18, 0.12, 0.16, ['#e0a35a', '#f3d9a4', '#c98a4b'][k], k); }
        if (kind === 'casa' && x % 3 === 1) { box(x0 + 0.2, 0.9, z0 + 0.2, x1 - 0.2, 0.97, z1 - 0.3, '#c0c4c8', undefined, Gm); } // pia
        break; }
      case 'T': { // mesa
        if (kind === 'lanchonete') { // mesa de bar de lata, amarela
          box(cx - 0.36, 0.7, cz - 0.36, cx + 0.36, 0.74, cz + 0.36, '#f2c230', undefined, Gg);
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cx + lx * 0.3 - 0.02, 0, cz + lz * 0.3 - 0.02, cx + lx * 0.3 + 0.02, 0.7, cz + lz * 0.3 + 0.02, '#d9a91f', undefined, Gm);
          prod('bottle', cx + 0.1, 0.74, cz - 0.05, 0.09, 0.32, 0.09, '#5a3a1a'); prod('can', cx - 0.15, 0.74, cz + 0.1, 0.07, 0.11, 0.07, '#f4f4f0'); break; }
        // mesa de madeira (as vizinhas viram uma mesa só)
        const L = !nb(x - 1, y, 'T'), Rr = !nb(x + 1, y, 'T');
        box(x0 + (L ? 0.05 : 0), 0.72, z0 + 0.1, x1 - (Rr ? 0.05 : 0), 0.78, z1 - 0.1, '#8a5a32', undefined, Gg);
        if (L) for (const lz of [z0 + 0.15, z1 - 0.2]) box(x0 + 0.1, 0, lz, x0 + 0.15, 0.72, lz + 0.05, '#5e3a1e');
        if (Rr) for (const lz of [z0 + 0.15, z1 - 0.2]) box(x1 - 0.15, 0, lz, x1 - 0.1, 0.72, lz + 0.05, '#5e3a1e');
        if (kind === 'casa' && !L && !Rr) { box(cx - 0.3, 0.78, cz - 0.3, cx + 0.3, 0.79, cz + 0.3, '#f4efe6'); const fr = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.4 })); fr.position.set(cx, 0.79, cz); extra.push(fr); } // fruteira
        break; }
      case 'c': { // cadeira
        if (kind === 'lanchonete') { const col = hash(x, y) < 0.5 ? '#f4f4f0' : '#d32f2f'; // cadeira de plástico
          box(cx - 0.2, 0.42, cz - 0.2, cx + 0.2, 0.46, cz + 0.2, col, undefined, Gg); const by = at(x, y - 1) === 'T' ? 1 : -1;
          box(cx - 0.2, 0.46, cz + by * 0.17, cx + 0.2, 0.85, cz + by * 0.2, col, undefined, Gg);
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cx + lx * 0.17 - 0.025, 0, cz + lz * 0.17 - 0.025, cx + lx * 0.17 + 0.025, 0.42, cz + lz * 0.17 + 0.025, col, undefined, Gg); break; }
        if (kind === 'hospital') { // longarina azul de espera
          box(x0, 0.4, cz - 0.2, x1, 0.45, cz + 0.2, '#2f6fb0', undefined, Gg); box(x0 + 0.03, 0.45, cz + 0.17, x1 - 0.03, 0.85, cz + 0.22, '#2f6fb0', undefined, Gg);
          box(x0, 0.32, cz - 0.03, x1, 0.37, cz + 0.03, '#8a9096', undefined, Gm); if (!nb(x - 1, y, 'c')) box(x0 + 0.1, 0, cz - 0.03, x0 + 0.15, 0.37, cz + 0.03, '#8a9096', undefined, Gm); if (!nb(x + 1, y, 'c')) box(x1 - 0.15, 0, cz - 0.03, x1 - 0.1, 0.37, cz + 0.03, '#8a9096', undefined, Gm); break; }
        if (kind === 'policia' && x > W - 6) { box(x0, 0.4, cz - 0.2, x1, 0.45, cz + 0.2, '#3d4450', undefined, Gg); box(x0, 0.32, cz - 0.03, x1, 0.37, cz + 0.03, '#8a9096', undefined, Gm); if (!nb(x + 1, y, 'c')) box(x1 - 0.15, 0, cz - 0.03, x1 - 0.1, 0.37, cz + 0.03, '#8a9096', undefined, Gm); break; }
        // cadeira de madeira com pé de ferro (escola) / de escritório
        const back = kind === 'escola' ? 1 : at(x, y - 1) === 'D' || at(x, y - 1) === 'T' ? 1 : -1, wood = kind === 'policia' ? '#2b2f36' : '#a0703f';
        box(cx - 0.2, 0.42, cz - 0.2, cx + 0.2, 0.46, cz + 0.2, wood, undefined, kind === 'policia' ? G : Gg);
        box(cx - 0.19, 0.6, cz + back * 0.18, cx + 0.19, 0.82, cz + back * 0.21, wood, undefined, kind === 'policia' ? G : Gg);
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cx + lx * 0.17 - 0.015, 0, cz + lz * 0.17 - 0.015, cx + lx * 0.17 + 0.015, 0.42, cz + lz * 0.17 + 0.015, '#3b3e44', undefined, Gm);
        box(cx - 0.16, 0.42, cz + back * 0.18 - 0.015, cx - 0.13, 0.62, cz + back * 0.18 + 0.015, '#3b3e44', undefined, Gm); box(cx + 0.13, 0.42, cz + back * 0.18 - 0.015, cx + 0.16, 0.62, cz + back * 0.18 + 0.015, '#3b3e44', undefined, Gm);
        break; }
      case 'B': { // cama
        const L = nb(x - 1, y, 'B'), Rr = nb(x + 1, y, 'B'), U = nb(x, y - 1, 'B'), D = nb(x, y + 1, 'B');
        const a0 = L ? x0 : x0 + 0.06, a1 = Rr ? x1 : x1 - 0.06, b0 = U ? z0 : z0 + 0.06, b1 = D ? z1 : z1 - 0.06;
        if (kind === 'hospital') { box(a0, 0.4, b0, a1, 0.55, b1, '#e3f2fd', undefined, G); box(a0, 0.3, b0, a1, 0.4, b1, '#cfd8dc', undefined, Gm);
          for (const [lx, lz] of [[a0 + 0.05, b0 + 0.05], [a1 - 0.08, b0 + 0.05], [a0 + 0.05, b1 - 0.08], [a1 - 0.08, b1 - 0.08]]) box(lx, 0, lz, lx + 0.03, 0.3, lz + 0.03, '#9aa3aa', undefined, Gm);
          if (!U) { box(a0, 0.3, b0 - 0.02, a1, 0.95, b0 + 0.03, '#eceff1', undefined, Gm); box(a0 + 0.12, 0.55, b0 + 0.08, a1 - 0.12, 0.66, b0 + 0.32, '#ffffff'); }
          box(a0, 0.55, b0 + 0.38, a1, 0.6, b1, '#90caf9');
          if (!U) { box(a1 + 0.05, 0, b0 + 0.1, a1 + 0.08, 1.8, b0 + 0.13, '#9aa3aa', undefined, Gm); box(a1 + 0.02, 1.55, b0 + 0.08, a1 + 0.14, 1.75, b0 + 0.15, '#e8f4fb', undefined, Gw); } // soro
          break; }
        box(a0, 0.12, b0, a1, 0.42, b1, '#ffffff'); box(a0, 0, b0, a1, 0.12, b1, '#6d4c41');
        if (!U) { box(a0, 0, b0 - 0.04, a1, 1.05, b0 + 0.04, '#5d3d22', undefined, Gg); box(a0 + 0.1, 0.42, b0 + 0.1, a1 - 0.1, 0.56, b0 + 0.36, '#f4f4f0'); }
        box(a0 - 0.01, 0.42, b0 + (U ? 0 : 0.42), a1 + 0.01, 0.5, b1 + 0.01, '#c2185b'); // colcha
        if (!U && !L) { box(x0 - 0.55, 0, b0, x0 - 0.1, 0.5, b0 + 0.45, '#7a5230', undefined, Gg); box(x0 - 0.42, 0.5, b0 + 0.12, x0 - 0.24, 0.72, b0 + 0.3, '#f3e2b5', undefined, Ge); } // criado-mudo e abajur
        break; }
      case 'D': { // mesa de trabalho / carteira escolar
        if (kind === 'escola') { box(x0 + 0.1, 0.66, z0 + 0.12, x1 - 0.1, 0.7, z1 - 0.12, '#b98a55', undefined, Gg);
          for (const [lx, lz] of [[x0 + 0.13, z0 + 0.15], [x1 - 0.16, z0 + 0.15], [x0 + 0.13, z1 - 0.18], [x1 - 0.16, z1 - 0.18]]) box(lx, 0, lz, lx + 0.03, 0.66, lz + 0.03, '#3b3e44', undefined, Gm);
          box(x0 + 0.13, 0.5, z0 + 0.15, x1 - 0.13, 0.53, z1 - 0.15, '#3b3e44', undefined, Gm);
          box(cx - 0.18, 0.7, cz - 0.1, cx + 0.06, 0.72, cz + 0.12, '#f4f4f0'); box(cx + 0.1, 0.7, cz - 0.08, cx + 0.12, 0.71, cz + 0.08, '#2b4f8e'); break; }
        box(x0 + 0.04, 0.72, z0 + 0.06, x1 - 0.04, 0.77, z1 - 0.08, '#6d4c41', undefined, Gg);
        if (!nb(x - 1, y, 'D') || true) { box(x0 + 0.06, 0, z0 + 0.1, x0 + 0.12, 0.72, z1 - 0.12, '#4e342e'); box(x1 - 0.12, 0, z0 + 0.1, x1 - 0.06, 0.72, z1 - 0.12, '#4e342e'); }
        const first = !nb(x, y - 1, 'D'); // computador de tubo bege em cima da primeira
        if (first) { box(cx - 0.24, 0.77, z0 + 0.1, cx + 0.24, 1.2, z0 + 0.5, '#d8d2bf', undefined, Gg); box(cx - 0.16, 0.8, z0 + 0.0, cx + 0.16, 1.12, z0 + 0.1, '#cfc9b6', undefined, Gg);
          box(cx - 0.19, 0.82, z0 + 0.501, cx + 0.19, 1.15, z0 + 0.51, '#2a3a44', undefined, Ge); box(cx - 0.22, 0.77, z0 + 0.58, cx + 0.22, 0.8, z0 + 0.74, '#d8d2bf', undefined, Gg); }
        else { box(cx - 0.25, 0.77, cz - 0.15, cx + 0.05, 0.8, cz + 0.15, '#f4f4f0'); box(cx + 0.1, 0.77, cz - 0.1, cx + 0.3, 0.83, cz + 0.05, '#3b3e44', undefined, Gm); } // papéis e máquina
        break; }
      case 'K': box(x0, 0.82, z0 + 0.02, x1, 1.92, z0 + 0.06, '#8a6a45', undefined, Gg); box(x0 + (nb(x - 1, y, 'K') ? 0 : 0.06), 0.88, z0 + 0.06, x1 - (nb(x + 1, y, 'K') ? 0 : 0.06), 1.86, z0 + 0.065, '#24402c');
        box(x0, 0.8, z0 + 0.06, x1, 0.83, z0 + 0.14, '#8a6a45', undefined, Gg);
        if (hash(x, y) < 0.7) { box(x0 + 0.1 + hash(x, 1) * 0.3, 1.5, z0 + 0.066, x0 + 0.5 + hash(x, 2) * 0.3, 1.52, z0 + 0.068, '#e8e8e0'); box(x0 + 0.1, 1.25, z0 + 0.066, x0 + 0.3 + hash(x, 3) * 0.5, 1.27, z0 + 0.068, '#e8e8e0'); }
        break;
      case 'P': { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.36, 12), new THREE.MeshStandardMaterial({ color: '#b5653e', roughness: 0.8 })); pot.position.set(cx, 0.18, cz); extra.push(pot);
        const lm = new THREE.MeshStandardMaterial({ color: '#2f7d3a', roughness: 0.6 });
        for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + hash(x, y), l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75 + hash(k, x) * 0.35, 0.02), lm); // espada-de-são-jorge
          l.position.set(cx + Math.cos(a) * 0.07, 0.36 + 0.4, cz + Math.sin(a) * 0.07); l.rotation.set(Math.sin(a) * 0.25, -a, Math.cos(a) * 0.25); extra.push(l); }
        break; }
      case 'V': { const L = !nb(x - 1, y, 'V'), Rr = !nb(x + 1, y, 'V'), col = '#7b2d3a';
        box(x0, 0.1, z0 + 0.15, x1, 0.4, z1 - 0.08, col); box(x0 + 0.03, 0.4, z0 + 0.3, x1 - 0.03, 0.5, z1 - 0.1, C(col).multiplyScalar(1.15).getStyle());
        box(x0, 0.4, z0 + 0.12, x1, 0.95, z0 + 0.32, col);
        if (L) box(x0 - 0.02, 0.1, z0 + 0.12, x0 + 0.14, 0.65, z1 - 0.08, C(col).multiplyScalar(0.9).getStyle()); if (Rr) box(x1 - 0.14, 0.1, z0 + 0.12, x1 + 0.02, 0.65, z1 - 0.08, C(col).multiplyScalar(0.9).getStyle());
        for (const lx of [x0 + 0.08, x1 - 0.12]) box(lx, 0, z0 + 0.2, lx + 0.04, 0.1, z0 + 0.24, '#2a1d14');
        break; }
      case 'X': { // estante com televisão de tubo (de frente pra cima: pro sofá)
        box(x0 - 0.4, 0, cz - 0.05, x1 + 0.4, 0.55, z1 - 0.05, '#6b4a2c', undefined, Gg);
        box(cx - 0.35, 0.55, cz - 0.05, cx + 0.35, 1.08, cz + 0.4, '#2a2a2c', undefined, Gg); box(cx - 0.25, 0.6, cz + 0.4, cx + 0.25, 1.0, cz + 0.48, '#1e1f22', undefined, Gg);
        box(cx - 0.29, 0.6, cz - 0.051, cx + 0.29, 1.02, cz - 0.05, '#7fb2d9', undefined, Ge); // tela ligada (virada pro norte)
        box(cx - 0.02, 1.08, cz + 0.1, cx + 0.02, 1.35, cz + 0.13, '#888', undefined, Gm); // antena
        break; }
      case 'R': box(x0, 0.7, z0 + 0.02, x1, 1.85, z0 + 0.08, '#4e342e', undefined, Gg);
        for (let k = 0; k < 3; k++) { const yy = 0.9 + k * 0.32; box(x0 + 0.08, yy, z0 + 0.09, x1 - 0.12 - (k % 2) * 0.2, yy + 0.07, z0 + 0.15, '#1d1d1f', undefined, Gm); box(x0 + 0.1, yy - 0.08, z0 + 0.09, x0 + 0.2, yy, z0 + 0.15, '#5d4037'); }
        break;
      case 'G': { for (const [r, c, d] of [[0.42, '#fafafa', 0], [0.29, '#e53935', 0.01], [0.15, '#fafafa', 0.02], [0.05, '#e53935', 0.03]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); m.rotation.x = Math.PI / 2; m.position.set(cx, 1.15, z0 + 0.3 + d); extra.push(m); }
        box(cx - 0.03, 0, z0 + 0.25, cx + 0.03, 0.75, z0 + 0.29, '#616161', undefined, Gm); break; }
      case '-': box(x0, 0, cz - 0.03, x1, 0.012, cz + 0.03, '#ffffff'); break;
      case 'J': { const hz = nb(x - 1, y, 'J') || nb(x + 1, y, 'J'), vt = nb(x, y - 1, 'J') || nb(x, y + 1, 'J');
        if (hz || !vt) { for (let k = 0; k < 5; k++) { const px = x0 + 0.08 + k * 0.2; box(px, 0, cz - 0.02, px + 0.04, 2.1, cz + 0.02, '#8a8f96', undefined, Gm); } box(x0, 1.0, cz - 0.04, x1, 1.06, cz + 0.04, '#8a8f96', undefined, Gm); box(x0, 2.04, cz - 0.04, x1, 2.1, cz + 0.04, '#8a8f96', undefined, Gm); }
        if (vt) { for (let k = 0; k < 5; k++) { const pz = z0 + 0.08 + k * 0.2; box(cx - 0.02, 0, pz, cx + 0.02, 2.1, pz + 0.04, '#8a8f96', undefined, Gm); } box(cx - 0.04, 1.0, z0, cx + 0.04, 1.06, z1, '#8a8f96', undefined, Gm); box(cx - 0.04, 2.04, z0, cx + 0.04, 2.1, z1, '#8a8f96', undefined, Gm); }
        break; }
    }
  }
  // caixa registradora no balcão, do lado de quem atende
  if (it.att) { const ax = Math.floor(it.att.x / ITS), ay = Math.floor(it.att.y / ITS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) if (at(ax + dx, ay + dy) === 'C') { const cx = ax + dx + 0.5, cz = ay + dy + 0.5;
      if (kind === 'hospital' || kind === 'policia') { box(cx - 0.22, 0.97, cz - 0.25, cx + 0.22, 1.33, cz + 0.12, '#d8d2bf', undefined, Gg); box(cx - 0.17, 1.0, cz + 0.121, cx + 0.17, 1.28, cz + 0.13, '#2a3a44', undefined, Ge); }
      else { box(cx - 0.2, 0.97, cz - 0.2, cx + 0.2, 1.12, cz + 0.15, '#3a3d42', undefined, Gm); box(cx - 0.18, 1.12, cz - 0.2, cx + 0.18, 1.3, cz - 0.1, '#2a2c30', undefined, Gm); box(cx - 0.14, 1.15, cz - 0.099, cx + 0.14, 1.26, cz - 0.095, '#7dff8a', undefined, Ge); }
      break; } }

  // ---- malhas ----
  const std = (r, m = 0, extraP = {}) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: r, metalness: m }, extraP));
  const add = (geo, mat, cast = true) => { if (!geo.p.length) return null; const m = geo.mesh(mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  add(G, std(0.85)); add(Gg, std(0.3)); add(Gm, std(0.35, 0.75));
  add(Gw, std(0.05, 0.1, { transparent: true, opacity: 0.3, depthWrite: false }), false);
  add(Ge, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6) }), false);
  if (Gt.p.length) { const g = Gt.mesh(new THREE.MeshStandardMaterial()).geometry; g.setAttribute('uv', new THREE.Float32BufferAttribute(Gt.uv, 2));
    const t = azulejoTex(); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.15, envMapIntensity: 1.2 })); m.receiveShadow = true; scene.add(m); }
  if (Gwin.p.length) { dyn.winMat = new THREE.MeshBasicMaterial({ vertexColors: true }); add(Gwin, dyn.winMat, false); }
  for (const m of extra) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // produtos instanciados
  { const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Vp = new THREE.Vector3(), Vs = new THREE.Vector3(), E = new THREE.Euler(), cc = new THREE.Color();
    for (const [t, list] of Object.entries(prods)) { if (!list.length) continue;
      const im = new THREE.InstancedMesh(PG[t], new THREE.MeshStandardMaterial({ roughness: t === 'bottle' ? 0.12 : t === 'can' ? 0.25 : 0.55, metalness: t === 'can' ? 0.6 : 0 }), list.length);
      list.forEach((p, i) => { M.compose(Vp.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(0, p[7], 0)), Vs.set(p[3], p[4], p[5])); im.setMatrixAt(i, M); im.setColorAt(i, cc.set(p[6])); });
      im.castShadow = list.length < 400; im.receiveShadow = true; scene.add(im); } }

  // ---- luz ----
  const lc = warm ? '#ffd6a0' : '#f2f6ff';
  scene.add(new THREE.HemisphereLight(warm ? '#fff0dc' : '#eef4ff', '#6b5f52', 0.55));
  const q = getQuality();
  const top = new THREE.SpotLight(lc, 1, 0, 1, 0.6, 0); // luz geral de cima (é ela que faz sombra)
  const ht = 9; top.position.set(W / 2, ht, H / 2 - 0.5); top.target.position.set(W / 2, 0, H / 2);
  top.angle = Math.atan((Math.hypot(W, H) / 2 + 1) / ht); top.intensity = warm ? 2.2 : 2.6;
  top.castShadow = q > 0; top.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024); top.shadow.bias = -0.0004; top.shadow.normalBias = 0.03; top.shadow.radius = 3; top.shadow.camera.near = 3; top.shadow.camera.far = 14;
  scene.add(top); scene.add(top.target);
  // lâmpadas espalhadas (sem sombra): dão o tom e o brilho no piso
  const nx = Math.max(1, Math.round(W / 6)), nz = Math.max(1, Math.round(H / 5));
  for (let i = 0; i < nx; i++)for (let j = 0; j < nz; j++) { const l = new THREE.PointLight(lc, warm ? 5 : 6, 0, 1.6); l.position.set((i + 0.5) * W / nx, 2.3, (j + 0.5) * H / nz); scene.add(l); }
  // luz da rua entrando pela porta
  const door = new THREE.PointLight('#fff4e0', 4, 0, 1.4); door.position.set((ex0 + ex1) / 2, 1.6, H + 0.6); scene.add(door); dyn.door = door;

  // anéis dos pontos de interação
  rings = it.points.map(p => { const m = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 32), new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.4, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x / ITS, 0.02, p.y / ITS); m.userData.p = p; scene.add(m); return m; });
  // pessoas: o mesmo boneco da rua, num conjunto só desta cena (material com reflexo)
  people = makePeopleSet(scene);
  for (const k in people) { const im = people[k].im; im.material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: k === 'hair' || k === 'long' ? 0.5 : 0.8 }); }
  const sh = NPC_SHIRT[kind] || '#ffffff';
  built = { it, att: it.att ? lookOf({ id: 11, shirt: sh, skin: '#e0ac69', hair: '#2b1b10' }) : null, teacher: it.teacher ? lookOf({ id: 23, shirt: sh, skin: '#c68642', hair: '#111' }) : null };
  camera = new THREE.PerspectiveCamera(42, 1, 0.3, 100); built.cam = null;
}

// ---------- câmera ----------
function frameTop(it) { // a sala inteira, olhando da porta (a câmera de antes)
  const vf = THREE.MathUtils.degToRad(camera.fov), tilt = THREE.MathUtils.degToRad(58);
  const needW = (it.W / 2 + 0.6) / (Math.tan(vf / 2) * camera.aspect), needH = (it.H * Math.sin(tilt) / 2 + 1.4) / Math.tan(vf / 2);
  const L = Math.max(needW, needH) + 1.5, tx = it.W / 2, tz = it.H / 2 + 0.3;
  return { px: tx, py: Math.sin(tilt) * L, pz: tz + Math.cos(tilt) * L, lx: tx, lz: tz - 0.2 };
}
function frame34(it) { // 3/4 atrás do jogador (olhando pro fundo da sala), presa dentro da sala
  const vf = THREE.MathUtils.degToRad(camera.fov), up = 8.6, back = 6.6;
  const halfW = Math.hypot(up, back) * Math.tan(vf / 2) * camera.aspect; // meia largura do que aparece no chão, mais ou menos
  const px = it.px / ITS, pz = it.py / ITS;
  const tx = it.W <= halfW * 2 - 1 ? it.W / 2 : clamp(px, halfW - 0.6, it.W - halfW + 0.6), tz = clamp(pz - 0.8, 3, it.H - 3.4);
  return { px: tx, py: up, pz: tz + back, lx: tx, lz: tz - 0.4 };
}
const _v = new THREE.Vector3();
const proj = (x, y, h) => { _v.set(x / ITS, h, y / ITS).project(camera); return { x: (_v.x + 1) / 2 * CW, y: (1 - _v.y) / 2 * CH }; };

export function renderInterior3D() {
  const it = S.interior; if (!it) return;
  if (!built || built.it !== it) build(it);
  const renderer = getRenderer();
  const sz = new THREE.Vector2(); renderer.getSize(sz); if (sz.x !== CW || sz.y !== CH) renderer.setSize(CW, CH, false);
  camera.aspect = CW / CH; camera.updateProjectionMatrix();
  // câmera macia (a 3/4 segue o jogador; C troca pra de cima, igual na rua)
  const want = R.cam34 ? frame34(it) : frameTop(it), now = performance.now(), dt = Math.min(0.1, (now - (built.t || now)) / 1000); built.t = now;
  if (!built.cam || built.camMode !== R.cam34) { built.cam = Object.assign({}, want); built.camMode = R.cam34; }
  const k = 1 - Math.exp(-dt * 5); for (const key in want) built.cam[key] = lerp(built.cam[key], want[key], k);
  const c = built.cam; camera.position.set(c.px, c.py, c.pz); camera.lookAt(c.lx, 0, c.lz);
  // pessoas
  const prev = usePeopleSet(people); beginPeople();
  const run = it.moving && it.running;
  putPerson(it.px / ITS, it.py / ITS, 0, it.pa, PS, PLAYER_LOOK, it.moving ? (run ? 'run' : 'walk') : 'idle', it.moving ? it.anim * (run ? 11 : 8) : S.gameTime * 3);
  if (built.att) putPerson(it.att.x / ITS, it.att.y / ITS, 0, Math.PI / 2, PS, built.att, 'idle', S.gameTime * 3 + 1);
  if (built.teacher) putPerson(it.teacher.x / ITS, it.teacher.y / ITS, 0, Math.PI / 2, PS, built.teacher, 'idle', S.gameTime * 3 + 2);
  for (const n of it.npcs) putPerson(n.x / ITS, n.y / ITS, n.sit ? 0.45 - 0.56 * PS : 0, n.a, PS, lookOf(n), n.sit ? 'sit' : n.moving ? 'walk' : 'idle', n.moving ? n.anim * 8 : S.gameTime * 3 + n.id);
  endPeople(); usePeopleSet(prev);
  // lá fora: a calçada e as janelas seguem a hora do dia
  const dk = darkness();
  dyn.outMat.color.set('#d8d3c8').lerp(C('#2a2c3a'), dk); if (dyn.winMat) dyn.winMat.color.set('#ffffff').lerp(C('#1c2236'), dk * 0.9);
  dyn.door.color.set('#fff4e0').lerp(C('#ffb35c'), dk); dyn.door.intensity = lerp(4, 1.5, dk);
  const near = nearestPoint(it);
  for (const r of rings) { const on = r.userData.p === near; r.material.opacity = on ? 0.95 : 0.4; const s = on ? 1 + Math.sin(S.gameTime * 6) * 0.08 : 1; r.scale.set(s, s, s); }
  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  const tm = renderer.toneMapping, ex = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.render(scene, camera);
  renderer.toneMapping = tm; renderer.toneMappingExposure = ex;
  // HUD por cima
  const g = ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CW * DPR, CH * DPR); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawInteriorHUD(g, interiorTitle(), near ? null : 'Anda com WASD · a porta lá embaixo é a saída');
  if (near) { const q = near.exit ? proj(it.px, it.py, 2.2) : proj(near.x, near.y, 1.9); drawKeycap(g, 'F', q.x - 60, q.y, near.label); }
}
