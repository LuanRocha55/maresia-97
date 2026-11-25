// Prédios com porta: entrar (F ou clique direito) abre o menu do lugar
import { hyp, fmtMoney } from '../core/utils.js';
import { buildings } from '../world/map.js';
import { doorOf } from './jobs.js';
import { WEAPONS } from './weapons.js';
import { heatStars, msg, big } from './world.js';
import { busted } from './player.js';
import { saveGame } from './save.js';
import { sfxTone } from '../audio/audio.js';
import { S, player } from '../core/state.js';
import { stadiumItems, stadiumSub } from './stadium.js';
import { needsOn, eat, rest, fomeFull } from './needs.js';

const ENTERABLE = ['estadio','hospital','policia','armas','farmacia','mercadinho','padaria','lanchonete','escola','casa','lojaposto'];
export const enterables = () => buildings.filter(b=>ENTERABLE.includes(b.kind));

export function nearestDoor(r=40){
  let best=null,bd=r;
  for(const b of enterables()){const d=doorOf(b);const dd=hyp(d.x-player.x,d.y-player.y);if(dd<bd){bd=dd;best=b;}}
  return best;
}

// ---- ações reutilizáveis ----
const heal=(v,price,label)=>({label,price,disabled:()=>player.health>=100,why:'Vida cheia',run:()=>{player.health=Math.min(100,player.health+v);}});
// comida: enche a vida e a fome (fome ganha um pouco mais que a vida)
const food=(label,v,price)=>({label:label+'  (+'+v+' vida'+(needsOn()?', mata a fome':'')+')',price,disabled:()=>player.health>=100&&fomeFull(),why:'Tá de barriga cheia',
  run:()=>{player.health=Math.min(100,player.health+v);eat(Math.round(v*1.3));}});
const ammo=(w)=>({label:WEAPONS[w].name+'  (+'+WEAPONS[w].pack+' balas)',price:WEAPONS[w].price,run:()=>{player.ammo[w]=(player.ammo[w]||0)+WEAPONS[w].pack;player.weapon=w;}});
const colete={label:'Colete à prova de balas (absorve tiros)',price:350,disabled:()=>player.armor>=100,why:'Colete novo',run:()=>{player.armor=100;}};
function sleepTo(h){return ()=>{rest(h===8?100:50);S.tod=h;player.health=100;S.cars=S.cars.filter(c=>c===player.car||c.keep||c.mission);msg('Tu dormiu e acordou às '+String(h).padStart(2,'0')+'h, novinho.',3);saveGame();};}

