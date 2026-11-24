// Gráficos com reflexo: "3D alta" (qualidade 2) e "3D realista" (qualidade 3). A cidade continua com os mesmos modelos; o que muda é a luz:
//  - materiais com reflexo (PBR): lataria com verniz, vidro e mar refletindo o céu, asfalto fosco
//  - o céu da hora do dia vira um mapa de ambiente (ilumina e aparece nos reflexos, do sol do meio-dia à noite)
//  - sombras de borda suave
//  - texturas fotográficas (Poly Haven, CC0) no chão e nas paredes: grão e relevo por cima do desenho do jogo
//  - brilho (bloom) em neon, faróis e postes à noite, e tone mapping de cinema (ACES)
// A alta usa os materiais e o céu, sem bloom (renderPlain). Média e leve não passam por aqui: os materiais Lambert originais ficam guardados
// e voltam quando sai do realista.
import * as THREE from '../../vendor/three/three.module.min.js';
import { EffectComposer } from '../../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/addons/postprocessing/OutputPass.js';

// ---------- materiais: Lambert/Phong -> Standard (ou Physical com verniz, na lataria) ----------
// Quem cria o material pode marcar userData.pbr = { r: rugosidade, m: metal } ou { car: true },
// e tex: 'chao' ou 'parede' pra ganhar as texturas fotográficas.
const DEF = { r: 0.85, m: 0 };
const conv = new WeakMap(), live = new Set();
const COPY = ['map', 'vertexColors', 'transparent', 'opacity', 'alphaTest', 'depthWrite', 'depthTest', 'side', 'flatShading', 'fog', 'alphaMap', 'emissiveMap',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits'];
function toPBR(src) {
  if (!src || !(src.isMeshLambertMaterial || src.isMeshPhongMaterial)) return src;
  let m = conv.get(src); if (m) return m;
  const p = src.userData.pbr || DEF;
  m = p.car ? new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.06, roughness: 0.45, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ roughness: p.r ?? DEF.r, metalness: p.m ?? DEF.m });
  for (const k of COPY) m[k] = src[k];
  m.color.copy(src.color); m.emissive.copy(src.emissive); m.emissiveIntensity = src.emissiveIntensity;
  if (p.env !== undefined) m.envMapIntensity = p.env;
  // shader modificado (o mar): os mesmos trechos existem no shader PBR
  if (p.tex) { m.onBeforeCompile = TEX_SHADER[p.tex]; m.customProgramCacheKey = () => 'tex-' + p.tex; }
  else if (Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile')) { m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = () => 'pbr-' + src.uuid; }
  m.userData.src = src; conv.set(src, m); live.add(m);
  // os pedaços do chão são jogados fora quando ficam longe. Quem chama dispose() pode pegar o original ou a
  // cópia (a malha está com a cópia no realista): os dois vão embora juntos, senão acumulam pra sempre
  let gone = false;
  const drop = () => { if (gone) return; gone = true; live.delete(m); conv.delete(src); m.dispose(); src.dispose(); };
  src.addEventListener('dispose', drop); m.addEventListener('dispose', drop);
  return m;
}
const back = m => (m && m.userData && m.userData.src) || m;
function swap(o, f) {
  const cur = o.material;
  if (Array.isArray(cur)) { if (cur.some(x => f(x) !== x)) o.material = cur.map(f); }
  else { const n = f(cur); if (n !== cur) o.material = n; }
}
// troca todos os materiais da cena (o jogo pode ter trocado algum neste quadro: freio, carro queimado, repintura...)
export function swapScene(scene, on) {
  const f = on ? toPBR : back;
  scene.traverse(o => { if (o.material) swap(o, f); });
  // o que muda com a hora/eventos no material original passa pra cópia
  if (on) for (const m of live) { const s = m.userData.src; m.color.copy(s.color); m.emissiveIntensity = s.emissiveIntensity; m.opacity = s.opacity; m.visible = s.visible; }
}

