// Armas: tiro do jogador (a pé e do carro), loja, polícia e gangue atirando de volta
import { rand, pick, clamp, hyp, normA, fmtMoney } from '../core/utils.js';
import { solidAt, special } from '../world/map.js';
import { sfxNoise, sfxTone } from '../audio/audio.js';
import { heatStars, addHeat, msg, big, onScreen } from './world.js';
import { killPed, hurtPlayer } from './effects.js';
import { inZone } from './missions.js';
import { S, player, keys, mouse, mouseWorld } from '../core/state.js';

export const WEAPONS = {
  punho:    { name:'Punho' },
  pistola:  { name:'Pistola',        rate:0.30, dmg:40, carDmg:9, range:460, spread:0.035, pellets:1, price:300,  pack:24, snd:[0.10,0.30,2600] },
  escopeta: { name:'Escopeta',       rate:0.85, dmg:34, carDmg:7, range:250, spread:0.22,  pellets:7, price:800,  pack:12, snd:[0.28,0.50,1100] },
  smg:      { name:'Submetralhadora',rate:0.085,dmg:24, carDmg:5, range:400, spread:0.08,  pellets:1, price:1500, pack:90, snd:[0.06,0.18,3200], auto:true },
};
export const SLOTS = ['punho','pistola','escopeta','smg'];

export function hasWeapon(w){ return w==='punho' || (player.ammo[w]||0) > 0; }

export function cycleWeapon(dir){
  let i=SLOTS.indexOf(player.weapon);
  for(let k=0;k<SLOTS.length;k++){
    i=(i+dir+SLOTS.length)%SLOTS.length;
    if(hasWeapon(SLOTS[i])){ player.weapon=SLOTS[i]; break; }
  }
  sfxTone(500,0.05,0.06,'square');
}
export function selectWeapon(w){
  if(hasWeapon(w)){ player.weapon=w; sfxTone(500,0.05,0.06,'square'); }
  else msg('Tu não tem '+WEAPONS[w].name+'. Passa nas Armas do Tonhão.',2);
}

// ---- tiro (hitscan com rastro visível) ----
function castBullet(x,y,a,w,fromPlayer,shooterCar){
  const dx=Math.cos(a), dy=Math.sin(a), step=6;
  // pré-filtra só o que está perto da linha do tiro
  const peds=S.peds.filter(p=>p.state!=='dead'&&p.state!=='gone'&&p.state!=='dead2'&&hyp(p.x-x,p.y-y)<w.range+10);
  const cars=S.cars.filter(c=>c!==shooterCar&&hyp(c.x-x,c.y-y)<w.range+60);
  let ex=x, ey=y;
  for(let d=step; d<=w.range; d+=step){
    ex=x+dx*d; ey=y+dy*d;
    if(solidAt(ex,ey)){ spark(ex,ey,'#d8d0c0'); break; }
    let hit=false;
    for(const p of peds){
      if(Math.abs(p.x-ex)<7&&Math.abs(p.y-ey)<7){
        // colete (SWAT, exército...): aguenta alguns tiros
        if(p.hp>1&&w.dmg<60){p.hp--;spark(ex,ey,'#ffcf6a');}
        else{killPed(p,fromPlayer); if(fromPlayer&&p.mission&&p.mission.onPedHit)p.mission.onPedHit(p);}
        hit=true; break;
      }
    }
    if(hit)break;
    for(const c of cars){
      for(const ci of c.circles()){
        if(hyp(ci[0]-ex,ci[1]-ey)<ci[2]){
          c.damage(w.carDmg, fromPlayer?'player':null);
          if(fromPlayer){ c.lastHitBy='player'; if(c.ai==='police'&&c.hitCd<=0){addHeat(25);c.hitCd=1;} }
          spark(ex,ey,'#ffd27a'); hit=true; break;
        }
      }
      if(hit)break;
    }
    if(hit)break;
    if(!fromPlayer && player.state==='play'){
      if(player.car){
        if(player.car!==shooterCar){ for(const ci of player.car.circles()) if(hyp(ci[0]-ex,ci[1]-ey)<ci[2]){ player.car.damage(w.carDmg,null); spark(ex,ey,'#ffd27a'); hit=true; break; } }
      } else if(Math.abs(player.x-ex)<8&&Math.abs(player.y-ey)<8){ hurtPlayer(w.dmg*0.28); hit=true; }
      if(hit)break;
    }
  }
  S.tracers.push({x1:x+dx*10,y1:y+dy*10,x2:ex,y2:ey,life:0.07,max:0.07,col:fromPlayer?'255,240,150':'255,150,120'});
}
function spark(x,y,col){ for(let i=0;i<3;i++) S.parts.push({x,y,vx:rand(-60,60),vy:rand(-60,60),life:0.15,max:0.15,size:2,col:hexToRgba(col),fire:true}); }
function hexToRgba(h){ const n=parseInt(h.slice(1),16); return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','; }

export function fire(x,y,a,w,fromPlayer,shooterCar){
  for(let i=0;i<w.pellets;i++) castBullet(x,y,a+rand(-w.spread,w.spread),w,fromPlayer,shooterCar);
  // clarão do cano
  S.parts.push({x:x+Math.cos(a)*12,y:y+Math.sin(a)*12,vx:0,vy:0,life:0.06,max:0.06,size:6,col:'rgba(255,230,140,',fire:true,flash:true});
  if(onScreen(x,y,200)) sfxNoise(w.snd[0],w.snd[1],w.snd[2]);
  // pedestres em volta entram em pânico
  for(const p of S.peds){
    if(p.state!=='walk'&&p.state!=='wait')continue;
    if(p.state==='wait'&&(p.mission||p.job))continue;
    if(hyp(p.x-x,p.y-y)<300){ p.state='flee'; p.flee={x,y}; p.t=4; }
  }
}

