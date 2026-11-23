// Renderização do chão em blocos (cache) e minimapa
import { mulberry, shade } from '../core/utils.js';
import { DISTRICTS, districtOfTile, signalized } from './districts.js';
import { T, W, H, WATER, SAND, ROAD, SIDE, GRASS, BUILD, TREE, PARK, POOL, DIRT, map, zones, decor,
  VL, HL, NV, NH, segH, segV, degree, isJunction } from './map.js';

export const CHUNK=16, CPX=CHUNK*T;
export const chunkCache=new Map();
export const TILE_COL={[WATER]:'#1f5f8b',[SAND]:'#e3cf98',[ROAD]:'#3b3b42',[SIDE]:'#a9a7a0',[GRASS]:'#5f9e4a',[BUILD]:'#2a2a2e',[TREE]:'#4f8e3e',[PARK]:'#4a4a52',[POOL]:'#4fc3f7',[DIRT]:'#a07a52'};

// tipo de rua de cada tile: 0 nada, 1 beco, 2 rua, 3 avenida
const RT=new Uint8Array(W*H);
const TYPE_N={beco:1,rua:2,ave:3};
(function(){
  const mark=(x0,y0,w,h,n)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)if(x>=0&&y>=0&&x<W&&y<H&&RT[y*W+x]<n)RT[y*W+x]=n;};
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i]){const L=HL[j];mark(Math.round(VL[i].c),Math.round(L.c-L.w/2),Math.round(VL[i+1].c-VL[i].c),L.w,TYPE_N[L.type]);}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j]){const L=VL[i];mark(Math.round(L.c-L.w/2),Math.round(HL[j].c),L.w,Math.round(HL[j+1].c-HL[j].c),TYPE_N[L.type]);}
})();