// ---------- texturas fotográficas ----------
// Dois atlas 4 x 2 (cor e normal map) viram texturas em camadas (sampler2DArray). O desenho do jogo continua
// sendo a cor de base (faixas, cores dos bairros, marcas de pneu); a foto entra como variação de cor em volta
// da média dela (grão, rachaduras, juntas) e o normal map dá relevo, que pega a luz do sol baixo.
// Camadas: 0 asfalto, 1 calçada, 2 paralelepípedo, 3 areia, 4 grama, 5 terra, 6 reboco, 7 reserva.
const TEX_DIR = 'assets/textures/polyhaven/';
const LAYERS = 8, TS = 512;
// tamanho de uma repetição da foto em unidades do jogo (1 tile = 1 unidade, uns 3 m)
const SCALE = [1.6, 0.6, 0.65, 1.3, 0.7, 1.0, 1.0, 1.0];
const NORMAL = [1.0, 0.9, 1.3, 0.8, 0.8, 0.9, 1.4, 1.0];   // força do relevo
const TU = {
  uSurf: { value: null }, uMapSize: { value: new THREE.Vector2(1, 1) },
  uAlb: { value: null }, uNor: { value: null }, uMean: { value: Array.from({ length: LAYERS }, () => new THREE.Vector3(1, 1, 1)) },
  uScale: { value: SCALE }, uNk: { value: NORMAL }, uStr: { value: 0 },
};
// tipo de superfície por tile (surfaceMap em chunks.js) e carrega os atlas em segundo plano
export function initTextures(surf, w, h) {
  const st = new THREE.DataTexture(surf, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  st.magFilter = st.minFilter = THREE.NearestFilter; st.needsUpdate = true;
  TU.uSurf.value = st; TU.uMapSize.value.set(w, h);
  Promise.all(['chao_cor.jpg', 'chao_normal.jpg'].map(n => new THREE.ImageLoader().loadAsync(TEX_DIR + n)))
    .then(([cor, nor]) => {
      TU.uAlb.value = toArray(cor, TU.uMean.value); TU.uNor.value = toArray(nor);
      TU.uStr.value = 1; // até aqui o chão fica só com o desenho
    }).catch(e => console.warn('Texturas do realista:', e));
}
// atlas 4 x 2 -> textura em camadas (com a cor média de cada camada, se pedir)
function toArray(img, means) {
  const c = document.createElement('canvas'); c.width = TS * 4; c.height = TS * 2;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const data = new Uint8Array(TS * TS * 4 * LAYERS);
  for (let k = 0; k < LAYERS; k++) {
    const px = g.getImageData((k % 4) * TS, Math.floor(k / 4) * TS, TS, TS).data;
    data.set(px, k * TS * TS * 4);
    if (means) { let r = 0, gg = 0, b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
      const n = px.length / 4 * 255; means[k].set(r / n, gg / n, b / n); }
  }
  const t = new THREE.DataArrayTexture(data, TS, TS, LAYERS);
  t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true; return t;
}
const TEX_HEAD = `precision highp sampler2DArray;
uniform sampler2D uSurf;uniform vec2 uMapSize;uniform sampler2DArray uAlb,uNor;uniform vec3 uMean[8];uniform float uScale[8],uNk[8],uStr;
varying vec3 vGW;
// a foto repetida em grade dá listras (as rachaduras do asfalto se alinham): mistura com uma cópia
// girada e maior, que quebra a repetição
const mat2 RT2=mat2(.788,-.616,.616,.788);
vec2 uv2(vec2 uv){return RT2*uv*.43+vec2(.37,.71);}
// variação da foto em volta da média dela, meio dessaturada (a cor de verdade vem do desenho)
vec3 detailCol(vec2 uv,int li){
  vec3 d=(texture(uAlb,vec3(uv,float(li))).rgb+texture(uAlb,vec3(uv2(uv),float(li))).rgb)*.5/uMean[li];
  d=1.+(d-1.)*1.5; // a média de duas amostras tira contraste: devolve
  return max(mix(vec3(dot(d,vec3(.333))),d,.55),0.);}
vec3 detailNor(vec2 uv,int li){
  vec3 n=texture(uNor,vec3(uv,float(li))).rgb+texture(uNor,vec3(uv2(uv),float(li))).rgb-1.;n.xy*=uNk[li];return n;}
`;
const VERT = sh => { sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <begin_vertex>',
  '#include <begin_vertex>\nvec4 gw=vec4(transformed,1.);\n#ifdef USE_INSTANCING\ngw=instanceMatrix*gw;\n#endif\nvGW=(modelMatrix*gw).xyz;'); };
