// Estado mutável do jogo, compartilhado entre os módulos
export const S={
  cars:[], peds:[], parts:[], skids:[], decals:[],
  messages:[], bigMsg:null,
  shake:0, gameTime:0, started:false, paused:false,
  flowT:0, spawnT:0, zoneCd:0,
  mission:null, missionIdx:0, phoneCd:0,
  best:0, NEXT_ID:1, errCount:0, lastErr:'',
  tod:16.5, day:0, lastTod:null, match:null, tracers:[], shopCd:0,
  job:null, floaters:[],
  interior:null, toasts:[], mapOpenedOnce:false,
  menu:null, mapOpen:false, hitStop:0, hurtT:0, mapRect:null, waypoint:null, playTime:0, saveFlash:0,
};
try{S.best=+localStorage.getItem('aq_best')||0;}catch(e){}
export const player={x:0,y:0,a:0,health:100,car:null,money:0,heat:0,anim:0,punchCd:0,state:'play',stateT:0,bustT:0,inv:0,
  weapon:'pistola', ammo:{pistola:12}, fireCd:0, triggerLatch:false,
  armor:0, skills:{pontaria:false,direcao:false,socorros:false}};
export const cam={x:0,y:0,zoom:1};
export const keys={};
// mouse: posição na tela, botões e se o jogador está usando o mouse pra mirar
// locked: ponteiro preso no jogo (câmera de ombro a pé: o mouse gira a câmera); dx/dy: movimento acumulado até o próximo quadro;
// right: botão direito segurado (mirar com arma)
export const mouse={x:0,y:0,down:false,active:false,locked:false,dx:0,dy:0,right:false};
// projeção atual (2D ou 3D): o renderizador 3D troca essas funções
export const view={
  project:(x,y)=>({x:(x-cam.x)*cam.zoom+window.innerWidth/2,y:(y-cam.y)*cam.zoom+window.innerHeight/2}),
  unproject:(sx,sy)=>({x:cam.x+(sx-window.innerWidth/2)/cam.zoom,y:cam.y+(sy-window.innerHeight/2)/cam.zoom}),
  r34:false,   // câmera 3/4 atrás do carro ligada neste quadro (só no 3D, fora dos interiores)
  yaw:-Math.PI/2, // pra onde a câmera 3/4 olha (ângulo do mundo; -π/2 = norte)
  ombro:false, // câmera de ombro a pé (atrás do jogador, baixa; o mouse gira) ligada neste quadro
  aim:null,    // ponto do mundo debaixo da mira do centro da tela (câmera de ombro)
};
export function mouseWorld(){return view.unproject(mouse.x,mouse.y);}