// seeThrough: no 3D a água fica transparente (o mar 3D com ondas aparece por baixo)
export function renderChunk(cx,cy,seeThrough){
  const c=document.createElement('canvas');c.width=CPX;c.height=CPX;const g=c.getContext('2d');
  const r=mulberry(cx*7919+cy*104729);
  for(let ty=0;ty<CHUNK;ty++)for(let tx=0;tx<CHUNK;tx++){
    const X=cx*CHUNK+tx, Y=cy*CHUNK+ty; if(X>=W||Y>=H)continue;
    const t=map[Y*W+X]; const px=tx*T, py=ty*T;
    const D=DISTRICTS[districtOfTile(X,Y)];
    if(t===WATER&&seeThrough)continue;
    g.fillStyle=TILE_COL[t]; g.fillRect(px,py,T,T);
    if(t===WATER){g.fillStyle='rgba(255,255,255,0.06)';for(let i=0;i<3;i++)g.fillRect(px+r()*28,py+r()*30,6,1);}
    else if(t===SAND){g.fillStyle='rgba(150,120,60,0.18)';for(let i=0;i<5;i++)g.fillRect(px+r()*30,py+r()*30,2,2);}
    else if(t===TREE&&(tileOf(X-1,Y)===SAND||tileOf(X+1,Y)===SAND||tileOf(X,Y-1)===SAND||tileOf(X,Y+1)===SAND)){g.fillStyle=TILE_COL[SAND];g.fillRect(px,py,T,T);}
    else if(t===GRASS||t===TREE){g.fillStyle='rgba(30,70,20,0.25)';for(let i=0;i<6;i++)g.fillRect(px+r()*30,py+r()*30,2,3);}
    else if(t===DIRT){g.fillStyle='rgba(60,40,20,0.25)';for(let i=0;i<6;i++)g.fillRect(px+r()*30,py+r()*30,3,2);}
    else if(t===POOL){g.fillStyle='rgba(255,255,255,0.25)';g.fillRect(px+r()*20,py+r()*24,10,2);g.strokeStyle='#e0f7fa';g.lineWidth=2;
      if(tileOf(X-1,Y)!==POOL)g.fillRect(px,py,3,T);if(tileOf(X+1,Y)!==POOL)g.fillRect(px+T-3,py,3,T);if(tileOf(X,Y-1)!==POOL)g.fillRect(px,py,T,3);if(tileOf(X,Y+1)!==POOL)g.fillRect(px,py+T-3,T,3);}
    else if(t===SIDE){drawSidewalk(g,px,py,X,Y,D,r);}
    else if(t===PARK){g.fillStyle='rgba(255,255,255,0.35)';if(X%3===0)g.fillRect(px,py+4,2,24);}
    else if(t===ROAD){drawRoadTile(g,px,py,X,Y,D,r);}
  }
  g.save(); g.translate(-cx*CPX,-cy*CPX);
  const bx0=cx*CPX, by0=cy*CPX, bx1=bx0+CPX, by1=by0+CPX;
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++){if(!segH[j][i])continue;
    const L=HL[j],a0=VL[i].px,a1=VL[i+1].px,p=L.px;
    if(a1<bx0-200||a0>bx1+200||p<by0-200||p>by1+200)continue;
    markSegment(g,true,L,a0,a1,VL[i],VL[i+1],[i,j],[i+1,j]);}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++){if(!segV[i][j])continue;
    const L=VL[i],a0=HL[j].px,a1=HL[j+1].px,p=L.px;
    if(a1<by0-200||a0>by1+200||p<bx0-200||p>bx1+200)continue;
    markSegment(g,false,L,a0,a1,HL[j],HL[j+1],[i,j],[i,j+1]);}
  // gramado do estádio
  for(const d of decor){if(d.type!=='estadio-campo')continue;if(d.x1<bx0||d.x0>bx1||d.y1<by0||d.y0>by1)continue;
    const w=d.x1-d.x0,h=d.y1-d.y0,vert=h>w;
    for(let k=0;k<12;k++){g.fillStyle=k%2?'#4caf50':'#43a047';if(vert)g.fillRect(d.x0,d.y0+k*h/12,w,h/12);else g.fillRect(d.x0+k*w/12,d.y0,w/12,h);}
    const m=24;g.strokeStyle='rgba(255,255,255,0.9)';g.lineWidth=3;g.strokeRect(d.x0+m,d.y0+m,w-2*m,h-2*m);
    const cx=(d.x0+d.x1)/2,cy=(d.y0+d.y1)/2;
    g.beginPath();if(vert){g.moveTo(d.x0+m,cy);g.lineTo(d.x1-m,cy);}else{g.moveTo(cx,d.y0+m);g.lineTo(cx,d.y1-m);}g.stroke();
    g.beginPath();g.arc(cx,cy,Math.min(w,h)*0.12,0,Math.PI*2);g.stroke();
    const pw=Math.min(w,h)*0.45,pd=Math.min(w,h)*0.16;
    if(vert){g.strokeRect(cx-pw/2,d.y0+m,pw,pd);g.strokeRect(cx-pw/2,d.y1-m-pd,pw,pd);g.fillStyle='#ffffff';g.fillRect(cx-30,d.y0+m-8,60,6);g.fillRect(cx-30,d.y1-m+2,60,6);}
    else{g.strokeRect(d.x0+m,cy-pw/2,pd,pw);g.strokeRect(d.x1-m-pd,cy-pw/2,pd,pw);g.fillStyle='#ffffff';g.fillRect(d.x0+m-8,cy-30,6,60);g.fillRect(d.x1-m+2,cy-30,6,60);}
  }
  // campinho de várzea
  for(const d of decor){if(d.type!=='campo')continue;if(d.x1<bx0||d.x0>bx1||d.y1<by0||d.y0>by1)continue;
    g.strokeStyle='rgba(255,255,255,0.7)';g.lineWidth=3;g.strokeRect(d.x0+6,d.y0+6,d.x1-d.x0-12,d.y1-d.y0-12);
    g.beginPath();g.moveTo((d.x0+d.x1)/2,d.y0+6);g.lineTo((d.x0+d.x1)/2,d.y1-6);g.stroke();
    g.beginPath();g.arc((d.x0+d.x1)/2,(d.y0+d.y1)/2,30,0,Math.PI*2);g.stroke();}
  g.restore();
  return c;
}

