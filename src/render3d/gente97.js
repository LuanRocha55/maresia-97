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
  const fem = p.fem !== undefined ? !!p.fem : r(1) < 0.45, beach = r(2) < 0.45;
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
export function beginPeople() { if (IM) for (const k in IM) IM[k].n = 0; const pm = IM && playerMeshes.get(IM); if (pm) pm.mesh.visible = false; const gs = IM && gunsOf.get(IM); if (gs) for (const k in gs) gs[k].visible = false; }
function put(k, mat, c) { const P = IM[k]; if (P.n >= MAXP * PARTS[k]) return; P.im.setMatrixAt(P.n, mat); P.im.setColorAt(P.n, c || col('#fff')); P.n++; }
const rotZ = a => R.makeRotationZ(a);
// junta: pivô (x,y,z) no corpo, gira a em Z (pra frente/trás) e opcionalmente b em X (abre pro lado)
function joint(out, base, x, y, z, a, b = 0, c = 0) { e.set(b, c, a, 'XYZ'); q.setFromEuler(e); J.compose(v.set(x, y, z), q, s3.set(1, 1, 1)); return out.multiplyMatrices(base, J); }
const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), body = new THREE.Matrix4();
// pose: 'walk' | 'run' | 'idle' | 'down' | 'sit' | 'punch' | 'aim'. ph = fase da passada (em radianos).
// ângulos da pose (Z positivo = pé/mão pra frente). Os mesmos pro boneco de peças e pro protagonista Meshy.
// gun: arma na mão ('pistola' | 'escopeta' | 'smg' | null), aim: mirando (braços pra frente, pernas seguem a pose), kick: coice do tiro (0..1).
// shYA/shYB giram o braço esticado pro meio do corpo (pras duas mãos se encontrarem na arma).
function poseAngles(pose, ph, gun, aim, kick = 0, gt = null) {
  let hipA = 0, hipB = 0, kneeA = 0, kneeB = 0, shA = 0, shB = 0, elA = 0, elB = 0, lean = 0, bob = 0, sideR = 0.135, shR = 0, shYA = 0, shYB = 0, gunE = null;
  let footA = null, footB = null, hbA = 0, hbB = 0, twP = 0, twT = 0, moving = false;
  if (gt && (pose === 'walk' || pose === 'run' || pose === 'idle' || pose === 'punch')) {
    // passada de verdade (pé plantado no chão): pernas, quadril e braços saem da velocidade medida (gaitPose)
    ({ hipA, hipB, kneeA, kneeB, footA, footB, hbA, hbB, shA, shB, elA, elB, shYA, shYB, lean, bob, twP, twT } = gt.o);
    moving = gt.w > 0.5; ph = gt.ph * Math.PI * 2;
    if (pose === 'punch') { const k = Math.max(0, Math.sin(gt.punch)); shB = 0.25; elB = 1.4; shA = 1.45 * k + 0.2; elA = 0.15; shYA = shYB = 0; lean += -0.1 * k; shR = 0.1; }
  } else if (pose === 'walk' || pose === 'run') {
    const run = pose === 'run', amp = run ? 0.75 : 0.42, s = Math.sin(ph), c = Math.cos(ph);
    hipA = s * amp; hipB = -s * amp;
    kneeA = -Math.max(0, -c) * (run ? 1.3 : 0.7) - 0.05; kneeB = -Math.max(0, c) * (run ? 1.3 : 0.7) - 0.05;
    shA = -s * amp * 0.9; shB = s * amp * 0.9; elA = elB = run ? 1.3 : 0.35; lean = run ? -0.22 : -0.04; bob = Math.abs(c) * (run ? 0.03 : 0.015);
  } else if (pose === 'idle') { const br = Math.sin(ph * 0.35) * 0.02; shA = br; shB = -br; elA = elB = 0.12; }
  else if (pose === 'sit') { hipA = hipB = 1.45; kneeA = kneeB = -1.35; shA = shB = 0.95; elA = elB = 0.35; lean = -0.12; sideR = 0.15; }
  else if (pose === 'punch') { const k = Math.max(0, Math.sin(ph)); shB = 0.25; elB = 1.4; shA = 1.45 * k + 0.2; elA = 0.15; lean = -0.1 * k; shR = 0.1; }
  else if (pose === 'aim') { shA = 1.5; elA = 0.05; shB = 0.6; elB = 0.8; lean = -0.04; }
  if (gun && pose !== 'down' && pose !== 'sit' && pose !== 'punch') {
    const long = gun !== 'pistola';
    if (aim) {
      // mirando: pistola com as duas mãos esticadas; escopeta/submetralhadora com a coronha no ombro e a outra mão no cano
      if (long) { shA = 0.95; elA = 0.95; shYA = 0.2; shB = 1.4; elB = 0.3; shYB = -0.7; lean = 0.02; }
      else { shA = 1.55; elA = 0.02; shYA = 0.22; shB = 1.42; elB = 0.18; shYB = -0.62; lean = -0.03; }
      shA += kick * 0.3; elA += kick * 0.25; shB += kick * 0.22; elB += kick * 0.2; lean += kick * 0.06;
      shR = 0; gunE = [0, 0, kick * 0.45];   // arma reta pra frente (o coice levanta o cano)
    } else if (long) {
      // andando com arma comprida: atravessada na frente do peito (a mão de trás balança pouco)
      const sw = Math.sin(ph) * (pose === 'run' || gt && gt.r > 0.5 ? 0.12 : 0.06) * (gt ? gt.w : 1);
      shA = 0.35 + sw; elA = 1.25; shYA = 0.1; shB = 0.75 - sw; elB = 1.35; shYB = -0.55; gunE = [0.15, 0.95, 0.35];
    } else if (pose === 'idle' && !moving) { shA = 0.18; elA = 0.35; shYA = 0; }   // pistola parada: braço solto, arma apontada pro chão
  }
  if (footA === null) { footA = pose === 'sit' ? 0.1 : -kneeA * 0.4 - hipA * 0.3; footB = pose === 'sit' ? 0.1 : -kneeB * 0.4 - hipB * 0.3; }
  return { hipA, hipB, kneeA, kneeB, footA, footB, hbA, hbB, twP, twT, shA, shB, elA, elB, lean, bob, sideR, shR, shYA, shYB, gunE };
}
// ---------- passada (andar/correr com o pé plantado no chão) ----------
// Antes a perna balançava num seno com passo fixo: o passo era bem mais curto que o quanto o corpo andava (o pé
// escorregava) e o joelho dobrava com o pé no chão. Agora cada pé tem um ponto no chão que fica parado enquanto
// apoia, e o ângulo de quadril/joelho/tornozelo sai de IK de dois ossos. A velocidade é medida pelo quanto a pessoa
// andou de verdade (nada de andar no lugar encostado na parede), e o ritmo (passos por segundo), o tamanho do passo,
// o tempo no chão, o balanço do quadril, a torção do peito e o braço mudam juntos do andar pro correr.
// Medidas da perna em unidades do boneco (escala 1): altura do quadril, coxa, canela, ângulo de repouso da coxa e da
// canela (t0/t1, + = pra frente), altura do tornozelo, ponta do pé e calcanhar.
const LEG_PIECE = { hipY: 0.56, l1: 0.26, l2: 0.25, t0: 0, t1: 0, ankH: 0.05, toe: 0.1, heel: 0.045 };
const LEG_MESHY = (() => {
  const [h, k, a] = [[0.005, 0.538, 0.063], [-0.02, 0.297, 0.092], [-0.006, 0.076, 0.104]];
  return { hipY: h[1], l1: Math.hypot(k[0] - h[0], k[1] - h[1], k[2] - h[2]), l2: Math.hypot(a[0] - k[0], a[1] - k[1], a[2] - k[2]),
    t0: Math.atan2(k[0] - h[0], h[1] - k[1]), t1: Math.atan2(a[0] - k[0], k[1] - a[1]), ankH: a[1], toe: 0.1, heel: 0.045 };
})();
let clock = 0;   // relógio do jogo (para quando pausa: a pessoa congela em vez de parar de andar)
export function peopleTime(t) { clock = t; }
const gaits = new WeakMap();
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, mix = (a, b, t) => a + (b - a) * t, TAU = Math.PI * 2;
function wrapA(d) { d %= TAU; return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d; }
function newGaitOut() { return { hipA: 0, hipB: 0, kneeA: 0, kneeB: 0, footA: 0, footB: 0, hbA: 0, hbB: 0, shA: 0, shB: 0, elA: 0, elB: 0, shYA: 0, shYB: 0, lean: 0, bob: 0, twP: 0, twT: 0 }; }
// x,y = posição no chão (unidades do mundo), a = pra onde a pessoa olha
function gaitOf(who, x, y, a, scale, G, aim) {
  let g = gaits.get(who);
  if (!g || g.G !== G) { g = { t: clock, x, y, yaw: a, ph: 0, v: 0, dx: 1, dz: 0, w: 0, r: 0, G, o: newGaitOut(), punch: 0 }; gaits.set(who, g); gaitPose(g, 0); return g; }
  let dt = clock - g.t; g.t = clock;
  if (dt <= 0) return g;                                   // mesmo quadro (ou jogo pausado): fica como está
  const mx = (x - g.x) / scale, my = (y - g.y) / scale; g.x = x; g.y = y;
  let dist = Math.hypot(mx, my);
  if (dt > 0.3 || dist > 2.5) { dist = 0; g.v = 0; dt = Math.min(dt, 0.05); }   // pulou (teleporte, voltou de outro lugar)
  // vira o corpo rápido, mas não num estalo
  g.yaw += wrapA(a - g.yaw) * Math.min(1, dt * (aim ? 30 : 13));
  // velocidade e direção do movimento em relação a pra onde o corpo olha (x = frente, z = lado do corpo)
  g.v += (dist / dt - g.v) * Math.min(1, dt * 14);
  if (dist > 1e-5) {
    const c = Math.cos(g.yaw), s = Math.sin(g.yaw), f = (mx * c + my * s) / dist, l = (-mx * s + my * c) / dist, k = Math.min(1, dt * 12);
    g.dx += (f - g.dx) * k; g.dz += (l - g.dz) * k; const n = Math.hypot(g.dx, g.dz) || 1; g.dx /= n; g.dz /= n;
  }
  g.w += ((g.v > 0.22 ? 1 : 0) - g.w) * Math.min(1, dt * 9);
  gaitPose(g, dt);
  return g;
}
const AK = { x: 0, y: 0 }, AK0 = { x: 0, y: 0 }, AK1 = { x: 0, y: 0 };
// tornozelo quando o pé está no chão em s (ao longo do passo), inclinado p (+ = ponta pra cima: gira no calcanhar;
// - = ponta pra baixo: gira na ponta do pé)
function ankleAt(s, p, G, o) {
  const c = Math.cos(p), sn = Math.sin(p);
  if (p >= 0) { o.x = s - G.heel + G.heel * c - G.ankH * sn; o.y = G.heel * sn + G.ankH * c; }
  else { o.x = s + G.toe - G.toe * c - G.ankH * sn; o.y = -G.toe * sn + G.ankH * c; }
  return o;
}
// IK de dois ossos: tornozelo em (dx frente, dy vertical, dz lado) a partir do quadril -> ângulos da perna
function legIK(G, dx, dy, dz, pitch, o, side) {
  const dv = Math.hypot(dy, dz), hb = -Math.atan2(dz, -dy);
  const d = clamp(Math.hypot(dx, dv), Math.abs(G.l1 - G.l2) + 0.02, (G.l1 + G.l2) * 0.9995);
  const th = Math.atan2(dx, dv);
  const al = Math.acos(clamp((G.l1 * G.l1 + d * d - G.l2 * G.l2) / (2 * G.l1 * d), -1, 1));
  const kb = Math.acos(clamp((G.l1 * G.l1 + G.l2 * G.l2 - d * d) / (2 * G.l1 * G.l2), -1, 1));
  const p1 = th + al, p2 = p1 - (Math.PI - kb), hip = p1 - G.t0, knee = p2 - G.t1 - hip, foot = pitch - (p2 - G.t1);
  if (side) { o.hipB = hip; o.kneeB = knee; o.footB = foot; o.hbB = hb; } else { o.hipA = hip; o.kneeA = knee; o.footA = foot; o.hbA = hb; }
}
function gaitPose(g, dt) {
  const G = g.G, L = G.l1 + G.l2, o = g.o, vL = g.v / L;
  // andar x correr: pela velocidade em "pernas por segundo" (as pessoas do jogo andam mais rápido que gente de verdade,
  // então o limite é mais alto que o real: pedestre passeando anda, o protagonista no normal corre como no GTA)
  g.r += (sstep(5, 6.5, vL) - g.r) * Math.min(1, dt * 5);
  const r = g.r, sprint = clamp((vL - 9) / 5, 0, 1);
  // quadril: andando desce um pouco (o passo cabe sem esticar a perna toda) e sobe no meio do apoio;
  // correndo fica mais alto e afunda no apoio (o joelho amortece)
  const drop = mix(0.022, 0.012, r) * g.w, bobAmp = mix(0.012, -0.016, r) * g.w;
  const hipMin = G.hipY - drop - Math.abs(bobAmp);
  const reach = Math.sqrt(Math.max(0, (L * 0.985) ** 2 - (hipMin - G.ankH) ** 2)) + 0.02;
  // ritmo (ciclos de 2 passos por segundo). Andando: passo no máximo do que a perna alcança com os dois pés no chão
  // um instante (se não, acelera o passo, até 2 Hz); correndo: 1,6 a 2,3 Hz com o pé no ar entre um passo e outro
  const fWalk = Math.min(2, Math.max(0.55 + 0.27 * vL, g.v / (4 * reach))), f = mix(fWalk, 1.2 + 0.075 * vL, r), S = g.v / f;
  g.ph = (g.ph + f * dt * g.w) % 1;
  const w = g.w, fx = g.dx, fz = g.dz;
  const betaD = mix(0.6, 0.36, r);
  const sh = S > 1e-3 ? Math.min(betaD * S / 2, reach) : 0;
  const beta = S > 1e-3 ? clamp(2 * sh / S, 0.08, 0.7) : betaD;
  const sp = ((2 * (g.ph - beta / 2)) % 1 + 1) % 1;
  const bob = -drop + bobAmp * Math.min(1, 2 * S / L) * Math.cos(TAU * sp), hipY = G.hipY + bob;
  const lift = (mix(0.05, 0.15, r) + 0.06 * sprint) * sstep(0.05, 0.6, S / L), skew = mix(1, 0.6, r);
  const strike = mix(0.3, 0.12, r) * fx, toeOff = mix(0.5, 0.55, r) * fx;
  for (let side = 0; side < 2; side++) {
    const u = (g.ph + side * 0.5) % 1;
    let s, ax, ay, p;
    if (u < beta) {   // apoio: o pé fica parado no chão enquanto o corpo passa por cima
      const t = u / beta; s = sh * (1 - 2 * t);
      p = strike * (1 - sstep(0, 0.3, t)) - toeOff * sstep(0.55, 1, t);
      ankleAt(s, p, G, AK); ax = AK.x - s; ay = AK.y;
    } else {          // no ar: o pé sai de trás e vai pra frente (no correr, o calcanhar sobe atrás e o joelho vem à frente)
      const t = (u - beta) / (1 - beta);
      ankleAt(-sh, -toeOff, G, AK0); ankleAt(sh, strike, G, AK1);
      const m = -Math.min(2 * sh * (1 - beta) / beta, 3 * sh) * 0.35, t2 = t * t, t3 = t2 * t;
      s = (2 * t3 - 3 * t2 + 1) * -sh + (t3 - 2 * t2 + t) * m + (-2 * t3 + 3 * t2) * sh + (t3 - t2) * m;
      ax = mix(AK0.x + sh, AK1.x - sh, t); ay = mix(AK0.y, AK1.y, t) + lift * Math.sin(Math.PI * Math.pow(t, skew));
      p = mix(-toeOff, strike, sstep(0.2, 0.85, t)) * (1 - 0.5 * Math.sin(Math.PI * t));
    }
    const sg = side ? -1 : 1;
    legIK(G, fx * s + ax, ay - hipY, fz * s + sg * 0.03 * Math.abs(fz) * w, p, o, side);
  }
  // braços: balançam ao contrário da perna do mesmo lado; correndo, cotovelo dobrado e braço mais forte
  const amp = (mix(0.3, 0.55, r) + 0.22 * sprint) * sstep(0, 0.8, S / L) * (0.4 + 0.6 * Math.abs(fx)) * w;
  const sA = Math.sin(TAU * (g.ph - beta / 2 - 0.03)) * (fx < -0.2 ? -1 : 1);
  const br = Math.sin(clock * 1.05) * 0.02 * (1 - w);   // parado: respira
  o.shA = amp * sA + br; o.shB = -amp * sA - br;
  const el = mix(0.12, mix(0.3, 1.45, r), w);
  o.elA = el + Math.max(0, o.shA) * 0.45; o.elB = el + Math.max(0, o.shB) * 0.45;
  o.shYA = 0.16 * r * w; o.shYB = -0.16 * r * w;
  o.lean = -(mix(0.03, 0.13, r) + 0.08 * sprint) * fx * w;
  o.bob = bob;
  o.twP = -mix(0.08, 0.1, r) * sA * Math.abs(fx) * w;
  o.twT = mix(0.05, 0.13, r) * sA * Math.abs(fx) * w;
  // parado: perna esticada embaixo do quadril (mistura suave entre parado e andando)
  if (w < 1) { const k = w; for (const n of ['hipA', 'hipB', 'kneeA', 'kneeB', 'footA', 'footB', 'hbA', 'hbB']) o[n] *= k; }
}
// arma do protagonista neste quadro (r3d.js põe antes de desenhar ele): tipo, mirando e coice
export const playerGun = { kind: null, aim: false, kick: 0 };
// who: o objeto da pessoa (jogador, pedestre...). Com ele a passada é medida pelo quanto a pessoa andou de verdade.
export function putPerson(x, y, z, a, scale, L, pose, ph, who = null) {
  if (!IM || IM.torso.n >= MAXP) return;
  const down = pose === 'down', me = L === PLAYER_LOOK, gun = me && pose !== 'sit' && pose !== 'down' ? playerGun.kind : null;
  const meshy = me && PLAYER_MODEL && pose !== 'sit';
  let gt = null;
  if (who && !down && pose !== 'sit') { gt = gaitOf(who, x, y, a, scale, meshy ? LEG_MESHY : LEG_PIECE, gun && playerGun.aim); if (pose === 'punch') gt.punch = ph; a = gt.yaw; }
  else if (who) gaits.delete(who);
  e.set(0, -a, down ? Math.PI / 2 : 0, 'YXZ'); q.setFromEuler(e);
  B.compose(v.set(x, down ? z + 0.14 * scale : z, y), q, s3.set(scale, scale, scale));
  const P = poseAngles(pose, ph, gun, gun && playerGun.aim, playerGun.kick, gt);
  const { hipA, hipB, kneeA, kneeB, shA, shB, elA, elB, lean, bob, sideR, shR, shYA, shYB } = P;
  if (meshy) { posePlayer(B, pose, P, gun); return; }
  // corpo (quadril pra cima): balanço, torção do peito e inclinação
  body.multiplyMatrices(B, J.makeTranslation(0, bob, 0)).multiply(R.makeTranslation(0, 0.56, 0)).multiply(M.makeRotationY(P.twT)).multiply(rotZ(lean)).multiply(M.makeTranslation(0, -0.56, 0));
  // quadril: gira um pouco pro lado da perna que vai à frente (as pernas saem dele)
  const legBase = pose === 'sit' ? body : tmpB.multiplyMatrices(B, J.makeTranslation(0, bob, 0)).multiply(M.makeRotationY(P.twP));
  const skin = L.skin;
  put('pelvis', legBase, L.pants); put('torso', body, L.top); put('head', body, skin);
  put('stripe', L.stripe ? body : ZERO, L.stripe || skin);
  const hel = L.helmet; // de capacete não aparece cabelo nem boné
  put('hair', L.cap || hel ? ZERO : body, L.hair); put('cap', L.cap && !hel ? body : ZERO, L.cap || skin); put('long', L.long && !hel ? body : ZERO, L.hair);
  put('helmet', hel ? body : ZERO, hel || skin); put('visor', hel ? body : ZERO, col('#16181c'));
  // pernas: do quadril (no corpo sem inclinação, pra não "sentar" ao correr)
  for (const [zz, ha, ka, fa, hb] of [[sideR * 0.62, hipA, kneeA, P.footA, P.hbA], [-sideR * 0.62, hipB, kneeB, P.footB, P.hbB]]) {
    joint(tmpA, legBase, 0, 0.56, zz, ha, hb); put('thigh', tmpA, L.pants);
    joint(M, tmpA, 0, -0.26, 0, ka); put('shin', M, L.shins);
    joint(tmpA, M, 0, -0.25, 0, fa); put('foot', tmpA, L.feet);
  }
  // braços: do ombro, abertos um pouco pro lado
  for (const [zz, sa, ea, open, yw] of [[0.2, shA, elA, -0.08 - shR, shYA], [-0.2, shB, elB, 0.08, shYB]]) {
    joint(tmpA, body, 0, 0.94, zz, sa, open, yw); put('upper', tmpA, L.arms);
    joint(M, tmpA, 0, -0.22, 0, ea); put('fore', M, skin);
    if (gun && zz > 0) placeGun(gun, gm.multiplyMatrices(M, J.makeTranslation(0, -0.21, 0)).multiply(gunInArm(GM2, open, yw, sa, ea, 0, P.gunE)));
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
function limbRot(out, a, b, open, c = 0) { e.set(b, c, a, 'XYZ'); out.setFromEuler(e); return out.multiply(qb.setFromAxisAngle(XA, -open)); }
// junta filha no mesmo membro: Rx(abre)·Rz(a)·Rx(-abre)
function childRot(out, a, open) { out.setFromAxisAngle(XA, open); e.set(0, 0, a); out.multiply(qa.setFromEuler(e)); return out.multiply(qb.setFromAxisAngle(XA, -open)); }
function posePlayer(Bm, pose, g, gun) {
  let pm = playerMeshes.get(IM);
  if (!pm) { const sc = sceneOf.get(IM); if (!sc) return; pm = makePlayerMesh(sc); playerMeshes.set(IM, pm); }
  const bn = pm.bones; pm.mesh.visible = true;
  // raiz = quadril (gira um pouco com a passada); corpo = peito (torce pro outro lado e inclina)
  m4.multiplyMatrices(Bm, J.makeTranslation(0, g.bob, 0)).multiply(M.makeRotationY(g.twP)); m4.decompose(bn[0].position, bn[0].quaternion, bn[0].scale);
  e.set(0, g.twT - g.twP, g.lean, 'YXZ'); bn[1].quaternion.setFromEuler(e);
  const legs = [[g.hipA, g.kneeA, g.footA, g.hbA], [g.hipB, g.kneeB, g.footB, g.hbB]];
  for (const s of [0, 1]) {
    const sg = s ? -1 : 1, L = 2 + s * 3, A = 8 + s * 2, lo = -sg * LEG_OPEN, ao = -sg * ARM_OPEN;
    const [ha, ka, fa, hb] = legs[s];
    limbRot(bn[L].quaternion, ha, hb, lo); childRot(bn[L + 1].quaternion, ka, lo);
    childRot(bn[L + 2].quaternion, fa, lo);
    const sa = s ? g.shB : g.shA, ea = s ? g.elB : g.elA, op = s ? 0.08 : -0.08 - g.shR;
    limbRot(bn[A].quaternion, sa, op, ao, s ? g.shYB : g.shYA); childRot(bn[A + 1].quaternion, ea, ao);
  }
  if (gun) {
    // arma na mão direita (+Z): presa no antebraço, na altura do pulso, alinhada com o braço "desaberto"
    bn[0].updateMatrixWorld(true);
    placeGun(gun, gm.multiplyMatrices(bn[9].matrixWorld, WRIST).multiply(gunInArm(GM2, -0.08 - g.shR, g.shYA, g.shA, g.elA, -ARM_OPEN, g.gunE)));
  }
}

// ---------- armas na mão (feitas por código, poucas caixas) ----------
// Origem = mão (cabo), cano pra +X, em cima +Y. Tamanho em unidades do boneco (escala 1 ≈ 1,1 de altura ≈ 1,8 m).
const gunsOf = new WeakMap();
const gm = new THREE.Matrix4();
const GM2 = new THREE.Matrix4(), GA = new THREE.Matrix4(), GB = new THREE.Matrix4();
// pulso do protagonista no osso do antebraço (um pouco além, na palma)
const WRIST = new THREE.Matrix4().makeTranslation(0.032 * 1.12, -0.114 * 1.12, 0.063 * 1.12);
// rotação da arma no antebraço. O braço todo gira E = Euler(b, c, ombro) e depois Rz(cotovelo) (no protagonista ainda
// tem a A-pose desfeita: Rx(-abre) no fim). gunE = rotação desejada da arma no corpo (null: segue a mão, cano ao longo do
// braço e cabo pra trás). Com gunE a arma fica reta pro alvo não importa como o braço dobrou.
function gunInArm(out, b, c, sa, ea, ao, gunE) {
  out.makeRotationX(ao);
  if (!gunE) return out.multiply(GA.makeRotationZ(-Math.PI / 2));
  e.set(b, c, sa, 'XYZ'); GA.makeRotationFromEuler(e).multiply(GB.makeRotationZ(ea)).invert();
  e.set(gunE[0], gunE[1], gunE[2], 'XYZ'); GB.makeRotationFromEuler(e);
  return out.multiply(GA).multiply(GB);
}
// Lambert no básico; na alta/realista vira PBR com esses valores (realista.js)
const gunMats = {};
function gunMat(hex, r, m) { let k = gunMats[hex]; if (!k) { k = gunMats[hex] = new THREE.MeshLambertMaterial({ color: hex }); k.userData.pbr = { r, m }; } return k; }
function gunGroup(kind) {
  const g = new THREE.Group(), box = (sx, sy, sz, x, y, z, c, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), c); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); };
  const metal = gunMat('#34353a', 0.4, 0.6), dark = gunMat('#18191c', 0.7, 0.2), wood = gunMat('#6b4426', 0.8, 0);
  if (kind === 'pistola') {           // revólver/pistola ~20 cm
    box(0.15, 0.045, 0.03, 0.045, 0.045, 0, metal); box(0.035, 0.085, 0.028, -0.005, -0.005, 0, dark, 0.25);
  } else if (kind === 'escopeta') {   // escopeta ~1 m: cano comprido, telha de madeira e coronha
    box(0.4, 0.035, 0.03, 0.2, 0.05, 0, metal); box(0.14, 0.04, 0.04, 0.24, 0.02, 0, wood);
    box(0.13, 0.05, 0.035, 0.0, 0.03, 0, metal); box(0.035, 0.07, 0.028, -0.01, -0.01, 0, wood, 0.3);
    box(0.2, 0.06, 0.035, -0.15, 0.015, 0, wood, 0.12);
  } else {                            // submetralhadora ~60 cm: corpo, cano curto, carregador e coronha de arame
    box(0.2, 0.06, 0.035, 0.05, 0.04, 0, metal); box(0.09, 0.022, 0.022, 0.19, 0.05, 0, dark);
    box(0.03, 0.08, 0.026, 0.0, -0.01, 0, dark, 0.2); box(0.028, 0.1, 0.024, 0.08, -0.03, 0, dark, -0.1);
    box(0.14, 0.018, 0.02, -0.11, 0.045, 0, dark);
  }
  g.matrixAutoUpdate = false; g.visible = false;
  return g;
}
function placeGun(kind, mat) {
  let gs = gunsOf.get(IM); if (!gs) { gs = {}; gunsOf.set(IM, gs); }
  let g = gs[kind];
  if (!g) { const sc = sceneOf.get(IM); if (!sc) return; g = gs[kind] = gunGroup(kind); sc.add(g); }
  g.matrix.copy(mat); g.matrixWorldNeedsUpdate = true; g.visible = true;
}
