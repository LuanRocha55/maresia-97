// Loop de atualização do mundo, colisões e pedestres
import { CH } from '../core/canvas.js';
import { rand, randi, pick, clamp, lerp, hyp, fmtMoney } from '../core/utils.js';
import { DX, DY, zones, phones, hospitalSpot, policeSpot, solidAt, tileAt, PARK } from '../world/map.js';
import { roadAt } from '../world/districts.js';
import { AU, sfxNoise, sfxTone } from '../audio/audio.js';
import { pedWalkable } from '../entities/peds.js';
import { heatStars, addHeat, msg, big, onScreen, spawnTraffic, spawnPed, policeUnit, UNIT_COLOR } from './world.js';
import { recoverCar, updateTraffic } from '../ai/traffic.js';
import { updatePolice, updatePoliceBrain, updateCopPed, intel, playerSeenRecently, los } from '../ai/police.js';
import { fire, WEAPONS } from './weapons.js';
import { explode, killPed, hurtPlayer, crashSparks } from './effects.js';
import { wasted, busted, respawn } from './player.js';
import { startMission, finishMission, failMission, inZone } from './missions.js';
import { S, player, cam, keys, mouse, mouseWorld, view } from '../core/state.js';
import { advanceTime } from '../world/time.js';
import { updateWeapons } from './weapons.js';
import { updateJobs } from './jobs.js';
import { autosave } from './save.js';
import { updateTutorial } from './tutorial.js';
import { updateStadium } from './stadium.js';
import { updateDistricts, updateGuard, isOpenAt } from './blitz.js';
import { updateStory, storyWantsPhone, storyPhoneCall } from './story.js';
import { needsTick, hungry, sleepFrac } from './needs.js';

// tropas a pé: arma, alcance e ritmo de tiro
const COP_UNITS={policia:{gun:'pistola',range:280,spread:0.12,cd:[1.2,2.2]},swat:{gun:'smg',range:320,spread:0.1,cd:[0.5,0.9]},
  fbi:{gun:'pistola',range:340,spread:0.07,cd:[0.8,1.3]},exercito:{gun:'smg',range:380,spread:0.08,cd:[0.35,0.7]}};