function drawRoadTile(g,px,py,X,Y,D,r){
  const rt=RT[Y*W+X];
  if(rt===3){g.fillStyle='#2a2a31';g.fillRect(px,py,T,T);g.fillStyle='rgba(255,255,255,0.03)';for(let i=0;i<3;i++)g.fillRect(px+r()*30,py+r()*30,2,1);return;}
  if(rt===1||D.cobble){ // paralelepípedo
    const base=rt===1?'#77695b':D.road;g.fillStyle=base;g.fillRect(px,py,T,T);
    for(let row=0;row<6;row++){const off=(row%2)*5;for(let col=-1;col<4;col++){
      const sx=px+off+col*10, sy=py+row*5.33;g.fillStyle=shade(base,0.85+r()*0.3);g.fillRect(sx+1,sy+1,8,4);}}
    return;}
  g.fillStyle=D.road;g.fillRect(px,py,T,T);
  g.fillStyle='rgba(0,0,0,0.08)';for(let i=0;i<4;i++)g.fillRect(px+r()*30,py+r()*30,3,2);
  if(D.worn){
    if(r()<0.10){g.fillStyle='rgba(120,120,125,0.35)';g.fillRect(px+r()*14,py+r()*14,10+r()*14,8+r()*12);}
    if(r()<0.04){g.fillStyle='rgba(15,15,18,0.7)';g.beginPath();g.ellipse(px+8+r()*16,py+8+r()*16,4+r()*3,3+r()*2,r()*3,0,Math.PI*2);g.fill();}
  }
}
function drawSidewalk(g,px,py,X,Y,D,r){
  g.fillStyle=D.side;g.fillRect(px,py,T,T);
  if(D.sideStyle==='lajes'){g.fillStyle='rgba(0,0,0,0.12)';g.fillRect(px,py+15,T,1);g.fillRect(px+15,py,1,T);g.fillRect(px,py,T,1);g.fillRect(px,py,1,T);}
  else if(D.sideStyle==='ondas'){
    g.save();g.beginPath();g.rect(px,py,T,T);g.clip();g.strokeStyle='#2c2c30';g.lineWidth=3.5;
    for(const base of[4,20]){g.beginPath();for(let xx=0;xx<=T;xx+=2){const wy=Y*T+base+Math.sin((X*T+xx)/9)*4;xx===0?g.moveTo(px+xx,wy-Y*T+py):g.lineTo(px+xx,wy-Y*T+py);}g.stroke();}
    g.restore();}
  else if(D.sideStyle==='tijolo'){g.fillStyle='rgba(60,20,15,0.35)';for(let row=0;row<8;row++){g.fillRect(px,py+row*4,T,1);const off=(row%2)*4;for(let col=0;col<5;col++)g.fillRect(px+off+col*8,py+row*4,1,4);}}
  else if(D.sideStyle==='rachado'){g.fillStyle='rgba(0,0,0,0.10)';g.fillRect(px,py+15,T,1);g.fillRect(px+15,py,1,T);
    if(r()<0.35){g.strokeStyle='rgba(40,40,40,0.4)';g.lineWidth=1;g.beginPath();let x=px+r()*T,y=py+r()*T;g.moveTo(x,y);for(let i=0;i<3;i++){x+=r()*12-6;y+=r()*12-6;g.lineTo(x,y);}g.stroke();}}
  else if(D.sideStyle==='grama'){g.fillStyle='rgba(0,0,0,0.10)';g.fillRect(px,py+15,T,1);g.fillRect(px+15,py,1,T);}
  else if(D.sideStyle==='caquinho'){ // piso de caquinho (cerâmica quebrada vermelha, com pedaços amarelos e pretos)
    g.fillStyle='#b49a86';g.fillRect(px,py,T,T);
    for(let k=0;k<12;k++){const q=r(),cx=px+r()*T,cy=py+r()*T,s=3.5+r()*4;
      g.fillStyle=q<0.7?'#9c4a36':q<0.86?'#a95640':q<0.95?'#c39a4e':'#3b3330';
      g.beginPath();g.moveTo(cx-s,cy-s*0.6);g.lineTo(cx+s*0.8,cy-s);g.lineTo(cx+s,cy+s*0.5);g.lineTo(cx-s*0.4,cy+s);g.closePath();g.fill();}}
  const grass=D.sideStyle==='grama'||D.sideStyle==='caquinho';
  const curb=(x,y,w,h)=>{g.fillStyle='#7d7b75';g.fillRect(x,y,w,h);};
  if(tileOf(X-1,Y)===ROAD){curb(px,py,3,T);if(grass){g.fillStyle='#5f9e4a';g.fillRect(px+3,py,5,T);}}
  if(tileOf(X+1,Y)===ROAD){curb(px+T-3,py,3,T);if(grass){g.fillStyle='#5f9e4a';g.fillRect(px+T-8,py,5,T);}}
  if(tileOf(X,Y-1)===ROAD){curb(px,py,T,3);if(grass){g.fillStyle='#5f9e4a';g.fillRect(px,py+3,T,5);}}
  if(tileOf(X,Y+1)===ROAD){curb(px,py+T-3,T,3);if(grass){g.fillStyle='#5f9e4a';g.fillRect(px,py+T-8,T,5);}}
}

