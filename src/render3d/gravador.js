// Gravador de desenho 2D (1.18): a camada de detalhes do chão (marcas de pneu, zonas, orelhão tocando...) é desenhada
// num canvas de 1024x1024 que vira textura. Mandar essa textura pra placa de vídeo custava vários ms por envio,
// e era feito a cada 2 quadros mesmo quando nada tinha mudado (o mais comum: rua sem nada pintado no chão).
// Agora o desenho é feito primeiro "de mentira": cada comando é anotado junto com uma impressão digital
// (um número que resume todos os comandos e valores). Se a impressão é igual à do último envio, o desenho
// seria idêntico pixel por pixel: não redesenha nem envia nada. Se mudou, repete os comandos no canvas de verdade.

// comandos que só pintam/montam o caminho: anotados e feitos depois, só se precisar
const DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'clearRect', 'drawImage',
  'beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'closePath', 'quadraticCurveTo',
  'bezierCurveTo', 'clip']);
// comandos que devolvem algo e não mudam o desenho: vão direto pro canvas de verdade
// comandos que deixam tinta (o resto só monta caminho ou limpa)
const PAINT = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);
const QUERY = new Set(['measureText', 'getTransform', 'getLineDash', 'isPointInPath', 'isPointInStroke', 'getImageData',
  'createPattern', 'getContextAttributes']);

const ids = new WeakMap(); let nextId = 1;
const idOf = o => { let i = ids.get(o); if (!i) { i = nextId++; ids.set(o, i); } return i; };

export function makeRecorder(real) {
  let ops = [], h = 0, grads = 0, painted = false;
  const mix = v => {
    if (typeof v === 'number') h = Math.imul(h ^ (Math.round(v * 256) | 0), 16777619) + 0x9e37 | 0;
    else if (typeof v === 'string') { for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); h = Math.imul(h ^ 0x55, 16777619); }
    else if (Array.isArray(v)) { mix(v.length); for (const x of v) mix(x); }
    else if (v && typeof v === 'object') mix(v.__g !== undefined ? 1e6 + v.__g : -idOf(v));
    else mix(v === undefined ? -7 : v === null ? -8 : v ? -9 : -10);
  };
  const unwrap = v => (v && v.__real) || v;
  // gradiente: cria o de verdade na hora e anota as cores (entram na impressão digital)
  const grad = kind => (...a) => {
    mix(kind); for (const x of a) mix(x);
    const g = real[kind](...a), w = { __real: g, __g: grads++, addColorStop(o, c) { mix(o); mix(c); g.addColorStop(o, c); } };
    return w;
  };
  const fns = {};
  const proxy = new Proxy(real, {
    get(t, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createConicGradient') return fns[k] || (fns[k] = grad(k));
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (fns[k]) return fns[k];
      if (QUERY.has(k)) return (fns[k] = (...a) => t[k](...a));
      const draw = DRAW.has(k);
      return (fns[k] = (...a) => {
        mix(k); for (const x of a) mix(x);
        const b = a.map(unwrap); ops.push(k, b); if (PAINT.has(k)) painted = true;
        if (!draw) t[k](...b); // save/restore/transformações/tracejado: valem já (pra medir texto e ler estado)
      });
    },
    set(t, k, v) { mix(k); mix(v); const r = unwrap(v); ops.push('=' + k, r); t[k] = r; return true; },
  });
  return {
    ctx: proxy,
    // começa a anotar (o estado do canvas de verdade volta ao fim, pra repetir do mesmo ponto)
    begin() { ops = []; h = 0x811c9dc5 | 0; grads = 0; painted = false; real.save(); },
    // algo foi pintado? (se não, o canvas fica todo transparente)
    get painted() { return painted; },
    // termina; devolve a impressão digital
    end() { real.restore(); return h; },
    // repete no canvas de verdade o que foi anotado
    replay() {
      real.save();
      for (let i = 0; i < ops.length; i += 2) { const k = ops[i], a = ops[i + 1]; if (k[0] === '=') real[k.slice(1)] = a; else real[k](...a); }
      real.restore();
    },
  };
}
