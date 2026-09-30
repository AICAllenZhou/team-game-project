import * as THREE from './vendor/three.module.js';

// Subdivide only triangles touching a wound. Small holes stay open without
// turning the whole can into an expensive, uniformly dense mesh.
export function cutCanSurface(base,holes){
 const attributes=['position','normal','uv','color'].filter(name=>base.getAttribute(name)),output=Object.fromEntries(attributes.map(name=>[name,[]]));
 const vertex=i=>Object.fromEntries(attributes.map(name=>{const a=base.getAttribute(name);return [name,Array.from({length:a.itemSize},(_,j)=>a.array[i*a.itemSize+j])];}));
 const midpoint=(a,b)=>Object.fromEntries(attributes.map(name=>[name,a[name].map((v,j)=>(v+b[name][j])/2)]));
 const distance=(v,h)=>v.position.reduce((sum,n,i)=>sum+(n-h.cutPoint.getComponent(i))**2,0);
 function triangle(a,b,c,depth=0){
  const center={position:a.position.map((v,i)=>(v+b.position[i]+c.position[i])/3)},edge=Math.max(...[a,b,c].map((v,i)=>Math.sqrt(v.position.reduce((sum,n,j)=>sum+(n-[b,c,a][i].position[j])**2,0))));
  let boundary=false;
  for(const hole of holes){
   const r=hole.radius,da=distance(a,hole),db=distance(b,hole),dc=distance(c,hole);
   if(da<r*r&&db<r*r&&dc<r*r)return;
   if(distance(center,hole)<(r+edge)**2){if(depth>=4){if(distance(center,hole)<r*r)return;}else boundary=true;}
  }
  if(boundary){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);return;}
  for(const v of [a,b,c])for(const name of attributes)output[name].push(...v[name]);
 }
 for(let i=0;i<base.attributes.position.count;i+=3)triangle(vertex(i),vertex(i+1),vertex(i+2));
 const geometry=new THREE.BufferGeometry();for(const name of attributes)geometry.setAttribute(name,new THREE.Float32BufferAttribute(output[name],base.getAttribute(name).itemSize));return geometry;
}

export function woundRim(radius,curved=true){
 const vertices=[],segments=28,width=Math.min(.013,Math.max(.003,radius*.16));
 const point=(i,outer)=>{const a=i/segments*Math.PI*2,r=radius*(1+.025*Math.sin(a*5)+.015*Math.cos(a*9))+(outer?width:0),x=Math.cos(a)*r,y=Math.sin(a)*r;
  return [x,y,(curved?-.42+Math.sqrt(Math.max(.01,.42*.42-x*x)):0)+(outer?.001:-.007)+Math.sin(a*3)*.0015];};
 for(let i=0;i<segments;i++){const a=point(i,false),b=point(i+1,false),c=point(i,true),d=point(i+1,true);vertices.push(...a,...b,...c,...c,...b,...d);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
