// Recorded black-powder shots, trimmed and cleaned offline. No synthesized
// noise, oscillator sweeps, pitch shifting or repeated delay/echo effects.
export const SHOT_FILES=[1,2,3].map(i=>`assets/audio/revolver-${i}.wav`);
export function createWeaponAudio(){
 const context=new AudioContext(),compressor=context.createDynamicsCompressor(),master=context.createGain();
 compressor.threshold.value=-8;compressor.knee.value=8;compressor.ratio.value=3;
 compressor.attack.value=.003;compressor.release.value=.1;master.gain.value=.95;
 compressor.connect(master).connect(context.destination);
 let buffers=[],previous=-1;
 const ready=Promise.all(SHOT_FILES.map(async file=>{
  const response=await fetch(new URL(file,import.meta.url));
  if(!response.ok)throw Error('Gunshot audio failed to load');
  return context.decodeAudioData(await response.arrayBuffer());
 })).then(decoded=>{buffers=decoded;});
 return {
  ready,
  resume:()=>context.resume(),
  play(){
   if(!buffers.length)return;
   if(context.state==='suspended')context.resume().catch(()=>{});
   const index=(previous+1+Math.floor(Math.random()*(buffers.length-1)))%buffers.length;previous=index;
   const source=context.createBufferSource();source.buffer=buffers[index];
   source.connect(compressor);source.onended=()=>source.disconnect();source.start();
  }
 };
}
