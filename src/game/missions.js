// Missões dos orelhões
import { saveGame } from './save.js';
import { rand, randi, pick, hyp, fmtMoney } from '../core/utils.js';
import { T, W, H, SIDE, phones, special, tileAt } from '../world/map.js';
import { randomRoadPoint, headingOpen } from '../ai/traffic.js';
import { sfxTone, sfxWin } from '../audio/audio.js';
import { Car } from '../entities/vehicles.js';
import { Ped } from '../entities/peds.js';
import { addHeat, msg, big, spawnTraffic } from './world.js';
import { update } from './update.js';
import { S, player } from '../core/state.js';
import { isOpenAt, isOpenZone } from './blitz.js';

// caminhonete da gangue: nasce em bairro aberto, indo pra bairro aberto, e não entra em bairro fechado
function spawnGang(){
  for(let k=0;k<8;k++){
    const c=spawnTraffic(700,1800,true,'camin','traffic',isOpenAt);if(!c)return null;
    if(headingOpen(c)){c.stayOpen=true;return c;}
    const i=S.cars.indexOf(c);if(i>=0)S.cars.splice(i,1);
  }
  return null;
}

export function roadPointFar(dmin,dmax){
  let best=null;
  for(let i=0;i<160;i++){const p=randomRoadPoint();if(!isOpenAt(p.x,p.y))continue;const d=hyp(p.x-player.x,p.y-player.y);if(d>=dmin&&d<=dmax)return{x:p.x,y:p.y};if(!best||Math.abs(d-dmin)<Math.abs(hyp(best.x-player.x,best.y-player.y)-dmin))best=p;}
  return{x:best.x,y:best.y};
}
export function sidewalkPointFar(dmin,dmax){
  for(let i=0;i<600;i++){const x=Math.random()*W*T,y=Math.random()*H*T;if(tileAt(x,y)!==SIDE||!isOpenAt(x,y))continue;const d=hyp(x-player.x,y-player.y);if(d>=dmin&&d<=dmax)return{x:(Math.floor(x/T)+.5)*T,y:(Math.floor(y/T)+.5)*T};}
  return phones[0];
}
export const MISSIONS=[
  {title:'Encomenda da Dona Socorro',start(m){m.dest=roadPointFar(1300,2600);m.time=80;m.reward=1000;
      m.text='Leva a encomenda pro ponto marcado. Arruma um carro!';},
    update(m,dt){m.time-=dt;if(m.time<=0)return'fail';if(player.car&&hyp(player.car.x-m.dest.x,player.car.y-m.dest.y)<60)return'done';},
    target(m){return m.dest;}},
  {title:'Corrida do Chico',start(m){m.pick=sidewalkPointFar(700,1400);m.p=new Ped(m.pick.x,m.pick.y);m.p.mission=m;m.p.state='wait';m.p.shirt='#ffeb3b';S.peds.push(m.p);
      m.stage=0;m.time=110;m.reward=1500;m.text='Pega o passageiro (de amarelo) e leva ele no destino.';
      m.onPedDead=()=>{m.dead=true;};m.onPedHit=()=>{m.dead=true;};},
    update(m,dt){if(m.dead)return'fail';m.time-=dt;if(m.time<=0)return'fail';
      if(m.stage===0){if(player.car&&hyp(player.car.x-m.p.x,player.car.y-m.p.y)<70&&player.car.speed<70){m.stage=1;m.p.state='gone';m.dest=roadPointFar(1300,2400);m.time+=25;m.text='Passageiro a bordo! Leva ele pro destino.';sfxTone(880,0.15,0.1);}}
      else{if(!player.car){m.text='Volta pro carro! O passageiro tá esperando.';}
        else if(hyp(player.car.x-m.dest.x,player.car.y-m.dest.y)<60&&player.car.speed<120)return'done';}},
    target(m){return m.stage===0?m.p:m.dest;}},
  {title:'O Brisa do Doutor',needs:['rico','orla'],start(m){const e=pick([special.estac,special.estac2,special.estac3]);
      m.car=new Car('brisa',e.x,e.y,0,'#e8242b');m.car.mission=m;S.cars.push(m.car);m.reward=2500;m.time=200;m.stage=0;
      m.text='Rouba o Brisa GT vermelho do estacionamento e leva pra Oficina do Zé.';
      m.onDestroyed=()=>{m.lost=true;};
      m.onEnter=()=>{if(m.stage===0){m.stage=1;addHeat(120);msg('O alarme disparou!');m.text='Leva o Brisa pra Oficina do Zé (laranja no mapa).';}};},
    update(m,dt){if(m.lost)return'fail';m.time-=dt;if(m.time<=0)return'fail';
      const z=special.ze;if(m.stage===1&&player.car===m.car&&inZone(m.car,z)){m.car.mission=null;m.zeDone=m.car;return'done';}},
    target(m){if(m.stage===1&&player.car===m.car){const z=special.ze;return{x:(z.x0+z.x1)/2,y:(z.y0+z.y1)/2};}return m.car;}},
  {title:'Acerto de Contas',start(m){m.gang=[];for(let i=0;i<3;i++){const c=spawnGang();if(c){c.color='#2e9e3e';c.mission=m;c.maxHp=110;c.health=110;c.cruise=rand(90,120);m.gang.push(c);}}
      m.left=m.gang.length;m.time=200;m.reward=3000;m.text='Destrói as 3 caminhonetes verdes da gangue do Galego.';
      msg('Dica: bate nelas com força. Quando pegar fogo, se afasta!',6);
      m.onDestroyed=(c)=>{m.left--;msg('Faltam '+m.left+'.');};},
    update(m,dt){m.time-=dt;if(m.time<=0)return'fail';if(m.left<=0)return'done';m.text='Bate nas caminhonetes verdes até pegarem fogo. Faltam '+m.left+'.';},
    target(m){let b=null,bd=1e9;for(const c of m.gang){if(c.burnT>0||c.wreck)continue;const d=hyp(c.x-player.x,c.y-player.y);if(d<bd){bd=d;b=c;}}return b;}},
  {title:'Fuga pela Beira-Mar',start(m){player.heat=Math.max(player.heat,280);m.time=150;m.reward=4000;m.stage=0;
      m.text='Os home tão na tua cola! Despista a polícia (zera as estrelas).';msg('Dica: a Pintura Express apaga as estrelas.');},
    update(m,dt){m.time-=dt;if(m.time<=0)return'fail';if(player.heat<=0)return'done';},
    target(m){return null;}},
];
export function startMission(){
  // pula missão que depende de bairro ainda fechado (ela volta na próxima rodada)
  for(let k=0;k<MISSIONS.length;k++){const d=MISSIONS[S.missionIdx%MISSIONS.length];if(!d.needs||d.needs.every(isOpenZone))break;S.missionIdx++;}
  const def=MISSIONS[S.missionIdx%MISSIONS.length];const round=Math.floor(S.missionIdx/MISSIONS.length);
  S.mission={def,title:def.title};def.start(S.mission);S.mission.reward=Math.round(S.mission.reward*(1+round*0.6));
  big(def.title,'Missão '+(S.missionIdx+1),'#ffd84a',2.5);sfxTone(660,0.2,0.1);sfxTone(880,0.3,0.1,'square',0.18);
}
export function finishMission(){setTimeout(()=>saveGame(true),0);player.money+=S.mission.reward;big('MISSÃO CUMPRIDA',fmtMoney(S.mission.reward),'#5cff7a',3);sfxWin();
  if(S.mission.zeDone){const c=S.mission.zeDone;player.car=null;c.driver=null;{const ix=S.cars.indexOf(c);if(ix>=0)S.cars.splice(ix,1);}player.x=(special.ze.x0+special.ze.x1)/2;player.y=special.ze.y1+10;}
  cleanupMission();S.missionIdx++;S.mission=null;S.phoneCd=3;}
export function failMission(t){if(!S.mission)return;msg(t||'Missão falhou.');cleanupMission();S.mission=null;S.phoneCd=3;}
export function cleanupMission(){if(!S.mission)return;for(const c of S.cars)if(c.mission===S.mission)c.mission=null;for(const p of S.peds)if(p.mission===S.mission){p.mission=null;if(p.state==='wait'||p.state==='gone')p.state=p.state==='gone'?'dead2':'walk';}}
export function inZone(o,z){return o.x>z.x0&&o.x<z.x1&&o.y>z.y0&&o.y<z.y1;}
