// Interiores: ao entrar num lugar, o jogo troca pra uma cena interna onde dá pra andar.
// Cada tipo de lugar tem uma planta em texto (fácil de editar):
//   #  parede        .  chão         E  saída (tapete)
//   S  prateleira    F  geladeira    C  balcão        T  mesa       c  cadeira (passa por cima)
//   B  cama          D  mesa de trabalho/computador   K  quadro-negro  P  planta    V  sofá
//   R  arara de armas na parede      G  alvo do estande   J  grade (cela)   X  estante com TV de tubo
//   a  atendente     1  ponto de atendimento (balcão)  2  cama (casa/hospital)  3  computador (salvar)  4  professor
import { rand, pick, hyp } from '../core/utils.js';
import { openPlace, placeTitle } from './interiors.js';
import { doorOf } from './jobs.js';
import { heatStars, msg } from './world.js';
import { sfxTone } from '../audio/audio.js';
import { S, player, keys } from '../core/state.js';

const PLANS = {
  loja: [
    '####################',
    '#SS.SS.SS.SS..FFFF.#',
    '#..................#',
    '#SS.SS.SS.SS.......#',
    '#..............P...#',
    '#SS.SS.SS.SS.......#',
    '#..................#',
    '#.........CCCCCCC..#',
    '#.........C..a..C..#',
    '#P...........1.....#',
    '#..................#',
    '#.......EEE........#',
    '####################'],
  lanchonete: [
    '####################',
    '#FF.CCCCCCCCC.FF...#',
    '#.....a............#',
    '#....CCCCCCCCC.....#',
    '#.........1........#',
    '#..................#',
    '#.cTc..cTc..cTc..P.#',
    '#..................#',
    '#.cTc..cTc..cTc....#',
    '#..................#',
    '#P......EEE......P.#',
    '####################'],
  hospital: [
    '######################',
    '#B.2B..B..B..P..B..B.#',
    '#....................#',
    '#....................#',
    '#P...................#',
    '#........CCCCCC......#',
    '#........C.a..C......#',
    '#...........1........#',
    '#.cccc...............#',
    '#.cccc...........P...#',
    '#.........EEE........#',
    '######################'],
  policia: [
    '######################',
    '#JJJJJJJJ....DD..DD..#',
    '#J......J....c...c...#',
    '#J......J............#',
    '#JJJJJJJJ....DD..DD..#',
    '#............c...c...#',
    '#P...................#',
    '#........CCCCCC......#',
    '#........C.a..C......#',
    '#...........1....cccc#',
    '#.........EEE........#',
    '######################'],
  armas: [
    '######################',
    '#RRRRRRRR.....GG.GG.G#',
    '#....................#',
    '#S..S................#',
    '#S..S........-.-.-.-.#',
    '#....................#',
    '#.CCCCCCC............#',
    '#.C.a...C............#',
    '#....1...............#',
    '#P...................#',
    '#........EEE.........#',
    '######################'],
  escola: [
    '######################',
    '#KKKKKKKKKK..........#',
    '#.....4.........P....#',
    '#....................#',
    '#.D.D.D.D.D.D........#',
    '#.c.c.c.c.c.c........#',
    '#....................#',
    '#.D.D.D.D.D.D......SS#',
    '#.c.c.c.c.c.c........#',
    '#....................#',
    '#........EEE.........#',
    '######################'],
  casa: [
    '##################',
    '#BB2....#..CCCFF.#',
    '#BB.....#........#',
    '#.......#...TTT..#',
    '#P..........ccc.P#',
    '###.#####........#',
    '#..........VVV...#',
    '#D3..............#',
    '#D..........X....#',
    '#.......EEE......#',
    '##################'],
};
const KIND_PLAN={farmacia:'loja',mercadinho:'loja',padaria:'loja',lojaposto:'loja',lanchonete:'lanchonete',hospital:'hospital',policia:'policia',armas:'armas',escola:'escola',casa:'casa'};
const SOLID=new Set('#SFCTBDKPVRGJX'.split(''));
export const ITS=48; // tamanho do tile interno em px

// cores de chão e prateleira por lugar
export const THEME={
  farmacia:{floor:'#e8f0ea',floor2:'#dbe7de',shelf:'#ffffff',prod:['#2e9e4a','#e53935','#1e88e5','#ffffff']},
  mercadinho:{floor:'#efe6d2',floor2:'#e3d8c0',shelf:'#a0522d',prod:['#e53935','#fdd835','#43a047','#1e88e5','#ff7043']},
  padaria:{floor:'#e9d6b9',floor2:'#dcc5a3',shelf:'#8d5a2b',prod:['#e0a35a','#c98a4b','#f3d9a4','#a0522d']},
  lojaposto:{floor:'#e3e3e3',floor2:'#d5d5d5',shelf:'#c9342a',prod:['#1e88e5','#fdd835','#e53935','#43a047']},
  lanchonete:{floor:'#f3d36b',floor2:'#e9c55a',shelf:'#c0392b',prod:[]},
  hospital:{floor:'#eef3f6',floor2:'#e2eaef',shelf:'#ffffff',prod:[]},
  policia:{floor:'#c8d2e0',floor2:'#bcc7d6',shelf:'#2e4d86',prod:[]},
  armas:{floor:'#5b4636',floor2:'#4f3c2e',shelf:'#3b2a1e',prod:['#555','#777','#333']},
  escola:{floor:'#d9c7a3',floor2:'#ccb994',shelf:'#3f6fb0',prod:['#e53935','#1e88e5','#fdd835']},
  casa:{floor:'#c49a6c',floor2:'#b88d5f',shelf:'#7a4a3a',prod:[]},
};
export const NPC_SHIRT={farmacia:'#ffffff',mercadinho:'#e8a33a',padaria:'#ffffff',lojaposto:'#c9342a',lanchonete:'#c0392b',hospital:'#81d4fa',policia:'#1f3a6b',armas:'#3b3b3b',escola:'#6a1b9a',casa:'#ff7a1a'};