// marcações de um trecho: horiz=true → anda em x; L = linha; A/B = linhas que cruzam nas pontas
function markSegment(g,horiz,L,a0,a1,A,B,nA,nB){
  const R=(a,p,w,h)=>horiz?g.fillRect(a,p,w,h):g.fillRect(p,a,h,w);
  const hw=L.w*T/2, p0=L.px-hw;
  const s0=a0+A.w*T/2, s1=a1-B.w*T/2; // trecho livre entre os cruzamentos
  if(s1-s0<20)return;
  const D=DISTRICTS[districtOfTile(((horiz?(s0+s1)/2:L.px)/T)|0,((horiz?L.px:(s0+s1)/2)/T)|0)];
  const jA=isJunction(nA[0],nA[1]), jB=isJunction(nB[0],nB[1]);
  if(L.type==='ave'){
    g.fillStyle='#e8c440';R(s0,L.px-4,s1-s0,2.5);R(s0,L.px+1.5,s1-s0,2.5);           // faixa dupla amarela
    g.fillStyle='rgba(240,240,240,0.8)';for(let a=s0+20;a<s1-30;a+=44){R(a,L.px-65,22,2.5);R(a,L.px+63,22,2.5);} // divisória de faixas
    g.fillStyle='rgba(240,240,240,0.9)';R(s0,p0+4,s1-s0,2);R(s0,p0+L.w*T-6,s1-s0,2);    // bordas
    const m=(s0+s1)/2;
    for(const k of[0,1]){arrow(g,horiz,m,L.px+(horiz?1:-1)*(32+64*k),horiz?1:1);arrow(g,horiz,m,L.px-(horiz?1:-1)*(32+64*k),-1);}
  } else if(L.type==='rua'){
    if(!D.cobble){g.fillStyle=D.worn?'rgba(232,196,64,0.55)':'#e8c440';for(let a=s0+18;a<s1-30;a+=40)R(a,L.px-1.5,22,3);}
    if(D.bumps&&((L.idx*7+(nA[0]+nA[1])*3)%3===0)){const m=(s0+s1)/2;for(let i=0;i<8;i++){g.fillStyle=i%2?'#1d1d1d':'#e8c440';R(m-6,p0+i*16,12,16);}}
  } else { // beco: seta de mão única
    g.fillStyle='rgba(240,240,240,0.7)';
    for(let a=s0+60;a<s1-40;a+=160)arrow(g,horiz,a,L.px,L.oneway);
  }
  // faixa de pedestre nas pontas que são cruzamento de verdade
  if(L.type!=='beco'){
    g.fillStyle=D.cobble?'rgba(240,240,240,0.55)':'rgba(240,240,240,0.75)';
    const n=Math.floor(L.w*T/16);
    for(let i=0;i<n;i++){if(jA)R(s0+2,p0+4+i*16,10,9);if(jB)R(s1-12,p0+4+i*16,10,9);}
  }
  // faixa de parada (semáforo) e PARE (beco saindo em rua)
  const plusSide=(horiz?1:-1); // lado da via de quem anda no sentido + (leste/sul)
  const half=L.type==='beco'?L.w*T:hw;
  const stop=(a,dirSign,sig,pare)=>{
    if(!sig&&!pare)return;
    const pStart=L.type==='beco'?p0:(dirSign*plusSide>0?L.px:p0);
    g.fillStyle='rgba(245,245,245,0.9)';R(a,pStart+2,5,half-4);
    if(pare){g.save();g.fillStyle='rgba(245,245,245,0.9)';g.font='bold 13px Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';
      const cx=horiz?a-dirSign*20:pStart+half/2, cy=horiz?pStart+half/2:a-dirSign*20;g.translate(cx,cy);
      g.rotate(horiz?(dirSign>0?Math.PI/2:-Math.PI/2):(dirSign>0?Math.PI:0));g.fillText('PARE',0,0);g.restore();}
  };
  const pareB=L.type==='beco'&&jB&&(L.oneway>0), pareA=L.type==='beco'&&jA&&(L.oneway<0);
  stop(s1-20,+1,signalized(nB[0],nB[1])&&L.type!=='beco',pareB);
  stop(s0+15,-1,signalized(nA[0],nA[1])&&L.type!=='beco',pareA);
}
function arrow(g,horiz,a,p,dir){
  g.save();if(horiz)g.translate(a,p);else g.translate(p,a);g.rotate(horiz?(dir>0?0:Math.PI):(dir>0?Math.PI/2:-Math.PI/2));
  g.fillRect(-18,-2.5,24,5);g.beginPath();g.moveTo(14,0);g.lineTo(4,-9);g.lineTo(4,9);g.closePath();g.fill();g.restore();
}
export function tileOf(x,y){if(x<0||y<0||x>=W||y>=H)return WATER;return map[y*W+x];}
export function getChunk(cx,cy){const k=cx+','+cy;let c=chunkCache.get(k);
  if(!c){c=renderChunk(cx,cy);chunkCache.set(k,c);if(chunkCache.size>80){const f=chunkCache.keys().next().value;chunkCache.delete(f);}}
  else{chunkCache.delete(k);chunkCache.set(k,c);} return c;}
