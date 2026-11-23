// Geração da cidade: malha de ruas (avenidas, ruas, becos), bairros, prédios, praia e lugares especiais
import { rng, rand, pick, mulberry } from '../core/utils.js';
import { zoneAt, VV, BEACH_X0, BEACH_X1, LAND_Y1, CITY_X1 } from './zoning.js';

export const T=32;
export const W=376, H=376;
export const WORLD=W*T;
export const WATER=0,SAND=1,ROAD=2,SIDE=3,GRASS=4,BUILD=5,TREE=6,PARK=7,POOL=8,DIRT=9;
export const map=new Uint8Array(W*H);
export const DX=[1,0,-1,0], DY=[0,1,0,-1];   // 0=leste 1=sul 2=oeste 3=norte

export const buildings=[];
export const trees=[];
export const zones=[];
export const phones=[];
export const lamps=[];
export const pumps=[];
export const decor=[];        // enfeites sem colisão (guarda-sol, rede de vôlei, guindaste...)
export let hospitalSpot, policeSpot;
export const special={};

export function tileAt(px,py){const x=px/T|0,y=py/T|0;if(x<0||y<0||x>=W||y>=H)return WATER;return map[y*W+x];}
export function tileOf(x,y){if(x<0||y<0||x>=W||y>=H)return WATER;return map[y*W+x];}
export function isSolidT(t){return t===WATER||t===BUILD||t===TREE||t===POOL;}
export function solidAt(px,py){return isSolidT(tileAt(px,py));}
export function setT(x,y,t){if(x>=0&&y>=0&&x<W&&y<H)map[y*W+x]=t;}
export function fillLot(x0,y0,w,h,t){for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)setT(x,y,t);}

export const WALLS=['#d98b5f','#e6c27a','#7fb7a8','#e89aa3','#efe3c8','#c9a3d4','#8fb1d9','#d6d06b','#b8846a','#9ccf8f','#f0b37e','#a7a2a0'];
export const ROOFS=['#6b6460','#5d6670','#7a6a5a','#4f5a52','#6e5c6a','#857b6c'];

// =====================================================================
//  MALHA DE RUAS
//  Linhas verticais (VL) e horizontais (HL). Cada uma tem largura em tiles
//  e um tipo: 'ave' (4 faixas, mão dupla), 'rua' (2 faixas, mão dupla) ou
//  'beco' (1 faixa, mão única, só na Vila dos Pescadores).
// =====================================================================
const LANES={ave:2,rua:1,beco:1};
const WIDTH={ave:8,rua:4,beco:2};
function mkLines(list){return list.sort((a,b)=>a[0]-b[0]).map(([c,type,name],idx)=>({idx,c,px:c*T,type,w:WIDTH[type],lanes:LANES[type],name,oneway:0}));}
export const VL=mkLines([
  [16,'rua','Rua da Brisa'],[42,'rua','Rua do Sal'],[68,'rua','Rua do Bonde'],[94,'ave','Estrada dos Tropeiros'],[120,'rua','Rua do Pandeiro'],
  [146,'rua','Rua da Feira'],[172,'rua','Rua do Caju'],[198,'rua','Rua das Amendoeiras'],[224,'ave','Av. Aurora'],[250,'rua','Rua do Bicho'],
  [276,'rua','Rua da Restinga'],[302,'rua','Rua do Farol'],[328,'ave','Av. Beira-Mar'],
  [29,'beco','Beco do Cavaquinho'],[55,'beco','Beco da Lavadeira'],[81,'beco','Beco do Chorinho'],[107,'beco','Beco do Partido-Alto'],[133,'beco','Beco do Jongo'],[159,'beco','Beco do Calango'],
]);
export const HL=mkLines([
  [16,'rua','Rua das Jaqueiras'],[42,'rua','Rua do Cajueiro'],[68,'rua','Rua do Coqueiral'],[94,'ave','Via Expressa'],[120,'rua','Rua dos Pescadores'],
  [146,'rua','Rua das Gaivotas'],[172,'rua','Rua da Lagosta'],[198,'ave','Av. das Nações'],[224,'rua','Rua da Maré'],[250,'rua','Rua do Mangue'],
  [276,'rua','Rua da Peixada'],[302,'rua','Rua da Colônia'],[328,'rua','Rua do Cais'],[354,'rua','Av. do Cais'],
  [237,'beco','Beco das Flores'],[263,'beco','Beco do Sino'],[289,'beco','Beco da Lua'],[315,'beco','Beco dos Ventos'],[341,'beco','Beco do Bloco'],
]);
// becos alternam o sentido (mão única): +1 = leste/sul, -1 = oeste/norte
{let k=0;for(const l of VL)if(l.type==='beco')l.oneway=(k++%2)?1:-1;}
{let k=0;for(const l of HL)if(l.type==='beco')l.oneway=(k++%2)?1:-1;}
export const NV=VL.length, NH=HL.length;

// segH[j][i]: trecho da linha horizontal j entre as verticais i e i+1
// segV[i][j]: trecho da linha vertical i entre as horizontais j e j+1
export const segH=HL.map(()=>new Array(NV-1).fill(false));
export const segV=VL.map(()=>new Array(NH-1).fill(false));
const inVV=(x,y)=>x>=VV.x0&&x<=VV.x1&&y>=VV.y0&&y<=VV.y1;

