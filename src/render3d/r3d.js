// Renderizador 3D (Three.js). A lógica do jogo continua em 2D; aqui só desenha.
import * as THREE from '../../vendor/three/three.module.min.js';
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { clamp, lerp, hyp } from '../core/utils.js';
import { T, W, H } from '../world/map.js';
import { CHUNK, getChunk3D, makeLowres, shoreField, surfaceMap } from '../world/chunks.js';
import { darkness } from '../world/time.js';
import { heatStars } from '../game/world.js';
import { nearestCar } from '../game/player.js';
import { doorOf } from '../game/jobs.js';
import { matchOn, match, opponent, HOME } from '../game/stadium.js';
import { drawGround2D, label } from '../render/draw.js';
import { storyLabels, storyNear } from '../game/story.js';
import { drawHUD, drawKeycap } from '../render/hud.js';
import { ICONS, KIND_ICON, drawIcon } from '../render/icons.js';
import { enterables } from '../game/interiors.js';
import { buildCity, U, bh, facadeOf, BOAT_Y } from './build.js';
import { buildings as buildingsList_, lamps as lampsList, phones as phonesList, decor as decorList, tileAt, ROAD } from '../world/map.js';
import { loadMeshy, meshyCar, meshyProps } from './meshy.js';
import { VEH_SCALE } from '../entities/vehicles.js';
import { makeRecorder } from './gravador.js';
const buildingsList=()=>buildingsList_;
import { S, player, cam, keys, view, mouse } from '../core/state.js';
import { checkpoints } from '../game/blitz.js';
import { pf } from '../render/style97.js';
import { loadCarModels, carModel, repaint } from './models.js';
import { rioModel } from './rio97.js';
import { loadMapProps, coneMesh } from './props.js';
import { initPeople, beginPeople, putPerson, endPeople, lookOf, withHelmet, PLAYER_LOOK, playerGun, peopleTime } from './gente97.js';
import { swapScene, updateEnv, renderReal, renderPlain, initTextures } from './realista.js';
import { initLights, setLightQuality, updateLights, lightsOn, withNightLights, nightLightsOn } from './luzes.js';

export const R={ok:false,on:false,retro:false,cam34:true};
// Filtro 97 agora é opcional (desligado por padrão): chave nova pra quem já tinha ligado na 1.5.0
try{R.retro=localStorage.getItem('aq_retro2')==='1';}catch(e){}
export const DBG={};
export const getRenderer=()=>renderer;
let renderer,scene,camera,sun,hemi,ground={},mats,city,overlay,overlayTex,overlayMesh,overlayRec,overlayHash=null,water,neon;
const tmpV=new THREE.Vector3();

// ---------- inicialização ----------
export function init3D(){
  try{
    const canvas=document.getElementById('gl');
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    if(!renderer.getContext())throw new Error('sem WebGL');
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene=new THREE.Scene();
    scene.fog=new THREE.Fog('#9cc9f0',70,150);
    camera=new THREE.PerspectiveCamera(42,1,0.5,170);
    hemi=new THREE.HemisphereLight('#dfefff','#5a6b4a',0.9);scene.add(hemi);
    sun=new THREE.DirectionalLight('#fff4e0',2.2);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);const sc=sun.shadow.camera;sc.left=-34;sc.right=34;sc.top=34;sc.bottom=-34;sc.near=1;sc.far=160;sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.03;
    scene.add(sun);scene.add(sun.target);
    mats={
      city:new THREE.MeshLambertMaterial({vertexColors:true}),
      glass:new THREE.MeshLambertMaterial({vertexColors:true}),
      lit:new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false}),
      trunk:new THREE.MeshLambertMaterial({color:'#6d4c33'}),
      leaf:new THREE.MeshLambertMaterial({color:'#ffffff',flatShading:true}),
      pole:new THREE.MeshLambertMaterial({color:'#4a4a50'}),
      lampHead:new THREE.MeshLambertMaterial({color:'#cfcfc7',emissive:'#fff1b8',emissiveIntensity:0}),
      lightPool:new THREE.MeshBasicMaterial({map:radialTex('255,165,75'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}),
      umbrella:new THREE.MeshLambertMaterial({color:'#ffffff'}),
      dark:new THREE.MeshLambertMaterial({color:'#1d1d1f'}),
      bulb:new THREE.MeshBasicMaterial({color:'#ffffff'}),
      crowd:new THREE.MeshLambertMaterial({color:'#ffffff'}),
      fieldGlow:new THREE.MeshBasicMaterial({map:radialTex('255,250,225'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}),
      detail:new THREE.MeshLambertMaterial({vertexColors:true}),
    };
    // rugosidade/metal de cada material no modo realista (realista.js); o resto fica fosco
    const tag=(m,p)=>{m.userData.pbr=p;};
    tag(mats.glass,{r:0.08,m:0.6});tag(mats.pole,{r:0.45,m:0.7});tag(mats.lampHead,{r:0.4,m:0.3});
    tag(mats.trunk,{r:0.95});tag(mats.dark,{r:0.6});tag(mats.detail,{r:0.5,m:0.2});tag(mats.city,{r:0.9,tex:'parede'});
    initTextures(surfaceMap(),W,H); // texturas fotográficas do realista (carregam em segundo plano)
    city=buildCity(scene,mats);
    for(const s of city.special3d){scene.add(s.mesh);scene.add(s.crowd);scene.add(s.lightBoxes);scene.add(s.fieldLight);}
    // mar em volta
        water=makeSea();scene.add(water);
    neon=buildNeon();scene.add(neon.group);initLights(scene,neon.signs);
    // LOD do chão: o mapa todo em baixa resolução, por baixo dos pedaços detalhados (nunca aparece buraco)
    const lt=new THREE.CanvasTexture(makeLowres(true));lt.colorSpace=THREE.SRGBColorSpace;lt.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const lg=new THREE.PlaneGeometry(W,H);lg.rotateX(-Math.PI/2);
    const low=new THREE.Mesh(lg,new THREE.MeshLambertMaterial({map:lt,alphaTest:0.5}));low.material.userData.pbr={r:0.95,tex:'chao'};low.position.set(W/2,-0.03,H/2);low.receiveShadow=true;scene.add(low);
    // camada do chão com detalhes dinâmicos (marcas de pneu, zonas, portas, alvo...)
    overlay=document.createElement('canvas');overlay.width=1024;overlay.height=1024;overlayRec=makeRecorder(overlay.getContext('2d'));
    overlayTex=new THREE.CanvasTexture(overlay);overlayTex.colorSpace=THREE.SRGBColorSpace;
    const og=new THREE.PlaneGeometry(64,64);og.rotateX(-Math.PI/2);
    overlayMesh=new THREE.Mesh(og,new THREE.MeshLambertMaterial({map:overlayTex,transparent:true,depthWrite:false}));overlayMesh.material.userData.pbr={r:0.95};overlayMesh.renderOrder=1;overlayMesh.receiveShadow=true;scene.add(overlayMesh);
    initPeople(scene);initParticles();
    loadCarModels().then(ok=>{if(ok)rebuildCars();});
    // modelos do Meshy: Jegue e Busão, orelhão, banca e barco
    loadMeshy().then(ok=>{if(!ok)return;rebuildCars();meshyMeshes=meshyProps(scene,meshyList());applyProps();}).catch(e=>console.warn('Modelos Meshy:',e));
    // árvores, postes, casas e cones (props.js): troca as peças feitas por código quando chegam
    loadMapProps(scene).then(r=>{mapProps=r;applyProps();movePools();for(const g of cpMeshes.values())scene.remove(g);cpMeshes.clear();}).catch(e=>console.warn('Modelos do mapa:',e));
    R.ok=true;DBG.renderer=renderer;DBG.scene=scene;
    applyQuality(quality);
    view3d();warmUp();
  }catch(e){console.warn('3D indisponível:',e);R.ok=false;}
  return R.ok;
}
function radialTex(rgb){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+rgb+',1)');gr.addColorStop(1,'rgba('+rgb+',0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}

// ---------- mar: ondas em baixa poligonagem (facetado), água rasa clara perto da areia e espuma batendo na beira ----------
// O chão do 3D deixa os tiles de água transparentes, então este mar aparece também dentro do mapa (praia, porto).
function makeSea(){
  const g=new THREE.PlaneGeometry(W*3,H*3,200,200);g.rotateX(-Math.PI/2);
  const m=new THREE.MeshPhongMaterial({color:'#2683ad',specular:'#404040',shininess:70,flatShading:true});
  m.userData.pbr={r:0.06,m:0};const mesh=new THREE.Mesh(g,m);mesh.position.set(W/2,-0.16,H/2);mesh.userData.mat=m; // mat: o Phong original (o realista troca o da malha)
  const shore=new THREE.DataTexture(shoreField(),W,H);shore.magFilter=THREE.LinearFilter;shore.minFilter=THREE.LinearFilter;shore.needsUpdate=true;
  const u={uTime:{value:0},uShore:{value:shore},uSize:{value:new THREE.Vector2(W,H)},uShallow:{value:new THREE.Color('#3fc1c9')},uGlow:{value:0.3}};
  mesh.userData.u=u;
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,u);
    sh.vertexShader='uniform float uTime;\nvarying vec3 vWPos;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.y+=sin(position.x*0.33+uTime*1.25)*0.06+cos(position.z*0.27+uTime*0.85)*0.06+sin((position.x+position.z)*0.6+uTime*2.1)*0.025;\nvWPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader='uniform float uTime;\nuniform sampler2D uShore;\nuniform vec2 uSize;\nuniform vec3 uShallow;\nuniform float uGlow;\nvarying vec3 vWPos;\n'+sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
      vec2 suv=vWPos.xz/uSize;
      float d=(suv.x<0.0||suv.y<0.0||suv.x>1.0||suv.y>1.0)?1.0:texture2D(uShore,suv).r;
      diffuseColor.rgb=mix(uShallow,diffuseColor.rgb,smoothstep(0.1,0.6,d));
      float edge=1.0-smoothstep(0.1,0.19,d);
      float wave=smoothstep(0.6,0.95,sin(d*40.0-uTime*1.6+sin(vWPos.x*0.6+vWPos.z*0.4)*0.9)*0.5+0.5)*(1.0-smoothstep(0.12,0.38,d));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0),clamp(max(edge*0.85,wave*0.65),0.0,1.0));
      totalEmissiveRadiance+=diffuseColor.rgb*uGlow; // a água não fica preta com o sol baixo`);};
  return mesh;
}
// ---------- letreiros dos comércios: pintados de dia, neon aceso à noite ----------
const NEON={farmacia:['FARMÁCIA','#3dff6e','cruz'],lanchonete:['LANCHES','#ff3b30','#ffd21f'],mercadinho:['MERCADINHO','#ff4fd8'],padaria:['PADARIA','#ffae2b'],
  lojaposto:['POSTO','#ffd21f','#ff3b30'],armas:['TONHÃO','#ff3b30'],ze:['OFICINA DO ZÉ','#ff9a1f'],pintura:['PINTURA','#38e8ff'],pintura2:['PINTURA','#38e8ff'],
  hospital:['HOSPITAL','#ff4040'],policia:['CARCERAGEM CENTRAL','#4d7dff']};
