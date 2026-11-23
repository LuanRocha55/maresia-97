// Telas por cima do jogo: mapa em tela cheia (M) como guia de ruas de papel, e menu dos comércios
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { clamp, fmtMoney } from '../core/utils.js';
import { T, W, buildings, phones } from '../world/map.js';
import { mini } from '../world/chunks.js';
import { DISTRICTS } from '../world/districts.js';
import { ZONE_LABELS } from '../world/zoning.js';
import { paperLockMask, checkpoints, nextDistrict, isOpenZone, metaOf } from '../game/blitz.js';
import { jobSpots } from '../game/jobs.js';
import { isDisabled, whyOf, priceLabel } from '../game/interiors.js';
import { drawIcon, ICONS, KIND_ICON } from './icons.js';
import { S, player } from '../core/state.js';
import { C97, pf, lf, ptxt, bevel, impact, wrap } from './style97.js';

// ---------------- MAPA: guia de ruas de 1997 ----------------
// As cores do minimapa viram papel e tinta; avenidas ficam amarelas como nos guias de banca.
const PAPER={'70,70,78':[251,246,232],'112,112,125':[255,226,140],'88,88,98':[255,240,200],'150,150,145':[232,218,182],'120,110,100':[212,190,146],
  '31,80,120':[150,192,200],'214,196,140':[238,224,178],'80,140,60':[190,202,146],'90,90,98':[222,208,170],'150,115,80':[216,192,148],'50,110,45':[170,190,132],
  '80,190,240':[150,192,200],'255,154,60':[236,190,140],'255,74,60':[230,160,140],'255,216,60':[240,214,130],'60,255,154':[170,214,176]};
const ROADS=new Set(['70,70,78','112,112,125','88,88,98']);
let paperCanvas=null;
function paperMap(){
  if(paperCanvas)return paperCanvas;
  const m=mini,w=m.width,h=m.height,d=m.getContext('2d').getImageData(0,0,w,h),px=d.data,road=new Uint8Array(w*h);
  for(let i=0;i<px.length;i+=4){const k=px[i]+','+px[i+1]+','+px[i+2];if(ROADS.has(k))road[i>>2]=1;const o=PAPER[k];if(o){px[i]=o[0];px[i+1]=o[1];px[i+2]=o[2];}}
  const t=document.createElement('canvas');t.width=w;t.height=h;t.getContext('2d').putImageData(d,0,0);
  const K=4,c=document.createElement('canvas');c.width=w*K;c.height=h*K;const g=c.getContext('2d');
  g.imageSmoothingEnabled=false;g.drawImage(t,0,0,w*K,h*K);
  g.fillStyle='rgba(60,46,28,0.7)'; // contorno de tinta entre rua e quadra
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const r=road[y*w+x];
    if(x<w-1&&road[y*w+x+1]!==r)g.fillRect((x+1)*K-1,y*K,2,K);
    if(y<h-1&&road[(y+1)*w+x]!==r)g.fillRect(x*K,(y+1)*K-1,K,2);}
  paperCanvas=c;return c;
}
const COLS='ABCDEFGH';
const cellOf=(x,y)=>COLS[clamp(Math.floor(x/T/W*8),0,7)]+(clamp(Math.floor(y/T/W*8),0,7)+1);
// lugar mais perto do jogador de cada tipo (pro índice)
function nearestOf(kind){let best=null,bd=1e18;for(const b of buildings){if(KIND_ICON[b.kind]!==kind)continue;const x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2,d=(x-player.x)**2+(y-player.y)**2;if(d<bd){bd=d;best={x,y};}}return best;}

