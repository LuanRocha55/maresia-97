// Interface (estilo 97): dinheiro em visor LCD, estrelas em pixel, vida em blocos, missão no bip,
// minimapa com moldura chanfrada, mensagens grandes em letra de impacto, tela de título e pausa.
import { ctx, CW, CH, DPR } from '../core/canvas.js';
import { clamp, hyp, fmtMoney, lerp } from '../core/utils.js';
import { T, phones, buildings } from '../world/map.js';
import { lockMask, nextDistrict } from '../game/blitz.js';
import { mini } from '../world/chunks.js';
import { heatStars } from '../game/world.js';
import { S, player, mouse, view } from '../core/state.js';
import { VERSION } from '../core/version.js';
import { clockText, darkness, weekdayShort } from '../world/time.js';
import { storyObjective, debtLine, storyOn, hasTool } from '../game/story.js';
import { storyLock } from '../game/blitz.js';
import { WEAPONS } from '../game/weapons.js';
import { districtAt, streetAt } from '../world/districts.js';
import { tut, currentStep, tutorialSteps } from '../game/tutorial.js';
import { drawIcon, KIND_ICON } from './icons.js';
import { hasSave, saveInfo } from '../game/save.js';
import { JOBS, levelOf, jobHint, jobSpots } from '../game/jobs.js';
import { cv } from '../core/canvas.js';
import { sfxTone } from '../audio/audio.js';
import { C97, pf, lf, ptxt, bevel, lcdPanel, lcdWidth, pixelStar, blocks, impact, HEAT_GRAD, pager, wrap, scanlines, gunIcon, rr } from './style97.js';
import { TM, titleItems } from '../game/titlemenu.js';

let lastDistrict='', districtFlash=0, lastFrame=performance.now(), fdt=0.016;
let shownMoney=null, moneyFlash=0, moneyDir=0, lastStars=0, starFlash=0;
let pagerKey='', pagerShake=0, lastBig=null, bigT=0;

