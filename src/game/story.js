// História da Semana 1: prólogo e capítulo 1 ("Quem plantou o flagrante?"), a dívida com o Cabralzinho
// (parcela toda sexta até as 20h) e as cenas de diálogo. O roteiro completo está em docs/roteiro.md.
//
// O estado da história fica em S.story (vai junto no save). Coisas que só existem enquanto o jogo roda
// (pedestres da história, a viatura seguida, a conversa aberta) ficam neste módulo.
import { hyp, rand, pick, clamp, fmtMoney } from '../core/utils.js';
import { T, W, H, SIDE, tileOf, special, phones, buildings } from '../world/map.js';
import { zoneAt } from '../world/zoning.js';
import { doorOf } from './jobs.js';
import { isOpenAt, unlockZone } from './blitz.js';
import { msg, big, spawnTraffic, heatStars } from './world.js';
import { hurtPlayer } from './effects.js';
import { syncDay, weekday } from '../world/time.js';
import { sfxTone, sfxWin } from '../audio/audio.js';
import { Ped } from '../entities/peds.js';
import { initNeeds, eat } from './needs.js';
import { startBarraca, startConserto, offerBico, updateBico } from './minigames.js';
import { S, player, cam } from '../core/state.js';

// ---------- quem fala ----------
export const CHARS={
  eu:{name:'Você',col:'#ffffff'},
  mae:{name:'Dona Tereza',col:'#f48fb1',role:'tua mãe, costureira'},
  pai:{name:'Seu Oswaldo',col:'#ffd54f',role:'teu pai, quiosqueiro preso'},
  juninho:{name:'Juninho',col:'#81d4fa',role:'teu irmão, 15 anos'},
  nenem:{name:'Neném',col:'#ff7043',role:'chefe da Turma do Alto'},
  zeca:{name:'Seu Zeca',col:'#aed581',role:'radioamador do morro'},
  mariana:{name:'Mariana',col:'#ce93d8',role:'repórter do Jornal da Guanabara'},
  cabral:{name:'Cabralzinho',col:'#ffb300',role:'o agiota'},
  peixoto:{name:'Cabo Peixoto',col:'#90a4ae',role:'PM do batalhão do morro'},
  cida:{name:'Dona Cida',col:'#ffab91'},
  bira:{name:'Seu Bira',col:'#ffcc80'},
  radio:{name:'Scanner',col:'#7dff6b'},
  farol:{name:'Rádio Farol AM',col:'#ffe14a'},
  capanga:{name:'Capanga',col:'#ef5350'},
  terno:{name:'Homem de terno',col:'#b0bec5'},
  nota:{name:'',col:'#ffe9a0'},
};
// quem aparece na página "Pessoas" da caderneta (vínculo de 0 a 5)
export const PEOPLE=['pai','mae','juninho','nenem','zeca','mariana','peixoto'];
export const CLUES=[
  {k:'testemunha',title:'A testemunha do camelódromo',how:'No camelódromo do Centro alguém viu a prisão. Usa C nas pessoas.'},
  {k:'viatura',title:'O número da viatura',how:'Liga o scanner (R) e fica de ouvido na rua.'},
  {k:'batalhao',title:'Seguir a viatura até o batalhão',how:'Segue a viatura 2-14 de longe, sem ela te ver.'},
  {k:'ordem',title:'A ordem no arquivo da Carceragem',how:'Entra na Carceragem Central de madrugada (22h às 5h) e mexe no arquivo.'},
];
export const WEEKDAYS=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
const WEEKDAYS_LONG=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

export function newStory(){
  return {v:1,ch:0,step:'casa',met:{},vinc:{pai:3,mae:3,juninho:3,nenem:2,zeca:3,mariana:1,peixoto:1},
    tools:{},clues:{},skipped:{},notes:[],did:[],
    debt:5000,due:500,paidWeek:-1,checkedWeek:-1,late:0,lateWeek:-2,capWeek:-1,remind:{},
    earn:0,nenem:null,fita:null,mochila:null,mochilaDay:0,lied:false,promessa:false,
    materia:0,jornalDay:-1,jornalShown:false,envelope:null,favor:0,scanT:0,radioT:8,
    fome:85,sono:80,bico:null,bicos:0,barracaDay:-1,feijaoDay:-1,maquina:0};
}
const st=()=>S.story;
export const storyOn=()=>!!S.story;
export const hasTool=k=>!!(S.story&&S.story.tools[k]);
const vinc=(who,d)=>{const s=st();s.vinc[who]=clamp((s.vinc[who]||0)+d,0,5);};
const meet=who=>{st().met[who]=1;};
const note=t=>{const s=st();if(!s.notes.includes(t))s.notes.push(t);};
const did=t=>{st().did.push(t);};
const week=()=>Math.floor((S.day||0)/7);
export const clueCount=()=>{const s=st();return CLUES.filter(c=>s.clues[c.k]||s.skipped[c.k]).length;};
const cluesDone=()=>clueCount()>=CLUES.length;

// ---------- lugares da história (ponto de calçada mais perto do lugar desejado, no bairro certo) ----------
const WANT={
  inicio:[4960,560,'jardim'], galo:[5750,1120,'jardim'], cambio:[7700,6200,'centro'], camelodromo:[6448,5250,'centro'],
  lisboa:[8300,6600,'centro'], zeca:[2600,1300,'cajueiro'], boca:[2200,2300,'cajueiro'], envelope:[8800,5900,'centro'],
};
const PLACE_NAME={galo:'Bar do Galo',cambio:'Casa de Câmbio Cabral',camelodromo:'Camelódromo',lisboa:'Bar Lisboa',zeca:'Casa do Zeca',boca:'A boca do Cajueiro',envelope:'Entrega do envelope'};
const spots={};
export function spot(k){
  if(spots[k])return spots[k];
  const [wx,wy,z]=WANT[k],tx0=wx/T|0,ty0=wy/T|0;let best=null,bd=1e9;
  for(let r=0;r<30&&!best;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=tx0+dx,y=ty0+dy;
    if(tileOf(x,y)!==SIDE||zoneAt(x,y)!==z)continue;const d=dx*dx+dy*dy;if(d<bd){bd=d;best={x:(x+.5)*T,y:(y+.5)*T};}}
  return spots[k]=best||{x:wx,y:wy};
}
const casaDoor=()=>doorOf(special.casa);
const carceragem=()=>buildings.find(b=>b.kind==='policia');

