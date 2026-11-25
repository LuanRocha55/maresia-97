// Começo guiado (ensina jogando) e dicas de primeira vez
import { hyp } from '../core/utils.js';
import { phones, special } from '../world/map.js';
import { doorOf } from './jobs.js';
import { isOpenAt } from './blitz.js';
import { heatStars, big } from './world.js';
import { nearestDoor } from './interiors.js';
import { JOBS } from './jobs.js';
import { darkness } from '../world/time.js';
import { sfxTone } from '../audio/audio.js';
import { S, player } from '../core/state.js';

const DONE_KEY='aq_tutorial_done', HINT_KEY='aq_hints';
const store={get(k){try{return localStorage.getItem(k);}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,v);}catch(e){}}};

export const tut={active:false,step:0,acc:0,last:null,car:null,flash:0};
const nearestPhone=()=>{let b=null,bd=1e9;for(const p of phones){if(!isOpenAt(p.x,p.y))continue;const d=hyp(p.x-player.x,p.y-player.y);if(d<bd){bd=d;b=p;}}return b;};
const casaTarget=()=>special.casa?doorOf(special.casa):null;
const STEPS=[
  {title:'Anda pela calçada',keys:['W','A','S','D'],text:'Usa WASD (ou as setas) pra andar. SHIFT corre.',
    done:()=>tut.acc>160},
  {title:'Entra em casa',keys:['F'],text:'Segue a seta até a porta da tua casa e aperta F. Tua mãe tá esperando.',
    target:()=>S.story&&S.story.step==='casa'?casaTarget():null, done:()=>!S.story||S.story.step!=='casa'},
  {title:'Pega aquele carro',keys:['F'],text:'Chega perto do carro marcado e aperta F pra entrar.',
    target:()=>tut.car&&!tut.car.wreck?tut.car:null, done:()=>!!player.car},
  {title:'Dá uma volta',keys:['W','A','D','ESPAÇO'],text:'W acelera, S freia/ré, A e D viram, ESPAÇO é o freio de mão.',
    done:()=>tut.acc>700},
  {title:'Abre o mapa',keys:['M'],text:'Aperta M pra ver a cidade inteira (e M de novo pra fechar).',
    done:()=>S.mapOpenedOnce},
];
export const tutorialSteps=STEPS;

export function startTutorial(){
  if(store.get(DONE_KEY))return;
  tut.active=true;tut.step=0;tut.acc=0;tut.last={x:player.x,y:player.y};
  // o carro mais perto do começo é o "carro do tutorial"
  let b=null,bd=1e9;for(const c of S.cars){const d=hyp(c.x-player.x,c.y-player.y);if(d<bd&&!c.driver){bd=d;b=c;}}tut.car=b;
}
export function skipTutorial(){if(!tut.active)return;tut.active=false;store.set(DONE_KEY,'1');big('TUTORIAL PULADO','Dicas vão aparecendo quando precisar','#7fd8ff',2);}
export const tutorialTarget=()=>tut.active&&STEPS[tut.step].target?STEPS[tut.step].target():null;
export const currentStep=()=>tut.active?STEPS[tut.step]:null;

// ---- dicas de primeira vez (cartãozinho no canto) ----
let seen={};try{seen=JSON.parse(store.get(HINT_KEY)||'{}');}catch(e){}
export function hintOnce(id,title,text,keys){
  if(seen[id]||tut.active)return;
  seen[id]=1;store.set(HINT_KEY,JSON.stringify(seen));
  S.toasts.push({title,text,keys:keys||[],life:8,max:8});
  sfxTone(880,0.06,0.05,'sine');sfxTone(1175,0.08,0.05,'sine',0.07);
}

export function updateTutorial(dt){
  for(const t of S.toasts)t.life-=dt;
  S.toasts=S.toasts.filter(t=>t.life>0);
  if(tut.flash>0)tut.flash-=dt;
  if(tut.active){
    // distância andada/dirigida
    const p=player.car||player;if(tut.last){tut.acc+=Math.min(50,hyp(p.x-tut.last.x,p.y-tut.last.y));}tut.last={x:p.x,y:p.y};
    const st=STEPS[tut.step];
    if(st.done()){
      tut.step++;tut.acc=0;tut.flash=1;sfxTone(660,0.08,0.08,'square');sfxTone(990,0.12,0.08,'square',0.08);
      if(tut.step>=STEPS.length){tut.active=false;store.set(DONE_KEY,'1');
        big('A CIDADE É TUA','O bip lá em cima mostra o que fazer agora','#7dff6b',3);
        setTimeout(()=>hintOnce('caderneta','A caderneta do teu pai','C perto de alguém mostra nome, ofício e às vezes um segredo. Longe de todo mundo, abre as páginas.',['C']),4000);
        setTimeout(()=>hintOnce('lojas','Dá pra entrar nos comércios','Nas portas com ícone no chão, aperta F. Comida recupera vida.',['F']),14000);
        setTimeout(()=>hintOnce('empregos','Quer grana sem missão?','Aperta J pra ver os empregos. Eu marco no mapa onde começar.',['J']),16000);}
    }
    return;
  }
  // gatilhos de dica, na primeira vez que acontecem
  if(player.state!=='play')return;
  if(!player.car&&nearestDoor(60))hintOnce('porta','Porta de comércio','Aperta F pra entrar e andar lá dentro.',['F']);
  if(heatStars()>0)hintOnce('estrela','A polícia te viu','Some da vista deles por uns segundos que as estrelas caem. A Pintura Express apaga na hora.',[]);
  if(player.health<40)hintOnce('vida','Vida baixa','Lanchonete, padaria e mercadinho recuperam vida. Farmácia vende kit e colete.',[]);
  if(player.car&&Object.values(JOBS).some(j=>j.vehicle&&j.vehicle.includes(player.car.type)))hintOnce('emprego','Esse veículo tem emprego','Aperta J pra começar um turno e ganhar dinheiro.',['J']);
  if(player.car&&player.car.health<player.car.t.hp*0.4)hintOnce('conserto','Carro soltando fumaça','Passa por baixo da cobertura de um posto (ícone de bomba) pra consertar.',[]);
  if(darkness()>0.6)hintOnce('noite','Anoiteceu','De noite rola o emprego de vigilante: porta de mercadinho ou farmácia, aperta J.',['J']);
  if(S.playTime>40)hintOnce('empregos','Quer grana sem missão?','Aperta J pra ver os empregos. Eu marco no mapa onde começar.',['J']);
  if(player.money>=400)hintOnce('grana','Já dá pra gastar','Arma no Armas do Tonhão, colete na farmácia, curso na escola.',[]);
  if(S.job)hintOnce('turno','Turno começou','Segue a seta. Sair do veículo encerra o turno.',[]);
}
