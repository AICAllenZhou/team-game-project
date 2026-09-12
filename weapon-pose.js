// The weapon's frame sits at a fixed reach from the eye. Recoil rotates it
// around that anchor; aim, walking and reload never push it toward the camera.
export const WEAPON_REACH = .78;
export function placeWeapon(rig, {yaw = 0, pitch = 0, bob = 0, lean = 0, recoil = 0, reload = false}) {
  const horizontal = Math.max(-.85, Math.min(.85, yaw));
  const vertical = Math.max(-.65, Math.min(.65, pitch));
  rig.position.set(-horizontal * .45, -.23 + vertical * .4 + bob * .4 - (reload ? .12 : 0), -.67);
  rig.position.setLength(WEAPON_REACH);
  rig.rotation.set(vertical + recoil * 1.5, horizontal, reload ? -.4 : lean * .16, 'YXZ');
}

// Camera sensitivity depends only on RMB, never on where the hand is pointing.
// Transferring overflow to the camera made identical mouse motion accelerate
// as the hand reached its limit, which felt like a jolt.
export function freeAimInput(state, dx, dy, focus) {
  const limits=[.28+.28*focus,.2+.18*focus],speed=.6*(1-.7*focus),headShare=.18-.12*focus;
  for(const [key,look,delta,limit] of [['freeX','lookYaw',dx*.0018,limits[0]],['freeY','lookPitch',dy*.0018,limits[1]]]){
    // Constant gain throughout the usable range; only the physical stop clamps.
    // No hidden atanh accumulation to make reversal sticky near an edge.
    state[key]=Math.max(-limit,Math.min(limit,state[key]+delta*(1-headShare)));
    state[look]-=delta*speed;
  }
  state.lookPitch=Math.max(-1.35,Math.min(1.35,state.lookPitch));
}

export function followAim(state,dt){
  // Mouse distance directly determines head rotation, without acceleration,
  // a speed cap or a spring continuing to turn after the mouse stops.
  state.yaw=state.lookYaw;state.pitch=state.lookPitch;
  // Follow LOCAL offsets, not a wrapped world angle. Even repeated full turns
  // cannot strand the barrel facing backwards or swap the side it lags toward.
  // Exact exponential response to a linearly moving target. A fixed 35 ms
  // time constant gives the same follow at 30, 60 and 144 Hz.
  const tau=.035,decay=Math.exp(-dt/tau);
  for(const [key,free,previous] of [['handYaw','freeX','previousFreeX'],['handPitch','freeY','previousFreeY']]){
    const target=-state[free],start=-(state[previous]??state[free]);
    const speed=dt>0?(target-start)/dt:0;
    state[key]=target-speed*tau+(state[key]-start+speed*tau)*decay;
    state[previous]=state[free];
  }
}

export function stepRecoil(s,dt){
  // Substeps keep the wrist spring stable on both slow and fast displays.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){s.velocity+=(-155*s.angle-16*s.velocity)*h;s.angle+=s.velocity*h;}
}

export function kickRecoil(s,fan=false){const multiplier=fan?1.12:1;s.velocity=Math.min(27,s.velocity+17*multiplier);s.angle=Math.min(1.1,s.angle+.11*multiplier);}

export function captureBarrelRay(gun){
 gun.updateWorldMatrix(true,false);
 const origin=gun.localToWorld(gun.position.clone().set(0,.025,-.52));
 const direction=gun.position.clone().set(0,0,-1).transformDirection(gun.matrixWorld);
 return {origin,direction};
}