// ---------- diálogo ----------
// S.dialog = {lines:[{who,text}], i, choices:[{label,run}] | null, onEnd}
export function talk(lines,opts){
  opts=opts||{};
  S.dialog={lines:lines.map(l=>Array.isArray(l)?{who:l[0],text:l[1]}:l),i:0,choices:opts.choices||null,onEnd:opts.onEnd||null,sel:0};
  sfxTone(520,0.05,0.05,'square');sfxTone(780,0.06,0.05,'square',0.06);
}
const atChoices=d=>d.choices&&d.i>=d.lines.length-1;
function endDialog(){const d=S.dialog;S.dialog=null;if(d&&d.onEnd)d.onEnd();}
export function dialogAdvance(){
  const d=S.dialog;if(!d)return;
  if(atChoices(d))return dialogChoose(d.sel);
  d.i++;sfxTone(660,0.03,0.04,'square');
  if(d.i>=d.lines.length)endDialog();
}
export function dialogChoose(i){
  const d=S.dialog;if(!d||!atChoices(d))return;const c=d.choices[i];if(!c)return;
  S.dialog=null;sfxTone(880,0.06,0.06,'square');c.run();
  if(!S.dialog&&d.onEnd)d.onEnd();
}
export function dialogKey(code){
  const d=S.dialog;if(!d)return;
  if(atChoices(d)){
    if(code==='ArrowUp'||code==='KeyW')d.sel=(d.sel+d.choices.length-1)%d.choices.length;
    else if(code==='ArrowDown'||code==='KeyS')d.sel=(d.sel+1)%d.choices.length;
    else if(/^Digit[1-4]$/.test(code)){const i=+code.slice(5)-1;if(i<d.choices.length)dialogChoose(i);}
    else if(code==='Enter'||code==='Space'||code==='KeyF')dialogChoose(d.sel);
    return;
  }
  if(code==='Enter'||code==='Space'||code==='KeyF'||code==='KeyE')dialogAdvance();
  else if(code==='Escape'&&!d.choices){d.i=d.lines.length;endDialog();}
}

// ---------- pedestres da história ----------
// cada personagem fica parado num lugar, em certas horas; some longe do jogador
const NPCS={
  cabral:{at:'cambio',shirt:'#e9dfc4',hair:'#5a5a5a',skin:'#e0ac69',when:()=>S.tod>=8&&S.tod<20&&st().step!=='casa'},
  nenem_bar:{who:'nenem',at:'galo',shirt:'#1d1d1d',hair:'#111',skin:'#8d5524',when:()=>st().step==='bar'&&nightish()},
  nenem:{at:'boca',shirt:'#1d1d1d',hair:'#111',skin:'#8d5524',when:()=>st().ch===1&&(nenemReady()||st().step==='turma')},
  zeca:{at:'zeca',shirt:'#6d5a3a',hair:'#d8d8d8',skin:'#c68642',when:()=>st().ch>=1},
  peixoto:{at:'galo',shirt:'#2f4f3f',hair:'#2b1d12',skin:'#e0ac69',when:()=>st().step==='peixoto'&&S.tod>=18},
  mariana:{at:'lisboa',shirt:'#5b7fb5',hair:'#3b2314',skin:'#c68642',fem:true,when:()=>st().step==='materia'&&S.tod>=8&&S.tod<23},
  terno:{at:'envelope',shirt:'#263238',hair:'#111',skin:'#f1c27d',when:()=>!!st().envelope},
};
const nightish=()=>S.tod>=19||S.tod<2;
const nenemReady=()=>{const s=st();return s.step==='pistas'&&!s.nenem&&clueCount()>=1;};
const live={};   // id -> Ped
let witness=null, extras=[];
function placeNpc(id,def){
  const p0=spot(def.at);let p=live[id];
  if(p&&(p.state==='dead'||p.state==='dead2'||S.peds.indexOf(p)<0))p=live[id]=null;
  const want=def.when()&&!S.interior;
  const d=hyp(p0.x-player.x,p0.y-player.y);
  if(want&&!p&&d<1600){
    p=new Ped(p0.x,p0.y);p.state='story';p.story=def.who||id;p.shirt=def.shirt;p.hair=def.hair;p.skin=def.skin;p.spd=0;
    if(def.fem)p.fem=true;S.peds.push(p);live[id]=p;
  } else if(p&&(!want||d>2200)){p.state='gone';live[id]=null;}
}
// gente parada no camelódromo, uma delas viu a prisão do pai
function placeCamelodromo(){
  const s=st(),need=s.step==='pistas'&&!s.clues.testemunha&&!s.skipped.testemunha;
  const c=spot('camelodromo'),d=hyp(c.x-player.x,c.y-player.y);
  if(need&&!witness&&d<1500){
    const mk=(dx,dy)=>{let x=c.x+dx,y=c.y+dy;const p=new Ped(x,y);p.state='story';p.spd=0;p.shirt=pick(['#e67e22','#f1c40f','#ecf0f1','#3498db','#2ecc71']);S.peds.push(p);return p;};
    witness=mk(rand(-60,60),rand(-60,60));witness.witness=true;witness.shirt='#ffcc80';witness.hair='#777';witness.skin='#8d5524';
    extras=[mk(-90,30),mk(80,-40),mk(30,90),mk(-40,-90)];
  } else if(witness&&(!need||d>2200||S.peds.indexOf(witness)<0)){for(const p of [witness,...extras])p.state='gone';witness=null;extras=[];}
}

// ---------- viatura 2-14 (pista "seguir até o batalhão") ----------
let tail=null; // {car,t,close,cd}
let tailCd=0;
function updateTail(dt){
  const s=st();
  const want=s.step==='pistas'&&s.clues.viatura&&!s.clues.batalhao&&!s.skipped.batalhao&&!S.interior;
  if(!want){if(tail){tail.car.keep=false;tail.car.story=false;tail=null;}return;}
  if(tailCd>0){tailCd-=dt;return;}
  if(!tail||tail.car.wreck||S.cars.indexOf(tail.car)<0){
    const c=spawnTraffic(500,900,true,'viatura','traffic',isOpenAt);
    if(!c){tailCd=0.3;return;}
    c.keep=true;c.story=true;c.stayOpen=true;c.label='2-14';tail={car:c,t:0,close:0};
    msg('Lá vai a viatura 2-14. Segue de longe, sem colar nela.',4);return;
  }
  const me=player.car||player,c=tail.car,d=hyp(c.x-me.x,c.y-me.y);
  if(d<110){tail.close+=dt;if(tail.close>2.5){msg('A 2-14 te viu e meteu o pé. Espera um pouco e tenta de novo.',4);c.cruise=(c.cruise||100)*1.6;c.keep=false;c.story=false;tail=null;tailCd=25;sfxTone(220,0.2,0.08,'triangle');}return;}
  tail.close=Math.max(0,tail.close-dt);
  if(d>900){msg('Perdeu a viatura de vista. Já já ela passa de novo.',4);c.keep=false;c.story=false;tail=null;tailCd=15;return;}
  if(d<650)tail.t+=dt;
  if(tail.t>=40){
    c.keep=false;c.story=false;c.remove=true;tail=null;
    s.clues.batalhao=1;note('A 2-14 entrou no batalhão do morro. O de bigodinho desceu: na farda, PEIXOTO.');
    talk([['eu','A 2-14 entrou no batalhão do morro.'],['eu','O de bigodinho desceu e eu li na farda: PEIXOTO.']],{onEnd:()=>clueGot('batalhao')});
  }
}
export const tailInfo=()=>tail?{t:tail.t,close:tail.close,car:tail.car}:null;

