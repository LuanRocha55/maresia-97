// Menu da tela de título e da pausa (teclado e mouse)
import { S } from '../core/state.js';
import { AU, initAudio, sfxTone } from '../audio/audio.js';
import { hasSave, loadGame, deleteSave } from './save.js';
import { startTutorial } from './tutorial.js';
import { startStory } from './story.js';
import { cycleGfx, gfxLabel, toggleRetro, R } from '../render3d/r3d.js';
import { msg } from './world.js';

export const TM={sel:0,sub:null,confirmNew:false,rects:[]};

export function startGame(fresh){
  if(fresh) deleteSave();
  if(!fresh&&hasSave()) loadGame(); else { startStory(); startTutorial(); }
  S.started=true; initAudio(); if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  TM.sel=0;TM.sub=null;TM.confirmNew=false;
}
// itens do menu (rótulo e o que fazem)
export function titleItems(){
  const L=[];
  if(S.paused)L.push({id:'voltar',label:'VOLTAR PRO JOGO'});
  else if(hasSave()){L.push({id:'continuar',label:'CONTINUAR'});L.push({id:'novo',label:TM.confirmNew?'NOVO JOGO? APAGA O SAVE':'NOVO JOGO',warn:TM.confirmNew});}
  else L.push({id:'comecar',label:'COMEÇAR'});
  L.push({id:'controles',label:'CONTROLES'});
  L.push({id:'graficos',label:'GRÁFICOS',val:gfxLabel()});
  if(R.ok)L.push({id:'filtro',label:'FILTRO 97',val:R.on?(R.retro?'LIGADO':'DESLIGADO'):'SÓ NO 3D'});
  L.push({id:'som',label:'SOM',val:AU.muted?'DESLIGADO':'LIGADO'});
  return L;
}
function blip(f){sfxTone(f||660,0.05,0.05,'square');}
function activate(it){
  if(!it)return;
  if(it.id!=='novo')TM.confirmNew=false;
  switch(it.id){
    case 'voltar':S.paused=false;break;
    case 'continuar':startGame(false);break;
    case 'comecar':startGame(true);break;
    case 'novo':if(TM.confirmNew)startGame(true);else{TM.confirmNew=true;blip(330);}break;
    case 'controles':TM.sub='controles';break;
    case 'graficos':{const t=cycleGfx();if(S.started)msg(t,2);break;}
    case 'filtro':if(R.on)toggleRetro();break;
    case 'som':AU.muted=!AU.muted;break;
  }
}
// devolve true se tratou a tecla
export function titleKey(code){
  if(TM.sub){if(['Escape','Enter','Space','Backspace','KeyP'].includes(code)){TM.sub=null;blip(440);}return true;}
  const items=titleItems();
  if(code==='ArrowUp'||code==='KeyW'){TM.sel=(TM.sel+items.length-1)%items.length;TM.confirmNew=false;blip();return true;}
  if(code==='ArrowDown'||code==='KeyS'){TM.sel=(TM.sel+1)%items.length;TM.confirmNew=false;blip();return true;}
  if(code==='Enter'||code==='Space'){activate(items[TM.sel]);return true;}
  if(code==='Backspace'||code==='Delete'){if(!S.started)startGame(true);return true;}
  if((code==='Escape'||code==='KeyP')&&S.paused){S.paused=false;return true;}
  return false;
}
export function titleMouse(x,y,click){
  if(TM.sub){if(click)TM.sub=null;return;}
  for(const r of TM.rects)if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){if(TM.sel!==r.i){TM.sel=r.i;TM.confirmNew=false;}if(click)activate(titleItems()[r.i]);return;}
}
