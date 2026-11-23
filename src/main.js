// Ponto de entrada: loop principal com recuperação de erros
import { ctx, CW, CH, DPR } from './core/canvas.js';
import { normA } from './core/utils.js';
import { phones, hospitalSpot } from './world/map.js';
import { enterExit } from './game/player.js';
import { startMission, finishMission, failMission } from './game/missions.js';
import { update } from './game/update.js';
import { render } from './render/draw.js';
import { drawTitle } from './render/hud.js';
import { drawBigMap, drawMenu } from './render/overlays.js';
import { updateInterior } from './game/interior.js';
import { renderInterior } from './render/interiorDraw.js';
import { renderInterior3D } from './render3d/interior3d.js';
import { init3D, set3D, render3D, R, applyQuality, getQuality, QNAMES, gfxInfo, cycleGfx, toggleRetro } from './render3d/r3d.js';
import { signalState } from './world/districts.js';
import { msg } from './game/world.js';
import { S, player, cam, keys } from './core/state.js';
import { resetWorld } from './game/world.js';
import './core/input.js';
import { loadFonts, pf } from './render/style97.js';

// as fontes entram nas texturas do chão e dos telhados: espera carregar (no máximo 2,5 s)
await loadFonts();

resetWorld();
// gráficos: 3D por padrão. G passa por: 3D alta → 3D média → 3D leve → clássico (fica salvo no navegador)
let pref='3d';try{pref=localStorage.getItem('aq_gfx')||'3d';}catch(e){}
init3D();
const prefQ=pref==='3d'?2:pref.startsWith('3d')?(+pref[2]||0):2;
applyQuality(prefQ);set3D(pref.startsWith('3d'));
// câmera: 3/4 atrás do carro por padrão; C volta pra de cima (fica salvo)
try{R.cam34=localStorage.getItem('aq_cam')!=='cima';}catch(e){}
window.addEventListener('keydown',e=>{if(!S.started||S.menu||S.paused)return;
  if(e.code==='KeyC'){if(!R.on){msg('A câmera 3/4 só funciona no 3D (G troca).',2.5);return;}
    R.cam34=!R.cam34;R.yaw=undefined;try{localStorage.setItem('aq_cam',R.cam34?'34':'cima');}catch(err){}
    msg('Câmera '+(R.cam34?'3/4 (atrás do carro)':'de cima')+'  (C troca)',2.5);}
  else if(e.code==='KeyG')msg(cycleGfx()+'  (G troca)',2.5);
  else if(e.code==='KeyV'){if(!R.on){msg('O Filtro 97 só funciona no 3D (G troca).',2.5);return;}toggleRetro();msg('Filtro 97 '+(R.retro?'ligado':'desligado')+'  (V troca)',2.5);}});
let last=performance.now();
// F3 alterna: desligado → contador pequeno (FPS + qualidade, no topo) → painel de diagnóstico completo
// (quadros por segundo, onde o tempo vai e qual placa de vídeo o navegador está usando). Fica salvo no navegador.
const perf={mode:1,fps:0,up:0,rd:0,frames:0,acc:0,shown:{}};
try{const v=localStorage.getItem('aq_fps');if(v==='0'||v==='1'||v==='2')perf.mode=+v;}catch(e){}
window.addEventListener('keydown',e=>{if(e.code!=='F3')return;e.preventDefault();
  perf.mode=(perf.mode+1)%3;try{localStorage.setItem('aq_fps',String(perf.mode));}catch(err){}});