// ---------- capangas do Cabralzinho (sábado depois de atrasar) ----------
let capangas=[], capT=0;
function updateCapangas(dt){
  const s=st();
  if(capangas.length){
    capT-=dt;
    const paid=s.paidWeek>=s.capWeek;
    let alive=0;
    for(const p of capangas){
      if(p.state==='dead'||p.state==='dead2'||p.state==='gone')continue;
      if(p.state==='flee'&&!p.gaveUp){p.knock=(p.knock||0)+1;if(p.knock>=2||paid||capT<=0)p.gaveUp=true;else p.state='capanga';}
      if(p.gaveUp||paid||capT<=0){if(p.state==='capanga'){p.state='flee';p.flee={x:player.x,y:player.y};p.t=6;p.gaveUp=true;}continue;}
      if(p.state!=='capanga')continue;alive++;
      const dx=player.x-p.x,dy=player.y-p.y,d=hyp(dx,dy);p.a=Math.atan2(dy,dx);
      if(player.car||S.interior){continue;}
      if(d>26){const sp=120;p.x+=dx/d*sp*dt;p.y+=dy/d*sp*dt;p.anim+=dt*6;}
      else{p.hitCd=(p.hitCd||0)-dt;if(p.hitCd<=0){p.hitCd=1.1;hurtPlayer(7);}}
    }
    if(!alive&&capangas.every(p=>p.gaveUp||p.state==='dead'||p.state==='gone'||p.state==='dead2')){capangas=[];}
    return;
  }
  if(s.capWeek>=0&&s.capWeek===s.lateWeek&&!s.capDone&&weekday()===6&&!S.interior&&player.state==='play'){
    const c=casaDoor();if(hyp(player.x-c.x,player.y-c.y)>1800)return;
    s.capDone=true;capT=120;
    for(let k=0;k<2;k++){const a=rand(0,Math.PI*2);const p=new Ped(player.x+Math.cos(a)*260,player.y+Math.sin(a)*260);
      p.state='capanga';p.capanga=true;p.story='capanga';p.shirt='#3b3b3b';p.hair='#111';p.skin=pick(['#c68642','#8d5524','#e0ac69']);p.spd=0;S.peds.push(p);capangas.push(p);}
    talk([['capanga','O Cabralzinho mandou lembrar da parcela.'],['capanga','Quem atrasa paga em dinheiro. Ou em dente.']]);
  }
}

// ---------- a sexta-feira ----------
function updateDebt(){
  const s=st();const wd=weekday(),w=week();
  // lembretes no bip: quinta e sexta de manhã
  if((wd===4||wd===5)&&S.tod>=7&&s.paidWeek<w&&!s.remind[S.day]){s.remind[S.day]=1;
    msg('BIP: '+(wd===4?'Amanhã':'Hoje até as 20h')+': parcela do Cabralzinho ('+fmtMoney(s.due)+'), no câmbio do Centro.',6);
    sfxTone(1320,0.07,0.05,'square');sfxTone(1320,0.07,0.05,'square',0.12);}
  // prazo vencido de cada semana (uma vez por semana)
  const passed=wd===6||(wd===5&&S.tod>=20);
  const upTo=passed?w:w-1;
  while(s.checkedWeek<upTo){
    s.checkedWeek++;const k=s.checkedWeek;
    if(s.debt<=0)continue;
    if(s.paidWeek>=k){continue;}
    // atrasou: a parcela sobe 20% e os capangas aparecem no sábado
    const missed=s.due,juro=Math.round(missed*0.2);
    s.late++;s.debt+=juro;s.due=Math.min(s.debt,missed+juro+500);s.lateWeek=k;s.capWeek=k;s.capDone=false;
    big('PARCELA ATRASADA','O Cabralzinho cobra '+fmtMoney(missed+juro)+' agora, fora a da semana que vem','#ff5050',4);
    sfxTone(200,0.25,0.1,'triangle');
  }
}
export function payDue(){
  const s=st();const v=Math.min(s.due,s.debt);
  if(player.money<v){msg('Faltam '+fmtMoney(v-player.money)+'.',2.5);return false;}
  player.money-=v;s.debt-=v;s.paidWeek=week();s.due=Math.min(500,Math.max(0,s.debt));
  sfxTone(1500,0.04,0.04,'square');
  if(s.debt<=0){s.debt=0;big('DÍVIDA QUITADA','O carnê do Cabralzinho acabou','#7dff6b',4);did('Quitei a dívida do Cabralzinho.');vinc('mae',1);}
  else msg('Parcela paga. Faltam '+fmtMoney(s.debt)+' no carnê.',4);
  return true;
}

// ---------- conversas de cada personagem ----------
function clueGot(k){
  const s=st();sfxTone(880,0.08,0.06,'square');sfxTone(1175,0.12,0.06,'square',0.08);
  const c=CLUES.find(c=>c.k===k);
  big('PISTA '+clueCount()+'/4',(c?c.title:'')+' (anotada na caderneta)','#7fd8ff',2.8);
  if(nenemReady()&&!s.nenemHint){s.nenemHint=1;setTimeout(()=>msg('BIP do Neném: "Sobe na boca que eu quero falar contigo."',5),2500);}
  checkPeixoto();
}
function checkPeixoto(){const s=st();if(s.step==='pistas'&&cluesDone()&&s.nenem){s.step='peixoto';big('O CABO PEIXOTO','Ele bebe no Bar do Galo, no Jacarandá, de noite','#90a4ae',3.2);}}

