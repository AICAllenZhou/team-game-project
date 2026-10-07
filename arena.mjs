// Compact mirrored lanes and central courtyard, based on the supplied overhead reference.
export const MAPS={practice:'Practice range',duel:'Dustyard · 1v1'};
export const DUEL_BOUNDS={x:18,z:10};
export const DUEL_SOLIDS=[{x:0,y:-4.25,z:0,w:37,h:.5,d:21},
 {x:-18.5,y:2,z:0,w:1,h:12,d:21},{x:18.5,y:2,z:0,w:1,h:12,d:21},
 {x:0,y:2,z:-10.5,w:37,h:12,d:1},{x:0,y:2,z:10.5,w:37,h:12,d:1}];
export function arenaBlocks(){
 const blocks=[],cell=.35;
 const block=(x,y,z,w,h,d,color=0xb09b79)=>blocks.push({x,y,z,nx:Math.round(w/cell),ny:Math.max(1,Math.round(h/cell)),nz:Math.round(d/cell),cell,color});
 // The ground, raised end courts, stairs, parapets and crates are all voxels.
 block(-18,-.35,-10,36,.35,20,0xa78d68);
 for(const side of [-1,1]){
  const left=side<0;
  block(left?-17:-(-9),0,-8.05,8.05,.7,16.1,0x909185);
  for(let step=0;step<2;step++)block(left?-8.95+step*.7:7.55+step*.7,0,-1.4,.7,left?.7-step*.35:.35+step*.35,2.8,0xb1ad99);
  for(const z of [-6.3,4.55]){
   block(left?-10.5:9.1,.7,z,1.4,1.4,1.75,0xd0c5a6);
   block(left?-8.75:8.05,0,z,.7,2.1,1.75,0x82694f);
  }
  for(const z of [-8.4,7])block(left?-15.4:13.65,.7,z,1.75,1.05,1.4,0xbeb59d);
 }
 for(const z of [-4.2,3.85])block(-7,0,z,14,1.75,.35,0xc4ab7c);
 for(const side of [-1,1]){
  const z=side<0?-5.95:4.2;
  block(-1.4,0,z,2.8,1.05,1.4,0xc8bfa6);
  block(-.7,1.05,z,1.4,.7,1.05,0xb9af91);
 }
 block(-2.1,0,1.4,1.05,1.05,1.05,0xc6b794);
 block(1.75,0,-2.8,1.05,1.05,1.05,0xc6b794);
 // A stepped block-built wagon gives the centre its diagonal silhouette.
 for(let i=0;i<5;i++)block(-1.4+i*.35,.0,-.7+i*.35,.7,i===0||i===4?.7:1.05,.7,0x699086);
 return blocks;
}
export function duelSpawn(index){return {x:index===0?-15.5:15.5,y:.7,z:0,yaw:index===0?-Math.PI/2:Math.PI/2,pitch:0,vy:0,vx:0,vz:0};}
