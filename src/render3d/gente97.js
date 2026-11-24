// Gente de 1997 feita por código: boneco articulado (coxa, canela, pé, braço, antebraço, tronco, cabeça, cabelo, boné)
// com roupa de praia e de rua do Rio da época (regata, camiseta, camisa de time inventada, bermuda, short, calça, chinelo,
// tênis, boné). Todo mundo é desenhado instanciado: ~11 chamadas pra GPU, não importa quantas pessoas, e a animação
// (andar, correr, parado, caído, sentado na moto, soco, mirando) é calculada aqui, sem esqueleto.
// Unidade: boneco com 1,11 de altura na escala 1, de frente pro +X (como os carros), largura em Z.
import * as THREE from '../../vendor/three/three.module.min.js';

export const HUMAN_H = 1.11;
const MAXP = 360;

// ---------- peças (cor branca: a cor de cada um vem por instância) ----------
function merged(list) { // junta geometrias numa só (sem índice)
  const pos = [], nor = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); } }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
const T = (g, x, y, z) => (g.translate(x, y, z), g);
// membro: cilindro que desce do pivô (y=0) até -len
const limb = (r0, r1, len, seg = 6) => T(new THREE.CylinderGeometry(r0, r1, len, seg), 0, -len / 2, 0);
const GEO = {
  thigh: limb(0.08, 0.064, 0.26),
  shin: limb(0.062, 0.048, 0.25),
  foot: T(new THREE.BoxGeometry(0.16, 0.05, 0.088), 0.035, -0.025, 0),
  upper: limb(0.058, 0.05, 0.22),
  fore: merged([limb(0.048, 0.04, 0.19), T(new THREE.SphereGeometry(0.052, 6, 4), 0, -0.22, 0)]),          // antebraço com mão
  pelvis: T(new THREE.BoxGeometry(0.17, 0.13, 0.29), 0, 0.6, 0),
  torso: (() => { const g = new THREE.CylinderGeometry(0.17, 0.142, 0.34, 8); g.scale(0.82, 1, 1.18); return T(g, 0, 0.8, 0); })(),
  head: merged([T(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 6), 0, 0.98, 0), T(new THREE.SphereGeometry(0.118, 10, 7), 0.005, 1.07, 0)]),
  hair: (() => { const g = new THREE.SphereGeometry(0.131, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 0.95, 1); return T(g, -0.012, 1.073, 0); })(),
  long: (() => { const g = new THREE.CylinderGeometry(0.1, 0.115, 0.25, 8, 1, false, Math.PI * 0.5, Math.PI); return T(g, -0.035, 0.99, 0); })(), // cabelo comprido (atrás)
  cap: merged([(() => { const g = new THREE.SphereGeometry(0.13, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.42); return T(g, -0.005, 1.085, 0); })(),
    T(new THREE.BoxGeometry(0.12, 0.016, 0.17), 0.12, 1.12, 0)]),                                                 // boné com aba pra frente
  helmet: (() => { const g = new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6); g.scale(1.05, 1, 1); return T(g, -0.01, 1.06, 0); })(), // capacete do motoqueiro
  visor: T(new THREE.BoxGeometry(0.03, 0.065, 0.19), 0.135, 1.07, 0),
  stripe: (() => { const g = new THREE.CylinderGeometry(0.172, 0.159, 0.07, 8); g.scale(0.83, 1, 1.19); return T(g, 0, 0.82, 0); })(), // faixa da camisa de time
};
let IM = null;
const PARTS = { thigh: 2, shin: 2, foot: 2, upper: 2, fore: 2, pelvis: 1, torso: 1, head: 1, hair: 1, long: 1, cap: 1, helmet: 1, visor: 1, stripe: 1 };
const CAST = new Set(['torso', 'pelvis', 'head', 'thigh']);
export function initPeople(scene) { IM = makePeopleSet(scene); return IM; }
// um conjunto de bonecos por cena (a rua e o interior dos lugares): usePeopleSet troca o conjunto ativo e devolve o anterior
export function usePeopleSet(set) { const old = IM; IM = set; return old; }
const sceneOf = new WeakMap(); // conjunto -> cena (onde o protagonista Meshy é posto)
export function makePeopleSet(scene) {
  const IM = {}; sceneOf.set(IM, scene);
  for (const [k, per] of Object.entries(PARTS)) {
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff' }); m.userData.pbr = { r: k === 'hair' || k === 'long' ? 0.6 : 0.85 };
    const im = new THREE.InstancedMesh(GEO[k], m, MAXP * per); im.count = 0; im.frustumCulled = false; im.castShadow = CAST.has(k);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color(1, 1, 1)); im.userData.gente = true; scene.add(im); IM[k] = { im, n: 0 };
  }
  return IM;
}

