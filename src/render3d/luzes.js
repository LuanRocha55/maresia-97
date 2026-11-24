// Luzes de verdade na cidade (1.12): postes, faróis, sirene, neon e fogo iluminam o chão, as paredes,
// os carros e as pessoas, e aparecem no reflexo da lataria e dos vidros.
// A cidade tem centenas de postes: só os mais perto da câmera ganham uma luz. Cada luz é uma "vaga" fixa
// (a quantidade nunca muda durante o jogo, senão a placa de vídeo recompila tudo e o jogo engasga);
// quando a vaga troca de poste ela apaga devagar e acende no novo, sem piscar.
import * as THREE from '../../vendor/three/three.module.min.js';
import { lamps } from '../world/map.js';
import { S, player } from '../core/state.js';
import { heatStars } from '../game/world.js';
import { U } from './build.js';

// quantas luzes de cada tipo por qualidade (0 leve, 1 média, 2 alta, 3 realista)
const COUNT = [
  { lamp: 0, car: 0, neon: 0, siren: 0, fire: 0 },
  { lamp: 5, car: 1, neon: 0, siren: 1, fire: 1 },
  { lamp: 6, car: 2, neon: 2, siren: 1, fire: 1 },
  { lamp: 12, car: 4, neon: 4, siren: 1, fire: 1 },
];
const SODIO = new THREE.Color('#ffa64d'), FAROL = new THREE.Color('#fff1d6'), FOGO = new THREE.Color('#ff9a3c');
const SIR_R = new THREE.Color('#ff2a2a'), SIR_B = new THREE.Color('#2a5cff');

let scene = null, q = -1, signs = [];
const slots = { lamp: [], car: [], neon: [], siren: [], fire: [] };

// signs: [{x,y,z,col}] posição dos letreiros (em unidades 3D) e a cor do neon
export function initLights(sc, neonSigns) { scene = sc; signs = neonSigns || []; }

function point(color, dist) {
  const l = new THREE.PointLight(color, 0, dist, 2); l.castShadow = false; scene.add(l); return l;
}
function spot() {
  const l = new THREE.SpotLight(FAROL, 0, 22, 0.55, 0.6, 1.6); l.castShadow = false;
  scene.add(l); scene.add(l.target); return l;
}
// cria/remove as vagas pra qualidade nova (só quando troca a qualidade)
export function setLightQuality(nq) {
  if (!scene || nq === q) return; q = nq;
  for (const k in slots) { for (const s of slots[k]) { scene.remove(s.l); if (s.l.target) scene.remove(s.l.target); s.l.dispose(); } slots[k] = []; }
  const c = COUNT[q];
  for (let i = 0; i < c.lamp; i++) slots.lamp.push({ l: point(SODIO, 11), id: -1, f: 0 });
  for (let i = 0; i < c.car; i++) slots.car.push({ l: spot(), id: null, f: 0 });
  for (let i = 0; i < c.neon; i++) slots.neon.push({ l: point('#ffffff', 10), id: -1, f: 0 });
  for (let i = 0; i < c.siren; i++) slots.siren.push({ l: point(SIR_R, 12), id: null, f: 0 });
  for (let i = 0; i < c.fire; i++) slots.fire.push({ l: point(FOGO, 14), id: null, f: 0 });
}

// Distribui os alvos (os mais perto primeiro) nas vagas: quem continua desejado fica; vaga livre apaga
// até zero e só então pega um alvo novo (troca suave).
function assign(list, wanted, dt, speed) {
  const want = new Set(wanted);
  const held = new Set(list.map(s => s.id));
  const fresh = wanted.filter(w => !held.has(w));
  for (const s of list) {
    const keep = s.id !== -1 && s.id !== null && want.has(s.id);
    if (!keep) {
      if (s.f > 0.01) { s.f = Math.max(0, s.f - dt * speed); continue; }
      s.f = 0; s.id = fresh.length ? fresh.shift() : -1;
    }
    if (s.id !== -1 && s.id !== null) s.f = Math.min(1, s.f + dt * speed);
  }
}
const nearest = (arr, n, cx, cz, maxD, pos) => {
  const out = [];
  for (let i = 0; i < arr.length; i++) { const p = pos(arr[i]); if (!p) continue; const d = (p.x - cx) ** 2 + (p.z - cz) ** 2; if (d < maxD * maxD) out.push([d, i]); }
  out.sort((a, b) => a[0] - b[0]); return out.slice(0, n).map(o => o[1]);
};