// ---- cardápio de cada lugar ----
const PLACES = {
  estadio:   { title:'ESTÁDIO DO JACARANDÁ', sub:'', items:()=>stadiumItems() },
  farmacia:  { title:'FARMÁCIA', sub:'Remédio pra quem levou pancada', items:()=>[heal(30,25,'Curativo  (+30 vida)'),heal(100,80,'Kit completo  (vida cheia)'),colete] },
  mercadinho:{ title:'MERCADINHO', sub:'Tem de tudo um pouco', items:()=>[food('Refrigerante',10,5),food('Biscoito recheado',20,10),food('Marmita',50,25),
      {label:'Raspadinha  (chance de ganhar $250)',price:10,run:()=>{if(Math.random()<0.12){player.money+=250;big('GANHOU!','+$250 na raspadinha','#7dff6b',2);}else msg('Não foi dessa vez.',2);}}] },
  padaria:   { title:'PADARIA', sub:'Pão quentinho saindo do forno', items:()=>[food('Cafezinho',10,4),food('Pão de queijo',15,8),food('Café da manhã completo',45,20)] },
  lanchonete:{ title:'LANCHONETE', sub:'Pede que sai rapidinho', items:()=>[food('Pastel',20,10),food('X-tudo',50,22),food('Combo com suco',70,30)] },
  lojaposto: { title:'LOJINHA DO POSTO', sub:'Aberta 24 horas', items:()=>[food('Água',8,3),food('Salgado',25,12)] },
  hospital:  { title:'HOSPITAL', sub:'Atendimento na hora', items:()=>[heal(100,100,'Tratamento completo  (vida cheia)')] },
  escola:    { title:'ESCOLA', sub:'Cursos rápidos (vale pra sempre)', items:()=>[
      {label:'Curso de pontaria  (tiros mais precisos)',price:500,disabled:()=>player.skills.pontaria,why:'Já fez',run:()=>{player.skills.pontaria=true;}},
      {label:'Curso de direção  (carro mais firme nas curvas)',price:400,disabled:()=>player.skills.direcao,why:'Já fez',run:()=>{player.skills.direcao=true;}},
      {label:'Curso de primeiros socorros  (renasce com meio colete)',price:600,disabled:()=>player.skills.socorros,why:'Já fez',run:()=>{player.skills.socorros=true;}}] },
  armas:     { title:'ARMAS DO TONHÃO', sub:'Sem perguntas', items:()=>[ammo('pistola'),ammo('escopeta'),ammo('smg'),colete] },
  policia:   { title:'CARCERAGEM CENTRAL', sub:'Pagar fiança limpa a ficha (até 2 estrelas)', items:()=>[
      {label:'Pagar fiança  ($300 por estrela)',price:()=>heatStars()*300,disabled:()=>heatStars()===0||heatStars()>2,why:()=>heatStars()===0?'Ficha limpa':'Procurado demais',run:()=>{player.heat=0;for(const c of S.cars)if(c.ai==='police')c.ai='traffic';}},
      {label:'Se entregar',price:0,disabled:()=>heatStars()===0,why:'Ficha limpa',run:()=>{closeMenu();busted();}}] },
  casa:      { title:'SUA CASA', sub:'Teu cantinho no Jacarandá', items:()=>[
      {label:'Salvar o jogo',price:0,station:'mesa',run:()=>{saveGame(false);}},
      {label:'Dormir até de manhã (8h)',price:0,station:'cama',disabled:()=>heatStars()>0,why:'Procurado',run:sleepTo(8)},
      {label:'Dormir até de noite (20h)',price:0,station:'cama',disabled:()=>heatStars()>0,why:'Procurado',run:sleepTo(20)}] },
};

export const placeTitle=k=>PLACES[k]?PLACES[k].title:'';
// abre o menu de um lugar; station filtra itens (ex.: na casa, a cama dorme e a mesa salva)
export function openPlace(b,station){
  const kind=b.kind||b;const P=PLACES[kind];if(!P)return false;
  let items=P.items();
  if(station){const f=items.filter(it=>(it.station||'balcao')===station);if(f.length)items=f;}
  const sub={cama:'Hora de descansar',mesa:'Computador da casa'}[station]||(kind==='estadio'?stadiumSub():P.sub);
  S.menu={title:P.title,sub,kind,items,sel:0,rects:[]};
  sfxTone(440,0.06,0.06,'square');
  return true;
}
export function closeMenu(){S.menu=null;}
const priceOf=it=>typeof it.price==='function'?it.price():it.price;
export const isDisabled=it=>it.disabled?it.disabled():false;
export const whyOf=it=>typeof it.why==='function'?it.why():it.why;
export const priceLabel=it=>{const p=priceOf(it);return p>0?fmtMoney(p):'grátis';};

export function choose(i){
  const m=S.menu;if(!m)return;
  const it=m.items[i];
  if(!it){closeMenu();return;} // "Sair"
  if(isDisabled(it)){msg(whyOf(it)||'Indisponível',1.5);return;}
  const p=priceOf(it);
  if(player.money<p){msg('Custa '+fmtMoney(p)+'. Tu tá liso!',1.8);sfxTone(200,0.15,0.08,'triangle');return;}
  player.money-=p;it.run();
  if(S.menu)sfxTone(700,0.08,0.08,'square');
  if(p>0)saveGame(true);
}
export function menuKey(code){
  const m=S.menu;if(!m)return;const n=m.items.length+1; // +1 = Sair
  if(code==='ArrowUp'||code==='KeyW')m.sel=(m.sel-1+n)%n;
  else if(code==='ArrowDown'||code==='KeyS')m.sel=(m.sel+1)%n;
  else if(code==='Enter'||code==='Space'||code==='KeyF')choose(m.sel);
  else if(code==='Escape'||code==='Backspace')closeMenu();
  else if(/^Digit[1-9]$/.test(code)){const i=+code.slice(5)-1;if(i<m.items.length)choose(i);}
}
export function menuMouse(x,y,click){
  const m=S.menu;if(!m)return;
  for(const r of m.rects){if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){m.sel=r.i;if(click)choose(r.i);return;}}
}
