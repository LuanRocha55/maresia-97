// Desenho dos interiores (visto de cima, com paredes e móveis com um pouco de volume)
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { shade, clamp } from '../core/utils.js';
import { ITS, THEME, NPC_SHIRT, nearestPoint, interiorTitle } from '../game/interior.js';
import { drawPerson } from './draw.js';
import { drawKeycap, drawInteriorHUD } from './hud.js';
import { S, player } from '../core/state.js';
import { pf } from './style97.js';

function hash(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);}

export function renderInterior(){
  const it=S.interior;if(!it)return;
  const g=ctx;
  g.setTransform(DPR,0,0,DPR,0,0);g.fillStyle='#0d0d12';g.fillRect(0,0,CW,CH);
  const th=THEME[it.kind]||THEME.mercadinho;
  // escala pra caber na tela, centrado
  const sc=Math.min((CW-60)/(it.W*ITS),(CH-120)/(it.H*ITS),1.4);
  const ox=(CW-it.W*ITS*sc)/2, oy=(CH-it.H*ITS*sc)/2+20;
  g.setTransform(DPR*sc,0,0,DPR*sc,DPR*ox,DPR*oy);
  const T=ITS;
  // chão
  for(let y=0;y<it.H;y++)for(let x=0;x<it.W;x++){
    const ch=it.plan[y][x];if(ch==='#')continue;
    g.fillStyle=(x+y)%2?th.floor:th.floor2;g.fillRect(x*T,y*T,T,T);
    if(it.kind==='casa'||it.kind==='armas'||it.kind==='escola'){g.fillStyle='rgba(0,0,0,0.06)';g.fillRect(x*T,y*T+T/2,T,1);}
  }
  // tapete da saída
  for(const e of it.exit){g.fillStyle='#7a2e2e';g.fillRect(e.x-T/2,e.y-T/2,T,T);g.fillStyle='rgba(255,255,255,0.15)';g.fillRect(e.x-T/2+4,e.y-T/2+4,T-8,T-8);}
  // móveis
  for(let y=0;y<it.H;y++)for(let x=0;x<it.W;x++){
    const ch=it.plan[y][x],px=x*T,py=y*T;
    const box=(col,h,inset=3)=>{g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(px+inset+4,py+inset+5,T-inset*2,T-inset*2);
      g.fillStyle=shade(col,0.75);g.fillRect(px+inset,py+inset+h,T-inset*2,T-inset*2-h);g.fillStyle=col;g.fillRect(px+inset,py+inset,T-inset*2,T-inset*2-h);};
    switch(ch){
      case 'S': box(th.shelf,6,4);for(let k=0;k<6;k++){g.fillStyle=th.prod.length?th.prod[Math.floor(hash(x,y+k)*th.prod.length)]:'#999';g.fillRect(px+8+(k%3)*11,py+8+Math.floor(k/3)*14,8,10);}break;
      case 'F': box('#dfe7ea',6,3);g.fillStyle='#9fd3e8';g.fillRect(px+7,py+7,T-14,T-22);g.fillStyle='#e53935';g.fillRect(px+10,py+10,5,8);g.fillStyle='#fdd835';g.fillRect(px+18,py+10,5,8);break;
      case 'C': box('#8d6e63',6,0);g.fillStyle='rgba(255,255,255,0.15)';g.fillRect(px,py,T,4);break;
      case 'T': g.fillStyle='rgba(0,0,0,0.25)';g.beginPath();g.arc(px+T/2+4,py+T/2+5,T*0.38,0,Math.PI*2);g.fill();g.fillStyle='#a1887f';g.beginPath();g.arc(px+T/2,py+T/2,T*0.38,0,Math.PI*2);g.fill();
        g.fillStyle='#ffffff';g.beginPath();g.arc(px+T/2-5,py+T/2-3,5,0,Math.PI*2);g.fill();break;
      case 'c': g.fillStyle='#5d4037';g.fillRect(px+T/2-8,py+T/2-8,16,16);g.fillStyle='#795548';g.fillRect(px+T/2-8,py+T/2-8,16,4);break;
      case 'B': box('#eceff1',4,2);g.fillStyle='#90caf9';g.fillRect(px+4,py+T*0.4,T-8,T*0.5);g.fillStyle='#ffffff';g.fillRect(px+8,py+6,T-16,10);break;
      case 'D': box('#6d4c41',5,3);g.fillStyle='#263238';g.fillRect(px+12,py+8,T-24,12);g.fillStyle='#4fc3f7';g.fillRect(px+14,py+10,T-28,8);break;
      case 'K': g.fillStyle='#2e4a32';g.fillRect(px,py+T*0.55,T,T*0.4);g.fillStyle='rgba(255,255,255,0.5)';g.fillRect(px+6+hash(x,y)*10,py+T*0.65,14,2);g.fillRect(px+4,py+T*0.78,20,2);break;
      case 'P': g.fillStyle='rgba(0,0,0,0.25)';g.beginPath();g.arc(px+T/2+3,py+T/2+4,14,0,Math.PI*2);g.fill();g.fillStyle='#8d6e63';g.fillRect(px+T/2-8,py+T/2-8,16,16);
        g.fillStyle='#2e7d32';for(let k=0;k<5;k++){const a=k*1.25;g.beginPath();g.ellipse(px+T/2+Math.cos(a)*8,py+T/2+Math.sin(a)*8,8,4,a,0,Math.PI*2);g.fill();}break;
      case 'V': box('#5c6bc0',8,2);break;
      case 'X': box('#6b4a2c',6,3);g.fillStyle='#2a2a2c';g.fillRect(px+10,py+8,T-20,T-18);break;
      case 'R': g.fillStyle='#4e342e';g.fillRect(px,py+T*0.6,T,T*0.35);g.strokeStyle='#212121';g.lineWidth=3;g.beginPath();g.moveTo(px+6,py+T*0.72);g.lineTo(px+T-6,py+T*0.72);g.moveTo(px+6,py+T*0.86);g.lineTo(px+T-10,py+T*0.86);g.stroke();break;
      case 'G': g.fillStyle='#fafafa';g.beginPath();g.arc(px+T/2,py+T/2,T*0.4,0,Math.PI*2);g.fill();g.fillStyle='#e53935';g.beginPath();g.arc(px+T/2,py+T/2,T*0.27,0,Math.PI*2);g.fill();g.fillStyle='#fafafa';g.beginPath();g.arc(px+T/2,py+T/2,T*0.14,0,Math.PI*2);g.fill();break;
      case '-': g.fillStyle='rgba(255,255,255,0.35)';g.fillRect(px,py+T/2-1,T,2);break;
      case 'J': g.fillStyle='#9e9e9e';for(let k=0;k<4;k++)g.fillRect(px+4+k*11,py,4,T);g.fillRect(px,py+T/2-2,T,4);break;
    }
  }
  // paredes com topo claro (dá volume)
  for(let y=0;y<it.H;y++)for(let x=0;x<it.W;x++){
    if(it.plan[y][x]!=='#')continue;const px=x*T,py=y*T;
    g.fillStyle='#3a3530';g.fillRect(px,py,T,T);g.fillStyle='#6b625a';g.fillRect(px,py,T,T*0.55);
    if(y+1<it.H&&it.plan[y+1][x]!=='#'){g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(px,py+T,T,8);}
  }
  // atendente, professor, clientes e jogador
  const sh=NPC_SHIRT[it.kind]||'#ffffff';
  if(it.att)drawPerson(g,it.att.x,it.att.y,Math.PI/2,sh,'#e0ac69','#2b1b10',0,false,1.6);
  if(it.teacher)drawPerson(g,it.teacher.x,it.teacher.y,Math.PI/2,sh,'#c68642','#111',0,false,1.6);
  for(const n of it.npcs)drawPerson(g,n.x,n.y,n.a,n.shirt,n.skin,n.hair,n.anim,n.moving,1.5);
  drawPerson(g,it.px,it.py,it.pa,'#ff7a1a','#c68642','#111',it.anim,it.moving,1.7);
  // ponto de interação perto: brilho + tecla
  const p=nearestPoint(it);
  for(const q of it.points){const near=p===q;g.strokeStyle=near?'rgba(255,233,160,0.95)':'rgba(255,233,160,0.35)';g.lineWidth=near?3:2;g.beginPath();g.arc(q.x,q.y,ITS*0.42+(near?Math.sin(S.gameTime*6)*3:0),0,Math.PI*2);g.stroke();}
  // tela
  g.setTransform(DPR,0,0,DPR,0,0);
  drawInteriorHUD(g,interiorTitle(),p?null:'Anda com WASD · o tapete vermelho é a saída');
  if(p){const sx=ox+(p.exit?it.px:p.x)*sc, sy=oy+(p.exit?it.py:p.y)*sc-ITS*sc*0.9;drawKeycap(g,'F',sx-60,sy,p.label);}
}
