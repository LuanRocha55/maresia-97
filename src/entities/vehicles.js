// Tipos de veículo e física dos carros
import { rand, pick, clamp, lerp, hyp } from '../core/utils.js';
import { SAND, GRASS, tileAt, solidAt } from '../world/map.js';
import { sfxNoise } from '../audio/audio.js';
import { addHeat, onScreen } from '../game/world.js';
import { addSkid, crashSparks } from '../game/effects.js';
import { S, player } from '../core/state.js';

// len/wid em pixels do mapa (32 = 1 unidade 3D), no tamanho antigo (VEH_SCALE logo abaixo aumenta).
// Jegue e Busão já no tamanho dos modelos do Meshy.
// beco:true = cabe nos becos da Vila dos Pescadores (carros pequenos).
export const CT={
  jegue:{name:'Jegue 1.0',len:68,wid:33,beco:true,maxSpd:260,accel:220,brake:460,grip:7,turn:2.7,hp:100,mass:1,val:200,colors:['#c0392b','#2980b9','#ecf0f1','#7f8c8d','#16a085','#d35400','#8e44ad']},
  brisa:{name:'Brisa GT',len:40,wid:19,beco:true,maxSpd:430,accel:360,brake:560,grip:8.5,turn:2.9,hp:90,mass:1,val:900,colors:['#e74c3c','#f1c40f','#2c3e50','#ecf0f1']},
  taxi:{name:'Táxi',len:38,wid:18,beco:true,maxSpd:290,accel:240,brake:480,grip:7.5,turn:2.7,hp:110,mass:1.1,val:300,colors:['#f4f4f0']},
  camin:{name:'Caminhonete',len:46,wid:22,maxSpd:255,accel:210,brake:440,grip:7,turn:2.2,hp:180,mass:1.7,val:500,colors:['#5d4037','#455a64','#827717','#37474f']},
  bugue:{name:'Bugue',len:32,wid:19,beco:true,maxSpd:330,accel:340,brake:480,grip:6.2,turn:3.3,hp:80,mass:0.8,val:600,colors:['#ff7043','#26c6da','#ffca28','#9ccc65'],sand:true},
  busao:{name:'Busão',len:159,wid:42,maxSpd:200,accel:130,brake:340,grip:7,turn:1.7,hp:320,mass:4,val:800,colors:['#1565c0','#e65100','#2e7d32']},
  moto:{name:'Motoca',len:26,wid:10,beco:true,maxSpd:340,accel:380,brake:520,grip:7.5,turn:3.6,hp:60,mass:0.5,val:250,colors:['#e53935','#1e88e5','#212121','#fdd835']},
  guincho:{name:'Guincho',len:52,wid:22,maxSpd:240,accel:190,brake:420,grip:7,turn:2.1,hp:220,mass:2.2,val:700,colors:['#f9a825']},
  luxo:{name:'Sedã Executivo',len:44,wid:20,maxSpd:390,accel:310,brake:560,grip:8.4,turn:2.6,hp:120,mass:1.3,val:1100,colors:['#111111','#2c3e50','#ecf0f1','#7f8c8d','#4a0e0e']},
  suv:{name:'Utilitário',len:44,wid:22,maxSpd:320,accel:260,brake:500,grip:7.8,turn:2.4,hp:160,mass:1.6,val:800,colors:['#ffffff','#1c2833','#566573','#7b241c','#1d3557']},
  lotacao:{name:'Lotação',len:52,wid:22,maxSpd:250,accel:170,brake:400,grip:7,turn:2.0,hp:200,mass:2,val:600,colors:['#f2f0e8']},
  caminhao:{name:'Caminhão Baú',len:72,wid:24,maxSpd:210,accel:120,brake:320,grip:7,turn:1.8,hp:300,mass:3.5,val:900,colors:['#e0e0e0','#f5b041','#5dade2']},
  viatura:{name:'Viatura',len:40,wid:19,beco:true,maxSpd:390,accel:330,brake:560,grip:8.6,turn:2.9,hp:150,mass:1.3,val:1200,colors:['#20242c']},
  // forças que entram com o procurado alto
  swat:{name:'Van da SWAT',len:54,wid:24,maxSpd:330,accel:250,brake:480,grip:8,turn:2.2,hp:340,mass:2.6,val:1800,colors:['#15171c']},
  fbi:{name:'Sedã do FBI',len:44,wid:20,maxSpd:450,accel:380,brake:600,grip:9,turn:2.8,hp:170,mass:1.4,val:2000,colors:['#0b0b0d']},
  exercito:{name:'Jipe do Exército',len:42,wid:22,maxSpd:360,accel:320,brake:520,grip:8.4,turn:2.7,hp:260,mass:2,val:1500,colors:['#4b5320'],sand:true},
  blindado:{name:'Blindado',len:66,wid:30,maxSpd:250,accel:150,brake:380,grip:8,turn:1.7,hp:1000,mass:6,val:4000,colors:['#3d4419']},
};
// Todos os veículos ficaram ~1,9x maiores (24/11/2026) pra combinar com as pessoas e com os modelos do Meshy.
// Os números acima são do tamanho antigo; aqui eles crescem. Jegue e Busão já estão no tamanho do modelo.
export const VEH_SCALE=1.9;
for(const [k,t] of Object.entries(CT))if(k!=='jegue'&&k!=='busao'){t.len=Math.round(t.len*VEH_SCALE);t.wid=Math.round(t.wid*VEH_SCALE);}
export const TRAFFIC_MIX=['jegue','jegue','jegue','jegue','taxi','taxi','camin','camin','brisa','bugue','busao','moto'];

