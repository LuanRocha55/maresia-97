// IA do trânsito em cima da malha de ruas: faixas, mão única, conversões, troca de faixa e semáforo
import { clamp, normA, pick, rand, hyp } from '../core/utils.js';
import { T, ROAD, DX, DY, tileAt, VL, HL, NV, NH, segH, segV, hasSeg, dirAllowed, laneCoords, nodeKey } from '../world/map.js';
import { zoneAt } from '../world/zoning.js';
import { CT, Car } from '../entities/vehicles.js';
import { sfxHorn } from '../audio/audio.js';
import { onScreen, viewR } from '../game/world.js';
import { signalized, signalState } from '../world/districts.js';
import { S, player } from '../core/state.js';
import { isOpenAt } from '../game/blitz.js';

export function alongOf(c){return c.dir%2===0?c.x:c.y;}
export function sgn(d){return(d===0||d===1)?1:-1;}
const SPEED={ave:175,rua:130,beco:70};

// linha atual (objeto) e nó para onde o carro está indo
const lineOf=c=>c.dir%2===0?HL[c.line]:VL[c.line];
const nextNode=c=>c.dir%2===0?[c.next,c.line]:[c.line,c.next];
const nodeAlong=(c,k)=>c.dir%2===0?VL[k].px:HL[k].px;
const big=c=>!c.t.beco;

// trecho todo fora da área fechada pela operação (amostra pontos ao longo da reta)
function openPath(x0,y0,x1,y1){for(let k=0;k<=8;k++){const t=k/8;if(!isOpenAt(x0+(x1-x0)*t,y0+(y1-y0)*t))return false;}return true;}
const nodeXY=(i,j)=>[VL[i].px,HL[j].px];
// o carro chega no próximo nó sem entrar em bairro fechado?
export function headingOpen(c){const [i,j]=nextNode(c);if(i<0||j<0||i>=NV||j>=NH)return false;return openPath(c.x,c.y,...nodeXY(i,j));}

// ---------- planejamento no próximo nó ----------
export function planCar(c){
  const [i,j]=nextNode(c); const d=c.dir;
  if(i<0||j<0||i>=NV||j>=NH){c.plan=null;return;}
  const cur=lineOf(c); const curLanes=laneCoords(cur,d);
  const opts=[];
  for(const [nd,w] of [[d,0.55],[(d+1)%4,0.25],[(d+3)%4,0.2]]){
    if(!hasSeg(i,j,nd))continue;
    const L=nd%2===0?HL[j]:VL[i];
    if(!dirAllowed(L,nd))continue;
    if(L.type==='beco'&&big(c))continue;
    // carro de missão (gangue) não entra em bairro fechado
    if(c.stayOpen){const ni=i+(nd%2===0?DX[nd]:0),nj=j+(nd%2===1?DY[nd]:0);if(!openPath(...nodeXY(i,j),...nodeXY(ni,nj)))continue;}
    opts.push({nd,w,L});
  }
  let ch;
  if(!opts.length){ // rua sem saída: retorna
    const nd=(d+2)%4;ch={nd,w:1,L:cur};
    if(!dirAllowed(cur,nd)){c.plan={nd:d,straight:true,tp:nodeAlong(c,c.next),key:nodeKey(i,j),uturn:false};return;}
  } else {
    let tot=opts.reduce((q,o)=>q+o.w,0),r=Math.random()*tot;ch=opts[0];
    for(const o of opts){r-=o.w;if(r<=0){ch=o;break;}}
  }
  const lanes=laneCoords(ch.L,ch.nd);
  let li;
  if(ch.nd===d)li=Math.min(c.li||0,lanes.length-1);
  else if(ch.nd===(d+1)%4)li=lanes.length-1;   // direita: faixa de fora
  else li=0;                                     // esquerda (ou retorno): faixa de dentro
  // faixa certa pra fazer a conversão
  c.wantLi=ch.nd===d?null:(ch.nd===(d+1)%4?curLanes.length-1:0);
  const straight=ch.nd===d;
  const tp=straight?nodeAlong(c,c.next):lanes[li];
  c.plan={nd:ch.nd,straight,tp,li,lane:lanes[li],key:nodeKey(i,j),uturn:ch.nd===(d+2)%4};
}

