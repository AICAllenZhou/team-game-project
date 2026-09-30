import * as THREE from './vendor/three.module.js';

// Three cached transparent images, stamped onto the ground in three batched
// draws. The painted food stays readable after the bouncing pieces settle.
function texture(type){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const c=canvas.getContext('2d'),sauce=['#713221','#b53318','#b29132'][type],food=['#bc6836','#e76a36','#ffe06a'][type];
 let seed=731+type*51;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle=sauce;c.beginPath();
 for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,r=77+random()*24,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;if(i)c.lineTo(x,y);else c.moveTo(x,y);}c.closePath();c.fill();
 for(let i=0;i<23;i++){const a=random()*Math.PI*2,r=90+random()*30;c.beginPath();c.ellipse(128+Math.cos(a)*r,128+Math.sin(a)*r,2+random()*7,2+random()*5,a,0,7);c.fill();}
 c.fillStyle=['#984827','#df4b21','#cfb34c'][type];c.beginPath();c.ellipse(121,120,63,48,-.3,0,7);c.fill();
 for(let i=0;i<20;i++){
  const a=random()*Math.PI*2,r=Math.sqrt(random())*68,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r,rotation=random()*6;
  c.save();c.translate(x,y);c.rotate(rotation);c.fillStyle='#38201355';c.beginPath();c.ellipse(2,3,type===1?7:10,6,0,0,7);c.fill();
  c.fillStyle=food;c.beginPath();c.ellipse(0,0,type===1?6:9,type===2?7:5,0,0,7);c.fill();
  c.fillStyle=type===2?'#fff3ae':'#f7b375';c.beginPath();c.ellipse(-2,-2,4,1.4,-.2,0,7);c.fill();
  if(type===0){c.strokeStyle='#703b25';c.lineWidth=1.5;c.beginPath();c.moveTo(-2,-2);c.quadraticCurveTo(2,0,-2,2);c.stroke();}c.restore();
 }
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}

export function createFoodSplats(scene){
 const capacity=40,stamp=new THREE.Object3D(),groups=[0,1,2].map(type=>{
  const geometry=new THREE.PlaneGeometry(1,1),opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('splatOpacity',opacity);
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:texture(type)}},transparent:true,depthWrite:false,
   vertexShader:'attribute float splatOpacity; varying vec2 vUv; varying float vOpacity; void main(){vUv=uv;vOpacity=splatOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
   fragmentShader:'uniform sampler2D map; varying vec2 vUv; varying float vOpacity; void main(){gl_FragColor=texture2D(map,vUv);gl_FragColor.a*=vOpacity;if(gl_FragColor.a<0.01)discard;\n#include <colorspace_fragment>\n}'
  });
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='food-splats-'+type;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=1;scene.add(mesh);return {mesh,opacity,items:[]};
 });
 function add(type,x,z,size=.7){const group=groups[type];if(group.items.length>=capacity)group.items.shift();group.items.push({x,z,size,angle:Math.random()*Math.PI*2,life:7});}
 function update(dt){for(const {mesh,opacity,items} of groups){
  mesh.count=0;
  for(let i=items.length-1;i>=0;i--){const p=items[i];p.life-=dt;if(p.life<=0){items.splice(i,1);continue;}
   stamp.position.set(p.x,.014+mesh.count*.00003,p.z);stamp.rotation.set(-Math.PI/2,0,p.angle);stamp.scale.setScalar(p.size);stamp.updateMatrix();mesh.setMatrixAt(mesh.count,stamp.matrix);opacity.setX(mesh.count++,Math.min(1,p.life/1.5)*.92);
  }
  mesh.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;
 }}
 return {add,update};
}