function talkCabral(){
  const s=st();
  if(s.step==='cambio'){meet('cabral');s.step='bar';
    talk([['cabral','Ah, o filho do Oswaldo. Teu pai sempre foi pontual, sabia?'],
      ['cabral','Sexta, até as oito da noite. Quinhentos. Toda semana.'],
      ['cabral','Atrasou, a parcela engorda. E eu mando os meninos lembrar.']],{onEnd:()=>{
        note('O carnê: $5.000, $500 toda sexta até as 20h no câmbio do Centro.');
        msg('O Neném costuma ficar no Bar do Galo, no Jacarandá, de noite.',5);}});
    return;
  }
  if(s.debt<=0){talk([['cabral','Carnê quitado. Foi um prazer, como diz o outro.']]);return;}
  if(s.paidWeek>=week()){talk([['cabral','Essa semana tá paga. Te vejo na outra sexta.'],['nota','Carnê: faltam '+fmtMoney(s.debt)+'.']]);return;}
  const v=Math.min(s.due,s.debt),ch=[{label:'Pagar '+fmtMoney(v),run:()=>{if(payDue())talk([['cabral','Pontual igual ao pai. Assim que eu gosto.']]);else talk([['cabral','Tá me tirando? Volta quando tiver o dinheiro todo.']]);}}];
  if(player.money<v&&!s.envelope)ch.push({label:'Tô sem. Tem outro jeito?',run:()=>{
    s.envelope=1;s.favor++;
    talk([['cabral','Tem sempre. Leva esse envelope lacrado pro homem de terno, no Centro.'],['cabral','Não abre e não atrasa. Aí essa semana fica por minha conta.']],{onEnd:()=>msg('Entrega o envelope pro homem de terno (seta amarela).',5)});}});
  ch.push({label:'Ainda não',run:()=>{talk([['cabral',WEEKDAYS_LONG[weekday()]==='sexta'?'Até as oito, hein. Não me faz ir atrás.':'Sexta, até as oito. Não esquece.']]);}});
  talk([['cabral','E aí, filho do Oswaldo. Veio acertar?'],['nota','Esta semana: '+fmtMoney(v)+'  ·  carnê: '+fmtMoney(s.debt)+'  ·  prazo: sexta 20h']],{choices:ch});
}
function talkTerno(){
  const s=st();s.envelope=null;s.paidWeek=week();s.debt=Math.max(0,s.debt-Math.min(s.due,s.debt));s.due=Math.min(500,s.debt);
  note('O homem do envelope tinha um crachá da BarraSul Incorporações. O Cabralzinho trabalha pra eles?');
  did('Fiz o favor do envelope pro Cabralzinho.');
  talk([['terno','É do Cabral? Ótimo.'],['nota','(No bolso do paletó, um crachá: BarraSul Incorporações.)'],['terno','Diz pra ele que o pessoal da orla agradece.']],
    {onEnd:()=>{big('SEMANA PAGA','E uma pista: o agiota trabalha pra BarraSul?','#ffb300',3.4);}});
}
function talkNenemBar(){
  const s=st();meet('nenem');s.step='orelhao';
  talk([['nenem','Olha ele! Voltou e nem passa pra dar um oi?'],['nenem','Senta aí. A cerveja é por minha conta.'],
    ['nenem','Fiquei sabendo do teu pai. Sacanagem o que fizeram.'],['nenem','A operação tá apertando todo mundo. Se precisar, é só subir.']],
    {onEnd:()=>msg('Amanhã de manhã liga alguém pra tu. Fica de olho nos orelhões.',5)});
  s.phoneDay=S.day+(S.tod>=19?1:0);
}
function talkZeca(){
  const s=st();
  if(s.step==='zeca'){meet('zeca');s.step='pistas';s.tools.scanner=1;s.tools.gravador=1;
    talk([['zeca','Chegou inteiro? Isso aqui virou praça de guerra.'],['zeca','Toma. Um scanner. Pega a frequência da polícia.'],
      ['zeca','Liga com R. Fica de ouvido, que PM fala demais no rádio.'],['zeca','E leva esse gravador K7 velho. A moça do jornal vai querer gravação.'],
      ['zeca','Mais uma: no camelódromo do Centro tem gente que viu a prisão do teu pai. Usa a caderneta (C) nas pessoas de lá.']],
      {onEnd:()=>{big('CAPÍTULO 1','Quatro pistas pra achar quem plantou o flagrante','#7fd8ff',3.4);msg('Ganhou o SCANNER (R liga) e o GRAVADOR K7.',5);}});
    return;
  }
  const ch=[];
  if(s.mochila==='casa')ch.push({label:'Guardar a mochila do Neném aqui',run:()=>{s.mochila='zeca';vinc('zeca',-1);did('Guardei a mochila do Neném na casa do Zeca.');
    talk([['zeca','Isso aqui não é guarda-volume de boca, rapaz.'],['zeca','Deixa aí no canto. Uma semana e olhe lá.']]);}});
  ch.push({label:'Só passei pra ver o senhor',run:()=>{talk([['zeca','O rádio diz que a operação vai apertar mais. Cuidado na rua.']]);}});
  talk([['zeca','Fala, garoto. Achou o que procurava?'],['nota','Pistas: '+clueCount()+'/4']],{choices:ch});
}
function talkNenem(){
  const s=st();
  if(s.step==='turma'){vinc('nenem',2);vinc('zeca',-2);did('Entreguei o Cabo Peixoto pro Neném.');s.fita='turma';
    talk([['nenem','O Peixoto? Aquele que pegava dos dois lados?'],['nenem','Deixa comigo. Tu não vai mais ouvir falar dele.'],
      ['nenem','E a blitz do morro, amanhã ninguém sabe explicar como, mas cai.']],{onEnd:()=>endChapter1('turma')});return;}
  if(!nenemReady())return;
  talk([['nenem','Tô sabendo que tu tá fuçando o batalhão. Tu é corajoso ou é doido?'],['nenem','Eu sei quem é o PM. Sei até onde ele bebe.'],
    ['nenem','Faço melhor: te dou o nome e pago a sexta do Cabralzinho.'],['nenem','Só preciso que tu guarde uma mochila em casa. Uma semana. Sem abrir.']],
    {choices:[
      {label:'Fechado. Passa a mochila.',run:()=>{s.nenem='aceita';vinc('nenem',1);skipClues(2);s.mochila='casa';s.mochilaDay=S.day;
        if(s.paidWeek<week()){s.debt=Math.max(0,s.debt-Math.min(s.due,s.debt));s.due=Math.min(500,s.debt);s.paidWeek=week();}
        did('Aceitei guardar a mochila do Neném. Ele pagou a sexta.');note('Neném: o PM é o Cabo Peixoto.');
        talk([['nenem','Esse é dos meus. O nome é Peixoto. Cabo Peixoto.'],['nenem','A sexta tá paga. A mochila fica no teu quarto, quietinha.']],{onEnd:()=>{msg('A mochila está no teu quarto. Dá pra guardar na casa do Zeca.',5);checkPeixoto();}});}},
      {label:'Não, Neném. Isso eu não faço.',run:()=>{s.nenem='recusa';vinc('nenem',-1);did('Recusei a mochila do Neném.');
        talk([['nenem','Tu mudou, hein? Vai lá, então. Sozinho.']],{onEnd:checkPeixoto});}},
      {label:'Me diz só quem é o PM e fica por isso.',run:()=>{s.nenem='info';vinc('nenem',1);skipClues(1);did('Pedi ao Neném só o nome do PM, sem favor.');note('Neném: é o "Bigode do batalhão". Bebe no Bar do Galo.');
        talk([['nenem','Gostei. Não pede esmola.'],['nenem','É o Bigode do batalhão. Bebe no Bar do Galo, no Jacarandá.']],{onEnd:checkPeixoto});}},
    ]});
}
// pula as pistas que faltam, das mais difíceis pras mais fáceis
function skipClues(n){const s=st();for(const k of ['batalhao','ordem','viatura','testemunha']){if(n<=0)break;if(!s.clues[k]&&!s.skipped[k]){s.skipped[k]=1;n--;}}}
function talkPeixoto(){
  const s=st();meet('peixoto');
  talk([['nota','(Você aperta o REC do gravador no bolso.)'],['peixoto','Tu é o filho do quiosqueiro? Tô de folga, rapaz. Some daqui.'],
    ['eu','A viatura 2-14. O freezer do quiosque. A ordem do Lobo. Tá tudo anotado.'],
    ['peixoto','...Eu cumpri ordem. O inspetor queria a orla limpa e eu queria a promoção.'],
    ['peixoto','Todo mundo no batalhão pega do Neném. Eu só fui o burro que pegou dos dois.'],
    ['peixoto','Tu gravou isso? Pelo amor da minha filha, rapaz...']],
    {choices:[
      {label:'Levar a fita pra Mariana',run:()=>{s.step='materia';s.fita='mariana';did('Decidi levar a fita do Peixoto pro jornal.');
        msg('A Mariana fica no Bar Lisboa, no Centro (8h às 23h).',5);}},
      {label:'Guardar a fita e ter o Peixoto na mão',run:()=>{s.fita='mao';vinc('peixoto',1);vinc('mariana',-1);did('Guardei a fita. O Peixoto agora me deve.');
        talk([['peixoto','Tá bom. Tá bom. O que tu precisar, eu aviso.'],['peixoto','Amanhã o batalhão "muda de turno". A blitz do morro sai.']],{onEnd:()=>endChapter1('mao')});}},
      {label:'Entregar o Peixoto pro Neném',run:()=>{s.step='turma';did('Resolvi contar pro Neném quem pegava dos dois lados.');msg('O Neném está na boca, no Cajueiro.',5);}},
    ]});
}
function talkMariana(){
  const s=st();s.materia++;vinc('mariana',2);vinc('peixoto',-2);vinc('nenem',-1);
  const sat=S.day+((6-weekday()+7)%7||7);s.jornalDay=sat;
  talk([['mariana','Deixa eu ouvir...'],['nota','(Ela rebobina a fita duas vezes.)'],['mariana','Confissão, a viatura, a ordem do Lobo. Isso é ouro. E tá limpo.'],
    ['mariana','Sai no sábado. Sem o nome dele na manchete, que eu não sou monstro.']],{onEnd:()=>endChapter1('mariana')});
}
function endChapter1(how){
  const s=st();s.ch=2;s.step='fim';unlockZone('cajueiro');
  if(how==='mariana')note('1ª matéria: "Policial admite flagrante plantado na orla". Teu pai vai ganhar um defensor público.');
  big('FIM DO CAPÍTULO 1','A blitz do Morro do Cajueiro caiu','#7dff6b',4);sfxWin();
  setTimeout(()=>talk([['farol','Plantão da Rádio Farol: o quiosqueiro preso na Operação Maré Alta vai ser transferido pra DP da Barra Sul.'],
    ['farol','"Por segurança", diz a delegacia.'],['nota','CONTINUA NO CAPÍTULO 2. Até lá: trabalha, paga o Cabralzinho toda sexta e cuida da família.']]),4500);
}

