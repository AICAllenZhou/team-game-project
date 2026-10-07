// One consistent shot: softened attack, rounded top end and a long natural tail.
export const SHOT_FILES=['assets/audio/revolver-1.wav'];
export function bowSoundSamples(sampleRate,kind='release'){
 const duration=kind==='release'?.32:.24,data=new Float32Array(Math.ceil(sampleRate*duration));let noise=0,seed=73;
 for(let i=0;i<data.length;i++){
  const t=i/sampleRate,attack=1-Math.exp(-t/ .0025),tail=(1-t/duration)**2;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise=noise*.65+(seed/2147483648-1)*.35;
  const wave=kind==='release'
   ?Math.sin(t*2*Math.PI*145)*.26*Math.exp(-t*17)+Math.sin(t*2*Math.PI*291)*.1*Math.exp(-t*30)+noise*.4*Math.exp(-t*26)
   :Math.sin(t*2*Math.PI*(kind==='metal'?370:170))*.45*Math.exp(-t*35)+noise*.7*Math.exp(-t*60)+(kind==='metal'?Math.sin(t*2*Math.PI*940)*.14*Math.exp(-t*22):0);
  data[i]=wave*attack*tail;
 }
 return data;
}
export function createWeaponAudio(){
 const context=new AudioContext(),master=context.createGain();
 master.gain.value=.85;master.connect(context.destination);
 let buffers=[];const voices=new Set(),bowBuffers=new Map();
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
 function playBow(kind,position,rate=1){
  if(!bowBuffers.has(kind)){const data=bowSoundSamples(context.sampleRate,kind),buffer=context.createBuffer(1,data.length,context.sampleRate);buffer.getChannelData(0).set(data);bowBuffers.set(kind,buffer);}
  const source=context.createBufferSource();source.buffer=bowBuffers.get(kind);source.playbackRate.value=rate;route(source,position);source.start();
 }
 return {
  ready,
  listener(position,direction){const l=context.listener;if(l.positionX){l.positionX.value=position.x;l.positionY.value=position.y;l.positionZ.value=position.z;l.forwardX.value=direction.x;l.forwardY.value=direction.y;l.forwardZ.value=direction.z;l.upX.value=0;l.upY.value=1;l.upZ.value=0;}else{l.setPosition(position.x,position.y,position.z);l.setOrientation(direction.x,direction.y,direction.z,0,1,0);}},
  arrow(position=null,charge=0){playBow('release',position,.94+Math.max(0,Math.min(1,charge))*.12);},
  arrowImpact(position,metal=false){playBow(metal?'metal':'wood',position);},
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
