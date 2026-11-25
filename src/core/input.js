// Teclado e mouse
import { cv } from './canvas.js';
import { AU, initAudio, sfxHorn } from '../audio/audio.js';
import { msg } from '../game/world.js';
import { enterExit, punch, nearestCar } from '../game/player.js';
import { doorOf } from '../game/jobs.js';
import { S, keys, player, mouse, view } from './state.js';
import { cycleWeapon, selectWeapon } from '../game/weapons.js';
import { toggleJob } from '../game/jobs.js';
import { nearestDoor, openPlace, menuKey, menuMouse, closeMenu } from '../game/interiors.js';
import { enterInterior, interactInterior } from '../game/interior.js';
import { skipTutorial } from '../game/tutorial.js';
import { titleKey, titleMouse, startGame } from '../game/titlemenu.js';
import { mapClick } from '../render/overlays.js';
import { dialogKey, dialogAdvance, storyInteract, toggleScanner, fichaNear, fichaOf, isWitness, identifyWitness, storyOn, hasTool } from '../game/story.js';

// C: caderneta. Perto de alguém mostra a ficha da pessoa; longe de todo mundo abre as páginas (Pistas, Pessoas, Carnê, O que eu fiz)
export const CAD_PAGES=4;
function caderneta(){
  if(!storyOn())return;
  if(!hasTool('caderneta')){msg('A caderneta do teu pai tá com a tua mãe. Vai pra casa.',2.5);return;}
  const p=S.interior?null:fichaNear();
  if(p){const f=fichaOf(p);S.ficha={p,f,life:7};
    if(isWitness(p)){identifyWitness();msg('É ele! Aperta F pra falar com o Seu Bira.',4);}
    return;}
  S.cad={page:S.cad?S.cad.page:0};
}
function cadKey(code){
  const c=S.cad;
  if(code==='KeyC'||code==='Escape'||code==='Backspace'){S.cad=null;return;}
  if(code==='ArrowRight'||code==='KeyD'||code==='Tab'||code==='KeyE')c.page=(c.page+1)%CAD_PAGES;
  else if(code==='ArrowLeft'||code==='KeyA'||code==='KeyQ')c.page=(c.page+CAD_PAGES-1)%CAD_PAGES;
  else if(/^Digit[1-4]$/.test(code))c.page=+code.slice(5)-1;
}

// F / Enter / clique direito: porta do prédio tem prioridade sobre carro quando está mais perto
function interact(){
  if(S.interior){interactInterior();return;}
  if(!player.car&&player.state==='play'&&storyInteract())return; // gente da história tem prioridade quando está do lado
  if(!player.car&&player.state==='play'){
    const b=nearestDoor(40);
    if(b){ // porta só ganha se estiver mais perto que o carro
      const d=doorOf(b), c=nearestCar(26);
      const dd=Math.hypot(d.x-player.x,d.y-player.y), dc=c?Math.hypot(c.x-player.x,c.y-player.y)-c.t.wid/2:1e9;
      if(dd<=dc){if(b.kind==='estadio')openPlace(b);else enterInterior(b);return;}
    }
  }
  enterExit();
}
const toggleMap=()=>{S.mapOpen=!S.mapOpen;if(S.mapOpen)S.mapOpenedOnce=true;};