// versão do 3D (água transparente); o 3D guarda a textura, então não precisa de cache aqui
export const getChunk3D=(cx,cy)=>renderChunk(cx,cy,true);
// distância de cada tile de água até a terra (0 = beira, 255 = 8+ tiles): água rasa e espuma no mar 3D
export function shoreField(){
  const D=8,dist=new Uint8Array(W*H).fill(D),q=[];
  for(let i=0;i<W*H;i++)if(map[i]!==WATER){dist[i]=0;q.push(i);}
  for(let h=0;h<q.length;h++){const i=q[h],x=i%W,y=(i/W)|0,nd=dist[i]+1;if(nd>=D)continue;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;if(dist[j]>nd){dist[j]=nd;q.push(j);}}}
  const out=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++){const v=Math.round(dist[i]/D*255);out[i*4]=v;out[i*4+1]=v;out[i*4+2]=v;out[i*4+3]=255;}
  return out;
}

// tipo de superfície de cada tile pro 3D realista (qual textura fotográfica entra por cima do desenho):
// 0 asfalto, 1 calçada, 2 paralelepípedo, 3 areia, 4 grama, 5 terra, 255 nenhuma (água, piscina).
// +8 = textura fraca (calçada com desenho próprio: ondas da orla, tijolo da Vila Velha)
export function surfaceMap(){
  const out=new Uint8Array(W*H).fill(255);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,t=map[i],D=DISTRICTS[districtOfTile(x,y)];
    let s=255;
    if(t===ROAD)s=RT[i]===1||D.cobble?2:0;
    else if(t===PARK)s=0;
    else if(t===SIDE||t===BUILD)s=D.sideStyle==='ondas'||D.sideStyle==='tijolo'||D.sideStyle==='caquinho'?9:1;
    else if(t===SAND)s=3;
    else if(t===GRASS)s=4;
    else if(t===TREE)s=tileOf(x-1,y)===SAND||tileOf(x+1,y)===SAND||tileOf(x,y-1)===SAND||tileOf(x,y+1)===SAND?3:4;
    else if(t===DIRT)s=5;
    out[i]=s;}
  return out;
}

