// Constrói a cidade estática em 3D (uma vez): prédios com janelas e telhados, árvores, postes,
// semáforos, enfeites, estádio. Unidade: 1 = 1 tile (32 px). X = x do mundo, Z = y do mundo, Y = altura.
import * as THREE from '../../vendor/three/three.module.min.js';
import { mulberry } from '../core/utils.js';
import { T, buildings, trees, lamps, decor, pumps, phones, special, VL, HL, NV, NH, isJunction } from '../world/map.js';
import { signalized } from '../world/districts.js';
import { BUS_STOPS } from '../game/jobs.js';
import { roofSign } from '../render/draw.js';

export const U=1/T;                         // px -> unidade
export const HSCALE=2.2/T;                  // altura "2D" -> unidade
export const bh=b=>Math.max(0.35,b.h*HSCALE);

const C=hex=>new THREE.Color(hex);
// ---------- montador de geometria com cor por vértice ----------
export class Geo{
  constructor(){this.p=[];this.n=[];this.c=[];}
  quad(a,b,c,d,nx,ny,nz,col){ // a,b,c,d em sentido anti-horário visto de fora
    for(const v of [a,b,c,a,c,d]){this.p.push(v[0],v[1],v[2]);this.n.push(nx,ny,nz);this.c.push(col.r,col.g,col.b);}
  }
  tri(a,b,c,nx,ny,nz,col){for(const v of [a,b,c]){this.p.push(v[0],v[1],v[2]);this.n.push(nx,ny,nz);this.c.push(col.r,col.g,col.b);}}
  // parede com degradê: mais escura embaixo (sombra de contato no chão), cor cheia em cima
  wall(a,b,c,d,nx,ny,nz,col,ao){
    const lo=col.clone().multiplyScalar(ao), cs=[lo,col,col,lo];
    [0,1,2,0,2,3].forEach(k=>{const v=[a,b,c,d][k],cc=cs[k];this.p.push(v[0],v[1],v[2]);this.n.push(nx,ny,nz);this.c.push(cc.r,cc.g,cc.b);});
  }
  box(x0,z0,x1,z1,y0,y1,top,side,shadeSides=true,ao=1){
    const s=shadeSides?[0.82,0.92,0.72,0.78]:[1,1,1,1];
    const sc=(k)=>new THREE.Color(side).multiplyScalar(s[k]);
    if(top)this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],0,1,0,new THREE.Color(top));
    this.wall([x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],0,0,-1,sc(0),ao); // norte
    this.wall([x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1],0,0,1,sc(1),ao);  // sul
    this.wall([x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0],-1,0,0,sc(2),ao); // oeste
    this.wall([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],1,0,0,sc(3),ao);  // leste
  }
  // quadrilátero que acerta sozinho o sentido (pra normal apontar pra n)
  face(a,b,c,d,nx,ny,nz,col){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
    if(cx*nx+cy*ny+cz*nz<0)this.quad(a,d,c,b,nx,ny,nz,col);else this.quad(a,b,c,d,nx,ny,nz,col);
  }
  // prisma: polígono convexo (pontos [x,z]) erguido de y0 a y1; top=null deixa aberto
  prism(pts,y0,y1,top,side,shade=true){
    const n=pts.length,cx=pts.reduce((s,p)=>s+p[0],0)/n,cz=pts.reduce((s,p)=>s+p[1],0)/n,sc=C(side);
    for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];let nx=b[1]-a[1],nz=-(b[0]-a[0]);
      const mx=(a[0]+b[0])/2-cx,mz=(a[1]+b[1])/2-cz;if(nx*mx+nz*mz<0){nx=-nx;nz=-nz;}const l=Math.hypot(nx,nz)||1;nx/=l;nz/=l;
      const k=shade?0.78+0.14*(nx*0.5+nz*0.5+1)/2:1;
      this.face([a[0],y0,a[1]],[a[0],y1,a[1]],[b[0],y1,b[1]],[b[0],y0,b[1]],nx,0,nz,sc.clone().multiplyScalar(k));}
    if(top){const tc=C(top);for(let i=1;i<n-1;i++){const a=pts[0],b=pts[i],c=pts[i+1];
      const v=[[a[0],y1,a[1]],[b[0],y1,b[1]],[c[0],y1,c[1]]];const cr=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      if(cr>0)this.tri(v[0],v[2],v[1],0,1,0,tc);else this.tri(v[0],v[1],v[2],0,1,0,tc);}}
  }
  // caixa girada (ângulo a em torno do eixo Y), medidas locais a partir do centro
  obox(cx,cz,a,hw,hd,y0,y1,top,side){const c=Math.cos(a),s=Math.sin(a),P=(x,z)=>[cx+x*c-z*s,cz+x*s+z*c];
    this.prism([P(-hw,-hd),P(hw,-hd),P(hw,hd),P(-hw,hd)],y0,y1,top,side);}
  // cilindro (caixa d'água, poste grosso)
  cyl(cx,cz,r,y0,y1,top,side,seg=10){const pts=[];for(let i=0;i<seg;i++){const a=i/seg*Math.PI*2;pts.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}this.prism(pts,y0,y1,top,side,false);}
  // plano dos dois lados (rede, lona)
  sheet(a,b,c,d,col){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    this.quad(a,b,c,d,nx,ny,nz,col);this.quad(a,d,c,b,-nx,-ny,-nz,col.clone().multiplyScalar(0.8));}
  mesh(mat){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingSphere();return new THREE.Mesh(g,mat);}
}

