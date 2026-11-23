// Veículos de 1997 feitos por código, com a cara do Rio da época (formas e nomes inventados, sem marcas reais):
// viatura (sedã de três volumes branco com portas azul-marinho) e lotação (van alta de nariz curto, branca com faixas).
// Carroceria = perfil lateral arredondado e extrudado com chanfro, pra ficar "polido" sem quina viva.
// Unidade: a do 3D (1 = 1 tile). X = comprimento (frente em +X), Y = altura, Z = largura (+Z = lado direito).
import * as THREE from '../../vendor/three/three.module.min.js';

// ---------- utilidades de geometria ----------
function mergeColored(list) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const [geo, hex] of list) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal; c.set(hex);
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); out.computeBoundingSphere(); return out;
}
// polígono com cantos arredondados (raio por canto)
function roundedShape(pts, r) {
  const s = new THREE.Shape(), n = pts.length, at = i => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const p = at(i), a = at(i - 1), b = at(i + 1), rr = Array.isArray(r) ? r[i] : r;
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]), k = Math.min(rr, da * 0.45, db * 0.45);
    const p1 = [p[0] + (a[0] - p[0]) / da * k, p[1] + (a[1] - p[1]) / da * k], p2 = [p[0] + (b[0] - p[0]) / db * k, p[1] + (b[1] - p[1]) / db * k];
    if (i === 0) s.moveTo(p1[0], p1[1]); else s.lineTo(p1[0], p1[1]);
    s.quadraticCurveTo(p[0], p[1], p2[0], p2[1]);
  }
  s.closePath(); return s;
}
// perfil lateral -> sólido com laterais chanfradas
function extrude(pts, width, r, bevel = 0.035) {
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, r), { depth: Math.max(0.01, width - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(width - 2 * bevel) / 2); return g;
}
const box = (sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; };
const cyl = (r, h, x, y, z, axis, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g; };
// placa plana vertical no plano z (lado de fora pra +z ou -z)
function sidePoly(pts, z) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))));
  if (z < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setZ(i, -1); }
  g.translate(0, 0, z); return g;
}
// quadrilátero com as duas faces
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c], 3));
  g.computeVertexNormals(); return g;
}

// ---------- materiais ----------
const paintMat = new THREE.MeshLambertMaterial({ vertexColors: true }); paintMat.userData.pbr = { car: true }; // lataria com verniz no realista
const partMat = new THREE.MeshLambertMaterial({ vertexColors: true }); partMat.userData.pbr = { r: 0.5, m: 0.2 };
const tireMat = new THREE.MeshLambertMaterial({ vertexColors: true }); tireMat.userData.pbr = { r: 0.9 };
// letreiro pintado numa textura pequena (letras grossas, cor sólida)
function labelMat(text, fg, bg, w = 256, h = 64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = 'bold ' + Math.round(h * 0.72) + 'px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h * 0.54, w * 0.92);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: t, transparent: !bg, alphaTest: bg ? 0 : 0.4 }); m.userData.pbr = { r: 0.6 }; return m;
}
let LBL = null;
const labels = () => LBL || (LBL = { pol: labelMat('POLÍCIA', '#f4f4f0', null, 256, 48), centro: labelMat('CENTRO', '#1a1a1a', '#f3d34a', 256, 72) });

// ---------- cores ----------
const BUMPER = '#4a4c52', GLASS = '#22303b', GLASS2 = '#355063', TIRE = '#151515', HUB = '#c4c7ca', PLASTIC = '#26272b', GRILLE = '#17181b', CHROME = '#d5d8da';