// a mãe (ou o Juninho) acha a mochila: cena com três saídas
function discovery(who){
  const s=st();const dobro=s.lied?2:1;
  const lines=who==='mae'?[['mae','Que mochila é essa debaixo da tua cama?'],['mae','Pesada desse jeito. Não mente pra mim, filho.']]
    :[['juninho','Eu vi tu subindo o morro com a mochila do Neném.'],['juninho','Tu tá trabalhando pra ele? Eu não conto pra mãe... dessa vez.']];
  talk(lines,{choices:[
    {label:'Mentir ("é coisa de um amigo")',run:()=>{if(Math.random()<0.6){s.lied=true;did('Menti sobre a mochila. Colou.');talk([[who,who==='mae'?'Hum. Sei. Tira isso daqui até domingo.':'Tá. Se tu diz...']]);}
      else{vinc(who,-dobro);s.mochila='achada';did('Menti sobre a mochila e não colou.');talk([[who,who==='mae'?'Eu te pari, menino. Sei quando tu mente.':'Mentiroso. Igual a eles.']]);}}},
    {label:'Contar a verdade',run:()=>{vinc(who,-dobro);s.mochila='achada';did('Contei a verdade sobre a mochila.');talk([[who,who==='mae'?'Teu pai preso e tu guardando coisa da boca. Devolve isso hoje.':'Então é verdade... Ele paga bem, né?']]);}},
    {label:'Prometer sair dessa',run:()=>{vinc(who,-dobro);s.mochila='achada';s.promessa=true;did('Prometi pra '+(who==='mae'?'minha mãe':'o Juninho')+' que saio dessa.');
      talk([[who,who==='mae'?'Promessa é promessa. Eu vou cobrar.':'Promete mesmo? Tá anotado.']]);}},
  ]});
}