export class Car{
  constructor(type,x,y,a,color){
    this.id=S.NEXT_ID++;this.t=CT[type];this.type=type;this.x=x;this.y=y;this.a=a;this.vx=0;this.vy=0;
    this.color=color||pick(this.t.colors);this.health=this.t.hp;this.driver=null;this.ai=null;
    this.dir=0;this.lane=0;this.plan=null;this.lastInter=-1;this.stuckT=0;this.revT=0;this.cruise=rand(110,165);
    this.wreck=false;this.burnT=0;this.steerVis=0;this.brakeLight=false;this.honkCd=0;this.mission=null;this.blockT=0;this.hitCd=0;
    const n=Math.max(2,Math.ceil(this.t.len/this.t.wid));this.nc=n;
  }
  get speed(){return hyp(this.vx,this.vy);}
  fwdSpeed(){return this.vx*Math.cos(this.a)+this.vy*Math.sin(this.a);}
  circles(){const out=[];const n=this.nc,L=this.t.len,r=this.t.wid/2+1;const c=Math.cos(this.a),s=Math.sin(this.a);
    for(let i=0;i<n;i++){const off=n===1?0:(-L/2+r)+(L-2*r)*i/(n-1);out.push([this.x+c*off,this.y+s*off,r]);}return out;}
  pts(x,y,a){const c=Math.cos(a),s=Math.sin(a),hl=this.t.len/2,hw=this.t.wid/2;const out=[];
    const nl=Math.ceil(this.t.len/16);
    for(let i=0;i<=nl;i++){const f=-hl+this.t.len*i/nl;out.push([x+c*f-s*hw,y+s*f+c*hw]);out.push([x+c*f+s*hw,y+s*f-c*hw]);}
    return out;}
  hits(x,y,a){for(const p of this.pts(x,y,a))if(solidAt(p[0],p[1]))return true;return false;}
  damage(v,src){if(this.wreck)return;this.health-=v;if(this.health<=0&&this.burnT<=0){this.health=0;this.burnT=3.2;
      if(src==='player'){addHeat(this.ai==='police'?150:40);if(this.mission)this.mission.onDestroyed&&this.mission.onDestroyed(this);}
      else if(this.mission&&this.mission.onDestroyed)this.mission.onDestroyed(this);}}
  physics(thr,steer,hb,dt){
    if(this.wreck){thr=0;steer=0;hb=true;}
    const t=this.t;const c=Math.cos(this.a),s=Math.sin(this.a);
    let vF=this.vx*c+this.vy*s, vR=-this.vx*s+this.vy*c;
    const ground=tileAt(this.x,this.y);
    let gripM=1,dragM=1,spdM=1;
    if(ground===SAND&&!t.sand){gripM=0.5;dragM=2.2;spdM=0.6;}
    else if(ground===SAND&&t.sand){gripM=0.9;spdM=1.05;}
    else if(ground===GRASS){gripM=0.75;dragM=1.8;spdM=0.75;}
    if(this.flat){spdM*=0.5;gripM*=0.55;} // pneu furado (tapete de pregos da blitz)
    const maxS=t.maxSpd*spdM*(this.health<t.hp*0.25?0.75:1);
    this.brakeLight=false;
    if(thr>0){ if(vF<-5){vF+=t.brake*dt;this.brakeLight=true;} else if(vF<maxS)vF+=t.accel*thr*dt*(1-vF/maxS*0.55); }
    else if(thr<0){ if(vF>5){vF-=t.brake*dt*(-thr);this.brakeLight=true;} else if(vF>-maxS*0.35)vF-=t.accel*0.6*dt; }
    else vF*=Math.max(0,1-0.9*dragM*dt);
    if(vF>maxS*1.05)vF-=(vF-maxS)*2*dt;
    const skill=this.driver==='player'&&player.skills.direcao;
    const grip=(hb?1.4:t.grip)*gripM*(skill?1.15:1);
    vR*=Math.max(0,1-grip*dt);
    if(hb){vF*=Math.max(0,1-1.3*dt);this.brakeLight=true;}
    const sf=clamp(Math.abs(vF)/110,0,1)*Math.sign(vF);
    this.steerVis=lerp(this.steerVis,steer,0.2);
    let na=this.a+t.turn*steer*sf*(hb?1.45:1)*dt;
    const nvx=c*vF-s*vR, nvy=s*vF+c*vR; this.vx=nvx;this.vy=nvy;
    // skid
    if((Math.abs(vR)>110||(this.brakeLight&&Math.abs(vF)>200&&hb))&&!this.wreck)addSkid(this,ground===SAND);
    // rotação
    if(!this.hits(this.x,this.y,na))this.a=na;
    // mover com colisão
    let nx=this.x+this.vx*dt, ny=this.y+this.vy*dt; let impact=0;
    if(!this.hits(nx,this.y,this.a))this.x=nx;else{impact+=Math.abs(this.vx);this.vx*=-0.25;}
    if(!this.hits(this.x,ny,this.a))this.y=ny;else{impact+=Math.abs(this.vy);this.vy*=-0.25;}
    if(this.hits(this.x,this.y,this.a))this.unstick();
    if(impact>90){this.damage((impact-90)*0.09,this.driver==='player'?'self':null);
      if(onScreen(this.x,this.y))sfxNoise(0.25,clamp(impact/600,0.05,0.5),900);
      {const sd=-Math.sign(this.fwdSpeed()||-1),k=this.t.len*0.45*sd; // a velocidade já voltou: o lado batido é o oposto
        crashSparks(this.x+Math.cos(this.a)*k,this.y+Math.sin(this.a)*k,impact);}
      if(this.driver==='player'){S.shake=Math.min(12,impact/40);if(impact>220)S.hitStop=Math.max(S.hitStop||0,0.06);}}
  }
  unstick(){for(let r=4;r<60;r+=4)for(let k=0;k<8;k++){const ang=k*Math.PI/4;const x=this.x+Math.cos(ang)*r,y=this.y+Math.sin(ang)*r;if(!this.hits(x,y,this.a)){this.x=x;this.y=y;return;}}}
}