export const nodeKey=(i,j)=>i+j*NV;
export function degree(i,j){let d=0;if(i>0&&segH[j][i-1])d++;if(i<NV-1&&segH[j][i])d++;if(j>0&&segV[i][j-1])d++;if(j<NH-1&&segV[i][j])d++;return d;}
// existe trecho saindo do nó (i,j) na direção d?
export function hasSeg(i,j,d){
  if(d===0)return i<NV-1&&segH[j][i]; if(d===2)return i>0&&segH[j][i-1];
  if(d===1)return j<NH-1&&segV[i][j]; return j>0&&segV[i][j-1];
}
// linha usada por quem anda na direção d a partir do nó (i,j)
export const lineFor=(i,j,d)=>d%2===0?HL[j]:VL[i];
// sentido permitido numa linha (mão única)
export function dirAllowed(line,d){
  if(!line.oneway)return true;
  const plus=(d===0||d===1);
  return line.oneway>0?plus:!plus;
}
// faixas de uma linha para a direção d: coordenada perpendicular em px, da faixa de dentro (0) para a de fora
export function laneCoords(line,d){
  if(line.oneway)return [line.px];
  const sign=(d===0||d===3)?1:-1;
  const out=[];for(let k=0;k<line.lanes;k++)out.push(line.px+sign*(32+64*k));
  return out;
}
export const nodePos=(i,j)=>({x:VL[i].px,y:HL[j].px});
// nó real de cruzamento (3 ou 4 saídas)
export const isJunction=(i,j)=>degree(i,j)>=3;

function buildGraph(){
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++){
    const L=HL[j],x0=VL[i].c,x1=VL[i+1].c;
    segH[j][i]= L.type!=='beco' || (inVV(x0,L.c)&&inVV(x1,L.c));
  }
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++){
    const L=VL[i],y0=HL[j].c,y1=HL[j+1].c;
    segV[i][j]= L.type!=='beco' || (inVV(L.c,y0)&&inVV(L.c,y1));
  }
  // estádio: junta 4 quarteirões no Centro tirando os trechos de rua do meio
  {const vA=VL.findIndex(l=>l.c===224),vM=VL.findIndex(l=>l.c===250),vB=VL.findIndex(l=>l.c===276),hA=HL.findIndex(l=>l.c===224),hM=HL.findIndex(l=>l.c===250);
    segV[vM][hA]=false;segV[vM][hM]=false;
    for(let i=vA;i<vB;i++)segH[hM][i]=false;}
  // bairro rico e periferia: tira alguns trechos de rua (quarteirões maiores e mais irregulares)
  const tryRemove=(isH,a,b,prob)=>{
    const L=isH?HL[a]:VL[a]; if(L.type!=='rua')return;
    const n1=isH?[b,a]:[a,b], n2=isH?[b+1,a]:[a,b+1];
    if(L.idx===0||L.idx===(isH?NH:NV)-1)return;
    if(rng()>prob)return;
    if(degree(n1[0],n1[1])<3||degree(n2[0],n2[1])<3)return;
    if(isH)segH[a][b]=false;else segV[a][b]=false;
  };
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++){if(!segH[j][i])continue;const z=zoneAt((VL[i].c+VL[i+1].c)/2,HL[j].c);
    if(z==='rico')tryRemove(true,j,i,0.45);else if(z==='cajueiro')tryRemove(true,j,i,0.15);}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++){if(!segV[i][j])continue;const z=zoneAt(VL[i].c,(HL[j].c+HL[j+1].c)/2);
    if(z==='rico')tryRemove(false,i,j,0.45);else if(z==='cajueiro')tryRemove(false,i,j,0.15);}
}

// largura da calçada por bairro
const SIDEWALK={centro:2,rico:2,orla:2,jardim:1,cajueiro:1,velha:1,porto:1};

// =====================================================================
//  GERAÇÃO
// =====================================================================
export function genMap(){
  map.fill(WATER);
  buildGraph();
  // terra firme
  for(let y=10;y<LAND_Y1;y++)for(let x=10;x<BEACH_X1;x++)map[y*W+x]=GRASS;
  for(let y=10;y<LAND_Y1;y++)for(let x=10;x<BEACH_X1;x++){
    if(x<13||y<13)map[y*W+x]=SAND;                 // borda oeste/norte
    if(x>=BEACH_X0)map[y*W+x]=SAND;                 // praia
    if(y>=LAND_Y1-4&&x<BEACH_X0)map[y*W+x]=PARK;    // cais do porto
  }
  // ruas
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i]){const L=HL[j];fillLot(Math.round(VL[i].c),Math.round(L.c-L.w/2),Math.round(VL[i+1].c-VL[i].c),L.w,ROAD);}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j]){const L=VL[i];fillLot(Math.round(L.c-L.w/2),Math.round(HL[j].c),L.w,Math.round(HL[j+1].c-HL[j].c),ROAD);}
  for(let j=0;j<NH;j++)for(let i=0;i<NV;i++){
    if(!degree(i,j))continue;
    const hv=(hasSeg(i,j,1)||hasSeg(i,j,3))?VL[i].w:0, hh=(hasSeg(i,j,0)||hasSeg(i,j,2))?HL[j].w:0;
    const wv=hv||0, wh=hh||0;
    fillLot(Math.round(VL[i].c-wv/2),Math.round(HL[j].c-wh/2),wv,wh,ROAD);
    if(wv&&wh)fillLot(Math.round(VL[i].c-VL[i].w/2),Math.round(HL[j].c-HL[j].w/2),VL[i].w,HL[j].w,ROAD);
  }
  // calçadas em volta das ruas
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(map[y*W+x]!==ROAD)continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
      const t=map[ny*W+nx];if(t!==GRASS&&t!==SAND)continue;
      const sw=SIDEWALK[zoneAt(nx,ny)]||1;
      if(Math.max(Math.abs(dx),Math.abs(dy))<=sw&&!(t===SAND&&nx>=BEACH_X0))map[ny*W+nx]=SIDE;
    }
  }
  // calçadão da orla (entre a Beira-Mar e a areia)
  for(let y=13;y<LAND_Y1-4;y++)for(let x=CITY_X1+4;x<BEACH_X0;x++)if(map[y*W+x]!==ROAD)map[y*W+x]=SIDE;

  // quarteirões
  const cells=[];
  for(let j=0;j<NH-1;j++)for(let i=0;i<NV-1;i++){
    const L=VL[i],R=VL[i+1],U=HL[j],D=HL[j+1];
    const zc=zoneAt((L.c+R.c)/2,(U.c+D.c)/2), sw=SIDEWALK[zc]||1;
    const left=segV[i][j]?L.w/2+sw:0, right=segV[i+1][j]?R.w/2+sw:0, top=segH[j][i]?U.w/2+sw:0, bot=segH[j+1][i]?D.w/2+sw:0;
    const x0=Math.ceil(L.c+left), x1=Math.floor(R.c-right), y0=Math.ceil(U.c+top), y1=Math.floor(D.c-bot);
    if(x1-x0<2||y1-y0<2)continue;
    if(x0>=CITY_X1+4)continue; // nada depois da Beira-Mar (praia)
    cells.push({i,j,x0,y0,x1,y1,w:x1-x0,h:y1-y0,zone:zc,cx:(x0+x1)/2,cy:(y0+y1)/2,used:false});
  }
  buildStadium(cells);
  placeSpecials(cells);
  for(const c of cells)if(!c.used)fillCell(c);
  beach();
  port();
  assignCommerce();
  for(const b of buildings)if(ENTER_KINDS.includes(b.kind)&&!b.door)setDoor(b);
  placePhones(cells);
  placeLamps();
  rioDecor(cells);
}