const fmtLcd=v=>{const n=Math.max(0,Math.floor(Math.abs(v)));return (v<0?'-':'')+'$'+n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');};

// mira na posição do mouse (esconde o cursor do sistema durante o jogo)
function drawCrosshair(g){
  const playing=S.started&&!S.paused&&!S.menu&&!S.mapOpen&&player.state==='play';
  cv.style.cursor=(playing&&mouse.active)?'none':'default';
  if(!playing)return;
  let x,y;const armed=player.weapon!=='punho';
  // a pé na câmera de ombro sem o mouse preso: lembra que um clique liga o mouse na câmera
  if(view.ombro&&!mouse.locked&&!player.car)ptxt(g,'clique: o mouse gira a câmera  ·  ESC solta',CW/2,CH-10,12,'rgba(236,232,223,0.7)','center');
  if(mouse.locked){
    // câmera de ombro: a mira aparece mirando (botão direito) ou atirando, onde o tiro vai passar (perto do centro da tela)
    if(!armed||player.car||!(player.aiming||mouse.down||S.gameTime-(player.shotT??-9)<0.5))return;
    const a=player.a,d=320,p=view.project(player.x+Math.cos(a)*d,player.y+Math.sin(a)*d,0.45);
    if(p.behind)return;x=Math.round(p.x);y=Math.round(p.y);
  }else{if(!mouse.active)return;x=Math.round(mouse.x);y=Math.round(mouse.y);}
  const col=armed?'#ff5a4a':'#ffffff';
  // mira em pixel: quatro tracinhos e um ponto
  for(const [dx,dy,w,h] of [[4,-1,8,3],[-12,-1,8,3],[-1,4,3,8],[-1,-12,3,8]]){g.fillStyle='#000';g.fillRect(x+dx-1,y+dy-1,w+2,h+2);g.fillStyle=col;g.fillRect(x+dx,y+dy,w,h);}
  if(mouse.down&&armed){g.fillStyle='#000';g.fillRect(x-2,y-2,4,4);g.fillStyle=col;g.fillRect(x-1,y-1,2,2);}
}
// tecla desenhada (estilo teclado de 97) com texto ao lado
export function drawKeycap(g,key,x,y,label,size){
  size=size||14;g.font=pf(size);
  const w=Math.max(size*1.8,g.measureText(key).width+size*0.9),h=size*1.8;
  g.fillStyle='rgba(0,0,0,0.6)';g.fillRect(x+2,y-h/2+3,w,h);
  g.fillStyle='#d8d4cc';g.fillRect(x,y-h/2,w,h);
  g.fillStyle='#ffffff';g.fillRect(x,y-h/2,w,2);g.fillRect(x,y-h/2,2,h);
  g.fillStyle='#8a867e';g.fillRect(x,y+h/2-4,w,4);g.fillRect(x+w-2,y-h/2,2,h);
  g.fillStyle='#1b1b1b';g.textAlign='center';g.fillText(key,x+w/2,y+size*0.35);
  let end=x+w;
  if(label){ptxt(g,label,end+8,y+size*0.4,size,'#ffffff');g.font=pf(size);end+=8+g.measureText(label).width;}
  return end;
}
// painel escuro chanfrado com faixa de cor à esquerda (dicas e tutorial)
function panel(g,x,y,w,h,stripe){bevel(g,x,y,w,h,'rgba(16,16,20,0.94)',true,2);if(stripe){g.fillStyle=stripe;g.fillRect(x+2,y+2,5,h-4);}}
// cartão do tutorial (passo atual) e dicas de primeira vez
function drawGuide(g){
  const st=currentStep();
  if(st){
    const w=Math.min(580,CW-40),h=100,x=(CW-w)/2,y=CH-h-74;
    panel(g,x,y,w,h,tut.flash>0?C97.grana:C97.orelhao);
    ptxt(g,'COMEÇANDO  '+(tut.step+1)+'/'+tutorialSteps.length,x+18,y+20,12,C97.sodio,'left',false);
    ptxt(g,'T pula',x+w-12,y+20,11,C97.cinza,'right',false);
    ptxt(g,st.title,x+18,y+44,17,'#ffffff');
    let kx=x+18;for(const k of st.keys)kx=drawKeycap(g,k,kx,y+70,null,13)+6;
    ptxt(g,st.text,kx+(st.keys.length?8:0),y+75,13,C97.cal,'left',false);
    for(let i=0;i<tutorialSteps.length;i++){g.fillStyle=i<tut.step?C97.grana:i===tut.step?C97.orelhao:'rgba(255,255,255,0.18)';g.fillRect(x+18+i*22,y+h-12,18,5);}
  }
  let ty=Math.max(170,S.mission||S.job?170:150);
  for(const t of S.toasts){
    const a=clamp(Math.min(t.life,t.max-t.life)*2,0,1);g.globalAlpha=a;
    const w=340,x=16;g.font=pf(12);const lines=wrap(g,t.text,w-34-(t.keys.length?t.keys.length*30:0));
    const h=34+lines.length*17;
    panel(g,x,ty,w,h,C97.orelhao);
    ptxt(g,t.title,x+16,ty+21,14,C97.orelhao);
    lines.forEach((l,i)=>ptxt(g,l,x+16,ty+40+i*17,12,C97.cal,'left',false));
    if(t.keys.length){let kx=x+w-12-t.keys.length*30;for(const k of t.keys)kx=drawKeycap(g,k,kx,ty+20,null,11)+4;}
    g.globalAlpha=1;ty+=h+8;
  }
}
// borda vermelha pontilhada quando leva dano / vida baixa
let dmgPat=null;
function drawDamage(g){
  if(S.hurtT>0)S.hurtT-=fdt;
  const low=player.health<30&&player.state==='play'&&S.started;
  const a=Math.max(clamp(S.hurtT*1.6,0,0.8),low?0.25+0.2*Math.sin(S.gameTime*6):0);
  if(a<=0.01)return;
  if(!dmgPat){const c=document.createElement('canvas');c.width=c.height=4;const x=c.getContext('2d');x.fillStyle='#d01810';x.fillRect(0,0,2,2);x.fillRect(2,2,2,2);dmgPat=g.createPattern(c,'repeat');}
  g.save();g.globalAlpha=a;g.fillStyle=dmgPat;const b=Math.round(Math.min(CW,CH)*0.06);
  g.fillRect(0,0,CW,b);g.fillRect(0,CH-b,CW,b);g.fillRect(0,b,b,CH-2*b);g.fillRect(CW-b,b,b,CH-2*b);
  g.globalAlpha=a*0.6;const b2=Math.round(b*0.45);g.fillRect(b,b,CW-2*b,b2);g.fillRect(b,CH-b-b2,CW-2*b,b2);g.fillRect(b,b+b2,b2,CH-2*b-2*b2);g.fillRect(CW-b-b2,b+b2,b2,CH-2*b-2*b2);
  g.restore();
}
function timerText(t){t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}

export function drawHUD(g,tgt){
  g.setTransform(DPR,0,0,DPR,0,0);
  if(!S.started||S.paused){drawCrosshair(g);return;} // a tela de título/pausa cobre tudo
  const now=performance.now();fdt=Math.min(0.1,(now-lastFrame)/1000);lastFrame=now;
  // seta pro alvo (fora da tela)
  if(tgt){const pp=view.project(tgt.x,tgt.y,0);const sx=pp.x, sy=pp.y;
    if(pp.behind||sx<20||sx>CW-20||sy<20||sy>CH-20){
      // direção na tela: projeta o jogador e um ponto um pouco à frente dele, rumo ao alvo
      // (funciona com a câmera girada e com o alvo atrás da câmera, onde a projeção dele inverte)
      const dd=Math.max(1,hyp(tgt.x-player.x,tgt.y-player.y)), q0=view.project(player.x,player.y,0),
        q1=view.project(player.x+(tgt.x-player.x)/dd*64,player.y+(tgt.y-player.y)/dd*64,0);
      const a=Math.atan2(q1.y-q0.y,q1.x-q0.x);const r=Math.min(CW,CH)/2-50;
      const ax=CW/2+Math.cos(a)*Math.min(r*1.6,Math.abs((CW/2-40)/Math.cos(a))||r), ay=CH/2+Math.sin(a)*Math.min(r*1.6,Math.abs((CH/2-40)/Math.sin(a))||r);
      const X=clamp(ax,40,CW-40),Y=clamp(ay,60,CH-60);
      g.save();g.translate(X,Y);g.rotate(a);g.fillStyle=C97.orelhao;g.strokeStyle='#000';g.lineWidth=3;g.lineJoin='miter';
      g.beginPath();g.moveTo(18,0);g.lineTo(-10,-12);g.lineTo(-4,0);g.lineTo(-10,12);g.closePath();g.stroke();g.fill();g.restore();
      ptxt(g,Math.round(hyp(tgt.x-player.x,tgt.y-player.y)/10)+'m',X,Y+30,13,C97.orelhao,'center');}}

  // ---------- canto direito: dinheiro, estrelas, hora e bairro ----------
  {const m=player.money;if(shownMoney===null)shownMoney=m;
    if(Math.abs(m-shownMoney)>=1){const d=m-shownMoney;moneyDir=Math.sign(d);moneyFlash=0.5;
      const step=Math.max(1,Math.abs(d)*Math.min(1,fdt*6));shownMoney+=Math.sign(d)*Math.min(Math.abs(d),step);
      if(moneyDir>0&&Math.floor(now/70)%2===0)sfxTone(1500+Math.random()*200,0.02,0.02,'square');}
    else shownMoney=m;
    if(moneyFlash>0)moneyFlash-=fdt;
    const col=moneyFlash>0?(moneyDir>0?'#eaffd0':'#ff6b5a'):C97.lcd;
    const H=Math.round(clamp(CW/42,24,34));
    var pan=lcdPanel(g,fmtLcd(shownMoney),CW-16,16,H,col,'right');}
  const st=heatStars();
  if(st>lastStars)starFlash=1.2;lastStars=st;if(starFlash>0)starFlash-=fdt;
  {const px=2.6,sw=10*px+5;let y=pan.y+pan.h+8;
    for(let i=0;i<6;i++){const x=CW-16-(6-i)*sw+5;const on=i<st;const fresh=on&&i===st-1&&starFlash>0&&Math.floor(now/90)%2===0;
      const wanted=on&&st>0&&Math.floor(S.gameTime*4)%2===0&&player.heat>0;
      pixelStar(g,x,y,px,fresh?2:on?(wanted&&st>=4?2:1):0);}
    y+=9*px+20;
    ptxt(g,(darkness()>0.5?'☾ ':'☀ ')+weekdayShort()+' '+clockText(),CW-16,y,15,'#ffe9a0','right');y+=18;
    {const dl=debtLine();if(dl){ptxt(g,dl,CW-16,y,12,dl.includes('✔')?C97.grana:C97.sodio,'right');y+=16;}}
    if(storyOn()&&S.story.scanner){ptxt(g,'📻 SCANNER',CW-16,y,12,Math.floor(S.gameTime*2)%2?'#7dff6b':'#3f8f36','right');y+=16;}
    const D=districtAt(player.x,player.y);const sn=streetAt(player.x,player.y);
    ptxt(g,D.name.toUpperCase(),CW-16,y,14,'#ffffff','right');y+=16;
    if(sn){ptxt(g,sn,CW-16,y,12,C97.cinza,'right');y+=16;}
    const nd=nextDistrict();if(nd&&storyLock(nd)){y+=4;ptxt(g,nd.name+': abre no '+nd.story,CW-16,y,12,C97.sodio,'right');}
    else if(nd){const f=Math.max(0,nd.meta-Math.floor(player.money));y+=4;ptxt(g,f<=0?'Libera '+nd.name+': já dá!':'Libera '+nd.name+': faltam '+fmtMoney(f),CW-16,y,12,f<=0?C97.grana:C97.sodio,'right');}
    if(D.name!==lastDistrict){if(lastDistrict)districtFlash=2.6;lastDistrict=D.name;}}

  // ---------- canto esquerdo: vida, colete, carro, arma ----------
  {let y=16;const bw=Math.round(clamp(CW/80,13,17)),bh=Math.round(bw*0.78);
    const blinkV=player.health<30&&Math.floor(now/250)%2===0;
    blocks(g,16,y,10,clamp(player.health/100,0,1),bw,bh,'#e8352b','#ff8a70','#8f160f','#3a1010',blinkV);y+=bh+8;
    if(player.armor>0){blocks(g,16,y,10,clamp(player.armor/100,0,1),bw,Math.round(bh*0.5),'#8fb6d6','#d0e6f5','#4e6f8a','#1b2630');y+=Math.round(bh*0.5)+8;}
    if(player.car){const c=player.car,f=clamp(c.health/c.t.hp,0,1);
      blocks(g,16,y,10,f,bw,Math.round(bh*0.5),f>0.35?'#3d9bff':'#ff9100',f>0.35?'#9fd0ff':'#ffd08a',f>0.35?'#1f4f8a':'#8a4a00','#141c2a',f<=0.35&&Math.floor(now/250)%2===0);y+=Math.round(bh*0.5)+8;
      ptxt(g,c.t.name.toUpperCase()+'  '+Math.round(Math.max(0,c.fwdSpeed())*0.36)+' KM/H',18,y+12,14,'#ffffff');y+=22;}
    // arma
    const wk=player.weapon,w=WEAPONS[wk];const bx=16,by=y+2,BW=58,BH=42;
    bevel(g,bx,by,BW,BH,'#1d1d22',true,2);gunIcon(g,wk,bx+5,by+7,3);
    ptxt(g,w.name.toUpperCase(),bx+BW+10,by+17,15,wk==='punho'?C97.cal:'#ffffff');
    if(wk!=='punho')ptxt(g,String(player.ammo[wk]||0),bx+BW+10,by+36,17,C97.orelhao);
    ptxt(g,player.car?'clique atira · X pra frente':'clique/ESPAÇO usa · roda troca',bx,by+BH+16,10,'rgba(236,232,223,0.6)');}

  // ---------- centro do topo: o bip (missão / emprego) ----------
  {const pw=Math.round(clamp(CW-500,300,470)),px=Math.round((CW-pw)/2);
    let key='',box=null,timer=null,foot=null;
    if(S.mission){key='m'+S.mission.title+S.mission.text;
      if(key!==pagerKey){pagerShake=0.6;if(S.started)[1320,1320].forEach((f,i)=>sfxTone(f,0.07,0.05,'square',i*0.12));}
      box=['MARESIA·BIP','MISSÃO',[S.mission.title.toUpperCase(),'ORELHÃO'],S.mission.text];
      if(S.mission.time!==undefined)timer=S.mission.time;}
    else if(S.job){const j=S.job;key='j'+j.type+j.text;
      if(key!==pagerKey){pagerShake=0.4;if(S.started)sfxTone(1180,0.06,0.04,'square');}
      box=['MARESIA·BIP',JOBS[j.type].title.toUpperCase(),['NÍVEL '+levelOf(j.type)+' · SEQ '+j.streak,'TURNO '+fmtMoney(j.earned)],j.text];
      if(j.time!==undefined)timer=j.time;foot='J encerra o turno';}
    else{const o=player.state==='play'&&!tut.active&&!S.interior?storyObjective():null;
      if(o){key='s'+o.title+o.text;if(key!==pagerKey){pagerShake=0.5;if(S.started)[990,1320].forEach((f,i)=>sfxTone(f,0.07,0.05,'square',i*0.12));}
        box=['MARESIA·BIP',o.title,[(S.story.ch===0?'SEMANA 1':'QUEM PLANTOU O FLAGRANTE?'),hasTool('caderneta')?'C CADERNETA':''],o.text];}}
    pagerKey=key;
    if(box){if(pagerShake>0)pagerShake-=fdt;const sx=pagerShake>0?Math.round(Math.sin(now/18)*3*pagerShake/0.6):0;
      const r=pager(g,px+sx,12,pw,box[0],box[1],box[2],box[3],{fs:15,blink:pagerShake>0});
      let yy=r.y+r.h+6;
      if(timer!==null){const urgent=timer<(S.mission?15:10);const tt=timerText(timer);const H=22;const tw=lcdWidth(tt,H)+14;
        lcdPanel(g,tt,CW/2-tw/2,yy,H,urgent?(Math.floor(now/250)%2?'#ff5040':'#ffb0a0'):C97.lcd);yy+=H+18;}
      if(foot)ptxt(g,foot,CW/2,yy+10,11,'rgba(236,232,223,0.6)','center');}
    else if(S.phoneCd<=0&&player.state==='play'&&!tut.active&&!S.interior)
      ptxt(g,'Orelhão tocando = missão  ·  J = empregos',CW/2,30,13,'#ffe9a0','center');}
  {const h=jobHint();if(h){g.font=pf(14);const w=g.measureText(h).width+36;drawKeycap(g,'J',CW/2-w/2,CH-90,h,14);}}
  if(player.bustT>0.15)impact(g,'PARADO AÍ!',CW/2,CH*0.3,Math.round(clamp(CW/40,22,34)),'#5aa0ff');

  // nome do bairro grande quando cruza a divisa
  if(districtFlash>0){districtFlash-=fdt;const a=clamp(districtFlash,0,1);g.globalAlpha=a;
    const in_=clamp((2.6-districtFlash)*6,0,1);
    impact(g,districtAt(player.x,player.y).name.toUpperCase(),CW/2+(1-in_)*-40,Math.max(150,CH*0.22),Math.round(clamp(CW/44,20,32)),C97.orelhao);g.globalAlpha=1;}
  drawGuide(g); // dicas ficam por baixo das mensagens grandes
  // mensagens
  {let my=CH-36;for(let i=S.messages.length-1;i>=0;i--){const m=S.messages[i];g.globalAlpha=clamp(m.life,0,1);ptxt(g,m.t,CW/2,my,16,'#ffffff','center');my-=22;}g.globalAlpha=1;}
  // mensagem grande: faixa compacta no alto da tela (não tapa a rua), entra deslizando
  if(S.bigMsg){const b=S.bigMsg;if(b!==lastBig){lastBig=b;bigT=0;}bigT+=fdt;
    const a=clamp(b.life*2,0,1)*clamp(bigT*6,0,1);g.globalAlpha=a;
    const T_=b.t.toUpperCase(),size=Math.round(clamp(CW/40,22,34)),y=Math.max(180,CH*0.25)+(1-clamp(bigT*6,0,1))*-12;
    g.font=lf(size);const tw=g.measureText(T_).width;g.font=pf(14);const sw=b.sub?g.measureText(b.sub).width:0;
    const w=Math.max(tw+60,sw+40),h=b.sub?size+34:size+16,x=CW/2-w/2;
    g.fillStyle='rgba(8,8,12,0.72)';g.fillRect(x,y-size-6,w,h);g.fillStyle=b.col;g.fillRect(x,y-size-6,w,3);
    impact(g,T_,CW/2,y,size,b.col);
    if(b.sub)ptxt(g,b.sub,CW/2,y+22,14,'#ffffff','center');g.globalAlpha=1;}

  // ---------- minimapa ----------
  const MS=Math.round(Math.min(200,CW*0.22)),VIEW=70; const mx=18,my2=CH-MS-18;
  bevel(g,mx-4,my2-4,MS+8,MS+8,'#000',true,3);
  g.save();g.beginPath();g.rect(mx,my2,MS,MS);g.clip();
  const ptx=player.x/T,pty=player.y/T;g.imageSmoothingEnabled=false;
  // câmera 3/4: o minimapa gira junto, com a frente da câmera pra cima
  const rot=view.r34&&!S.interior?-(view.yaw+Math.PI/2):0, rc=Math.cos(rot), rs=Math.sin(rot), MC=[mx+MS/2,my2+MS/2];
  {const V2=rot?VIEW*1.42:VIEW, M2=MS*V2/VIEW;
    g.save();g.translate(MC[0],MC[1]);g.rotate(rot);
    g.drawImage(mini,ptx-V2/2,pty-V2/2,V2,V2,-M2/2,-M2/2,M2,M2);
    g.drawImage(lockMask(),(ptx-V2/2)*2,(pty-V2/2)*2,V2*2,V2*2,-M2/2,-M2/2,M2,M2);g.restore();}
  const toM=(x,y)=>{const dx=(x/T-ptx)*MS/VIEW,dy=(y/T-pty)*MS/VIEW;return[MC[0]+dx*rc-dy*rs,MC[1]+dx*rs+dy*rc];};
  const inMini=p=>!(p[0]<mx-8||p[0]>mx+MS+8||p[1]<my2-8||p[1]>my2+MS+8);
  {const ringing=!S.mission&&!S.job&&S.phoneCd<=0;for(const ph of phones){const p=toM(ph.x,ph.y);if(!inMini(p))continue;g.globalAlpha=ringing?1:0.4;drawIcon(g,'phone',p[0],p[1],12);g.globalAlpha=1;}}
  for(const b of buildings){const k=KIND_ICON[b.kind];if(!k)continue;const p=toM((b.x0+b.x1)/2,(b.y0+b.y1)/2);if(!inMini(p))continue;drawIcon(g,k,p[0],p[1],14);}
  for(const sp of jobSpots()){if(!sp.terminal&&!sp.ponto)continue;const p=toM(sp.x,sp.y);if(!inMini(p))continue;drawIcon(g,sp.terminal?'terminal':'taxi',p[0],p[1],14);}
  if(S.waypoint&&!S.mission&&!S.job){const p=toM(S.waypoint.x,S.waypoint.y);drawIcon(g,'waypoint',clamp(p[0],mx+7,mx+MS-7),clamp(p[1],my2+7,my2+MS-7),14);}
  for(const c of S.cars){if(c.ai!=='police')continue;const p=toM(c.x,c.y);g.fillStyle=Math.floor(S.gameTime*6)%2?'#ff3030':'#3a6bff';g.fillRect(p[0]-3,p[1]-3,6,6);g.strokeStyle='#000';g.lineWidth=1;g.strokeRect(p[0]-3,p[1]-3,6,6);}
  {const pp=toM(player.x,player.y);g.save();g.translate(pp[0],pp[1]);g.rotate(player.a+rot);g.fillStyle='#fff';g.strokeStyle='#000';g.lineWidth=2;g.beginPath();g.moveTo(7,0);g.lineTo(-5,-5);g.lineTo(-5,5);g.closePath();g.stroke();g.fill();g.restore();}
  if(tgt){const p=toM(tgt.x,tgt.y);const cp=[clamp(p[0],mx+5,mx+MS-5),clamp(p[1],my2+5,my2+MS-5)];g.fillStyle=C97.orelhao;g.fillRect(cp[0]-4,cp[1]-4,8,8);g.strokeStyle='#000';g.lineWidth=2;g.strokeRect(cp[0]-4,cp[1]-4,8,8);}
  g.restore();
  // N em cima do minimapa
  // (com o minimapa girando, o N anda pela borda apontando pro norte)
  {const nx=rs,ny=-rc,k=(MS/2)/Math.max(Math.abs(nx),Math.abs(ny)),NX=MC[0]+nx*k,NY=MC[1]+ny*k;
    g.fillStyle='#000';g.fillRect(NX-9,NY-8,18,16);ptxt(g,'N',NX,NY+5,13,C97.orelhao,'center',false);}
  ptxt(g,'P pausa · M mapa',CW-16,CH-14,11,'rgba(236,232,223,0.55)','right');
  if(S.saveFlash>0){g.globalAlpha=clamp(S.saveFlash,0,1);ptxt(g,'✔ JOGO SALVO',mx,my2-16,13,C97.grana);g.globalAlpha=1;}
  drawDamage(g);
  drawCrosshair(g);
}
// estrela antiga (outros desenhos ainda podem usar)
export function drawStar(g,x,y,r,col){pixelStar(g,x-r,y-r,r/5,col==='#ffffff'?2:col.startsWith('rgba')?0:1);}

// HUD enxuto dentro dos comércios/casa
export function drawInteriorHUD(g,title,hint){
  impact(g,title.toUpperCase(),CW/2,46,Math.round(clamp(CW/36,22,34)),C97.orelhao);
  lcdPanel(g,fmtLcd(player.money),CW-16,16,Math.round(clamp(CW/42,24,34)),C97.lcd,'right');
  const bw=Math.round(clamp(CW/80,13,17));
  blocks(g,16,16,10,clamp(player.health/100,0,1),bw,Math.round(bw*0.78),'#e8352b','#ff8a70','#8f160f','#3a1010');
  if(hint)ptxt(g,hint,CW/2,CH-22,13,'rgba(236,232,223,0.75)','center');
}

// ---------------- tela de título e pausa ----------------
const CONTROLS=[
  ['WASD / setas','dirigir ou andar'],['ESPAÇO','freio de mão (carro) / soco (a pé)'],['F ou ENTER','entrar, sair, roubar carro'],
  ['SHIFT','correr a pé'],['H','buzina'],['Q / E ou 1-4','trocar arma'],['X','atirar do carro pra frente'],
  ['MOUSE','a pé: clique prende o mouse e ele gira a câmera · direito segura a mira · esquerdo atira · roda troca arma'],['M ou TAB','mapa (guia de ruas)'],['J','empregos: táxi, motoboy, busão, guincho, vigilante'],
  ['C','caderneta: perto de alguém mostra quem é; longe, abre as páginas'],['R','scanner da polícia (depois que o Zeca te der)'],
  ['V','câmera: atrás do carro e no ombro a pé, ou de cima'],['G','gráficos (3D alta, média, leve, clássico) · Filtro 97 fica no menu'],['N','som'],['P ou ESC','pausa'],['F3','desempenho'],
];
const TIPS=['Toda sexta até as 20h: parcela do Cabralzinho.','Orelhão amarelo tocando = missão no bip.','PINTURA EXPRESS ($500 por estrela) apaga a polícia.','OFICINA DO ZÉ compra carro roubado.','ARMAS DO TONHÃO vende arma · POSTO conserta o carro ($150).'];
export function drawTitle(){
  const g=ctx;g.setTransform(DPR,0,0,DPR,0,0);
  const now=performance.now();
  g.fillStyle=S.paused?'rgba(6,6,10,0.62)':'rgba(6,6,10,0.5)';g.fillRect(0,0,CW,CH);
  const bar=Math.round(CH*0.07);g.fillStyle='#000';g.fillRect(0,0,CW,bar);g.fillRect(0,CH-bar,CW,bar);
  scanlines(g,CW,CH,0.18);
  const s=clamp(Math.min(CW/1280,CH/720),0.55,1.4);
  const lx=Math.round(CW*0.07);
  // logo
  const ls=Math.round(118*s);
  // "MARESIA 97" numa linha só: o 97 vem logo depois do nome
  impact(g,'MARESIA',lx,bar+ls*1.05,ls,null,'left',HEAT_GRAD);
  g.font=lf(ls);const mw=g.measureText('MARESIA').width;
  impact(g,'97',lx+mw+ls*0.28,bar+ls*1.05,ls,C97.sodio,'left');
  const logoB=bar+ls*1.45; // embaixo do logo
  g.save();g.font=pf(20*s);const sub='GUANABARA  ·  ',yr='1997';
  let sx=lx+ls*0.1;const sy=logoB;
  for(const ch of sub){ptxt(g,ch,sx,sy,20*s,C97.cal);g.font=pf(20*s);sx+=g.measureText(ch).width+6*s;}
  for(const ch of yr){ptxt(g,ch,sx,sy,20*s,C97.sodio);g.font=pf(20*s);sx+=g.measureText(ch).width+6*s;}
  g.restore();
  if(TM.sub==='controles'){drawControls(g,s,bar);return;}
  // menu
  const items=titleItems();if(TM.sel>=items.length)TM.sel=0;
  const fs=Math.round(26*s),lh=Math.round(fs*1.32);let my=Math.round(logoB+lh*1.6);
  TM.rects=[];
  if(S.paused){ptxt(g,'PAUSADO',lx+4,my,fs*0.8,C97.sodio);my+=lh;}
  items.forEach((it,i)=>{const sel=i===TM.sel,x=lx+fs*1.2;
    if(sel&&Math.floor(now/400)%2===0){g.fillStyle='#000';g.beginPath();g.moveTo(lx+4+2,my-fs*0.62+2);g.lineTo(lx+4+fs*0.62+2,my-fs*0.3+2);g.lineTo(lx+4+2,my+2);g.fill();
      g.fillStyle=it.warn?C97.perigo:C97.orelhao;g.beginPath();g.moveTo(lx+4,my-fs*0.62);g.lineTo(lx+4+fs*0.62,my-fs*0.3);g.lineTo(lx+4,my);g.fill();}
    ptxt(g,it.label,x,my,fs,sel?(it.warn?C97.perigo:C97.orelhao):'#bdb9b0');
    g.font=pf(fs);const w=g.measureText(it.label).width;
    if(it.val)ptxt(g,it.val,x+w+fs*0.6,my,fs*0.68,sel?C97.cal:C97.cinza);
    TM.rects.push({x:lx,y:my-fs,w:Math.max(260*s,w+fs*6),h:lh,i});
    my+=lh;});
  // bip com o resumo do save (ou recorde)
  const pw=Math.round(clamp(CW*0.3,250,400)),px=CW-pw-Math.round(CW*0.05);
  const info=saveInfo();
  if(info||S.paused){const d=info||{};const h=Math.floor(d.tod||S.tod||0),mi=Math.floor((((d.tod||S.tod||0))-h)*60);
    const money=S.paused?player.money:(d.money||0),open=(S.paused?S.unlocked:d.unlocked)||[];
    const nOpen=Array.isArray(open)?open.length:Object.values(open).filter(Boolean).length;
    pager(g,px,CH-bar-120*s-40,pw,S.paused?'AGORA':'JOGO SALVO','v'+VERSION,[String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0')+' NO JOGO',Math.floor((S.paused?S.playTime:d.playTime||0)/60)+' MIN'],
      fmtMoney(money)+(nOpen?' · '+nOpen+' bairros abertos':'')+' · recorde '+fmtMoney(S.best),{fs:Math.round(15*s)});}
  else{const t=TIPS[Math.floor(now/3500)%TIPS.length];g.font=pf(14*s);ptxt(g,t,CW-Math.round(CW*0.05),CH-bar-40*s,14*s,'#ffe9a0','right');}
  ptxt(g,(S.paused?'ESC volta':'ENTER escolhe')+' · W/S anda · clique também funciona · versão '+VERSION,CW/2,CH-bar/2+5,Math.max(10,12*s),C97.cinza,'center',false);
}
function drawControls(g,s,bar){
  const w=Math.min(660,CW*0.56),fs=Math.round(15*s),lh=Math.round(fs*1.55),h=CONTROLS.length*lh+70,x=CW-w-Math.round(CW*0.04),y=Math.max(bar+10,CH-bar-h-20);
  bevel(g,x,y,w,h,'rgba(14,14,18,0.96)',true,3);
  impact(g,'CONTROLES',x+20,y+40,Math.round(30*s),C97.orelhao,'left');
  CONTROLS.forEach(([k,v],i)=>{const yy=y+70+i*lh;ptxt(g,k,x+24,yy,fs,C97.sodio);ptxt(g,v,x+24+w*0.3,yy,fs,C97.cal);});
  ptxt(g,'ESC, ENTER ou clique volta',x+w-16,y+h-12,Math.max(10,11*s),C97.cinza,'right',false);
}
