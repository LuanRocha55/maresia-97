// IA da polícia: só sabe onde você está se alguém te viu.
//  - perseguidores vão atrás de você (ou da última posição vista)
//  - interceptadores tentam chegar na sua frente (posição prevista)
//  - sem contato por um tempo, a polícia vasculha a área onde te viu por último
//  - a partir de 3 estrelas, bloqueios na rua à frente
//  - quando você está a pé, policiais descem da viatura e vêm atrás
import { clamp, lerp, hyp, rand, pick } from '../core/utils.js';
import { T, W, H, ROAD, map, isSolidT, solidAt, tileAt, VL, HL, NV, NH, segH, segV } from '../world/map.js';
import { heatStars, msg } from '../game/world.js';
import { driveTo, randomRoadPoint } from './traffic.js';
import { Car } from '../entities/vehicles.js';
import { Ped } from '../entities/peds.js';
import { S, player } from '../core/state.js';

export const flow=new Int32Array(W*H), flowB=new Int32Array(W*H); const fq=new Int32Array(W*H);
function bfs(field,tx,ty){
  field.fill(-1);const px=clamp(tx/T|0,0,W-1),py=clamp(ty/T|0,0,H-1);
  let h=0,t=0;const s=py*W+px;field[s]=0;fq[t++]=s;
  while(h<t){const i=fq[h++];const x=i%W,d=field[i]+1;if(d>170)continue;
    if(x>0){const n=i-1;if(field[n]<0&&!isSolidT(map[n])){field[n]=d;fq[t++]=n;}}
    if(x<W-1){const n=i+1;if(field[n]<0&&!isSolidT(map[n])){field[n]=d;fq[t++]=n;}}
    if(i>=W){const n=i-W;if(field[n]<0&&!isSolidT(map[n])){field[n]=d;fq[t++]=n;}}
    if(i<W*(H-1)){const n=i+W;if(field[n]<0&&!isSolidT(map[n])){field[n]=d;fq[t++]=n;}}}
}
export function los(ax,ay,bx,by){const d=hyp(bx-ax,by-ay),n=Math.ceil(d/14);for(let i=1;i<n;i++){const t=i/n;if(solidAt(lerp(ax,bx,t),lerp(ay,by,t)))return false;}return true;}

// ---- o que a polícia sabe ----
export const intel={seenT:99,lastX:0,lastY:0,searchX:0,searchY:0,searchT:0};
const tgtObj=()=>player.car||player;
export function reportPlayer(){const t=tgtObj();intel.seenT=0;intel.lastX=t.x;intel.lastY=t.y;intel.lastCar=player.car||null;}
export const playerSeenRecently=()=>intel.seenT<2.5;

let flowT=0,flowBT=0;
export function computeFlow(){bfs(flow,intel.lastX,intel.lastY);}
function predicted(){const t=tgtObj();const vx=player.car?player.car.vx:0,vy=player.car?player.car.vy:0;return{x:t.x+vx*1.6,y:t.y+vy*1.6};}

// atualizações globais da polícia (uma vez por quadro)
export function updatePoliceBrain(dt){
  const stars=heatStars();
  intel.seenT+=dt;
  if(stars===0){intel.seenT=99;return;}
  // alguém está te vendo?
  const t=tgtObj();
  for(const c of S.cars){if(c.ai!=='police'&&c.ai!=='block')continue;const d=hyp(c.x-t.x,c.y-t.y);if(d<220||(d<620&&los(c.x,c.y,t.x,t.y))){reportPlayer();break;}}
  for(const p of S.peds){if(!p.cop||p.state==='dead')continue;const d=hyp(p.x-t.x,p.y-t.y);if(d<350&&los(p.x,p.y,t.x,t.y)){reportPlayer();break;}}
  flowT-=dt;if(flowT<=0){computeFlow();flowT=0.35;}
  flowBT-=dt;if(flowBT<=0&&playerSeenRecently()){const p=predicted();bfs(flowB,p.x,p.y);flowBT=0.5;}
  // vasculhar: escolhe pontos perto da última posição vista
  if(!playerSeenRecently()){intel.searchT-=dt;if(intel.searchT<=0){intel.searchT=5;const a=Math.random()*Math.PI*2,r=rand(150,500);intel.searchX=intel.lastX+Math.cos(a)*r;intel.searchY=intel.lastY+Math.sin(a)*r;}}
  updateRoadblocks(dt,stars);
  updateCopsOnFoot(dt,stars);
}