// ---------- estádio (Estádio do Jacarandá) ----------
export const STADIUM={x0:230,y0:228,x1:270,y1:270};
function buildStadium(cells){
  const {x0,y0,x1,y1}=STADIUM;
  for(const c of cells)if(c.cx>x0&&c.cx<x1&&c.cy>y0&&c.cy<y1)c.used=true;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const t=map[y*W+x];if(t===GRASS||t===DIRT||t===SIDE)map[y*W+x]=PARK;}
  const sx0=x0+3,sy0=y0+3,sx1=x1-3,sy1=y1-3, ring=6;     // arquibancada
  const fx0=sx0+ring,fy0=sy0+ring,fx1=sx1-ring,fy1=sy1-ring; // gramado
  fillLot(sx0,sy0,sx1-sx0,sy1-sy0,BUILD);
  fillLot(fx0,fy0,fx1-fx0,fy1-fy0,GRASS);
  // portões no meio de cada lado
  const mx=Math.floor((sx0+sx1)/2),my=Math.floor((sy0+sy1)/2);
  fillLot(mx-1,sy0,3,ring,PARK);fillLot(mx-1,fy1,3,ring,PARK);fillLot(sx0,my-1,ring,3,PARK);fillLot(fx1,my-1,ring,3,PARK);
  const b={x0:sx0*T,y0:sy0*T,x1:sx1*T,y1:sy1*T,h:36,wall:'#cfd8dc',roof:'#90a4ae',kind:'estadio',seed:rng(),
    inner:{x0:fx0*T,y0:fy0*T,x1:fx1*T,y1:fy1*T},gates:[[mx,sy0],[mx,fy1],[sx0,my],[fx1,my]]};
  b.door={x:(mx+.5)*T,y:(sy1+1.2)*T,out:[0,1]};
  buildings.push(b);special.estadio=b;
  decor.push({type:'estadio-campo',x0:fx0*T,y0:fy0*T,x1:fx1*T,y1:fy1*T});
  for(const [x,y] of [[sx0-1,sy0-1],[sx1,sy0-1],[sx0-1,sy1],[sx1,sy1]]){decor.push({type:'refletor',x:(x+.5)*T,y:(y+.5)*T});lamps.push({x:(x+.5)*T,y:(y+.5)*T});}
}

