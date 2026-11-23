// Procurado, mensagens, câmera auxiliar e spawn de carros/pedestres
import { spawnOnRoad } from '../ai/traffic.js';
import { reportPlayer } from '../ai/police.js';
import { START_OPEN, initDistricts } from './blitz.js';
import { setupJobSpots } from './jobs.js';
import { CW, CH } from '../core/canvas.js';
import { rand, randi, pick, clamp, hyp } from '../core/utils.js';
import { T, SAND, SIDE, GRASS, DX, DY, hospitalSpot, tileAt } from '../world/map.js';
import { CT, TRAFFIC_MIX, Car } from '../entities/vehicles.js';
import { Ped } from '../entities/peds.js';
import { S, player, cam, view } from '../core/state.js';

export function heatStars(){return clamp(Math.floor((player.heat+50)/100),0,6);}
export function addHeat(v){reportPlayer();const before=heatStars();player.heat=clamp(player.heat+v,0,660);const now=heatStars();
  if(now>before){if(before===0)msg('A polícia tá de olho em tu!');
    else if(now===4)big('SWAT NA RUA','Van blindada e equipe armada','#ff5050',2.4);
    else if(now===5)big('O FBI ENTROU NO CASO','Sedãs pretos mais rápidos que tu','#ff5050',2.4);
    else if(now===6)big('CHAMARAM O EXÉRCITO','Jipes, blindado e soldados','#ff3030',2.6);}}
// quem a polícia manda, conforme as estrelas
export function policeUnit(stars){
  const r=Math.random();
  if(stars>=6)return r<0.4?'exercito':r<0.55?'blindado':r<0.8?'fbi':'swat';
  if(stars>=5)return r<0.5?'fbi':r<0.75?'swat':'viatura';
  if(stars>=4)return r<0.4?'swat':'viatura';
  return 'viatura';
}
export const UNIT_COLOR={viatura:'#20242c',swat:'#15171c',fbi:'#0b0b0d',exercito:'#4b5320',blindado:'#3d4419'};
export function msg(t,dur){S.messages.push({t,life:dur||3.5});if(S.messages.length>4)S.messages.shift();}
export function big(t,sub,col,dur){S.bigMsg={t,sub,col:col||'#ffd84a',life:dur||3,max:dur||3};}
export function onScreen(x,y,m){m=m||80;
  // câmera 3/4: a tela não é um retângulo em volta do jogador, então pergunta pra projeção
  if(view.r34){const p=view.project(x,y,0);return !p.behind&&p.x>-m&&p.x<CW+m&&p.y>-m&&p.y<CH+m;}
  const hw=CW/2/cam.zoom+m, hh=CH/2/cam.zoom+m;return Math.abs(x-cam.x)<hw&&Math.abs(y-cam.y)<hh;}
export function viewR(){return hyp(CW,CH)/2/cam.zoom+70;}

export function resetWorld(){
  S.cars=[];S.peds=[];S.parts=[];S.skids=[];S.decals=[];
  player.x=hospitalSpot.x;player.y=hospitalSpot.y;player.car=null;player.health=100;player.heat=0;player.state='play';
  const c=new Car('jegue',hospitalSpot.x+60,hospitalSpot.y+T*0.2,0,'#d35400');S.cars.push(c); // carro na calçada
  cam.x=player.x;cam.y=player.y;
  for(let i=0;i<40;i++)spawnTraffic(150,1600,true);
  for(let i=0;i<55;i++)spawnPed(60,1100,true);
  S.job=null;S.day=0;S.lastTod=S.tod;S.match=null;S.unlocked=[...START_OPEN];initDistricts();setupJobSpots();
}

export function spawnTraffic(rmin,rmax,ignoreView,type,ai,pred){return spawnOnRoad(rmin,rmax,ignoreView,type,ai,pred);}
export function spawnPed(rmin,rmax,ignoreView){
  for(let tries=0;tries<12;tries++){
    const ang=Math.random()*Math.PI*2, d=rand(rmin,rmax);
    const x=player.x+Math.cos(ang)*d, y=player.y+Math.sin(ang)*d;
    const t=tileAt(x,y); if(t!==SIDE&&!(t===SAND&&Math.random()<.6)&&!(t===GRASS&&Math.random()<.3))continue;
    if(!ignoreView&&onScreen(x,y,40))continue;
    const p=new Ped(x,y);S.peds.push(p);return p;
  }
}
