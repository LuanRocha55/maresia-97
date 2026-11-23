// Bairros (visual de cada um), nomes de rua e semáforos
import { T, VL, HL, NV, NH, segH, segV, degree } from './map.js';
import { zoneAt } from './zoning.js';
import { S } from '../core/state.js';

export const DISTRICTS = {
  centro:  { name:'CENTRO',            road:'#2f2f36', side:'#b8b5ad', sideStyle:'lajes' },
  orla:    { name:'PRAIA DO RECANTO',  road:'#3d3d45', side:'#e9e6dc', sideStyle:'ondas' },
  velha:   { name:'VILA DOS PESCADORES', road:'#6e655c', side:'#a85a4a', sideStyle:'tijolo', cobble:true },
  cajueiro:{ name:'MORRO DO CAJUEIRO', road:'#48484e', side:'#9a968c', sideStyle:'rachado', worn:true },
  jardim:  { name:'JACARANDÁ',         road:'#3b3b42', side:'#a9a7a0', sideStyle:'caquinho', bumps:true },
  rico:    { name:'BARRA SUL',         road:'#34343c', side:'#d8d2c4', sideStyle:'lajes', smooth:true },
  porto:   { name:'CAIS DO PORTO',     road:'#45454a', side:'#8f8c85', sideStyle:'rachado' },
};
export const districtOfTile=(tx,ty)=>zoneAt(tx,ty);
export const districtAt=(px,py)=>DISTRICTS[zoneAt(px/T|0,py/T|0)];

// em que rua está um ponto (linha + trecho existente)
export function roadAt(px,py){
  for(let j=0;j<NH;j++){const L=HL[j];if(Math.abs(py-L.px)>L.w*T/2)continue;
    for(let i=0;i<NV-1;i++)if(segH[j][i]&&px>=VL[i].px-VL[i].w*T/2&&px<=VL[i+1].px+VL[i+1].w*T/2)return{L,horiz:true};}
  for(let i=0;i<NV;i++){const L=VL[i];if(Math.abs(px-L.px)>L.w*T/2)continue;
    for(let j=0;j<NH-1;j++)if(segV[i][j]&&py>=HL[j].px-HL[j].w*T/2&&py<=HL[j+1].px+HL[j+1].w*T/2)return{L,horiz:false};}
  return null;
}
export function streetAt(px,py){
  let h=null,v=null;
  for(let j=0;j<NH;j++){const L=HL[j];if(Math.abs(py-L.px)<=L.w*T/2){for(let i=0;i<NV-1;i++)if(segH[j][i]&&px>=VL[i].px-64&&px<=VL[i+1].px+64){h=L;break;}}}
  for(let i=0;i<NV;i++){const L=VL[i];if(Math.abs(px-L.px)<=L.w*T/2){for(let j=0;j<NH-1;j++)if(segV[i][j]&&py>=HL[j].px-64&&py<=HL[j+1].px+64){v=L;break;}}}
  if(h&&v)return h.name+' × '+v.name;
  return (h||v||{name:''}).name;
}

// semáforo: cruzamento (3+ saídas) que tem avenida
export function signalized(i,j){
  if(i<0||j<0||i>=NV||j>=NH)return false;
  if(degree(i,j)<3)return false;
  return VL[i].type==='ave'||HL[j].type==='ave';
}
const CYCLE=16; // verde 6.5s e amarelo 1.5s pra cada direção
export function signalState(i,j,axis){
  const t=(S.gameTime+(i*3+j*5)%CYCLE)%CYCLE;
  const hs=t<6.5?'g':t<8?'y':'r';
  const vs=t<8?'r':t<14.5?'g':'y';
  return axis==='h'?hs:vs;
}