// ---------- lugares especiais ----------
function takeCell(cells,zone,tx,ty,minW=12,minH=12){
  let best=null,bd=1e9;
  for(const c of cells){if(c.used||c.zone!==zone||c.w<minW||c.h<minH)continue;const d=Math.hypot(c.cx-tx,c.cy-ty);if(d<bd){bd=d;best=c;}}
  if(!best)for(const c of cells){if(c.used||c.w<minW||c.h<minH)continue;const d=Math.hypot(c.cx-tx,c.cy-ty);if(d<bd){bd=d;best=c;}}
  if(best)best.used=true;
  return best;
}
const pushB=(x0,y0,w,h,o)=>{fillLot(x0,y0,w,h,BUILD);const b=Object.assign({x0:x0*T,y0:y0*T,x1:(x0+w)*T,y1:(y0+h)*T,seed:rng()},o);buildings.push(b);return b;};
function placeSpecials(cells){
  // hospital e delegacia: prédio em cima, estacionamento embaixo
  for(const [kind,tx,ty] of [['hospital',208,212],['policia',290,290]]){
    const c=takeCell(cells,'centro',tx,ty);if(!c)continue;
    fillLot(c.x0,c.y0,c.w,c.h,PARK);
    const bh=Math.round(c.h*0.6);
    pushB(c.x0,c.y0,c.w,bh,{h:kind==='hospital'?40:30,wall:kind==='hospital'?'#f2f2ee':'#c8d2e0',roof:kind==='hospital'?'#e9e9e4':'#2e4d86',kind});
    const spot={x:(c.x0+c.w/2)*T,y:(c.y1+0.6)*T};
    if(kind==='hospital')hospitalSpot=spot;else policeSpot=spot;
  }
  // garagens com zona de entrada (pintura, Zé, armas)
  const garage=(zone,tx,ty,sp,wall,roof,type,label)=>{
    const c=takeCell(cells,zone,tx,ty);if(!c)return null;
    fillLot(c.x0,c.y0,c.w,c.h,PARK);
    const bh=Math.max(3,Math.round(c.h*0.25));
    pushB(c.x0,c.y0,c.w,bh,{h:22,wall,roof,kind:sp});
    const z={x0:(c.x0+1)*T,y0:(c.y0+bh+1)*T,x1:(c.x1-1)*T,y1:(c.y1-1)*T,type,label};
    zones.push(z);special[sp]=z;return {c,z,bh};
  };
  garage('jardim',185,55,'pintura','#2f8f6f','#226b52','pintura','PINTURA EXPRESS $500');
  garage('cajueiro',45,180,'pintura2','#2f8f6f','#226b52','pintura','PINTURA EXPRESS $500');
  garage('porto',240,341,'ze','#b5651d','#6a4a2a','ze','OFICINA DO ZÉ');
  {const g=garage('cajueiro',82,150,'armas','#8a3b2f','#4a2420','armas','A PÉ: PISA NA ARMA PRA COMPRAR');
    if(g){const {z}=g;z.pads=[];const pw=(z.x1-z.x0)/3;
      ['pistola','escopeta','smg'].forEach((w,i)=>z.pads.push({x0:z.x0+pw*i+12,y0:z.y0+20,x1:z.x0+pw*(i+1)-12,y1:z.y1-12,weapon:w}));}}
  // postos de gasolina, de frente pra avenida
  for(const [sp,zone,tx,ty] of [['posto','centro',185,185],['posto2','jardim',210,105]]){
    const c=takeCell(cells,zone,tx,ty);if(!c)continue;
    fillLot(c.x0,c.y0,c.w,c.h,PARK);
    pushB(c.x0,c.y0,c.w,2,{h:16,wall:'#e9e2d0',roof:'#c9342a',kind:'lojaposto'});
    const cx0=c.x0+2,cy0=c.y0+4,cw=c.w-4,ch=Math.min(6,c.h-6);
    buildings.push({x0:cx0*T,y0:cy0*T,x1:(cx0+cw)*T,y1:(cy0+ch)*T,h:20,wall:'#dddddd',roof:'#f2f2ee',kind:'canopy',seed:rng()});
    for(let k=0;k<3;k++)pumps.push({x:(cx0+cw*(k+1)/4)*T,y:(cy0+ch/2)*T});
    const z={x0:cx0*T,y0:cy0*T,x1:(cx0+cw)*T,y1:(cy0+ch)*T,type:'posto',label:'CONSERTO $150'};
    zones.push(z);special[sp]=z;
  }
  // sua casa: casinha com quintal no Jardim
  {const c=takeCell(cells,'jardim',160,30,10,10);if(c){
    const bw=Math.min(8,c.w-4),bh=Math.min(7,c.h-5),bx=c.x0+Math.floor((c.w-bw)/2),by=c.y0+1;
    special.casa=pushB(bx,by,bw,bh,{h:22,wall:'#f0e0c0',roof:'#9c4a32',kind:'casa'});
    for(let y=by+bh;y<c.y1;y++){setT(bx+Math.floor(bw/2),y,SIDE);setT(bx+Math.floor(bw/2)-1,y,SIDE);}
    for(let k=0;k<4;k++){const x=c.x0+1+Math.floor(rng()*(c.w-2)),y=c.y0+bh+2+Math.floor(rng()*Math.max(1,c.h-bh-3));if(map[y*W+x]===GRASS)addTree(x,y,'#2f7d3a');}}}
  // estacionamentos (missões e terminal de ônibus)
  for(const [sp,zone,tx,ty] of [['estac','centro',264,210],['estac2','rico',262,60],['estac3','centro',185,309]]){
    const c=takeCell(cells,zone,tx,ty,10,10);if(!c)continue;
    fillLot(c.x0,c.y0,c.w,c.h,PARK);special[sp]={x:(c.x0+c.w/2)*T,y:(c.y0+c.h/2)*T,rect:c};
  }
}