// esconderijo: parado (ou devagar) num beco ou num estacionamento
function isHideout(){
  const t=player.car||player;if(player.car&&player.car.speed>25)return false;
  const tile=tileAt(t.x,t.y);if(tile===PARK)return true;
  const r=roadAt(t.x,t.y);return !!(r&&r.L.type==='beco');
}
export function update(dt){
  S.gameTime+=dt;
  if(player.punchCd>0)player.punchCd-=dt; if(player.inv>0)player.inv-=dt; if(S.phoneCd>0)S.phoneCd-=dt; if(S.zoneCd>0)S.zoneCd-=dt;
  // estado morto/preso
  if(player.state!=='play'){player.stateT-=dt;if(player.stateT<=0){
      if(player.state==='wasted'){player.money=Math.max(0,player.money-300);respawn(hospitalSpot);}
      else{player.money=Math.max(0,player.money-500);respawn(policeSpot);}}}
  // controles do jogador
  const up=keys['KeyW']||keys['ArrowUp'],dn=keys['KeyS']||keys['ArrowDown'],lf=keys['KeyA']||keys['ArrowLeft'],rt=keys['KeyD']||keys['ArrowRight'];
  if(player.car){
    const c=player.car;
    // com sono o volante fica arisco (puxa sozinho de leve)
    const wob=sleepFrac()*0.35*Math.sin(S.gameTime*1.7)*Math.sin(S.gameTime*0.63);
    if(player.state==='play')c.physics(up?1:dn?-1:0,(rt?1:0)-(lf?1:0)+wob,!!keys['Space'],dt);
    player.x=c.x;player.y=c.y;player.a=c.a;
    if(c.burnT>0&&Math.floor(S.gameTime*2)%2===0&&!c._warn){msg('O carro vai explodir! SAI (F)!',2);c._warn=true;}
  } else if(player.state==='play'){
    // câmera de ombro com o mouse preso: botão direito segura a mira (com arma); andando mirando ele anda de lado, devagar
    const lock=view.ombro&&mouse.locked, armed=player.weapon!=='punho';
    player.aiming=lock&&armed&&mouse.right;
    const facing=lock&&armed&&(mouse.right||mouse.down);
    let mx=(rt?1:0)-(lf?1:0),my=(dn?1:0)-(up?1:0);
    if(mx||my){const l=hyp(mx,my);mx/=l;my/=l;
      // câmera 3/4: W anda pra onde a câmera olha, A/D pros lados da tela
      // A direção da câmera é "travada" no instante em que a combinação de teclas muda: assim a câmera
      // pode girar pra trás do jogador enquanto ele anda sem mudar o rumo no meio do caminho (nada de andar em círculo)
      if(view.r34&&!S.interior){const key=mx+','+my;if(player.inKey!==key||lock){player.inKey=key;player.inYaw=view.yaw;}
        const fx=Math.cos(player.inYaw),fy=Math.sin(player.inYaw),ax=mx,ay=my;mx=fx*(-ay)-fy*ax;my=fy*(-ay)+fx*ax;}
      player.walkT=S.gameTime;player.moveA=Math.atan2(my,mx);const sp=player.aiming?62:(keys['ShiftLeft']||keys['ShiftRight'])?(hungry()?125:160):95;
      if(!facing)player.a=Math.atan2(my,mx);const nx=player.x+mx*sp*dt,ny=player.y+my*sp*dt;
      if(!solidAt(nx,player.y))player.x=nx;if(!solidAt(player.x,ny))player.y=ny;player.anim+=dt*sp*0.12;}
    else player.inKey=null;
    // com mouse: o personagem olha pra mira (anda com WASD e mira com o mouse)
    if(facing&&view.aim)player.a=Math.atan2(view.aim.y-player.y,view.aim.x-player.x);
    else if(mouse.active&&!lock){const m=mouseWorld();player.a=Math.atan2(m.y-player.y,m.x-player.x);}
  }
  if(player.car||player.state!=='play')player.aiming=false;
  advanceTime(dt);
  updateWeapons(dt);
  updateJobs(dt);
  autosave(dt);
  updateTutorial(dt);
  updateStadium(dt);
  updateDistricts(dt);
  updateStory(dt);
  needsTick(dt);
  if(S.waypoint&&hyp(player.x-S.waypoint.x,player.y-S.waypoint.y)<90){S.waypoint=null;msg('Chegou no marcador.',2);}
  // IA dos carros
  for(const c of S.cars){
    if(c.hitCd>0)c.hitCd-=dt;
    if(c.burnT>0){c.burnT-=dt;if(Math.random()<0.6)S.parts.push({x:c.x+rand(-8,8),y:c.y+rand(-8,8),vx:rand(-15,15),vy:rand(-15,15),life:0.5,max:0.5,size:rand(5,10),col:pick(['rgba(255,170,40,','rgba(255,90,20,']),fire:true});
      if(c.burnT<=0){c.wreck=true;c.burnT=0;explode(c.x,c.y,c.lastHitBy||null);
        if(player.car===c){player.car=null;c.driver=null;wasted();}
        if(c.driver==='ai'){c.driver=null;} c.ai=null;}}
    if(c===player.car||c.towed)continue;
    if(c.wreck){c.physics(0,0,true,dt);continue;}
    if(c.ai==='traffic'&&c.driver==='ai')updateTraffic(c,dt);
    else if((c.ai==='police'||c.ai==='block')&&c.driver==='ai')updatePolice(c,dt);
    else c.physics(0,0,true,dt);
    if(!c.wreck&&c.health<c.t.hp*0.35&&Math.random()<0.15&&onScreen(c.x,c.y))S.parts.push({x:c.x+Math.cos(c.a)*c.t.len*0.35,y:c.y+Math.sin(c.a)*c.t.len*0.35,vx:rand(-10,10),vy:rand(-10,10),life:1.2,max:1.2,size:rand(6,11),col:'rgba(70,70,70,',smoke:true,up:true});
  }
  if(S.cars.some(c=>c.remove))S.cars=S.cars.filter(c=>!c.remove||c===player.car||c.mission);
  collideCars();
  updatePeds(dt);
  // fumaça do carro do jogador
  if(player.car&&!player.car.wreck&&player.car.health<player.car.t.hp*0.35&&Math.random()<0.3)S.parts.push({x:player.car.x,y:player.car.y,vx:rand(-10,10),vy:rand(-10,10),life:1.2,max:1.2,size:rand(6,11),col:'rgba(70,70,70,',smoke:true,up:true});

  // procurado / polícia
  const stars=heatStars();
  updatePoliceBrain(dt);
  // estrelas só caem quando ninguém te vê há um tempo; escondido (parado num beco ou estacionamento) cai 3x mais rápido
  const hidden=stars>0&&intel.seenT>4&&isHideout();
  if(hidden&&!S.hideMsg){S.hideMsg=true;msg('Escondido... a polícia tá perdendo teu rastro',2.5);}if(!hidden)S.hideMsg=false;
  if(player.heat>0&&intel.seenT>4)player.heat=Math.max(0,player.heat-9*(hidden?3:1)*dt);
  // trocou de carro sem ninguém ver: a polícia procura o carro antigo
  if(player.car!==S.prevCar){
    if(player.car&&stars>0&&intel.seenT>2&&intel.lastCar&&player.car!==intel.lastCar&&!player.car.swapped){
      player.car.swapped=true;player.heat=Math.max(0,player.heat-100);intel.lastCar=player.car;
      msg('Trocou de carro sem ninguém ver: a polícia perdeu a placa (-1 estrela)',3);}
    S.prevCar=player.car;}
  if(stars===0)for(const c of S.cars){if(c.ai==='police'){c.ai='traffic';recoverCar(c);}else if(c.ai==='block')c.remove=true;}
  // preso?
  if(player.state==='play'&&stars>0){
    let close=false;
    for(const c of S.cars){if(c.ai!=='police'||c.driver!=='ai')continue;
      if(player.car){const d=hyp(c.x-player.car.x,c.y-player.car.y);if(d<(c.t.len+player.car.t.len)/2+8&&player.car.speed<30)close=true;}
      else{const d=hyp(c.x-player.x,c.y-player.y);if(d<70&&c.speed<90)close=true;}}
    if(!player.car)for(const p of S.peds)if(p.cop&&p.state==='cop'&&hyp(p.x-player.x,p.y-player.y)<30)close=true;
    if(close){player.bustT+=dt;if(player.bustT>(player.car?1.6:0.9))busted();}else player.bustT=Math.max(0,player.bustT-dt*2);
  } else player.bustT=0;

  // spawns
  S.spawnT-=dt; if(S.spawnT<=0){S.spawnT=0.4;
    const pr=player;
    // despawn
    S.cars=S.cars.filter(c=>{if(c===player.car||c.mission||c.keep||c.towed)return true;const d=hyp(c.x-pr.x,c.y-pr.y);
      if(c.ai==='police'&&stars===0&&d>900)return false;
      if(d>2300&&!(c.driver===null&&!c.wreck&&d<3200))return false;return true;});
    S.peds=S.peds.filter(p=>(p.mission||p.job||p.robber||p.state==='story'||p.capanga&&p.state==='capanga'||(p.state==='guard'&&p.guard&&p.guard.props)||(p.cop&&stars>0)||hyp(p.x-pr.x,p.y-pr.y)<1500)&&p.state!=='dead'&&p.state!=='dead2');
    const traffic=S.cars.filter(c=>c.ai==='traffic').length;
    for(let i=0;i<4&&traffic+i<60;i++)spawnTraffic(800,1700,false);
    const np=S.peds.length;for(let i=0;i<3&&np+i<60;i++)spawnPed(500,1100,false);
    const want=[0,2,3,5,7,9,11][stars];
    const cops=S.cars.filter(c=>c.ai==='police').length;
    if(cops<want){
      // viatura nova aparece na frente de quem está fugindo de carro (e perto de onde te viram)
      const pc=player.car, fast=pc&&pc.speed>100&&playerSeenRecently();
      const pred=fast?(x,y)=>((x-pc.x)*pc.vx+(y-pc.y)*pc.vy)>0:null;
      const u=policeUnit(stars);
      const c=spawnTraffic(650,1100,false,u,'police',pred)||spawnTraffic(650,1100,false,u,'police');if(c){c.color=UNIT_COLOR[u];c.role=Math.random()<(u==='fbi'?0.6:0.4)?'intercept':'chase';}}
  }

  // zonas
  if(player.car&&player.state==='play'&&S.zoneCd<=0){
    for(const z of zones){if(!inZone(player.car,z))continue;
      if(z.type==='pintura'){
        const cost=500*Math.max(1,stars);
        if(player.heat>0){if(player.money>=cost){player.money-=cost;player.heat=0;player.car.color=pick(['#e91e63','#00bcd4','#cddc39','#ff9800','#9c27b0','#ffffff']);
            for(const c of S.cars)if(c.ai==='police'){c.ai='traffic';recoverCar(c);}
            big('PINTURA NOVA','A polícia perdeu teu rastro','#3cff9a',2.2);sfxTone(700,0.2,0.1);}
          else msg('Com '+stars+' estrela'+(stars>1?'s':'')+' a pintura custa $'+cost+'. Tu tá liso!');S.zoneCd=3;}
      } else if(z.type==='posto'){
        const c=player.car;
        if(c.health<c.t.hp-0.5||c.burnT>0||c.flat){
          if(player.money>=150){player.money-=150;c.health=c.t.hp;c.burnT=0;c.flat=false;c._warn=false;big('CARRO CONSERTADO','-$150 no Posto Guanabara','#ffd83c',2);sfxTone(600,0.1,0.1);sfxTone(900,0.15,0.1,'square',0.1);}
          else msg('Conserto custa $150. Tu tá liso!');
          S.zoneCd=3;}
      } else if(z.type==='ze'&&(!S.mission||player.car.mission!==S.mission)){
        const c=player.car;if(c.health>c.t.hp*0.4&&!c.wreck&&c.burnT<=0){const v=Math.round(c.t.val*(c.health/c.t.hp));player.money+=v;
          big('DESMANCHE DO ZÉ','+'+fmtMoney(v)+' pelo '+c.t.name,'#ff9a3c',2.2);sfxTone(520,0.15,0.1);sfxTone(780,0.2,0.1,'square',0.12);
          player.car=null;c.driver=null;{const ix=S.cars.indexOf(c);if(ix>=0)S.cars.splice(ix,1);}player.x=(z.x0+z.x1)/2;player.y=z.y1+14;}
        else msg('O Zé não quer essa lata velha!');
        S.zoneCd=3;}
    }
  }
  // missões
  if(S.mission&&player.state==='play'){const r=S.mission.def.update(S.mission,dt);if(r==='done')finishMission();else if(r==='fail')failMission('Missão falhou!');}
  else if(!S.mission&&!S.job&&S.phoneCd<=0&&player.state==='play'){
    for(const ph of phones){if(hyp(player.x-ph.x,player.y-ph.y)<46&&isOpenAt(ph.x,ph.y)){if(storyWantsPhone())storyPhoneCall();else startMission();break;}}
  }
  // partículas
  for(const p of S.parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.95;p.vy*=0.95;p.life-=dt;if(p.smoke)p.size+=dt*8;}
  S.parts=S.parts.filter(p=>p.life>0); if(S.parts.length>900)S.parts.splice(0,S.parts.length-900);
  for(const s of S.skids)s.life-=dt; S.skids=S.skids.filter(s=>s.life>0);
  for(const d of S.decals)d.life-=dt; S.decals=S.decals.filter(d=>d.life>0);
  for(const m of S.messages)m.life-=dt; S.messages=S.messages.filter(m=>m.life>0);
  if(S.bigMsg){S.bigMsg.life-=dt;if(S.bigMsg.life<=0)S.bigMsg=null;}
  if(player.money>S.best){S.best=player.money;try{localStorage.setItem('aq_best',S.best);}catch(e){}}

  // câmera
  const sp=player.car?player.car.speed:0;
  const tz=clamp(1.15-sp/520,0.55,1.15)*clamp(CH/820,0.7,1.6);
  cam.zoom=lerp(cam.zoom,tz,1-Math.pow(0.15,dt));
  const lx=player.car?player.car.vx*0.45:0, ly=player.car?player.car.vy*0.45:0;
  cam.x=lerp(cam.x,player.x+lx,1-Math.pow(0.02,dt));cam.y=lerp(cam.y,player.y+ly,1-Math.pow(0.02,dt));
  S.shake*=Math.pow(0.02,dt);

  // áudio contínuo
  if(AU.ctx){const t=AU.ctx.currentTime;
    const ev=player.car&&!AU.muted?0.05+Math.min(0.06,sp/5000):0;
    AU.engG.gain.setTargetAtTime(ev,t,0.05);AU.eng.frequency.setTargetAtTime(45+sp*0.32+(keys['KeyW']||keys['ArrowUp']?15:0),t,0.05);
    let cd=1e9;for(const c of S.cars)if(c.ai==='police'){const d=hyp(c.x-player.x,c.y-player.y);if(d<cd)cd=d;}
    const sv=!AU.muted&&cd<900?0.05*(1-cd/900):0;AU.sirG.gain.setTargetAtTime(sv,t,0.1);
    AU.sir.frequency.setTargetAtTime((Math.floor(S.gameTime*2.2)%2)?640:880,t,0.03);}
}

