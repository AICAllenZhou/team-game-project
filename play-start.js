// Mouse capture must start during the click. Audio is optional and never gates Play.
export function preparePlay({stayInMenu=false,captureMouse,startAudio}){
 let capture=Promise.resolve(null);
 if(!stayInMenu){try{capture=Promise.resolve(captureMouse()).then(()=>null,error=>error);}catch(error){capture=Promise.resolve(error);}}
 try{const audio=startAudio();void Promise.resolve(audio?.ready).catch(()=>{});void Promise.resolve(audio?.resume()).catch(()=>{});}catch{}
 return capture;
}