// ---------- quarteirões comuns, cada bairro do seu jeito ----------
function addTree(x,y,c,palm){setT(x,y,TREE);trees.push({x:(x+.5)*T,y:(y+.5)*T,r:rand(12,18),c:c||pick(['#2e7d32','#388e3c','#33691e','#2f6b3a']),palm:!!palm});}
function split(c,minSize,maxParts){ // divide o quarteirão em lotes ao longo do lado maior
  const horiz=c.w>=c.h, len=horiz?c.w:c.h;
  const n=Math.max(1,Math.min(maxParts,Math.floor(len/minSize)));
  const out=[];let pos=0;
  for(let k=0;k<n;k++){const sz=k===n-1?len-pos:Math.round(len/n);out.push(horiz?{x0:c.x0+pos,y0:c.y0,w:sz,h:c.h}:{x0:c.x0,y0:c.y0+pos,w:c.w,h:sz});pos+=sz;}
  return out;
}
function plaza(c){
  for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++){
    const mx=Math.floor((c.x0+c.x1)/2),my=Math.floor((c.y0+c.y1)/2);
    if(Math.abs(x-mx)<=1||Math.abs(y-my)<=1)setT(x,y,SIDE);
    else if(rng()<0.2)addTree(x,y);
  }
}
function fillCell(c){
  const z=c.zone;
  if(z==='centro'){
    if(rng()<0.1){plaza(c);return;}
    for(const lot of split(c,8,3)){
      const ins=rng()<0.3?1:0;const bw=lot.w-ins*2,bh=lot.h-ins*2;if(bw<3||bh<3)continue;
      pushB(lot.x0+ins,lot.y0+ins,bw,bh,{h:Math.round(60+rng()*110),wall:pick(['#9fb3c8','#c7cfd6','#8fa4b5','#d9d2c3','#7f97a8','#b4c6d1']),roof:pick(['#4f5a62','#5d6670','#3e474e']),kind:'b',style:'torre'});
      if(ins)for(let y=lot.y0;y<lot.y0+lot.h;y++)for(let x=lot.x0;x<lot.x0+lot.w;x++)if(map[y*W+x]===GRASS)setT(x,y,SIDE);
    }
  } else if(z==='rico'){
    if(c.cx>276&&rng()<0.6){ // condomínio de frente pro mar
      const bw=Math.min(c.w-4,10),bh=Math.min(c.h-4,10);
      pushB(c.x0+Math.floor((c.w-bw)/2),c.y0+Math.floor((c.h-bh)/2),bw,bh,{h:Math.round(90+rng()*60),wall:'#eef2f3',roof:'#5d6d75',kind:'b',style:'torre'});
      fillLot(c.x0+1,c.y1-4,5,3,POOL);
      return;
    }
    for(const lot of split(c,11,2)){ // mansões com piscina e jardim
      const bw=Math.max(4,Math.round(lot.w*0.5)),bh=Math.max(4,Math.round(lot.h*0.45));
      const bx=lot.x0+1,by=lot.y0+1;
      pushB(bx,by,bw,bh,{h:Math.round(18+rng()*10),wall:pick(['#fbf6ec','#efe6d6','#e9eef0','#f5e3c8']),roof:pick(['#7a4a3a','#3d4a52','#8a6a4a']),kind:'b',style:'mansao'});
      const pw=Math.min(4,lot.w-bw-3),ph=Math.min(6,lot.h-3);
      if(pw>=2&&ph>=3)fillLot(bx+bw+1,by,pw,ph,POOL);
      for(let k=0;k<6;k++){const x=lot.x0+Math.floor(rng()*lot.w),y=lot.y0+Math.floor(rng()*lot.h);if(map[y*W+x]===GRASS&&rng()<0.7)addTree(x,y,pick(['#2e7d32','#33691e','#1b5e20']));}
    }
  } else if(z==='velha'){
    if(rng()<0.12){plaza(c);return;}
    // casarões coloridos geminados, telhado de barro
    for(const lot of split(c,3,6)){
      pushB(lot.x0,lot.y0,lot.w,lot.h,{h:Math.round(12+rng()*10),wall:pick(['#f2c14e','#e07a5f','#81b29a','#f4a261','#e9c46a','#6fa8dc','#d36c9f','#f6f1d1']),roof:pick(['#b5532e','#a24a2a','#c0663a']),kind:'b',style:'casario'});
    }
  } else if(z==='cajueiro'){
    for(let y=c.y0;y<c.y1;y++)for(let x=c.x0;x<c.x1;x++)if(rng()<0.5)setT(x,y,DIRT);
    if(rng()<0.12&&c.w>=12&&c.h>=10){ // campinho de várzea
      fillLot(c.x0+1,c.y0+1,c.w-2,c.h-2,DIRT);decor.push({type:'campo',x0:(c.x0+1)*T,y0:(c.y0+1)*T,x1:(c.x1-1)*T,y1:(c.y1-1)*T});return;}
    // casinhas pequenas espalhadas, tijolo aparente
    let y=c.y0;
    while(y<c.y1-2){let x=c.x0;const rowH=3+Math.floor(rng()*2);
      while(x<c.x1-2){const bw=3+Math.floor(rng()*2);if(x+bw>c.x1)break;
        if(rng()<0.85)pushB(x,y,bw,Math.min(rowH,c.y1-y),{h:Math.round(8+rng()*7),wall:pick(['#b5653e','#c27a50','#d9cbb5','#9e5a3c','#e8d5b0']),roof:pick(['#8b8b8b','#6d6d6d','#a0522d']),kind:'b',style:'casinha'});
        x+=bw+(rng()<0.4?1:0);}
      y+=rowH+1;}
  } else if(z==='jardim'){
    if(rng()<0.12){plaza(c);return;}
    if(rng()<0.35){ // prédio residencial
      const bw=Math.min(c.w-4,9),bh=Math.min(c.h-4,9);
      pushB(c.x0+2,c.y0+2,bw,bh,{h:Math.round(30+rng()*25),wall:pick(WALLS),roof:pick(ROOFS),kind:'b',style:'predio'});
      for(let k=0;k<5;k++){const x=c.x0+Math.floor(rng()*c.w),y=c.y0+Math.floor(rng()*c.h);if(map[y*W+x]===GRASS)addTree(x,y);}
      return;
    }
    for(const lot of split(c,6,4)){ // casas com quintal
      const bw=Math.max(3,lot.w-2),bh=Math.max(3,Math.round(lot.h*0.55));
      pushB(lot.x0+1,lot.y0+1,bw,bh,{h:Math.round(14+rng()*8),wall:pick(WALLS),roof:pick(['#9c4a32','#7a6a5a','#5d6670']),kind:'b',style:'casa'});
      const tx=lot.x0+Math.floor(rng()*lot.w),ty=lot.y0+bh+1+Math.floor(rng()*Math.max(1,lot.h-bh-2));
      if(map[ty*W+tx]===GRASS&&rng()<0.8)addTree(tx,ty);
    }
  } else if(z==='orla'){
    // hotéis e prédios altos de frente pro mar
    for(const lot of split(c,9,2)){
      const ins=1;const bw=lot.w-2,bh=lot.h-2;if(bw<3||bh<3)continue;
      pushB(lot.x0+ins,lot.y0+ins,bw,bh,{h:Math.round(70+rng()*80),wall:pick(['#ffffff','#e8f4f8','#f7efe2','#dfeef2']),roof:pick(['#5d6d75','#46555c']),kind:'b',style:'hotel'});
      for(let y=lot.y0;y<lot.y0+lot.h;y++)for(let x=lot.x0;x<lot.x0+lot.w;x++)if(map[y*W+x]===GRASS)setT(x,y,SIDE);
    }
  } else if(z==='porto'){
    // galpões e pilhas de contêiner
    for(const lot of split(c,10,2)){
      if(rng()<0.55){pushB(lot.x0+1,lot.y0+1,lot.w-2,lot.h-2,{h:Math.round(22+rng()*8),wall:pick(['#8d99a6','#a1887f','#90a4ae']),roof:pick(['#607d8b','#78909c','#8d6e63']),kind:'b',style:'galpao'});}
      else{for(let y=lot.y0;y<lot.y0+lot.h;y++)for(let x=lot.x0;x<lot.x0+lot.w;x++)setT(x,y,PARK);
        for(let y=lot.y0+1;y+2<lot.y0+lot.h;y+=3)for(let x=lot.x0+1;x+4<lot.x0+lot.w;x+=5)if(rng()<0.75)
          {const col=pick(['#c0392b','#2980b9','#27ae60','#f39c12','#8e44ad','#16a085']);pushB(x,y,4,2,{h:8+Math.floor(rng()*3)*8,wall:col,roof:col,kind:'b',style:'conteiner'});}}
    }
  }
}

