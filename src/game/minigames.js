// Bicos e minigames ligados às tarefas.
//  - Barraca do camelódromo (Centro, 8h às 18h, uma vez por dia): pechincha no tempo certo (ESPAÇO no verde)
//    e, de vez em quando, "OLHA O RAPA!" (F rápido pra recolher a mercadoria)
//  - Máquina de costura da mãe (pedido pessoal): repetir a sequência de setas antes do tempo acabar
//  - Bicos da caderneta: quem tem segredo às vezes pede um favor pago (C mostra a ficha, F aceita)
import { rand, randi, pick, hyp, clamp, fmtMoney } from '../core/utils.js';
import { special, buildings } from '../world/map.js';
import { doorOf } from './jobs.js';
import { msg, big, addHeat } from './world.js';
import { sfxTone, sfxWin } from '../audio/audio.js';
import { S, player } from '../core/state.js';

// ---------- motor: S.mini = {type,...}; o jogo fica parado enquanto roda ----------
const TYPES={};
export function startMini(type,opts){S.mini=Object.assign({type,t:0},opts||{});TYPES[type].start(S.mini);sfxTone(660,0.06,0.05,'square');}
export function updateMini(dt){const m=S.mini;if(!m)return;m.t+=dt;TYPES[m.type].update(m,dt);}
export function miniKey(code){const m=S.mini;if(!m)return;if(code==='Escape'){TYPES[m.type].quit(m);return;}TYPES[m.type].key(m,code);}
function endMini(){const m=S.mini;S.mini=null;if(m&&m.onEnd)m.onEnd(m);}

// ---------- pechincha na barraca ----------
const ROUNDS=6;
TYPES.pechincha={
  start(m){m.round=0;m.earned=0;m.lost=0;m.log=[];newRound(m);},
  update(m,dt){
    if(m.rapa){m.rapaT-=dt;if(m.rapaT<=0){m.rapa=false;m.lost+=40;m.log.push('O rapa levou mercadoria (-$40)');sfxTone(160,0.3,0.1,'triangle');nextRound(m);}return;}
    if(m.wait>0){m.wait-=dt;if(m.wait<=0)nextRound(m);return;}
    m.pos+=m.dir*m.speed*dt;if(m.pos>1){m.pos=1;m.dir=-1;}if(m.pos<0){m.pos=0;m.dir=1;}
    m.patience-=dt;if(m.patience<=0){m.log.push('O freguês desistiu');m.result='desistiu';m.wait=0.8;sfxTone(220,0.12,0.06,'triangle');}
  },
  key(m,code){
    if(m.rapa){if(code==='KeyF'){m.rapa=false;m.log.push('Recolheu a tempo do rapa!');sfxTone(990,0.08,0.06,'square');nextRound(m);}return;}
    if(m.wait>0||m.done)return;
    if(code==='Space'||code==='Enter'){
      const d=Math.abs(m.pos-m.zone);let v;
      if(d<m.w*0.5){v=m.price;m.result='fechou: '+fmtMoney(v);sfxTone(1320,0.06,0.05,'square');sfxTone(1760,0.08,0.05,'square',0.07);}
      else if(d<m.w*1.3){v=Math.round(m.price*0.45);m.result='vendeu barato: '+fmtMoney(v);sfxTone(880,0.06,0.05,'square');}
      else{v=0;m.result='o freguês riu e foi embora';sfxTone(200,0.12,0.06,'triangle');}
      m.earned+=v;m.log.push(m.result);m.wait=0.9;
    }
  },
  quit(m){m.round=ROUNDS;finishBarraca(m);},
};
const ITENS=['relógio de camelô','fita K7 pirata','óculos escuros','rádio de pilha','tênis "importado"','calculadora','controle de TV universal','pilha Rayovac... digo, "Raiovaque"'];
function newRound(m){
  m.item=pick(ITENS);m.price=randi(22,40);m.zone=rand(0.2,0.8);m.w=rand(0.07,0.11)-m.round*0.006;m.pos=0;m.dir=1;m.speed=rand(0.9,1.3)+m.round*0.12;
  m.patience=4.5;m.wait=0;m.result=null;
}
function nextRound(m){
  m.round++;if(m.round>=ROUNDS){finishBarraca(m);return;}
  if(Math.random()<0.22){m.rapa=true;m.rapaT=1.3;m.result=null;sfxTone(1500,0.05,0.06,'square');sfxTone(1500,0.05,0.06,'square',0.1);return;}
  newRound(m);
}
function finishBarraca(m){
  const tot=Math.max(0,m.earned-m.lost);m.done=true;player.money+=tot;
  big('FIM DO TURNO NA BARRACA',fmtMoney(tot)+' no bolso'+(m.lost?' (o rapa levou '+fmtMoney(m.lost)+')':''),'#7dff6b',3.2);
  if(tot>0)sfxWin();endMini();
}
export function startBarraca(){
  const s=S.story;
  if(S.tod<8||S.tod>=18){msg('O camelódromo só funciona de dia (8h às 18h).',3);return;}
  if(s.barracaDay===S.day){msg('Por hoje a barraca já rendeu. Volta amanhã.',3);return;}
  s.barracaDay=S.day;startMini('pechincha');
}

