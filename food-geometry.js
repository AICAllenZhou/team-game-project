import * as THREE from './vendor/three.module.js';

export function createFoodGeometry(type){
 const geometry=new THREE.SphereGeometry(1,20,14),p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(type===0){
   // Bent kidney bean: plump ends, a pinched inside curve and a shallow seam.
   const pinch=1-.2*Math.exp(-x*x*10);y=y*.65*pinch+.48*(1-x*x);z*=.58*pinch;x*=1.35;
  }else if(type===2){
   // Corn kernel: rounded crown and narrower flattened attachment end.
   const taper=.72+.28*(y+1)/2;x*=taper*.8;z*=taper*.5;y=Math.max(-.75,y);
  }else if(type===1){x*=1.15;y*=.5;z*=.8;}
  else{y*=.12;}
  p.setXYZ(i,x,y,z);
 }
 geometry.computeVertexNormals();return geometry;
}
