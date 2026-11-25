// Save do jogo no navegador (localStorage): automático a cada 45s e manual na sua casa
import { VERSION } from '../core/version.js';
import { Car, CT } from '../entities/vehicles.js';
import { heatStars, msg } from './world.js';
import { solidAt } from '../world/map.js';
import { S, player, cam } from '../core/state.js';
import { START_OPEN, initDistricts, restrictedAt } from './blitz.js';
import { migrateOldSave, newStory } from './story.js';

const KEY='aq_save';

export function saveInfo(){ try{ return JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ return null; } }
export const hasSave = () => !!saveInfo();
export function deleteSave(){ try{ localStorage.removeItem(KEY); }catch(e){} }

export function saveGame(silent){
  if(player.state!=='play') return false;
  const c=player.car;
  const d={ v:VERSION, t:Date.now(),
    money:player.money, health:player.health, armor:player.armor,
    ammo:player.ammo, weapon:player.weapon, skills:player.skills,
    missionIdx:S.missionIdx, tod:S.tod, day:S.day||0, playTime:S.playTime||0, unlocked:S.unlocked, story:S.story||null,
    x:player.x, y:player.y,
    car: c&&!c.wreck&&c.burnT<=0 ? {type:c.type,color:c.color,a:c.a,health:c.health} : null };
  try{ localStorage.setItem(KEY,JSON.stringify(d)); S.saveFlash=2.5; if(!silent)msg('Jogo salvo.',2); return true; }
  catch(e){ if(!silent)msg('Este navegador não deixou salvar.',2.5); return false; }
}

// chamado depois de resetWorld(): coloca o jogador onde parou
export function loadGame(){
  const d=saveInfo(); if(!d) return false;
  player.money=d.money||0; player.health=d.health||100; player.armor=d.armor||0;
  player.ammo=d.ammo||{}; player.weapon=d.weapon||'punho';
  if(player.weapon!=='punho'&&!(player.ammo[player.weapon]>0)) player.weapon='punho';
  Object.assign(player.skills, d.skills||{});
  S.missionIdx=d.missionIdx||0; S.tod=(typeof d.tod==='number')?d.tod:16.5; S.playTime=d.playTime||0;
  S.day=d.day||0; S.lastTod=S.tod; S.match=null;
  // bairros: saves de antes da 1.4 não tinham isso -> começa do zero (dinheiro zerado, só Centro e Jardim)
  if(Array.isArray(d.unlocked)) S.unlocked=[...d.unlocked];
  else { S.unlocked=[...START_OPEN]; player.money=0; S.migratedDistricts=true; }
  initDistricts();
  // saves de antes da cidade atual (a cidade cresceu na 1.8.0) não têm posição válida: começa no hospital
  const [ma,mi]=(d.v||'0.0').split('.').map(Number);
  const sameCity=ma>1||(ma===1&&mi>=8);
  if(sameCity&&typeof d.x==='number'&&isFinite(d.x)&&!solidAt(d.x,d.y)&&!restrictedAt(d.x,d.y)){ player.x=d.x; player.y=d.y; }
  else d.car=null;
  if(d.car&&CT[d.car.type]){
    const c=new Car(d.car.type,player.x,player.y,d.car.a||0,d.car.color);
    c.health=d.car.health||c.t.hp; c.driver='player'; S.cars.push(c); player.car=c;
    if(c.hits(c.x,c.y,c.a)) c.unstick();
  }
  cam.x=player.x; cam.y=player.y;
  // história (1.21.0): save sem história acorda em casa no domingo da Semana 1, com o dinheiro e os níveis de emprego.
  // Os bairros voltam a fechar, porque agora abrem pela história.
  if(d.story){ S.story=Object.assign(newStory(),d.story); }
  else {
    if(player.car){ const i=S.cars.indexOf(player.car); if(i>=0)S.cars.splice(i,1); player.car=null; }
    S.unlocked=[...START_OPEN]; initDistricts(); migrateOldSave();
  }
  return true;
}

let autoT=45;
export function autosave(dt){
  S.playTime=(S.playTime||0)+dt;
  if(S.saveFlash>0) S.saveFlash-=dt;
  autoT-=dt;
  if(autoT<=0){ autoT=45; if(!S.mission&&heatStars()===0) saveGame(true); }
}

export function saveSummary(){
  const d=saveInfo(); if(!d) return '';
  const h=Math.floor(d.tod||0), m=Math.floor(((d.tod||0)-h)*60);
  const min=Math.floor((d.playTime||0)/60);
  return '$ '+Math.floor(d.money||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' · '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+' no jogo · '+min+' min jogados';
}