const TEX_SHADER = {
  // chão: a camada sai do tipo do tile embaixo do pixel
  chao: sh => { Object.assign(sh.uniforms, TU); VERT(sh);
    sh.fragmentShader = TEX_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lay=texture2D(uSurf,(floor(vGW.xz)+.5)/uMapSize).r*255.;
        float dk=lay<7.5?1.:(lay<15.5?.35:0.);int li=int(mod(lay,8.)+.5);
        vec2 duv=vGW.xz/uScale[li];
        diffuseColor.rgb*=mix(vec3(1.),detailCol(duv,li),uStr*dk);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if(uStr*dk>0.){vec3 tn=detailNor(duv,li);tn.xy*=dk;
          normal=normalize((viewMatrix*vec4(normalize(vec3(tn.x,tn.z,-tn.y)),0.)).xyz);}`); },
  // paredes: projeta a foto do reboco no plano da parede (os telhados ficam como estão)
  parede: sh => { Object.assign(sh.uniforms, TU); VERT(sh);
    sh.fragmentShader = TEX_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wn=normalize((vec4(vNormal,0.)*viewMatrix).xyz);float wall=uStr*step(abs(wn.y),.5);
        bool alongX=abs(wn.z)>abs(wn.x);
        vec2 wuv=vec2(alongX?vGW.x:vGW.z,vGW.y)/uScale[6];
        diffuseColor.rgb*=mix(vec3(1.),detailCol(wuv,6),wall);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if(wall>0.){vec3 tn=detailNor(wuv,6);
          vec3 T=alongX?vec3(sign(wn.z),0.,0.):vec3(0.,0.,-sign(wn.x));
          vec3 nw=normalize(T*tn.x+vec3(0.,1.,0.)*tn.y+wn*tn.z);
          normal=normalize((viewMatrix*vec4(nw,0.)).xyz);}`); },
};