// ---------- praia ----------
function beach(){
  for(let y=16;y<LAND_Y1-8;y+=2){
    if(rng()<0.35)addTree(BEACH_X0+Math.floor(rng()*3),y,'#3f8f3a',true);       // coqueiros perto do calçadão
  }
  for(let y=24;y<LAND_Y1-20;y+=18){ // barracas de praia com guarda-sóis
    const bx=BEACH_X0+5;
    pushB(bx,y,3,2,{h:9,wall:'#d7b98a',roof:pick(['#e74c3c','#f39c12','#27ae60','#2980b9']),kind:'b',style:'barraca'});
    for(let k=0;k<4;k++)decor.push({type:'guarda-sol',x:(bx+5+rng()*10)*T,y:(y+rng()*6)*T,c:pick(['#e74c3c','#f1c40f','#3498db','#ffffff','#2ecc71'])});
  }
  for(let y=40;y<LAND_Y1-30;y+=60)decor.push({type:'volei',x:(BEACH_X0+15)*T,y:y*T});
  for(let y=60;y<LAND_Y1-30;y+=80)pushB(BEACH_X0+19,y,2,2,{h:14,wall:'#ffffff',roof:'#e53935',kind:'b',style:'salva-vidas'});
}
function port(){
  for(let x=190;x<322;x+=22)decor.push({type:'guindaste',x:x*T,y:(LAND_Y1-2)*T});
}

// ---------- comércio nos prédios baixos ----------
// ---------- portas: sempre viradas pra rua, com caminho livre ----------
const ENTER_KINDS=['estadio','hospital','policia','armas','farmacia','mercadinho','padaria','lanchonete','escola','casa','lojaposto'];
// procura o lado do prédio com o caminho mais curto e livre até uma rua
export function frontOf(b,maxDist=10){
  const bx0=Math.round(b.x0/T),by0=Math.round(b.y0/T),bx1=Math.round(b.x1/T),by1=Math.round(b.y1/T);
  const sides=[ // [início do lado fora do prédio, passo pra fora, ao longo]
    {cells:[],out:[0,1]},{cells:[],out:[0,-1]},{cells:[],out:[-1,0]},{cells:[],out:[1,0]}];
  for(let x=bx0;x<bx1;x++){sides[0].cells.push([x,by1]);sides[1].cells.push([x,by0-1]);}
  for(let y=by0;y<by1;y++){sides[2].cells.push([bx0-1,y]);sides[3].cells.push([bx1,y]);}
  let best=null;
  for(const s of sides){
    // prefere o meio do lado
    const mid=(s.cells.length-1)/2;
    const order=s.cells.map((c,i)=>[c,Math.abs(i-mid)]).sort((a,b)=>a[1]-b[1]);
    for(const [[sx,sy],off] of order){
      let x=sx,y=sy,d=0,path=[],ok=false;
      while(d<maxDist){
        const t=tileOf(x,y);
        if(t===ROAD){ok=true;break;}
        if(t===BUILD||t===WATER||t===POOL)break;
        path.push([x,y]);x+=s.out[0];y+=s.out[1];d++;
      }
      if(!ok||!path.length)continue;
      const score=d*10+off;
      if(!best||score<best.score)best={score,dist:d,path,x:path[0][0],y:path[0][1],out:s.out};
      break; // primeiro ponto livre desse lado já basta (o mais central)
    }
  }
  return best;
}
function setDoor(b){
  const f=frontOf(b,12);if(!f)return false;
  // abre o caminho: grama, terra e árvore viram calçada
  for(const [x,y] of f.path){const t=tileOf(x,y);
    if(t===TREE){const i=trees.findIndex(tr=>Math.floor(tr.x/T)===x&&Math.floor(tr.y/T)===y);if(i>=0)trees.splice(i,1);}
    if(t===GRASS||t===DIRT||t===TREE||t===SAND)setT(x,y,SIDE);}
  b.door={x:(f.x+.5)*T,y:(f.y+.5)*T,out:f.out};
  return true;
}
function assignCommerce(){
  const POI={farmacia:{roof:'#f2f2ee',wall:'#d9e8d9'},mercadinho:{roof:'#e8a33a',wall:'#f0d9a8'},padaria:{roof:'#b9824a',wall:'#efdcc0'},
    escola:{roof:'#3f6fb0',wall:'#e7e0c9'},lanchonete:{roof:'#c0392b',wall:'#f3d36b'}};
  const want={farmacia:8,mercadinho:10,padaria:6,escola:4,lanchonete:10};
  const cand=buildings.filter(b=>b.kind==='b'&&['casa','casario','predio','casinha','torre'].includes(b.style)&&(b.x1-b.x0)>=4*T&&(b.y1-b.y0)>=4*T&&(()=>{const f=frontOf(b,5);return f&&f.dist<=4;})());
  // embaralha de forma determinística
  for(let i=cand.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cand[i],cand[j]]=[cand[j],cand[i]];}
  // pelo menos 1/3 de cada comércio fica nos bairros abertos desde o começo (Centro e Jardim),
  // senão os empregos (motoboy, vigilante) e as lojas só funcionam depois de liberar bairro
  const startZone=b=>{const z=zoneAt((b.x0+b.x1)/2/T|0,(b.y0+b.y1)/2/T|0);return z==='centro'||z==='jardim';};
  const taken=new Set();
  const give=(k,b)=>{taken.add(b);b.kind=k;b.roof=POI[k].roof;b.wall=POI[k].wall;b.h=Math.min(b.h,24);};
  const fits=(k,b)=>k!=='escola'||((b.x1-b.x0)>=5*T&&(b.y1-b.y0)>=5*T);
  for(const k of Object.keys(want)){let n=Math.ceil(want[k]/3);
    for(const b of cand){if(n<=0)break;if(taken.has(b)||!startZone(b)||!fits(k,b))continue;give(k,b);n--;}}
  for(const k of Object.keys(want)){let n=want[k]-buildings.filter(b=>b.kind===k).length;
    for(const b of cand){if(n<=0)break;if(taken.has(b)||!fits(k,b))continue;give(k,b);n--;}}
}

