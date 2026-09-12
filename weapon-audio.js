// Pre-rendered layers keep rapid firing from allocating or synthesizing audio
// on the render thread. The diffuse tail has no delayed copies of the shot.
export function makeShotSamples(sampleRate,seed=7){
 const count=Math.ceil(sampleRate*.95),left=new Float32Array(count),right=new Float32Array(count);
 let low=0,body=0,tailL=0,tailR=0,phase=0,peak=0;
 const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
 const blend=hz=>1-Math.exp(-2*Math.PI*hz/sampleRate);
 const lowMix=blend(700),bodyMix=blend(2400),tailMix=blend(1100);
 for(let i=0;i<count;i++){
  const t=i/sampleRate,n=noise();low+=(n-low)*lowMix;body+=(n-body)*bodyMix;
  tailL+=(noise()-tailL)*tailMix;tailR+=(noise()-tailR)*tailMix;
  // Fast pressure crack, midrange blast and a short falling low-frequency punch.
  const crack=(n-low)*1.25*Math.exp(-t/0.012);
  const blast=body*1.9*Math.exp(-t/0.065);
  phase+=2*Math.PI*(52+82*Math.exp(-t/0.023))/sampleRate;
  const punch=Math.sin(phase)*.62*(1-Math.exp(-t/0.001))*Math.exp(-t/0.07);
  const mechanical=Math.sin(2*Math.PI*2600*t)*.1*Math.exp(-t/0.006);
  const dry=(crack+blast+punch+mechanical)*Math.min(1,t/.0003);
  // Many scattered reflections perceived as one airy outdoor decay, not echoes.
  const tail=.32*(1-Math.exp(-t/.018))*Math.exp(-t/.23);
  const fade=Math.min(1,(.95-t)/.035);
  left[i]=Math.tanh(dry+tailL*tail)*fade;
  right[i]=Math.tanh(dry+tailR*tail)*fade;
  peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 }
 const gain=.9/Math.max(peak,.001);
 for(let i=0;i<count;i++){left[i]*=gain;right[i]*=gain;}
 return [left,right];
}

export function createWeaponAudio(){
 const context=new AudioContext(),compressor=context.createDynamicsCompressor(),master=context.createGain();
 compressor.threshold.value=-9;compressor.knee.value=10;compressor.ratio.value=5;
 compressor.attack.value=.002;compressor.release.value=.12;master.gain.value=.9;
 compressor.connect(master).connect(context.destination);
 const buffers=[7,193,421,997].map(seed=>{
  const channels=makeShotSamples(context.sampleRate,seed),buffer=context.createBuffer(2,channels[0].length,context.sampleRate);
  channels.forEach((samples,i)=>buffer.copyToChannel(samples,i));return buffer;
 });
 let previous=-1;
 return {
  resume:()=>context.resume(),
  play(){
   if(context.state==='suspended')context.resume().catch(()=>{});
   const index=(previous+1+Math.floor(Math.random()*3))%buffers.length;previous=index;
   const source=context.createBufferSource();source.buffer=buffers[index];source.playbackRate.value=.98+Math.random()*.04;
   source.connect(compressor);source.onended=()=>source.disconnect();source.start();
  }
 };
}