// reposiciona o carro na malha a partir de onde ele está (depois de batida, ou viatura que virou trânsito)
export function recoverCar(c){
  let d=((Math.round(c.a/(Math.PI/2))%4)+4)%4;
  const horiz=d%2===0, perp=horiz?c.y:c.x, along=horiz?c.x:c.y;
  const lines=horiz?HL:VL;
  // linha mais próxima que tem trecho passando por aqui
  let best=-1,bd=1e9;
  for(const L of lines){const dd=Math.abs(L.px-perp);if(dd<bd){bd=dd;best=L.idx;}}
  const L=lines[best];
  if(!dirAllowed(L,d))d=(d+2)%4;
  c.dir=d;c.line=best;
  const lanes=laneCoords(L,d);let li=0,ld=1e9;lanes.forEach((v,k)=>{const q=Math.abs(v-perp);if(q<ld){ld=q;li=k;}});
  c.li=li;c.lane=lanes[li];
  const nodes=horiz?VL:HL, s=sgn(d);
  let nx=-1;
  if(s>0){for(const N of nodes)if(N.px>along+8){nx=N.idx;break;}}
  else{for(let k=nodes.length-1;k>=0;k--)if(nodes[k].px<along-8){nx=k;break;}}
  if(nx<0){c.dir=(d+2)%4;nx=s>0?nodes.length-1:0;if(!dirAllowed(L,c.dir))nx=s>0?nodes.length-1:0;}
  c.next=nx;c.plan=null;c.lastInter=-1;c.wantLi=null;
  c.speedBase=SPEED[L.type];
}

export function obstacleAhead(c,range){
  const fx=Math.cos(c.a),fy=Math.sin(c.a);let bst=Infinity;
  const check=(x,y,rad)=>{const rx=x-c.x,ry=y-c.y;const f=rx*fx+ry*fy;if(f<=0||f>range)return;const l=-rx*fy+ry*fx;if(Math.abs(l)<14+rad){const d=f-c.t.len/2-rad;if(d<bst)bst=d;}};
  for(const o of S.cars){if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y;if(dx*dx+dy*dy>(range+60)**2)continue;
    for(const ci of o.circles())check(ci[0],ci[1],ci[2]);}
  if(!player.car&&player.state==='play')check(player.x,player.y,8);
  for(const p of S.peds){const dx=p.x-c.x,dy=p.y-c.y;if(dx*dx+dy*dy<range*range&&tileAt(p.x,p.y)===ROAD)check(p.x,p.y,6);}
  return bst;
}
// tem espaço na faixa ao lado?
function laneFree(c,laneCoord){
  const horiz=c.dir%2===0;
  for(const o of S.cars){if(o===c)continue;
    const perp=horiz?o.y:o.x, al=horiz?o.x:o.y, me=alongOf(c);
    if(Math.abs(perp-laneCoord)<30&&Math.abs(al-me)<(o.t.len+c.t.len)/2+50)return false;}
  return true;
}
export function driveTo(c,tx,ty,desired,dt,hbAllowed){
  const da=normA(Math.atan2(ty-c.y,tx-c.x)-c.a);
  let steer=clamp(da*2.6,-1,1); const vF=c.fwdSpeed();
  let thr=clamp((desired-vF)/40,-1,1);
  let hb=false;
  if(hbAllowed&&Math.abs(da)>0.9&&vF>170)hb=true;
  if(Math.abs(da)>1.4&&vF>120)thr=-0.7;
  if(c.revT>0){c.revT-=dt;thr=-1;steer=-steer;hb=false;}
  else if(desired>30&&Math.abs(vF)<8){c.stuckT+=dt;if(c.stuckT>(c.ai==='police'?1.0:2.2)){c.revT=c.ai==='police'?0.8:1.1;c.stuckT=0;}}
  else c.stuckT=Math.max(0,c.stuckT-dt);
  c.physics(thr,steer,hb,dt);
  return {da};
}