// chão em baixa resolução do mapa inteiro (4 px por tile): fica por baixo no 3D enquanto o pedaço detalhado não carrega
export function makeLowres(seeThrough){
  const K=4,c=document.createElement('canvas');c.width=W*K;c.height=H*K;const g=c.getContext('2d');const img=g.createImageData(W*K,H*K);
  const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const pal={};for(const k in TILE_COL)pal[k]=rgb(TILE_COL[k]);const ave=rgb('#2f3036'),beco=rgb('#5d5852'),sand=pal[SAND];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,t=map[i];
    let col=pal[t];if(t===ROAD)col=RT[i]===3?ave:RT[i]===1?beco:col;else if(t===TREE&&(tileOf(x-1,y)===SAND||tileOf(x+1,y)===SAND))col=sand;
    for(let dy=0;dy<K;dy++)for(let dx=0;dx<K;dx++){const o=((y*K+dy)*W*K+x*K+dx)*4;img.data[o]=col[0];img.data[o+1]=col[1];img.data[o+2]=col[2];img.data[o+3]=seeThrough&&t===WATER?0:255;}}
  g.putImageData(img,0,0);return c;
}

// minimapa pré-renderizado
export const mini=document.createElement('canvas');mini.width=W;mini.height=H;
(function(){const g=mini.getContext('2d');const img=g.createImageData(W,H);
  const MC={[WATER]:[31,80,120],[SAND]:[214,196,140],[ROAD]:[70,70,78],[SIDE]:[150,150,145],[GRASS]:[80,140,60],[BUILD]:[120,110,100],[TREE]:[50,110,45],[PARK]:[90,90,98],[POOL]:[80,190,240],[DIRT]:[150,115,80]};
  for(let i=0;i<W*H;i++){const c=MC[map[i]];let k=1;if(map[i]===ROAD&&RT[i]===3)k=1.6;else if(map[i]===ROAD&&RT[i]===1)k=1.25;
    img.data[i*4]=Math.min(255,c[0]*k);img.data[i*4+1]=Math.min(255,c[1]*k);img.data[i*4+2]=Math.min(255,c[2]*k);img.data[i*4+3]=255;}
  g.putImageData(img,0,0);
  for(const z of zones){g.fillStyle=z.type==='ze'?'#ff9a3c':z.type==='armas'?'#ff4a3c':z.type==='posto'?'#ffd83c':'#3cff9a';g.fillRect(z.x0/T,z.y0/T,(z.x1-z.x0)/T,(z.y1-z.y0)/T);}
})();
