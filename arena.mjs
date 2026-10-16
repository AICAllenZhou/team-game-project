// Built from the orange/gray layout in CsGoat's 1v1 - Remastered screenshots.
// Dimensions are world units: a player is 1.8 high and each damage cell is .15.
export const MAPS={practice:'Practice range',duel:'Rampyard · 1v1'};
export const DUEL_SCALE=1;
export const DUEL_CELL=.15;
export const DUEL_FLOOR=0;
export const DUEL_BOUNDS={x:15.6,z:10.8};
export const DUEL_SOLIDS=[
 {x:0,y:-.3,z:0,w:32.4,h:.6,d:22.8,color:0xb7b8b6},
 {x:-15.9,y:2.7,z:0,w:.6,h:5.4,d:22.8,color:0xcf7c31},{x:15.9,y:2.7,z:0,w:.6,h:5.4,d:22.8,color:0xcf7c31},
 {x:0,y:2.7,z:-11.1,w:31.2,h:5.4,d:.6,color:0xcf7c31},{x:0,y:2.7,z:11.1,w:31.2,h:5.4,d:.6,color:0xcf7c31}
];
export function arenaBlocks(){
 const blocks=[],cell=DUEL_CELL;
 const block=(x,y,z,w,h,d,color=0xe08a36,profile=null)=>{
  const b={x:x-w/2,y,z:z-d/2,nx:Math.round(w/cell),ny:Math.round(h/cell),nz:Math.round(d/cell),cell,color};
  if(profile)b.profile=profile;blocks.push(b);return b;
 };
 // Alternating cover lines leave two equal flank routes and shield both spawns.
 // The shallow clipped ends reproduce the reference's orange barrier silhouette.
 const barrier=(x,z,length,height)=>{
  const n=Math.round(length/cell),peak=Math.round(height/cell);
  block(x,0,z,.45,height,length,0xe08a36,{axis:'z',heights:Array.from({length:n},(_,i)=>peak-Math.max(0,2-Math.min(i,n-1-i)))});
 };
 for(const side of [-1,1]){
  barrier(side*10.5,0,5.4,2.25);
  for(const z of [-8.85,8.85])barrier(side*10.5,z,3.9,1.8);
  for(const z of [-5.4,5.4])barrier(side*7.5,z,3.3,1.8);
 }
 // A broad double ramp replaces the old courtyard and wagon. Small independent
 // chunks bound mesh rebuild cost; every filled ramp/lip cell remains breakable.
 for(let section=0;section<6;section++){
  const start=-5.4+section*1.8,x=start+.9,nx=12;
  const heights=Array.from({length:nx},(_,i)=>{const column=section*nx+i;return Math.min(16,Math.ceil(Math.min(column+.5,71.5-column)*4/7));});
  block(x,0,0,1.8,Math.max(...heights)*cell,6.6,0xa5a8a7,{axis:'x',heights});
  for(const z of [-3.525,3.525]){
   const lip=heights.map(h=>h+4);
   block(x,0,z,1.8,Math.max(...lip)*cell,.45,0xc3c5c3,{axis:'x',heights:lip});
  }
 }
 return blocks;
}
export function duelSpawn(index){return {x:index===0?-13.5:13.5,y:DUEL_FLOOR,z:0,yaw:index===0?-Math.PI/2:Math.PI/2,pitch:0,vy:0,vx:0,vz:0};}
