// Bairros fechados pela "Operação Maré Alta": blitz em cada rua que entra num bairro ainda não liberado.
//  - devagar: o policial barra ("só morador") e o carro volta
//  - rápido: quebra a cancela, pega 3 estrelas e o tapete de pregos fura os pneus
//  - a pé: grade na calçada
//  - dentro de área fechada a polícia não larga (no mínimo 3 estrelas)
// Ao bater a meta de dinheiro, um contato "desenrola" e a blitz daquele bairro é desmontada.
import { T, W, H, VL, HL, NV, NH, segH, segV, solidAt } from '../world/map.js';
import { zoneAt } from '../world/zoning.js';
import { hyp, rand, clamp } from '../core/utils.js';
import { Car } from '../entities/vehicles.js';
import { Ped } from '../entities/peds.js';
import { addHeat, msg, big, heatStars } from './world.js';
import { sfxTone, sfxNoise } from '../audio/audio.js';
import { S, player } from '../core/state.js';
import { footOpen } from './story.js';

export const START_OPEN=['centro','jardim'];
export const DISTRICT_ORDER=[
  {z:'cajueiro',meta:2000, name:'Morro do Cajueiro', story:'capítulo 1'}, // abre pela história (story.js)
  {z:'rico',    meta:5000, name:'Barra Sul'},
  {z:'orla',    meta:10000,name:'Praia do Recanto'},
  {z:'velha',   meta:16000,name:'Vila dos Pescadores'},
  {z:'porto',   meta:25000,name:'Cais do Porto'},
];
export const ZONE_NAME={centro:'Centro',jardim:'Jacarandá',...Object.fromEntries(DISTRICT_ORDER.map(d=>[d.z,d.name]))};

export const isOpenZone=z=>!S.unlocked||S.unlocked.includes(z);
export function nextDistrict(){return DISTRICT_ORDER.find(d=>!isOpenZone(d.z))||null;}
// bairro que só abre pela história (com a história ligada a meta de dinheiro não vale)
export const storyLock=d=>!!(d&&d.story&&S.story);
export function metaOf(z){const d=DISTRICT_ORDER.find(d=>d.z===z);return d?d.meta:0;}

// ---- área restrita: o bairro fechado encolhido 4 tiles (as avenidas da divisa continuam livres) ----
const R=4;
export const restricted=new Uint8Array(W*H);
let maskCanvas=null,paperMask=null;
export function restrictedAt(px,py){const x=px/T|0,y=py/T|0;if(x<0||y<0||x>=W||y>=H)return false;return restricted[y*W+x]===1;}
export const isOpenAt=(px,py)=>!restrictedAt(px,py);
function computeRestricted(){
  restricted.fill(0);
  const Z=new Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)Z[y*W+x]=zoneAt(x,y);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const z=Z[y*W+x];if(isOpenZone(z))continue;
    let ok=true;
    for(let dy=-R;dy<=R&&ok;dy++)for(let dx=-R;dx<=R;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;if(Z[yy*W+xx]!==z){ok=false;break;}}
    if(ok)restricted[y*W+x]=1;
  }
  maskCanvas=null;paperMask=null;
}
// máscara hachurada pro mapa e minimapa (2 px por tile)
export function lockMask(){
  if(maskCanvas)return maskCanvas;
  const c=document.createElement('canvas');c.width=W*2;c.height=H*2;const g=c.getContext('2d');const img=g.createImageData(W*2,H*2);
  for(let y=0;y<H*2;y++)for(let x=0;x<W*2;x++){if(!restricted[(y>>1)*W+(x>>1)])continue;const o=(y*W*2+x)*4;const stripe=((x+y)%6)<2;
    img.data[o]=stripe?255:20;img.data[o+1]=stripe?60:10;img.data[o+2]=stripe?40:10;img.data[o+3]=stripe?150:90;}
  g.putImageData(img,0,0);maskCanvas=c;return c;
}

// máscara pro mapa de papel (4 px por tile): vermelho listrado nos fechados e linha forte na divisa
export function paperLockMask(){
  if(paperMask)return paperMask;
  const K=4,c=document.createElement('canvas');c.width=W*K;c.height=H*K;const g=c.getContext('2d');const img=g.createImageData(W*K,H*K),d=img.data;
  for(let y=0;y<H*K;y++)for(let x=0;x<W*K;x++){const tx=(x/K)|0,ty=(y/K)|0;if(!restricted[ty*W+tx])continue;const o=(y*W*K+x)*4;const stripe=((x+y)%14)<5;
    d[o]=stripe?190:170;d[o+1]=stripe?36:60;d[o+2]=stripe?24:50;d[o+3]=stripe?120:46;}
  g.putImageData(img,0,0);
  g.fillStyle='rgba(176,22,12,0.95)';
  for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){const r=restricted[ty*W+tx];
    if(tx<W-1&&restricted[ty*W+tx+1]!==r)g.fillRect((tx+1)*K-2,ty*K,4,K);
    if(ty<H-1&&restricted[(ty+1)*W+tx]!==r)g.fillRect(tx*K,(ty+1)*K-2,K,4);}
  paperMask=c;return c;
}