function followField(field,c){
  let i=(clamp(c.y/T|0,0,H-1))*W+clamp(c.x/T|0,0,W-1);
  if(field[i]<0)return null;
  for(let k=0;k<6;k++){const x=i%W;let bi=i,bd=field[i];
    for(const n of [i-1,i+1,i-W,i+W]){if(n<0||n>=W*H)continue;if(Math.abs((n%W)-x)>1)continue;const f=field[n];if(f>=0&&f<bd){bd=f;bi=n;}}
    if(bi===i)break;i=bi;}
  return{x:(i%W+.5)*T,y:(((i/W)|0)+.5)*T};
}

// quem desce de cada veículo quando você está a pé
const FOOT={viatura:{unit:'policia',n:2,shirt:'#1f3a6b',hair:'#111',spd:110,hp:1},swat:{unit:'swat',n:3,shirt:'#15171c',hair:'#15171c',spd:105,hp:3},
  fbi:{unit:'fbi',n:2,shirt:'#2b2f38',hair:'#111',spd:125,hp:2},exercito:{unit:'exercito',n:3,shirt:'#4b5320',hair:'#3d4419',spd:115,hp:4},blindado:{unit:'exercito',n:4,shirt:'#4b5320',hair:'#3d4419',spd:115,hp:4}};
export function updatePolice(c,dt){
  if(c.ai==='block'){c.physics(0,0,true,dt);return;}
  const t=tgtObj(); const d=hyp(t.x-c.x,t.y-c.y);
  const stars=heatStars();
  if(!c.role)c.role=Math.random()<0.4?'intercept':'chase';
  let tx,ty;
  const seen=playerSeenRecently();
  // cada viatura mira um pouco pro lado: cercam em vez de empilhar
  const side=((c.id%3)-1)*36, pa=player.car?player.car.a:player.a;
  if(seen&&d<300&&los(c.x,c.y,t.x,t.y)){
    const vx=player.car?player.car.vx:0,vy=player.car?player.car.vy:0;
    tx=t.x+vx*0.35-Math.sin(pa)*side;ty=t.y+vy*0.35+Math.cos(pa)*side;
  } else if(seen&&c.role==='intercept'){
    const p=followField(flowB,c)||followField(flow,c);tx=p?p.x:t.x;ty=p?p.y:t.y;
  } else if(seen||hyp(intel.lastX-c.x,intel.lastY-c.y)>180){
    const p=followField(flow,c);tx=p?p.x:intel.lastX;ty=p?p.y:intel.lastY;
  } else { // perdeu de vista: vasculha a área
    tx=intel.searchX;ty=intel.searchY;
  }
  // sem te ver: corre pro último lugar onde te viram; só vasculha devagar quando já chegou lá
  const searching=!seen&&hyp(intel.lastX-c.x,intel.lastY-c.y)<=180;
  let desired=seen?200+stars*45+(c.type==='fbi'?90:0):searching?150:200+stars*30;
  if(d<90&&player.car&&player.car.speed<60)desired=60;
  if(!player.car&&d<160)desired=Math.min(desired,Math.max(0,(d-70)*1.5));
  driveTo(c,tx,ty,desired,dt,true);
  // a pé: viatura para e desce policial
  if(!player.car&&player.state==='play'&&d<190&&c.speed<40&&!c.dropped&&stars>=1){
    c.dropped=true;
    const n=S.peds.filter(p=>p.cop&&p.state!=='dead').length, cap=stars>=4?9:5;
    const U=FOOT[c.type]||FOOT.viatura;
    for(let k=0;k<(stars>=3?U.n:1)&&n+k<cap;k++){
      const ox=c.x-Math.sin(c.a)*(18+k*12),oy=c.y+Math.cos(c.a)*(18+k*12);
      if(solidAt(ox,oy))continue;
      const p=new Ped(ox,oy);p.cop=true;p.state='cop';p.unit=U.unit;p.shirt=U.shirt;p.hair=U.hair;p.spd=U.spd;p.hp=U.hp;p.shootCd=rand(1.2,2);S.peds.push(p);
    }
  }
}