// ---------- orelhões e postes ----------
function placePhones(cells){
  const targets=[[30,30],[120,25],[190,40],[270,40],[60,100],[180,110],[260,120],[300,100],[60,170],[190,170],[280,190],
    [170,230],[220,250],[290,250],[70,260],[130,320],[40,330],[200,300],[260,300],[230,341],[300,341],[180,200]];
  const usedC=new Set();
  for(const [tx,ty] of targets){
    let best=null,bd=1e9;
    for(const c of cells){if(usedC.has(c))continue;const d=Math.hypot(c.cx-tx,c.cy-ty);if(d<bd){bd=d;best=c;}}
    if(!best)continue;usedC.add(best);
    for(const [x,y] of [[best.x0-1,best.y0-1],[best.x1,best.y0-1],[best.x0-1,best.y1],[best.x1,best.y1]]){
      if(tileOf(x,y)===SIDE){phones.push({x:(x+.5)*T,y:(y+.5)*T});break;}
    }
  }
}
function placeLamps(){
  const add=(x,y)=>{if(tileOf(x,y)!==SIDE)return;const lx=(x+.5)*T,ly=(y+.5)*T;
    if(phones.some(p=>Math.abs(p.x-lx)<40&&Math.abs(p.y-ly)<40))return;lamps.push({x:lx,y:ly});};
  for(let j=0;j<NH;j++)for(let i=0;i<NV-1;i++)if(segH[j][i]){const L=HL[j];const step=L.type==='beco'?12:8;
    for(let x=Math.ceil(VL[i].c+4);x<VL[i+1].c-4;x+=step){add(x,Math.floor(L.c-L.w/2)-1);if(L.type!=='beco')add(x,Math.ceil(L.c+L.w/2));}}
  for(let i=0;i<NV;i++)for(let j=0;j<NH-1;j++)if(segV[i][j]){const L=VL[i];const step=L.type==='beco'?12:8;
    for(let y=Math.ceil(HL[j].c+4);y<HL[j+1].c-4;y+=step){add(Math.floor(L.c-L.w/2)-1,y);if(L.type!=='beco')add(Math.ceil(L.c+L.w/2),y);}}
  for(let y=20;y<LAND_Y1-12;y+=9)add(CITY_X1+5,y); // calçadão
}