// ---- postos de controle: onde uma rua cruza a borda da área restrita ----
export let checkpoints=[];
function buildCheckpoints(){
  for(const cp of checkpoints)despawn(cp);
  const out=[];
  const scan=(L,horiz,from,to,fixed)=>{ // anda pela linha central da rua, tile a tile
    const fx=fixed/T|0;let prev=null;
    for(let t=from;t<=to;t++){
      const x=horiz?t:fx,y=horiz?fx:t;if(x<0||y<0||x>=W||y>=H)continue;
      const r=restricted[y*W+x];
      if(prev!==null&&r!==prev){
        // borda entre t-1 e t; "dentro" é o lado restrito
        const dir=r?1:-1, edge=t*T;                      // coordenada da borda (px)
        const inTile=r?t:t-1, ix=horiz?inTile:fx, iy=horiz?fx:inTile;
        out.push({x:horiz?edge:fixed,y:horiz?fixed:edge,dx:horiz?dir:0,dy:horiz?0:dir,L,horiz,
          half:L.w*T/2+T*1.6,zone:zoneAt(ix,iy),props:null,broken:0});
      }
      prev=r;
    }
  };
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i])scan(HL[j],true,VL[i].px/T|0,VL[i+1].px/T|0,HL[j].px);
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j])scan(VL[i],false,HL[j].px/T|0,HL[j+1].px/T|0,VL[i].px);
  checkpoints=out;
}

export function initDistricts(){
  if(!Array.isArray(S.unlocked))S.unlocked=[...START_OPEN];
  for(const z of START_OPEN)if(!S.unlocked.includes(z))S.unlocked.push(z);
  computeRestricted();buildCheckpoints();
}

// ---- viaturas e policiais da blitz (só existem perto do jogador) ----
function spawnProps(cp){
  const px=-cp.dy,py=cp.dx, side=cp.L.w*T/2+18, a=cp.horiz?0:Math.PI/2;
  const cars=[],guards=[];
  for(const s of [-1,1]){
    const x=cp.x+cp.dx*70+px*side*s, y=cp.y+cp.dy*70+py*side*s;
    const c=new Car('viatura',x,y,a);c.driver='ai';c.ai='cp';c.keep=true;S.cars.push(c);cars.push(c);
    const g=new Ped(cp.x+cp.dx*22+px*(cp.L.w*T/2+6)*s,cp.y+cp.dy*22+py*(cp.L.w*T/2+6)*s);
    g.state='guard';g.guard=cp;g.shirt='#1f3a6b';g.hair='#111';g.spd=110;g.a=Math.atan2(-cp.dy,-cp.dx);g.keep=true;S.peds.push(g);guards.push(g);
  }
  cp.props={cars,guards};
}
function despawn(cp){
  if(!cp.props)return;
  for(const c of cp.props.cars)if(c!==player.car&&c.ai==='cp')c.remove=true;
  for(const g of cp.props.guards)if(g.state==='guard')g.state='gone';
  cp.props=null;
}
// polícia da blitz parte pra cima
function alarm(cp){
  if(!cp.props)return;
  for(const c of cp.props.cars)if(c.ai==='cp'){c.ai='police';c.role='chase';}
  for(const g of cp.props.guards)if(g.state==='guard'){g.cop=true;g.state='cop';g.unit='policia';g.shootCd=rand(0.6,1.2);}
}

