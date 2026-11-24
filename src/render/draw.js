// Desenho do mundo: carros, pessoas, prédios em perspectiva
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { mulberry, clamp, lerp, hyp, shade } from '../core/utils.js';
import { T, W, H, WATER, buildings, trees, zones, phones, tileAt } from '../world/map.js';
import { CHUNK, CPX, getChunk } from '../world/chunks.js';
import { Car } from '../entities/vehicles.js';
import { Ped } from '../entities/peds.js';
import { heatStars } from '../game/world.js';
import { nearestCar } from '../game/player.js';
import { drawHUD, drawKeycap } from './hud.js';
import { tutorialTarget } from '../game/tutorial.js';
import { checkpoints } from '../game/blitz.js';
import { S, player, cam, keys } from '../core/state.js';
import { lamps, special, pumps, decor, VL, HL, NV, NH, isJunction } from '../world/map.js';
import { signalized, signalState } from '../world/districts.js';
import { darkness } from '../world/time.js';
import { drawLighting, drawGlows } from './lighting.js';
import { WEAPONS } from '../game/weapons.js';
import { BUS_STOPS, jobSpots, doorOf } from '../game/jobs.js';
import { matchOn, match, opponent, HOME } from '../game/stadium.js';
import { enterables, nearestDoor } from '../game/interiors.js';
import { drawIcon, KIND_ICON, ICONS } from './icons.js';
import { pf } from './style97.js';

let BR=1;      // brilho geral dos prédios/árvores (cai à noite)
let NIGHT=0;   // 0 dia .. 1 noite
function hash(n){const x=Math.sin(n)*43758.5453;return x-Math.floor(x);}