// ---------- cara de Guanabara 97: enfeites de cada bairro (só visual, sem colisão) ----------
// Usa um sorteio próprio no fim da geração: o traçado da cidade e os lugares continuam iguais.
function rioDecor(cells){
  const r=mulberry(1997), rp=a=>a[Math.floor(r()*a.length)];
  const near=(list,x,y,d)=>list.some(p=>Math.abs(p.x-x)<d&&Math.abs(p.y-y)<d);
  const doors=buildings.filter(b=>b.door).map(b=>b.door);
  const busy=(x,y,d=40)=>near(phones,x,y,d)||near(lamps,x,y,d*0.7)||near(doors,x,y,d)||near(pumps,x,y,d);
  const zt=(x,y)=>zoneAt(x,y);
  const free=(x0,y0,w,h,t)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)if(tileOf(x,y)!==t)return false;return true;};
  const used=new Set(),mark=(x0,y0,w,h)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)used.add(y*W+x);},isUsed=(x0,y0,w,h)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)if(used.has(y*W+x))return true;return false;};
  // de que lado fica a rua (pra virar a frente do enfeite pra ela)
  const roadDir=(x,y)=>{for(let d=1;d<=3;d++)for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]])if(tileOf(x+dx*d,y+dy*d)===ROAD)return [dx,dy];return null;};

  // Centro: camelódromo (barracas de lona nas calçadas largas perto da praça do Centro)
  {let n=0;const CX=205,CY=200;
    for(let y=150;y<320&&n<70;y++)for(let x=150;x<300&&n<70;x++){
      if(zt(x,y)!=='centro'||tileOf(x,y)!==SIDE||Math.hypot(x-CX,y-CY)>48)continue;
      const d=roadDir(x,y);if(!d||tileOf(x+d[0],y+d[1])===ROAD)continue; // fica na faixa de dentro da calçada
      if(tileOf(x+d[0],y+d[1])!==SIDE)continue;
      if((d[1]?x:y)%3)continue;
      const px=(x+.5)*T,py=(y+.5)*T;if(busy(px,py,44)||isUsed(x-1,y-1,3,3))continue;
      mark(x,y,1,1);decor.push({type:'camelo',x:px,y:py,face:d,c:rp(['#1e5fa8','#2c7fd0','#e2711d','#d9a21b','#3f8f4a','#c0392b'])});n++;}}
  // bancas de jornal: perto de alguns orelhões do Centro, do Jacarandá e da Barra
  {let k=0;for(const ph of phones){const x=ph.x/T|0,y=ph.y/T|0;if(!['centro','jardim','rico'].includes(zt(x,y)))continue;if(k++%2)continue;
    for(const [dx,dy] of [[3,0],[-3,0],[0,3],[0,-3]]){const bx=x+dx,by=y+dy;
      if(tileOf(bx,by)!==SIDE||isUsed(bx-1,by-1,3,3))continue;const px=(bx+.5)*T,py=(by+.5)*T;
      if(near(lamps,px,py,24)||near(doors,px,py,40))continue;const d=roadDir(bx,by);
      mark(bx-1,by-1,3,3);decor.push({type:'banca',x:px,y:py,face:d||[0,1]});break;}}}
  // Barra Sul: outdoors da BarraSul Incorporações nos terrenos vazios
  {const ads=[['BARRASUL','INCORPORAÇÕES','LANÇAMENTO · VISTA PRO MAR'],['RESIDENCIAL','ATLÂNTIDA','2 E 3 QUARTOS · LAZER COMPLETO'],['BARRASUL','INCORPORAÇÕES','O FUTURO CHEGOU À ORLA'],['SHOPPING','BARRA SUL','INAUGURAÇÃO EM 98']];
    let n=0;for(const c of cells){if(c.zone!=='rico'||n>=10)continue;
      for(let x=c.x0+2;x<c.x1-6&&n<10;x+=3){const y=c.y1-2;
        if(!free(x,y-1,5,2,GRASS)||isUsed(x-2,y-3,9,6))continue;
        mark(x-2,y-3,9,6);decor.push({type:'outdoor',x:(x+2.5)*T,y:(y+.5)*T,face:[0,1],ad:ads[n%ads.length]});n++;break;}}}
  // letreiros luminosos no alto de alguns prédios (bingo na Barra, foto 1 hora no Centro)
  {const torres=z=>buildings.filter(b=>b.kind==='b'&&b.style==='torre'&&zt((b.x0+b.x1)/2/T|0,(b.y0+b.y1)/2/T|0)===z&&b.x1-b.x0>=7*T);
    const rico=torres('rico');if(rico[0])rico[0].sign={text:'BINGO ESTRELA',col:'#ff3bd2',col2:'#ffe14a'};if(rico[2])rico[2].sign={text:'BARRASUL',col:'#38e8ff'};
    torres('centro').filter((b,i)=>i%13===5).slice(0,3).forEach((b,i)=>b.sign=[{text:'FOTO 1 HORA',col:'#ffae2b'},{text:'HOTEL GUANABARA',col:'#38e8ff'},{text:'LOTERIA',col:'#3dff6e'}][i]);}
  // Praia do Recanto: moitas de restinga na areia, perto do calçadão
  for(let y=14;y<LAND_Y1-6;y++)for(let x=BEACH_X0;x<BEACH_X0+5;x++){
    if(tileOf(x,y)!==SAND||r()>0.16)continue;const px=(x+r())*T,py=(y+r())*T;
    if(buildings.some(b=>px>b.x0-24&&px<b.x1+24&&py>b.y0-24&&py<b.y1+24))continue;
    decor.push({type:'moita',x:px,y:py,s:0.5+r()*0.7,c:rp(['#5d8a3a','#6f9a45','#4f7a34','#8a9a4a'])});}
  // Vila dos Pescadores: barcos de madeira e redes estendidas nas pracinhas e na beira das calçadas
  {let nb=0,nr=0;const spot=(x,y,horiz,len,t)=>horiz?free(x,y,len,1,t)&&!isUsed(x-1,y-1,len+2,3):free(x,y,1,len,t)&&!isUsed(x-1,y-1,3,len+2);
    for(let y=224;y<354;y++)for(let x=16;x<172;x++){
      if(zt(x,y)!=='velha')continue;const t=tileOf(x,y);if(t!==GRASS&&t!==SIDE)continue;
      const lim=t===GRASS?1:0.06; // na calçada, bem de vez em quando
      for(const horiz of [true,false]){
        if(nb<34&&spot(x,y,horiz,4,t)&&r()<0.4*lim+0.0){const px=(x+(horiz?2:.5))*T,py=(y+(horiz?.5:2))*T;if(busy(px,py,52))continue;
          horiz?mark(x,y,4,1):mark(x,y,1,4);decor.push({type:'barco',x:px,y:py,a:(horiz?0:Math.PI/2)+(r()<0.5?0:Math.PI)+(t===GRASS?(r()-0.5)*0.4:0),c:rp(['#2f6fb3','#c0392b','#2e8b57','#e0a21b','#f2f2ee'])});nb++;break;}
        if(nr<24&&spot(x,y,horiz,4,t)&&r()<0.25*lim){const px=(x+(horiz?2:.5))*T,py=(y+(horiz?.5:2))*T;if(busy(px,py,52))continue;
          horiz?mark(x,y,4,1):mark(x,y,1,4);decor.push({type:'rede',x:px,y:py,horiz});nr++;break;}
      }}}
}

genMap();
