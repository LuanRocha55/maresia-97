// Fome e sono (Semana 1, dificuldade Normal). De 100 (bem) a 0.
//  - fome cai de 100 a 0 em 1,5 dia do jogo (18 min reais); sono em 2 dias
//  - abaixo de 30: fome deixa a mira mais tremida e a corrida mais curta; sono escurece as bordas e o carro fica arisco
//  - em 0: a fome tira vida devagar (até sobrar 10); o sono derruba: desmaia e acorda em casa às 7h
// Comida enche fome (comprada nos comércios, ou o feijão da mãe, grátis uma vez por dia). Cama enche sono.
import { clamp } from '../core/utils.js';
import { DAY_SECONDS } from '../world/time.js';
import { special } from '../world/map.js';
import { doorOf } from './jobs.js';
import { msg, big } from './world.js';
import { hurtPlayer } from './effects.js';
import { sfxTone } from '../audio/audio.js';
import { S, player, cam } from '../core/state.js';

const FOME_DIAS=1.5, SONO_DIAS=2;
export const needsOn=()=>!!S.story;
const N=()=>S.story;
export function initNeeds(s){if(typeof s.fome!=='number')s.fome=85;if(typeof s.sono!=='number')s.sono=80;}

let warnF=false,warnS=false,starveT=0;
export function needsTick(dt){
  if(!needsOn())return;const s=N();initNeeds(s);
  if(player.state!=='play'||S.dialog||S.mini)return;
  s.fome=Math.max(0,s.fome-dt*100/(DAY_SECONDS*FOME_DIAS));
  s.sono=Math.max(0,s.sono-dt*100/(DAY_SECONDS*SONO_DIAS));
  if(s.fome<30&&!warnF){warnF=true;msg('Barriga roncando. Come alguma coisa (padaria, lanchonete, mercadinho, ou o feijão da mãe).',5);sfxTone(180,0.25,0.06,'triangle');}
  if(s.fome>40)warnF=false;
  if(s.sono<30&&!warnS){warnS=true;msg('Tu tá caindo de sono. A cama de casa passa a noite.',5);}
  if(s.sono>40)warnS=false;
  if(s.fome<=0&&!S.interior){starveT+=dt;if(starveT>3){starveT=0;if(player.health>10)hurtPlayer(1);}}
  if(s.sono<=0)faint();
}
// cansado demais: apaga e acorda em casa
function faint(){
  const s=N();s.sono=45;
  if(S.interior)return; // dentro de casa/loja: o interior cuida quando sair
  if(player.car){player.car.driver=null;player.car.vx*=0.2;player.car.vy*=0.2;player.car=null;}
  const d=doorOf(special.casa);player.x=d.x;player.y=d.y;cam.x=d.x;cam.y=d.y;
  S.tod=7;player.money=Math.max(0,player.money-50);
  big('DESMAIOU DE SONO','Acordou na porta de casa às 7h (e alguém levou $50 do teu bolso)','#7fd8ff',4);
}
// efeitos que outros módulos consultam
export const hungry=()=>needsOn()&&N().fome<30;
export const sleepy=()=>needsOn()&&N().sono<30;
export const sleepFrac=()=>needsOn()?clamp((30-N().sono)/30,0,1):0;
export function eat(v){if(!needsOn())return;const s=N();initNeeds(s);s.fome=Math.min(100,s.fome+v);}
export function rest(v){if(!needsOn())return;const s=N();initNeeds(s);s.sono=Math.min(100,s.sono+v);}
export const fomeFull=()=>!needsOn()||N().fome>=98;
