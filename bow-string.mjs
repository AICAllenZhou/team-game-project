// Small position-based rope with fixed limb tips and an optional drawn nock.
export function createBowString(){
 const count=17,position=new Float64Array(count*3),previous=new Float64Array(count*3);
 for(let i=0;i<count;i++){position[i*3+1]=-.63+1.26*i/(count-1);position[i*3+2]=.12;}
 previous.set(position);return {count,position,previous,rest:1.272/(count-1)};
}
export function releaseBowString(s){
 for(let i=1;i<s.count-1;i++){const weight=Math.sin(Math.PI*i/(s.count-1));s.previous[i*3+2]+=.035*weight;s.previous[i*3]-=.004*weight;}
}
export function stepBowString(s,dt,charge=0,pinNock=true){
 const n=s.count,mid=(n-1)/2,c=Math.max(0,Math.min(1,charge)),tipY=.63-.1*c,draw=.12+.35*c;
 const steps=Math.max(1,Math.ceil(Math.min(.05,Math.max(0,dt))*120)),h=Math.min(.05,Math.max(0,dt))/steps;
 const pinned=i=>i===0||i===n-1||pinNock&&i===mid;
 function anchors(){for(const [i,y,z] of [[0,-tipY,.12],[n-1,tipY,.12],...(pinNock?[[mid,0,draw]]:[])]){const k=i*3;s.position[k]=0;s.position[k+1]=y;s.position[k+2]=z;s.previous[k]=0;s.previous[k+1]=y;s.previous[k+2]=z;}}
 for(let sub=0;sub<steps;sub++){
  const damping=Math.exp(-10*h);
  for(let i=1;i<n-1;i++)if(!pinned(i))for(let axis=0;axis<3;axis++){const k=i*3+axis,p=s.position[k];s.position[k]+=(p-s.previous[k])*damping+(axis===1?-.35*h*h:0);s.previous[k]=p;}
  anchors();
  for(let iteration=0;iteration<10;iteration++){
   for(let i=0;i<n-1;i++){
    const a=i*3,b=a+3,dx=s.position[b]-s.position[a],dy=s.position[b+1]-s.position[a+1],dz=s.position[b+2]-s.position[a+2],length=Math.hypot(dx,dy,dz)||1;
    const wa=pinned(i)?0:1,wb=pinned(i+1)?0:1,total=wa+wb;if(!total)continue;
    const amount=(length-s.rest)/length/total;
    for(const [axis,d] of [[0,dx],[1,dy],[2,dz]]){s.position[a+axis]+=d*amount*wa;s.position[b+axis]-=d*amount*wb;}
   }anchors();
  }
 }
 return s.position;
}
