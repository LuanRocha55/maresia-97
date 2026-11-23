// Estádio do Jacarandá: dia de jogo todo dia das 15h30 às 18h, com torcida, gols e aposta
// (times inventados)
import { rand, pick, hyp, fmtMoney } from '../core/utils.js';
import { T, special, tileAt, PARK } from '../world/map.js';
import { Ped } from '../entities/peds.js';
import { sfxNoise, sfxTone } from '../audio/audio.js';
import { msg, big } from './world.js';
import { S, player } from '../core/state.js';

export const HOME={name:'Jacarandá FC',colors:['#1565c0','#ffffff']};
const AWAY=[
  {name:'Tubarões do Porto',colors:['#455a64','#ff7043']},
  {name:'Cajueiro EC',colors:['#2e7d32','#fdd835']},
  {name:'Unidos do Recanto',colors:['#e53935','#ffffff']},
  {name:'Colônia AC',colors:['#6a1b9a','#fdd835']},
];
export const MATCH_START=15.5, MATCH_END=18;
// dia do calendário do jogo: avança quando o relógio passa da meia-noite, seja andando, dormindo
// ou dentro de um interior (S.tod menor que no último passo). Muda o adversário e zera a partida.
function day(){
  if(typeof S.lastTod==='number'&&S.tod<S.lastTod)S.day=(S.day||0)+1;
  S.lastTod=S.tod;
  return S.day||0;
}
export function matchOn(){return S.tod>=MATCH_START&&S.tod<MATCH_END;}
export function opponent(){return AWAY[day()%AWAY.length];}
export function match(){
  const d=day();
  if(!S.match||S.match.day!==d)S.match={day:d,hs:0,as:0,bet:0,watched:false,ended:false,goalT:rand(6,14)};
  return S.match;
}
const center=()=>{const b=special.estadio;return b?{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2}:null;};
const near=r=>{const c=center();return c&&hyp(player.x-c.x,player.y-c.y)<r;};

function goal(home){
  const m=match();
  if(home)m.hs++;else m.as++;
  const who=home?HOME.name:opponent().name;
  if(near(1400)){big('GOL!',who+'  '+m.hs+' x '+m.as,home?'#64b5f6':'#ffb74d',2);sfxNoise(1.6,0.35,900);}
}
function endMatch(){
  const m=match();m.ended=true;
  const res=m.hs>m.as?'vitória do '+HOME.name:m.hs<m.as?'vitória do '+opponent().name:'empate';
  if(near(1600)||m.bet||m.watched)msg('Fim de jogo no Estádio: '+HOME.name+' '+m.hs+' x '+m.as+' '+opponent().name+' ('+res+')',5);
  if(m.bet){if(m.hs>m.as){const v=m.bet*2.5;player.money+=v;big('APOSTA GANHA','+'+fmtMoney(v),'#7dff6b',2.5);}else msg('Perdeu a aposta de '+fmtMoney(m.bet)+'.',3);m.bet=0;}
}

let pedT=0, roarT=0;
export function updateStadium(dt){
  if(!special.estadio)return;
  const m=match();
  if(matchOn()&&!m.ended){
    m.goalT-=dt;
    if(m.goalT<=0){m.goalT=rand(8,18);if(Math.random()<0.55)goal(Math.random()<0.55);}
    // torcida em volta do estádio
    pedT-=dt;
    if(pedT<=0&&near(1300)){pedT=0.5;
      const fans=S.peds.filter(p=>p.fan).length;
      if(fans<40){const b=special.estadio;
        for(let k=0;k<20;k++){const x=rand(b.x0-60,b.x1+60),y=rand(b.y0-60,b.y1+60);
          if(tileAt(x,y)!==PARK)continue;
          if(x>b.x0&&x<b.x1&&y>b.y0&&y<b.y1)continue;
          const p=new Ped(x,y);p.fan=true;p.shirt=Math.random()<0.7?pick(HOME.colors):pick(opponent().colors);S.peds.push(p);break;}}}
    roarT-=dt;if(roarT<=0&&near(900)){roarT=rand(2,4);sfxNoise(1.2,0.04,500);}
  } else if(!m.ended&&S.tod>=MATCH_END&&S.tod<MATCH_END+1){endMatch();}
}

// itens do menu da bilheteria (usado pelo interiors.js)
export function stadiumItems(){
  const m=match();
  return [
    {label:'Assistir ao jogo ('+HOME.name+' x '+opponent().name+')',price:20,
      disabled:()=>!matchOn()||m.watched,why:()=>m.watched?'Já assistiu':'Sem jogo agora',
      run:()=>{S.menu=null;m.watched=true;
        // pula até o fim da partida
        const left=Math.max(0,MATCH_END-S.tod);const goals=Math.round(left*1.4*Math.random()+left*0.4);
        for(let k=0;k<goals;k++){if(Math.random()<0.55)m.hs++;else m.as++;}
        S.tod=MATCH_END+0.05;player.health=Math.min(100,player.health+15);endMatch();}},
    {label:'Apostar no '+HOME.name+' (paga 2,5x se ganhar)',price:100,
      disabled:()=>!matchOn()||m.bet>0||S.tod>17,why:()=>m.bet>0?'Já apostou':S.tod>17&&matchOn()?'Apostas fechadas':'Sem jogo agora',
      run:()=>{m.bet=100;msg('Aposta feita! Resultado no fim do jogo (18h).',3);}},
    {label:'Ver placar',price:0,run:()=>{S.menu=null;msg(matchOn()?'Agora: '+HOME.name+' '+m.hs+' x '+m.as+' '+opponent().name:'Próximo jogo: hoje às 15h30 contra '+opponent().name,4);}},
  ];
}
export function stadiumSub(){const m=match();return matchOn()?'AO VIVO: '+HOME.name+' '+m.hs+' x '+m.as+' '+opponent().name:'Jogo todo dia às 15h30 · hoje contra '+opponent().name;}