export function canEnter(b){
  if(heatStars()>0&&b.kind!=='policia'){msg('Tá procurado! Despista a polícia antes de entrar.',2.5);return false;}
  return true;
}

export function enterInterior(b){
  const planKey=KIND_PLAN[b.kind];if(!planKey)return false;
  if(!canEnter(b))return false;
  const plan=PLANS[planKey].map(r=>r.split(''));
  const H=plan.length,W=plan[0].length;
  const it={b,kind:b.kind,plan,W,H,points:[],exit:[],npcs:[],att:null,teacher:null};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const ch=plan[y][x],cx=(x+.5)*ITS,cy=(y+.5)*ITS;
    if(ch==='E')it.exit.push({x:cx,y:cy});
    else if(ch==='a')it.att={x:cx,y:cy};
    else if(ch==='1')it.points.push({x:cx,y:cy,station:'balcao',label:b.kind==='hospital'?'Falar com a recepção':b.kind==='policia'?'Falar com o delegado':'Falar com o atendente'});
    else if(ch==='2')it.points.push({x:cx,y:cy,station:'cama',label:b.kind==='hospital'?'Deitar no leito':'Deitar na cama'});
    else if(ch==='3')it.points.push({x:cx,y:cy,station:'mesa',label:'Usar o computador (salvar)'});
    else if(ch==='4'){it.teacher={x:cx,y:cy};it.points.push({x:cx,y:cy+ITS,station:'balcao',label:'Falar com a professora'});}
  }
  // no hospital, deitar no leito = mesmo menu do balcão
  if(b.kind==='hospital')for(const p of it.points)if(p.station==='cama')p.station='balcao';
  // clientes passeando (não na casa)
  const nC=b.kind==='casa'?0:b.kind==='escola'?4:Math.floor(rand(1,4));
  for(let k=0;k<nC;k++){const p=randomFloor(it);if(p)it.npcs.push({id:1+Math.floor(Math.random()*9999),x:p.x,y:p.y,a:0,tx:p.x,ty:p.y,wait:rand(0,2),shirt:pick(['#e74c3c','#3498db','#f1c40f','#9b59b6','#1abc9c','#e67e22','#2ecc71']),skin:pick(['#f1c27d','#e0ac69','#c68642','#8d5524','#ffdbac']),hair:pick(['#222','#3b2314','#6b4423','#111']),anim:0,sit:b.kind==='escola'});}
  if(b.kind==='escola')it.npcs.forEach((n,i)=>{const seats=[];for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(plan[y][x]==='c'&&plan[y-1][x]==='D')seats.push({x:(x+.5)*ITS,y:(y+.5)*ITS});const s=seats[(i*3)%seats.length];if(s){n.x=s.x;n.y=s.y;n.tx=s.x;n.ty=s.y;n.a=-Math.PI/2;}});
  // posição do jogador: logo acima da porta
  const e=it.exit[Math.floor(it.exit.length/2)];
  it.px=e.x;it.py=e.y-ITS*1.2;it.pa=-Math.PI/2;it.anim=0;
  if(blockedAt(it,it.px,it.py)){const f=nearestFree(it,it.px,it.py);if(f){it.px=f.x;it.py=f.y;}} // nunca nascer dentro de um móvel
  it.outside={x:player.x,y:player.y};
  S.interior=it;
  sfxTone(520,0.06,0.06,'square');sfxTone(390,0.08,0.05,'square',0.06);
  return true;
}
export function exitInterior(){
  const it=S.interior;if(!it)return;
  // sai pela porta, virado pra rua (a porta pode estar em qualquer lado do prédio)
  const d=doorOf(it.b),o=d.out||[0,1];player.x=d.x+o[0]*8;player.y=d.y+o[1]*8;player.moveA=player.a=Math.atan2(o[1],o[0]);
  S.camYaw=player.moveA; // a câmera 3/4 começa atrás do jogador, olhando pra rua
  S.interior=null;S.menu=null;
  sfxTone(390,0.06,0.06,'square');
}
export function interiorSolid(it,px,py){
  const x=Math.floor(px/ITS),y=Math.floor(py/ITS);
  if(x<0||y<0||x>=it.W||y>=it.H)return true;
  return SOLID.has(it.plan[y][x]);
}
const PR=12; // raio do jogador dentro de casa
function blockedAt(it,x,y){
  return interiorSolid(it,x,y)||interiorSolid(it,x-PR,y-PR)||interiorSolid(it,x+PR,y-PR)||interiorSolid(it,x-PR,y+PR)||interiorSolid(it,x+PR,y+PR);
}
// chão livre mais perto (sem ser o tapete de saída), pra tirar o jogador de dentro de um móvel
function nearestFree(it,px,py){
  let best=null,bd=Infinity;
  for(let y=1;y<it.H-1;y++)for(let x=1;x<it.W-1;x++){
    const ch=it.plan[y][x];if(SOLID.has(ch)||ch==='E')continue;
    const cx=(x+.5)*ITS,cy=(y+.5)*ITS;if(blockedAt(it,cx,cy))continue;
    const d=hyp(cx-px,cy-py);if(d<bd){bd=d;best={x:cx,y:cy};}
  }
  return best;
}
function randomFloor(it){
  for(let k=0;k<60;k++){const x=1+Math.floor(Math.random()*(it.W-2)),y=1+Math.floor(Math.random()*(it.H-3));if(it.plan[y][x]==='.'||it.plan[y][x]==='c')return{x:(x+.5)*ITS,y:(y+.5)*ITS};}
  return null;
}
// ponto de interação mais perto (ou a saída)
export function nearestPoint(it){
  let best=null,bd=ITS*1.1;
  for(const p of it.points){const d=hyp(p.x-it.px,p.y-it.py);if(d<bd){bd=d;best=p;}}
  if(!best)for(const e of it.exit)if(hyp(e.x-it.px,e.y-it.py)<ITS*0.9)return{exit:true,label:'Sair'};
  return best;
}
export function interactInterior(){
  const it=S.interior;if(!it)return;
  const p=nearestPoint(it);if(!p)return;
  if(p.exit){exitInterior();return;}
  openPlace(it.b,p.station);
}
export function updateInterior(dt){
  const it=S.interior;if(!it)return;
  // andar (WASD), com colisão nos móveis
  const up=keys['KeyW']||keys['ArrowUp'],dn=keys['KeyS']||keys['ArrowDown'],lf=keys['KeyA']||keys['ArrowLeft'],rt=keys['KeyD']||keys['ArrowRight'];
  let mx=(rt?1:0)-(lf?1:0),my=(dn?1:0)-(up?1:0);
  if(mx||my){const l=Math.hypot(mx,my);mx/=l;my/=l;const sp=(keys['ShiftLeft']||keys['ShiftRight'])?190:130;
    it.pa=Math.atan2(my,mx);const r=PR;
    const nx=it.px+mx*sp*dt,ny=it.py+my*sp*dt;
    // se por algum motivo ficou dentro de um móvel, empurra pro chão livre mais perto em vez de travar
    if(interiorSolid(it,it.px,it.py)){const f=nearestFree(it,it.px,it.py);if(f){it.px=f.x;it.py=f.y;}}
    if(!interiorSolid(it,nx+Math.sign(mx)*r,it.py)&&!interiorSolid(it,nx+Math.sign(mx)*r,it.py+r*0.6)&&!interiorSolid(it,nx+Math.sign(mx)*r,it.py-r*0.6))it.px=nx;
    if(!interiorSolid(it,it.px,ny+Math.sign(my)*r)&&!interiorSolid(it,it.px+r*0.6,ny+Math.sign(my)*r)&&!interiorSolid(it,it.px-r*0.6,ny+Math.sign(my)*r))it.py=ny;
    it.anim+=dt*sp*0.012;it.moving=true;it.running=sp>150;
  } else it.moving=false;
  // pisou no tapete de saída andando pra baixo: sai
  if(my>0&&it.exit.some(e=>Math.abs(e.x-it.px)<ITS*1.5&&it.py>e.y-ITS*0.2)){exitInterior();return;}
  // clientes passeiam
  for(const n of it.npcs){
    if(n.sit)continue;
    n.wait-=dt;
    const dx=n.tx-n.x,dy=n.ty-n.y,l=Math.hypot(dx,dy);
    if(l<4){if(n.wait<=0){const p=randomFloor(it);if(p){n.tx=p.x;n.ty=p.y;}n.wait=rand(1.5,4);}n.moving=false;continue;}
    const sp=50;const nx=n.x+dx/l*sp*dt,ny=n.y+dy/l*sp*dt;
    if(!interiorSolid(it,nx,ny)){n.x=nx;n.y=ny;n.a=Math.atan2(dy,dx);n.anim+=dt;n.moving=true;}else{n.tx=n.x;n.ty=n.y;n.wait=0.3;}
  }
  // o tempo continua passando lá fora
  S.tod=(S.tod+dt*24/720)%24;S.gameTime+=dt;
  if(player.health<100&&it.kind==='hospital')player.health=Math.min(100,player.health+dt*0.5);
}
export const interiorTitle=()=>S.interior?placeTitle(S.interior.kind):'';