// ---------- setores: a cidade é cortada em blocos de 32x32 tiles pra GPU só desenhar o que está à vista ----------
const SEC=32;
const sk=(x,z)=>Math.floor(x/SEC)+','+Math.floor(z/SEC);
class SGeo{ // vários Geo, um por setor
  constructor(){this.m=new Map();}
  at(x,z){const k=sk(x,z);let g=this.m.get(k);if(!g){g=new Geo();this.m.set(k,g);}return g;}
  meshes(mat){const out=[];for(const g of this.m.values())if(g.p.length)out.push(g.mesh(mat));return out;}
}
// InstancedMesh dividido por setor, com índice global
class SInst{
  constructor(geo,mat,pts){
    this.map=[];const buckets=new Map();
    pts.forEach((p,i)=>{const k=sk(p[0],p[1]);let a=buckets.get(k);if(!a){a=[];buckets.set(k,a);}this.map[i]=[k,a.length];a.push(i);});
    this.meshes=new Map();
    for(const [k,a] of buckets)this.meshes.set(k,new THREE.InstancedMesh(geo,mat,a.length));
  }
  setMatrixAt(i,M){const [k,j]=this.map[i];this.meshes.get(k).setMatrixAt(j,M);}
  setColorAt(i,c){const [k,j]=this.map[i];this.meshes.get(k).setColorAt(j,c);}
  colorsDirty(){for(const m of this.meshes.values())if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  add(scene,cast=false){for(const m of this.meshes.values()){m.computeBoundingSphere();m.castShadow=cast;scene.add(m);}return this;}
  get list(){return [...this.meshes.values()];}
}

// telhado de duas águas (casas)
function gable(G,x0,z0,x1,z1,y,h,roof){
  const col=C(roof), along=(x1-x0)>=(z1-z0);
  if(along){const zm=(z0+z1)/2;
    G.quad([x0,y,z1],[x1,y,z1],[x1,y+h,zm],[x0,y+h,zm],0,0.7,0.7,col);
    G.quad([x1,y,z0],[x0,y,z0],[x0,y+h,zm],[x1,y+h,zm],0,0.7,-0.7,col.clone().multiplyScalar(0.85));
    const w=C('#e8e0d0');G.tri([x0,y,z0],[x0,y,z1],[x0,y+h,zm],-1,0,0,w);G.tri([x1,y,z1],[x1,y,z0],[x1,y+h,zm],1,0,0,w);}
  else{const xm=(x0+x1)/2;
    G.quad([x1,y,z1],[x1,y,z0],[xm,y+h,z0],[xm,y+h,z1],0.7,0.7,0,col);
    G.quad([x0,y,z0],[x0,y,z1],[xm,y+h,z1],[xm,y+h,z0],-0.7,0.7,0,col.clone().multiplyScalar(0.85));
    const w=C('#e8e0d0');G.tri([x0,y,z1],[x1,y,z1],[xm,y+h,z1],0,0,1,w);G.tri([x1,y,z0],[x0,y,z0],[xm,y+h,z0],0,0,-1,w);}
}

// moldura em volta do topo (4 barras finas, sem tampar o telhado)
function ring(G,x0,z0,x1,z1,y0,y1,t,col){
  const hx=col.getHexString?'#'+col.getHexString():col;
  G.box(x0-t,z0-t,x1+t,z0+t,y0,y1,hx,hx);G.box(x0-t,z1-t,x1+t,z1+t,y0,y1,hx,hx);
  G.box(x0-t,z0+t,x0+t,z1-t,y0,y1,hx,hx);G.box(x1-t,z0+t,x1+t,z1-t,y0,y1,hx,hx);
}
// ---------- fachada da frente: sempre o lado da porta, virado pra rua ----------
// b.door.out (map.js) aponta da porta pra rua. Sem porta, a frente é o sul.
// Tudo da fachada (porta, toldo, letreiro, luminária) é montado em coordenadas da fachada:
// u = ao longo da parede (em unidades do mundo), v = pra fora da parede (0 = rente), y = altura.
export function facadeOf(b){
  const o=(b.door&&b.door.out)||[0,1], alongX=o[1]!==0, s=alongX?o[1]:o[0];
  const x0=b.x0*U,z0=b.y0*U,x1=b.x1*U,z1=b.y1*U;
  const wall=o[1]>0?z1:o[1]<0?z0:o[0]>0?x1:x0, a0=alongX?x0:z0, a1=alongX?x1:z1;
  const d=b.door, uc0=d?(alongX?d.x*U:d.y*U):(a0+a1)/2;
  const P=(u,v,y)=>alongX?[u,y,wall+s*v]:[wall+s*v,y,u];                 // ponto
  const N=(nu,nv,ny)=>alongX?[nu,ny,s*nv]:[s*nv,ny,nu];                 // direção
  const box=(G,u0,u1,v0,v1,y0,y1,top,side,shade=true)=>{const w0=wall+s*v0,w1=wall+s*v1,lo=Math.min(w0,w1),hi=Math.max(w0,w1);
    if(alongX)G.box(u0,lo,u1,hi,y0,y1,top,side,shade);else G.box(lo,u0,hi,u1,y0,y1,top,side,shade);};
  // quadrilátero (u,v,y) com normal local (nu,nv,ny)
  const face=(G,a,b2,c,d2,n,col)=>{const w=N(...n);G.face(P(...a),P(...b2),P(...c),P(...d2),w[0],w[1],w[2],col);};
  return {o,alongX,s,wall,a0,a1,uc0,P,N,box,face};
}
// toldo listrado em cima da porta
const AWNING={farmacia:'#2e9e4f',lanchonete:'#d83a2e',mercadinho:'#c2185b',padaria:'#e08a1e',lojaposto:'#d83a2e',armas:'#7a1f1f',ze:'#e07a1e',pintura:'#1e88c8',pintura2:'#1e88c8'};
function awning(G,f,yt,hex,u0,u1){
  const a=u0,bx=u1,yb=yt-0.28,out=0.65,n=Math.max(4,Math.round((bx-a)/0.35));
  const c1=C(hex),c2=C('#f4efe6');
  for(let k=0;k<n;k++){const s0=a+(bx-a)*k/n,s1=a+(bx-a)*(k+1)/n,col=k%2?c2:c1;
    f.face(G,[s0,out,yb],[s1,out,yb],[s1,0.02,yt],[s0,0.02,yt],[0,0.5,0.85],col);
    f.face(G,[s0,out,yb-0.12],[s1,out,yb-0.12],[s1,out,yb],[s0,out,yb],[0,1,0],col.clone().multiplyScalar(0.85));}
}
// porta de verdade na fachada da frente, de cada tipo de lugar (G = paredes, Gw = vidro, Gl = luz que acende de noite)
const SHOP_IN={farmacia:['#f4f7f4','#2e9e4a','#e53935'],mercadinho:['#5a3a22','#e53935','#fdd835'],padaria:['#7a4f2a','#e0a35a','#f3d9a4'],
  lanchonete:['#5a2a20','#fdd835','#c0392b'],lojaposto:['#d5d5d5','#1e88e5','#fdd835'],armas:['#2a2622','#555','#777']};
function doorFront(G,Gw,Gl,b,H){
  const f=facadeOf(b),k=b.kind, box=(...a)=>f.box(G,...a), glass=(...a)=>f.box(Gw,...a), lit=(u0,u1,y0,y1,v,col)=>f.box(Gl,u0,u1,v,v+0.004,y0,y1,null,col,false);
  const big=k==='hospital'||k==='policia'||k==='escola', hw=k==='casa'?0.36:k==='hospital'?0.85:big?0.7:0.55;
  const uc=Math.min(f.a1-hw-0.3,Math.max(f.a0+hw+0.3,f.uc0)), dh=Math.max(0.9,Math.min(k==='casa'?1.2:big?1.5:1.3,H-0.38));
  const u0=uc-hw,u1=uc+hw;
  // degrau/calçadinha na frente da porta
  box(u0-0.2,u1+0.2,0,0.4,0,0.07,'#cfc9bc','#b5afa2');
  if(k==='casa'){
    const fr='#f4efe6';
    box(u0,u1,0,0.012,0,dh,null,'#2a1d14');                                    // vão
    box(u0+0.03,u1-0.03,0.012,0.05,0.07,dh-0.02,'#6b3f22','#7a4a2a');         // porta de madeira
    for(const y of [0.25,0.7])box(u0+0.09,u1-0.09,0.05,0.065,y,y+0.32,'#5b3419','#5b3419');   // almofadas
    box(u1-0.14,u1-0.09,0.05,0.1,0.58,0.64,'#d4af37','#c49a2c');              // maçaneta
    box(u0-0.07,u0,0,0.07,0,dh+0.07,fr,fr);box(u1,u1+0.07,0,0.07,0,dh+0.07,fr,fr);box(u0-0.07,u1+0.07,0,0.07,dh,dh+0.07,fr,fr);
    // telhadinho em cima da porta e o capacho
    f.face(G,[u0-0.3,0.55,dh+0.12],[u1+0.3,0.55,dh+0.12],[u1+0.3,0.02,dh+0.36],[u0-0.3,0.02,dh+0.36],[0,0.6,0.8],C(b.roof||'#9c4a32'));
    box(u0-0.3,u1+0.3,0.02,0.55,dh+0.06,dh+0.12,null,'#f4efe6');
    box(uc-0.3,uc+0.3,0.42,0.82,0,0.02,'#7a5a3a','#7a5a3a');
    // luminária do lado da porta
    box(u1+0.14,u1+0.24,0,0.1,dh-0.1,dh+0.06,'#3a3a3a','#3a3a3a');lit(u1+0.15,u1+0.23,dh-0.08,dh+0.04,0.101,'#ffd27a');
    return;
  }
  if(k==='hospital'||k==='policia'){
    const fr=k==='hospital'?'#b9c2c8':'#1f3a6b', mq=k==='hospital'?'#f2f2ee':'#c8d2e0';
    box(u0,u1,0,0.012,0,dh,null,'#2b3238');
    glass(u0+0.02,uc-0.01,0.015,0.03,0.07,dh-0.02,null,'#7aa7c7');glass(uc+0.01,u1-0.02,0.015,0.03,0.07,dh-0.02,null,'#7aa7c7');
    lit(u0+0.03,u1-0.03,0.07,dh-0.03,0.032,'#fff3d6');
    for(const u of [u0-0.06,uc-0.025,u1])box(u,u+0.06,0,0.05,0,dh,fr,fr);box(u0-0.06,u1+0.06,0,0.05,dh,dh+0.06,fr,fr);
    // marquise de concreto com dois pilares
    // marquise de concreto em balanço (estreita, pra porta aparecer de cima)
    const mw=hw+0.6;box(uc-mw,uc+mw,0,0.6,dh+0.16,dh+0.3,mq,mq);
    // placa em cima (sem letra): cruz vermelha no hospital, azul na delegacia
    const py=Math.min(H-0.25,dh+0.45);
    if(k==='hospital'){box(uc-0.32,uc+0.32,0,0.05,py,py+0.55,'#ffffff','#ffffff');box(uc-0.2,uc+0.2,0.05,0.07,py+0.21,py+0.34,'#d32f2f','#d32f2f');box(uc-0.065,uc+0.065,0.05,0.07,py+0.08,py+0.47,'#d32f2f','#d32f2f');}
    else{box(uc-0.5,uc+0.5,0,0.05,py,py+0.3,'#1f3a6b','#1f3a6b');box(uc-0.44,uc+0.44,0.05,0.06,py+0.04,py+0.26,'#e9eef5','#e9eef5');
      box(uc+mw-0.25,uc+mw-0.1,0.4,0.55,dh+0.3,dh+0.42,'#2a4f9a','#2a4f9a');lit(uc+mw-0.24,uc+mw-0.11,dh+0.31,dh+0.41,0.551,'#4d7dff');}
    return;
  }
  if(k==='escola'){
    // portão de ferro verde de duas folhas, pilares e a placa azul (sem nome)
    box(u0,u1,0,0.012,0,dh,null,'#3a3328');
    const gate='#2f6b45';
    for(let u=u0+0.06;u<u1-0.03;u+=0.11)box(u,u+0.03,0.03,0.06,0.05,dh-0.05,gate,gate,false);
    for(const y of [0.08,dh*0.5,dh-0.1])box(u0,u1,0.03,0.07,y,y+0.05,gate,gate);
    box(uc-0.015,uc+0.015,0.03,0.07,0.05,dh-0.05,gate,gate);
    for(const u of [u0-0.16,u1])box(u,u+0.16,0,0.16,0,dh+0.2,'#e7e0c9','#d9d1b6');
    const py=Math.min(H-0.3,dh+0.3);box(uc-0.6,uc+0.6,0,0.05,py,py+0.28,'#3f6fb0','#3f6fb0');box(uc-0.54,uc+0.54,0.05,0.06,py+0.04,py+0.24,'#f4efe6','#f4efe6');
    return;
  }
  // comércio: porta de aço de enrolar recolhida, o vão aberto mostrando a loja e vitrine do lado
  const [inC,p1,p2]=SHOP_IN[k]||['#4a3a2a','#e53935','#1e88e5'], fr='#3a3d42';
  box(u0,u1,0,0.012,0,dh,null,inC);
  // prateleira lá dentro (só a sugestão, com produtos coloridos)
  for(const y of [0.3,0.62,0.94])if(y<dh-0.1){box(u0+0.06,u1-0.06,0.012,0.02,y,y+0.03,null,'#d8cfc0',false);
    for(let u=u0+0.1;u<u1-0.12;u+=0.12)box(u,u+0.08,0.012,0.018,y+0.03,y+0.15,null,((u*7.3+y*3)%1)<0.5?p1:p2,false);}
  lit(u0+0.02,u1-0.02,0.02,dh-0.02,0.022,'#ffe2a8');
  if(k==='farmacia'||k==='lojaposto'){ // porta de vidro
    glass(u0+0.02,uc-0.01,0.026,0.04,0.07,dh-0.02,null,'#8fb6cc');glass(uc+0.01,u1-0.02,0.026,0.04,0.07,dh-0.02,null,'#8fb6cc');
    box(uc-0.02,uc+0.02,0,0.05,0,dh,fr,fr);}
  if(k==='armas'){for(let u=u0+0.05;u<u1;u+=0.1)box(u,u+0.025,0.03,0.05,0.07,dh,'#5a5a5a','#5a5a5a',false); // grade
    box(u0,u1,0.03,0.06,dh*0.55,dh,'#8a8f96','#9aa0a6');for(let y=dh*0.55+0.05;y<dh;y+=0.07)box(u0,u1,0.06,0.065,y,y+0.012,'#6f747a','#6f747a',false);} // aço meio baixado
  for(const u of [u0-0.07,u1])box(u,u+0.07,0,0.06,0,dh+0.06,fr,fr);
  box(u0-0.12,u1+0.12,0,0.2,dh+0.02,dh+0.24,'#8d939a','#a3a9b0'); // caixa da porta de aço
  for(let y=dh+0.06;y<dh+0.22;y+=0.05)box(u0-0.12,u1+0.12,0.2,0.205,y,y+0.012,'#6f747a','#6f747a',false);
  // vitrine dos dois lados, se couber
  for(const sg of [-1,1]){const a=sg<0?u0-0.2:u1+0.2, c=a+sg*Math.min(1.1,(sg<0?u0-f.a0:f.a1-u1)-0.45);if(sg*(c-a)<0.4)continue;
    const v0=Math.min(a,c),v1=Math.max(a,c);
    box(v0-0.05,v1+0.05,0,0.06,0.22,0.3,fr,fr);box(v0-0.05,v1+0.05,0,0.06,dh-0.05,dh+0.02,fr,fr);
    box(v0,v1,0,0.012,0.3,dh-0.05,null,inC);
    for(let u=v0+0.08;u<v1-0.1;u+=0.16)box(u,u+0.1,0.012,0.02,0.3,0.42+((u*5.1)%1)*0.15,null,((u*3.7)%1)<0.5?p1:p2,false);
    glass(v0,v1,0.025,0.035,0.3,dh-0.05,null,'#8fb6cc');lit(v0,v1,0.3,dh-0.05,0.036,'#ffe2a8');}
  const yt=Math.min(H-0.08,dh+0.55);
  if(AWNING[k])awning(G,f,yt,AWNING[k],Math.max(f.a0+0.15,u0-1.3),Math.min(f.a1-0.15,u1+1.3));
  // luminária em cima da porta
  box(uc-0.1,uc+0.1,0.2,0.32,dh+0.24,dh+0.3,'#3a3a3a','#3a3a3a');lit(uc-0.08,uc+0.08,dh+0.245,dh+0.295,0.322,'#fff0c8');
}
// aquecedor solar de água: placa azul escura inclinada com moldura e o boiler em cima
function solar(G,x,z,H){
  const w=1.0,d=0.7,c=C('#1d3a6e');
  G.quad([x,H+0.08,z+d],[x+w,H+0.08,z+d],[x+w,H+0.45,z],[x,H+0.45,z],0,0.88,0.47,c);
  G.box(x-0.04,z-0.02,x+w+0.04,z+0.03,H,H+0.47,'#cfd3d6','#aab0b5');G.box(x,z-0.3,x+w,z-0.05,H+0.3,H+0.55,'#d9dcde','#b6bbbf');
  G.box(x+0.05,z+d-0.05,x+0.1,z+d,H,H+0.1,'#888','#888');G.box(x+w-0.1,z+d-0.05,x+w-0.05,z+d,H,H+0.1,'#888','#888');
}
// janelas: vidro em todas e luz acesa em parte delas (aparece só de noite)
function windows(Gw,Gl,b,x0,z0,x1,z1,H){
  if(['conteiner','barraca','salva-vidas'].includes(b.style))return;
  const floorH=b.style==='galpao'?2.2:0.95, rows=Math.max(1,Math.floor((H-0.3)/floorH));
  const r=mulberry(Math.floor(b.seed*1e9)+7);
  const glass=C(b.style==='torre'||b.style==='hotel'?'#5b7c99':'#3e4f5e');
  const lit=C('#ffd98a');
  const faces=[[x0,z0,x1,z0,0,-1],[x1,z1,x0,z1,0,1],[x0,z1,x0,z0,-1,0],[x1,z0,x1,z1,1,0]];
  for(const [ax,az,bx,bz,nx,nz] of faces){
    const len=Math.hypot(bx-ax,bz-az), n=Math.max(1,Math.floor(len/1.1)), off=0.02;
    for(let row=0;row<rows;row++){
      const y0=0.35+row*floorH, y1=y0+floorH*0.5; if(y1>H-0.15)break;
      for(let k=0;k<n;k++){
        const t0=(k+0.25)/n,t1=(k+0.75)/n;
        const p0=[ax+(bx-ax)*t0+nx*off,0,az+(bz-az)*t0+nz*off],p1=[ax+(bx-ax)*t1+nx*off,0,az+(bz-az)*t1+nz*off];
        const q=[[p0[0],y0,p0[2]],[p1[0],y0,p1[2]],[p1[0],y1,p1[2]],[p0[0],y1,p0[2]]];
        Gw.quad(q[0],q[1],q[2],q[3],nx,0,nz,glass);
        if(r()<0.38)Gl.quad(q[0],q[1],q[2],q[3],nx,0,nz,lit);
      }
    }
  }
}

// textura do telhado com o ícone/placa do lugar (reaproveita o desenho 2D)
function roofTexture(b){
  const w=Math.round(b.x1-b.x0), h=Math.round(b.y1-b.y0);
  const cv=document.createElement('canvas');cv.width=Math.min(1024,w*2);cv.height=Math.min(1024,h*2);
  const g=cv.getContext('2d');g.scale(cv.width/w,cv.height/h);
  g.fillStyle=b.roof||b.wall;g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(255,255,255,0.25)';g.lineWidth=4;g.strokeRect(3,3,w-6,h-6);
  roofSign(g,b,0,0,w,h);
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;return tx;
}

// casas que podem virar modelo 3D (casas do Jardim com lote quase quadrado e mansões):
// a geometria delas fica separada pra poder esconder quando os modelos chegarem
export const houseSwap=b=>b.kind==='b'&&(b.style==='mansao'||(b.style==='casa'&&Math.max(b.x1-b.x0,b.y1-b.y0)/Math.min(b.x1-b.x0,b.y1-b.y0)<=2.2));
export function buildCity(scene,mats){
  const SG=new SGeo(), SGw=new SGeo(), SGl=new SGeo(), SGm=new SGeo(); // SGm: peças que os modelos do Meshy substituem
  const HG=new SGeo(), HGw=new SGeo(), HGl=new SGeo(); // casas trocáveis
  const special3d=[];
  for(const b of buildings){
    if(b.kind==='estadio'){special3d.push(buildStadium(b,mats));continue;}
    const x0=b.x0*U,z0=b.y0*U,x1=b.x1*U,z1=b.y1*U,H=bh(b);
    const sw=houseSwap(b),cx=(x0+x1)/2,cz=(z0+z1)/2, G=(sw?HG:SG).at(cx,cz), Gw=(sw?HGw:SGw).at(cx,cz), Gl=(sw?HGl:SGl).at(cx,cz);
    if(b.kind==='canopy'){ // cobertura do posto: pilares + laje fina
      for(const [px,pz] of [[x0+0.3,z0+0.3],[x1-0.5,z0+0.3],[x0+0.3,z1-0.5],[x1-0.5,z1-0.5]])G.box(px,pz,px+0.2,pz+0.2,0,H,'#9e9e9e','#9e9e9e');
      G.box(x0,z0,x1,z1,H,H+0.25,'#f2f2ee','#c9342a',false);continue;}
    if(b.style==='barraca'){quiosque(G,x0,z0,x1,z1,b);continue;} // Praia do Recanto: quiosque de madeira
    // no morro, 3 em cada 4 casinhas têm laje (com caixa d'água e ferro pra cima, esperando o próximo andar)
    const laje=b.style==='casinha'&&b.kind==='b'&&(b.seed*7%1)<0.75;
    const pitched=['casa','casario','casinha','mansao'].includes(b.style)&&b.kind==='b'&&!laje;
    const isPOI=b.kind!=='b';
    const small=['conteiner','barraca','salva-vidas'].includes(b.style);
    const r=mulberry(Math.floor((b.seed||0.5)*1e9)+3);
    G.box(x0,z0,x1,z1,0,H,(isPOI||pitched)?null:laje?'#a29c92':(b.roof||b.wall),b.wall,true,H>3?0.72:0.62);
    if(laje)lajeTop(G,x0,z0,x1,z1,H,r);
    windows(Gw,Gl,b,x0,z0,x1,z1,H);
    if(!small){
      // rodapé mais escuro em volta da base
      const base=C(b.wall).multiplyScalar(0.55);G.box(x0-0.03,z0-0.03,x1+0.03,z1+0.03,0,0.16,null,base,true);
      // platibanda/beiral: moldura clara em volta do topo dos prédios de telhado plano
      if(!pitched&&!isPOI&&!laje&&b.style!=='galpao')ring(G,x0,z0,x1,z1,H-0.1,H+0.12,0.12,C(b.wall).lerp(C('#ffffff'),0.35));
    }
    if(b.door&&b.kind!=='estadio')doorFront(G,Gw,Gl,b,H);
    else if(isPOI&&AWNING[b.kind]){const f=facadeOf(b);awning(G,f,Math.min(1.25,H*0.6),AWNING[b.kind],f.a0+(f.a1-f.a0)*0.1,f.a1-(f.a1-f.a0)*0.1);}
    if(pitched){const rh=Math.min(1.2,Math.min(x1-x0,z1-z0)*0.35);gable(G,x0,z0,x1,z1,H,rh,b.style==='casinha'?'#9a9a94':b.roof); // no morro, telha de amianto
      // antena de TV em algumas casas (no meio da cumeeira)
      if(r()<0.35){const ax=(x0+x1)/2+(r()-0.5)*0.6,az=(z0+z1)/2;G.box(ax-0.02,az-0.02,ax+0.02,az+0.02,H+rh*0.9,H+rh+0.8,'#555','#555',false);
        G.box(ax-0.35,az-0.015,ax+0.35,az+0.015,H+rh+0.62,H+rh+0.66,'#666','#666',false);G.box(ax-0.25,az-0.015,ax+0.25,az+0.015,H+rh+0.72,H+rh+0.75,'#666','#666',false);}}
    else if(isPOI){ // telhado com placa: malha separada com textura
      const geo=new THREE.PlaneGeometry(x1-x0,z1-z0);geo.rotateX(-Math.PI/2);
      const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:roofTexture(b)}));m.position.set((x0+x1)/2,H+0.01,(z0+z1)/2);m.receiveShadow=true;scene.add(m);
    } else if(!small&&!laje){ // caixa d'água, ar-condicionado e aquecedor solar no telhado
      const n=Math.floor(r()*3)+((x1-x0)*(z1-z0)>40?2:0);
      for(let k=0;k<n;k++){const px=x0+0.5+r()*Math.max(0.1,x1-x0-1.5),pz=z0+0.5+r()*Math.max(0.1,z1-z0-1.5),q=r();
        if(q<0.4)G.box(px,pz,px+0.7,pz+0.7,H,H+0.6,'#4f8fd3','#2f6fb3');
        else if(q<0.7)G.box(px,pz,px+0.8,pz+0.5,H,H+0.35,'#b0b0b0','#8a8a8a');
        else solar(G,px,pz,H);}
      if(b.style==='torre'||b.style==='hotel'){G.box(x0+0.2,z0+0.2,x1-0.2,z1-0.2,H,H+0.15,'#6b7680','#6b7680'); // casa de máquinas
        const mx=x0+(x1-x0)*0.3,mz=z0+(z1-z0)*0.3;G.box(mx,mz,mx+1.2,mz+1,H,H+0.9,'#9aa3ab','#7d868e');}
    }
  }
  // bombas de gasolina, pontos de ônibus, orelhões
  let G;
  for(const p of pumps){const x=p.x*U,z=p.y*U;G=SG.at(x,z);G.box(x-0.2,z-0.3,x+0.2,z+0.3,0,0.9,'#c9342a','#c9342a');}
  for(const s of BUS_STOPS){const x=(s.x+s.side.x*s.off)*U,z=(s.y+s.side.y*s.off)*U;const horiz=s.side.x===0;G=SG.at(x,z);
    const w=horiz?1.4:0.4,d=horiz?0.4:1.4;G.box(x-w,z-d,x+w,z+d,1.5,1.62,'#1565c0','#1565c0');
    for(const [px,pz] of [[x-w,z-d],[x+w-0.1,z+d-0.1]])G.box(px,pz,px+0.1,pz+0.1,0,1.5,'#cfd8dc','#cfd8dc');}
  // orelhão: poste e a concha laranja (o "orelhão" de verdade)
  for(const ph of phones){const x=ph.x*U,z=ph.y*U;G=SGm.at(x,z);G.box(x-0.05,z-0.05,x+0.05,z+0.05,0,1.95,'#555','#555');orelhao(G,x,z);}
  // guindastes do porto: pórtico com duas pernas e a lança por cima do mar
  for(const d of decor)if(d.type==='guindaste'){const x=d.x*U,z=d.y*U;G=SG.at(x,z);const Y='#f2a516',Yd='#d48a0c';
    for(const lx of [-1.3,1.1])for(const lz of [-1.6,0.4])G.box(x+lx,z+lz,x+lx+0.22,z+lz+0.22,0,6.2,Yd,Y);
    for(const lz of [-1.6,0.4])G.box(x-1.35,z+lz-0.02,x+1.37,z+lz+0.24,5.6,5.85,Y,Y);
    G.box(x-0.35,z-4.2,x+0.35,z+6.5,6.2,6.75,Y,Y);                       // lança
    G.box(x-0.6,z-4.4,x+0.6,z-3.2,6.75,7.6,'#4a4f55','#3a3f45');         // contrapeso
    G.box(x-0.5,z-0.9,x+0.5,z+0.1,6.75,7.5,'#e8e2d0','#c9c3b2');         // cabine
    G.box(x-0.03,z+4.6,x+0.03,z+4.66,3.2,6.2,'#222','#222');G.box(x-0.25,z+4.4,x+0.25,z+4.86,2.9,3.2,'#333','#333');}
  buildRio(scene,SG,mats,SGm);

  const city=SG.meshes(mats.city);for(const m of city){m.castShadow=true;m.receiveShadow=true;scene.add(m);}
  const win=SGw.meshes(mats.glass);for(const m of win)scene.add(m);
  const lit=SGl.meshes(mats.lit);for(const m of lit){m.renderOrder=1;scene.add(m);}
  const meshyOld=SGm.meshes(mats.city);for(const m of meshyOld){m.castShadow=true;m.receiveShadow=true;scene.add(m);}
  const houses=[...HG.meshes(mats.city),...HGw.meshes(mats.glass),...HGl.meshes(mats.lit)];
  for(const m of houses){if(m.material===mats.city){m.castShadow=true;m.receiveShadow=true;}if(m.material===mats.lit)m.renderOrder=1;scene.add(m);}

  // árvores e coqueiros (instanciadas)
  const normal=trees.filter(t=>!t.palm), palms=trees.filter(t=>t.palm);
  const trunkG=new THREE.CylinderGeometry(0.1,0.14,1,6);trunkG.translate(0,0.5,0);
  const crownG=new THREE.IcosahedronGeometry(1,0);
  const pt=t=>[t.x*U,t.y*U];
  const trunks=new SInst(trunkG,mats.trunk,[...normal.map(pt),...palms.map(pt)]);
  const crowns=new SInst(crownG,mats.leaf,normal.map(pt));
  const crowns2=new SInst(crownG,mats.leaf,normal.map(pt)); // segunda copa, menor e deslocada: árvore mais cheia
  const nutG=new THREE.IcosahedronGeometry(0.11,0);
  const nuts=new SInst(nutG,mats.trunk,palms.flatMap(t=>Array(3).fill(pt(t)))); // cocos
  const frondG=new THREE.BoxGeometry(1.5,0.05,0.32);frondG.translate(0.75,0,0);
  const fronds=new SInst(frondG,mats.leaf,palms.flatMap(t=>Array(7).fill(pt(t))));
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S3=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  let ti=0;
  normal.forEach((t,i)=>{const s=t.r/16;M.compose(P.set(t.x*U,0,t.y*U),Q.identity(),S3.set(1,1.6*s,1));trunks.setMatrixAt(ti++,M);
    M.compose(P.set(t.x*U,1.6*s+0.55*s,t.y*U),Q.setFromEuler(E.set(0,t.x,0)),S3.set(0.85*s,0.75*s,0.85*s));crowns.setMatrixAt(i,M);crowns.setColorAt(i,C(t.c));
    const ox=Math.sin(t.x*1.7)*0.35*s,oz=Math.cos(t.y*1.3)*0.35*s;
    M.compose(P.set(t.x*U+ox,1.6*s+0.95*s,t.y*U+oz),Q.setFromEuler(E.set(0.4,t.y,0.2)),S3.set(0.55*s,0.5*s,0.55*s));crowns2.setMatrixAt(i,M);crowns2.setColorAt(i,C(t.c).lerp(C('#a5d66b'),0.25));});
  palms.forEach((t,i)=>{M.compose(P.set(t.x*U,0,t.y*U),Q.setFromEuler(E.set(0.08,t.r,0.05)),S3.set(0.8,3.2,0.8));trunks.setMatrixAt(ti++,M);
    for(let k=0;k<7;k++){M.compose(P.set(t.x*U+0.1,3.15,t.y*U),Q.setFromEuler(E.set(0,t.r+k*Math.PI*2/7,-0.35-(k%2)*0.15,'YXZ')),S3.set(1,1,1));fronds.setMatrixAt(i*7+k,M);fronds.setColorAt(i*7+k,C(k%2?'#3f8f3a':'#2f7a33'));}
    for(let k=0;k<3;k++){const a=t.r+k*2.1;M.compose(P.set(t.x*U+0.1+Math.cos(a)*0.13,3.0,t.y*U+Math.sin(a)*0.13),Q.identity(),S3.set(1,1,1));nuts.setMatrixAt(i*3+k,M);}});
  for(const m of [trunks,crowns,crowns2,fronds])m.add(scene,true);
  nuts.add(scene);
  const treeMeshes=[trunks,crowns,crowns2,fronds,nuts].flatMap(m=>m.list);

  // postes
  const poleG=new THREE.CylinderGeometry(0.05,0.07,2.6,5);poleG.translate(0,1.3,0);
  const headG=new THREE.BoxGeometry(0.5,0.12,0.25);
  const lp=lamps.map(l=>[l.x*U,l.y*U]);
  const poles=new SInst(poleG,mats.pole,lp), heads=new SInst(headG,mats.lampHead,lp);
  lamps.forEach((l,i)=>{M.compose(P.set(l.x*U,0,l.y*U),Q.identity(),S3.set(1,1,1));poles.setMatrixAt(i,M);M.compose(P.set(l.x*U,2.6,l.y*U),Q.identity(),S3.set(1,1,1));heads.setMatrixAt(i,M);});
  poles.add(scene);heads.add(scene);
  // poça de luz no chão em volta dos postes (só de noite)
  const poolG=new THREE.PlaneGeometry(1,1);poolG.rotateX(-Math.PI/2);
  const pools=new SInst(poolG,mats.lightPool,lp);
  lamps.forEach((l,i)=>{M.compose(P.set(l.x*U,0.03,l.y*U),Q.identity(),S3.set(8,1,8));pools.setMatrixAt(i,M);});
  pools.add(scene);for(const m of pools.list)m.renderOrder=2;

  // guarda-sóis da praia
  const umb=decor.filter(d=>d.type==='guarda-sol');
  const up=umb.map(d=>[d.x*U,d.y*U]);
  const umbTop=new SInst(new THREE.ConeGeometry(0.75,0.35,8),mats.umbrella,up);
  const umbPole=new SInst(poleG,mats.pole,up);
  umb.forEach((d,i)=>{M.compose(P.set(d.x*U,1.25,d.y*U),Q.identity(),S3.set(1,1,1));umbTop.setMatrixAt(i,M);umbTop.setColorAt(i,C(d.c));
    M.compose(P.set(d.x*U,0,d.y*U),Q.identity(),S3.set(0.6,0.5,0.6));umbPole.setMatrixAt(i,M);});
  umbTop.add(scene,true);umbPole.add(scene);

  // semáforos: poste + caixa, e 3 luzes instanciadas (a cor muda a cada quadro)
  const heads3=[];
  for(let j=0;j<NH;j++)for(let i=0;i<NV;i++){
    if(!isJunction(i,j)||!signalized(i,j))continue;
    const ox=VL[i].px,oy=HL[j].px,hv=VL[i].w*T/2,hh=HL[j].w*T/2;
    heads3.push({x:ox-hv-8,y:oy+hh+8,axis:'h',face:[1,0],i,j});
    heads3.push({x:ox+hv+8,y:oy-hh-8,axis:'h',face:[-1,0],i,j});
    heads3.push({x:ox-hv-8,y:oy-hh-8,axis:'v',face:[0,1],i,j});
    heads3.push({x:ox+hv+8,y:oy+hh+8,axis:'v',face:[0,-1],i,j});
  }
  const hp=heads3.map(h=>[h.x*U,h.y*U]);
  const tlPole=new SInst(poleG,mats.pole,hp);
  const tlBox=new SInst(new THREE.BoxGeometry(0.3,0.9,0.3),mats.dark,hp);
  const bulbG=new THREE.SphereGeometry(0.1,5,3);
  const bulbs=['r','y','g'].map(()=>new SInst(bulbG,mats.bulb,hp));
  heads3.forEach((h,k)=>{const x=h.x*U,z=h.y*U;
    M.compose(P.set(x,0,z),Q.identity(),S3.set(1,1.1,1));tlPole.setMatrixAt(k,M);
    M.compose(P.set(x,3.1,z),Q.identity(),S3.set(1,1,1));tlBox.setMatrixAt(k,M);
    bulbs.forEach((bm,c)=>{M.compose(P.set(x+h.face[0]*0.16,3.38-c*0.28,z+h.face[1]*0.16),Q.identity(),S3.set(1,1,1));bm.setMatrixAt(k,M);bm.setColorAt(k,C('#222'));});});
  for(const m of [tlPole,tlBox,...bulbs])m.add(scene);

  return {city,win,lit,pools,heads,heads3,bulbs,special3d,
    // o que os modelos 3D (props.js) substituem quando carregam
    swap:{houses,trees:treeMeshes,lamps:[...poles.list,...heads.list],meshy:meshyOld}};
}