// rodas: cada uma num grupo próprio, virado pra que girar em X role a roda pra frente (ver syncCars)
function wheels(root, list, r, w) {
  const tire = mergeColored([[cyl(r, w, 0, 0, 0, 'x', 14), TIRE], [cyl(r * 0.56, w + 0.014, 0, 0, 0, 'x', 10), HUB], [cyl(r * 0.2, w + 0.02, 0, 0, 0, 'x', 8), '#8a8d90']]);
  const out = [];
  for (const [x, z] of list) { const p = new THREE.Group(); p.position.set(x, r, z); p.rotation.y = Math.PI / 2; const m = new THREE.Mesh(tire, tireMat); m.castShadow = true; p.add(m); root.add(p); out.push(p); }
  return out;
}
// vidros laterais de uma cabine com colunas inclinadas (r0..r1 atrás, f0..f1 na frente, de y1 até roof)
function cabinGlass(D, r0, r1, f0, f1, y1, roof, cw, posts) {
  const hc = roof - y1, z = cw / 2 + 0.006, top = roof - 0.035, bot = y1 + 0.03, lx = (a, b, t) => a + (b - a) * t;
  const side = [[lx(r0, r1, (bot - y1) / hc) + 0.03, bot], [lx(f0, f1, (bot - y1) / hc) - 0.03, bot], [lx(f0, f1, (top - y1) / hc) - 0.03, top], [lx(r0, r1, (top - y1) / hc) + 0.03, top]];
  for (const zz of [z, -z]) D.push([sidePoly(side, zz), GLASS]);
  for (const t of posts) { const x = side[0][0] + (side[1][0] - side[0][0]) * t; for (const zz of [z + 0.002, -z - 0.002]) D.push([box(0.035, top - bot + 0.01, 0.004, x, (top + bot) / 2, zz), '#1a1a1a']); }
  const wz = cw / 2 - 0.03, off = 0.012;
  const nf = [f1 - f0, roof - y1], nl = Math.hypot(nf[0], nf[1]), ox = nf[1] / nl * off, oy = -nf[0] / nl * off; // para-brisa
  D.push([quad([f0 + ox, y1 + 0.025 + oy, -wz], [f0 + ox, y1 + 0.025 + oy, wz], [f1 + ox, roof - 0.025 + oy, wz], [f1 + ox, roof - 0.025 + oy, -wz]), GLASS2]);
  const nr = [r1 - r0, roof - y1], rl = Math.hypot(nr[0], nr[1]), rx = -nr[1] / rl * off, ry = nr[0] / rl * off;   // vidro de trás
  D.push([quad([r0 + rx, y1 + 0.03 + ry, wz], [r0 + rx, y1 + 0.03 + ry, -wz], [r1 + rx, roof - 0.03 + ry, -wz], [r1 + rx, roof - 0.03 + ry, wz]), GLASS]);
}

