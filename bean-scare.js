const BEAN_MARKUP=`<div id="bean-scare" role="alert" aria-label="Bean jumpscare" hidden>
 <div class="scare-art"><svg viewBox="0 0 500 520" role="img" aria-label="A giant angry baked-bean can">
 <ellipse cx="250" cy="488" rx="170" ry="22" fill="#000" opacity=".5"/>
 <path d="M108 115H392V434Q250 502 108 434Z" fill="#c54421" stroke="#29130b" stroke-width="12"/>
 <path d="M119 190H381V405Q250 445 119 405Z" fill="#edb96e"/>
 <ellipse cx="250" cy="115" rx="142" ry="37" fill="#afb8b4" stroke="#29130b" stroke-width="12"/>
 <ellipse cx="250" cy="118" rx="111" ry="21" fill="#56615c"/>
 <path d="M70 105Q250 159 430 105L424 79Q350 91 341 76L325 24Q250 53 175 24L159 76Q130 88 76 79Z" fill="#42251a" stroke="#1a0d08" stroke-width="9"/>
 <text x="250" y="194" text-anchor="middle" fill="#773218" font-family="Arial,sans-serif" font-size="32" font-weight="900">BAKED BEANS</text>
 <path d="M142 216L228 245M272 245L358 216" stroke="#28130b" stroke-width="20" stroke-linecap="round"/>
 <ellipse cx="190" cy="264" rx="37" ry="42" fill="#fff2c7"/><ellipse cx="310" cy="264" rx="37" ry="42" fill="#fff2c7"/>
 <ellipse cx="198" cy="271" rx="13" ry="25" fill="#14130c"/><ellipse cx="302" cy="271" rx="13" ry="25" fill="#14130c"/>
 <ellipse cx="250" cy="358" rx="74" ry="58" fill="#25120d"/><path d="M193 325H307L296 347H205Z" fill="#fff3d3"/>
 <path d="M203 388Q250 350 297 388" fill="#ce5148"/>
 <path d="M123 437Q250 473 377 437" fill="none" stroke="#b8c2bd" stroke-width="15"/>
 </svg><strong>BEAN!</strong></div>
 <button id="bean-scare-close" type="button">Dismiss</button>
</div>
`;
export function createBeanScare({element,closeButton,canShow=()=>false,now=()=>performance.now(),later=setTimeout,cancel=clearTimeout,playSound=()=>{}}){
 let next=0,timer=null;
 function hide(){cancel(timer);timer=null;element.hidden=true;}
 function show(){if(!canShow())return false;const time=now();if(time<next)return false;next=time+25000;element.hidden=false;cancel(timer);timer=later(hide,1400);try{playSound();}catch{}return true;}
 closeButton.addEventListener('click',hide);
 return {show,hide};
}
export function installBeanScare(doc=document,canShow=()=>false){
 if(!doc.getElementById('bean-scare')){const mount=doc.createElement('div');mount.innerHTML=BEAN_MARKUP;doc.body.append(mount);}
 let context;
 const scare=createBeanScare({element:doc.getElementById('bean-scare'),closeButton:doc.getElementById('bean-scare-close'),canShow,playSound(){
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;
  context??=new Audio();void context.resume().catch(()=>{});
  const oscillator=context.createOscillator(),gain=context.createGain(),t=context.currentTime;
  oscillator.type='sawtooth';oscillator.frequency.setValueAtTime(125,t);oscillator.frequency.exponentialRampToValueAtTime(45,t+.35);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.08,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+.4);
  oscillator.connect(gain);gain.connect(context.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start();oscillator.stop(t+.42);
 }});
 doc.addEventListener('keydown',event=>{if(event.code==='Escape')scare.hide();});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)scare.hide();});
 return scare;
}