export function collideCars(){
  const n=S.cars.length;
  for(let i=0;i<n;i++){const a=S.cars[i];const ca=a.circles();
    for(let j=i+1;j<n;j++){const b=S.cars[j];if(a.towed||b.towed)continue;const lim=(a.t.len+b.t.len)/2+4;if(Math.abs(a.x-b.x)>lim||Math.abs(a.y-b.y)>lim)continue;
      const cb=b.circles();
      for(const p of ca)for(const q of cb){const dx=p[0]-q[0],dy=p[1]-q[1],d=hyp(dx,dy),r=p[2]+q[2];
        if(d<r&&d>0.01){const nx=dx/d,ny=dy/d,ov=r-d;const ma=a.wreck?3:a.t.mass,mb=b.wreck?3:b.t.mass;
          const ta=mb/(ma+mb),tb=ma/(ma+mb);
          const pa=[a.x+nx*ov*ta,a.y+ny*ov*ta], pb=[b.x-nx*ov*tb,b.y-ny*ov*tb];
          if(!a.hits(pa[0],pa[1],a.a)){a.x=pa[0];a.y=pa[1];} if(!b.hits(pb[0],pb[1],b.a)){b.x=pb[0];b.y=pb[1];}
          const vn=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
          if(vn<0){const jj=-(1.3)*vn/(1/ma+1/mb);a.vx+=jj/ma*nx;a.vy+=jj/ma*ny;b.vx-=jj/mb*nx;b.vy-=jj/mb*ny;
            const imp=-vn;
            if(imp>70){const dmg=(imp-70)*0.11;
              const src=(a===player.car||b===player.car)?'player':null;
              if(src){a.lastHitBy='player';b.lastHitBy='player';}
              const pd=(imp-40)*0.3; // batida do jogador machuca bem mais o outro carro
              if(src&&a!==player.car)a.damage(pd,'player');else a.damage(dmg*(b.t.mass/ma),null);
              if(src&&b!==player.car)b.damage(pd,'player');else b.damage(dmg*(a.t.mass/mb),null);
              if(onScreen(a.x,a.y))sfxNoise(0.3,clamp(imp/500,0.08,0.6),800);
              crashSparks((a.x+b.x)/2,(a.y+b.y)/2,imp);
              if(src){S.shake=Math.max(S.shake,Math.min(10,imp/50));if(imp>180)S.hitStop=Math.max(S.hitStop||0,0.06);
                const other=a===player.car?b:a;if(other.ai==='police'&&other.hitCd<=0){addHeat(30);other.hitCd=1.5;}}
            }}
        }}
    }}
}
export function updatePeds(dt){
  for(const p of S.peds){
    p.anim+=dt;
    if(p.state==='dead'||p.state==='gone'||p.state==='dead2')continue;
    // atropelamento
    for(const c of S.cars){if(c.wreck&&c.speed<40)continue;const dx=p.x-c.x,dy=p.y-c.y;if(dx*dx+dy*dy>3600)continue;
      for(const ci of c.circles()){const d=hyp(p.x-ci[0],p.y-ci[1]);if(d<ci[2]+5){
        if(c.speed>70){killPed(p,c===player.car);if(onScreen(p.x,p.y))sfxNoise(0.15,0.25,500);break;}
        else{const nx=(p.x-ci[0])/(d||1),ny=(p.y-ci[1])/(d||1);const nx2=p.x+nx*(ci[2]+5-d),ny2=p.y+ny*(ci[2]+5-d);if(!solidAt(nx2,ny2)){p.x=nx2;p.y=ny2;}}}}
      if(p.state==='dead')break;}
    if(p.state==='dead')continue;
    if(p.cop&&p.state==='cop'){ // policial a pé: corre atrás e atira
      const l=updateCopPed(p,dt);
      if(p.state==='cop'&&heatStars()>=2){p.shootCd-=dt;
        const U=COP_UNITS[p.unit]||COP_UNITS.policia;
        if(p.shootCd<=0&&l<U.range&&player.state==='play'&&los(p.x,p.y,player.x,player.y)){fire(p.x,p.y,p.a+rand(-U.spread,U.spread),WEAPONS[U.gun],false,null);p.shootCd=rand(U.cd[0],U.cd[1]);}}
      continue;}
    // fugir de carro rápido perto
    if(p.state==='walk'){const pc=player.car;if(pc&&pc.speed>150&&hyp(pc.x-p.x,pc.y-p.y)<90&&Math.random()<0.1){p.state='flee';p.flee={x:pc.x,y:pc.y};p.t=2.5;}}
    if(p.state==='guard'){updateGuard(p,dt);continue;}
    if(p.state==='wait'||p.state==='story'){if(hyp(player.x-p.x,player.y-p.y)<260)p.a=Math.atan2(player.y-p.y,player.x-p.x);continue;}
    if(p.state==='capanga')continue; // story.js cuida
    if(p.state==='down'){p.t-=dt;if(p.t<=0){if(p.robber)p.state='robber';else{p.state='flee';p.flee={x:player.x,y:player.y};p.t=3;}}continue;}
    if(p.state==='robber')continue;
    if(p.state==='flee'){p.t-=dt;const dx=p.x-p.flee.x,dy=p.y-p.flee.y,l=hyp(dx,dy)||1;let mx=dx/l,my=dy/l;
      const sp=115;const nx=p.x+mx*sp*dt,ny=p.y+my*sp*dt;p.a=Math.atan2(my,mx);
      if(!solidAt(nx,p.y))p.x=nx;if(!solidAt(p.x,ny))p.y=ny;
      if(p.t<=0){p.state='walk';p.dir=randi(0,3);}continue;}
    // andar
    const ax=p.x+DX[p.dir]*12, ay=p.y+DY[p.dir]*12;
    if(!pedWalkable(ax,ay)||Math.random()<0.004){
      const opts=[0,1,2,3].filter(d=>d!==(p.dir+2)%4&&pedWalkable(p.x+DX[d]*12,p.y+DY[d]*12));
      p.dir=opts.length?pick(opts):(p.dir+2)%4;}
    else{p.x+=DX[p.dir]*p.spd*dt;p.y+=DY[p.dir]*p.spd*dt;}
    p.a=Math.atan2(DY[p.dir],DX[p.dir]);
  }
  // jogador a pé sendo atropelado
  if(!player.car&&player.state==='play'){
    for(const c of S.cars){if(c.speed<80)continue;const dx=player.x-c.x,dy=player.y-c.y;if(dx*dx+dy*dy>3600)continue;
      for(const ci of c.circles()){const d=hyp(player.x-ci[0],player.y-ci[1]);if(d<ci[2]+7){hurtPlayer(c.speed*0.12);
        const nx=(player.x-ci[0])/(d||1),ny=(player.y-ci[1])/(d||1);const tx=player.x+nx*20,ty=player.y+ny*20;if(!solidAt(tx,ty)){player.x=tx;player.y=ty;}
        c.vx*=0.85;c.vy*=0.85;break;}}}
  }
}
