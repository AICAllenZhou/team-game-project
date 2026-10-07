import {arenaBlocks} from './arena.mjs';
export const CELL=.14;
export const WALLS=[{x:15,y:0,z:-6,nx:4,ny:22,nz:30,color:0xa9764d},{x:20,y:0,z:2,nx:4,ny:18,nz:26,color:0xb0a38c},{x:15,y:0,z:10,nx:3,ny:20,nz:24,color:0x91634a}];
export function createVoxelWalls(mapId='practice'){
 let walls=[],revision=0;
 function setMap(id){mapId=id;walls=(id==='duel'?arenaBlocks():WALLS).map(w=>({...w,cell:w.cell||CELL,version:++revision,cells:new Uint8Array(w.nx*w.ny*w.nz).fill(1)}));}
 setMap(mapId);revision=0;for(const w of walls)w.version=0;
 const index=(w,x,y,z)=>(y*w.nz+z)*w.nx+x;
 function trace(o,d,max=70){
  let best=null;
  walls.forEach((w,wall)=>{
   let near=0,far=max,normal={x:-d.x,y:-d.y,z:-d.z};
   for(const axis of ['x','y','z']){const lo=w[axis],hi=lo+w['n'+axis]*w.cell,v=d[axis];if(Math.abs(v)<1e-10){if(o[axis]<lo||o[axis]>=hi)return;continue;}const a=(lo-o[axis])/v,b=(hi-o[axis])/v,t=Math.min(a,b);if(t>near){near=t;normal={x:0,y:0,z:0};normal[axis]=v>0?-1:1;}far=Math.min(far,Math.max(a,b));if(near>far)return;}
   let t=near;const c={};for(const a of ['x','y','z'])c[a]=Math.min(w['n'+a]-1,Math.max(0,Math.floor((o[a]+d[a]*(t+1e-7)-w[a])/w.cell)));
   for(let step=0;step<w.nx+w.ny+w.nz+3&&t<=far;step++){
    if(w.cells[index(w,c.x,c.y,c.z)]){max=t;best={distance:t,normal,wallId:wall,cell:[c.x,c.y,c.z]};return;}
    let next=Infinity,axis=null;for(const a of ['x','y','z']){if(Math.abs(d[a])<1e-10)continue;const edge=w[a]+(c[a]+(d[a]>0?1:0))*w.cell,nt=(edge-o[a])/d[a];if(nt<next){next=nt;axis=a;}}
    if(!axis)return;t=next;c[axis]+=d[axis]>0?1:-1;if(c[axis]<0||c[axis]>=w['n'+axis])return;normal={x:0,y:0,z:0};normal[axis]=d[axis]>0?-1:1;
   }
  });return best;
 }
 function damage(hit,radius=1,direction=null){
  if(hit.wallId==null||!hit.cell)return [];const w=walls[hit.wallId],[cx,cy,cz]=hit.cell,removed=[];
  // A small spherical chip, not a full-depth deletion: repeated hits tunnel through.
  for(let y=cy-radius;y<=cy+radius;y++)for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
   if(x<0||x>=w.nx||y<0||y>=w.ny||z<0||z>=w.nz||(x-cx)**2+(y-cy)**2+(z-cz)**2>radius*radius)continue;
   // Side chipping cannot silently spend extra forward penetration.
   if(direction&&Math.abs((x-cx)*direction.x+(y-cy)*direction.y+(z-cz)*direction.z)>.55)continue;
   const i=index(w,x,y,z);if(w.cells[i]){w.cells[i]=0;removed.push(i);}
  }if(removed.length){revision++;w.version++;}return removed;
 }
 function apply(wall,removed){const w=walls[wall];if(!w)return;let changed=false;for(const i of removed)if(i>=0&&i<w.cells.length&&w.cells[i]){w.cells[i]=0;changed=true;}if(changed){revision++;w.version++;}}
 function snapshot(){return walls.map(w=>Array.from(w.cells.keys()).filter(i=>!w.cells[i]));}
 function collide(p,old){
  if(mapId==='duel'){
   let support=-4;
   for(const w of walls){
    const x=Math.floor((p.x-w.x)/w.cell),z=Math.floor((p.z-w.z)/w.cell);
    if(x<0||x>=w.nx||z<0||z>=w.nz)continue;
    for(let y=w.ny-1;y>=0;y--){const top=w.y+(y+1)*w.cell;if(top>(old.y??p.y)+.38)continue;if(w.cells[index(w,x,y,z)]){support=Math.max(support,top);break;}}
   }
   p.grounded=p.y<=support+.03&&p.vy<=0;
   if(p.grounded){p.y=support;p.vy=0;}
  }
  for(const w of walls){const lo={},hi={};for(const a of ['x','y','z']){lo[a]=Math.max(0,Math.floor((p[a]-(a==='y'?-.015:.28)-w[a])/w.cell));hi[a]=Math.min(w['n'+a]-1,Math.floor((p[a]+(a==='y'?1.65:.28)-w[a])/w.cell));}
   for(let y=lo.y;y<=hi.y;y++)for(let z=lo.z;z<=hi.z;z++)for(let x=lo.x;x<=hi.x;x++)if(w.cells[index(w,x,y,z)]){p.x=old.x;p.z=old.z;p.vx=p.vz=0;return;}
  }
 }
 function floorAt(x,z,ceiling=10){
  let top=mapId==='duel'?-4:0;
  for(const w of walls){const cx=Math.floor((x-w.x)/w.cell),cz=Math.floor((z-w.z)/w.cell);if(cx<0||cx>=w.nx||cz<0||cz>=w.nz)continue;
   for(let y=w.ny-1;y>=0;y--){const surface=w.y+(y+1)*w.cell;if(surface<=ceiling&&w.cells[index(w,cx,y,cz)]){top=Math.max(top,surface);break;}}
  }return top;
 }
 function reset(){for(const w of walls){w.cells.fill(1);w.version++;}revision++;}
 return {get walls(){return walls;},get mapId(){return mapId;},setMap,trace,damage,apply,snapshot,collide,reset,floorAt,get revision(){return revision;}};
}