export function updateTraffic(c,dt){
  if(c.line===undefined||c.next===undefined)recoverCar(c);
  if(!c.plan)planCar(c);
  const s=sgn(c.dir), horiz=c.dir%2===0, L=lineOf(c);
  let desired=(c.speedBase||SPEED[L.type])*(c.cruiseK||1);
  const perpPos=horiz?c.y:c.x;
  if(Math.abs(perpPos-c.lane)>110&&c.revT<=0)recoverCar(c);
  const sp=Math.max(0,c.fwdSpeed());
  const obs=obstacleAhead(c,Math.max(40+sp*0.7,260));
  c.laneCd=(c.laneCd||0)-dt;
  if(c.plan){
    const a=alongOf(c), dist=(c.plan.tp-a)*s;
    const turning=!c.plan.straight;
    // troca de faixa: pra virar, ou pra ultrapassar quem está devagar
    const lanes=laneCoords(L,c.dir);
    if(lanes.length>1&&c.laneCd<=0){
      let want=null;
      if(c.wantLi!=null&&c.wantLi!==c.li&&dist>70)want=c.wantLi;
      else if(obs<120&&sp<desired*0.6&&!turning){want=c.li===0?1:0;}
      if(want!=null&&laneFree(c,lanes[want])){c.li=want;c.lane=lanes[want];c.laneCd=2.5;}
    }
    const lead=!turning?0:(c.plan.uturn?20:(c.plan.nd===(c.dir+1)%4?18:34));
    if(turning&&dist<150)desired=Math.min(desired,c.plan.uturn?45:75);
    if(dist<=lead){
      c.lastInter=c.plan.key;
      const [i,j]=nextNode(c);
      if(turning){
        const nd=c.plan.nd;c.dir=nd;c.li=c.plan.li;c.lane=c.plan.lane;
        if(nd%2===0){c.line=j;c.next=i+DX[nd];}else{c.line=i;c.next=j+DY[nd];}
        c.speedBase=SPEED[(nd%2===0?HL[c.line]:VL[c.line]).type];
      } else c.next+=horiz?DX[c.dir]:DY[c.dir];
      c.plan=null;c.wantLi=null;planCar(c);
    }
    else if(dist<-80){recoverCar(c);planCar(c);}
  }
  // semáforo e "não trancar o cruzamento"
  if(c.plan){const [i,j]=nextNode(c);
    if(i>=0&&j>=0&&i<NV&&j<NH){
      const crossHalf=(horiz?VL[i].w:HL[j].w)*T/2;
      const entry=nodeAlong(c,c.next)-s*crossHalf;
      const df=(entry-alongOf(c))*s-c.t.len/2;
      if(df>-4&&df<110){
        let stop=false;
        if(signalized(i,j)){const st=signalState(i,j,horiz?'h':'v');if(st==='r'||(st==='y'&&df>28))stop=true;}
        if(obs<Infinity&&obs>df&&obs<df+crossHalf*2+c.t.len*0.8)stop=true;
        if(stop)desired=Math.min(desired,Math.max(0,(df-8)*2.2));
      }}}
  if(c.blockT>12&&!onScreen(c.x,c.y,200))c.remove=true;
  if(obs<40+sp*0.7+60){desired=Math.min(desired,Math.max(0,(obs-12)*2.2));
    if(obs<40&&sp<10){c.blockT+=dt;if(c.blockT>1.4&&c.honkCd<=0&&onScreen(c.x,c.y)){sfxHorn();c.honkCd=4;}}}
  else c.blockT=0;
  c.honkCd-=dt;
  const Lk=48+sp*0.35; let tx,ty;
  if(horiz){tx=c.x+s*Lk;ty=c.lane;}else{tx=c.lane;ty=c.y+s*Lk;}
  if(desired<5&&c.revT<=0){c.physics(sp>3?-1:0,0,false,dt);return;}
  driveTo(c,tx,ty,desired,dt,false);
}