// ---------- entrou/saiu de lugares ----------
export function storyInterior(it){
  if(!storyOn())return;const s=st();
  if(it.kind==='casa'){
    it.points.push({x:12.5*48,y:4.5*48,station:'feijao',label:s.feijaoDay===S.day?'Panela vazia (amanhã tem mais)':'Comer o feijão da mãe'});
    if(s.step!=='casa'&&s.maquina<1)it.points.push({x:2.5*48,y:8.5*48,station:'maquina',label:'Consertar a máquina de costura da mãe'});
    it.npcs.push(mkInNpc(it,13.5,2.5,'#c2185b','#3b2314','#c68642',true,Math.PI/2));
    it.npcs.push(mkInNpc(it,4.5,7.5,'#1e88e5','#111','#c68642',false,0));
    if(s.step==='casa'){s.step='carceragem';s.tools.caderneta=1;meet('mae');meet('juninho');player.health=100;
      talk([['cida','Ô Tereza! Teu filho chegou! Tá magrinho, hein!'],['mae','Graças a Deus. Entra, que o feijão tá no fogo.'],
        ['mae','Teu pai pegou dinheiro com o Cabralzinho pra pagar advogado. O advogado sumiu. O carnê ficou.'],
        ['mae','Cinco mil. Quinhentos toda sexta, na casa de câmbio do Centro.'],
        ['mae','Toma. A caderneta do teu pai. Ele anotava tudo nela.'],
        ['nota','Ganhou a CADERNETA. C perto de alguém mostra quem é. Longe de todo mundo, abre as páginas.'],
        ['juninho','Tu vai resolver, né?'],['eu','Vou. Amanhã eu vejo o pai na Carceragem Central.']],
        {onEnd:()=>{note('O pai foi preso com um flagrante plantado no freezer do quiosque.');msg('Dormir na cama passa a noite. A Carceragem Central fica no Centro.',5);}});
      return;}
    const wd=weekday();
    if(s.mochila==='casa'&&(wd===3||wd===6)&&s.mochilaSeen!==S.day){s.mochilaSeen=S.day;discovery('mae');return;}
    if(s.mochila==='zeca'&&!s.juninhoSaw){s.juninhoSaw=1;discovery('juninho');return;}
    if(s.mochila==='casa'&&S.day>=s.mochilaDay+7){s.mochila=null;talk([['nota','A mochila sumiu do quarto. O Neném mandou buscar.']]);}
  }
  if(it.kind==='policia'){
    if(s.step==='carceragem'||s.met.pai)it.npcs.push(mkInNpc(it,4.5,2.6,'#f4f4f0','#777','#a0662f',false,Math.PI/2));
    if(s.step==='carceragem'){
      if(S.tod<8||S.tod>=18){talk([['nota','Visita só de dia, das 8h às 18h. Dá pra dormir em casa e voltar de manhã.']]);return;}
      s.step='mariana';meet('pai');
      talk([['pai','Olha quem voltou. Senta aí, que o guarda dá dez minutos.'],
        ['pai','Um PM pediu pra olhar o freezer do quiosque. Quando fechou a tampa, tinha um pacote lá dentro.'],
        ['pai','Era um cabo novo, bigodinho, do batalhão do morro.'],['pai','Procura o Zeca do rádio, lá no alto do Cajueiro. Ele escuta tudo.'],
        ['pai','E não te mete com o filho da Dona Lurdes. Tu sabe de quem eu tô falando.'],['eu','O Neném. Pode deixar, pai.']],
        {onEnd:()=>note('O pai: "um cabo novo, bigodinho, do batalhão do morro".')});
    }
    if(s.step==='pistas'&&!s.clues.ordem&&!s.skipped.ordem){
      it.points.push({x:18.5*48,y:5.5*48,station:'arquivo',label:'Mexer no arquivo'});
      if(!(S.tod>=22||S.tod<5))msg('De dia tem plantonista demais. O arquivo fica pra madrugada (22h às 5h).',4);
    }
  }
}
function mkInNpc(it,tx,ty,shirt,hair,skin,fem,a){return {id:9000+Math.floor(tx*31+ty*7),x:tx*48,y:ty*48,a:a||0,tx:tx*48,ty:ty*48,wait:0,shirt,skin,hair,anim:0,still:true,fem};}
// ponto especial dentro de um interior (true se a história cuidou)
export function storyStation(p){
  const s=st();
  if(p.station==='feijao'){
    if(s.feijaoDay===S.day){msg('A panela tá vazia. Amanhã a mãe faz mais.',2.5);return true;}
    s.feijaoDay=S.day;eat(70);player.health=Math.min(100,player.health+25);p.label='Panela vazia (amanhã tem mais)';
    sfxTone(660,0.06,0.05,'square');msg('Feijão com arroz e farofa. Barriga cheia.',3);return true;}
  if(p.station==='maquina'){
    if(s.maquina>=1){msg('A máquina tá costurando de novo.',2);return true;}
    talk([['mae','Essa máquina travou de novo. É dela que sai a costura pra fora que paga a luz.'],['eu','Deixa comigo, mãe.']],
      {onEnd:()=>startConserto(m=>{
        if(m.ok){s.maquina=1;vinc('mae',1);did('Consertei a máquina de costura da mãe.');const it=S.interior;if(it)it.points=it.points.filter(q=>q!==p);
          player.money+=30;talk([['mae','Tá rodando! Toma, trinta da costura de hoje. Teu pai ia ter orgulho.']]);}
        else talk([['mae','Deixa, meu filho. Depois tu tenta de novo.']]);
      })});
    return true;}
  if(p.station!=='arquivo')return false;
  if(!(S.tod>=22||S.tod<5)){msg('O plantonista tá bem ali. Volta de madrugada (22h às 5h).',3);return true;}
  s.clues.ordem=1;note('No arquivo: "Apreensão no quiosque autorizada pelo Inspetor Lobo". Nenhuma testemunha.');
  const it=S.interior;if(it)it.points=it.points.filter(q=>q!==p);
  talk([['nota','(O plantonista cochila. Você puxa a pasta da Praia do Recanto.)'],['eu','"Apreensão no quiosque autorizada pelo Inspetor Lobo."'],['eu','Nenhuma testemunha. Nenhum laudo. Só a assinatura dele.']],{onEnd:()=>clueGot('ordem')});
  return true;
}
export function storyExit(it){
  if(!storyOn())return;const s=st();
  if(it.kind==='policia'&&s.step==='mariana'){
    s.step='bico';s.earn=0;meet('mariana');
    talk([['mariana','Tu é filho do Seu Oswaldo? Mariana, do Jornal da Guanabara.'],['mariana','Eu cubro polícia. Essa história do quiosque tá esquisita.'],
      ['mariana','Mas eu preciso de prova. Papel, foto, gravação.'],['mariana','A palavra do teu pai sozinha não sai do rodapé. Toma meu cartão.']],
      {onEnd:()=>msg('Primeira parcela na sexta. Faz um bico: J mostra os empregos, e orelhão tocando é serviço.',6)});
  }
}

// ---------- orelhão da história ----------
export const storyWantsPhone=()=>storyOn()&&st().step==='orelhao'&&S.day>=(st().phoneDay||0)&&S.tod>=7;
export function storyPhoneCall(){
  const s=st();s.ch=1;s.step='zeca';S.phoneCd=30;
  talk([['nota','(O orelhão toca. Você atende.)'],['zeca','Alô? É o filho do Oswaldo? Aqui é o Zeca, do rádio.'],
    ['zeca','Teu pai mandou recado. Eu tenho uma coisa pra te mostrar.'],['zeca','Sobe a pé pelo Jacarandá, que de carro a blitz não deixa. E vem sozinho.']],
    {onEnd:()=>{big('CAPÍTULO 1','Quem plantou o flagrante?','#7fd8ff',3.4);msg('A pé, a grade do morro deixa passar. A polícia não te persegue lá dentro a pé.',6);}});
}

