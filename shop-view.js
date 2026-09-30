import * as THREE from './vendor/three.module.js';
import {SHOP} from './shop.mjs';
import {batchMeshes} from './render-batches.js';

export function woodCanvas(){
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const c=canvas.getContext('2d');
 c.fillStyle='#69513b';c.fillRect(0,0,768,192);
 for(let i=0;i<190;i++){const y=i*1.03;c.strokeStyle=i%4===0?'#a8896340':'#21160c40';c.lineWidth=i%7===0?2:1;c.beginPath();
  for(let x=0;x<=768;x+=8){const v=y+Math.sin(x*.013+i*.8)*2+Math.sin(x*.04+i)*.7;if(!x)c.moveTo(x,v);else c.lineTo(x,v);}c.stroke();
 }
 for(const [x,y] of [[176,62],[593,142]])for(let i=1;i<9;i++){c.strokeStyle='#24150d38';c.beginPath();c.ellipse(x,y,i*8,i*1.7,.07,0,Math.PI*2);c.stroke();}
 for(let i=0;i<17;i++){const x=(i*137)%768,y=(i*41)%192;c.fillStyle='#d0b58b18';c.fillRect(x,y,35+i%5*13,1);}
 return canvas;
}
export function createShopView(scene){
 const root=new THREE.Group();root.name='GUNZ shack';root.position.set(SHOP.x,0,SHOP.z);scene.add(root);
 const texture=new THREE.CanvasTexture(woodCanvas());texture.colorSpace=THREE.SRGBColorSpace;
 const woods=[0xc4baa3,0x91816b,0xb6a489,0x8b8a76].map(color=>new THREE.MeshStandardMaterial({map:texture,color,roughness:1}));
 const iron=new THREE.MeshStandardMaterial({color:0x343632,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x44372b,roughness:1});
 function box(w,h,d,x,y,z,material=woods[0],rz=0,ry=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.rotation.set(0,ry,rz);m.castShadow=m.receiveShadow=true;root.add(m);return m;}
 // Uneven weathered boards, exposed corner posts, and a wide open doorway.
 for(let row=0;row<9;row++){
  const y=.18+row*.35,jitter=Math.sin(row*8.1)*.016;
  box(5.95,.32,.13,0,y,-3,woods[row%4],jitter);
  for(const side of [-1,1]){
   box(6,.32,.13,side*3,y,0,woods[(row+1)%4],jitter,Math.PI/2);
   box(1.35,.32,.13,side*2.3,y,3,woods[(row+2)%4],-jitter);
  }
 }
 for(const x of [-2.94,2.94])for(const z of [-2.94,2.94])box(.2,3.35,.22,x,1.66,z,dark);
 for(const x of [-1.58,1.58])box(.2,3.3,.22,x,1.65,3.04,woods[1]);
 box(3.35,.2,.24,0,2.98,3.04,woods[1]);
 // Low counter leaves the penguin's eyes, flippers and orange bill visible.
 for(let i=0;i<6;i++)box(.88,.83,.14,-2.25+i*.9,.48,-.12,woods[i%4],Math.sin(i)*.008);
 box(5.65,.14,.85,0,1.04,-.5,woods[0]);box(5.5,.1,.1,0,.11,-.1,woods[1]);
 box(.16,1,.14,-2.65,.5,-.45,dark);box(.16,1,.14,2.65,.5,-.45,dark);
 // Sagging pitched roof with a few uneven planks and rusty metal patches.
 for(const side of [-1,1])for(let i=0;i<12;i++){
  const x=side*1.58,z=-3.15+i*.58;box(3.4,.13,.55,x,3.5,z,woods[(i+1)%4],-side*.22);
 }
 box(.23,.18,6.9,0,3.87,0,dark);box(1.3,.035,1.15,1.8,3.57,.9,iron,-.22);
 // Broken brace and a couple of discarded boards beside the entrance.
 box(1.55,.15,.17,-2.22,2.55,3.11,woods[1],-.4);
 box(.22,2.1,.12,3.22,1.03,1.7,woods[1],-.2);box(.26,1.65,.12,3.48,.82,1.8,woods[2],-.28);
 const signCanvas=woodCanvas(),ctx=signCanvas.getContext('2d');ctx.fillStyle='#f0d8a2';ctx.textAlign='center';ctx.font='bold 136px Georgia';ctx.fillText('GUNZ',384,143);
 for(let i=0;i<50;i++){ctx.fillStyle='#62452b55';ctx.fillRect((i*103)%768,(i*29)%192,14,2);}
 const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
 box(3.4,.88,.17,0,3.1,3.27,woods[1],-.025);
 const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.3,.8),new THREE.MeshStandardMaterial({map:signTexture,roughness:1}));sign.position.set(0,3.1,3.365);sign.rotation.z=-.025;root.add(sign);
 for(const x of [-1.48,1.48]){box(.045,.045,.03,x,3.36,3.39,iron);box(.045,.045,.03,x,2.86,3.39,iron);}
 // Rear shelf and plain ammunition boxes keep the shack readable at a glance.
 box(4.8,.1,.45,0,1.42,-2.8,woods[1]);
 for(let i=0;i<6;i++){box(.48,.28,.34,-2+i*.73,1.6,-2.8,new THREE.MeshStandardMaterial({color:i%2?0x725638:0xa18552,roughness:1}));}
 const keeper=new THREE.Group();keeper.name='blue penguin shopkeeper';keeper.position.set(0,.08,SHOP.keeperZ-SHOP.z);root.add(keeper);
 const blue=new THREE.MeshStandardMaterial({color:0x303dad,roughness:.55,flatShading:true}),white=new THREE.MeshStandardMaterial({color:0xcbd7d0,roughness:.65}),orange=new THREE.MeshStandardMaterial({color:0xd6792b,roughness:.6,flatShading:true}),black=new THREE.MeshStandardMaterial({color:0x141712,roughness:.35});
 function oval(parent,m,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;parent.add(mesh);return mesh;}
 oval(keeper,blue,0,1.03,0,.69,.97,.52);oval(keeper,white,0,.82,.44,.5,.62,.12);
 for(const side of [-1,1]){
  oval(keeper,orange,side*.39,.15,.24,.38,.15,.46);
  const flipper=oval(keeper,blue,side*.66,.72,.015,.21,.53,.24);flipper.rotation.z=side*.17;
  const eye=oval(keeper,white,side*.29,1.49,.43,.27,.235,.105);eye.rotation.z=-side*.18;
  oval(keeper,black,side*.27,1.44,.529,.093,.119,.052);
  const brow=new THREE.Mesh(new THREE.BoxGeometry(.48,.11,.115),blue);brow.position.set(side*.29,1.67,.48);brow.rotation.z=side*.19;keeper.add(brow);
 }
 oval(keeper,orange,0,1.22,.55,.39,.18,.31);oval(keeper,orange,0,1.12,.55,.34,.075,.26);
 batchMeshes(keeper);batchMeshes(root);root.updateWorldMatrix(true,true);return root;
}
