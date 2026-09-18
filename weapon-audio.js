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
 return {
  ready,
  resume:()=>context.resume(),
  pause(){for(const source of voices)source.stop();voices.clear();return context.suspend();},
  play(rate=1){
   if(!buffers.length)return;
   if(context.state==='suspended')context.resume().catch(()=>{});
   const source=context.createBufferSource();source.buffer=buffers[0];source.playbackRate.value=rate;
   source.connect(master);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();};source.start();
  }
 };
}
