// Mirrored end courts, protected spawns and a central courtyard from the reference.
export const MAPS={practice:'Practice range',duel:'Dustyard · 1v1'};
export const DUEL_BOUNDS={x:16.8,z:8.4};
export const DUEL_SOLIDS=[{x:0,y:-4.25,z:0,w:34.6,h:.5,d:17.8},
 {x:-17.3,y:2,z:0,w:1,h:12,d:17.8},{x:17.3,y:2,z:0,w:1,h:12,d:17.8},
 {x:0,y:2,z:-8.9,w:34.6,h:12,d:1},{x:0,y:2,z:8.9,w:34.6,h:12,d:1}];
export function arenaBlocks(){
 const blocks=[],cell=.3;
 // Centre-based, cell-aligned boxes make both halves exact reflections.
 const block=(x,y,z,w,h,d,color=0xb09b79)=>blocks.push({x:x-w/2,y,z:z-d/2,nx:Math.round(w/cell),ny:Math.round(h/cell),nz:Math.round(d/cell),cell,color});
 block(0,-.3,0,33.6,.3,16.8,0xa78d68);
 for(const side of [-1,1]){
  // Chamfered end courts, with a broad two-step entrance into the courtyard.
  block(side*12.6,0,0,7.2,.6,10.8,0x909185);
  for(const z of [-6,6])block(side*12.6,0,z,6,.6,1.2,0x909185);
  for(const z of [-7.2,7.2])block(side*12.6,0,z,4.8,.6,1.2,0x909185);
  block(side*8.7,0,0,.6,.6,3.6,0xb1ad99);
  block(side*8.1,0,0,.6,.3,3.6,0xb1ad99);
  // Full-height spawn cover: neither player sees the other before moving out.
  // Its height is close to the 1.8-unit can, rather than a miniature crate.
  block(side*12.3,.6,0,2.1,2.1,2.1,0xa58b65);
  for(const z of [-3.9,3.9]){
   block(side*10.2,.6,z,1.8,1.8,1.8,0xd0c5a6);
   block(side*8.85,0,z,.3,2.4,1.8,0x82694f);
  }
  for(const z of [-6.3,6.3])block(side*13.8,.6,z,1.8,1.8,1.8,0xbeb59d);
 }
 for(const z of [-3.6,3.6])block(0,0,z,15.6,1.8,.3,0xc4ab7c);
 for(const z of [-4.65,4.65]){
  block(0,0,z,2.4,1.2,1.5,0xc8bfa6);
  block(0,1.2,z,1.2,.6,1.2,0xb9af91);
 }
 for(const side of [-1,1])block(side*2.1,0,-side*1.5,1.2,1.2,1.2,0xc6b794);
 // Small diagonal wagon; opposite corners offer equivalent cover.
 for(let i=-2;i<=2;i++)block(i*.3,0,i*.3,.6,Math.abs(i)===2?.6:.9,.6,0x699086);
 return blocks;
}
export function duelSpawn(index){return {x:index===0?-15.3:15.3,y:.6,z:0,yaw:index===0?-Math.PI/2:Math.PI/2,pitch:0,vy:0,vx:0,vz:0};}