// ---------- viatura: sedã de três volumes, branco, portas azul-marinho, giroflex em barra ----------
function viatura(L, W) {
  const root = new THREE.Group(), x = f => f * L;
  const g = 0.1, y1 = g + 0.25, roof = y1 + 0.2;
  const prof = [[x(-0.5), g], [x(0.5), g], [x(0.5), g + 0.17], [x(0.5) - 0.07, y1], [x(-0.5) + 0.05, y1], [x(-0.5), g + 0.2]];
  const B = [[extrude(prof, W, [0.05, 0.05, 0.06, 0.08, 0.08, 0.06]), '#f2f1ec']];
  const r0 = x(-0.27), r1 = x(-0.17), f1 = x(0.11), f0 = x(0.25), cw = W * 0.86;
  B.push([extrude([[r0, y1 - 0.01], [f0, y1 - 0.01], [f1, roof], [r1, roof]], cw, [0.02, 0.02, 0.05, 0.05], 0.03), '#f2f1ec']);
  const D = [];
  cabinGlass(D, r0, r1, f0, f1, y1, roof, cw, [0.48]);
  // pintura: portas azul-marinho, frisos, emblema dourado e o giroflex em barra no teto
  const zs = W / 2 + 0.008;
  for (const s of [1, -1]) {
    D.push([sidePoly([[x(-0.24), g + 0.04], [x(0.22), g + 0.04], [x(0.22), y1 - 0.025], [x(-0.24), y1 - 0.025]], s * zs), '#1b2850']);
    D.push([box(x(0.9), 0.018, 0.004, 0, y1 - 0.02, s * (zs + 0.001)), '#c9a227']);                      // friso dourado
    D.push([box(0.004, y1 - g - 0.1, 0.004, x(-0.01), (g + y1) / 2, s * (zs + 0.002)), '#0e1530']);      // vão entre as portas
    D.push([box(0.035, 0.012, 0.004, x(0.15), g + 0.2, s * (zs + 0.002)), CHROME], [box(0.035, 0.012, 0.004, x(-0.15), g + 0.2, s * (zs + 0.002)), CHROME]); // maçanetas
    D.push([box(0.05, 0.04, 0.03, f0 - 0.03, y1 + 0.03, s * (cw / 2 + 0.03)), PLASTIC]);                 // retrovisor
  }
  D.push([box(0.2, 0.035, W * 0.7, x(-0.05), roof + 0.018, 0), '#1c1c1f'], [box(0.04, 0.01, W * 0.72, x(-0.05), roof + 0.04, 0), CHROME]); // base do giroflex
  D.push([box(0.045, 0.055, W * 0.98, L / 2 + 0.012, g + 0.045, 0), BUMPER], [box(0.045, 0.055, W * 0.98, -L / 2 - 0.012, g + 0.045, 0), BUMPER]); // para-choques
  D.push([box(0.016, 0.06, W * 0.34, L / 2 + 0.004, g + 0.12, 0), GRILLE], [box(0.012, 0.035, 0.12, -L / 2 - 0.006, g + 0.1, 0), '#e9e4c8']); // grade e placa
  for (const s of [1, -1]) D.push([box(0.014, 0.06, 0.13, L / 2 + 0.004, g + 0.12, s * W * 0.34), '#f6f2d8'], [box(0.014, 0.06, 0.12, -L / 2 - 0.004, g + 0.15, s * W * 0.34), '#8a1a1a']);
  root.add(mesh(mergeColored(B), paintMat), mesh(mergeColored(D), partMat));
  // POLÍCIA nas portas (letreiro genérico, sem brasão de corporação real)
  const lw = x(0.4), lh = lw * 0.19, lbl = new THREE.PlaneGeometry(lw, lh);
  for (const s of [1, -1]) { const m = new THREE.Mesh(lbl, labels().pol); m.position.set(x(-0.01), g + 0.13, s * (zs + 0.004)); if (s < 0) m.rotation.y = Math.PI; root.add(m); }
  const wr = 0.12, wl = wheels(root, [[x(0.33), W / 2 - 0.05], [x(0.33), -W / 2 + 0.05], [x(-0.32), W / 2 - 0.05], [x(-0.32), -W / 2 + 0.05]], wr, 0.1);
  return { root, wheels: wl, top: roof + 0.04, radius: wr };
}

