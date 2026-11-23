// Ícones (pictogramas) do minimapa, do mapa em tela cheia e da legenda
// Cada lugar tem cor de fundo própria + desenho branco, pra não depender de letra.

export const ICONS = {
  estadio:    { bg:'#2e7d32', name:'Estádio do Jacarandá (jogo às 15h30)' },
  hospital:   { bg:'#e53935', name:'Hospital' },
  farmacia:   { bg:'#2e9e4a', name:'Farmácia' },
  policia:    { bg:'#2e4d86', name:'Carceragem Central (fiança)' },
  ze:         { bg:'#e67e22', name:'Oficina do Zé (desmanche)' },
  pintura:    { bg:'#16a085', name:'Pintura Express (apaga estrelas)' },
  armas:      { bg:'#8e1b14', name:'Armas do Tonhão' },
  posto:      { bg:'#f1c40f', name:'Posto (conserto) · guincho', dark:true },
  lanchonete: { bg:'#d35400', name:'Lanchonete · motoboy' },
  mercadinho: { bg:'#8e44ad', name:'Mercadinho' },
  padaria:    { bg:'#a0522d', name:'Padaria' },
  escola:     { bg:'#1f3f70', name:'Escola (cursos)' },
  casa:       { bg:'#ffffff', name:'Sua casa (salvar / dormir)', dark:true },
  terminal:   { bg:'#1565c0', name:'Terminal de ônibus' },
  taxi:       { bg:'#f4d03f', name:'Ponto de táxi', dark:true },
  phone:      { bg:'#f2a900', name:'Orelhão (missão)', dark:true },
  waypoint:   { bg:'#e91e63', name:'Seu marcador' },
};

// mapeia o "kind" do prédio para o ícone
export const KIND_ICON = { estadio:'estadio', hospital:'hospital', farmacia:'farmacia', policia:'policia', ze:'ze', pintura:'pintura', pintura2:'pintura',
  armas:'armas', lojaposto:'posto', lanchonete:'lanchonete', mercadinho:'mercadinho', padaria:'padaria', escola:'escola', casa:'casa' };

