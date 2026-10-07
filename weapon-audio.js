// One consistent shot: softened attack, rounded top end and a long natural tail.
export const SHOT_FILES=['assets/audio/revolver-1.wav'];
export function createWeaponAudio(){
 const context=new AudioContext(),master=context.createGain();
 master.gain.value=.85;master.connect(context.destination);
 let buffers=[];const voices=new Set();
 const ready=Promise.all(SHOT_FILES.map(async file=>{
  const response=await fetch(new URL(file,import.meta.url));
  if(!response.ok)throw Error('Gunshot audio failed to load');
  return context.decodeAudioData(await response.arrayBuffer());
 })).then(decoded=>{buffers=decoded;});
 function route(source,position){
  if(voices.size>=24){const oldest=voices.values().next().value;oldest.stop();voices.delete(oldest);}
  let panner=null;
  if(position){panner=context.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=4;panner.maxDistance=90;panner.rolloffFactor=1.1;panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;source.connect(panner);panner.connect(master);}else source.connect(master);
  voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();panner?.disconnect();};
 }
 return {
  ready,
  listener(position,direction){const l=context.listener;if(l.positionX){l.positionX.value=position.x;l.positionY.value=position.y;l.positionZ.value=position.z;l.forwardX.value=direction.x;l.forwardY.value=direction.y;l.forwardZ.value=direction.z;l.upX.value=0;l.upY.value=1;l.upZ.value=0;}else{l.setPosition(position.x,position.y,position.z);l.setOrientation(direction.x,direction.y,direction.z,0,1,0);}},
  arrow(position){
   const buffer=context.createBuffer(1,context.sampleRate*.16,context.sampleRate),data=buffer.getChannelData(0);let smooth=0;
   for(let i=0;i<data.length;i++){smooth=smooth*.75+(Math.random()*2-1)*.25;data[i]=smooth*.3*Math.sin(Math.PI*i/data.length)*Math.exp(-i/data.length*4);}
   const source=context.createBufferSource();source.buffer=buffer;route(source,position);source.start();
  },
  resume:()=>context.resume(),
  pause(){for(const source of voices)source.stop();voices.clear();return context.suspend();},
  play(rate=1,position=null){
   if(!buffers.length)return;
   if(context.state==='suspended')context.resume().catch(()=>{});
   const source=context.createBufferSource();source.buffer=buffers[0];source.playbackRate.value=rate;
   route(source,position);source.start();
  }
 };
}