// mira automática leve: puxa o tiro pro alvo mais próximo dentro de um cone à frente
function autoAim(x,y,a,range,cone=0.38){
  let best=null, bd=1e9;
  const consider=(tx,ty)=>{ const d=hyp(tx-x,ty-y); if(d>range||d<8)return; const da=Math.abs(normA(Math.atan2(ty-y,tx-x)-a)); if(da<cone&&d+da*400<bd){bd=d+da*400;best=Math.atan2(ty-y,tx-x);} };
  for(const p of S.peds) if(p.state!=='dead'&&p.state!=='gone'&&p.state!=='dead2') consider(p.x,p.y);
  for(const c of S.cars) if(!c.wreck&&c.driver==='ai') consider(c.x,c.y);
  return best===null?a:best;
}

function playerShoot(){
  const w0=WEAPONS[player.weapon];
  const w=player.skills.pontaria?{...w0,spread:w0.spread*0.55}:w0;
  if((player.ammo[player.weapon]||0)<=0){ msg('Sem munição!',1.2); player.fireCd=0.4; cycleWeapon(-1); return; }
  player.ammo[player.weapon]--;
  player.fireCd=w.rate;
  const useMouse=mouse.down&&mouse.active;
  if(player.car){
    const c=player.car;
    if(useMouse){ // do carro, atira na direção da mira (pela janela)
      const m=mouseWorld(), a=Math.atan2(m.y-c.y,m.x-c.x);
      fire(c.x+Math.cos(a)*(c.t.wid/2+6), c.y+Math.sin(a)*(c.t.wid/2+6), a, w, true, c);
    } else {
      const a=c.a;
      fire(c.x+Math.cos(a)*(c.t.len/2+4), c.y+Math.sin(a)*(c.t.len/2+4), a, w, true, c);
    }
  } else {
    // com mouse a mira é exata (ajuda bem pequena); no teclado, mira automática mais forte
    // câmera de ombro: mira no centro da tela com uma ajuda pequena (um pouco maior sem segurar a mira)
    const a=mouse.locked?autoAim(player.x,player.y,player.a,w.range,player.aiming?0.07:0.16):mouse.active?autoAim(player.x,player.y,player.a,w.range,0.08):autoAim(player.x,player.y,player.a,w.range,0.38);
    player.shotT=S.gameTime;
    fire(player.x,player.y,a,w,true,null);
  }
  addHeat(3);
}

// ---- loja ----
function updateShop(){
  const z=special.armas; if(!z||player.car||player.state!=='play'||S.shopCd>0)return;
  if(!inZone(player,z))return;
  for(const pad of z.pads){
    if(!inZone(player,pad))continue;
    const w=WEAPONS[pad.weapon];
    if(player.money>=w.price){
      player.money-=w.price; player.ammo[pad.weapon]=(player.ammo[pad.weapon]||0)+w.pack; player.weapon=pad.weapon;
      big(w.name.toUpperCase(),'+'+w.pack+' balas  ('+fmtMoney(w.price)+')','#ff7060',1.8);
      sfxTone(300,0.08,0.1,'square'); sfxNoise(0.1,0.2,1500);
    } else msg(w.name+' custa '+fmtMoney(w.price)+'. Tu tá liso!',2);
    S.shopCd=1.5;
  }
}

// ---- inimigos atirando ----
function enemyShooting(dt){
  const stars=heatStars();
  const tgt=player.car||player;
  for(const c of S.cars){
    if(c.wreck||c.burnT>0||c.driver!=='ai')continue;
    const police=c.ai==='police'&&stars>=2;
    const gang=S.mission&&c.mission===S.mission&&c.type==='camin'&&c.color==='#2e9e3e';
    if(!police&&!gang)continue;
    c.shootCd=(c.shootCd||rand(0.5,1.5))-dt;
    if(c.shootCd>0)continue;
    const d=hyp(tgt.x-c.x,tgt.y-c.y);
    if(d>(gang?240:300)||player.state!=='play'){ c.shootCd=0.3; continue; }
    if(!losClear(c.x,c.y,tgt.x,tgt.y)){ c.shootCd=0.3; continue; }
    const a=Math.atan2(tgt.y-c.y,tgt.x-c.x)+rand(-0.12,0.12);
    fire(c.x,c.y,a,WEAPONS.pistola,false,c);
    c.shootCd=gang?rand(1.0,1.6):rand(0.8,1.5)/(stars>=4?1.6:1);
  }
}
function losClear(ax,ay,bx,by){ const d=hyp(bx-ax,by-ay),n=Math.ceil(d/14); for(let i=1;i<n;i++){const t=i/n; if(solidAt(ax+(bx-ax)*t,ay+(by-ay)*t))return false;} return true; }

export function updateWeapons(dt){
  if(player.fireCd>0)player.fireCd-=dt;
  if(S.shopCd>0)S.shopCd-=dt;
  for(const t of S.tracers)t.life-=dt;
  S.tracers=S.tracers.filter(t=>t.life>0);
  if(player.state==='play'){
    const w=WEAPONS[player.weapon];
    const trigger=(player.car ? (keys['KeyX']||keys['ControlLeft']||keys['ControlRight']) : keys['Space']) || mouse.down;
    if(player.weapon!=='punho' && trigger && player.fireCd<=0 && (w.auto || !player.triggerLatch)) playerShoot();
    player.triggerLatch=!!trigger;
  }
  updateShop();
  enemyShooting(dt);
}

export function loseWeapons(){ player.ammo={}; player.weapon='punho'; }