export function drawBigMap(){
  const g=ctx; g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle='rgba(6,6,10,0.85)';g.fillRect(0,0,CW,CH);
  // folha de papel
  const m=12,px0=m,py0=m,pw=CW-2*m,ph=CH-2*m;
  const pg=g.createLinearGradient(0,py0,0,py0+ph);pg.addColorStop(0,'#f1e7cc');pg.addColorStop(1,'#e2d2ab');
  g.fillStyle='rgba(0,0,0,0.5)';g.fillRect(px0+5,py0+5,pw,ph);g.fillStyle=pg;g.fillRect(px0,py0,pw,ph);
  g.fillStyle='rgba(80,60,30,0.16)';g.fillRect(px0+pw/2-1,py0,2,ph); // dobra
  g.fillStyle='rgba(255,255,255,0.18)';g.fillRect(px0+pw/2+1,py0,3,ph);
  const top=Math.round(clamp(CH*0.1,52,74));
  const legendW=Math.min(340,CW*0.3);
  const size=Math.max(200,Math.min(pw-legendW-90,ph-top-30));
  const ox=px0+46, oy=py0+top+8, sc=size/W;
  S.mapRect={ox,oy,size,sc};
  const toS=(wx,wy)=>[ox+wx/T*sc, oy+wy/T*sc];
  // título
  g.font=lf(Math.round(clamp(CW/34,22,38)));g.textAlign='left';g.fillStyle=C97.tinta;g.fillText('GUIA DE RUAS · GUANABARA',px0+28,py0+top*0.62);
  const tw=g.measureText('GUIA DE RUAS · GUANABARA').width;
  ptxt(g,'EDIÇÃO 1997 · ESCALA 1:8.000',px0+40+tw,py0+top*0.62,13,C97.tinta,'left',false);
  // mapa
  g.imageSmoothingEnabled=true;g.drawImage(paperMap(),ox,oy,size,size);g.drawImage(paperLockMask(),ox,oy,size,size);
  g.strokeStyle=C97.tinta;g.lineWidth=2;g.strokeRect(ox,oy,size,size);
  // grade A-H x 1-8
  g.strokeStyle='rgba(42,34,22,0.32)';g.lineWidth=1;
  for(let i=1;i<8;i++){const v=i*size/8;g.beginPath();g.moveTo(ox+v,oy);g.lineTo(ox+v,oy+size);g.moveTo(ox,oy+v);g.lineTo(ox+size,oy+v);g.stroke();}
  for(let i=0;i<8;i++){ptxt(g,COLS[i],ox+(i+0.5)*size/8,oy-6,13,C97.tinta,'center',false);ptxt(g,String(i+1),ox-14,oy+(i+0.5)*size/8+5,13,C97.tinta,'center',false);}
  // ícones
  const isz=Math.round(clamp(size/42,12,22));
  for(const b of buildings){const k=KIND_ICON[b.kind];if(!k)continue;const p=toS((b.x0+b.x1)/2,(b.y0+b.y1)/2);drawIcon(g,k,p[0],p[1],isz);}
  for(const sp of jobSpots()){if(!sp.terminal&&!sp.ponto)continue;const p=toS(sp.x,sp.y);drawIcon(g,sp.terminal?'terminal':'taxi',p[0],p[1],isz);}
  const ringing=!S.mission&&!S.job&&S.phoneCd<=0;
  for(const ph of phones){const p=toS(ph.x,ph.y);g.globalAlpha=ringing?1:0.45;drawIcon(g,'phone',p[0],p[1],isz*0.85);g.globalAlpha=1;}
  // nomes dos bairros (tinta) e carimbos de BLITZ nos fechados
  const nd=nextDistrict();const fs=Math.round(clamp(size/44,11,16));
  for(const [k,[tx,ty]] of Object.entries(ZONE_LABELS)){const p=toS(tx*T,ty*T);const name=DISTRICTS[k].name.toUpperCase();
    g.font=pf(fs);g.textAlign='center';g.lineWidth=4;g.strokeStyle='rgba(241,231,204,0.95)';g.lineJoin='round';g.strokeText(name,p[0],p[1]);g.fillStyle=C97.tinta;g.fillText(name,p[0],p[1]);
    if(!isOpenZone(k)){const mt=metaOf(k);const next=nd&&nd.z===k;stamp(g,p[0],p[1]+fs*1.9,next?'faltam '+fmtMoney(Math.max(0,mt-Math.floor(player.money))):'meta '+fmtMoney(mt),fs,((tx*7+ty*3)%17-8)*0.02);}}
  // blitz nas ruas que entram nos bairros fechados
  for(const cp of checkpoints){const p=toS(cp.x,cp.y);blitzMark(g,p[0],p[1],Math.max(5,isz*0.36));}
  // polícia
  for(const c of S.cars){if(c.ai!=='police')continue;const p=toS(c.x,c.y);copMark(g,p[0],p[1]);}
  // alvo e marcador
  const tgt=S.mission?S.mission.def.target(S.mission):(S.job?S.job.target:null);
  if(tgt){const p=toS(tgt.x,tgt.y);targetMark(g,p[0],p[1],9+Math.sin(S.gameTime*6)*3);}
  if(S.waypoint){const p=toS(S.waypoint.x,S.waypoint.y);drawIcon(g,'waypoint',p[0],p[1]-isz*0.4,isz*1.1);}
  // você: seta com círculo de caneta vermelha
  {const p=toS(player.x,player.y);youMark(g,p[0],p[1],player.a,1,17+Math.sin(S.gameTime*5)*2);}
  // índice e legenda (coluna da direita). Cada linha tem na frente o mesmo símbolo que aparece no mapa.
  const lx=ox+size+40,lw=px0+pw-lx-24;let ly=oy+4;
  const rowF=Math.round(clamp(size/46,11,14)),step=Math.round(rowF*1.6),gw=Math.round(rowF*1.9),ssz=Math.round(rowF*1.25);
  const row=(left,right,hi,sym)=>{g.font=pf(rowF);if(hi){g.fillStyle=C97.orelhao;g.fillRect(lx-4,ly-rowF*1.1,lw+8,step);}
    if(sym)sym(lx+gw/2-3,ly-rowF*0.38,ssz);
    const tx=lx+gw;ptxt(g,left,tx,ly,rowF,C97.tinta,'left',false);ptxt(g,right,lx+lw,ly,rowF,C97.tinta,'right',false);
    g.font=pf(rowF);const a=tx+g.measureText(left).width+6,b=lx+lw-g.measureText(right).width-6;
    g.fillStyle='rgba(42,34,22,0.5)';for(let x=a;x<b;x+=5)g.fillRect(x,ly-2,2,2);ly+=step;};
  const head=t=>{g.font=lf(Math.round(rowF*1.5));g.textAlign='left';g.fillStyle=C97.tinta;g.fillText(t,lx,ly+rowF*0.6);ly+=Math.round(rowF*2.3);};
  const icon=k=>(x,y,s)=>drawIcon(g,k,x,y,s);
  head('ÍNDICE');
  row('Você',cellOf(player.x,player.y),true,(x,y,s)=>youMark(g,x,y,0,s/22,s*0.72));
  const order=['casa','hospital','farmacia','policia','pintura','armas','ze','posto','lanchonete','mercadinho','padaria','escola','estadio'];
  for(const k of order){const n=nearestOf(k);if(!n)continue;row(ICONS[k].name.split(' (')[0].split(' ·')[0],cellOf(n.x,n.y),false,icon(k));}
  for(const k of ['terminal','taxi']){const n=nearestSpot(k);if(n)row(ICONS[k].name,cellOf(n.x,n.y),false,icon(k));}
  if(tgt)row('Objetivo',cellOf(tgt.x,tgt.y),false,(x,y,s)=>targetMark(g,x,y,s*0.32));
  ly+=step*0.4;head('LEGENDA');
  row('Pode entrar','liberado',false,(x,y,s)=>swatch(g,x,y,s,false));
  row('Fechado (blitz)','não entra',false,(x,y,s)=>swatch(g,x,y,s,true));
  row('Posto de blitz','na rua',false,(x,y,s)=>blitzMark(g,x,y,s*0.4));
  row('Orelhão','tocando = missão',false,icon('phone'));
  row('Viatura','piscando',false,(x,y)=>copMark(g,x,y));
  row('Objetivo','missão ou bico',false,(x,y,s)=>targetMark(g,x,y,s*0.32));
  row('Seu marcador','clique no mapa',false,icon('waypoint'));
  ly+=step*0.4;
  row('Clique','marca destino');row('Clique direito','apaga');row('M ou Esc','fecha');
}
// símbolos desenhados no mapa e repetidos no índice/legenda
function youMark(g,x,y,a,k,r){g.save();g.translate(x,y);g.rotate(a);g.scale(k,k);g.fillStyle='#ffffff';g.strokeStyle='#000';g.lineWidth=2;
  g.beginPath();g.moveTo(11,0);g.lineTo(-7,-7);g.lineTo(-3,0);g.lineTo(-7,7);g.closePath();g.fill();g.stroke();g.restore();
  g.strokeStyle=C97.carimbo;g.lineWidth=k<1?1.8:2.5;g.beginPath();g.ellipse(x,y,r,r*0.88,-0.3,0,Math.PI*2);g.stroke();}
