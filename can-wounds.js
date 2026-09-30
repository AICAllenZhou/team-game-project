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

// One continuous sheet joins every torn point to a creased shoulder and an
// outer edge seated on the can. Exit petals bend outward; entry petals fold in.
export function woundRim(radius,curved=true,exit=false){
 const segments=20,vertices=[],colors=[],indices=[],fold=Math.min(.065,radius*(exit?.48:.22));
 for(let row=0;row<3;row++)for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2,noise=Math.sin(i*7.13),tooth=i%2===0;
  const r=radius*(row===0?(tooth?.73+.045*noise:1.035+.035*noise):row===1?1.09+.025*noise:(tooth?1.17:1.34)+.055*noise);
  const x=Math.cos(a)*r,y=Math.sin(a)*r,curve=curved?-.42+Math.sqrt(Math.max(.001,.42*.42-x*x)):0;
  const bend=row===2?.001:row===1?fold*.18:fold*(tooth?1:.2)*(exit?1:-1);
  vertices.push(x,y,curve+bend);
  const shade=row===0?.78:row===1?1:.91;colors.push(shade,shade,shade);
 }
 for(let row=0;row<2;row++)for(let i=0;i<segments;i++){
  const a=row*segments+i,b=row*segments+(i+1)%segments,c=a+segments,d=b+segments;
  indices.push(a,c,b,b,c,d);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