// ---------- Guanabara 97: peças de cada bairro ----------
// laje do morro: piso de concreto, caixa d'água azul redonda e ferros esperando o próximo andar
function lajeTop(G,x0,z0,x1,z1,H,r){
  G.box(x0,z0,x1,z1,H,H+0.06,'#8f8a80','#8f8a80',false);
  if(r()<0.85){const tx=x0+0.45+r()*Math.max(0.05,x1-x0-1.3),tz=z0+0.45+r()*Math.max(0.05,z1-z0-1.3);
    G.box(tx-0.05,tz-0.05,tx+0.85,tz+0.85,H,H+0.25,'#7a756c','#7a756c');           // base de tijolo
    G.cyl(tx+0.4,tz+0.4,0.36,H+0.25,H+0.85,'#2d6fc2','#2b66b5');G.cyl(tx+0.4,tz+0.4,0.38,H+0.85,H+0.93,'#3a7fd6','#2b66b5');}
  if(r()<0.7)for(const [px,pz] of [[x0+0.12,z0+0.12],[x1-0.18,z0+0.12],[x0+0.12,z1-0.18],[x1-0.18,z1-0.18]])
    G.box(px,pz,px+0.05,pz+0.05,H,H+0.45+r()*0.2,'#6b4a3a','#6b4a3a',false);   // vergalhão
  if(r()<0.35){const y=H+0.06;G.box(x0+0.2,z1-0.5,x0+1.3,z1-0.2,y,y+0.03,'#ffffff','#ffffff',false);} // roupa no varal
}
// quiosque de madeira da Praia do Recanto: deque, esteios roliços, balcão de tábua branca com tampo azul,
// telhado de palha de quatro águas com franja, placa de madeira na frente (cor do quiosque, sem nome),
// cocos verdes empilhados, mesinha e cadeiras de plástico na areia
export function quiosque(G,x0,z0,x1,z1,b){
  const wood='#8a5a32',dark='#5e3a1e',plank='#efe7d4',blue='#2f8fcf',straw=C('#d9b45a'),straw2=C('#c49a43'),cx=(x0+x1)/2;
  const r=mulberry(Math.floor((b.seed||0.5)*1e9)+11);
  G.box(x0+0.05,z0+0.05,x1-0.05,z1-0.05,0,0.08,'#a87a4c','#7a5232');                          // deque
  // balcão em U aberto atrás: frente e laterais de tábua branca com sarrafos de madeira, tampo azul
  const bx0=x0+0.3,bx1=x1-0.3,bz0=z0+0.35,bz1=z1-0.3,t=0.14,yb=0.95;
  G.box(bx0,bz1-t,bx1,bz1,0.08,yb,null,plank,true,0.75);G.box(bx0,bz0,bx0+t,bz1-t,0.08,yb,null,plank,true,0.75);G.box(bx1-t,bz0,bx1,bz1-t,0.08,yb,null,plank,true,0.75);
  for(let k=0;k<=6;k++){const x=bx0+(bx1-bx0)*k/6-0.03;G.box(x,bz1,x+0.06,bz1+0.02,0.08,yb,wood,wood,false);}       // sarrafos da frente
  G.box(bx0-0.06,bz1-t-0.04,bx1+0.06,bz1+0.1,yb,yb+0.07,blue,'#2577ad',false);                                       // tampo azul (frente)
  G.box(bx0-0.06,bz0-0.04,bx0+t+0.04,bz1-t-0.04,yb,yb+0.07,blue,'#2577ad',false);G.box(bx1-t-0.04,bz0-0.04,bx1+0.06,bz1-t-0.04,yb,yb+0.07,blue,'#2577ad',false);
  // prateleira no fundo com garrafas coloridas
  G.box(bx0+0.2,z0+0.12,bx1-0.2,z0+0.3,0.08,1.35,'#c8a57a',wood,true,0.8);
  const BOT=['#2e8b3a','#c62828','#f0c419','#f4f4f0','#6d3b1f'];for(let k=0;k<9;k++){const x=bx0+0.3+k*(bx1-bx0-0.6)/8;G.cyl(x,z0+0.24,0.045,1.35,1.55,BOT[k%5],BOT[k%5],6);}
  // esteios roliços até a palha
  const ph=2.05;for(const [px,pz] of [[x0+0.17,z0+0.17],[x1-0.17,z0+0.17],[x0+0.17,z1-0.17],[x1-0.17,z1-0.17]])G.cyl(px,pz,0.085,0.08,ph,null,dark,7);
  // telhado de palha de quatro águas, beiral largo
  const o=0.5,rx0=x0-o,rz0=z0-o,rx1=x1+o,rz1=z1+o,rh=0.85,inset=Math.min((rz1-rz0),(rx1-rx0))/2*0.85,zm=(rz0+rz1)/2;
  const top=ph+rh,ra=[rx0+inset,top,zm],rb=[rx1-inset,top,zm];
  G.face([rx0,ph,rz1],[rx1,ph,rz1],rb,ra,0,0.75,0.66,straw);                       // água da frente
  G.face([rx1,ph,rz0],[rx0,ph,rz0],ra,rb,0,0.75,-0.66,straw2);                     // água de trás
  G.tri([rx0,ph,rz0],[rx0,ph,rz1],ra,-0.66,0.75,0,straw2.clone().multiplyScalar(0.95));G.tri([rx1,ph,rz1],[rx1,ph,rz0],rb,0.66,0.75,0,straw.clone().multiplyScalar(0.92));
  G.box(ra[0]-0.05,zm-0.07,rb[0]+0.05,zm+0.07,top-0.04,top+0.07,'#a8823a','#a8823a',false);                     // cumeeira amarrada
  // franja: pontas de palha penduradas em volta do beiral (comprimentos sorteados)
  const fr=(ax,az,bx2,bz,nx,nz)=>{const n=Math.max(6,Math.round(Math.hypot(bx2-ax,bz-az)/0.16));
    for(let k=0;k<n;k++){const u0=k/n,u1=(k+1)/n,um=(u0+u1)/2,len=0.22+r()*0.16,col=(k%2?straw:straw2).clone().multiplyScalar(0.9+r()*0.15);
      const p0=[ax+(bx2-ax)*u0,ph+0.02,az+(bz-az)*u0],p1=[ax+(bx2-ax)*u1,ph+0.02,az+(bz-az)*u1],pm=[ax+(bx2-ax)*um+nx*0.04,ph-len,az+(bz-az)*um+nz*0.04];
      G.tri(p0,pm,p1,nx,0.2,nz,col);}};
  fr(rx0,rz1,rx1,rz1,0,1);fr(rx1,rz0,rx0,rz0,0,-1);fr(rx0,rz0,rx0,rz1,-1,0);fr(rx1,rz1,rx1,rz0,1,0);
  // placa de madeira em cima da frente: moldura e quadro pintado na cor do quiosque (o nome fica pra depois)
  const sw=Math.min(1.5,(x1-x0)*0.5),sz=rz1-0.3,sy=ph+0.12;
  G.box(cx-sw/2-0.06,sz-0.06,cx+sw/2+0.06,sz+0.04,sy-0.06,sy+0.5,wood,wood,true);
  G.box(cx-sw/2,sz+0.04,cx+sw/2,sz+0.06,sy,sy+0.44,null,b.roof,false);
  G.box(cx-sw/2+0.1,sz+0.06,cx+sw/2-0.1,sz+0.075,sy+0.15,sy+0.29,null,'#f6f1e3',false);                        // faixa clara (onde vai o nome)
  for(const s of [-1,1])G.box(cx+s*sw*0.42-0.04,sz-0.05,cx+s*sw*0.42+0.04,sz+0.03,ph,sy,dark,dark);            // pés da placa
  // cocos verdes empilhados no canto da frente
  const ccx=x0+0.55,ccz=z1+0.42;for(const [dx,dz,dy] of [[0,0,0],[0.26,0.05,0],[0.12,0.24,0],[-0.14,0.2,0],[0.12,0.1,0.2],[0.02,0.08,0.38]])ball(G,ccx+dx,0.13+dy,ccz+dz,0.14,r()<0.5?'#7cb342':'#8bc34a');
  // mesinha e duas cadeiras de plástico branco na areia
  const tx=x1-0.1,tz=z1+0.95;G.cyl(tx,tz,0.36,0.62,0.66,'#f4f4f0','#dcdcd6',12);G.cyl(tx,tz,0.05,0,0.62,null,'#dcdcd6',6);
  for(const [dx,dz] of [[-0.62,0],[0.62,0]]){const ax=tx+dx,az=tz+dz,f=Math.sign(dx);
    G.box(ax-0.2,az-0.2,ax+0.2,az+0.2,0.36,0.42,'#f4f4f0','#e2e2dc',false);G.box(ax+f*0.16,az-0.2,ax+f*0.22,az+0.2,0.42,0.85,'#f4f4f0','#e2e2dc',false);
    for(const [lx,lz] of [[-0.17,-0.17],[0.17,-0.17],[-0.17,0.17],[0.17,0.17]])G.box(ax+lx-0.025,az+lz-0.025,ax+lx+0.025,az+lz+0.025,0,0.36,null,'#d9d9d2',false);}
  G.box(x1-0.55,z1+0.25,x1-0.2,z1+0.55,0,0.45,'#f2f2ee','#d0d0c8');                                              // isopor
}
// bola facetada (coco, boia): icosaedro com faces planas
const ICO=new THREE.IcosahedronGeometry(1,1).attributes.position.array;
function ball(G,x,y,z,rad,hex){const c0=C(hex);
  for(let i=0;i<ICO.length;i+=9){const v=k=>[x+ICO[i+k]*rad,y+ICO[i+k+1]*rad*0.92,z+ICO[i+k+2]*rad];
    const a=v(0),bb=v(3),c=v(6),nx=(a[0]+bb[0]+c[0])/3-x,ny=(a[1]+bb[1]+c[1])/3-y,nz=(a[2]+bb[2]+c[2])/3-z,l=Math.hypot(nx,ny,nz);
    G.tri(a,bb,c,nx/l,ny/l,nz/l,c0.clone().multiplyScalar(0.85+0.15*Math.max(0,ny/l)));}}
