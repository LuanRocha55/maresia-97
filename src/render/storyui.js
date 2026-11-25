// Telas da história: a conversa (diálogo com escolhas), a ficha de uma pessoa (C perto de alguém)
// e a caderneta do pai (C longe de todo mundo), no papel amarelado com letra de máquina.
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { clamp, fmtMoney } from '../core/utils.js';
import { S } from '../core/state.js';
import { C97, pf, lf, ptxt, bevel, wrap, impact } from './style97.js';
import { CHARS, PEOPLE, CLUES, storyOn } from '../game/story.js';

let lastT=performance.now();
export function drawStoryUI(){
  const now=performance.now(),dt=Math.min(0.1,(now-lastT)/1000);lastT=now;
  const g=ctx;g.setTransform(DPR,0,0,DPR,0,0);
  if(S.ficha){S.ficha.life-=dt;if(S.ficha.life<=0||S.ficha.p.state==='dead')S.ficha=null;else drawFicha(g,S.ficha);}
  if(S.cad&&storyOn())drawCaderneta(g,S.cad.page);
  if(S.dialog)drawDialog(g,S.dialog);
}

// ---------- conversa ----------
function drawDialog(g,d){
  const line=d.lines[Math.min(d.i,d.lines.length-1)],c=CHARS[line.who]||CHARS.nota;
  const w=Math.min(780,CW-32),x=(CW-w)/2;
  const choosing=d.choices&&d.i>=d.lines.length-1;
  g.font=pf(17);const lines=wrap(g,line.text,w-150);
  const h=Math.max(118,46+lines.length*23+(choosing?d.choices.length*26+12:26)),y=CH-h-24;
  g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(0,0,CW,CH);
  bevel(g,x,y,w,h,'rgba(14,14,18,0.96)',true,3);
  g.fillStyle=c.col;g.fillRect(x+3,y+3,w-6,4);
  // retrato: quadrado com as iniciais na cor de quem fala
  const px=x+16,py=y+20,ps=86;
  bevel(g,px,py,ps,ps,'#1d1d22',false,2);
  const ini=c.name?c.name.replace(/^(Seu|Dona|Cabo) /,'').slice(0,2).toUpperCase():'···';
  impact(g,ini,px+ps/2,py+ps/2+14,34,c.col,'center');
  const tx=px+ps+18;
  if(c.name)ptxt(g,c.name.toUpperCase(),tx,y+30,15,c.col);
  lines.forEach((l,i)=>ptxt(g,l,tx,y+(c.name?56:40)+i*23,17,line.who==='nota'?C97.sodio:C97.cal,'left'));
  let yy=y+(c.name?56:40)+lines.length*23;
  if(choosing){yy+=4;
    d.choices.forEach((ch,i)=>{const on=i===d.sel;
      if(on){g.fillStyle='rgba(255,210,31,0.16)';g.fillRect(tx-6,yy-2,w-(tx-x)-16,24);}
      ptxt(g,(i+1)+'  '+ch.label,tx,yy+16,15,on?C97.orelhao:C97.cal,'left');yy+=26;});
    ptxt(g,'1-'+d.choices.length+' ou ↑↓ + ENTER escolhe',x+w-14,y+h-10,11,C97.cinza,'right',false);
  } else {
    const blink=Math.floor(performance.now()/400)%2;
    ptxt(g,(blink?'▼ ':'  ')+'ENTER, F ou clique continua',x+w-14,y+h-10,11,C97.cinza,'right',false);
  }
}

// ---------- ficha de alguém (C perto da pessoa) ----------
function drawFicha(g,F){
  const f=F.f,a=clamp(F.life*2,0,1);g.globalAlpha=a;
  const w=300,h=f.secret?118:92,x=CW-w-16,y=Math.round(CH*0.45);
  paper(g,x,y,w,h);
  ptxt(g,'CADERNETA',x+14,y+20,11,'#8a7a5a','left',false);
  ptxt(g,f.name,x+14,y+44,18,f.col&&f.fixed?'#3a2a10':C97.tinta,'left',false);
  ptxt(g,f.job,x+14,y+66,13,'#5a4a30','left',false);
  if(f.secret){g.save();g.translate(x+w/2,y+96);g.rotate(-0.03);g.strokeStyle=C97.carimbo;g.lineWidth=2;g.font=pf(13);const tw=g.measureText(f.secret).width+20;
    g.strokeRect(-tw/2,-14,tw,22);ptxt(g,f.secret.toUpperCase(),0,2,12,C97.carimbo,'center',false);g.restore();}
  g.globalAlpha=1;
}
function paper(g,x,y,w,h){
  g.fillStyle='rgba(0,0,0,0.5)';g.fillRect(x+5,y+5,w,h);
  g.fillStyle=C97.papel;g.fillRect(x,y,w,h);
  g.strokeStyle='rgba(120,140,190,0.35)';g.lineWidth=1;for(let ly=y+28;ly<y+h-6;ly+=22){g.beginPath();g.moveTo(x+8,ly);g.lineTo(x+w-8,ly);g.stroke();}
  g.strokeStyle='rgba(200,60,60,0.45)';g.beginPath();g.moveTo(x+10,y);g.lineTo(x+10,y+h);g.stroke();
}