let tick = 0, lampWant = [], neonWant = [];
const _f = new THREE.Vector3();
// cx,cz: centro da área vista. dk: escuridão (0 dia, 1 noite). Chamado todo quadro.
export function updateLights(cx, cz, dk, dt) {
  if (!scene || q <= 0) return;
  const night = THREE.MathUtils.smoothstep(dk, 0.15, 0.7);
  // ---- postes: luz de sódio alaranjada ----
  if (tick++ % 12 === 0) {
    lampWant = night > 0 ? nearest(lamps, slots.lamp.length, cx, cz, 34, l => ({ x: l.x * U, z: l.y * U })) : [];
    neonWant = night > 0 ? nearest(signs, slots.neon.length, cx, cz, 34, s => s) : [];
  }
  assign(slots.lamp, lampWant, dt, 2.5);
  for (const s of slots.lamp) {
    if (s.id < 0) { s.l.intensity = 0; continue; }
    const L = lamps[s.id], A = L.arm; s.l.position.set(L.x * U + (A ? A.x : 0), 2.6, L.y * U + (A ? A.z : 0)); s.l.intensity = 9 * night * s.f;
  }
  // ---- neon dos comércios: pinta a fachada e a calçada com a cor do letreiro ----
  assign(slots.neon, neonWant, dt, 2.5);
  for (const s of slots.neon) {
    if (s.id < 0) { s.l.intensity = 0; continue; }
    const N = signs[s.id]; s.l.position.set(N.x + (N.nx ?? 0) * 0.9, N.y, N.z + (N.nz ?? 1) * 0.9); s.l.color.copy(N.col);
    s.l.intensity = 7 * night * s.f * (N.on ? N.on() : 1);
  }
  // ---- faróis: o carro do jogador primeiro, depois os carros com motorista mais perto ----
  const cars = S.cars.filter(c => c.driver && !c.wreck);
  let carWant = [];
  if (dk > 0.05 && slots.car.length) {
    const pc = player.car && !player.car.wreck ? player.car : null;
    const rest = nearest(cars, slots.car.length, cx, cz, 26, c => c === pc ? null : { x: c.x * U, z: c.y * U }).map(i => cars[i]);
    carWant = pc ? [pc, ...rest].slice(0, slots.car.length) : rest;
  }
  assign(slots.car, carWant, dt, 4);
  const carNight = THREE.MathUtils.smoothstep(dk, 0.05, 0.5);
  for (const s of slots.car) {
    const c = s.id;
    if (!c || c === -1 || S.cars.indexOf(c) < 0) { s.l.intensity = 0; if (c && c !== -1 && S.cars.indexOf(c) < 0) s.id = -1; continue; }
    const fx = Math.cos(c.a), fz = Math.sin(c.a), half = (c.t && c.t.len ? c.t.len : 40) * U / 2;
    s.l.position.set(c.x * U + fx * half, 0.75, c.y * U + fz * half);
    s.l.target.position.set(c.x * U + fx * (half + 9), 0, c.y * U + fz * (half + 9));
    s.l.target.updateMatrixWorld();
    s.l.intensity = (c === player.car ? 60 : 42) * carNight * s.f;
  }
  // ---- sirene: a viatura perseguindo mais perto pisca vermelho/azul nas paredes e nos carros ----
  if (slots.siren.length) {
    let sw = [];
    if (heatStars() > 0) sw = nearest(S.cars, 1, cx, cz, 30, c => (c.ai === 'police' || c.ai === 'block') && !c.wreck ? { x: c.x * U, z: c.y * U } : null).map(i => S.cars[i]);
    assign(slots.siren, sw, dt, 5);
    for (const s of slots.siren) {
      const c = s.id;
      if (!c || c === -1 || S.cars.indexOf(c) < 0) { s.l.intensity = 0; continue; }
      const f = Math.floor(S.gameTime * 8) % 2;
      s.l.color.copy(f ? SIR_R : SIR_B); s.l.position.set(c.x * U, 1.6, c.y * U);
      s.l.intensity = (4 + 14 * dk) * s.f;
    }
  }
  // ---- fogo: explosão, carro pegando fogo, tiro. Uma luz no meio das chamas, tremendo ----
  if (slots.fire.length) {
    let n = 0, x = 0, z = 0, flash = 0;
    for (const p of S.parts) {
      if (!p.fire) continue; const px = p.x * U, pz = p.y * U;
      if ((px - cx) ** 2 + (pz - cz) ** 2 > 30 * 30) continue;
      const w = (p.flash ? 3 : 1) * Math.max(0, p.life / (p.max || 1)); n += w; x += px * w; z += pz * w; if (p.flash) flash = 1;
    }
    const s = slots.fire[0];
    if (n > 0.05) {
      s.l.position.set(x / n, 1.2, z / n);
      const k = Math.min(1, n / 12), flick = 0.8 + 0.4 * Math.sin(S.gameTime * 37) * Math.sin(S.gameTime * 23);
      s.l.intensity = (flash ? 10 : 0) + 40 * k * flick * (0.4 + 0.6 * dk);
    } else s.l.intensity = 0;
  }
}
// quanto os "carpetes" de luz pintados no chão embaixo dos postes devem sobrar (a luz de verdade já ilumina)
export const lightsOn = () => q > 0;