// ---------- spawn de carros nas ruas ----------
const MIX={
  centro:['jegue','taxi','taxi','luxo','suv','busao','camin','moto','jegue','lotacao'],
  rico:['brisa','brisa','luxo','luxo','suv','suv','taxi','bugue'],
  velha:['jegue','jegue','moto','moto','taxi','lotacao'],
  cajueiro:['jegue','moto','moto','camin','jegue','moto','lotacao'],
  jardim:['jegue','suv','taxi','moto','camin','jegue','lotacao'],
  orla:['bugue','bugue','brisa','jegue','taxi','suv','luxo'],
  porto:['caminhao','caminhao','camin','jegue','caminhao'],
};
let SEGS=null;
function segments(){
  if(SEGS)return SEGS;SEGS=[];
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i]){const L=HL[j];SEGS.push({horiz:true,line:j,a:i,b:i+1,L,w:L.type==='ave'?5:L.type==='rua'?2:0.6});}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j]){const L=VL[i];SEGS.push({horiz:false,line:i,a:j,b:j+1,L,w:L.type==='ave'?5:L.type==='rua'?2:0.6});}
  SEGS.total=SEGS.reduce((q,s)=>q+s.w,0);
  return SEGS;
}
function pickSeg(){const sg=segments();let r=Math.random()*sg.total;for(const s of sg){r-=s.w;if(r<=0)return s;}return sg[0];}
// ponto qualquer no meio de uma rua (para missões)
export function randomRoadPoint(){
  const s=pickSeg();const p0=s.horiz?VL[s.a].px:HL[s.a].px,p1=s.horiz?VL[s.b].px:HL[s.b].px;
  const al=p0+(p1-p0)*rand(0.3,0.7);
  return s.horiz?{x:al,y:s.L.px,seg:s}:{x:s.L.px,y:al,seg:s};
}
export function spawnOnRoad(rmin,rmax,ignoreView,type,ai,pred){
  for(let tries=0;tries<(pred?40:16);tries++){
    const s=pickSeg();
    let dir=s.horiz?(Math.random()<.5?0:2):(Math.random()<.5?1:3);
    if(!dirAllowed(s.L,dir))dir=(dir+2)%4;
    const lanes=laneCoords(s.L,dir), li=Math.floor(Math.random()*lanes.length);
    const p0=s.horiz?VL[s.a].px:HL[s.a].px, p1=s.horiz?VL[s.b].px:HL[s.b].px;
    const margin=90; if(p1-p0<margin*2+20)continue;
    const along=rand(p0+margin,p1-margin);
    const x=s.horiz?along:lanes[li], y=s.horiz?lanes[li]:along;
    const d=hyp(x-player.x,y-player.y); if(d<rmin||d>rmax)continue;
    if(!ignoreView&&(d<viewR()||onScreen(x,y,160)))continue;
    if(pred&&!pred(x,y))continue;
    let ty=type||pick(MIX[zoneAt(x/T|0,y/T|0)]||MIX.centro);
    if(s.L.type==='beco'&&!CT[ty].beco){if(type)continue;ty=pick(['jegue','moto']);} // reforço pedido não vira carro comum
    if((ty==='busao'||ty==='caminhao')&&S.cars.filter(c=>c.type===ty).length>5)ty='jegue';
    let ok=true;for(const c of S.cars)if(hyp(c.x-x,c.y-y)<(c.t.len+CT[ty].len)/2+24){ok=false;break;}
    if(!ok)continue;
    const c=new Car(ty,x,y,dir*Math.PI/2);c.driver='ai';c.ai=ai||'traffic';
    c.dir=dir;c.line=s.line;c.li=li;c.lane=lanes[li];
    c.next=sgn(dir)>0?s.b:s.a;c.speedBase=SPEED[s.L.type];c.cruiseK=rand(0.85,1.1);
    if(ty==='busao'||ty==='caminhao')c.cruiseK*=0.75;
    const sp=Math.min(c.speedBase*c.cruiseK,120);c.vx=DX[dir]*sp;c.vy=DY[dir]*sp;
    S.cars.push(c);return c;
  }
  return null;
}