// orelhão: concha (meia cúpula) aberta pra frente
function orelhao(G,x,z){
  const R=0.42,yb=1.25,seg=9,col=C('#f08c00'),inner=C('#f5b04a');
  for(let i=0;i<seg;i++){const a0=-Math.PI*0.15+i/seg*Math.PI*1.3,a1=-Math.PI*0.15+(i+1)/seg*Math.PI*1.3;
    for(let j=0;j<3;j++){const b0=j/3*Math.PI/2,b1=(j+1)/3*Math.PI/2;
      const P=(a,bb)=>[x+Math.cos(a)*Math.cos(bb)*R,yb+Math.sin(bb)*R*1.25,z-Math.sin(a)*Math.cos(bb)*R];
      const p=[P(a0,b0),P(a1,b0),P(a1,b1),P(a0,b1)],am=(a0+a1)/2,bm=(b0+b1)/2;
      G.sheet(p[0],p[1],p[2],p[3],col);}}
  G.box(x-0.12,z-0.12,x+0.12,z+0.02,1.35,1.6,'#3a3a3a','#3a3a3a',false); // aparelho
}
function adTexture(ad){
  const c=document.createElement('canvas');c.width=512;c.height=192;const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,192);grd.addColorStop(0,'#0b4f8a');grd.addColorStop(1,'#06345e');g.fillStyle=grd;g.fillRect(0,0,512,192);
  g.fillStyle='#f2c230';g.fillRect(0,150,512,42);
  g.fillStyle='#ffffff';g.font='bold 64px "Anton",Impact,sans-serif';g.textBaseline='alphabetic';g.fillText(ad[0],22,74);
  g.font='34px "Anton",Impact,sans-serif';g.fillStyle='#9fd3ff';g.fillText(ad[1],24,124);
  g.fillStyle='#0b2a4a';g.font='26px "Anton",Impact,sans-serif';g.fillText(ad[2],22,180);
  // desenho de prédio com sol (logo de construtora)
  g.fillStyle='#ffd23f';g.beginPath();g.arc(430,70,34,0,Math.PI*2);g.fill();
  g.fillStyle='#ffffff';g.fillRect(392,56,26,90);g.fillRect(424,36,30,110);g.fillRect(460,76,22,70);
  g.fillStyle='#0b4f8a';for(let y=44;y<140;y+=12)for(const x of [398,404,430,438,446,464,472])if(x<418||x>424)g.fillRect(x,y,4,6);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