function targetMark(g,x,y,r){g.strokeStyle=C97.carimbo;g.lineWidth=Math.max(1.5,r*0.3);g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.stroke();
  g.beginPath();g.arc(x,y,r+r*0.55,0,Math.PI*2);g.lineWidth=Math.max(1,r*0.15);g.stroke();}
function blitzMark(g,x,y,s){g.fillStyle=C97.carimbo;g.strokeStyle='#fff';g.lineWidth=1.5;
  g.beginPath();g.moveTo(x,y-s);g.lineTo(x+s,y+s*0.8);g.lineTo(x-s,y+s*0.8);g.closePath();g.fill();g.stroke();}
function copMark(g,x,y){g.fillStyle=Math.floor(S.gameTime*6)%2?'#e0281e':'#2a52d8';g.fillRect(x-4,y-4,8,8);g.strokeStyle=C97.tinta;g.lineWidth=1;g.strokeRect(x-4,y-4,8,8);}
// ponto de ônibus/táxi mais perto do jogador
function nearestSpot(k){let best=null,bd=1e18;for(const sp of jobSpots()){if(k==='terminal'?!sp.terminal:!sp.ponto)continue;const d=(sp.x-player.x)**2+(sp.y-player.y)**2;if(d<bd){bd=d;best=sp;}}return best;}
function swatch(g,x,y,s,locked){const w=s*1.3,h=s*0.75,xx=x-w/2,yy=y-h/2;g.fillStyle=locked?'rgba(190,40,26,0.45)':'#fbf6e8';g.fillRect(xx,yy,w,h);
  if(locked){g.fillStyle='rgba(176,22,12,0.95)';g.fillRect(xx,yy,w,2);g.fillRect(xx,yy+h-2,w,2);g.fillRect(xx,yy,2,h);g.fillRect(xx+w-2,yy,2,h);}else{g.strokeStyle=C97.tinta;g.lineWidth=1;g.strokeRect(xx+0.5,yy+0.5,w-1,h-1);}}