window.addEventListener('keydown',e=>{
  if(['Space','KeyX','ControlLeft','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Backspace'].includes(e.code))e.preventDefault();
  if(e.repeat){keys[e.code]=true;return;}
  keys[e.code]=true;
  if(!S.started){titleKey(e.code);return;}
  if(S.dialog){if(!S.paused){dialogKey(e.code);return;}}
  if(S.cad&&!S.paused){cadKey(e.code);return;}
  if(S.menu){menuKey(e.code);return;}
  if(S.mapOpen){if(e.code==='KeyM'||e.code==='Tab'||e.code==='Escape')S.mapOpen=false;return;}
  if(S.paused){titleKey(e.code);return;}
  if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();S.paused=true;return;}
  if(e.code==='KeyT')skipTutorial();
  if(e.code==='KeyC'){caderneta();return;}
  if(S.interior){if(e.code==='KeyF'||e.code==='Enter'||e.code==='KeyE')interactInterior();return;}
  if(e.code==='KeyR'&&!toggleScanner()&&storyOn())msg('Scanner? Só o Seu Zeca tem um.',2);
  if(e.code==='KeyM'||e.code==='Tab'){toggleMap();return;}
  if(e.code==='KeyF'||e.code==='Enter')interact();
  if(e.code==='Space'&&!player.car&&player.weapon==='punho')punch();
  if(e.code==='KeyQ')cycleWeapon(-1);
  if(e.code==='KeyE')cycleWeapon(1);
  const num={Digit1:'punho',Digit2:'pistola',Digit3:'escopeta',Digit4:'smg'}[e.code];
  if(num)selectWeapon(num);
  if(e.code==='KeyH')sfxHorn();
  if(e.code==='KeyJ')toggleJob();
  if(e.code==='KeyN'){AU.muted=!AU.muted;msg(AU.muted?'Som desligado':'Som ligado',1.5);}
});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouse.down=false;});
cv.addEventListener('contextmenu',e=>e.preventDefault());
// ---- câmera de ombro: o ponteiro fica preso no jogo e o mouse gira a câmera ----
// O primeiro clique na rua (a pé) prende o ponteiro e não atira. ESC solta (e pausa o jogo).
// Entrar em carro, menu, mapa, interior ou pausa solta sozinho (syncPointerLock, chamado todo quadro).
let unlocking=false;
const canLock=()=>S.started&&!S.paused&&!S.menu&&!S.mapOpen&&!S.dialog&&!S.cad&&view.ombro&&cv.requestPointerLock;
export function syncPointerLock(){
  if(mouse.locked&&!canLock()&&document.pointerLockElement===cv){unlocking=true;document.exitPointerLock();}
}
document.addEventListener('pointerlockchange',()=>{
  const was=mouse.locked;mouse.locked=document.pointerLockElement===cv;mouse.dx=mouse.dy=0;
  if(mouse.locked){mouse.active=false;}
  else{mouse.right=false;mouse.down=false;
    // ESC do navegador soltou o ponteiro no meio do jogo: pausa (igual jogo de PC)
    if(was&&!unlocking&&S.started&&!S.paused&&!S.menu&&!S.mapOpen)S.paused=true;}
  unlocking=false;
});
cv.addEventListener('mousemove',e=>{if(mouse.locked){mouse.dx+=e.movementX||0;mouse.dy+=e.movementY||0;}});
// com o ponteiro preso os botões vêm por mousedown/mouseup: esses chegam pra cada botão, mesmo apertando o segundo com o
// primeiro segurado (mirar + atirar); o pointerdown não chega nesse caso
cv.addEventListener('mousedown',e=>{if(!mouse.locked)return;
  if(e.button===0){mouse.down=true;if(!player.car&&player.weapon==='punho')punch();}
  else if(e.button===2){if(!player.car&&player.weapon!=='punho')mouse.right=true;else interact();}});
window.addEventListener('mouseup',e=>{if(!mouse.locked)return;if(e.button===0)mouse.down=false;if(e.button===2)mouse.right=false;});
cv.addEventListener('pointermove',e=>{if(mouse.locked)return;mouse.x=e.clientX;mouse.y=e.clientY;mouse.active=true;if(S.menu)menuMouse(e.clientX,e.clientY,false);else if(!S.started||S.paused)titleMouse(e.clientX,e.clientY,false);});
cv.addEventListener('pointerdown',e=>{
  mouse.x=e.clientX;mouse.y=e.clientY;
  if(!S.started){titleMouse(e.clientX,e.clientY,true);return;}
  if(S.dialog&&!S.paused){if(e.button===0)dialogAdvance();return;}
  if(S.cad&&!S.paused){if(e.button===0)S.cad.page=(S.cad.page+1)%CAD_PAGES;else S.cad=null;return;}
  if(S.menu){if(e.button===0)menuMouse(e.clientX,e.clientY,true);else closeMenu();return;}
  if(S.mapOpen){mapClick(e.clientX,e.clientY,e.button);return;}
  if(S.paused){titleMouse(e.clientX,e.clientY,true);return;}
  if(S.interior){mouse.active=true;if(e.button===2)interactInterior();return;}
  if(!mouse.locked&&canLock()&&(e.button===0||e.button===2)){
    try{const r=cv.requestPointerLock({unadjustedMovement:true});if(r&&r.catch)r.catch(()=>{try{cv.requestPointerLock();}catch(err){}});}catch(err){try{cv.requestPointerLock();}catch(e2){}}
    return;}
  if(mouse.locked)return; // preso: mousedown cuida (botão direito segura a mira com arma; F continua entrando no carro/porta)
  mouse.active=true;
  if(e.button===0){mouse.down=true;if(!player.car&&player.weapon==='punho')punch();}
  else if(e.button===2)interact();
});
window.addEventListener('pointerup',e=>{if(e.button===0)mouse.down=false;if(e.button===2)mouse.right=false;});
cv.addEventListener('wheel',e=>{e.preventDefault();if(S.started&&!S.paused&&!S.menu&&!S.mapOpen)cycleWeapon(e.deltaY>0?1:-1);},{passive:false});