// altura da base do barco no mar (o mar fica em -0,16 e ondula uns 15 cm): o casco afunda um pouco
export const BOAT_Y=-0.3;
function buildRio(scene,SG,mats,SGm){
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S3=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  const ads=new Map();
  for(const d of decor){
    const x=d.x*U,z=d.y*U,G=(d.type==='banca'||d.type==='barco'?SGm:SG).at(x,z);
    if(d.type==='camelo'){ // barraca de camelô: mesa com mercadoria e lona inclinada pra rua
      const [fx,fz]=d.face,a=Math.atan2(fx,fz),c=Math.cos(a),s=Math.sin(a),L=(lx,ly,lz)=>[x+lx*c+lz*s,ly,z-lx*s+lz*c];
      G.obox(x,z,-a,0.55,0.35,0.55,0.62,'#d9cdb0','#8a7a5a');
      for(const [lx,lz] of [[-0.5,-0.3],[0.5,-0.3],[-0.5,0.32],[0.5,0.32]])G.obox(...L(lx,0,lz).filter((_,i)=>i!==1),-a,0.03,0.03,0,lz>0?1.45:1.75,'#444','#555');
      G.sheet(L(-0.62,1.8,-0.42),L(0.62,1.8,-0.42),L(0.62,1.45,0.5),L(-0.62,1.45,0.5),C(d.c));
      const goods=['#e74c3c','#f1c40f','#ecf0f1','#3498db','#2ecc71','#222'];
      for(let k=0;k<4;k++){const [gx,,gz]=L(-0.38+k*0.25,0,0.05);G.box(gx-0.09,gz-0.12,gx+0.09,gz+0.12,0.62,0.62+0.08+((k*7+Math.round(d.x))%3)*0.05,goods[(k+Math.round(d.y))%goods.length],goods[(k+Math.round(d.x))%goods.length],false);}
    } else if(d.type==='banca'){ // banca de jornal verde com revistas na frente
      const [fx,fz]=d.face,side=Math.abs(fx)>0,hw=side?0.5:0.8,hd=side?0.8:0.5;
      G.box(x-hw,z-hd,x+hw,z+hd,0,1.7,null,'#2e7d4f',true,0.7);
      G.box(x-hw-0.15,z-hd-0.15,x+hw+0.15,z+hd+0.15,1.7,1.82,'#1f5e3a','#1f5e3a');
      const cols=['#e53935','#fdd835','#1e88e5','#ffffff','#8e24aa','#fb8c00'];
      for(let k=0;k<5;k++){const t=-0.6+k*0.3;
        if(side){const fx0=x+fx*(hw+0.01);G.box(Math.min(fx0,fx0+fx*0.03),z+t-0.11,Math.max(fx0,fx0+fx*0.03),z+t+0.11,0.7,1.45,cols[k],cols[k],false);}
        else{const fz0=z+fz*(hd+0.01);G.box(x+t-0.11,Math.min(fz0,fz0+fz*0.03),x+t+0.11,Math.max(fz0,fz0+fz*0.03),0.7,1.45,cols[k],cols[k],false);}}
    } else if(d.type==='outdoor'){ // outdoor da construtora: dois pés e a placa (a placa tem textura própria)
      for(const ox of [-1.6,1.6])G.box(x+ox-0.08,z-0.08,x+ox+0.08,z+0.08,0,2.2,'#666','#5a5a5a');
      G.box(x-2.75,z-0.12,x+2.75,z-0.02,2.1,4.15,'#e8e8e8','#d0d0d0');
      (ads.get(d.ad)||ads.set(d.ad,[]).get(d.ad)).push(d);
    } else if(d.type==='barco'){ // canoa de madeira (casco com bico); no mar, afundada até a linha d'água
      const c=Math.cos(d.a),s=Math.sin(d.a),Pt=(lx,lz)=>[x+lx*c-lz*s,z+lx*s+lz*c],y=d.agua?BOAT_Y:0;
      G.prism([Pt(-1.7,0),Pt(-1.1,-0.5),Pt(1.1,-0.5),Pt(1.7,0),Pt(1.1,0.5),Pt(-1.1,0.5)],y,y+0.45,d.c,d.c);
      G.prism([Pt(-1.7,0),Pt(-1.1,-0.5),Pt(1.1,-0.5),Pt(1.7,0),Pt(1.1,0.5),Pt(-1.1,0.5)],y+0.12,y+0.2,null,'#f2f2ee'); // faixa branca no casco
      G.prism([Pt(-1.35,0),Pt(-0.9,-0.36),Pt(0.9,-0.36),Pt(1.35,0),Pt(0.9,0.36),Pt(-0.9,0.36)],y+0.45,y+0.47,'#6b4a30','#6b4a30');
      G.obox(...Pt(0,0),d.a,0.12,0.45,y+0.3,y+0.42,'#8a6a48','#8a6a48');
    } else if(d.type==='pier'){ // trapiche de madeira: tábuas em cima de estacas, do cais até o mar
      const G2=SG.at(x,z),hl=d.len*U/2,hw=0.75,top=0.12,W0='#8a6a48',W1='#6b4a30';
      for(let k=0,n=Math.round(hl*2/0.32);k<n;k++){const z0=z-hl+k*hl*2/n;G2.box(x-hw,z0+0.015,x+hw,z0+hl*2/n-0.015,top-0.07,top,k%3?W0:'#97775a',W1,false);} // tábuas
      for(const sx of [-1,1])G2.box(x+sx*hw-0.06,z-hl,x+sx*hw+0.06,z+hl,top-0.16,top-0.07,W1,W1,false);                           // vigas
      for(let zz=z-hl+0.6;zz<=z+hl;zz+=1.4)for(const sx of [-1,1])G2.cyl(x+sx*(hw-0.05),zz,0.09,-0.8,top+0.28,'#5a3e28','#5a3e28',6); // estacas
      for(const sx of [-1,1])G2.cyl(x+sx*(hw-0.05),z+hl-0.1,0.13,top,top+0.22,'#3a2a1c','#3a2a1c',8);                            // cabeços de amarração
    } else if(d.type==='rede'){ // rede de pesca estendida entre dois paus
      const h=d.horiz!==false,X=(t,y)=>h?[x+t,y,z]:[x,y,z+t];
      for(const t of [-1.8,1.8]){const [px,,pz]=X(t,0);G.box(px-0.05,pz-0.05,px+0.05,pz+0.05,0,1.7,'#6b4a30','#6b4a30');}
      G.sheet(X(-1.75,0.35),X(1.75,0.35),X(1.75,1.6),X(-1.75,1.6),C('#4f6b5e'));
      for(let k=0;k<6;k++){const [px,,pz]=X(-1.5+k*0.6,0);G.box(px-0.05,pz-0.05,px+0.05,pz+0.05,0.32,0.42,'#f2f2ee','#f2f2ee',false);} // boias
    }
  }
  // placas dos outdoors (uma malha por anúncio)
  for(const [ad,list] of ads){const pos=[],uv=[],idx=[];let v=0;
    for(const d of list){const x=d.x*U,z=d.y*U+0.0;pos.push(x-2.65,2.18,z,x+2.65,2.18,z,x+2.65,4.07,z,x-2.65,4.07,z);uv.push(0,0,1,0,1,1,0,1);idx.push(v,v+1,v+2,v,v+2,v+3);v+=4;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();geo.computeBoundingSphere();
    const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:adTexture(ad)}));m.receiveShadow=true;scene.add(m);}
  // moitas da restinga (instanciadas)
  const ms=decor.filter(d=>d.type==='moita');
  if(ms.length){const im=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6,0),mats.leaf,ms.length);
    ms.forEach((d,i)=>{M.compose(P.set(d.x*U,0.15*d.s,d.y*U),Q.setFromEuler(E.set(0,d.x,0)),S3.set(d.s*1.3,d.s*0.55,d.s));im.setMatrixAt(i,M);im.setColorAt(i,C(d.c));});
    im.castShadow=true;im.receiveShadow=true;im.computeBoundingSphere();scene.add(im);}
}