// ---------- céu como mapa de ambiente ----------
let pmrem = null, envRT = null, envScene = null, envU = null, lastKey = '';
function makeEnvScene() {
  envU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: envU,
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 top,hor,bot,sunDir,sunCol;varying vec3 vDir;
      void main(){vec3 d=normalize(vDir);float h=d.y;
        vec3 c=h>0.?mix(hor,top,pow(h,0.55)):mix(hor,bot,pow(min(1.,-h*3.),0.5));
        float s=max(dot(d,sunDir),0.);c+=sunCol*(pow(s,900.)*12.+pow(s,32.)*0.06);
        gl_FragColor=vec4(c,1.);}` });
  envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
}
const _c = new THREE.Color();
// sky = cores da hora (bg, chão), sun = DirectionalLight.
// O céu muda um tiquinho quase todo quadro (a hora anda): refazer o mapa sempre custava ~4 ms por quadro.
// Agora refaz no máximo a cada ENV_MS, desenhando num cubo fixo e filtrando sempre no mesmo alvo
// (nada é alocado nem compilado de novo depois da primeira vez).
const ENV_MS = 1500;
let cubeRT = null, cubeCam = null, lastEnvT = -1e9;
export function updateEnv(renderer, scene, sky, sun) {
  if (!pmrem) {
    pmrem = new THREE.PMREMGenerator(renderer); makeEnvScene();
    cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  }
  if (envRT) scene.environment = envRT.texture;
  const now = performance.now();
  if (envRT && now - lastEnvT < ENV_MS) return;
  const dir = _v.copy(sun.position).sub(sun.target.position).normalize();
  const key = sky.bg.getHexString() + sun.color.getHexString() + sun.intensity.toFixed(2) + dir.x.toFixed(2) + dir.y.toFixed(2);
  if (key === lastKey && envRT) return;
  lastKey = key; lastEnvT = now;
  envU.hor.value.copy(sky.bg).lerp(_c.setRGB(1, 1, 1), 0.18);
  envU.top.value.copy(sky.bg).multiplyScalar(0.55);
  envU.bot.value.copy(sky.hg).multiplyScalar(0.45);
  envU.sunDir.value.copy(dir);
  envU.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
  // desenhar qualquer cena zera o "atualizar sombras" deste quadro: guarda e devolve
  const sh = renderer.shadowMap.needsUpdate;
  cubeCam.update(renderer, envScene);
  envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
  renderer.shadowMap.needsUpdate = sh;
  scene.environment = envRT.texture;
}
const _v = new THREE.Vector3();

// ---------- pós-processamento ----------
// (oclusão de ambiente em tela, GTAO, foi testada e saiu: apagava as sombras, manchava os letreiros
// e desenhava a cidade duas vezes por quadro)
let composer = null, bloom = null;
function makeComposer(renderer, scene, camera) {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.2, 0.5, 2);
  // Um único pixel inválido (NaN ou infinito, que a placa de vídeo às vezes solta num reflexo/farol
  // forte) entra no brilho e o desfoque espalha ele em retângulos pretos enormes na tela.
  // O filtro do brilho agora joga fora esses pixels e limita o resto, antes de desfocar.
  sanitizeBloom(bloom);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function sanitizeBloom(pass) {
  const m = pass.materialHighPassFilter, from = 'vec4 texel = texture2D( tDiffuse, vUv );';
  if (!m.fragmentShader.includes(from)) { console.warn('bloom: filtro não reconhecido, sem proteção contra NaN'); return; }
  // comparações com NaN dão sempre falso, então "!(fora < limite)" pega NaN e infinito
  // (isnan/isinf podem ser removidos pelo compilador do Direct3D)
  m.fragmentShader = m.fragmentShader.replace(from, from + `
      vec3 cc = texel.rgb;
      if ( !( abs( cc.r ) < 1e4 && abs( cc.g ) < 1e4 && abs( cc.b ) < 1e4 ) ) cc = vec3( 0.0 );
      texel = vec4( clamp( cc, 0.0, 64.0 ), 1.0 );`);
  m.needsUpdate = true;
}
let sizeKey = '';
// desenha a cidade no modo realista. dk = escuridão (0 dia, 1 noite)
export function renderReal(renderer, scene, camera, dk) {
  if (!composer) makeComposer(renderer, scene, camera);
  const pr = renderer.getPixelRatio(), sz = renderer.getSize(_s), k = sz.x + 'x' + sz.y + '@' + pr;
  if (k !== sizeKey) { sizeKey = k; composer.setPixelRatio(pr); composer.setSize(sz.x, sz.y); }
  // de dia só o que é bem mais forte que o sol brilha; de noite neon, faróis e postes
  bloom.threshold = THREE.MathUtils.lerp(2.4, 0.95, dk);
  bloom.strength = THREE.MathUtils.lerp(0.15, 0.6, dk);
  // tone mapping só na saída do composer (o interior e o Filtro 97 continuam como eram)
  const tm = renderer.toneMapping, ex = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = THREE.MathUtils.lerp(0.9, 1.15, dk);
  // o painel F3 conta as chamadas de todos os passes, não só a do último
  renderer.info.autoReset = false; renderer.info.reset();
  composer.render();
  renderer.info.autoReset = true;
  renderer.toneMapping = tm; renderer.toneMappingExposure = ex;
}
const _s = new THREE.Vector2();
// qualidade alta: os mesmos materiais com reflexo e o mesmo tone mapping, desenhando direto na tela
// (sem bloom e sem o antisserrilhado extra do realista, que são o que mais pesa)
export function renderPlain(renderer, scene, camera, dk) {
  const tm = renderer.toneMapping, ex = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.25, dk);
  renderer.render(scene, camera);
  renderer.toneMapping = tm; renderer.toneMappingExposure = ex;
}