// ---------- caderneta (páginas) ----------
const PAGE_NAMES=['PISTAS','PESSOAS','CARNÊ','O QUE EU FIZ'];
function drawCaderneta(g,page){
  const s=S.story;
  g.fillStyle='rgba(0,0,0,0.55)';g.fillRect(0,0,CW,CH);
  const w=Math.min(720,CW-32),h=Math.min(500,CH-60),x=(CW-w)/2,y=(CH-h)/2;
  // capa de couro
  g.fillStyle='#3e2a1c';g.fillRect(x-12,y-12,w+24,h+24);g.fillStyle='#2a1c12';g.fillRect(x-12,y-12,w+24,6);
  paper(g,x,y,w,h);
  // abas
  let ax=x+16;
  PAGE_NAMES.forEach((n,i)=>{g.font=pf(13);const tw=g.measureText(n).width+22;const on=i===page;
    g.fillStyle=on?'#f7ecd0':'#cbbf9f';g.fillRect(ax,y-30,tw,26);g.strokeStyle='#6b5a3a';g.strokeRect(ax,y-30,tw,26);
    ptxt(g,(i+1)+' '+n,ax+11,y-12,12,on?C97.tinta:'#6b5a3a','left',false);ax+=tw+4;});
  const L=x+28,R=x+w-20;let yy=y+42;const line=(t,col,size,ind)=>{g.font=pf(size||14);for(const l of wrap(g,t,R-L-(ind||0))){ptxt(g,l,L+(ind||0),yy,size||14,col||C97.tinta,'left',false);yy+=22;}};
  const title=t=>{ptxt(g,t,L,yy,20,'#3a2a10','left',false);yy+=30;};
  if(page===0){
    title(s.ch===0?'Prólogo: a chegada':s.ch===1?'Capítulo 1: quem plantou o flagrante?':'Capítulo 1 resolvido');
    if(s.ch>=1){for(const c of CLUES){const ok=s.clues[c.k],sk=s.skipped[c.k];
      line((ok?'✔ ':sk?'~ ':'○ ')+c.title+(sk?' (o Neném adiantou)':''),ok?'#2e6b1f':sk?'#7a6a4a':C97.tinta,15);
      if(!ok&&!sk)line(c.how,'#6b5a3a',12,22);}yy+=6;}
    if(s.notes.length){ptxt(g,'ANOTAÇÕES',L,yy,12,'#8a7a5a','left',false);yy+=20;
      for(const n of s.notes.slice(-6))line('· '+n,'#4a3a20',13);}
  } else if(page===1){
    title('Pessoas');
    const met=PEOPLE.filter(k=>s.met[k]);
    if(!met.length)line('Ninguém anotado ainda.','#6b5a3a');
    for(const k of met){const c=CHARS[k],v=s.vinc[k]||0;
      ptxt(g,c.name,L,yy,16,'#3a2a10','left',false);
      ptxt(g,'●'.repeat(v)+'○'.repeat(5-v),R,yy,16,v>=4?'#2e6b1f':v<=1?C97.carimbo:'#6b5a3a','right',false);yy+=18;
      ptxt(g,c.role||'',L+12,yy,12,'#6b5a3a','left',false);yy+=24;}
    if(s.promessa){yy+=4;line('Promessa: eu prometi sair dessa.',C97.carimbo,13);}
  } else if(page===2){
    title('Carnê do Cabralzinho');
    line('Dívida: '+fmtMoney(s.debt),s.debt>0?C97.carimbo:'#2e6b1f',17);
    if(s.debt>0){line('Esta semana: '+fmtMoney(Math.min(s.due,s.debt))+(s.paidWeek>=Math.floor((S.day||0)/7)?'  ✔ paga':'  (até sexta, 20h)'),C97.tinta,15);
      line('Onde: casa de câmbio do Centro, das 8h às 20h.','#6b5a3a',13);
      line('Atrasou: a parcela sobe 20% e no sábado os capangas aparecem perto de casa.','#6b5a3a',13);
      line('Sem dinheiro: ele oferece um "favor".','#6b5a3a',13);}
    yy+=8;line('Atrasos: '+s.late+(s.favor?'  ·  favores: '+s.favor:''),'#4a3a20',13);
  } else {
    title('O que eu fiz');
    if(!s.did.length)line('Nada ainda. Cada escolha grande fica anotada aqui.','#6b5a3a');
    for(const t of s.did.slice(-12))line('· '+t,'#4a3a20',14);
  }
  ptxt(g,'← → troca a página  ·  C fecha',x+w/2,y+h-12,11,'#8a7a5a','center',false);
}