// ---------- estádio ----------
function buildStadium(b,mats){
  const G=new Geo(), I=b.inner;
  const x0=b.x0*U,z0=b.y0*U,x1=b.x1*U,z1=b.y1*U, ix0=I.x0*U,iz0=I.y0*U,ix1=I.x1*U,iz1=I.y1*U;
  const H=bh(b)*1.4, Hi=H*0.25;
  const wall=C('#cfd8dc'), st=[C('#78909c'),C('#8d9ea7')], inner=C('#546e7a');
  // paredes de fora
  G.quad([x0,0,z0],[x0,H,z0],[x1,H,z0],[x1,0,z0],0,0,-1,wall.clone().multiplyScalar(0.82));
  G.quad([x1,0,z1],[x1,H,z1],[x0,H,z1],[x0,0,z1],0,0,1,wall);
  G.quad([x0,0,z1],[x0,H,z1],[x0,H,z0],[x0,0,z0],-1,0,0,wall.clone().multiplyScalar(0.72));
  G.quad([x1,0,z0],[x1,H,z0],[x1,H,z1],[x1,0,z1],1,0,0,wall.clone().multiplyScalar(0.78));
  // arquibancadas inclinadas (de fora alta pra dentro baixa)
  G.quad([x0,H,z0],[ix0,Hi,iz0],[ix1,Hi,iz0],[x1,H,z0],0,0.8,0.6,st[0]);
  G.quad([x1,H,z1],[ix1,Hi,iz1],[ix0,Hi,iz1],[x0,H,z1],0,0.8,-0.6,st[0]);
  G.quad([x0,H,z1],[ix0,Hi,iz1],[ix0,Hi,iz0],[x0,H,z0],0.6,0.8,0,st[1]);
  G.quad([x1,H,z0],[ix1,Hi,iz0],[ix1,Hi,iz1],[x1,H,z1],-0.6,0.8,0,st[1]);
  // mureta da beira do campo
  G.quad([ix1,0,iz0],[ix1,Hi,iz0],[ix0,Hi,iz0],[ix0,0,iz0],0,0,1,inner);
  G.quad([ix0,0,iz1],[ix0,Hi,iz1],[ix1,Hi,iz1],[ix1,0,iz1],0,0,-1,inner);
  G.quad([ix0,0,iz0],[ix0,Hi,iz0],[ix0,Hi,iz1],[ix0,0,iz1],1,0,0,inner);
  G.quad([ix1,0,iz1],[ix1,Hi,iz1],[ix1,Hi,iz0],[ix1,0,iz0],-1,0,0,inner);
  // refletores
  for(const [px,pz] of [[x0-0.5,z0-0.5],[x1+0.3,z0-0.5],[x0-0.5,z1+0.3],[x1+0.3,z1+0.3]]){G.box(px,pz,px+0.25,pz+0.25,0,H+5,'#9e9e9e','#9e9e9e');}
  const mesh=G.mesh(mats.city);mesh.castShadow=true;mesh.receiveShadow=true;
  // torcida: cubinhos nas arquibancadas
  const seats=[];
  const sides=[[[x0,z0],[x1,z0],[ix0,iz0],[ix1,iz0]],[[x1,z1],[x0,z1],[ix1,iz1],[ix0,iz1]],[[x0,z1],[x0,z0],[ix0,iz1],[ix0,iz0]],[[x1,z0],[x1,z1],[ix1,iz0],[ix1,iz1]]];
  for(const [oa,ob,ia,ib] of sides)for(let r=1;r<7;r++){const t=r/7;
    const ax=ia[0]+(oa[0]-ia[0])*t,az=ia[1]+(oa[1]-ia[1])*t,bx=ib[0]+(ob[0]-ib[0])*t,bz=ib[1]+(ob[1]-ib[1])*t,y=Hi+(H-Hi)*t;
    const n=Math.floor(Math.hypot(bx-ax,bz-az)/0.45);for(let k=0;k<n;k++)seats.push([ax+(bx-ax)*k/n,y+0.15,az+(bz-az)*k/n]);}
  const crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(0.22,0.3,0.22),mats.crowd,seats.length);
  const M=new THREE.Matrix4();seats.forEach((s,i)=>{M.makeTranslation(s[0],s[1],s[2]);crowd.setMatrixAt(i,M);crowd.setColorAt(i,C('#888'));});
  crowd.userData.seats=seats;
  const lightBoxes=new THREE.Group();
  for(const [px,pz] of [[x0-0.5,z0-0.5],[x1+0.3,z0-0.5],[x0-0.5,z1+0.3],[x1+0.3,z1+0.3]]){const m=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.6,0.4),mats.lampHead);m.position.set(px+0.1,H+5.2,pz+0.1);lightBoxes.add(m);}
  // brilho dos refletores no gramado (um plano aditivo: bem mais leve que uma luz de verdade)
  const fg=new THREE.PlaneGeometry(ix1-ix0+4,iz1-iz0+4);fg.rotateX(-Math.PI/2);
  const fieldLight=new THREE.Mesh(fg,mats.fieldGlow);fieldLight.position.set((ix0+ix1)/2,0.05,(iz0+iz1)/2);fieldLight.renderOrder=2;
  return {mesh,crowd,lightBoxes,fieldLight,b};
}