function stamp(g,x,y,sub,fs,rot){
  g.save();g.translate(x,y);g.rotate(rot-0.12);g.globalAlpha=0.82;
  g.font=lf(Math.round(fs*1.5));g.textAlign='center';const w1=g.measureText('BLITZ').width;
  g.font=pf(fs*0.85);const w2=g.measureText(sub).width;const w=Math.max(w1,w2)+14,h=fs*2.9;
  g.strokeStyle=C97.carimbo;g.lineWidth=2.5;g.strokeRect(-w/2,-h/2,w,h);g.lineWidth=1;g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);
  g.fillStyle=C97.carimbo;g.font=lf(Math.round(fs*1.5));g.fillText('BLITZ',0,fs*0.25);g.font=pf(fs*0.85);g.fillText(sub,0,h/2-6);
  g.restore();
}
export function mapClick(x,y,button){
  const r=S.mapRect;if(!r)return;
  if(x<r.ox||y<r.oy||x>r.ox+r.size||y>r.oy+r.size)return;
  if(button===2){S.waypoint=null;return;}
  S.waypoint={x:(x-r.ox)/r.sc*T,y:(y-r.oy)/r.sc*T};
}

// ---------------- MENU DOS COMÉRCIOS: tabela de preço ----------------
export function drawMenu(){
  const m=S.menu;if(!m)return;
  const g=ctx; g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(0,0,CW,CH);
  const n=m.items.length+1, rowH=40, w=Math.min(620,CW-40), h=128+n*rowH+44;
  const x=(CW-w)/2, y=Math.max(20,(CH-h)/2);
  bevel(g,x,y,w,h,'#101013',true,3);
  const ik=KIND_ICON[m.kind]; if(ik)drawIcon(g,ik,x+44,y+50,44);
  impact(g,m.title.toUpperCase(),x+82,y+56,Math.round(clamp(w/18,22,34)),C97.orelhao,'left');
  ptxt(g,m.sub,x+82,y+80,13,C97.cinza,'left',false);
  g.fillStyle=C97.orelhao;g.fillRect(x+20,y+96,w-40,4);
  ptxt(g,'Vida '+Math.round(player.health)+(player.armor>0?' · Colete '+Math.round(player.armor):''),x+w-24,y+80,12,'#ff9a9a','right',false);
  m.rects=[];
  for(let i=0;i<n;i++){
    const it=m.items[i], ry=y+112+i*rowH, sel=m.sel===i;
    const dis=it?isDisabled(it):false;
    m.rects.push({x:x+20,y:ry,w:w-40,h:rowH-4,i});
    if(sel){g.fillStyle=C97.orelhao;g.fillRect(x+20,ry,w-40,rowH-4);}
    const ink=sel?'#111':dis?'#5d5b57':C97.cal, by=ry+rowH/2+5;
    const key=it?String(i+1):'ESC', label=it?it.label:'Sair', price=it?(dis?(whyOf(it)||'—'):(it.tag||priceLabel(it))):'';
    ptxt(g,key,x+34,by,16,sel?'#111':C97.sodio,'left',false);
    ptxt(g,label,x+34+38,by,16,ink,'left',false);
    ptxt(g,price,x+w-34,by,16,sel?'#111':dis?'#8a5a50':C97.grana,'right',false);
    g.font=pf(16);const a=x+34+38+g.measureText(label).width+8,b=x+w-34-g.measureText(price).width-8;
    g.fillStyle=sel?'rgba(0,0,0,0.55)':'rgba(236,232,223,0.25)';for(let xx=a;xx<b;xx+=6)g.fillRect(xx,by-3,2,2);
  }
  const fy=y+h-18;
  ptxt(g,'Tu tem ',x+24,fy,13,C97.cinza,'left',false);g.font=pf(13);ptxt(g,fmtMoney(player.money),x+24+g.measureText('Tu tem ').width,fy,13,C97.grana,'left',false);
  ptxt(g,'W/S ou mouse · ENTER compra · 1-9 atalho · ESC sai',x+w-24,fy,12,C97.cinza,'right',false);
}