// desmonta a blitz de um bairro (meta de dinheiro ou fim de capítulo)
export function unlockZone(z){
  if(!S.unlocked)initDistricts();if(S.unlocked.includes(z))return;
  S.unlocked.push(z);
  for(const cp of checkpoints)if(cp.zone===z)despawn(cp);
  computeRestricted();buildCheckpoints();
  sfxTone(660,0.12,0.1);sfxTone(880,0.16,0.1,'square',0.12);sfxTone(1100,0.22,0.08,'square',0.26);
}
let introShown=false, msgCd=0, prevX=0, prevY=0, restrictT=0, warned=false;
export function updateDistricts(dt){
  if(!S.unlocked)initDistricts();
  msgCd-=dt;
  if(!introShown&&S.started&&player.state==='play'){introShown=true;const nd=nextDistrict();
    if(S.migratedDistricts){S.migratedDistricts=false;big('OPERAÇÃO MARÉ ALTA','Os bairros foram fechados e teu dinheiro foi zerado','#ffb36b',4);}
    if(nd&&!storyLock(nd))msg('Bairros fechados por blitz (hachurados no mapa). Junta $'+nd.meta.toLocaleString('pt-BR')+' pra liberar '+nd.name+'.',7);}
  // meta batida: desmonta a blitz do próximo bairro
  const nx=nextDistrict();
  if(nx&&!storyLock(nx)&&player.money>=nx.meta){
    unlockZone(nx.z);
    big(nx.name.toUpperCase()+' LIBERADO','O contato desenrolou: a blitz foi desmontada','#7dff6b',3.2);
    const n2=nextDistrict();if(n2)msg('Próximo: '+n2.name+' ao juntar $'+n2.meta.toLocaleString('pt-BR'),5);
  }
  const t=player.car||player, px0=prevX, py0=prevY;prevX=t.x;prevY=t.y;
  // props perto/longe
  for(const cp of checkpoints){
    const d=hyp(cp.x-t.x,cp.y-t.y);
    if(d<1300&&!cp.props)spawnProps(cp);else if(d>1900&&cp.props)despawn(cp);
    if(cp.broken>0)cp.broken-=dt;
    // cruzou a linha da blitz entrando?
    if(d>400||player.state!=='play')continue;
    const s0=(px0-cp.x)*cp.dx+(py0-cp.y)*cp.dy, s1=(t.x-cp.x)*cp.dx+(t.y-cp.y)*cp.dy;
    const lat=Math.abs((t.x-cp.x)*-cp.dy+(t.y-cp.y)*cp.dx);
    if(!(s0<0&&s1>=0&&lat<cp.half))continue;
    const c=player.car;
    if(cp.broken>0&&c){continue;} // cancela já quebrada: passa (com a polícia na cola)
    if(!c&&footOpen(cp.zone)){if(msgCd<=0){msgCd=4;msg('O PM da grade olha teu documento: "Morador? Passa."',3);}continue;} // caminho do capítulo, a pé
    if(!c||c.speed<110){
      // barrado: volta pra fora
      const back=c?c.t.len/2+8:10;
      if(c){c.x=cp.x-cp.dx*back;c.y=cp.y-cp.dy*back;c.vx=0;c.vy=0;sfxNoise(0.12,0.15,300);}
      else{player.x=cp.x-cp.dx*10;player.y=cp.y-cp.dy*10;}
      prevX=t.x;prevY=t.y;
      if(msgCd<=0){msgCd=3;const n=ZONE_NAME[cp.zone]||'bairro';const m=metaOf(cp.zone);
        msg(c?'Blitz: "Área sob operação, só morador. Volta!"':'Grade: "Área sob operação, só morador."',3);
        const nd=nextDistrict();
        if(nd&&nd.z===cp.zone&&storyLock(nd))msg(n+' abre com a história ('+nd.story+')',4);
        else if(nd&&nd.z===cp.zone)msg(n+' libera quando tu juntar $'+m.toLocaleString('pt-BR')+' (faltam $'+Math.max(0,m-Math.floor(player.money)).toLocaleString('pt-BR')+')',4);
        else msg(n+' só libera depois de '+(nd?nd.name:'outros bairros')+' (meta $'+m.toLocaleString('pt-BR')+')',4);}
    } else {
      // furou a blitz
      cp.broken=40;c.flat=true;
      if(player.heat<300)addHeat(300-player.heat);
      alarm(cp);
      big('FUROU A BLITZ!','Os pneus estouraram no tapete de pregos','#ff5050',2.4);
      sfxNoise(0.35,0.4,900);S.shake=Math.max(S.shake,10);
      for(let k=0;k<14;k++)S.parts.push({x:c.x,y:c.y,vx:rand(-120,120),vy:rand(-120,120),life:0.5,max:0.5,size:rand(3,6),col:'rgba(255,210,120,',fire:true});
    }
  }
  // dentro de área fechada: a polícia não larga
  if(player.state==='play'&&restrictedAt(t.x,t.y)&&!(!player.car&&footOpen(zoneAt(t.x/T|0,t.y/T|0)))){
    restrictT+=dt;
    if(!warned){warned=true;msg('Área sob operação policial! Sai daqui antes que te vejam.',3);}
    if(restrictT>3&&player.heat<250){addHeat(300-player.heat);big('INVASÃO DE ÁREA','A operação te viu dentro do bairro fechado','#ff5050',2.2);}
    if(restrictT>3)player.heat=Math.max(player.heat,250);
  } else {restrictT=0;warned=false;}
}

// policial parado na blitz: olha pra rua
export function updateGuard(p,dt){
  if(heatStars()>=3&&p.guard&&hyp(p.x-player.x,p.y-player.y)<500){p.cop=true;p.state='cop';p.unit='policia';p.shootCd=rand(0.6,1.2);return;}
  const cp=p.guard;if(cp)p.a=Math.atan2(-cp.dy,-cp.dx);
}