// ---------- F perto de alguém da história ----------
export function storyNear(r){
  if(!storyOn()||player.car)return null;let best=null,bd=r||46;
  for(const p of S.peds){if(!p.story||p.state!=='story')continue;const d=hyp(p.x-player.x,p.y-player.y);if(d<bd){bd=d;best=p;}}
  if(witness&&witness.identified&&witness.state==='story'){const d=hyp(witness.x-player.x,witness.y-player.y);if(d<(r||46)&&d<=bd)best=witness;}
  return best;
}
const barracaOpen=()=>S.tod>=8&&S.tod<18;
function nearBarraca(){const c=spot('camelodromo');return c&&hyp(c.x-player.x,c.y-player.y)<70;}
export function storyInteract(){
  const p=storyNear();
  if(!p){
    // F com a ficha aberta numa pessoa que tem segredo: talvez ela tenha um bico
    const F=S.ficha;if(F&&F.f.secret&&!F.p.story&&!F.p.cop&&F.p.state!=='dead'&&hyp(F.p.x-player.x,F.p.y-player.y)<90){S.ficha=null;offerBico(F.p,F.f,spot,talk);return true;}
    if(nearBarraca()){startBarraca();return true;}
    return false;}
  if(p===witness){talkWitness();return true;}
  ({cabral:talkCabral,nenem:p.story==='nenem'&&live.nenem_bar===p?talkNenemBar:talkNenem,zeca:talkZeca,peixoto:talkPeixoto,mariana:talkMariana,terno:talkTerno}[p.story]||(()=>{}))();
  return true;
}
function talkWitness(){
  const s=st();s.clues.testemunha=1;meet('bira');
  note('Seu Bira, camelô: o de bigodinho entrou no quiosque com uma sacola e saiu sem. Viatura do batalhão do morro, final 14.');
  talk([['bira','Tu é filho do Oswaldo? Eu vi tudo, mas não conta que fui eu.'],['bira','Dois PMs. O de bigodinho entrou no quiosque com uma sacola e saiu sem.'],
    ['bira','O outro ficou no carro. Viatura do batalhão do morro, final 14.']],{onEnd:()=>clueGot('testemunha')});
}
export const isWitness=p=>p===witness;
export function identifyWitness(){if(witness){witness.identified=true;witness.story='bira';}}

// ---------- scanner de rádio (R) ----------
const CHATTER=['Viatura 3-07, QSL. Prossiga pra Via Expressa.','Central, blitz da Operação Maré Alta montada na Rua da Feira.','QTH do táxi roubado: Centro, perto do camelódromo.',
  'Atenção viaturas: elemento suspeito de moto, capacete vermelho.','Dois-nove, QAP? ...positivo, retornando ao batalhão.','Ocorrência de som alto no Jacarandá. Ninguém disponível.'];
export function toggleScanner(){
  if(!hasTool('scanner'))return false;const s=st();s.scanner=!s.scanner;
  msg('Scanner '+(s.scanner?'ligado: chiado da frequência da polícia':'desligado')+'  (R)',2.5);sfxTone(s.scanner?1200:400,0.08,0.05,'square');return true;
}
function updateScanner(dt){
  const s=st();if(!s.scanner||S.interior)return;
  s.radioT-=dt;
  if(s.step==='pistas'&&!s.clues.viatura&&!s.skipped.viatura){s.scanT+=dt;
    if(s.scanT>25){s.clues.viatura=1;s.radioT=20;note('Scanner: "dois-catorze... o cabo Peix... ocorrência do quiosque fica sem registro. Ordem do inspetor."');
      talk([['radio','...dois-catorze, QAP? ...o cabo Peix... (chiado)'],['radio','...ocorrência do quiosque fica sem registro. Ordem do inspetor.'],['eu','Viatura 2-14. O cabo é "Peix" alguma coisa.']],{onEnd:()=>clueGot('viatura')});return;}}
  if(s.radioT<=0){s.radioT=rand(14,24);msg('📻 '+pick(CHATTER),4);sfxTone(300,0.05,0.03,'sawtooth');}
}

// ---------- caderneta: ficha de qualquer pedestre ----------
const NOMES=['Adilson','Rosângela','Marquinho','Célia','Josué','Vanderléia','Wellington','Neide','Robson','Sueli','Edvaldo','Cristiane','Jorginho','Fátima','Sérgio','Luciana','Biluca','Raimundo','Elaine','Paulão','Marlene','Tião','Simone','Washington','Graça','Reinaldo','Patrícia','Zé Carlos','Kátia','Anderson'];
const SOBRE=['da Silva','Souza','dos Santos','Ferreira','Oliveira','Pereira','Costa','Carvalho','Ribeiro','Almeida','Nascimento','Barbosa'];
const OFICIOS=['camelô','cobrador de ônibus','manicure','pedreiro','aposentado','estudante','porteiro','motorista de van','vendedor de mate','doméstica','office-boy','mecânico','bicheiro','garçom','caixa de supermercado','desempregado','costureira','frentista','vigia','feirante'];
const SEGREDOS=['deve ao Cabralzinho','vende peça roubada','olheiro da Turma','paga "segurança" pra Firma','dedura pro batalhão','joga no bicho todo dia','tem um irmão na Carceragem','sabe onde a blitz monta amanhã'];
const hashN=(n,k)=>{let x=(n*2654435761+k*97)>>>0;x^=x>>>13;x=Math.imul(x,0x5bd1e995)>>>0;x^=x>>>15;return x;};
export function fichaOf(p){
  if(p.story&&CHARS[p.story]&&p.story!=='capanga'){const c=CHARS[p.story];return{name:c.name,job:c.role||'',secret:null,col:c.col,fixed:true};}
  if(p.capanga)return{name:'Capanga',job:'cobrador do Cabralzinho',secret:null,col:'#ef5350'};
  if(p.cop)return{name:'Soldado '+SOBRE[hashN(p.id,1)%SOBRE.length],job:'PM da Operação Maré Alta',secret:null};
  const id=p.id||1;
  const fem=p.fem!==undefined?p.fem:null;
  const name=NOMES[hashN(id,2)%NOMES.length]+' '+SOBRE[hashN(id,3)%SOBRE.length];
  const job=OFICIOS[hashN(id,4)%OFICIOS.length];
  let secret=hashN(id,5)%10===0?SEGREDOS[hashN(id,6)%SEGREDOS.length]:null;
  if(p===witness)return{name:'Seu Bira',job:'camelô do camelódromo',secret:'viu a prisão do teu pai',col:'#ffcc80'};
  return{name,job,secret,fem};
}
export function fichaNear(){
  let best=null,bd=90;
  for(const p of S.peds){if(p.state==='dead'||p.state==='dead2'||p.state==='gone'||p.state==='down')continue;const d=hyp(p.x-player.x,p.y-player.y);if(d<bd){bd=d;best=p;}}
  return best;
}