export function drawCar(g,c){
  g.save();g.translate(c.x,c.y);g.rotate(c.a);
  const L=c.t.len,Wd=c.t.wid,hl=L/2,hw=Wd/2;
  // sombra
  g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(-hl+3,-hw+4,L,Wd);
  const col=c.wreck?'#2b2724':c.color;
  g.fillStyle=shade(col,0.7);roundRect(g,-hl,-hw,L,Wd,5);g.fill();
  g.fillStyle=col;roundRect(g,-hl+1,-hw+1,L-2,Wd-2,4);g.fill();
  if(c.type==='moto'){
    g.fillStyle='#222';g.fillRect(-hl,-2,L,4);                       // pneus/quadro
    g.fillStyle=col;g.fillRect(-hl+6,-hw+1,L-12,Wd-2);
    g.fillStyle='#ccc';g.fillRect(hl-6,-hw-1,2,Wd+2);                 // guidão
    if(c.driver){g.fillStyle=c.driver==='player'?'#ff7a1a':'#555';g.beginPath();g.arc(-2,0,4.5,0,Math.PI*2);g.fill();g.fillStyle='#e53935';g.beginPath();g.arc(-1,0,3.2,0,Math.PI*2);g.fill();} // capacete
  } else if(c.type==='guincho'){
    g.fillStyle=shade(col,1.1);g.fillRect(hl-L*0.32,-hw+2,L*0.3,Wd-4);       // cabine
    g.fillStyle='#86c5da';g.fillRect(hl-6,-hw+4,4,Wd-8);
    g.fillStyle='#555';g.fillRect(-hl+2,-hw+3,L*0.62,Wd-6);                  // plataforma
    g.strokeStyle='#333';g.lineWidth=2;for(let i=0;i<5;i++){g.beginPath();g.moveTo(-hl+6+i*6,-hw+4);g.lineTo(-hl+6+i*6,hw-4);g.stroke();}
    g.fillStyle='#f57f17';g.fillRect(-hl-4,-2,10,4);g.fillStyle='#333';g.beginPath();g.arc(-hl-4,0,3,0,Math.PI*2);g.fill(); // gancho
    const on=Math.floor(S.gameTime*5)%2===0;g.fillStyle=on?'#ffb300':'#7a5a00';g.fillRect(hl-L*0.2,-hw+2,4,Wd-4);
  } else if(c.type==='caminhao'){
    g.fillStyle=shade(col,1.05);g.fillRect(-hl+2,-hw+2,L*0.74,Wd-4);g.strokeStyle='rgba(0,0,0,0.25)';g.lineWidth=1;
    for(let i=1;i<6;i++){g.beginPath();g.moveTo(-hl+2+i*L*0.12,-hw+2);g.lineTo(-hl+2+i*L*0.12,hw-2);g.stroke();}
    g.fillStyle='#455a64';g.fillRect(hl-L*0.24,-hw+1,L*0.22,Wd-2);g.fillStyle='#86c5da';g.fillRect(hl-6,-hw+4,4,Wd-8);
  } else if(c.type==='suv'){
    g.fillStyle='#86c5da';g.fillRect(hl-L*0.34,-hw+3,L*0.12,Wd-6);
    g.fillStyle=shade(col,1.12);g.fillRect(-hl+L*0.12,-hw+3,L*0.5,Wd-6);
    g.strokeStyle='#222';g.lineWidth=1.5;g.strokeRect(-hl+L*0.18,-hw+5,L*0.38,Wd-10);
  } else if(c.type==='luxo'){
    g.fillStyle='#5f8fa0';g.fillRect(hl-L*0.36,-hw+3,L*0.13,Wd-6);
    g.fillStyle=shade(col,1.2);g.fillRect(-hl+L*0.22,-hw+3,L*0.38,Wd-6);
    g.fillStyle='rgba(220,220,220,0.8)';g.fillRect(-hl+2,-hw+1,L-4,1.5);g.fillRect(-hl+2,hw-2.5,L-4,1.5);
  } else if(c.type==='busao'){
    g.fillStyle=shade(col,1.15);g.fillRect(-hl+4,-hw+3,L-10,Wd-6);
    g.fillStyle='#9fd3e8';g.fillRect(hl-7,-hw+3,4,Wd-6);
    g.fillStyle='rgba(255,255,255,0.5)';for(let i=0;i<6;i++)g.fillRect(-hl+10+i*11,-hw+5,6,Wd-10);
  } else if(c.type==='lotacao'){ // van: teto branco com bagageiro, faixas verde e amarela nas laterais
    g.fillStyle='#9fd3e8';g.fillRect(hl-9,-hw+3,5,Wd-6);
    g.fillStyle=shade(col,1.06);g.fillRect(-hl+3,-hw+3,L-13,Wd-6);
    g.fillStyle='#3a3a3d';for(let i=0;i<5;i++)g.fillRect(-hl+6+i*7,-hw+4,1.5,Wd-8);g.fillRect(-hl+6,-hw+4,29,1.2);g.fillRect(-hl+6,hw-5.2,29,1.2);
    g.fillStyle='#2e8b3a';g.fillRect(-hl+1,-hw,L-2,1.6);g.fillRect(-hl+1,hw-1.6,L-2,1.6);
  } else if(c.type==='camin'){
    g.fillStyle=shade(col,0.55);g.fillRect(-hl+3,-hw+3,L*0.45,Wd-6); // caçamba
    g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(-hl+5,-hw+5,L*0.45-4,Wd-10);
    g.fillStyle='#7fb8cf';g.fillRect(hl-L*0.42,-hw+3,5,Wd-6);
    g.fillStyle=shade(col,1.2);g.fillRect(hl-L*0.42+5,-hw+3,L*0.22,Wd-6);
  } else if(c.type==='bugue'){
    g.fillStyle='#222';g.fillRect(-hl+4,-hw+3,L-12,Wd-6);
    g.fillStyle='#d9d9d9';g.fillRect(-4,-hw+2,2,Wd-4);g.fillRect(-hl+6,-hw+2,2,Wd-4);
    g.fillStyle='#5a3b22';g.fillRect(-hl+8,-4,6,8);g.fillRect(-2,-4,6,8);
  } else {
    g.fillStyle='#86c5da';g.fillRect(hl-L*0.36,-hw+3,L*0.12,Wd-6); // para-brisa
    g.fillStyle=shade(col,1.18);g.fillRect(-hl+L*0.25,-hw+3,L*0.38,Wd-6); // teto
    g.fillStyle='#5f8fa0';g.fillRect(-hl+L*0.16,-hw+3,L*0.09,Wd-6); // vidro traseiro
    if(c.type==='taxi'){g.fillStyle='#e53935';g.fillRect(-hl+L*0.4,-3,6,6);g.fillStyle='#1e88e5';g.fillRect(-hl+3,-hw+1,L-6,2);g.fillRect(-hl+3,hw-3,L-6,2);}
    if(c.type==='brisa'){g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(-hl+L*0.25,-1.5,L*0.38,3);g.fillStyle='#111';g.fillRect(-hl,-hw+2,3,Wd-4);}
    if(c.type==='swat'){g.fillStyle='#2a2e36';g.fillRect(-hl+L*0.15,-hw+3,L*0.6,Wd-6);g.fillStyle='#fff';g.font='bold 7px monospace';g.textAlign='center';g.fillText('SWAT',-hl+L*0.45,3);}
    if(c.type==='exercito'||c.type==='blindado'){g.fillStyle='rgba(0,0,0,0.25)';for(let k=0;k<4;k++)g.fillRect(-hl+4+k*L/4.5,-hw+3+(k%2)*5,6,4);
      if(c.type==='blindado'){g.fillStyle='#2e3313';g.beginPath();g.arc(0,0,Wd*0.32,0,Math.PI*2);g.fill();g.fillRect(0,-2,L*0.45,4);}}
    if(c.type==='swat'||c.type==='fbi'){const on=Math.floor(S.gameTime*8)%2===0&&heatStars()>0&&c.ai;g.fillStyle=on?'#ff2a2a':'#5a1010';g.fillRect(hl-L*0.3,-hw+3,3,4);g.fillStyle=on?'#3a6bff':'#101a50';g.fillRect(hl-L*0.3,hw-7,3,4);}
    if(c.type==='viatura'){g.fillStyle='#f4f4f4';g.fillRect(-hl+L*0.25,-hw+3,L*0.38,Wd-6);g.fillStyle='#f4f4f4';g.fillRect(hl-L*0.24,-hw+1,L*0.2,Wd-2);g.fillRect(-hl+1,-hw+1,L*0.14,Wd-2);
      const on=Math.floor(S.gameTime*8)%2===0&&heatStars()>0;g.fillStyle=on?'#ff2a2a':'#7a1010';g.fillRect(-hl+L*0.42,-hw+3,5,(Wd-6)/2);g.fillStyle=on?'#3a6bff':'#0e1f66';g.fillRect(-hl+L*0.42,0,5,(Wd-6)/2);
      if(on){g.fillStyle='rgba(255,40,40,0.18)';g.beginPath();g.arc(0,0,38,0,Math.PI*2);g.fill();}}
  }
  // faróis / lanternas
  if(!c.wreck){g.fillStyle='#fff8c0';g.fillRect(hl-2,-hw+2,2,4);g.fillRect(hl-2,hw-6,2,4);
    g.fillStyle=c.brakeLight?'#ff3030':'#8a1a1a';g.fillRect(-hl,-hw+2,2,4);g.fillRect(-hl,hw-6,2,4);}
  else{g.fillStyle='rgba(0,0,0,0.4)';g.fillRect(-hl+4,-hw+3,L-8,Wd-6);}
  if(c===player.car){g.strokeStyle='rgba(255,255,255,0.0)';}
  g.restore();
}
export function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);g.closePath();}
export function drawPerson(g,x,y,a,shirt,skin,hair,anim,moving,scale){
  g.save();g.translate(x,y);g.rotate(a);if(scale)g.scale(scale,scale);
  g.fillStyle='rgba(0,0,0,0.3)';g.beginPath();g.ellipse(2,2,7,6,0,0,Math.PI*2);g.fill();
  if(moving){const sw=Math.sin(anim*10)*4;g.fillStyle='#2b2f45';g.fillRect(-2+sw,-5,5,3);g.fillRect(-2-sw,2,5,3);}
  g.fillStyle=shirt;g.beginPath();g.ellipse(0,0,4.5,7,0,0,Math.PI*2);g.fill();
  g.fillStyle=skin;g.beginPath();g.arc(1,0,3.6,0,Math.PI*2);g.fill();
  g.fillStyle=hair;g.beginPath();g.arc(0,0,3.4,Math.PI*0.5,Math.PI*1.5);g.fill();
  g.restore();
}
// prédios com perspectiva
export function proj(px,py,h,camH){const k=camH/(camH-h);return[cam.x+(px-cam.x)*k,cam.y+(py-cam.y)*k];}
export function drawBuilding(g,b,camH){
  const h=b.h;const {x0,y0,x1,y1}=b;
  if(b.kind==='canopy'){drawCanopy(g,b,camH);return;}
  if(b.kind==='estadio'){drawStadium(g,b,camH);return;}
  const A=proj(x0,y0,h,camH),B=proj(x1,y0,h,camH),C=proj(x1,y1,h,camH),D=proj(x0,y1,h,camH);
  const quad=(p1,p2,p3,p4,col)=>{g.fillStyle=col;g.beginPath();g.moveTo(p1[0],p1[1]);g.lineTo(p2[0],p2[1]);g.lineTo(p3[0],p3[1]);g.lineTo(p4[0],p4[1]);g.closePath();g.fill();};
  const floors=Math.max(1,Math.floor(h/12));
  const wallLines=(e1,e2,r1,r2,col)=>{g.strokeStyle=col;g.lineWidth=1.5;g.beginPath();for(let i=1;i<floors;i++){const t=i/floors;
      g.moveTo(lerp(e1[0],r1[0],t),lerp(e1[1],r1[1],t));g.lineTo(lerp(e2[0],r2[0],t),lerp(e2[1],r2[1],t));}g.stroke();};
  // janelas acesas à noite
  const wins=(e1,e2,r1,r2,face)=>{if(NIGHT<0.3)return;const len=hyp(e2[0]-e1[0],e2[1]-e1[1]);const n=Math.max(1,Math.floor(len/24));const fl=Math.min(floors,8);
    g.fillStyle='rgba(255,214,120,'+Math.min(1,(NIGHT-0.3)*2.2)+')';
    for(let i=0;i<fl;i++){const t=(i+0.5)/fl;for(let kk=0;kk<n;kk++){if(hash(b.seed*1000+i*13.1+kk*7.7+face*3.3)>0.38)continue;const u=(kk+0.5)/n;
      const bx=lerp(e1[0],e2[0],u),by=lerp(e1[1],e2[1],u),rx=lerp(r1[0],r2[0],u),ry=lerp(r1[1],r2[1],u);g.fillRect(lerp(bx,rx,t)-2.5,lerp(by,ry,t)-1.5,5,3);}}};
  if(cam.y<y0){quad([x0,y0],[x1,y0],B,A,shade(b.wall,0.82*BR));wallLines([x0,y0],[x1,y0],A,B,'rgba(0,0,0,0.18)');wins([x0,y0],[x1,y0],A,B,1);}
  if(cam.y>y1){quad([x0,y1],[x1,y1],C,D,shade(b.wall,0.92*BR));wallLines([x0,y1],[x1,y1],D,C,'rgba(0,0,0,0.18)');wins([x0,y1],[x1,y1],D,C,2);}
  if(cam.x<x0){quad([x0,y0],[x0,y1],D,A,shade(b.wall,0.72*BR));wallLines([x0,y0],[x0,y1],A,D,'rgba(0,0,0,0.18)');wins([x0,y0],[x0,y1],A,D,3);}
  if(cam.x>x1){quad([x1,y0],[x1,y1],C,B,shade(b.wall,0.78*BR));wallLines([x1,y0],[x1,y1],B,C,'rgba(0,0,0,0.18)');wins([x1,y0],[x1,y1],B,C,4);}
  // telhado
  quad(A,B,C,D,shade(b.roof||shade(b.wall,0.8),BR));
  const k=camH/(camH-h);const rw=(x1-x0)*k, rh=(y1-y0)*k;
  g.strokeStyle=shade(b.roof||b.wall,1.35*BR);g.lineWidth=3;g.strokeRect(A[0]+2,A[1]+2,rw-4,rh-4);
  if(b.kind!=='b'){roofSign(g,b,A[0],A[1],rw,rh);return;}
  else{
    const r=mulberry(Math.floor(b.seed*1e9));
    const n=Math.floor(r()*3)+(rw*rh>60000?2:0);
    for(let i=0;i<n;i++){const kind=r();const px=A[0]+10+r()*(rw-34),py=A[1]+10+r()*(rh-34);
      if(kind<0.45){g.fillStyle=shade('#2f6fb3',BR);g.beginPath();g.arc(px+9,py+9,8,0,Math.PI*2);g.fill();g.fillStyle=shade('#4f8fd3',BR);g.beginPath();g.arc(px+9,py+9,5,0,Math.PI*2);g.fill();} // caixa d'água
      else if(kind<0.8){g.fillStyle=shade(b.roof,0.75*BR);g.fillRect(px,py,16,12);g.fillStyle=shade(b.roof,1.25*BR);g.fillRect(px+3,py+3,10,6);} // ar-condicionado
      else{g.fillStyle=shade(b.roof,0.6*BR);g.fillRect(px,py,22,22);g.fillStyle=shade(b.roof,0.9*BR);g.fillRect(px+3,py+3,16,16);}}
  }
}
// ---- placas e ícones nos telhados ----
export function roofSign(g,b,x,y,rw,rh){
  const cx=x+rw/2, cy=y+rh/2, s=Math.min(rw,rh);
  const fs=Math.round(clamp(s*0.13,10,17));
  const plate=(t,py,bg,fg)=>{g.font=pf(fs);const w=g.measureText(t).width+12;g.fillStyle=bg;g.fillRect(cx-w/2,py-fs*0.8,w,fs*1.3);label(g,t,cx,py+fs*0.3,fg,fs);};
  const k=b.kind;
  if(k==='hospital'){g.fillStyle='#e53935';const q=s*0.16;g.fillRect(cx-q,cy-q*3,q*2,q*6);g.fillRect(cx-q*3,cy-q,q*6,q*2);plate('HOSPITAL',y+rh-12,'rgba(255,255,255,0.85)','#b71c1c');}
  else if(k==='policia'){star(g,cx,cy-s*0.08,s*0.26,'#f5f5f5');star(g,cx,cy-s*0.08,s*0.15,'#2e4d86');
    g.fillStyle='#f5f5f5';for(let i=0;i<rw;i+=16)g.fillRect(x+i,y+2,8,5);plate('CARCERAGEM',y+rh-12,'#1b2f55','#ffffff');}
  else if(k==='ze'){wrench(g,cx,cy-4,s*0.5);plate('OFICINA DO ZÉ',y+rh-10,'#3a2410','#ffd08a');}
  else if(k==='pintura'||k==='pintura2'){const cols=['#e53935','#fdd835','#1e88e5','#d81b60','#43a047'];
    for(let i=0;i<5;i++){g.fillStyle=cols[i];g.beginPath();const bx=x+12+i*rw*0.13;g.moveTo(bx,y+8);g.lineTo(bx+rw*0.08,y+8);g.lineTo(bx+rw*0.08-14,y+rh-24);g.lineTo(bx-14,y+rh-24);g.closePath();g.fill();}
    plate('PINTURA EXPRESS',y+rh-10,'#0f3d2c','#d9ffe9');}
  else if(k==='armas'){g.strokeStyle='#ffdddd';g.lineWidth=3;const R=s*0.28;g.beginPath();g.arc(cx-rw*0.25,cy-2,R,0,Math.PI*2);g.stroke();
    g.beginPath();g.moveTo(cx-rw*0.25-R-6,cy-2);g.lineTo(cx-rw*0.25+R+6,cy-2);g.moveTo(cx-rw*0.25,cy-2-R-6);g.lineTo(cx-rw*0.25,cy-2+R+6);g.stroke();
    g.fillStyle='#ff4a3c';g.beginPath();g.arc(cx-rw*0.25,cy-2,3,0,Math.PI*2);g.fill();plate('ARMAS DO TONHÃO',cy+4,'#2a0d0a','#ffb0a0');}
  else if(k==='farmacia'){g.fillStyle='#2e9e4a';const q=s*0.11;g.fillRect(cx-q,cy-q*3-6,q*2,q*6);g.fillRect(cx-q*3,cy-q-6,q*6,q*2);plate('FARMÁCIA',y+rh-12,'#2e9e4a','#ffffff');}
  else if(k==='mercadinho'){for(let i=0;i<rw;i+=18){g.fillStyle=(i/18)%2?'#ffffff':'#d35400';g.fillRect(x+i,y,9,rh*0.22);}
    g.strokeStyle='#5a2a00';g.lineWidth=3;const bw=s*0.3;g.beginPath();g.moveTo(cx-bw/2,cy-6);g.lineTo(cx+bw/2,cy-6);g.lineTo(cx+bw/2-6,cy+bw*0.45);g.lineTo(cx-bw/2+6,cy+bw*0.45);g.closePath();g.stroke();
    g.beginPath();g.arc(cx,cy-6,bw*0.3,Math.PI,0);g.stroke();plate('MERCADINHO',y+rh-12,'#5a2a00','#ffe0b0');}
  else if(k==='padaria'){g.fillStyle='#e0a35a';g.beginPath();g.ellipse(cx,cy-8,s*0.24,s*0.12,0,0,Math.PI*2);g.fill();g.strokeStyle='#8a5a2a';g.lineWidth=3;
    for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(cx+i*s*0.1-5,cy-8-s*0.06);g.lineTo(cx+i*s*0.1+5,cy-8+s*0.06);g.stroke();}plate('PADARIA',y+rh-12,'#5a3410','#ffe9c0');}
  else if(k==='escola'){ // livro aberto grande no telhado
    const bw=Math.min(rw*0.62,s*0.75), bh=bw*0.55, bx=cx, by=cy-10;
    g.fillStyle='rgba(0,0,0,0.25)';g.beginPath();g.moveTo(bx+4,by-bh*0.35+5);g.lineTo(bx-bw/2+4,by-bh/2+5);g.lineTo(bx-bw/2+4,by+bh/2+5);g.lineTo(bx+4,by+bh*0.62+5);g.lineTo(bx+bw/2+4,by+bh/2+5);g.lineTo(bx+bw/2+4,by-bh/2+5);g.closePath();g.fill();
    g.fillStyle='#8e2b2b';g.beginPath();g.moveTo(bx,by-bh*0.32);g.lineTo(bx-bw/2-5,by-bh/2-3);g.lineTo(bx-bw/2-5,by+bh/2+5);g.lineTo(bx,by+bh*0.66);g.lineTo(bx+bw/2+5,by+bh/2+5);g.lineTo(bx+bw/2+5,by-bh/2-3);g.closePath();g.fill();   // capa
    for(const sd of[-1,1]){g.fillStyle='#fbf6e9';g.beginPath();g.moveTo(bx,by-bh*0.35);g.quadraticCurveTo(bx+sd*bw*0.25,by-bh*0.6,bx+sd*bw/2,by-bh/2);g.lineTo(bx+sd*bw/2,by+bh/2);g.quadraticCurveTo(bx+sd*bw*0.25,by+bh*0.4,bx,by+bh*0.6);g.closePath();g.fill();
      g.strokeStyle='rgba(60,60,60,0.45)';g.lineWidth=1.5;for(let l=0;l<5;l++){const ly=by-bh*0.3+l*bh*0.16;g.beginPath();g.moveTo(bx+sd*bw*0.08,ly+bh*0.05);g.lineTo(bx+sd*bw*0.42,ly);g.stroke();}}
    g.strokeStyle='#5a1a1a';g.lineWidth=2;g.beginPath();g.moveTo(bx,by-bh*0.35);g.lineTo(bx,by+bh*0.6);g.stroke();
    plate('ESCOLA',y+rh-12,'#1f3f70','#ffffff');}
  else if(k==='lanchonete'){const q=s*0.14;g.fillStyle='#e6a33a';g.beginPath();g.ellipse(cx,cy-q-4,q*1.4,q*0.7,0,Math.PI,0);g.fill();g.fillStyle='#6b3a1a';g.fillRect(cx-q*1.4,cy-q-2,q*2.8,q*0.5);
    g.fillStyle='#4caf50';g.fillRect(cx-q*1.5,cy-q*0.5-2,q*3,q*0.25);g.fillStyle='#e6a33a';g.fillRect(cx-q*1.4,cy-q*0.2,q*2.8,q*0.5);plate('LANCHONETE',y+rh-12,'#7a1d14','#ffe14a');}
  else if(k==='lojaposto'){plate('POSTO GUANABARA',cy+4,'#7a1d14','#ffffff');}
}
function star(g,x,y,r,col){g.fillStyle=col;g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*0.45:r;g.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}g.closePath();g.fill();}
function wrench(g,x,y,size){g.save();g.translate(x,y);g.rotate(-Math.PI/4);g.fillStyle='#e0e0e0';g.fillRect(-size*0.08,-size*0.05,size*0.55,size*0.1);
  g.beginPath();g.arc(-size*0.12,0,size*0.16,0,Math.PI*2);g.fill();g.fillStyle='#8a4a1a';g.fillRect(-size*0.3,-size*0.05,size*0.16,size*0.1);g.restore();}