// ---- bloqueios na rua à frente (3+ estrelas) ----
let blockT=4;
function updateRoadblocks(dt,stars){
  const blocks=S.cars.filter(c=>c.ai==='block');
  // tira bloqueio esquecido
  for(const c of blocks)if(hyp(c.x-player.x,c.y-player.y)>1700||stars===0)c.remove=true;
  if(stars<3||!player.car||intel.seenT>8)return;
  blockT-=dt;if(blockT>0||blocks.length>=4)return;
  blockT=rand(14,22);
  const c=player.car;const sp=c.speed;if(sp<120)return;
  const ax=c.x+c.vx/sp*900, ay=c.y+c.vy/sp*900;
  // acha a rua mais perto desse ponto e fecha ela atravessada
  let best=null,bd=1e9;
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i]&&HL[j].type!=='beco'){const x=clamp(ax,VL[i].px+80,VL[i+1].px-80),y=HL[j].px;const dd=hyp(x-ax,y-ay);if(dd<bd){bd=dd;best={x,y,horiz:true,L:HL[j]};}}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j]&&VL[i].type!=='beco'){const x=VL[i].px,y=clamp(ay,HL[j].px+80,HL[j+1].px-80);const dd=hyp(x-ax,y-ay);if(dd<bd){bd=dd;best={x,y,horiz:false,L:VL[i]};}}
  if(!best||bd>400)return;
  if(hyp(best.x-player.x,best.y-player.y)<600)return;
  const half=best.L.w*T/2, n=best.L.type==='ave'?3:2;
  if(blocks.length+n>4)return; // nunca passa de 4 carros de bloqueio ao mesmo tempo
  // 4+ estrelas: van da SWAT no meio; 6: blindado do exército
  const mid=stars>=6?'blindado':stars>=4?'swat':'viatura', side=stars>=6?'exercito':'viatura';
  for(let k=0;k<n;k++){
    const off=-half+(k+0.5)*(2*half/n);
    const x=best.horiz?best.x:best.x+off, y=best.horiz?best.y+off:best.y;
    const type=k===Math.floor(n/2)?mid:side;
    const car=new Car(type,x,y,best.horiz?Math.PI/2:0);car.driver='ai';car.ai='block';S.cars.push(car);
  }
  msg(stars>=6?'Bloqueio do exército à frente!':'Bloqueio policial à frente!',2.5);
}

// ---- policiais a pé ----
function updateCopsOnFoot(dt,stars){}
export function updateCopPed(p,dt){
  if(heatStars()===0){p.cop=false;p.state='walk';return;}
  const t=tgtObj();
  const dx=t.x-p.x,dy=t.y-p.y,l=hyp(dx,dy)||1;
  p.a=Math.atan2(dy,dx);p.anim+=dt;
  if(l>28){
    let mx=dx/l,my=dy/l;const nx=p.x+mx*p.spd*dt,ny=p.y+my*p.spd*dt;
    let moved=false;
    if(!solidAt(nx,p.y)){p.x=nx;moved=true;}
    if(!solidAt(p.x,ny)){p.y=ny;moved=true;}
    if(!moved){const sx=p.x-my*p.spd*dt,sy=p.y+mx*p.spd*dt;if(!solidAt(sx,sy)){p.x=sx;p.y=sy;}}
  }
  return l;
}