function neonTex(text,col,col2){
  const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');
  g.fillStyle='rgba(8,8,12,0.92)';g.fillRect(6,10,500,108);g.strokeStyle='#000';g.lineWidth=6;g.strokeRect(6,10,500,108);
  let x=256;
  if(col2==='cruz'){g.shadowColor=col;g.shadowBlur=16;g.fillStyle=col;g.fillRect(26,55,60,20);g.fillRect(46,35,20,60);g.shadowBlur=0;x=290;}
  g.font='64px "Anton",Impact,sans-serif';g.textAlign='center';g.textBaseline='middle';
  const fs=Math.min(64,64*(col2==='cruz'?380:460)/Math.max(1,g.measureText(text).width));g.font=Math.floor(fs)+'px "Anton",Impact,sans-serif';
  g.shadowColor=col;g.shadowBlur=14;g.lineWidth=5;g.strokeStyle=col;g.strokeText(text,x,66);
  g.shadowBlur=0;g.fillStyle=col2&&col2!=='cruz'?col2:'#ffffff';g.fillText(text,x,66);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
let neonBack=null;
function buildNeon(){
  const group=new THREE.Group(),byKind={};
  for(const b of buildingsList()){
    // letreiro próprio do prédio (bingo, foto 1 hora...): entra como um tipo novo de neon
    const k=b.sign?'sign:'+b.sign.text:b.kind;if(b.sign&&!NEON[k])NEON[k]=[b.sign.text,b.sign.col,b.sign.col2];
    if(!NEON[k])continue;(byKind[k]||(byKind[k]=[])).push(b);}
  const list=[],signs=[];
  for(const [k,bs] of Object.entries(byKind)){
    const [text,col,col2]=NEON[k];
    const pos=[],uv=[],idx=[];let v=0;
    // o letreiro fica em cima da fachada da frente (o lado da porta, virado pra rua)
    for(const b of bs){const f=facadeOf(b),H=bh(b),uc=(f.a0+f.a1)/2;
      const w=Math.min((f.a1-f.a0)*0.9,k==='hospital'||k==='policia'||k.startsWith('sign:')?6:5),h=w/4,y0=H+0.06;
      for(const [u,y] of [[uc-w/2,y0],[uc+w/2,y0],[uc+w/2,y0+h],[uc-w/2,y0+h]])pos.push(...f.P(f.s>0===f.alongX?u:2*uc-u,-0.12,y));
      uv.push(0,0,1,0,1,1,0,1);idx.push(v,v+1,v+2,v,v+2,v+3);v+=4;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeBoundingSphere();
    const mat=new THREE.MeshBasicMaterial({map:neonTex(text,col,col2),transparent:true,fog:true}); // só de frente: de costas aparece a chapa escura (não o letreiro espelhado)
    const glow=new THREE.MeshBasicMaterial({map:radialTex(hexRgb(col)),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.DoubleSide});
    const gpos=[],gidx=[];let gv=0;
    for(const b of bs){const f=facadeOf(b),H=bh(b),uc=(f.a0+f.a1)/2;const w0=Math.min((f.a1-f.a0)*0.9,k==='hospital'||k==='policia'||k.startsWith('sign:')?6:5),w=w0*1.3,h=w0*0.5,cy=H+0.06+w0/8;
      for(const [u,y] of [[uc-w/2,cy-h/2],[uc+w/2,cy-h/2],[uc+w/2,cy+h/2],[uc-w/2,cy+h/2]])gpos.push(...f.P(u,0.05,y));
      gidx.push(gv,gv+1,gv+2,gv,gv+2,gv+3);gv+=4;}
    const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(gpos,3));gg.setAttribute('uv',new THREE.Float32BufferAttribute(Array(bs.length).fill([0,0,1,0,1,1,0,1]).flat(),2));gg.setIndex(gidx);gg.computeBoundingSphere();
    const m1=new THREE.Mesh(geo,mat),m2=new THREE.Mesh(gg,glow);m2.renderOrder=4;group.add(m1);group.add(m2);
    {const bg=geo.clone();bg.setIndex(idx.slice().reverse());bg.computeVertexNormals(); // sem normal a luz dava NaN (retângulo preto no realista)
      group.add(new THREE.Mesh(bg,neonBack||(neonBack=new THREE.MeshLambertMaterial({color:'#1b1b1f'}))));}
    const ent={k,mat,glow,on:0};list.push(ent);
    // posição de cada letreiro pra luz colorida que ele joga na fachada e na calçada (luzes.js)
    const lc=new THREE.Color(col);
    for(const b of bs){const f=facadeOf(b),w0=Math.min((f.a1-f.a0)*0.9,6),p=f.P((f.a0+f.a1)/2,0,bh(b)+0.06+w0/8),n=f.N(0,1,0);signs.push({x:p[0],y:p[1],z:p[2],nx:n[0],nz:n[2],col:lc,on:()=>ent.on});}
  }
  return {group,list,signs};
}
function hexRgb(h){const c=new THREE.Color(h);return Math.round(c.r*255)+','+Math.round(c.g*255)+','+Math.round(c.b*255);}
function updateNeon(dk){
  if(!neon)return;
  for(const n of neon.list){
    let on=dk>0.35?1:0;
    if(on&&(n.k==='farmacia'||n.k==='lanchonete'||n.k==='sign:BINGO ESTRELA')){const t=S.gameTime*(n.k==='farmacia'?1.6:0.7);on=(Math.floor(t)%5===4&&Math.floor(t*8)%2)?0.35:1;}
    n.on=on;const lvl=on?1:0.55+0.25*(1-dk);n.mat.color.setScalar(on?1.25*on:lvl);
    n.glow.opacity=on&&quality>=2?0.32*on*clamp((dk-0.35)*3,0,1):0;
  }
}
// ---------- Filtro 97: desenha a cidade numa resolução baixa e estica sem borrar, com pontilhado e menos cores ----------
let rt=null,post=null;
const RETRO_LINES=[240,300,360,360];
function retroPass(){
  const h=RETRO_LINES[quality],w=Math.round(h*CW/Math.max(1,CH));
  if(!rt){
    const ext=renderer.extensions;const half=ext.has('EXT_color_buffer_float')||ext.has('EXT_color_buffer_half_float');
    rt=new THREE.WebGLRenderTarget(w,h,{type:half?THREE.HalfFloatType:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,generateMipmaps:false});
    const mat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:rt.texture},res:{value:new THREE.Vector2(w,h)},levels:{value:31}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 res;uniform float levels;varying vec2 vUv;
        float b2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
        float bayer4(vec2 a){return b2(.5*a)*.25+b2(a);}
        void main(){vec2 px=floor(vUv*res);vec3 c=texture2D(tDiffuse,(px+.5)/res).rgb;
          c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
          float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.12);
          c+=(bayer4(px)-.5)/levels;c=floor(c*levels+.5)/levels;
          gl_FragColor=vec4(clamp(c,0.,1.),1.);}`});
    post={scene:new THREE.Scene(),cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1),mat};
    const q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);q.frustumCulled=false;post.scene.add(q);
  }
  if(rt.width!==w||rt.height!==h){rt.setSize(w,h);post.mat.uniforms.res.value.set(w,h);}
  renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);
  renderer.render(post.scene,post.cam);
}
export function toggleRetro(){R.retro=!R.retro;try{localStorage.setItem('aq_retro2',R.retro?'1':'0');}catch(e){}}
// G passa por: 3D realista → 3D alta → 3D média → 3D leve → clássico (fica salvo no navegador). Devolve o texto pra mostrar.
export function gfxLabel(){return R.on?'3D '+QNAMES[quality].toUpperCase():'CLÁSSICO 2D';}
export function cycleGfx(){
  if(!R.ok)return 'Este navegador não tem suporte a 3D (WebGL).';
  let txt,val;
  if(!R.on){set3D(true);applyQuality(3,true);val='3d3';txt='Gráficos: 3D · realista';}
  else if(quality>0){const q=quality-1;applyQuality(q,true);val='3d'+q;txt='Gráficos: 3D · qualidade '+QNAMES[q];}
  else{set3D(false);val='2d';txt='Gráficos: clássico (2D)';}
  try{localStorage.setItem('aq_gfx',val);}catch(err){}
  return txt;
}

// troca entre 3D e clássico
export function set3D(on){
  R.on=on&&R.ok;if(!R.on)view.r34=false;
  document.getElementById('gl').style.display=R.on?'block':'none';
  if(R.on)view3d();else{view.project=(x,y)=>({x:(x-cam.x)*cam.zoom+CW/2,y:(y-cam.y)*cam.zoom+CH/2});view.unproject=(sx,sy)=>({x:cam.x+(sx-CW/2)/cam.zoom,y:cam.y+(sy-CH/2)/cam.zoom});}
}
const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),ndc=new THREE.Vector2(),hit=new THREE.Vector3();
function view3d(){
  view.project=(x,y,h)=>{tmpV.set(x*U,h||0,y*U).project(camera);return{x:(tmpV.x+1)/2*CW,y:(1-tmpV.y)/2*CH,behind:tmpV.z>1};};
  view.unproject=(sx,sy)=>{ndc.set(sx/CW*2-1,-(sy/CH*2-1));ray.setFromCamera(ndc,camera);if(!ray.ray.intersectPlane(plane,hit))return{x:cam.x,y:cam.y};return{x:hit.x*T,y:hit.z*T};};
}

// ---------- chão: as mesmas texturas do 2D em placas ----------
// Streaming do chão: carrega os pedaços que estão (ou vão estar) na tela, os mais perto primeiro,
// no máximo alguns por quadro pra não travar. Enquanto não chega, aparece o chão em baixa resolução.
const groundMats=[];
function updateGround(x0,x1,z0,z1,ahead){
  const want=new Map();
  const add=(xa,xb,za,zb,pri)=>{for(let z=Math.floor(za/CHUNK);z<=Math.floor(zb/CHUNK);z++)for(let x=Math.floor(xa/CHUNK);x<=Math.floor(xb/CHUNK);x++){
    if(x<0||z<0||x*CHUNK>=W||z*CHUNK>=H)continue;const k=x+','+z;if(!want.has(k)||want.get(k).p>pri)want.set(k,{x,z,p:pri});}};
  add(x0,x1,z0,z1,0);                                             // o que está na tela
  if(ahead)add(x0+ahead.x,x1+ahead.x,z0+ahead.z,z1+ahead.z,1);    // pra onde o carro está indo
  const cx=(x0+x1)/2,cz=(z0+z1)/2;
  const missing=[...want.entries()].filter(([k])=>!ground[k]).map(([k,v])=>({k,...v,d:v.p*1e4+Math.hypot((v.x+0.5)*CHUNK-cx,(v.z+0.5)*CHUNK-cz)}));
  missing.sort((a,b)=>a.d-b.d);
  let budget=missing.length&&missing[0].p===0?3:1;
  for(const m of missing){if(budget--<=0)break;
    const tex=new THREE.CanvasTexture(getChunk3D(m.x,m.z));tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const geo=new THREE.PlaneGeometry(CHUNK,CHUNK);geo.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:tex,alphaTest:0.5}));mesh.material.userData.pbr={r:0.95,tex:'chao'};mesh.position.set(m.x*CHUNK+CHUNK/2,0,m.z*CHUNK+CHUNK/2);mesh.receiveShadow=true;scene.add(mesh);
    ground[m.k]={m:mesh,t:0};}
  for(const k of Object.keys(ground)){if(want.has(k)){ground[k].t=0;continue;}ground[k].t++;
    if(ground[k].t>300){const g=ground[k];scene.remove(g.m);g.m.geometry.dispose();g.m.material.map.dispose();g.m.material.dispose();delete ground[k];}}
}

// ---------- carros ----------
// Cada carro = poucas malhas: carroceria (cor do carro), detalhes fundidos numa malha só (rodas, cabine, vidros),
// luz de freio, faróis, sirene e facho. A malha de detalhes é a mesma pra todos os carros do mesmo tipo.
const carMeshes=new Map(), matCache={};
const mat=(col,opt)=>{const k=col+(opt||'');if(!matCache[k])matCache[k]=opt==='e'?new THREE.MeshBasicMaterial({color:col}):new THREE.MeshLambertMaterial({color:col});return matCache[k];};
const boxG=new THREE.BoxGeometry(1,1,1);
// cilindro deitado (eixo no Z do carro = largura): rodas e calotas
const cylG=new THREE.CylinderGeometry(0.5,0.5,1,12);cylG.rotateX(Math.PI/2);
const SHAPES={box:boxG.toNonIndexed(),cyl:cylG.toNonIndexed()};
// junta várias peças (caixas ou cilindros, com cor) numa geometria só
function mergeBoxes(list){
  const pos=[],nor=[],col=[],c=new THREE.Color();
  for(const [hex,sx,sy,sz,x,y,z,shape] of list){c.set(hex);const src=SHAPES[shape||'box'],P=src.attributes.position,N=src.attributes.normal;
    for(let i=0;i<P.count;i++){pos.push(P.getX(i)*sx+x,P.getY(i)*sy+y,P.getZ(i)*sz+z);nor.push(N.getX(i),N.getY(i),N.getZ(i));col.push(c.r,c.g,c.b);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.computeBoundingSphere();return g;}
const LS=1/VEH_SCALE; // faróis e lanternas continuam do tamanho antigo (o carro inteiro cresce)
const HEIGHTS={lotacao:0.7,busao:1.15,caminhao:1.25,camin:0.5,suv:0.55,moto:0.3,guincho:0.55,viatura:0.42,swat:0.85,fbi:0.4,exercito:0.45,blindado:0.8};
const carGeo={};
function carParts(c){
  const key=c.type+'|'+c.t.len+'|'+c.t.wid;if(carGeo[key])return carGeo[key];
  // tudo montado no tamanho antigo; o carro inteiro cresce VEH_SCALE no makeCar
  const L=c.t.len*U/VEH_SCALE, Wd=c.t.wid*U/VEH_SCALE, h=HEIGHTS[c.type]||0.42, D=[];let body,brake=null,head=null,siren=null,cabin=null;
  const GL='#86c5da', TIRE='#151515', HUB='#b8bdc2', TRIM='#2a2a2e';
  // vidro em volta de uma cabine (frente, trás e laterais), um pouco mais larga que ela pra aparecer dos lados
  const glassAround=(cx,len,y,hh,w)=>D.push([GL,0.05,hh,w*0.9,cx+len/2+0.01,y,0],[GL,0.05,hh*0.9,w*0.86,cx-len/2-0.01,y,0],[GL,len*0.78,hh*0.85,w+0.02,cx,y,0]);
  if(c.type==='moto'){D.push(['#222',L,0.25,0.12,0,0.25,0],['#e53935',0.22,0.22,0.22,-L*0.1,0.75,0],[TIRE,0.3,0.3,0.08,L*0.38,0.15,0,'cyl'],[TIRE,0.3,0.3,0.08,-L*0.38,0.15,0,'cyl'],['#c0c0c0',0.04,0.04,0.36,L*0.3,0.62,0]);body=[L*0.55,0.22,Wd*0.6,0,0.42,0];}
  else{
    body=[L,h,Wd,0,0.18+h/2,0];
    if(c.type==='swat'){D.push(['#9fd3e8',0.05,h*0.4,Wd*0.85,L/2-0.02,0.18+h*0.7,0],['#2a2e36',L*0.7,0.06,Wd*0.9,-L*0.08,0.18+h+0.03,0],['#e0e0e0',L*0.3,0.12,0.02,-L*0.05,0.18+h*0.55,Wd/2+0.005],['#e0e0e0',L*0.3,0.12,0.02,-L*0.05,0.18+h*0.55,-Wd/2-0.005]);
      siren=[[0.16,0.1,Wd*0.35,L*0.3,0.18+h+0.1,-Wd*0.2],[0.16,0.1,Wd*0.35,L*0.3,0.18+h+0.1,Wd*0.2]];}
    else if(c.type==='blindado'){D.push(['#2e3313',L*0.35,0.35,Wd*0.6,-L*0.05,0.18+h+0.17,0],['#23270e',L*0.45,0.12,0.12,L*0.2,0.18+h+0.25,0],['#9fd3e8',0.04,0.12,Wd*0.5,L/2-0.01,0.18+h*0.75,0]);
      for(const sx of[-0.36,-0.12,0.12,0.36])for(const sz of[-1,1])D.push(['#111',0.36,0.36,0.12,sx*L,0.18,sz*Wd*0.5]);}
    else if(c.type==='exercito'){D.push(['#3d4419',L*0.08,0.4,Wd*0.92,-L*0.05,0.18+h+0.2,0],['#86c5da',0.04,0.22,Wd*0.8,L*0.18,0.18+h+0.11,0],['#2e3313',L*0.3,0.08,Wd*0.92,-L*0.3,0.18+h+0.4,0]);}
    else if(c.type==='busao'||c.type==='caminhao'){D.push(['#9fd3e8',0.06,h*0.45,Wd*0.85,L/2-0.02,0.18+h*0.65,0]);if(c.type==='busao')for(let k=0;k<6;k++)D.push(['#cfe9f5',L*0.09,h*0.3,Wd*1.01,-L/2+L*0.12+k*L*0.14,0.18+h*0.7,0]);}
    else if(c.type==='camin'||c.type==='guincho'){cabin=[L*0.32,0.32,Wd*0.92,L*0.12,0.18+h+0.15,0];glassAround(L*0.12,L*0.32,0.18+h+0.14,0.2,Wd*0.92);
      D.push(['#3a3a3a',L*0.5,0.04,Wd*0.94,-L*0.24,0.18+h+0.02,0]); // caçamba: assoalho escuro
      if(c.type==='guincho')D.push(['#ffb300',0.12,0.5,0.12,-L*0.3,0.18+h+0.25,0],['#ffb300',L*0.35,0.08,0.08,-L*0.38,0.18+h+0.48,0]);}
    else if(c.type!=='bugue'){const cw=c.type==='suv'?0.55:0.42,cy=0.18+h+0.14;if(c.type==='fbi')siren=[[0.08,0.06,0.12,L*0.08,0.18+h+0.2,-Wd*0.15],[0.08,0.06,0.12,L*0.08,0.18+h+0.2,Wd*0.15]];
      cabin=[L*cw,0.3,Wd*0.86,-L*0.04,cy,0];if(c.type==='viatura')cabin.push('#f4f4f4');glassAround(-L*0.04,L*cw,cy-0.02,0.22,Wd*0.86);
      for(const sz of[-1,1])D.push([TRIM,0.05,0.05,0.07,L*cw/2-L*0.04+0.05,0.18+h+0.06,sz*(Wd/2+0.03)]);} // retrovisores
    else D.push(['#333',L*0.5,0.06,Wd*0.9,-0.05,0.18+h+0.4,0],[TRIM,0.04,0.4,0.04,L*0.18,0.18+h+0.2,-Wd*0.42],[TRIM,0.04,0.4,0.04,L*0.18,0.18+h+0.2,Wd*0.42],[GL,0.04,0.2,Wd*0.8,L*0.2,0.18+h+0.12,0]);
    if(c.type==='taxi')D.push(['#e53935',0.3,0.12,0.18,-L*0.05,0.18+h+0.35,0]);
    // para-choques e faixa de baixo
    if(!['blindado','busao','caminhao'].includes(c.type))D.push([TRIM,0.07,0.11,Wd*0.98,L/2+0.02,0.23,0],[TRIM,0.07,0.11,Wd*0.98,-L/2-0.02,0.23,0]);
    D.push([TRIM,L*0.98,0.06,Wd*1.01,0,0.21,0]);
    // rodas redondas com calota
    if(c.type!=='blindado'){const big=c.type==='busao'||c.type==='caminhao',r=big?0.4:0.34,ax=big?0.36:0.32;
      for(const sx of[-1,1])for(const sz of[-1,1]){const z=sz*Wd*0.5;D.push([TIRE,r,r,0.13,sx*L*ax,r/2,z,'cyl'],[HUB,r*0.5,r*0.5,0.02,sx*L*ax,r/2,z+sz*0.07,'cyl']);}}
    brake=mergeBoxes([['#fff',LS*0.04,LS*0.1,LS*0.18,-L/2-0.01,0.18+h*0.65,-Wd*0.32],['#fff',LS*0.04,LS*0.1,LS*0.18,-L/2-0.01,0.18+h*0.65,Wd*0.32]]);
    head=mergeBoxes([['#fff',LS*0.04,LS*0.1,LS*0.18,L/2+0.01,0.18+h*0.6,-Wd*0.32],['#fff',LS*0.04,LS*0.1,LS*0.18,L/2+0.01,0.18+h*0.6,Wd*0.32]]);
    if(c.type==='viatura')siren=[[0.18,0.1,Wd*0.4,-L*0.05,0.18+h+0.34,-Wd*0.22],[0.18,0.1,Wd*0.4,-L*0.05,0.18+h+0.34,Wd*0.22]];
  }
  return carGeo[key]={detail:D.length?mergeBoxes(D):null,body,cabin,brake,head,siren,L,Wd,h};
}
function part(g,col,dims,opt){const m=new THREE.Mesh(boxG,mat(col,opt));m.scale.set(dims[0],dims[1],dims[2]);m.position.set(dims[3],dims[4],dims[5]);g.add(m);return m;}
function makeCar(c){
  const g=new THREE.Group(), P=carParts(c);
  g.userData.col=c.color;
  // viatura e lotação de 97 (feitas por código, leves: valem em todas as qualidades); os outros usam o
  // modelo 3D (Kenney) quando tem e já carregou; senão, o carro de caixas
  g.scale.setScalar(VEH_SCALE);
  const M=rioModel(c.type,P.L,P.Wd)||(useModels()?(meshyCar(c.type,c.color,1/VEH_SCALE)||carModel(c.type,c.color,P.L)):null);
  let ly=0; // quanto subir/descer faróis e lanternas pra encaixar no modelo
  if(M){g.add(M.root);g.userData.model=M;if(M.repaint)M.repaint(c.color);ly=M.top*0.42-(0.18+P.h*0.65);}
  else{
  const body=part(g,c.color,P.body);body.castShadow=true;g.userData.body=body;
  // cabine da cor do carro (a viatura tem a cabine branca fixa)
  if(P.cabin){const cb=part(g,P.cabin[6]||c.color,P.cabin);cb.castShadow=true;if(!P.cabin[6])g.userData.cabin=cb;}
  if(P.detail){const d=new THREE.Mesh(P.detail,mats.detail);d.castShadow=true;g.add(d);}
  }
  if(P.brake){const b=new THREE.Mesh(P.brake,brakeOff);b.position.y=ly;g.add(b);g.userData.brake=b;
    const tg=new THREE.Mesh(tailG,tailMat);tg.position.set(-P.L/2-0.5,0.04,0);tg.scale.set(1.3,1,P.Wd*1.6);tg.renderOrder=2;g.add(tg);g.userData.tail=tg;}
  if(P.head){const hm=new THREE.Mesh(P.head,headMat);hm.position.y=ly;g.add(hm);}
  if(P.siren){g.userData.sirenR=part(g,'#7a1010',P.siren[0]);g.userData.sirenB=part(g,'#0e1f66',P.siren[1]);
    if(M){g.userData.sirenR.position.y=g.userData.sirenB.position.y=M.top+0.05;}}
  if(c.type!=='moto'){const beam=new THREE.Mesh(beamG,beamMat);beam.position.set(P.L/2+2.4,0.04,0);beam.renderOrder=2;g.add(beam);g.userData.beam=beam;}
  scene.add(g);return g;
}
const beamG=(()=>{const g=new THREE.PlaneGeometry(4.5,2.6);g.rotateX(-Math.PI/2);return g;})();
const beamMat=new THREE.MeshBasicMaterial({map:(()=>{const c=document.createElement('canvas');c.width=128;c.height=64;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,128,0);gr.addColorStop(0,'rgba(255,250,215,0.9)');gr.addColorStop(1,'rgba(255,250,215,0)');g.fillStyle=gr;g.beginPath();g.moveTo(0,26);g.lineTo(128,0);g.lineTo(128,64);g.lineTo(0,38);g.fill();return new THREE.CanvasTexture(c);})(),
  transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
// brilho vermelho das lanternas no chão de noite (mais forte freando)
const tailG=(()=>{const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g;})();
const tailMat=new THREE.MeshBasicMaterial({map:radialTex('255,40,30'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
const tailMatBrake=new THREE.MeshBasicMaterial({map:radialTex('255,40,30'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
const brakeOn=new THREE.MeshBasicMaterial({color:'#ff2a2a'}), brakeOff=new THREE.MeshLambertMaterial({color:'#5a0a0a',userData:{pbr:{r:0.3}}}), headMat=new THREE.MeshBasicMaterial({color:'#fffbe6'});
const sirR=[new THREE.MeshBasicMaterial({color:'#ff2020'}),new THREE.MeshLambertMaterial({color:'#5a1010'})], sirB=[new THREE.MeshBasicMaterial({color:'#3060ff'}),new THREE.MeshLambertMaterial({color:'#101a50'})];
const wreckMat=new THREE.MeshLambertMaterial({color:'#2b2724',userData:{pbr:{r:1}}});
// modelos 3D só nas qualidades média e alta (na leve, as peças feitas por código pesam menos)
const useModels=()=>quality>0;
let mapProps=null, meshyMeshes=null;
// onde vão os objetos do Meshy: orelhão com a concha aberta pra rua, banca de frente pra calçada, barco na água do cais
function meshyList(){
  const out=[];
  for(const ph of phonesList){let dir=[0,1];
    for(let d=1;d<=3;d++){const f=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>tileAt(ph.x+dx*d*T,ph.y+dy*d*T)===ROAD);if(f){dir=f;break;}}
    out.push({name:'orelhao',x:ph.x*U,z:ph.y*U,rot:Math.atan2(dir[0],dir[1])});}
  for(const d of decorList){
    if(d.type==='banca')out.push({name:'banca',x:d.x*U,z:d.y*U,rot:Math.atan2(d.face[0],d.face[1])});
    else if(d.type==='barco')out.push({name:'barco',x:d.x*U,z:d.y*U,y:d.agua?BOAT_Y:0,rot:-d.a});}
  return out;
}
function applyProps(){
  const on=useModels();
  if(meshyMeshes){for(const m of meshyMeshes)m.visible=on;for(const m of city.swap.meshy)m.visible=!on;}
  if(!mapProps)return;
  for(const m of mapProps.meshes)m.visible=on;
  for(const k of ['trees','lamps','houses'])if(mapProps.done[k])for(const m of city.swap[k])m.visible=!on;
}
// com os postes de modelo, a poça de luz no chão vai pra baixo da cúpula (o braço fica em cima da rua)
function movePools(){
  const M=new THREE.Matrix4(),P=new THREE.Vector3(),Q=new THREE.Quaternion(),S3=new THREE.Vector3(8,1,8);
  lampsList.forEach((l,i)=>{if(!l.arm)return;M.compose(P.set(l.x*U+l.arm.x,0.03,l.y*U+l.arm.z),Q,S3);city.pools.setMatrixAt(i,M);});
  for(const m of city.pools.list){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}
}
// refaz todos os carros (quando os modelos terminam de carregar ou a qualidade muda)
function rebuildCars(){for(const g of carMeshes.values())scene.remove(g);carMeshes.clear();}
function syncCars(night){
  const seen=new Set();
  beamMat.opacity=(lightsOn()?0.22:0.55)*night;tailMat.opacity=0.35*night;tailMatBrake.opacity=0.25+0.55*night;
  for(const c of S.cars){
    let g=carMeshes.get(c);if(!g){g=makeCar(c);carMeshes.set(c,g);}
    seen.add(c);
    g.position.set(c.x*U,0,c.y*U);g.rotation.y=-c.a;
    const M=g.userData.model;
    if(M){ // carro com modelo: rodas giram, carcaça queimada vira cinza escuro
      if(c.wreck){if(!g.userData.burnt){g.userData.burnt=true;M.root.traverse(o=>{if(o.isMesh)o.material=wreckMat;});}}
      else{if(g.userData.col!==c.color){if(M.repaint)M.repaint(c.color);else repaint(M,c.color);g.userData.col=c.color;}
        const spin=(c.fwdSpeed?c.fwdSpeed():0)*U/60/(M.radius*VEH_SCALE);for(const w of M.wheels)w.rotation.x+=spin;}
    }else{
    const b=g.userData.body,cb=g.userData.cabin;
    if(c.wreck){if(b.material!==wreckMat){b.material=wreckMat;if(cb)cb.material=wreckMat;}}
    else if(g.userData.col!==c.color||b.material===wreckMat){b.material=mat(c.color);if(cb)cb.material=mat(c.color);g.userData.col=c.color;}
    }
    if(g.userData.brake)g.userData.brake.material=c.brakeLight&&!c.wreck?brakeOn:brakeOff;
    if(g.userData.tail){const on=!c.wreck&&!!c.driver;g.userData.tail.visible=on&&(night>0.05||c.brakeLight);g.userData.tail.material=c.brakeLight?tailMatBrake:tailMat;}
    if(g.userData.sirenR){const on=heatStars()>0&&(c.ai==='police'||c.ai==='block'),f=Math.floor(S.gameTime*8)%2;g.userData.sirenR.material=on&&f?sirR[0]:sirR[1];g.userData.sirenB.material=on&&!f?sirB[0]:sirB[1];}
    if(g.userData.beam)g.userData.beam.visible=night>0.05&&!!c.driver&&!c.wreck;
  }
  for(const [c,g] of carMeshes)if(!seen.has(c)){scene.remove(g);carMeshes.delete(c);}
}

// ---------- blitz (postos de controle dos bairros fechados) ----------
const cpMeshes=new Map();
const coneG=new THREE.ConeGeometry(0.16,0.45,10);coneG.translate(0,0.225,0);
const coneBandG=new THREE.CylinderGeometry(0.105,0.125,0.08,10);coneBandG.translate(0,0.22,0);
let signMat=null;
function blitzSign(){
  if(signMat)return signMat;
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
  g.fillStyle='#ffd600';g.fillRect(0,0,256,128);g.fillStyle='#111';g.fillRect(6,6,244,116);g.fillStyle='#ffd600';g.fillRect(12,12,232,104);
  g.fillStyle='#111';g.font='bold 52px Arial';g.textAlign='center';g.fillText('BLITZ',128,64);g.font='bold 18px Arial';g.fillText('OPERAÇÃO MARÉ ALTA',128,92);g.font='bold 14px Arial';g.fillText('SÓ MORADOR',128,110);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;signMat=new THREE.MeshLambertMaterial({map:t});return signMat;
}
function makeCheckpoint(cp){
  const g=new THREE.Group(), hw=cp.L.w*T/2*U;
  g.position.set(cp.x*U,0,cp.y*U);g.rotation.y=-Math.atan2(cp.dy,cp.dx);
  // cones afunilando (do lado de fora)
  for(let k=0;k<5;k++){const s=(-110+k*22)*U,l=hw-(8+k*6)*U;for(const sg of[-1,1]){
    const cm=useModels()?coneMesh():null; // cone de verdade (Kenney) quando carregou
    if(cm){cm.position.set(s,0,sg*l);g.add(cm);continue;}
    const c=new THREE.Mesh(coneG,mat('#ff6d00'));c.position.set(s,0,sg*l);c.castShadow=true;g.add(c);const b=new THREE.Mesh(coneBandG,mat('#f5f5f5'));b.position.copy(c.position);g.add(b);}}
  // cancela: pilar + braço listrado que gira pra cima quando quebrada
  const post=new THREE.Mesh(boxG,mat('#424242'));post.scale.set(0.25,0.9,0.25);post.position.set(0,0.45,-hw-0.35);post.castShadow=true;g.add(post);
  const arm=new THREE.Group();arm.position.set(0,0.85,-hw-0.35);g.add(arm);
  const n=Math.ceil((hw*2+0.3)/0.38);for(let k=0;k<n;k++){const p=new THREE.Mesh(boxG,mat(k%2?'#ffffff':'#e53935'));p.scale.set(0.09,0.09,0.38);p.position.set(0,0,0.19+k*0.38);p.castShadow=true;arm.add(p);}
  g.userData.arm=arm;
  // placa
  const pole=new THREE.Mesh(boxG,mat('#616161'));pole.scale.set(0.06,1.3,0.06);pole.position.set(-0.6,0.65,hw+0.6);g.add(pole);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.3,0.65),blitzSign());sign.position.set(-0.62,1.45,hw+0.6);sign.rotation.y=-Math.PI/2;sign.castShadow=true;g.add(sign);
  scene.add(g);return g;
}
function syncCheckpoints(){
  const live=new Set();
  for(const cp of checkpoints){if(!cp.props)continue;live.add(cp);
    let g=cpMeshes.get(cp);if(!g){g=makeCheckpoint(cp);cpMeshes.set(cp,g);}
    const arm=g.userData.arm;const target=cp.broken>0?-1.3:0;arm.rotation.x=lerp(arm.rotation.x,target,0.25);}
  for(const [cp,g] of cpMeshes)if(!live.has(cp)){scene.remove(g);cpMeshes.delete(cp);}
}

// ---------- pessoas ----------
// Gente de 97 feita por código (gente97.js): boneco articulado com roupa carioca, todo mundo instanciado
// (umas 14 chamadas pra GPU, não importa quantas pessoas) e animado aqui mesmo, sem esqueleto.
// escala das pessoas: um andar dos prédios tem 0,95 de altura (uns 3 m) e um carro uns 1,1 de comprimento,
// então gente de verdade fica com ~0,6 (uns 1,9 m). O jogador é um pouco maior pra continuar fácil de achar na tela.
const PED_SCALE=0.6, PLAYER_SCALE=0.75;
const riders=new WeakMap(); // quem pilota cada moto (um pedestre inventado, com roupa fixa)
function riderOf(c){let r=riders.get(c);if(!r){const id=Math.floor(Math.random()*1e6);r={id,shirt:['#e74c3c','#f4f4f0','#3498db','#f1c40f','#2c3e50','#e67e22'][id%6],skin:['#f1c27d','#e0ac69','#c68642','#8d5524'][id%4],hair:'#222'};riders.set(c,r);}return r;}
function syncPeople(){
  peopleTime(S.gameTime);beginPeople();
  const vis=!player.car&&player.state==='play'&&!(player.inv>0&&Math.floor(S.gameTime*10)%2);
  const mv=keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD']||keys['ArrowUp']||keys['ArrowDown']||keys['ArrowLeft']||keys['ArrowRight'];
  if(vis||player.state==='wasted'&&!player.car){
    const run=(keys['ShiftLeft']||keys['ShiftRight'])&&!player.aiming;let pose,ph=player.anim;
    if(player.state==='wasted')pose='down';
    else if(player.punchCd>0.15&&player.weapon==='punho'){pose='punch';ph=(0.4-player.punchCd)/0.25*Math.PI;}
    else if(mv)pose=run?'run':'walk';
    else pose='idle';
    if(pose==='idle')ph=S.gameTime*3;
    // arma na mão: mira (braços pra frente) segurando o botão direito ou logo depois de atirar; coice nos primeiros 0,12 s
    const armed=player.weapon&&player.weapon!=='punho'&&(player.ammo[player.weapon]||0)>0, since=S.gameTime-(player.shotT??-9);
    playerGun.kind=armed?player.weapon:null;playerGun.aim=armed&&(player.aiming||since<0.7);
    playerGun.kick=armed&&since<0.14?1-since/0.14:0;
    putPerson(player.x*U,player.y*U,0,player.a,PLAYER_SCALE,PLAYER_LOOK,pose,ph,player);
    playerGun.kind=null;
  }
  // quem está pilotando moto: sentado, de capacete
  for(const c of S.cars){
    if(c.type!=='moto'||!c.driver||c.wreck)continue;
    const dx=c.x-cam.x,dy=c.y-cam.y;if(dx*dx+dy*dy>(46*T)*(46*T))continue;
    const me=c.driver==='player',sc=me?PLAYER_SCALE*0.85:PED_SCALE,back=-0.13*VEH_SCALE,ca=Math.cos(c.a),sa=Math.sin(c.a);
    const L=me?withHelmet(PLAYER_LOOK,'#e53935'):withHelmet(lookOf(riderOf(c)),'#f4f4f0');
    putPerson(c.x*U+ca*back,c.y*U+sa*back,0.3*VEH_SCALE-0.56*sc,c.a,sc,L,'sit',0);
  }
  // só quem está perto da câmera (o resto não aparece mesmo)
  const r2=(46*T)*(46*T);
  for(const p of S.peds){
    if(p.state==='dead'||p.state==='gone'||p.state==='dead2')continue;
    const dx=p.x-cam.x,dy=p.y-cam.y;if(dx*dx+dy*dy>r2)continue;
    const run=p.state==='flee'||p.state==='robber'||p.state==='cop'||p.fan&&matchOn();
    const pose=p.state==='down'?'down':p.state==='wait'||p.state==='story'?'idle':run?'run':'walk';
    putPerson(p.x*U,p.y*U,0,p.a,PED_SCALE,lookOf(p),pose,pose==='idle'?S.gameTime*3+p.id:p.anim*(run?13:9),p);
  }
  endPeople();
}

// ---------- partículas e tiros ----------
const dotTex=radialTex('255,255,255');
// partículas também instanciadas: um quadradinho virado pra câmera, com cor e transparência por partícula
const MAXFX=400;let FX={};
function fxMesh(add){
  const m=new THREE.MeshBasicMaterial({map:dotTex,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
  m.onBeforeCompile=sh=>{sh.vertexShader='attribute float aAlpha;\nvarying float vAlpha;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAlpha=aAlpha;');
    sh.fragmentShader='varying float vAlpha;\n'+sh.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=vAlpha;');};
  const geo=new THREE.PlaneGeometry(1,1);const al=new THREE.InstancedBufferAttribute(new Float32Array(MAXFX),1);al.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('aAlpha',al);
  const im=new THREE.InstancedMesh(geo,m,MAXFX);im.count=0;im.frustumCulled=false;im.renderOrder=3;im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.setColorAt(0,new THREE.Color(1,1,1));scene.add(im);return im;
}
const _M=new THREE.Matrix4(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
function initParticles(){FX={add:fxMesh(true),norm:fxMesh(false)};}
const colCache={};
function parseCol(str){if(colCache[str])return colCache[str];const m=str.match(/rgba?\((\d+),(\d+),(\d+)/);const c=m?new THREE.Color(m[1]/255,m[2]/255,m[3]/255):new THREE.Color(str&&str[0]==='#'?str:'#fff');colCache[str]=c;return c;}
function syncParticles(){
  const n={add:0,norm:0};
  for(const p of S.parts){
    const k=p.fire?'add':'norm', im=FX[k], i=n[k];
    if(i>=MAXFX)continue;n[k]++;
    const a=clamp(p.life/p.max,0,1);
    const hgt=p.smoke?0.6+(1-a)*2.5:0.5;const sz=p.size*U*(p.fire?(a+0.3)*2.2:2.2);
    _M.compose(_p.set(p.x*U,hgt,p.y*U),camera.quaternion,_s.set(sz,sz,1));im.setMatrixAt(i,_M);
    im.setColorAt(i,parseCol(p.col));im.geometry.attributes.aAlpha.array[i]=k==='add'?a:a*0.55;
  }
  for(const k of ['add','norm']){const im=FX[k];im.count=n[k];if(n[k]){im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.geometry.attributes.aAlpha.needsUpdate=true;}}
}
const trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(64*6),3));
const tracers=new THREE.LineSegments(trGeo,new THREE.LineBasicMaterial({color:'#fff2a0',transparent:true,blending:THREE.AdditiveBlending}));
let tracersAdded=false;
function syncTracers(){
  if(!tracersAdded){scene.add(tracers);tracersAdded=true;}
  const arr=trGeo.attributes.position.array;let n=0;
  for(const t of S.tracers){if(n>=64)break;arr.set([t.x1*U,0.7,t.y1*U,t.x2*U,0.7,t.y2*U],n*6);n++;}
  trGeo.setDrawRange(0,n*2);trGeo.attributes.position.needsUpdate=true;
}

// ---------- sol e sombras ----------
// A caixa de sombra cobre a área vista (cresce quando a câmera afasta) e anda em passos de 1 pixel do mapa de sombra,
// senão as bordas das sombras ficam tremendo quando o carro anda.
let shadowBox=34;const _d=new THREE.Vector3(),_r=new THREE.Vector3(),_u=new THREE.Vector3(),_c=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0);
function setShadowBox(half){
  half=Math.ceil(half/6)*6;if(half===shadowBox)return;shadowBox=half;
  const sc=sun.shadow.camera;sc.left=-half;sc.right=half;sc.top=half;sc.bottom=-half;sc.updateProjectionMatrix();
}
function placeSun(cx,cz,dx,dy,dz){
  _d.set(dx,dy,dz).normalize();_r.crossVectors(UP,_d).normalize();_u.crossVectors(_d,_r);
  const texel=2*shadowBox/sun.shadow.mapSize.x;
  _c.set(cx,0,cz);const a=Math.round(_c.dot(_r)/texel)*texel,b=Math.round(_c.dot(_u)/texel)*texel,c=_c.dot(_d);
  _c.copy(_r).multiplyScalar(a).addScaledVector(_u,b).addScaledVector(_d,c);
  sun.target.position.copy(_c);sun.position.copy(_c).addScaledVector(_d,90);
  sun.target.updateMatrixWorld();
}

// ---------- luz do dia, céu e cidade à noite ----------
// Paleta por hora do dia: céu/neblina, sol (cor e força), luz ambiente de cima e de baixo, mar e água rasa.
// Entre duas horas da tabela as cores se misturam. De noite o "sol" vira a lua: luz fraca e azulada.
const SKY_KEYS=[
  // hora  céu        sol        força  amb.céu    amb.chão   amb.força mar        raso
  [0,    '#0b1028','#7f95d6',0.35,'#3a4c86','#1b1a26',0.5,'#0a1a33','#16485a'],
  [4.8,  '#0b1028','#7f95d6',0.35,'#3a4c86','#1b1a26',0.5,'#0a1a33','#16485a'],
  [5.6,  '#3b2f5c','#ff9f80',0.5, '#7a6aa8','#3a2e3a',0.55,'#24365e','#3a7f93'],
  [6.4,  '#f4a582','#ffb488',1.4, '#f2c4b0','#6b5848',0.75,'#3b6e9a','#58c4c4'],
  [7.6,  '#9fd0f0','#fff1d8',2.2, '#e4f2ff','#6a7558',0.95,'#2683ad','#3fc1c9'],
  [15.8, '#8ec6ee','#fff4e0',2.3, '#dfefff','#5a6b4a',0.95,'#2683ad','#3fc1c9'],
  [17.1, '#f6b26b','#ffb066',2.0, '#ffd9a8','#6b5240',0.8, '#3a6f96','#5cc6c0'],
  [17.9, '#ef7a52','#ff7f45',1.3, '#f2a07a','#5a3c38',0.7, '#3d5f86','#4ea7b4'],
  [18.7, '#5a3f78','#c77fa0',0.55,'#7a64a8','#2e2433',0.6, '#1f2f58','#2f6f86'],
  [19.6, '#0b1028','#7f95d6',0.35,'#3a4c86','#1b1a26',0.5,'#0a1a33','#16485a'],
  [24,   '#0b1028','#7f95d6',0.35,'#3a4c86','#1b1a26',0.5,'#0a1a33','#16485a'],
].map(k=>[k[0],new THREE.Color(k[1]),new THREE.Color(k[2]),k[3],new THREE.Color(k[4]),new THREE.Color(k[5]),k[6],new THREE.Color(k[7]),new THREE.Color(k[8])]);
const skyNow={bg:new THREE.Color(),sun:new THREE.Color(),hs:new THREE.Color(),hg:new THREE.Color(),sea:new THREE.Color(),sh:new THREE.Color(),si:0,hi:0};
function skyAt(h){
  let i=0;while(i<SKY_KEYS.length-2&&SKY_KEYS[i+1][0]<=h)i++;
  const a=SKY_KEYS[i],b=SKY_KEYS[i+1],t=clamp((h-a[0])/Math.max(0.001,b[0]-a[0]),0,1),s=t*t*(3-2*t);
  skyNow.bg.copy(a[1]).lerp(b[1],s);skyNow.sun.copy(a[2]).lerp(b[2],s);skyNow.si=lerp(a[3],b[3],s);
  skyNow.hs.copy(a[4]).lerp(b[4],s);skyNow.hg.copy(a[5]).lerp(b[5],s);skyNow.hi=lerp(a[6],b[6],s);
  skyNow.sea.copy(a[7]).lerp(b[7],s);skyNow.sh.copy(a[8]).lerp(b[8],s);
  return skyNow;
}
function updateSky(cx,cz){
  const dk=darkness(), k=skyAt(S.tod);
  if(!(scene.background instanceof THREE.Color))scene.background=new THREE.Color();
  scene.background.copy(k.bg);scene.fog.color.copy(k.bg);
  // sol cruza o céu de leste (6h) pra oeste (18h), baixinho no fim da tarde (sombras compridas);
  // de noite a lua faz o mesmo caminho, alta e mais pro sul
  const day=S.tod>=5.5&&S.tod<19.2;
  const t=day?(S.tod-5.5)/13.7:((S.tod-19.2+24)%24)/10.3, ang=Math.PI*clamp(t,0,1);
  const sx=Math.cos(ang)*-60, sy=Math.max(day?6:30,Math.sin(ang)*(day?70:55)), sz=day?30:45;
  placeSun(cx,cz,-sx,sy,sz);
  sun.intensity=k.si;sun.color.copy(k.sun);
  hemi.intensity=k.hi;hemi.color.copy(k.hs);hemi.groundColor.copy(k.hg);
  mats.lit.opacity=clamp((dk-0.25)*1.6,0,1);
  // mar: cor e brilho do sol/lua mudam com a hora; ondas andam
  const wm=water.userData.mat;wm.color.copy(k.sea);
  if(water.userData.u){water.userData.u.uShallow.value.copy(k.sh);water.userData.u.uGlow.value=0.32-0.2*dk;}
  wm.specular.setScalar(0.22*(1-dk)+0.1);
  if(water.userData.u)water.userData.u.uTime.value=S.gameTime;
  updateNeon(dk);
  mats.lightPool.opacity=(R.retro?0.22:0.34)*dk*(lightsOn()?0.45:1); // com luz de verdade o desenho no chão só completa
  mats.lampHead.emissiveIntensity=dk>0.05?1.5*dk:0;
  // estádio: torcida e refletores
  for(const s of city.special3d){
    const live=matchOn();const lit=dk>0.2||live;
    s.fieldLight.visible=lit;mats.fieldGlow.opacity=lit?(dk>0.2?0.55:0.15):0;
    s.lightBoxes.children.forEach(m=>m.material=lit?mat('#fffde7','e'):mats.lampHead);
    const seats=s.crowd.userData.seats;const opp=opponent();
    if(s._live!==live){s._live=live;const dens=live?0.85:0.08;
      seats.forEach((p,i)=>{const h=Math.abs(Math.sin(i*12.9898)*43758.5453)%1;const hh=Math.abs(Math.sin(i*78.233)*12345.678)%1;
        const col=h>dens?'#5b6670':hh<0.68?HOME.colors[hh<0.4?0:1]:opp.colors[hh<0.84?0:1];s.crowd.setColorAt(i,new THREE.Color(col));});
      s.crowd.instanceColor.needsUpdate=true;}
    s.crowd.position.y=live?Math.abs(Math.sin(S.gameTime*6))*0.06:0;
  }
}
const BULB={r:[new THREE.Color('#ff3b30'),new THREE.Color('#3a1212')],y:[new THREE.Color('#ffcc00'),new THREE.Color('#3a3212')],g:[new THREE.Color('#34c759'),new THREE.Color('#123a1a')]};
let sigT=0;
function updateSignals(signalState){
  sigT-=1;if(sigT>0)return;sigT=6;
  city.heads3.forEach((h,k)=>{const st=signalState(h.i,h.j,h.axis);['r','y','g'].forEach((c,ci)=>city.bulbs[ci].setColorAt(k,BULB[c][st===c?0:1]));});
  for(const b of city.bulbs)b.colorsDirty();
}

// prepara (compila) os efeitos da placa de vídeo antes de precisar, pra não engasgar na 1ª sirene/freio/explosão
function warmUp(){
  try{const g=new THREE.Group();
    for(const m of [brakeOn,brakeOff,headMat,wreckMat,beamMat,tailMat,tailMatBrake,mats.detail,...sirR,...sirB,mat('#888')]){const x=new THREE.Mesh(boxG,m);x.castShadow=true;g.add(x);}
    g.position.set(cam.x*U,0,cam.y*U);scene.add(g);renderer.compile(scene,camera);scene.remove(g);}catch(e){}
}
// tempo que a placa de vídeo leva pra desenhar o quadro (só com o painel F3 aberto e se o navegador deixar medir)
let tq=null;
function gpuTimerBegin(){
  if(!R.wantGpu)return;const gl=renderer.getContext();
  if(!tq){let ext=null;try{ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');}catch(e){}tq={ext,pend:[],ms:null,cur:null};}
  if(!tq.ext)return;
  while(tq.pend.length){const q=tq.pend[0];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))break;
    if(!gl.getParameter(tq.ext.GPU_DISJOINT_EXT)){const ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;tq.ms=tq.ms===null?ms:tq.ms*0.9+ms*0.1;}
    gl.deleteQuery(q);tq.pend.shift();}
  if(tq.pend.length>4)return;tq.cur=gl.createQuery();gl.beginQuery(tq.ext.TIME_ELAPSED_EXT,tq.cur);
}
function gpuTimerEnd(){if(!tq||!tq.cur)return;const gl=renderer.getContext();gl.endQuery(tq.ext.TIME_ELAPSED_EXT);tq.pend.push(tq.cur);tq.cur=null;}
// dados pro painel de diagnóstico (F3)
let gpuName=null;
export function gfxInfo(){
  if(!renderer)return null;
  if(gpuName===null){try{const gl=renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');gpuName=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(err){gpuName='?';}}
  const sz=new THREE.Vector2();renderer.getDrawingBufferSize(sz);
  return {gpu:gpuName,calls:renderer.info.render.calls,tris:renderer.info.render.triangles,w:sz.x,h:sz.y,dpr:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled,quality,chunks:Object.keys(ground).length,gpuMs:tq&&tq.ext&&tq.ms!==null?tq.ms:null,gpuTimer:tq?!!tq.ext:null};
}
// ---------- quadro ----------
// Qualidade: 3 = realista (realista.js), 2 = alta, 1 = média, 0 = leve.
export const QNAMES=['leve','média','alta','realista'];
let frameN=0,camZ=1,lastT=performance.now(),slow=0,quality=2,sizeKey='',autoOK=true;
export function getQuality(){return quality;}
export function applyQuality(q,manual){
  const flip=(q>0)!==(quality>0);
  quality=q;
  if(flip){rebuildCars();applyProps();}if(manual)autoOK=false;if(!renderer)return;
  const dpr=window.devicePixelRatio||1;
  // realista: até 1,5x em tela de alta densidade (com antisserrilhado 4x e bloom, 2x pesa muito e quase não aparece)
  renderer.setPixelRatio(q===3?Math.min(1.5,dpr):q===2?Math.min(2,dpr):q===1?Math.min(1,dpr):Math.min(0.75,dpr));
  const sh=q>0, ms=q>=2?2048:1024;
  // realista: sombras de borda suave; saindo dele, os materiais Lambert voltam
  const st=q===3?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
  if(renderer.shadowMap.type!==st){renderer.shadowMap.type=st;scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});}
  if(q<2){swapScene(scene,false);scene.environment=null;}
  setLightQuality(q);
  if(sun.shadow.mapSize.x!==ms){sun.shadow.mapSize.set(ms,ms);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  if(renderer.shadowMap.enabled!==sh){renderer.shadowMap.enabled=sh;sun.castShadow=sh;scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);});[brakeOn,brakeOff,headMat,wreckMat,beamMat,...sirR,...sirB].forEach(m=>m.needsUpdate=true);if(R.ok)warmUp();}
  sizeKey='';
}
// se o computador não aguentar (abaixo de ~35 quadros por segundo por uns 3 s), baixa a qualidade sozinho
function adapt(){
  const now=performance.now(),dt=now-lastT;lastT=now;
  if(!autoOK||!S.started||S.paused||dt>500)return;
  slow=dt>28?slow+1:Math.max(0,slow-2);
  if(slow>100&&quality>0){slow=0;applyQuality(quality-1);
    try{localStorage.setItem('aq_gfx','3d'+quality);}catch(e){}
    R.notice='Gráficos ajustados pra rodar mais leve: qualidade '+QNAMES[quality]+' (G troca).';}
}
// compila os programas da placa de vídeo com as luzes da noite do outro jeito (ligadas de dia, desligadas de noite),
// no mesmo estado em que o quadro é desenhado (tone mapping na alta; alvo intermediário no realista), senão não servem
let prepRT=null;
function prepLights(){
  const tm=renderer.toneMapping,rt=renderer.getRenderTarget();
  try{
    if(quality===2)renderer.toneMapping=THREE.ACESFilmicToneMapping;
    if(quality===3){prepRT=prepRT||new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType});renderer.setRenderTarget(prepRT);}
    withNightLights(!nightLightsOn(),()=>{if(renderer.compileAsync)renderer.compileAsync(scene,camera).catch(()=>{});else renderer.compile(scene,camera);});
  }catch(e){}
  renderer.toneMapping=tm;renderer.setRenderTarget(rt);
}
// anéis amarelos dos orelhões tocando (antes eram pintados na textura do chão, que aí mudava todo quadro)
let rings=null;
function syncPhoneRings(vx0,vx1,vz0,vz1){
  if(!rings){rings=[];const g=new THREE.RingGeometry(17*U,19*U,48);g.rotateX(-Math.PI/2);
    const m=new THREE.MeshLambertMaterial({color:'#ffdc3c',transparent:true,opacity:0.8,depthWrite:false});m.userData.pbr={r:0.95};
    for(let i=0;i<6;i++){const o=new THREE.Mesh(g,m);o.renderOrder=1;o.receiveShadow=true;o.visible=false;scene.add(o);rings.push(o);}}
  let n=0;
  if(!S.mission&&S.phoneCd<=0&&!S.interior)for(const ph of phonesList){if(n>=rings.length)break;
    const x=ph.x*U,z=ph.y*U;if(x<vx0-2||x>vx1+2||z<vz0-2||z>vz1+2)continue;
    const o=rings[n++];o.visible=true;o.position.set(x,0.03,z);o.scale.setScalar((18+Math.sin(S.gameTime*8)*4)/18);}
  for(let i=n;i<rings.length;i++)rings[i].visible=false;
}
// altura dos prédios por tile (pra saber se um prédio fica entre a câmera 3/4 e o jogador)
let hgrid=null;
function buildHgrid(){
  if(!hgrid){hgrid=new Float32Array(W*H);
    for(const b of buildingsList_){if(b.kind==='canopy')continue;const h=bh(b);
      for(let y=Math.floor(b.y0/T);y<Math.ceil(b.y1/T);y++)for(let x=Math.floor(b.x0/T);x<Math.ceil(b.x1/T);x++)
        if(x>=0&&y>=0&&x<W&&y<H&&hgrid[y*W+x]<h)hgrid[y*W+x]=h;}}
  return hgrid;
}
const hAt=(x,z)=>{const gx=Math.floor(x),gz=Math.floor(z);return gx<0||gz<0||gx>=W||gz>=H?0:hgrid[gz*W+gx];};
function occluded(px,pz,fx,fz,back,up){
  buildHgrid();
  // linhas da traseira do carro (rente ao chão) até a câmera: no meio e dos dois lados
  const sx=-fz*0.9, sz=fx*0.9, ox=px-fx*0.7, oz=pz-fz*0.7, bk=back-0.7;
  for(let i=1;i<=12;i++){const t=i/12, ry=0.25+(up-0.25)*t;
    for(const o of [0,1,-1]){const gx=Math.floor(ox-fx*bk*t+sx*o), gz=Math.floor(oz-fz*bk*t+sz*o);
      if(gx<0||gz<0||gx>=W||gz>=H)continue;if(hgrid[gz*W+gx]>ry)return 1;}}
  return 0;
}
// ---------- câmera de ombro (a pé) ----------
// Atrás e um pouco acima do jogador, perto. O mouse (ponteiro preso) gira pros lados e pra cima/baixo; sem mouse ela
// vai sozinha pra trás de onde ele anda (o código da 3/4 acima). Mirando (botão direito) ela chega mais perto e vai
// pro lado do ombro direito, com a mira no centro da tela. Parede entre a câmera e o jogador: a câmera encosta
// (chega mais perto) em vez de subir. Entrar/sair do carro mistura as duas câmeras (R.ob vai de 0 a 1).
const P0=0.3, _cp=new THREE.Vector3(), _ct=new THREE.Vector3(), _dir=new THREE.Vector3();
function shoulderCam(dtc,fx0,fz0,shx,shz){
  const om=view.ombro;
  R.ob=lerp(R.ob||0,om?1:0,1-Math.exp(-dtc*(om?3.5:5)));if(!om&&R.ob<0.003)R.ob=0;
  if(R.pitch===undefined)R.pitch=P0;
  if(om&&mouse.locked&&(mouse.dx||mouse.dy)){
    const k=0.0024*(player.aiming?0.6:1); // mirando: mais devagar, pra acertar
    R.yaw+=mouse.dx*k;if(!player.aiming)R.pitch=clamp(R.pitch+mouse.dy*k*0.85,-0.2,1.0);R.mouseT=performance.now();}
  mouse.dx=mouse.dy=0;
  // mirando a câmera fica quase reta (o tiro é sempre na horizontal); sem mexer no mouse um tempo a inclinação volta pro normal
  if(om&&player.aiming)R.pitch=lerp(R.pitch,0.1,1-Math.exp(-dtc*10));
  else if(!mouse.locked||performance.now()-(R.mouseT||0)>2500)R.pitch=lerp(R.pitch,P0,1-Math.exp(-dtc*1.2));
  R.az=lerp(R.az||0,om&&player.aiming?1:0,1-Math.exp(-dtc*9));
  view.aim=null;
  if(R.ob<=0)return;
  const fx=Math.cos(R.yaw),fz=Math.sin(R.yaw),pit=R.pitch,cp=Math.cos(pit),sp=Math.sin(pit);
  _dir.set(fx*cp,-sp,fz*cp);
  // o pivô segue o jogador de perto (no carro não: a mistura usa o último ponto)
  const lx=player.x*U,lz=player.y*U;
  if(om){if(R.ox===undefined||Math.hypot(lx-R.ox,lz-R.oz)>3){R.ox=lx;R.oz=lz;}else{const kf=1-Math.exp(-dtc*14);R.ox=lerp(R.ox,lx,kf);R.oz=lerp(R.oz,lz,kf);}}
  const side=lerp(0.05,0.4,R.az), dist=lerp(2.8,1.6,R.az), ph=lerp(0.78,0.74,R.az);
  const bx=R.ox-fz*side, by=ph, bz=R.oz+fx*side;
  // encosta na parede: anda do pivô pra trás e para antes do primeiro prédio mais alto que a linha
  buildHgrid();let d=dist;
  for(let i=1;i<=14;i++){const t=dist*i/14,x=bx-_dir.x*t,y=by-_dir.y*t,z=bz-_dir.z*t;
    if(hAt(x,z)>y-0.08||hAt(x+0.15,z)>y-0.08||hAt(x-0.15,z)>y-0.08||hAt(x,z+0.15)>y-0.08||hAt(x,z-0.15)>y-0.08){d=Math.max(0.45,t-0.3);break;}}
  R.od=R.od===undefined?d:lerp(R.od,d,1-Math.exp(-dtc*(d<R.od?25:3)));
  // encostada na parede ela sobe um pouco, pra olhar por cima da cabeça
  _cp.set(bx-_dir.x*R.od,Math.max(0.15,by-_dir.y*R.od+(dist-R.od)*0.22),bz-_dir.z*R.od);
  _ct.copy(_cp).addScaledVector(_dir,6);
  if(R.ob<1){ // mistura com a câmera de cima/atrás do carro
    const oldT=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(8).add(camera.position);
    _cp.lerpVectors(camera.position,_cp,R.ob);_ct.lerpVectors(oldT,_ct,R.ob);}
  camera.position.set(_cp.x+shx*0.3,_cp.y,_cp.z+shz*0.3);camera.lookAt(_ct);
  // mira: um ponto bem à frente na direção da câmera (o jogador vira pra ele; o tiro sai na horizontal)
  if(om)view.aim={x:(camera.position.x+fx*30)*T,y:(camera.position.z+fz*30)*T};
}
export function render3D(signalState){
  frameN++;adapt();
  if(R.notice){S.messages.push({t:R.notice,life:4});R.notice=null;}
  // redimensionar o canvas apaga e recria os buffers da GPU: só faz quando a janela muda
  const sk=CW+'x'+CH+'@'+renderer.getPixelRatio();
  if(sk!==sizeKey){sizeKey=sk;renderer.setSize(CW,CH,false);camera.aspect=CW/CH;camera.updateProjectionMatrix();}
  // sombras: todo quadro na alta, quadro sim quadro não na média
  if(renderer.shadowMap.enabled&&(quality>=2||frameN%2===0))renderer.shadowMap.needsUpdate=true;
  // câmera inclinada acima do jogador (afasta com a velocidade)
  const zn=cam.zoom/clamp(CH/820,0.7,1.6);camZ=lerp(camZ,zn,0.1);
  const dist=24/clamp(camZ,0.5,1.3);
  {const sp=player.car?Math.abs(player.car.fwdSpeed()):0,ob=R.ob||0,fov=lerp(42+clamp((sp-150)/500,0,1)*5,lerp(60,47,R.az||0),ob);
    // de perto (câmera de ombro) o plano de corte da frente chega mais perto, senão a parede encostada some
    const near=ob>0.3?0.1:0.5;if(camera.near!==near){camera.near=near;camera.updateProjectionMatrix();}
    if(Math.abs(camera.fov-fov)>0.02){camera.fov=lerp(camera.fov,fov,ob>0&&ob<1?0.2:0.06);camera.updateProjectionMatrix();}}
  let tx=cam.x*U, tz=cam.y*U;
  const shx=(Math.random()-.5)*S.shake*0.05, shz=(Math.random()-.5)*S.shake*0.05;
  let hw,vz0,vz1,vx0,vx1;
  view.r34=!!(R.cam34&&!S.interior);
  view.ombro=view.r34&&!player.car&&player.state==='play';
  if(S.camYaw!==undefined){R.yaw=S.camYaw;R.fx=undefined;R.lift=0;S.camYaw=undefined;} // saiu de um lugar: começa olhando pra rua
  if(view.r34){
    // câmera 3/4: atrás do carro, inclinada, gira com a direção dele com um atraso nas curvas.
    // A pé ela fica parada na última direção e sobe um pouco (mais fácil de mirar com o mouse).
    const pc=player.car, sp=pc?Math.abs(pc.fwdSpeed()):0;
    const now=performance.now(), dtc=Math.min(0.1,(now-(R.ct||now))/1000);R.ct=now;
    if(R.yaw===undefined)R.yaw=pc?pc.a:-Math.PI/2;
    else if(pc&&sp>8){
      // de ré a câmera não dá meia-volta: só segue o carro andando pra frente
      if(pc.fwdSpeed()>0)R.yaw+=Math.atan2(Math.sin(pc.a-R.yaw),Math.cos(pc.a-R.yaw))*(1-Math.exp(-dtc*3.2));}
    else if(!pc&&!mouse.locked&&!player.aiming&&S.gameTime-(player.walkT||-9)<0.15){
      // a pé: a câmera vai pra trás de onde o jogador está andando (mirar com o mouse não gira a câmera).
      // Andando pra trás (rumo à câmera) ela não dá meia-volta
      const da=Math.atan2(Math.sin(player.moveA-R.yaw),Math.cos(player.moveA-R.yaw));
      if(Math.abs(da)<1.9)R.yaw+=da*(1-Math.exp(-dtc*2.4));}
    view.yaw=R.yaw;
    const fx=Math.cos(R.yaw),fz=Math.sin(R.yaw);
    // ponto que a câmera segue: no carro, colado; a pé, vem macio e um pouco à frente de onde ele anda
    {const walking=!pc&&S.gameTime-(player.walkT||-9)<0.15, lx=player.x*U+(walking?Math.cos(player.moveA)*1.2:0), lz=player.y*U+(walking?Math.sin(player.moveA)*1.2:0);
      if(pc||R.fx===undefined||Math.hypot(lx-R.fx,lz-R.fz)>6){R.fx=lx;R.fz=lz;}
      else{const kf=1-Math.exp(-dtc*5);R.fx=lerp(R.fx,lx,kf);R.fz=lerp(R.fz,lz,kf);}}
    const px=R.fx,pz=R.fz;
    let back=pc?8+sp/90:6.5, up=pc?8+sp/90:8.5, ahead=pc?2+sp/150:1.5;
    // prédio no caminho entre a câmera e o jogador: a câmera sobe e chega mais perto (fica mais "de cima")
    // (testa do jeito normal até o mais de cima e fica com o primeiro que enxerga o jogador)
    let want=1;for(const l of [0,0.25,0.5,0.75,0.9]){if(!occluded(px,pz,fx,fz,back*(1-0.85*l),up*(1+0.4*l))){want=l;break;}}
    R.lift=lerp(R.lift||0,want,1-Math.exp(-dtc*(want>(R.lift||0)?8:1.5)));
    back*=1-0.85*R.lift;up*=1+0.4*R.lift;
    // entrar/sair do carro e acelerar: a distância muda suave
    const k=1-Math.exp(-dtc*4);
    if(R.cb===undefined){R.cb=back;R.cu=up;R.ca=ahead;}
    R.cb=lerp(R.cb,back,k);R.cu=lerp(R.cu,up,k);R.ca=lerp(R.ca,ahead,k);
    camera.position.set(px-fx*R.cb+shx,R.cu,pz-fz*R.cb+shz);camera.lookAt(px+fx*R.ca,0,pz+fz*R.ca);
    shoulderCam(dtc,fx,fz,shx,shz);
    // o que aparece na tela fica mais à frente: carrega um quadrado em volta desse ponto
    // (na câmera de ombro dá pra ver mais longe: o quadrado vai mais pra frente)
    const fa=lerp(14,18,R.ob),cx=R.fx+Math.cos(R.yaw)*fa,cz=R.fz+Math.sin(R.yaw)*fa, r=lerp(34,38,R.ob);
    hw=r;vx0=cx-r;vx1=cx+r;vz0=cz-r;vz1=cz+r;tx=cx;tz=cz;
  }else{
  camera.position.set(tx+shx,dist*0.92,tz+dist*0.62+shz);camera.lookAt(tx,0,tz-1);
  // área do chão que aparece na tela (a câmera olha inclinada: mais longe pra cima, perto embaixo)
  hw=1.62*dist*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect+2;
  vz0=tz-0.75*dist-2;vz1=tz+0.45*dist+2;vx0=tx-hw;vx1=tx+hw;
  }
  const night=darkness();
  setShadowBox(Math.max(hw,(vz1-vz0)/2)+2);
  updateSky(tx,(vz0+vz1)/2);
  updateSignals(signalState);
  const pc=player.car, ahead=pc?{x:(pc.vx||0)*U*1.2,z:(pc.vy||0)*U*1.2}:null;
  updateGround(vx0,vx1,vz0,vz1,ahead&&Math.hypot(ahead.x,ahead.z)>2?ahead:null);
  // camada de detalhes do chão: centrada um pouco à frente da câmera, presa numa grade
  const ocx=Math.round(tx/4)*4, ocz=Math.round((tz-6)/4)*4;
  if(frameN%2===0||!overlayMesh.userData.ok){overlayMesh.userData.ok=true;
    overlayMesh.position.set(ocx,0.025,ocz); // a placa só anda junto com o desenho novo (senão pisca)
    // anota o desenho e só redesenha/envia pra placa de vídeo se ficou diferente do último (gravador.js)
    const rec=overlayRec,g=rec.ctx;rec.begin();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,1024,1024);
    const k=1024/(64*T); g.setTransform(k,0,0,k,-(ocx-32)*T*k,-(ocz-32)*T*k);
    const vx0=(ocx-32)*T,vy0=(ocz-32)*T;
    R.last=drawGround2D(g,vx0,vx0+64*T,vy0,vy0+64*T,'3d');
    const h=rec.end(),painted=rec.painted;
    // nada pintado: a placa (transparente, mas cobrindo meia tela) nem é desenhada
    overlayMesh.visible=painted;
    if(painted&&h!==overlayHash){rec.replay();overlayTex.needsUpdate=true;}
    overlayHash=painted?h:null;
  }
  syncPhoneRings(vx0,vx1,vz0,vz1);
  syncCars(night);syncCheckpoints();syncPeople();syncParticles();syncTracers();
  {const now=performance.now();updateLights(tx,(vz0+vz1)/2,night,Math.min(0.1,(now-(R.lt||now))/1000));R.lt=now;}
  gpuTimerBegin();
  if(quality>=2){ // alta e realista: materiais com reflexo e o céu como luz ambiente (a luz de cima/baixo fica só de apoio)
    // o céu ilumina ~π vezes mais que a HemisphereLight na mesma cor: 0,32 deixa a sombra do sol com o contraste certo.
    // De noite o céu é quase preto: sobe o ambiente (luar) e as poças de luz dos postes ficam mais discretas (o bloom já realça)
    swapScene(scene,true);updateEnv(renderer,scene,skyNow,sun);
    hemi.intensity*=lerp(0.15,0.55,night);scene.environmentIntensity=lerp(0.32,1.2,night);mats.lightPool.opacity*=0.4;}
  // prepara já os programas da placa de vídeo do outro jeito das luzes (dia/noite), uma vez por qualidade (luzes.js)
  if(R.lightPrep!==quality&&!R.retro){R.lightPrep=quality;prepLights();}
  if(R.retro)retroPass();else if(quality===3)renderReal(renderer,scene,camera,night);else if(quality===2)renderPlain(renderer,scene,camera,night);else renderer.render(scene,camera);
  gpuTimerEnd();
  // HUD e avisos por cima, em 2D
  const g=ctx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,CW*DPR,CH*DPR);g.setTransform(DPR,0,0,DPR,0,0);
  drawPrompts(g);
  drawHUD(g,(R.last&&R.last.tgt)||null);
}

// avisos com tecla e textos que flutuam (projetados do 3D pra tela)
function drawPrompts(g){
  const P=(x,y,h)=>view.project(x,y,h);
  const nearB=R.last&&R.last.nearB;
  if(!player.car&&player.state==='play'){
    const nc=nearestCar(26);
    const carCloser=nc&&(!nearB||hyp(nc.x-player.x,nc.y-player.y)-nc.t.wid/2<hyp(doorOf(nearB).x-player.x,doorOf(nearB).y-player.y));
    if(nc&&carCloser){const p=P(nc.x,nc.y,1.2);g.font=pf(12);const t=(nc.driver==='ai'?'Roubar ':'Entrar: ')+nc.t.name;drawKeycap(g,'F',p.x-(g.measureText(t).width+28)/2,p.y,t,12);}
    else if(nearB){const d=doorOf(nearB);const p=P(d.x,d.y,1.75);const name=ICONS[KIND_ICON[nearB.kind]].name.split(' (')[0].split(' ·')[0];g.font=pf(13);drawKeycap(g,'F',p.x-(g.measureText('Entrar: '+name).width+30)/2,p.y,'Entrar: '+name,13);}
  }
  // ícone do lugar flutuando em cima da porta (some de perto, quando aparece o F)
  if(!player.car||Math.abs(player.car.fwdSpeed())<200)for(const b of enterables()){if(b===nearB||b.kind==='estadio')continue;const d=doorOf(b);const dd=hyp(d.x-player.x,d.y-player.y);if(dd>620)continue;
    const q=P(d.x,d.y,2.15+Math.sin(S.gameTime*2.5+b.x0)*0.06);if(q.behind||q.x<-30||q.y<-30||q.x>CW+30||q.y>CH+30)continue;
    g.globalAlpha=clamp((620-dd)/150,0,1)*0.92;drawIcon(g,KIND_ICON[b.kind],q.x,q.y,dd<200?22:18);g.globalAlpha=1;}
  // passageiro esperando e carros da missão: setinha amarela em cima
  for(const p of S.peds)if(p.state==='wait'){const q=P(p.x,p.y,1.05+Math.sin(S.gameTime*6)*0.1);arrowDown(g,q.x,q.y);}
  if(S.mission)for(const c of S.cars)if(c.mission===S.mission&&!c.wreck){const q=P(c.x,c.y,1.8+Math.sin(S.gameTime*6)*0.1);arrowDown(g,q.x,q.y);
    if(c.maxHp){const f=clamp(c.health/c.maxHp,0,1);g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(q.x-21,q.y-24,42,7);g.fillStyle=f>0.4?'#4cff6a':'#ff5030';g.fillRect(q.x-20,q.y-23,40*f,5);}}
  // gente da história: nome em cima e F pra falar; a viatura seguida ganha a setinha
  {const near=storyNear();for(const l of storyLabels()){const dd=hyp(l.x-player.x,l.y-player.y);if(dd>700)continue;const q=P(l.x,l.y,1.25);if(q.behind)continue;
    g.globalAlpha=clamp((700-dd)/150,0,1);label(g,l.t,q.x,q.y,l.col,14);g.globalAlpha=1;
    if(l.p===near){g.font=pf(12);drawKeycap(g,'F',q.x-(g.measureText('Falar').width+28)/2,q.y+14,'Falar',12);}}}
  {const t=R.last&&R.last.tgt;if(t&&t.story&&t.t&&!t.wreck){const q=P(t.x,t.y,1.8+Math.sin(S.gameTime*6)*0.1);if(!q.behind){arrowDown(g,q.x,q.y);if(t.label)label(g,t.label,q.x,q.y-14,'#ffe14a',13);}}}
  for(const f of S.floaters){const q=P(f.x,f.y,1.5);g.globalAlpha=clamp(f.life,0,1);label(g,f.t,q.x,q.y,f.col,15);}g.globalAlpha=1;
  // placar do estádio
  if(matchOn()){const st=city.special3d[0];if(st){const b=st.b,q=P((b.x0+b.x1)/2,b.y0,bh(b)*1.4+1.5);const m=match();if(!q.behind)label(g,HOME.name+' '+m.hs+' x '+m.as+' '+opponent().name,q.x,q.y,'#ffe14a',14);}}
}
function arrowDown(g,x,y){g.fillStyle='#ffe14a';g.strokeStyle='#000';g.lineWidth=1.5;g.beginPath();g.moveTo(x,y+8);g.lineTo(x-7,y-4);g.lineTo(x+7,y-4);g.closePath();g.fill();g.stroke();}