// ---------- lotação: van alta de nariz curto, branca com faixas verde e amarela, bagageiro e placa de destino ----------
function lotacao(L, W) {
  const root = new THREE.Group(), x = f => f * L;
  const g = 0.11, roof = g + 0.66, belt = g + 0.33;
  const prof = [[x(-0.5), g], [x(0.5), g], [x(0.5), g + 0.24], [x(0.5) - 0.24, roof], [x(-0.5), roof]];
  const B = [[extrude(prof, W, [0.05, 0.05, 0.1, 0.12, 0.08], 0.04), '#f2f0e8']];
  const D = [], zs = W / 2 + 0.006, fx = x(0.5);
  // janelas de passageiro (fileira) e a do motorista
  for (const s of [1, -1]) {
    const n = 4, a = x(-0.44), b = x(0.12), w = (b - a) / n;
    for (let k = 0; k < n; k++) D.push([sidePoly([[a + k * w + 0.02, belt + 0.06], [a + (k + 1) * w - 0.02, belt + 0.06], [a + (k + 1) * w - 0.02, roof - 0.07], [a + k * w + 0.02, roof - 0.07]], s * zs), GLASS]);
    D.push([sidePoly([[x(0.16), belt + 0.06], [fx - 0.2, belt + 0.06], [fx - 0.3, roof - 0.07], [x(0.16), roof - 0.07]], s * zs), GLASS]);
    const sa = x(-0.48), sb = fx - 0.16, sl = sb - sa, sc = (sa + sb) / 2;
    D.push([box(sl, 0.035, 0.004, sc, belt - 0.03, s * (zs + 0.001)), '#2e8b3a'], [box(sl, 0.022, 0.004, sc, belt - 0.07, s * (zs + 0.001)), '#f0c419']); // faixas
    D.push([box(x(0.92), 0.05, 0.004, 0, g + 0.04, s * (zs + 0.001)), '#3a3b3f']);                                                     // saia de borracha
    D.push([box(0.05, 0.05, 0.03, fx - 0.2, belt + 0.06, s * (W / 2 + 0.03)), PLASTIC]);                                                // retrovisor
  }
  // porta corrediça no lado direito (+Z): vãos e o trilho
  const zr = zs + 0.002;
  D.push([box(0.006, roof - g - 0.12, 0.004, x(-0.08), (g + roof) / 2 - 0.02, zr), '#9a9890'], [box(0.006, roof - g - 0.12, 0.004, x(0.13), (g + roof) / 2 - 0.02, zr), '#9a9890']);
  D.push([box(x(0.32), 0.012, 0.006, x(-0.1), belt + 0.02, zr), '#77756e'], [box(0.04, 0.012, 0.006, x(0.1), g + 0.2, zr + 0.002), CHROME]);
  // para-brisa grande, inclinado
  const wz = W / 2 - 0.04, ys = g + 0.27, n0 = [-(0.24), roof - g - 0.24], nl = Math.hypot(n0[0], n0[1]), ox = n0[1] / nl * 0.012, oy = 0.24 / nl * 0.012;
  D.push([quad([fx - 0.015 + ox, ys + oy, -wz], [fx - 0.015 + ox, ys + oy, wz], [fx - 0.22 + ox, roof - 0.04 + oy, wz], [fx - 0.22 + ox, roof - 0.04 + oy, -wz]), GLASS2]);
  // traseira: dois vidros, lanternas altas, estepe não (porta de trás reta)
  for (const s of [1, -1]) {
    const z0 = s * 0.02, z1 = s * (W * 0.4), rx = -L / 2 - 0.006;
    D.push([quad([rx, belt + 0.06, z0], [rx, belt + 0.06, z1], [rx, roof - 0.07, z1], [rx, roof - 0.07, z0]), GLASS]);
    D.push([box(0.014, 0.12, 0.07, -L / 2 - 0.006, g + 0.28, s * (W / 2 - 0.06)), '#8a1a1a'], [box(0.014, 0.07, 0.11, fx + 0.004, g + 0.15, s * W * 0.33), '#f6f2d8']);
  }
  D.push([box(0.016, 0.07, W * 0.4, fx + 0.004, g + 0.15, 0), GRILLE], [box(0.012, 0.035, 0.12, -L / 2 - 0.007, g + 0.14, 0), '#e9e4c8']);
  D.push([box(0.05, 0.06, W * 0.99, fx + 0.015, g + 0.045, 0), BUMPER], [box(0.05, 0.06, W * 0.99, -L / 2 - 0.015, g + 0.045, 0), BUMPER]);
  // bagageiro no teto
  const rk = '#3a3a3d', rx0 = x(-0.42), rx1 = x(0.22), ry = roof + 0.05;
  for (const s of [1, -1]) D.push([box(rx1 - rx0, 0.02, 0.02, (rx0 + rx1) / 2, ry, s * W * 0.42), rk]);
  for (let k = 0; k <= 4; k++) { const xx = rx0 + (rx1 - rx0) * k / 4; D.push([box(0.02, 0.02, W * 0.86, xx, ry, 0), rk]); for (const s of [1, -1]) D.push([box(0.02, 0.05, 0.02, xx, roof + 0.025, s * W * 0.42), rk]); }
  root.add(mesh(mergeColored(B), paintMat), mesh(mergeColored(D), partMat));
  // placa de destino atrás do para-brisa
  const sg = new THREE.PlaneGeometry(W * 0.42, W * 0.12), sm = new THREE.Mesh(sg, labels().centro);
  const t = 0.62; sm.position.set(fx - 0.015 - 0.205 * t + 0.012, ys + (roof - 0.04 - ys) * t, -W * 0.18); sm.rotation.set(0, Math.PI / 2, 0); sm.rotateX(-Math.atan2(0.207, roof - 0.04 - ys));
  root.add(sm);
  const wr = 0.13, wl = wheels(root, [[x(0.31), W / 2 - 0.05], [x(0.31), -W / 2 + 0.05], [x(-0.33), W / 2 - 0.05], [x(-0.33), -W / 2 + 0.05]], wr, 0.1);
  return { root, wheels: wl, top: roof + 0.06, radius: wr };
}