// estádio: arquibancada inclinada (alta por fora, baixa na beira do gramado), torcida e refletores
function drawStadium(g,b,camH){
  const H=b.h, Hi=H*0.3, I=b.inner;
  const P=(x,y,h)=>proj(x,y,h,camH);
  const O=[P(b.x0,b.y0,H),P(b.x1,b.y0,H),P(b.x1,b.y1,H),P(b.x0,b.y1,H)];
  const N=[P(I.x0,I.y0,Hi),P(I.x1,I.y0,Hi),P(I.x1,I.y1,Hi),P(I.x0,I.y1,Hi)];
  const G=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
  const GI=[[I.x0,I.y0],[I.x1,I.y0],[I.x1,I.y1],[I.x0,I.y1]];
  const quad=(a,c,d,e,col)=>{g.fillStyle=col;g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(c[0],c[1]);g.lineTo(d[0],d[1]);g.lineTo(e[0],e[1]);g.closePath();g.fill();};
  const wall=shade(b.wall,BR);
  // paredes de fora (lados virados pra câmera)
  if(cam.y<b.y0)quad(G[0],G[1],O[1],O[0],shade(b.wall,0.82*BR));
  if(cam.y>b.y1)quad(G[3],G[2],O[2],O[3],shade(b.wall,0.92*BR));
  if(cam.x<b.x0)quad(G[0],G[3],O[3],O[0],shade(b.wall,0.72*BR));
  if(cam.x>b.x1)quad(G[1],G[2],O[2],O[1],shade(b.wall,0.78*BR));
  // muretas de dentro (beira do gramado)
  if(cam.y>I.y0)quad(GI[0],GI[1],N[1],N[0],shade('#607d8b',BR));
  if(cam.y<I.y1)quad(GI[3],GI[2],N[2],N[3],shade('#607d8b',BR));
  if(cam.x>I.x0)quad(GI[0],GI[3],N[3],N[0],shade('#546e7a',BR));
  if(cam.x<I.x1)quad(GI[1],GI[2],N[2],N[1],shade('#546e7a',BR));
  // arquibancada (4 faixas inclinadas)
  const sides=[[0,1],[1,2],[2,3],[3,0]], cols=['#78909c','#8d9ea7','#78909c','#8d9ea7'];
  const live=matchOn(), m=live?match():null, opp=opponent();
  for(let k=0;k<4;k++){const [a,c]=sides[k];quad(O[a],O[c],N[c],N[a],shade(cols[k],BR));
    // degraus
    g.strokeStyle='rgba(0,0,0,0.18)';g.lineWidth=1.5;
    for(let r=1;r<6;r++){const t=r/6;g.beginPath();g.moveTo(lerp(N[a][0],O[a][0],t),lerp(N[a][1],O[a][1],t));g.lineTo(lerp(N[c][0],O[c][0],t),lerp(N[c][1],O[c][1],t));g.stroke();}
    // torcida: pontinhos coloridos (lota em dia de jogo)
    const dens=live?0.8:0.06;
    for(let r=0;r<5;r++){const t=(r+0.5)/6;const ax=lerp(N[a][0],O[a][0],t),ay=lerp(N[a][1],O[a][1],t),cx2=lerp(N[c][0],O[c][0],t),cy2=lerp(N[c][1],O[c][1],t);
      const len=Math.hypot(cx2-ax,cy2-ay),n=Math.floor(len/9);
      for(let q=0;q<n;q++){const h=hash(b.seed*999+k*131+r*17+q);if(h>dens)continue;
        const hh=hash(h*77+q);const col=hh<0.68?HOME.colors[hh<0.4?0:1]:opp.colors[hh<0.84?0:1];
        const jump=live?Math.sin(S.gameTime*8+q+r)*1.2:0;
        g.fillStyle=col;g.fillRect(lerp(ax,cx2,q/n)-2,lerp(ay,cy2,q/n)-2+jump,4,4);}}}
  // placa e refletores
  label(g,'ESTÁDIO DO JACARANDÁ',(O[2][0]+O[3][0])/2,O[2][1]-8,'#ffffff',16);
  if(live&&m)label(g,HOME.name+' '+m.hs+' x '+m.as+' '+opp.name,(O[0][0]+O[1][0])/2,O[0][1]+22,'#ffe14a',13);
  const lit=NIGHT>0.2||live;
  for(const [gx,gy] of [[b.x0-16,b.y0-16],[b.x1+16,b.y0-16],[b.x0-16,b.y1+16],[b.x1+16,b.y1+16]]){
    const top=P(gx,gy,H+50);g.strokeStyle=shade('#9e9e9e',BR);g.lineWidth=5;g.beginPath();g.moveTo(gx,gy);g.lineTo(top[0],top[1]);g.stroke();
    g.fillStyle=lit?'#fffde7':'#616161';g.fillRect(top[0]-12,top[1]-7,24,14);
    if(lit){g.globalCompositeOperation='lighter';const gr=g.createRadialGradient(top[0],top[1],0,top[0],top[1],60);gr.addColorStop(0,'rgba(255,250,220,0.5)');gr.addColorStop(1,'rgba(255,250,220,0)');g.fillStyle=gr;g.beginPath();g.arc(top[0],top[1],60,0,Math.PI*2);g.fill();g.globalCompositeOperation='source-over';}}
}
function drawCanopy(g,b,camH){
  const A=proj(b.x0,b.y0,b.h,camH),C=proj(b.x1,b.y1,b.h,camH);
  // pilares
  g.fillStyle=shade('#9e9e9e',BR);for(const [px,py] of [[b.x0+8,b.y0+8],[b.x1-8,b.y0+8],[b.x0+8,b.y1-8],[b.x1-8,b.y1-8]]){const P=proj(px,py,b.h,camH);g.strokeStyle=shade('#8a8a8a',BR);g.lineWidth=4;g.beginPath();g.moveTo(px,py);g.lineTo(P[0],P[1]);g.stroke();}
  g.globalAlpha=0.82;g.fillStyle=shade('#f2f2ee',BR);g.fillRect(A[0],A[1],C[0]-A[0],C[1]-A[1]);
  g.fillStyle='#c9342a';g.fillRect(A[0],A[1],C[0]-A[0],8);g.fillRect(A[0],C[1]-8,C[0]-A[0],8);
  g.globalAlpha=1;label(g,'POSTO · CONSERTO $150',(A[0]+C[0])/2,(A[1]+C[1])/2+5,'#c9342a',13);
}
// semáforo: caixinha com 3 luzes, virada pra quem chega
function trafficLight(g,x,y,ang,st){
  g.save();g.translate(x,y);g.rotate(ang);g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(-10,-4,22,10);
  g.fillStyle='#1d1d1f';g.fillRect(-11,-5,22,10);
  const cols={r:['#ff3b30','#3a1212'],y:['#ffcc00','#3a3212'],g:['#34c759','#123a1a']};
  [['r',-6],['y',0],['g',6]].forEach(([k,o])=>{g.fillStyle=st===k?cols[k][0]:cols[k][1];g.beginPath();g.arc(o,0,2.6,0,Math.PI*2);g.fill();});
  g.restore();
}
export function label(g,t,x,y,col,size){g.font=pf(size);g.textAlign='center';g.fillStyle='rgba(0,0,0,0.5)';g.fillText(t,x+2,y+2);g.fillStyle=col;g.fillText(t,x,y);}
export function drawTree(g,tr,camH){const p=proj(tr.x,tr.y,26,camH);const k=camH/(camH-26);const TC=shade(tr.c,BR);
  g.fillStyle='rgba(0,0,0,0.25)';g.beginPath();g.arc(tr.x+4,tr.y+4,tr.r*0.9,0,Math.PI*2);g.fill();
  if(tr.palm){g.strokeStyle='#7a5a2a';g.lineWidth=3;g.beginPath();g.moveTo(tr.x,tr.y);g.lineTo(p[0],p[1]);g.stroke();
    g.fillStyle=TC;for(let i=0;i<6;i++){const a=i*Math.PI/3+tr.r;g.beginPath();g.ellipse(p[0]+Math.cos(a)*9*k,p[1]+Math.sin(a)*9*k,10*k,3.5*k,a,0,Math.PI*2);g.fill();}
    g.fillStyle='#5a3b1a';g.beginPath();g.arc(p[0],p[1],3*k,0,Math.PI*2);g.fill();return;}
  g.fillStyle=shade(tr.c,0.8*BR);g.beginPath();g.arc(p[0],p[1],tr.r*k,0,Math.PI*2);g.fill();
  g.fillStyle=TC;g.beginPath();g.arc(p[0]-2,p[1]-2,tr.r*k*0.75,0,Math.PI*2);g.fill();
  g.fillStyle=shade(tr.c,1.25*BR);g.beginPath();g.arc(p[0]-4,p[1]-4,tr.r*k*0.35,0,Math.PI*2);g.fill();}