// ---------- conserto da máquina de costura ----------
const ARROWS=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'];
TYPES.conserto={
  start(m){m.seq=Array.from({length:6},()=>pick(ARROWS));m.i=0;m.time=12;m.fails=0;},
  update(m,dt){if(m.done)return;m.time-=dt;if(m.time<=0){m.ok=false;m.done=true;finishConserto(m);}},
  key(m,code){
    if(m.done)return;const map={KeyW:'ArrowUp',KeyD:'ArrowRight',KeyS:'ArrowDown',KeyA:'ArrowLeft'};code=map[code]||code;
    if(!ARROWS.includes(code))return;
    if(code===m.seq[m.i]){m.i++;sfxTone(700+m.i*90,0.05,0.05,'square');if(m.i>=m.seq.length){m.ok=true;m.done=true;finishConserto(m);}}
    else{m.fails++;m.i=0;m.time-=1.5;sfxTone(180,0.12,0.06,'triangle');}
  },
  quit(m){m.ok=false;m.done=true;finishConserto(m);},
};
function finishConserto(m){endMini();}
export function startConserto(onEnd){startMini('conserto',{onEnd});}

// ---------- bicos da caderneta ----------
const carceragem=()=>buildings.find(b=>b.kind==='policia');
const zeCenter=()=>{const z=special.ze;return z?{x:(z.x0+z.x1)/2,y:(z.y0+z.y1)/2}:null;};
// segredo -> favor. Sem entrada aqui, o segredo vira só uma anotação
export const BICOS={
  'deve ao Cabralzinho':{ask:'Tu vai pro Centro? Leva esse envelope pro Cabralzinho, no câmbio. Te dou quarenta.',text:'Leva o envelope da vizinha pro Cabralzinho, no câmbio do Centro.',reward:40,target:sp=>sp('cambio')},
  'vende peça roubada':{ask:'Leva essa caixa pra Oficina do Zé. Noventa na mão, e não abre.',text:'Leva a caixa de peças pra Oficina do Zé.',reward:90,risk:true,target:()=>zeCenter()},
  'joga no bicho todo dia':{ask:'Faz uma fezinha pra mim no Centro? Milhar 1997, cabeça. Trinta pelo serviço.',text:'Faz o jogo do bicho da freguesa no camelódromo do Centro.',reward:30,target:sp=>sp('camelodromo')},
  'tem um irmão na Carceragem':{ask:'Leva essa marmita pro meu irmão na Carceragem Central? Cinquenta.',text:'Leva a marmita pra Carceragem Central.',reward:50,target:()=>{const b=carceragem();return b?doorOf(b):null;}},
};
export function offerBico(p,f,spot,talk){
  const s=S.story;const B=BICOS[f.secret];
  if(!B){talk([['nota','('+f.name+': '+f.secret+'. Fica anotado.)']]);const n=f.name+': '+f.secret+'.';if(!s.notes.includes(n))s.notes.push(n);return;}
  if(s.bico){talk([['nota','Tu já tá num bico. Termina aquele primeiro.']]);return;}
  if(p.bicoDone){talk([['nota','('+f.name+' já te pagou hoje.)']]);return;}
  talk([{who:null,name:f.name,text:B.ask}],{choices:[
    {label:'Fechado ('+fmtMoney(B.reward)+')',run:()=>{const t=B.target(spot);if(!t)return;p.bicoDone=true;s.bico={text:B.text,x:t.x,y:t.y,reward:B.reward,risk:!!B.risk,by:f.name};msg('Bico aceito: '+B.text,4);}},
    {label:'Agora não',run:()=>{}},
  ]});
}
export function updateBico(){
  const s=S.story;if(!s||!s.bico||S.interior)return;const b=s.bico;
  const me=player.car||player;
  const d=hyp(me.x-b.x,me.y-b.y);if(d>250)b.armed=true; // aceitou do lado do destino: tem que sair e voltar
  if(b.armed&&d<70){
    player.money+=b.reward;s.bico=null;s.bicos=(s.bicos||0)+1;
    big('BICO FEITO','+'+fmtMoney(b.reward)+' de '+b.by,'#7dff6b',2.6);sfxTone(1320,0.06,0.05,'square');
    if(b.risk&&Math.random()<0.3){addHeat(110);msg('Um PM viu a caixa de peças...',3);}
  }
}
