// Relógio do jogo e ciclo de dia e noite
import { S } from '../core/state.js';

export const DAY_SECONDS = 720; // um dia inteiro do jogo dura 12 minutos reais

export function advanceTime(dt){ S.tod = (S.tod + dt*24/DAY_SECONDS) % 24; }

function smooth(t){ t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); }

// 0 = dia claro, 1 = noite fechada
export function darkness(h=S.tod){
  if(h>=7 && h<17) return 0;
  if(h>=17 && h<19.5) return smooth((h-17)/2.5);
  if(h>=5 && h<7) return 1-smooth((h-5)/2);
  return 1;
}

// tom alaranjado perto do nascer (6h) e do pôr do sol (18h)
export function golden(h=S.tod){
  const a=Math.max(0,1-Math.abs(h-18)/1.3), b=Math.max(0,1-Math.abs(h-6)/1.1);
  return Math.max(a,b);
}

export function clockText(){
  const h=Math.floor(S.tod), m=Math.floor((S.tod-h)*60);
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

// dia do calendário do jogo: avança quando o relógio passa da meia-noite, seja andando, dormindo
// ou dentro de um interior (S.tod menor que no último passo). O dia 0 é um domingo.
export function syncDay(){
  if(typeof S.lastTod==='number'&&S.tod<S.lastTod)S.day=(S.day||0)+1;
  S.lastTod=S.tod;
  return S.day||0;
}
export const weekday=()=>((S.day||0)%7+7)%7; // 0 domingo ... 5 sexta, 6 sábado
const WD=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
export const weekdayShort=()=>WD[weekday()];