// ---------- roupa de 97 ----------
const hc = {}; const col = h => hc[h] || (hc[h] = new THREE.Color(h));
const rnd = s => { s = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const SHORTS = ['#2b4c7e', '#1d1d22', '#4f6d3a', '#c8b48a', '#7a2e2e', '#2f7fb8', '#e8e2d2', '#3d3d45', '#d35400', '#16a085'];
const JEANS = ['#3b5677', '#2c3e5a', '#4a6a8a', '#26262b', '#8a7f6a'];
const FLIP = ['#f2d03b', '#2a6fd6', '#f4f4f0', '#1e8f4a', '#e53935', '#111111'];       // chinelo
const SNEAK = ['#f4f4f0', '#e9e9e9', '#222222', '#c0392b'];                              // tênis
const CAPS = ['#c62828', '#1f3a6b', '#111111', '#f4f4f0', '#2e7d32', '#f1c40f'];
const TEAMS = [['#c62828', '#111111'], ['#111111', '#f4f4f0'], ['#2e7d32', '#8e1b2b'], ['#f4f4f0', '#1f3a6b']];  // camisas de time inventadas (duas cores)
const looks = new WeakMap();
// visual de cada pessoa: sai da cor da camisa, da pele e do cabelo que o jogo já sorteia + um sorteio fixo pelo id
export function lookOf(p) {
  let L = looks.get(p); if (L && L.shirt === p.shirt && L.cop === !!p.cop) return L;
  const r = k => rnd((p.id || 7) * 13.37 + k);
  const fem = r(1) < 0.45, beach = r(2) < 0.45;
  L = { shirt: p.shirt, cop: !!p.cop, skin: col(p.skin || '#c68642'), hair: col(p.hair || '#222') };
  if (p.cop) { // farda: camisa da unidade, calça escura, coturno, quepe/boné
    const u = col(p.shirt || '#1f3a6b'); Object.assign(L, { top: u, arms: u, pants: col('#1c2233'), shins: col('#1c2233'), feet: col('#111'), cap: col(p.shirt === '#4b5320' ? '#3d4419' : '#15171c'), long: false, stripe: null, fem: false });
    return looks.set(p, L), L;
  }
  const team = r(3) < 0.18 ? TEAMS[Math.floor(r(4) * TEAMS.length)] : null;
  const top = team ? col(team[0]) : col(p.shirt || '#888');
  const regata = !team && r(5) < (beach ? 0.55 : 0.25);              // regata: braço de fora
  const calca = !beach && r(6) < (fem ? 0.3 : 0.4);
  const pants = calca ? col(JEANS[Math.floor(r(7) * JEANS.length)]) : col(SHORTS[Math.floor(r(8) * SHORTS.length)]);
  Object.assign(L, { top, arms: regata ? L.skin : top, pants, shins: calca ? pants : L.skin,
    feet: col(calca || r(9) < 0.35 ? SNEAK[Math.floor(r(10) * SNEAK.length)] : FLIP[Math.floor(r(11) * FLIP.length)]),
    cap: !fem && r(12) < 0.3 ? col(CAPS[Math.floor(r(13) * CAPS.length)]) : null, long: fem && r(14) < 0.8, stripe: team ? col(team[1]) : null, fem });
  return looks.set(p, L), L;
}
// o jogador: camisa laranja de sempre, bermuda jeans, tênis branco
export const PLAYER_LOOK = { top: col('#ff7a1a'), arms: col('#ff7a1a'), skin: col('#c68642'), hair: col('#111'), pants: col('#3b5677'), shins: col('#c68642'), feet: col('#f4f4f0'), cap: null, long: false, stripe: null };

// a mesma roupa, de capacete (quem pilota moto)
const helmets = new WeakMap();
export function withHelmet(L, hex) { const c = col(hex); let H = helmets.get(L); if (!H || H.helmet !== c) { H = Object.assign({}, L, { helmet: c }); helmets.set(L, H); } return H; }

// ---------- montagem por quadro ----------
const B = new THREE.Matrix4(), M = new THREE.Matrix4(), R = new THREE.Matrix4(), J = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function beginPeople() { if (IM) for (const k in IM) IM[k].n = 0; const pm = IM && playerMeshes.get(IM); if (pm) pm.mesh.visible = false; }
function put(k, mat, c) { const P = IM[k]; if (P.n >= MAXP * PARTS[k]) return; P.im.setMatrixAt(P.n, mat); P.im.setColorAt(P.n, c || col('#fff')); P.n++; }
const rotZ = a => R.makeRotationZ(a);
// junta: pivô (x,y,z) no corpo, gira a em Z (pra frente/trás) e opcionalmente b em X (abre pro lado)
function joint(out, base, x, y, z, a, b = 0) { e.set(b, 0, a, 'XYZ'); q.setFromEuler(e); J.compose(v.set(x, y, z), q, s3.set(1, 1, 1)); return out.multiplyMatrices(base, J); }
const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), body = new THREE.Matrix4();
// pose: 'walk' | 'run' | 'idle' | 'down' | 'sit' | 'punch' | 'aim'. ph = fase da passada (em radianos).
// ângulos da pose (Z positivo = pé/mão pra frente). Os mesmos pro boneco de peças e pro protagonista Meshy.
function poseAngles(pose, ph) {
  let hipA = 0, hipB = 0, kneeA = 0, kneeB = 0, shA = 0, shB = 0, elA = 0, elB = 0, lean = 0, bob = 0, sideR = 0.135, shR = 0;
  if (pose === 'walk' || pose === 'run') {
    const run = pose === 'run', amp = run ? 0.75 : 0.42, s = Math.sin(ph), c = Math.cos(ph);
    hipA = s * amp; hipB = -s * amp;
    kneeA = -Math.max(0, -c) * (run ? 1.3 : 0.7) - 0.05; kneeB = -Math.max(0, c) * (run ? 1.3 : 0.7) - 0.05;
    shA = -s * amp * 0.9; shB = s * amp * 0.9; elA = elB = run ? 1.3 : 0.35; lean = run ? -0.22 : -0.04; bob = Math.abs(c) * (run ? 0.03 : 0.015);
  } else if (pose === 'idle') { const br = Math.sin(ph * 0.35) * 0.02; shA = br; shB = -br; elA = elB = 0.12; }
  else if (pose === 'sit') { hipA = hipB = 1.45; kneeA = kneeB = -1.35; shA = shB = 0.95; elA = elB = 0.35; lean = -0.12; sideR = 0.15; }
  else if (pose === 'punch') { const k = Math.max(0, Math.sin(ph)); shB = 0.25; elB = 1.4; shA = 1.45 * k + 0.2; elA = 0.15; lean = -0.1 * k; shR = 0.1; }
  else if (pose === 'aim') { shA = 1.5; elA = 0.05; shB = 0.6; elB = 0.8; lean = -0.04; }
  return { hipA, hipB, kneeA, kneeB, shA, shB, elA, elB, lean, bob, sideR, shR };
}
export function putPerson(x, y, z, a, scale, L, pose, ph) {
  if (!IM || IM.torso.n >= MAXP) return;
  const down = pose === 'down';
  e.set(0, -a, down ? Math.PI / 2 : 0, 'YXZ'); q.setFromEuler(e);
  B.compose(v.set(x, down ? z + 0.14 * scale : z, y), q, s3.set(scale, scale, scale));
  const { hipA, hipB, kneeA, kneeB, shA, shB, elA, elB, lean, bob, sideR, shR } = poseAngles(pose, ph);
  if (L === PLAYER_LOOK && PLAYER_MODEL && pose !== 'sit') { posePlayer(B, pose, { hipA, hipB, kneeA, kneeB, shA, shB, elA, elB, lean, bob, shR }); return; }
  // corpo (quadril pra cima): balanço e inclinação
  body.multiplyMatrices(B, J.makeTranslation(0, bob, 0)).multiply(R.makeTranslation(0, 0.56, 0)).multiply(rotZ(lean)).multiply(M.makeTranslation(0, -0.56, 0));
  const skin = L.skin;
  put('pelvis', body, L.pants); put('torso', body, L.top); put('head', body, skin);
  put('stripe', L.stripe ? body : ZERO, L.stripe || skin);
  const hel = L.helmet; // de capacete não aparece cabelo nem boné
  put('hair', L.cap || hel ? ZERO : body, L.hair); put('cap', L.cap && !hel ? body : ZERO, L.cap || skin); put('long', L.long && !hel ? body : ZERO, L.hair);
  put('helmet', hel ? body : ZERO, hel || skin); put('visor', hel ? body : ZERO, col('#16181c'));
  // pernas: do quadril (no corpo sem inclinação, pra não "sentar" ao correr)
  const legBase = pose === 'sit' ? body : tmpB.multiplyMatrices(B, J.makeTranslation(0, bob, 0));
  for (const [zz, ha, ka] of [[sideR * 0.62, hipA, kneeA], [-sideR * 0.62, hipB, kneeB]]) {
    joint(tmpA, legBase, 0, 0.56, zz, ha); put('thigh', tmpA, L.pants);
    joint(M, tmpA, 0, -0.26, 0, ka); put('shin', M, L.shins);
    joint(tmpA, M, 0, -0.25, 0, pose === 'sit' ? 0.1 : -ka * 0.4 - ha * 0.3); put('foot', tmpA, L.feet);
  }
  // braços: do ombro, abertos um pouco pro lado
  for (const [zz, sa, ea, open] of [[0.2, shA, elA, -0.08 - shR], [-0.2, shB, elB, 0.08]]) {
    joint(tmpA, body, 0, 0.94, zz, sa, open); put('upper', tmpA, L.arms);
    joint(M, tmpA, 0, -0.22, 0, ea); put('fore', M, skin);
  }
}
export function endPeople() {
  if (!IM) return;
  for (const k in IM) { const P = IM[k]; P.im.count = P.n; P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
}

// ---------- protagonista feito no Meshy (malha com esqueleto) ----------
// O modelo vem em A-pose (braços abertos ~30°). Cada osso gira com os mesmos ângulos do boneco de peças; antes, o braço/perna
// "desabre" da A-pose (Rx(-abertura)), então andar, correr, socar e mirar ficam iguais. Escala uniforme: o modelo não é esticado.
// Juntas medidas no próprio modelo (unidades do jogo, escala 1, frente +X). Lado +Z e -Z são espelhados.
const PJ = { hip: [0.005, 0.538, 0.063], knee: [-0.02, 0.297, 0.092], ankle: [-0.006, 0.076, 0.104],
  shoulder: [-0.019, 0.93, 0.126], elbow: [-0.013, 0.753, 0.234], wrist: [0.019, 0.639, 0.297] };
const ARM_OPEN = Math.atan2(PJ.wrist[2] - PJ.shoulder[2], PJ.shoulder[1] - PJ.wrist[1]);   // ~30°
const LEG_OPEN = Math.atan2(PJ.ankle[2] - PJ.hip[2], PJ.hip[1] - PJ.ankle[1]);             // ~5°
let PLAYER_MODEL = null;
const playerMeshes = new WeakMap();   // conjunto de pessoas -> { mesh, bones }
export function setPlayerModel(geo) { PLAYER_MODEL = geo && (geo.attributes.skinIndex ? geo : skinWeights(geo)); }
export const playerModel = () => PLAYER_MODEL;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ossos: 0 raiz, 1 corpo, 2-4 coxa/canela/pé (+Z), 5-7 (-Z), 8-9 braço/antebraço (+Z), 10-11 (-Z)
function skinWeights(geo) {
  const P = geo.attributes.position, n = P.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const sl = PJ.wrist[1] - PJ.shoulder[1], sz = PJ.wrist[2] - PJ.shoulder[2], slen = Math.hypot(sl, sz);
  const tEl = Math.hypot(PJ.elbow[1] - PJ.shoulder[1], PJ.elbow[2] - PJ.shoulder[2]) / slen;
  for (let i = 0; i < n; i++) {
    const y = P.getY(i), z = P.getZ(i), az = Math.abs(z), side = z >= 0 ? 0 : 1;
    let a = 1, b = 1, w = 1;   // osso a com peso w, osso b com 1-w
    // braço: fora do tronco abaixo da axila, e misturando com o corpo no ombro
    const armW = y < 0.84 ? (az > 0.14 ? 1 : 0) : sstep(0.09, 0.17, az) * (y < 0.98 ? 1 : 0);
    if (armW > 0 && y > 0.5) {
      const t = ((y - PJ.shoulder[1]) * sl + (az - PJ.shoulder[2]) * sz) / (slen * slen); // 0 ombro .. 1 pulso
      const up = 8 + side * 2, fw = sstep(tEl - 0.07, tEl + 0.07, t);
      if (fw > 0.999) { a = up + 1; w = 1; } else if (fw < 0.001) { a = up; b = 1; w = armW; } else { a = up + 1; b = up; w = fw; }
    } else if (y < 0.6) {
      const base = 2 + side * 3;
      if (y < 0.13) { const f = sstep(0.07, 0.13, y); a = base + 2; b = base + 1; w = 1 - f; }           // pé / canela
      else if (y < 0.36) { const k = sstep(PJ.knee[1] - 0.04, PJ.knee[1] + 0.05, y); a = base + 1; b = base; w = 1 - k; } // canela / coxa
      else { a = base; b = 1; w = 1 - sstep(0.47, 0.6, y); }                                             // coxa / quadril
    }
    si[i * 4] = a; si[i * 4 + 1] = b; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}
const playerMat = new THREE.MeshLambertMaterial({ vertexColors: true }); playerMat.userData.pbr = { r: 0.75 };
function makePlayerMesh(scene) {
  const B = () => new THREE.Bone(), bones = Array.from({ length: 12 }, B);
  const [root, body] = bones; root.add(body); body.position.set(0, PJ.hip[1], 0);
  for (const s of [0, 1]) {
    const sg = s ? -1 : 1, L = 2 + s * 3, A = 8 + s * 2;
    const th = bones[L], sh = bones[L + 1], ft = bones[L + 2], up = bones[A], fo = bones[A + 1];
    root.add(th); th.position.set(PJ.hip[0], PJ.hip[1], sg * PJ.hip[2]);
    th.add(sh); sh.position.set(PJ.knee[0] - PJ.hip[0], PJ.knee[1] - PJ.hip[1], sg * (PJ.knee[2] - PJ.hip[2]));
    sh.add(ft); ft.position.set(PJ.ankle[0] - PJ.knee[0], PJ.ankle[1] - PJ.knee[1], sg * (PJ.ankle[2] - PJ.knee[2]));
    body.add(up); up.position.set(PJ.shoulder[0], PJ.shoulder[1] - PJ.hip[1], sg * PJ.shoulder[2]);
    up.add(fo); fo.position.set(PJ.elbow[0] - PJ.shoulder[0], PJ.elbow[1] - PJ.shoulder[1], sg * (PJ.elbow[2] - PJ.shoulder[2]));
  }
  const mesh = new THREE.SkinnedMesh(PLAYER_MODEL, playerMat);
  mesh.add(root); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false; mesh.userData.gente = true; scene.add(mesh);
  return { mesh, bones };
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), XA = new THREE.Vector3(1, 0, 0), m4 = new THREE.Matrix4();
// rotação de junta "desabrindo" a A-pose: Euler(b, 0, a) depois de Rx(-abre)
function limbRot(out, a, b, open) { e.set(b, 0, a, 'XYZ'); out.setFromEuler(e); return out.multiply(qb.setFromAxisAngle(XA, -open)); }
// junta filha no mesmo membro: Rx(abre)·Rz(a)·Rx(-abre)
function childRot(out, a, open) { out.setFromAxisAngle(XA, open); e.set(0, 0, a); out.multiply(qa.setFromEuler(e)); return out.multiply(qb.setFromAxisAngle(XA, -open)); }
function posePlayer(Bm, pose, g) {
  let pm = playerMeshes.get(IM);
  if (!pm) { const sc = sceneOf.get(IM); if (!sc) return; pm = makePlayerMesh(sc); playerMeshes.set(IM, pm); }
  const bn = pm.bones; pm.mesh.visible = true;
  m4.multiplyMatrices(Bm, J.makeTranslation(0, g.bob, 0)); m4.decompose(bn[0].position, bn[0].quaternion, bn[0].scale);
  bn[1].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), g.lean);
  const legs = [[g.hipA, g.kneeA], [g.hipB, g.kneeB]];
  for (const s of [0, 1]) {
    const sg = s ? -1 : 1, L = 2 + s * 3, A = 8 + s * 2, lo = -sg * LEG_OPEN, ao = -sg * ARM_OPEN;
    const [ha, ka] = legs[s];
    limbRot(bn[L].quaternion, ha, 0, lo); childRot(bn[L + 1].quaternion, ka, lo);
    childRot(bn[L + 2].quaternion, pose === 'sit' ? 0.1 : -ka * 0.4 - ha * 0.3, lo);
    const sa = s ? g.shB : g.shA, ea = s ? g.elB : g.elA, op = s ? 0.08 : -0.08 - g.shR;
    limbRot(bn[A].quaternion, sa, op, ao); childRot(bn[A + 1].quaternion, ea, ao);
  }
}