// ---------- moto: a "cento e vinte e cinco" de rua dos anos 90 (tanque e tampa lateral na cor, banco comprido preto,
// farol redondo, garfo e para-lamas cromados, rodas raiadas, escapamento do lado direito, bagageiro atrás) ----------
const motoPaint = new Map();
function motoPaintMat(hex) { let m = motoPaint.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.pbr = { car: true }; motoPaint.set(hex, m); } return m; }
function motoWheel(r, w) { // no referencial da roda: eixo em X (igual às rodas dos carros)
  const D = [];
  const tire = new THREE.TorusGeometry(r - w * 0.5, w * 0.5, 6, 18); tire.rotateY(Math.PI / 2); D.push([tire, TIRE]);
  const rim = new THREE.TorusGeometry(r - w * 1.05, w * 0.16, 4, 18); rim.rotateY(Math.PI / 2); D.push([rim, CHROME]);
  D.push([cyl(r * 0.16, w * 1.4, 0, 0, 0, 'x', 8), '#9a9da0']);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, rr = (r - w * 1.05) / 2, g = new THREE.BoxGeometry(0.004, r - w * 1.05, 0.004);
    g.translate(0, rr, 0); g.rotateX(a); g.translate((k % 2 ? 1 : -1) * w * 0.18, 0, 0); D.push([g, '#bfc3c6']); }
  return mergeColored(D);
}
function moto(L, W) {
  const root = new THREE.Group(), r = 0.115, fx = L * 0.36, rx = -L * 0.36;
  const D = [], P = [];
  // quadro, motor e escapamento
  const frame = (a, b, t = 0.014, c = '#1d1e21') => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), g = new THREE.CylinderGeometry(t, t, l, 6);
    g.rotateZ(-Math.atan2(dx, dy)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2] || 0); D.push([g, c]); };
  frame([0.2, 0.36], [-0.02, 0.14], 0.018); frame([0.2, 0.36], [-0.2, 0.3], 0.015); frame([-0.02, 0.14], [-0.2, 0.3], 0.013);
  for (const z of [0.045, -0.045]) frame([rx, r, z], [-0.04, 0.15, z], 0.011);                                               // balança
  for (const z of [0.04, -0.04]) frame([rx + 0.02, r + 0.02, z], [-0.17, 0.29, z], 0.012, CHROME);                           // amortecedores
  D.push([box(0.15, 0.09, 0.09, 0.03, 0.13, 0), '#3a3c40'], [box(0.07, 0.1, 0.075, 0.1, 0.2, 0), '#55585d']);               // motor e cilindro
  for (let k = 0; k < 4; k++) D.push([box(0.08, 0.008, 0.09, 0.1, 0.165 + k * 0.022, 0), '#8c9094']);                           // aletas
  D.push([cyl(0.04, 0.025, 0.02, 0.13, 0.05, 'z', 12), '#7d8185']);                                                             // tampa do motor
  const ex = new THREE.CylinderGeometry(0.018, 0.022, 0.42, 8); ex.rotateZ(Math.PI / 2 - 0.12); ex.translate(-0.13, 0.12, 0.07); D.push([ex, CHROME]);
  D.push([cyl(0.024, 0.06, -0.33, 0.145, 0.07, 'x', 8), '#2b2c2f']);                                                            // ponteira
  // tanque e tampa lateral (cor da moto)
  const tank = new THREE.SphereGeometry(0.1, 12, 8); tank.scale(1.15, 0.55, 0.62); tank.translate(0.1, 0.37, 0); P.push(tank);
  D.push([cyl(0.016, 0.012, 0.12, 0.42, 0, 'y', 8), CHROME]);                                                                   // tampa do tanque
  for (const z of [0.052, -0.052]) { const sc = new THREE.BoxGeometry(0.11, 0.075, 0.012); sc.translate(-0.08, 0.255, z); P.push(sc); }
  for (const z of [0.059, -0.059]) D.push([box(0.06, 0.012, 0.002, 0.1, 0.38, z * 0.95), '#f4f4f0']);                        // faixinha no tanque
  // banco comprido
  D.push([extrude([[-0.29, 0.28], [0.03, 0.28], [0.04, 0.31], [-0.03, 0.33], [-0.28, 0.33]], 0.1, 0.02, 0.012), '#141416']);
  // rabeta, lanterna, bagageiro e para-lama de trás
  D.push([box(0.1, 0.03, 0.08, -0.32, 0.29, 0), '#1d1e21'], [box(0.016, 0.035, 0.06, -0.375, 0.29, 0), '#9a1a1a']);
  for (const z of [0.04, -0.04]) D.push([box(0.12, 0.008, 0.008, -0.33, 0.345, z), CHROME]);
  for (let k = 0; k < 3; k++) D.push([box(0.008, 0.008, 0.08, -0.29 - k * 0.04, 0.345, 0), CHROME]);
  const rf = new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.06, 12, 1, true, Math.PI * 0.9, Math.PI * 0.6); rf.rotateX(Math.PI / 2); rf.translate(rx, r, 0); D.push([rf, CHROME]);
  // garfo, para-lama da frente, farol, painel, guidão e retrovisores
  for (const z of [0.038, -0.038]) frame([fx, r, z], [0.215, 0.43, z], 0.012, CHROME);
  const ff = new THREE.CylinderGeometry(r + 0.018, r + 0.018, 0.05, 12, 1, true, Math.PI * 0.45, Math.PI * 0.6); ff.rotateX(Math.PI / 2); ff.translate(fx, r, 0); D.push([ff, CHROME]);
  const hl = new THREE.SphereGeometry(0.045, 10, 6, 0, Math.PI); hl.rotateY(Math.PI / 2); hl.scale(0.7, 1, 1); hl.translate(0.245, 0.4, 0); D.push([hl, '#1d1e21']);
  D.push([cyl(0.038, 0.006, 0.247, 0.4, 0, 'x', 12), '#fff7d0']);
  for (const z of [0.03, -0.03]) D.push([cyl(0.015, 0.02, 0.2, 0.46, z, 'y', 8), '#2a2b2e']);                               // relógios
  const bar = new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6); bar.rotateX(Math.PI / 2); bar.translate(0.19, 0.47, 0); D.push([bar, CHROME]);
  for (const z of [0.115, -0.115]) { D.push([cyl(0.013, 0.045, 0.19, 0.47, z, 'z', 6), '#151515']); frame([0.2, 0.47, z * 0.75], [0.17, 0.55, z * 0.95], 0.004, CHROME);
    D.push([cyl(0.02, 0.008, 0.17, 0.555, z * 0.95, 'x', 10), '#2a2b2e']); }
  for (const z of [0.035, -0.035]) D.push([box(0.03, 0.006, 0.05, 0.0, 0.08, z * 2.2), '#222']);                             // pedaleiras
  root.add(mesh(mergeColored(D), partMat));
  const body = mesh(mergeColored(P.map(g => [g, '#ffffff'])), motoPaintMat('#e53935')); body.userData.paint = true; root.add(body);
  const wg = motoWheel(r, 0.035), wl = [];
  for (const x of [fx, rx]) { const p = new THREE.Group(); p.position.set(x, r, 0); p.rotation.y = Math.PI / 2; const m = new THREE.Mesh(wg, tireMat); m.castShadow = true; p.add(m); root.add(p); wl.push(p); }
  return { root, wheels: wl, top: 0.5, radius: r, paintMesh: true };
}

function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

const BUILD = { viatura, lotacao, moto };
const cache = new Map();
// mesmo formato do carModel() de models.js: { root, wheels, paint:[], top, radius, name }. Devolve null se o tipo não é daqui.
export function rioModel(type, L, W) {
  const f = BUILD[type]; if (!f) return null;
  const key = type + '|' + L + '|' + W; let P = cache.get(key); if (!P) { P = f(L, W); cache.set(key, P); }
  const root = P.root.clone(true), wl = [];
  root.traverse(o => { if (o.isGroup && o !== root && P.wheels.some(w => w.position.equals(o.position))) wl.push(o); });
  const out = { root, wheels: wl, paint: [], top: P.top, radius: P.radius, name: type };
  if (P.paintMesh) { const body = root.children.find(o => o.userData.paint) || null;
    out.repaint = hex => { if (body) body.material = motoPaintMat(hex); }; }
  return out;
}