function drawCheckpoint(g,cp,mode){
  const px=-cp.dy,py=cp.dx,hw=cp.L.w*T/2, P=(s,l)=>[cp.x+cp.dx*s+px*l,cp.y+cp.dy*s+py*l];
  g.save();g.translate(cp.x,cp.y);g.rotate(Math.atan2(cp.dy,cp.dx));
  // tapete de pregos (dentro)
  g.fillStyle='#2b2b2b';g.fillRect(34,-hw+4,10,hw*2-8);g.fillStyle='#bdbdbd';for(let l=-hw+8;l<hw-6;l+=7){g.fillRect(36,l,2,2);g.fillRect(40,l+3,2,2);}
  // faixa de PARE pintada (fora)
  g.fillStyle='rgba(255,255,255,0.75)';g.fillRect(-34,-hw+4,5,hw*2-8);
  if(mode!=='3d'){
    // cones afunilando
    for(let k=0;k<5;k++){const s=-110+k*22,l=hw-8-k*6;for(const sg of[-1,1]){g.fillStyle='rgba(0,0,0,0.3)';g.beginPath();g.arc(s+2,sg*l+2,5,0,Math.PI*2);g.fill();g.fillStyle='#ff6d00';g.beginPath();g.arc(s,sg*l,5,0,Math.PI*2);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(s,sg*l,2,0,Math.PI*2);g.fill();}}
    // cancela listrada
    g.fillStyle='#424242';g.fillRect(-4,-hw-14,8,8);
    if(cp.broken>0){g.save();g.rotate(0.5);g.fillStyle='#e53935';g.fillRect(6,-hw,30,4);g.restore();g.fillStyle='#e53935';g.fillRect(20,hw-30,24,4);}
    else for(let l=-hw-8,k=0;l<hw-2;l+=12,k++){g.fillStyle=k%2?'#ffffff':'#e53935';g.fillRect(-2,l,4,12);}
  }
  g.restore();
}
export function drawGround2D(g,vx0,vx1,vy0,vy1,mode){
  // decalques
  for(const d of S.decals){if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1)continue;const a=clamp(d.life/5,0,1);
    if(d.type==='scorch'){g.fillStyle='rgba(15,10,5,'+(0.55*a)+')';g.beginPath();g.arc(d.x,d.y,d.r,0,Math.PI*2);g.fill();}
    else{g.fillStyle='rgba(120,10,10,'+(0.7*a)+')';g.beginPath();g.arc(d.x,d.y,d.r,0,Math.PI*2);g.fill();g.beginPath();g.arc(d.x+7,d.y-4,d.r*0.5,0,Math.PI*2);g.fill();}}
  // marcas de pneu
  g.lineWidth=3;
  for(const s of S.skids){if(s.x1<vx0||s.x1>vx1||s.y1<vy0||s.y1>vy1)continue;g.strokeStyle=s.sand?'rgba(150,120,70,'+(Math.min(1,s.life/4)*0.5)+')':'rgba(15,15,15,'+(Math.min(1,s.life/4)*0.55)+')';
    g.beginPath();g.moveTo(s.x1,s.y1);g.lineTo(s.x2,s.y2);g.stroke();}
  // zonas
  for(const z of zones){const pulse=0.25+0.15*Math.sin(S.gameTime*4);g.fillStyle=z.type==='ze'?'rgba(255,150,40,'+pulse+')':z.type==='posto'?'rgba(255,216,60,'+(pulse*0.5)+')':z.type==='armas'?'rgba(255,70,50,'+(pulse*0.6)+')':'rgba(40,255,150,'+pulse+')';g.fillRect(z.x0,z.y0,z.x1-z.x0,z.y1-z.y0);
    g.setLineDash([10,8]);g.strokeStyle=z.type==='ze'?'#ffb060':z.type==='armas'?'#ff7a60':'#60ffb0';g.lineWidth=3;g.strokeRect(z.x0,z.y0,z.x1-z.x0,z.y1-z.y0);g.setLineDash([]);
    if(z.pads){label(g,z.label,(z.x0+z.x1)/2,z.y0+22,'#fff',12);
      for(const pd of z.pads){const w=WEAPONS[pd.weapon];g.fillStyle='rgba(120,20,10,0.55)';g.fillRect(pd.x0,pd.y0,pd.x1-pd.x0,pd.y1-pd.y0);
        g.strokeStyle='#ff9a80';g.lineWidth=2;g.strokeRect(pd.x0,pd.y0,pd.x1-pd.x0,pd.y1-pd.y0);
        label(g,w.name.length>9?'SMG':w.name.toUpperCase(),(pd.x0+pd.x1)/2,(pd.y0+pd.y1)/2-2,'#fff',11);label(g,'$'+w.price,(pd.x0+pd.x1)/2,(pd.y0+pd.y1)/2+14,'#9dff8a',11);}}
    else if(z.type!=='posto')label(g,z.label,(z.x0+z.x1)/2,(z.y0+z.y1)/2+6,'#fff',16);}
  // postes
  if(mode==='2d')for(const l of lamps){if(l.x<vx0||l.x>vx1||l.y<vy0||l.y>vy1)continue;
    g.fillStyle='rgba(0,0,0,0.3)';g.beginPath();g.arc(l.x+2,l.y+2,4,0,Math.PI*2);g.fill();
    g.fillStyle='#3d3d42';g.beginPath();g.arc(l.x,l.y,4,0,Math.PI*2);g.fill();
    g.fillStyle=NIGHT>0.05?'#fff1b8':'#c9c9c0';g.beginPath();g.arc(l.x,l.y,2,0,Math.PI*2);g.fill();}
  // enfeites: guarda-sol, rede de vôlei, guindaste do porto
  for(const d of decor){
    if(d.type==='campo')continue;
    if(mode!=='2d'&&(d.type==='guarda-sol'||d.type==='guindaste'||d.type==='refletor'))continue;
    if(d.x<vx0-120||d.x>vx1+120||d.y<vy0-120||d.y>vy1+120)continue;
    if(d.type==='guarda-sol'){g.fillStyle='rgba(0,0,0,0.25)';g.beginPath();g.arc(d.x+5,d.y+5,15,0,Math.PI*2);g.fill();
      for(let k=0;k<8;k++){g.fillStyle=k%2?d.c:'#ffffff';g.beginPath();g.moveTo(d.x,d.y);g.arc(d.x,d.y,15,k*Math.PI/4,(k+1)*Math.PI/4);g.closePath();g.fill();}}
    else if(d.type==='volei'){g.strokeStyle='rgba(255,255,255,0.9)';g.lineWidth=2;g.strokeRect(d.x-60,d.y-30,120,60);g.strokeStyle='#333';g.lineWidth=3;g.beginPath();g.moveTo(d.x,d.y-38);g.lineTo(d.x,d.y+38);g.stroke();}
    else if(d.type==='guindaste'){g.fillStyle='rgba(0,0,0,0.3)';g.fillRect(d.x-20,d.y-12,46,30);g.fillStyle='#f9a825';g.fillRect(d.x-22,d.y-16,44,30);
      g.strokeStyle='#f9a825';g.lineWidth=6;g.beginPath();g.moveTo(d.x,d.y);g.lineTo(d.x,d.y+110);g.stroke();g.lineWidth=2;g.strokeStyle='#333';g.beginPath();g.moveTo(d.x,d.y+90);g.lineTo(d.x,d.y+130);g.stroke();}
  }
  // bombas de gasolina
  for(const p of pumps){if(p.x<vx0||p.x>vx1||p.y<vy0||p.y>vy1)continue;g.fillStyle='#c9342a';g.fillRect(p.x-6,p.y-10,12,20);g.fillStyle='#f2f2ee';g.fillRect(p.x-4,p.y-7,8,6);}
  // semáforos e placas de rua
  for(let j=0;j<NH;j++)for(let i=0;i<NV;i++){
    const ox=VL[i].px, oy=HL[j].px;
    if(ox+200<vx0||ox-200>vx1||oy+200<vy0||oy-200>vy1)continue;
    if(!isJunction(i,j))continue;
    const hv=VL[i].w*T/2, hh=HL[j].w*T/2;
    g.fillStyle='#1f6b3a';g.fillRect(ox+hv+4,oy+hh+4,20,8);g.fillStyle='#ffffff';g.fillRect(ox+hv+6,oy+hh+7,16,1.5);
    if(!signalized(i,j)||mode!=='2d')continue;
    const sh=signalState(i,j,'h'), sv=signalState(i,j,'v');
    trafficLight(g,ox-hv-8,oy+hh+8,Math.PI,sh);   // quem vem do oeste
    trafficLight(g,ox+hv+8,oy-hh-8,0,sh);         // quem vem do leste
    trafficLight(g,ox-hv-8,oy-hh-8,-Math.PI/2,sv);// quem vem do norte
    trafficLight(g,ox+hv+8,oy+hh+8,Math.PI/2,sv); // quem vem do sul
  }
  // blitz (tapete de pregos sempre; cones e cancela só no 2D, no 3D são modelos)
  for(const cp of checkpoints){if(cp.x<vx0-200||cp.x>vx1+200||cp.y<vy0-200||cp.y>vy1+200)continue;drawCheckpoint(g,cp,mode);}
  // orelhões
  for(const ph of phones){if(ph.x<vx0||ph.x>vx1||ph.y<vy0||ph.y>vy1)continue;
    const ring=!S.mission&&S.phoneCd<=0;
    if(ring){const r=18+Math.sin(S.gameTime*8)*4;g.strokeStyle='rgba(255,220,60,0.8)';g.lineWidth=2;g.beginPath();g.arc(ph.x,ph.y,r,0,Math.PI*2);g.stroke();}
    g.fillStyle='rgba(0,0,0,0.3)';g.beginPath();g.arc(ph.x+3,ph.y+3,10,0,Math.PI*2);g.fill();
    g.fillStyle='#f2a900';g.beginPath();g.arc(ph.x,ph.y,10,0,Math.PI*2);g.fill();g.fillStyle='#ffd04a';g.beginPath();g.arc(ph.x-2,ph.y-2,6,0,Math.PI*2);g.fill();
    g.fillStyle='#3a3a3a';g.fillRect(ph.x-2,ph.y+4,4,6);}
  // pontos de ônibus
  for(const s of BUS_STOPS){const px=s.x+s.side.x*s.off, py=s.y+s.side.y*s.off;if(px<vx0||px>vx1||py<vy0||py>vy1)continue;
    g.fillStyle='rgba(0,0,0,0.3)';g.fillRect(px-13,py-6,28,14);g.fillStyle='#1565c0';g.fillRect(px-14,py-8,28,14);
    g.fillStyle='#ffffff';g.font='bold 8px monospace';g.textAlign='center';g.fillText('BUS',px,py+2);}
  for(const sp of jobSpots()){if(!sp.terminal&&!sp.ponto)continue;if(sp.x<vx0||sp.x>vx1||sp.y<vy0||sp.y>vy1)continue;
    label(g,sp.terminal?'TERMINAL DE ÔNIBUS':'PONTO DE TÁXI',sp.x,sp.y-60,sp.terminal?'#90caf9':'#ffe14a',14);}
  // portas dos prédios que dá pra entrar
  const nearB=(!player.car&&player.state==='play')?nearestDoor(40):null;
  for(const b of enterables()){const d=doorOf(b);if(d.x<vx0||d.x>vx1||d.y<vy0||d.y>vy1)continue;
    const on=b===nearB, ic=ICONS[KIND_ICON[b.kind]];
    // no 3D a porta é de verdade (build.js) e o ícone flutua em cima dela (r3d.js): no chão só um brilho quando chega perto
    if(mode==='3d'){if(on){const gr=g.createRadialGradient(d.x,d.y,2,d.x,d.y,26);gr.addColorStop(0,'rgba(255,233,160,0.55)');gr.addColorStop(1,'rgba(255,233,160,0)');
      g.fillStyle=gr;g.beginPath();g.arc(d.x,d.y,26,0,Math.PI*2);g.fill();}continue;}
    // toldo colorido na fachada + tapete na calçada: dá pra achar a entrada de longe
    if(d.out){const ox=d.out[0],oy=d.out[1],ex=d.x-ox*T*0.5,ey=d.y-oy*T*0.5,w=T*1.6,th=10;
      g.fillStyle='rgba(0,0,0,0.3)';if(ox===0)g.fillRect(ex-w/2+3,ey-th/2+3,w,th);else g.fillRect(ex-th/2+3,ey-w/2+3,th,w);
      for(let k=0;k<4;k++){g.fillStyle=k%2?'#ffffff':ic.bg;if(ox===0)g.fillRect(ex-w/2+k*w/4,ey-th/2,w/4,th);else g.fillRect(ex-th/2,ey-w/2+k*w/4,th,w/4);}}
    const pulse=on?0:Math.sin(S.gameTime*3+b.x0)*2;
    g.fillStyle=on?'rgba(255,233,160,0.6)':'rgba(255,233,160,0.3)';g.beginPath();g.arc(d.x,d.y,(on?20:17)+pulse,0,Math.PI*2);g.fill();
    drawIcon(g,KIND_ICON[b.kind],d.x,d.y,on?22:18);}
  if(nearB&&mode==='2d'){const d=doorOf(nearB);const name=ICONS[KIND_ICON[nearB.kind]].name.split(' (')[0].split(' ·')[0];g.font=pf(13);drawKeycap(g,'F',d.x-(g.measureText('Entrar: '+name).width+30)/2,d.y-30,'Entrar: '+name,13);}
  // marcador do alvo
  const tgt=S.mission?S.mission.def.target(S.mission):(S.job?S.job.target:(tutorialTarget()||S.waypoint));
  if(tgt&&!(tgt instanceof Car)&&!(tgt instanceof Ped)){const r=26+Math.sin(S.gameTime*5)*5;g.strokeStyle='#ffe14a';g.lineWidth=4;g.beginPath();g.arc(tgt.x,tgt.y,r,0,Math.PI*2);g.stroke();g.fillStyle='rgba(255,225,74,0.25)';g.fill();}
  return {tgt,nearB};
}
export function render(){
  const g=ctx;
  g.setTransform(DPR,0,0,DPR,0,0);g.fillStyle='#1f5f8b';g.fillRect(0,0,CW,CH);
  const sx=(Math.random()-.5)*S.shake,sy=(Math.random()-.5)*S.shake;
  const setCam=()=>g.setTransform(DPR*cam.zoom,0,0,DPR*cam.zoom,DPR*(CW/2+sx)-cam.x*DPR*cam.zoom,DPR*(CH/2+sy)-cam.y*DPR*cam.zoom);
  setCam();
  NIGHT=darkness(); BR=1-NIGHT*0.5;
  const hw=CW/2/cam.zoom, hh=CH/2/cam.zoom;
  const vx0=cam.x-hw-40,vx1=cam.x+hw+40,vy0=cam.y-hh-40,vy1=cam.y+hh+40;
  // chão
  const c0x=Math.max(0,Math.floor(vx0/CPX)),c1x=Math.min(Math.ceil(W/CHUNK)-1,Math.floor(vx1/CPX));
  const c0y=Math.max(0,Math.floor(vy0/CPX)),c1y=Math.min(Math.ceil(H/CHUNK)-1,Math.floor(vy1/CPX));
  for(let cy=c0y;cy<=c1y;cy++)for(let cx=c0x;cx<=c1x;cx++)g.drawImage(getChunk(cx,cy),cx*CPX,cy*CPX);
  // ondas animadas
  g.fillStyle='rgba(255,255,255,0.08)';
  for(let i=0;i<40;i++){const wx=Math.floor(vx0/64)*64+((i*137)%Math.max(64,(vx1-vx0)))+Math.sin(S.gameTime+i)*10;const wy=Math.floor(vy0/64)*64+((i*251)%Math.max(64,(vy1-vy0)));if(tileAt(wx,wy)===WATER)g.fillRect(wx,wy,14,2);}
  const {tgt,nearB}=drawGround2D(g,vx0,vx1,vy0,vy1,'2d');
  // pedestres
  for(const p of S.peds){if(p.state==='dead'||p.state==='gone'||p.state==='dead2')continue;if(p.x<vx0||p.x>vx1||p.y<vy0||p.y>vy1)continue;
    if(p.state==='down'){g.save();g.translate(p.x,p.y);g.fillStyle=p.shirt;g.fillRect(-7,-4,14,8);g.fillStyle=p.skin;g.beginPath();g.arc(8,0,3.5,0,Math.PI*2);g.fill();g.restore();continue;}
    drawPerson(g,p.x,p.y,p.a,p.shirt,p.skin,p.hair,p.anim,p.state!=='wait',1);
    if(p.state==='wait'){const yy=p.y-16+Math.sin(S.gameTime*6)*2;g.fillStyle='#ffe14a';g.beginPath();g.moveTo(p.x,yy+6);g.lineTo(p.x-5,yy-2);g.lineTo(p.x+5,yy-2);g.fill();}}
  // jogador a pé
  if(!player.car&&player.state==='play'){if(!(player.inv>0&&Math.floor(S.gameTime*10)%2))drawPerson(g,player.x,player.y,player.a,'#ff7a1a','#c68642','#111',player.anim/10,(keys['KeyW']||keys['KeyS']||keys['KeyA']||keys['KeyD']||keys['ArrowUp']||keys['ArrowDown']||keys['ArrowLeft']||keys['ArrowRight']),1.15);
    const nc=nearestCar(26);if(nc&&(!nearB||Math.hypot(nc.x-player.x,nc.y-player.y)-nc.t.wid/2<Math.hypot(doorOf(nearB).x-player.x,doorOf(nearB).y-player.y))){g.font=pf(12);const t=(nc.driver==='ai'?'Roubar ':'Entrar: ')+nc.t.name;drawKeycap(g,'F',nc.x-(g.measureText(t).width+28)/2,nc.y-nc.t.wid-14,t,12);}}
  // carros
  for(const c of S.cars){if(c.x<vx0-60||c.x>vx1+60||c.y<vy0-60||c.y>vy1+60)continue;drawCar(g,c);
    if(S.mission&&c.mission===S.mission&&!c.wreck&&c.maxHp){const f=clamp(c.health/c.maxHp,0,1);g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(c.x-21,c.y-44,42,7);g.fillStyle=f>0.4?'#4cff6a':'#ff5030';g.fillRect(c.x-20,c.y-43,40*f,5);}
    if(S.mission&&c.mission===S.mission&&!c.wreck){const yy=c.y-28+Math.sin(S.gameTime*6)*3;g.fillStyle='#ffe14a';g.beginPath();g.moveTo(c.x,yy+8);g.lineTo(c.x-7,yy-3);g.lineTo(c.x+7,yy-3);g.fill();}}
  // noite: escuridão com pontos de luz, depois brilhos
  const view={vx0,vx1,vy0,vy1};
  drawLighting(view); setCam(); drawGlows(g,view);
  // prédios e árvores ordenados por distância à câmera
  const camH=420/Math.min(1.2,cam.zoom);
  const vis=[];
  for(const b of buildings){if(b.x1<vx0-200||b.x0>vx1+200||b.y1<vy0-200||b.y0>vy1+200)continue;const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;vis.push({d:hyp(cx-cam.x,cy-cam.y),b});}
  for(const t of trees){if(t.x<vx0-40||t.x>vx1+40||t.y<vy0-40||t.y>vy1+40)continue;vis.push({d:hyp(t.x-cam.x,t.y-cam.y),t});}
  vis.sort((a,b)=>b.d-a.d);
  for(const v of vis){if(v.b)drawBuilding(g,v.b,camH);else drawTree(g,v.t,camH);}
  // partículas
  for(const p of S.parts){if(p.x<vx0||p.x>vx1||p.y<vy0||p.y>vy1)continue;const a=clamp(p.life/p.max,0,1);g.fillStyle=p.col+(p.fire?a:a*0.5)+')';
    g.beginPath();g.arc(p.x,p.y,p.size*(p.fire?a+0.3:1),0,Math.PI*2);g.fill();}
  // rastros de bala
  g.globalCompositeOperation='lighter';g.lineWidth=2;
  for(const t of S.tracers){g.strokeStyle='rgba('+t.col+','+clamp(t.life/t.max,0,1)+')';g.beginPath();g.moveTo(t.x1,t.y1);g.lineTo(t.x2,t.y2);g.stroke();}
  g.globalCompositeOperation='source-over';
  for(const f of S.floaters){g.globalAlpha=clamp(f.life,0,1);label(g,f.t,f.x,f.y,f.col,15);}g.globalAlpha=1;

  drawHUD(g,tgt);
}