function drawFpsCounter(){
  const fps=perf.shown.fps, mode=R.on?'3D '+QNAMES[getQuality()]:'2D clássico';
  const t=(fps===undefined?'--':fps)+' FPS · '+mode, g=ctx;
  g.setTransform(DPR,0,0,DPR,0,0);g.font=pf(11);g.textAlign='center';
  const w=g.measureText(t).width+14,X=CW-w/2-16,Y=CH-44;g.textAlign='center';g.fillStyle='rgba(0,0,0,0.55)';g.fillRect(X-w/2,Y-12,w,16); // canto de baixo, longe do bip
  g.fillStyle=fps===undefined?'#cfcfcf':fps>=50?'#7dff6b':fps>=35?'#ffe14a':'#ff6b6b';g.fillText(t,X,Y);
}
function drawPerf(){
  const info=R.on&&!S.interior?gfxInfo():null, g=ctx;
  const lines=[perf.shown.fps+' FPS  ('+(1000/Math.max(1,perf.shown.fps)).toFixed(1)+' ms por quadro)',
    'lógica do jogo: '+perf.shown.up+' ms   ·   desenho (CPU): '+perf.shown.rd+' ms'];
  if(info){lines.push('placa de vídeo: '+info.gpu.replace(/^ANGLE \(|\)$/g,'').slice(0,70),
    'tela 3D: '+info.w+'x'+info.h+' (escala '+info.dpr.toFixed(2)+')  ·  qualidade '+QNAMES[info.quality]+'  ·  sombras '+(info.shadows?'sim':'não'),
    'chamadas de desenho: '+info.calls+'  ·  triângulos: '+Math.round(info.tris/1000)+' mil  ·  pedaços de chão: '+info.chunks);
    if(/intel|uhd|iris|microsoft basic|swiftshader|llvmpipe/i.test(info.gpu))lines.push('! O navegador está usando a placa integrada/software, não a dedicada.');
    const cpu=parseFloat(perf.shown.up)+parseFloat(perf.shown.rd), ms=1000/Math.max(1,perf.shown.fps);
    if(ms>20)lines.push(cpu<ms*0.5?'-> o gargalo é a placa de vídeo (a CPU fica esperando)':'-> o gargalo é o processador');}
  else lines.push('(modo clássico ou interior: só 2D)');
  g.setTransform(DPR,0,0,DPR,0,0);g.font=pf(12);g.textAlign='left';
  const w=Math.max(...lines.map(l=>g.measureText(l).width))+20, x=CW-w-14, y=200;
  g.fillStyle='rgba(0,0,0,0.75)';g.fillRect(x,y,w,lines.length*17+14);
  lines.forEach((l,i)=>{g.fillStyle=l[0]==='!'?'#ff7070':l[0]==='-'?'#ffd34a':i===0?'#7dff8a':'#e8e8e8';g.fillText(l,x+10,y+20+i*17);});
}
// remove qualquer coisa que tenha virado NaN/Infinity e destrava o estado
function sanitize(hard){
  const ok=v=>typeof v==='number'&&isFinite(v);
  S.cars=S.cars.filter(c=>ok(c.x)&&ok(c.y)&&ok(c.vx)&&ok(c.vy)&&ok(c.a)&&c.t);
  for(const c of S.cars){if(Math.abs(c.a)>1000)c.a=normA(c.a);}
  S.peds=S.peds.filter(p=>ok(p.x)&&ok(p.y));
  S.parts=S.parts.filter(p=>ok(p.x)&&ok(p.y)&&ok(p.size));
  if(player.car&&S.cars.indexOf(player.car)<0){player.car=null;}
  if(!ok(player.x)||!ok(player.y)){player.x=hospitalSpot.x;player.y=hospitalSpot.y;}
  if(!ok(cam.x)||!ok(cam.y)||!ok(cam.zoom)){cam.x=player.x;cam.y=player.y;cam.zoom=1;}
  if(hard&&S.mission){try{failMission('Missão reiniciada por erro.');}catch(_){S.mission=null;}}
}
function frame(now){
  let dt=Math.min(0.05,(now-last)/1000);last=now;
  requestAnimationFrame(frame); // agenda antes: um erro nunca mais congela o jogo
  try{
    let _t=performance.now();
    if(S.hitStop>0){S.hitStop-=dt;}
    else if(S.started&&!S.paused&&!S.menu&&!S.mapOpen){let rem=dt;while(rem>0){const s=Math.min(1/60,rem);if(S.interior)updateInterior(s);else update(s);rem-=s;}}

    else if(!S.started){S.gameTime+=dt;cam.x+=Math.cos(S.gameTime*0.1)*40*dt;cam.y+=Math.sin(S.gameTime*0.13)*40*dt;}
    sanitize();
    const _t2=performance.now();perf.up+=_t2-_t;
    const use3D=R.on;
    document.getElementById('gl').style.visibility=use3D?'visible':'hidden';
    if(S.interior){if(use3D)renderInterior3D();else renderInterior();}else if(use3D)render3D(signalState);else render();
    perf.rd+=performance.now()-_t2;perf.frames++;perf.acc+=now-(perf.lastNow||now);perf.lastNow=now;
    if(perf.acc>=500){perf.shown={fps:Math.round(perf.frames*1000/perf.acc),up:(perf.up/perf.frames).toFixed(1),rd:(perf.rd/perf.frames).toFixed(1)};perf.frames=0;perf.acc=0;perf.up=0;perf.rd=0;}
    if(perf.mode===2&&perf.shown.fps!==undefined)drawPerf();
    if(S.mapOpen&&!S.interior)drawBigMap();
    if(S.menu)drawMenu();
    if(!S.started||S.paused)drawTitle();
  }catch(e){
    S.errCount++;S.lastErr=(e&&e.message)||String(e);
    // onde foi (arquivo:linha do primeiro trecho do jogo na pilha), pra dar pra achar o erro pelo print
    {const m=((e&&e.stack)||'').match(/src\/[\w\/]+\.js:\d+/);if(m)S.lastErr+='  ['+m[0].slice(4)+']';}
    console.error(e);
    try{sanitize(true);}catch(_){}
  }
  if(perf.mode>0)drawFpsCounter();
  if(S.lastErr){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.font='bold 12px monospace';ctx.textAlign='left';ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,CH-20,CW,20);
    ctx.fillStyle='#ff8080';ctx.fillText('Erro recuperado ('+S.errCount+'x): '+S.lastErr.slice(0,120),8,CH-6);}
}
window.__game={S,player,cam,keys,update,render,enterExit,startMission,finishMission,phones};
requestAnimationFrame(frame);
