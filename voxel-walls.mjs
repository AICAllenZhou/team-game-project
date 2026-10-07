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
 // A rounded footprint avoids catching on voxel corners. Visit only nearby
 // columns, sharing the same controller between prediction and the room host.
 const radius=.28,height=1.8,stepHeight=.38,skin=.001;
 function columns(x,z,visit){
  for(const w of walls){
   const lx=Math.max(0,Math.floor((x-radius-w.x)/w.cell)),hx=Math.min(w.nx-1,Math.floor((x+radius-w.x)/w.cell));
   const lz=Math.max(0,Math.floor((z-radius-w.z)/w.cell)),hz=Math.min(w.nz-1,Math.floor((z+radius-w.z)/w.cell));
   for(let cz=lz;cz<=hz;cz++)for(let cx=lx;cx<=hx;cx++){
    const dx=Math.max(w.x+cx*w.cell-x,0,x-w.x-(cx+1)*w.cell),dz=Math.max(w.z+cz*w.cell-z,0,z-w.z-(cz+1)*w.cell);
    if(dx*dx+dz*dz<(radius-skin)**2)visit(w,cx,cz);
   }
  }
 }
 function blockingTop(x,y,z){
  let top=-Infinity;
  columns(x,z,(w,cx,cz)=>{
   const lo=Math.max(0,Math.floor((y+skin-w.y)/w.cell)),hi=Math.min(w.ny-1,Math.floor((y+height-skin-w.y)/w.cell));
   for(let cy=lo;cy<=hi;cy++)if(w.cells[index(w,cx,cy,cz)])top=Math.max(top,w.y+(cy+1)*w.cell);
  });return top;
 }
 function supportAt(x,z,ceiling){
  let top=mapId==='duel'?-4:0;
  columns(x,z,(w,cx,cz)=>{
   for(let cy=Math.min(w.ny-1,Math.floor((ceiling+skin-w.y)/w.cell)-1);cy>=0;cy--){
    if(w.cells[index(w,cx,cy,cz)]){top=Math.max(top,w.y+(cy+1)*w.cell);break;}
   }
  });return top;
 }
 function collide(p,old){
  const oldY=old.y??p.y,desiredY=p.y,baseSupport=supportAt(old.x,old.z,oldY+skin);
  const canStep=(p.vy||0)<=0&&oldY<=baseSupport+.04;
  const ceiling=oldY+(canStep?stepHeight:0);
  let x=old.x,z=old.z,feet=Math.max(oldY,desiredY),stepped=false;
  function attempt(nx,nz){
   const top=blockingTop(nx,feet,nz);
   if(top===-Infinity){x=nx;z=nz;return true;}
   if(canStep&&top<=ceiling+skin&&blockingTop(nx,top,nz)===-Infinity){x=nx;z=nz;feet=top;stepped=true;return true;}
   return false;
  }
  const dx=p.x-old.x,dz=p.z-old.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  // Substeps prevent thin-wall tunnelling. Resolve axes independently so a
  // blocked forward component does not cancel movement along the wall.
  for(let i=0;i<steps;i++){
   const sx=dx/steps,sz=dz/steps;
   if(attempt(x+sx,z+sz))continue;
   for(const [axis,delta] of [['x',sx],['z',sz]]){
    if(!delta)continue;
    if(attempt(x+(axis==='x'?delta:0),z+(axis==='z'?delta:0)))continue;
    const startX=x,startZ=z;let low=0,high=1;
    for(let j=0;j<9;j++){const t=(low+high)/2,nx=startX+(axis==='x'?delta*t:0),nz=startZ+(axis==='z'?delta*t:0);if(blockingTop(nx,feet,nz)===-Infinity)low=t;else high=t;}
    x=startX+(axis==='x'?delta*low:0);z=startZ+(axis==='z'?delta*low:0);p[axis==='x'?'vx':'vz']=0;
   }
  }
  p.x=x;p.z=z;p.y=stepped?Math.max(desiredY,feet):desiredY;
  // Catch upward motion under overhangs, then land on any supporting part of
  // the footprint. A tiny hole in a floor cannot swallow the player's centre.
  if(p.y>oldY&&!stepped){
   let roof=Infinity;
   columns(x,z,(w,cx,cz)=>{
    const lo=Math.max(0,Math.ceil((oldY+height-skin-w.y)/w.cell)),hi=Math.min(w.ny-1,Math.floor((p.y+height-skin-w.y)/w.cell));
    for(let cy=lo;cy<=hi;cy++)if(w.cells[index(w,cx,cy,cz)]){roof=Math.min(roof,w.y+cy*w.cell);break;}
   });
   if(p.y+height>roof){p.y=roof-height;p.vy=0;}
  }
  const support=supportAt(x,z,Math.max(oldY,stepped?feet:oldY)+skin);
  p.grounded=p.y<=support+.03&&(p.vy||0)<=0;
  if(p.grounded){p.y=support;p.vy=0;}
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