export function drawIcon(g,key,x,y,s){
  const ic=ICONS[key]; if(!ic) return;
  const r=s/2;
  g.save(); g.translate(x,y);
  // fundo
  g.fillStyle='rgba(0,0,0,0.55)'; rr(g,-r-1.5,-r-0.5,s+3,s+3,s*0.28); g.fill();
  g.fillStyle=ic.bg; rr(g,-r,-r,s,s,s*0.25); g.fill();
  const fg=ic.dark?'#1b1b1b':'#ffffff';
  g.fillStyle=fg; g.strokeStyle=fg; g.lineWidth=Math.max(1.5,s*0.11); g.lineCap='round'; g.lineJoin='round';
  const u=s/10; // unidade
  switch(key){
    case 'hospital': case 'farmacia':
      g.fillRect(-u*1.2,-u*3.5,u*2.4,u*7); g.fillRect(-u*3.5,-u*1.2,u*7,u*2.4);
      if(key==='farmacia'){g.fillStyle=ic.bg;g.beginPath();g.arc(0,0,u*0.8,0,Math.PI*2);g.fill();}
      break;
    case 'policia': star(g,0,u*0.3,u*4); break;
    case 'estadio': // arquibancada oval com gramado no meio
      g.beginPath();g.ellipse(0,0,u*4.2,u*3.2,0,0,Math.PI*2);g.fill();g.fillStyle='#66bb6a';g.beginPath();g.ellipse(0,0,u*2.6,u*1.7,0,0,Math.PI*2);g.fill();
      g.strokeStyle=fg;g.lineWidth=Math.max(1,s*0.06);g.beginPath();g.moveTo(0,-u*1.7);g.lineTo(0,u*1.7);g.stroke();break;
    case 'ze': // chave inglesa
      g.save();g.rotate(-Math.PI/4);g.fillRect(-u*0.8,-u*0.8,u*5,u*1.6);g.beginPath();g.arc(-u*1.6,0,u*2,0,Math.PI*2);g.fill();
      g.fillStyle=ic.bg;g.fillRect(-u*3.8,-u*0.7,u*1.8,u*1.4);g.restore(); break;
    case 'pintura': // gota de tinta
      g.beginPath();g.moveTo(0,-u*4);g.quadraticCurveTo(u*3.4,u*0.5,0,u*3.6);g.quadraticCurveTo(-u*3.4,u*0.5,0,-u*4);g.fill(); break;
    case 'armas': // mira
      g.beginPath();g.arc(0,0,u*2.8,0,Math.PI*2);g.stroke();
      g.beginPath();g.moveTo(-u*4,0);g.lineTo(-u*1.2,0);g.moveTo(u*1.2,0);g.lineTo(u*4,0);g.moveTo(0,-u*4);g.lineTo(0,-u*1.2);g.moveTo(0,u*1.2);g.lineTo(0,u*4);g.stroke(); break;
    case 'posto': // bomba de combustível
      g.fillRect(-u*3,-u*3.5,u*4,u*7);g.fillStyle=ic.bg;g.fillRect(-u*2.2,-u*2.6,u*2.4,u*2);g.fillStyle=fg;
      g.beginPath();g.moveTo(u*1,-u*2);g.lineTo(u*2.6,-u*1);g.lineTo(u*2.6,u*2);g.stroke(); break;
    case 'lanchonete': // hambúrguer
      g.beginPath();g.ellipse(0,-u*1,u*3.6,u*2.2,0,Math.PI,0);g.fill();g.fillRect(-u*3.8,-u*0.4,u*7.6,u*1.2);g.fillRect(-u*3.6,u*1.3,u*7.2,u*1.8); break;
    case 'mercadinho': // carrinho
      g.beginPath();g.moveTo(-u*4,-u*3);g.lineTo(-u*2.6,-u*3);g.lineTo(-u*1.6,u*1.2);g.lineTo(u*3,u*1.2);g.lineTo(u*3.8,-u*1.8);g.lineTo(-u*2.2,-u*1.8);g.stroke();
      g.beginPath();g.arc(-u*1,u*2.8,u*0.9,0,Math.PI*2);g.arc(u*2.4,u*2.8,u*0.9,0,Math.PI*2);g.fill(); break;
    case 'padaria': // pão
      g.beginPath();g.ellipse(0,0,u*4,u*2.4,0,0,Math.PI*2);g.fill();g.strokeStyle=ic.bg;
      for(const o of[-1.6,0,1.6]){g.beginPath();g.moveTo(o*u-u*0.6,-u*1.2);g.lineTo(o*u+u*0.6,u*1.2);g.stroke();} break;
    case 'escola': // livro aberto
      g.beginPath();g.moveTo(0,-u*2);g.lineTo(-u*4,-u*3);g.lineTo(-u*4,u*2.6);g.lineTo(0,u*3.4);g.lineTo(u*4,u*2.6);g.lineTo(u*4,-u*3);g.closePath();g.fill();
      g.strokeStyle=ic.bg;g.beginPath();g.moveTo(0,-u*2);g.lineTo(0,u*3.2);g.stroke(); break;
    case 'casa':
      g.beginPath();g.moveTo(0,-u*4);g.lineTo(u*4,-u*0.4);g.lineTo(-u*4,-u*0.4);g.closePath();g.fill();g.fillRect(-u*2.8,-u*0.6,u*5.6,u*4.2);
      g.fillStyle=ic.bg;g.fillRect(-u*0.8,u*1.2,u*1.6,u*2.4); break;
    case 'terminal': // ônibus
      rr(g,-u*3.2,-u*3.8,u*6.4,u*6.6,u*1);g.fill();g.fillStyle=ic.bg;g.fillRect(-u*2.4,-u*2.8,u*4.8,u*2.4);
      g.fillStyle=fg;g.beginPath();g.arc(-u*1.8,u*3.4,u*0.9,0,Math.PI*2);g.arc(u*1.8,u*3.4,u*0.9,0,Math.PI*2);g.fill(); break;
    case 'taxi': // carro com plaquinha
      rr(g,-u*4,-u*0.6,u*8,u*3,u*1);g.fill();g.beginPath();g.moveTo(-u*2.4,-u*0.6);g.lineTo(-u*1.4,-u*2.6);g.lineTo(u*1.4,-u*2.6);g.lineTo(u*2.4,-u*0.6);g.fill();
      g.fillRect(-u*0.9,-u*4,u*1.8,u*1.2);g.fillStyle=ic.bg;g.beginPath();g.arc(-u*2.2,u*2.6,u*0.9,0,Math.PI*2);g.arc(u*2.2,u*2.6,u*0.9,0,Math.PI*2);g.fill(); break;
    case 'phone': // telefone
      g.save();g.rotate(-0.5);rr(g,-u*1,-u*4,u*2,u*8,u*1);g.fill();g.fillRect(-u*2.4,-u*4,u*2.4,u*1.8);g.fillRect(-u*2.4,u*2.2,u*2.4,u*1.8);g.restore(); break;
    case 'waypoint':
      g.beginPath();g.arc(0,-u*1,u*2.6,0,Math.PI*2);g.fill();g.beginPath();g.moveTo(-u*2,u*0.6);g.lineTo(0,u*4);g.lineTo(u*2,u*0.6);g.fill();
      g.fillStyle=ic.bg;g.beginPath();g.arc(0,-u*1,u*1,0,Math.PI*2);g.fill(); break;
  }
  g.restore();
}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function star(g,x,y,r){g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?r*0.45:r;g.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q);}g.closePath();g.fill();}