// ---------- o que o bip mostra (objetivo da história) ----------
const hh=h=>String(h).padStart(2,'0')+'h';
export function storyObjective(){
  if(!storyOn())return null;const s=st();
  const O=(title,text,target)=>({title,text,target});
  if(s.bico)return O('BICO DE '+s.bico.by.toUpperCase(),s.bico.text+' ('+fmtMoney(s.bico.reward)+')',{x:s.bico.x,y:s.bico.y});
  switch(s.step){
    case 'casa':return O('PRÓLOGO','Vai pra casa. Tua mãe tá esperando.',casaDoor());
    case 'carceragem':{const b=carceragem();return O('PRÓLOGO','Visita teu pai na Carceragem Central, no Centro (8h às 18h).',b?doorOf(b):null);}
    case 'mariana':return O('PRÓLOGO','Sai da Carceragem.',null);
    case 'bico':return O('PRÓLOGO','Faz um bico pra juntar dinheiro: J mostra os empregos, orelhão tocando é serviço. '+fmtMoney(s.earn)+' de $ 150',null);
    case 'cambio':return O('PRÓLOGO','Conhece o Cabralzinho, na casa de câmbio do Centro (8h às 20h).',spot('cambio'));
    case 'bar':return O('PRÓLOGO',nightish()?'O Neném tá no Bar do Galo, no Jacarandá.':'De noite (depois das 19h), o Neném fica no Bar do Galo, no Jacarandá.',spot('galo'));
    case 'orelhao':return O('PRÓLOGO',storyWantsPhone()?'Um orelhão tá tocando pra tu. Atende.':'Amanhã de manhã alguém vai te ligar num orelhão.',storyWantsPhone()?nearestPhone():null);
    case 'zeca':return O('CAPÍTULO 1','Sobe a pé até a casa do Zeca, no alto do Morro do Cajueiro.',spot('zeca'));
    case 'pistas':{
      if(nenemReady())return O('CAPÍTULO 1','O Neném quer falar contigo, na boca do Cajueiro.  (Pistas '+clueCount()+'/4)',spot('boca'));
      if(tail)return O('CAPÍTULO 1','Segue a 2-14 de longe: '+Math.floor(tail.t)+'/40 s'+(tail.close>0.3?'  ·  TÁ PERTO DEMAIS!':''),tail.car);
      const nx=CLUES.find(c=>!s.clues[c.k]&&!s.skipped[c.k]&&(c.k!=='batalhao'||s.clues.viatura));
      const tg=!nx?null:nx.k==='testemunha'?spot('camelodromo'):nx.k==='ordem'?(carceragem()?doorOf(carceragem()):null):nx.k==='viatura'?null:null;
      const tx=nx?nx.how:'Fala com o Neném.';
      return O('CAPÍTULO 1','Pistas '+clueCount()+'/4 · '+tx,tg);}
    case 'peixoto':return O('CAPÍTULO 1',S.tod>=18?'O Cabo Peixoto tá bebendo no Bar do Galo, no Jacarandá.':'De noite (depois das 18h), pega o Peixoto de folga no Bar do Galo.',spot('galo'));
    case 'materia':return O('CAPÍTULO 1','Leva a fita pra Mariana, no Bar Lisboa, no Centro (8h às 23h).',spot('lisboa'));
    case 'turma':return O('CAPÍTULO 1','Conta pro Neném, na boca do Cajueiro.',spot('boca'));
    case 'fim':return O('FIM DO CAP. 1','Capítulo 2 em breve. Trabalha, paga o Cabralzinho toda sexta e cuida da família.',null);
  }
  return null;
}
export function storyTarget(){
  if(!storyOn())return null;const s=st();
  if(s.envelope)return spot('envelope');
  if(s.bico)return {x:s.bico.x,y:s.bico.y};
  if(capangas.length)return null;
  const o=storyObjective();return o?o.target:null;
}
function nearestPhone(){let b=null,bd=1e9;for(const p of phones){if(!isOpenAt(p.x,p.y))continue;const d=hyp(p.x-player.x,p.y-player.y);if(d<bd){bd=d;b=p;}}return b;}
export function debtLine(){
  if(!storyOn())return null;const s=st();if(s.debt<=0)return null;
  const paid=s.paidWeek>=week();return paid?'SEX: paga ✔':'SEX 20h: '+fmtMoney(Math.min(s.due,s.debt));
}
// rótulo flutuante dos personagens e lugares
export function storyLabels(){
  if(!storyOn())return [];const out=[];
  for(const p of S.peds){if(p.state!=='story'||!p.story)continue;const c=CHARS[p.story];if(c&&c.name)out.push({x:p.x,y:p.y,t:c.name,col:c.col,p});}
  const b=spot('camelodromo');if(b)out.push({x:b.x,y:b.y,t:barracaOpen()?(st().barracaDay===S.day?'Barraca (volta amanhã)':'Barraca: F trabalha'):'Barraca (8h às 18h)',col:'#ffd21f'});
  return out;
}

// ---------- começo e migração ----------
export function startStory(){
  S.story=newStory();S.day=0;S.tod=16.5;S.lastTod=S.tod;
  const p=spot('inicio');player.x=p.x;player.y=p.y;cam.x=p.x;cam.y=p.y;
  {const d=casaDoor();player.a=player.moveA=S.camYaw=Math.atan2(d.y-p.y,d.x-p.x);} // começa olhando pra casa
  const c=S.cars.find(c=>c.type==='jegue'&&!c.driver);if(c){c.x=p.x-170;c.y=p.y+30;c.a=0;c.vx=c.vy=0;}
}
// save antigo (sem história): acorda em casa no domingo da Semana 1, com o dinheiro e os níveis de emprego
export function migrateOldSave(){startStory();S.migratedStory=true;}

// ---------- loop ----------
let lastMoney=null;
export function updateStory(dt){
  if(!storyOn())return;const s=st();
  syncDay();
  if(lastMoney!==null&&s.step==='bico'&&player.money>lastMoney){s.earn+=player.money-lastMoney;
    if(s.earn>=150){s.step='cambio';big('PRIMEIRO BICO','Agora vai conhecer o Cabralzinho, no Centro','#7dff6b',3);}}
  lastMoney=player.money;
  if(S.migratedStory&&player.state==='play'){S.migratedStory=false;big('MARESIA 97: A HISTÓRIA','Teu save antigo começa na Semana 1, com o teu dinheiro','#ffb36b',5);}
  if(s.jornalDay>=0&&!s.jornalShown&&S.day>=s.jornalDay&&S.tod>=6){s.jornalShown=true;
    big('JORNAL DA GUANABARA','"Policial admite flagrante plantado na orla"','#ffe9a0',5);vinc('pai',1);}
  initNeeds(s);
  updateDebt();
  if(S.interior)return;
  updateBico();
  for(const id in NPCS)placeNpc(id,NPCS[id]);
  placeCamelodromo();
  updateTail(dt);
  updateCapangas(dt);
  updateScanner(dt);
  // a pé no morro durante o capítulo 1: aviso uma vez
  if(s.step==='zeca'&&!s.morroHint&&!player.car&&zoneAt(player.x/T|0,player.y/T|0)==='cajueiro'){s.morroHint=1;msg('Dentro do Cajueiro a pé, a operação não te persegue. De carro, sim.',5);}
}
// a pé, o morro fica aberto durante o capítulo 1 (o caminho do capítulo)
export function footOpen(zone){const s=S.story;return !!s&&zone==='cajueiro'&&s.ch===1;}
