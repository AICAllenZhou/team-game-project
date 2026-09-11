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
    const previous=Math.max(-limit*.999,Math.min(limit*.999,state[key]));
    // Soft saturation gradually transfers mouse travel to the camera, avoiding
    // the abrupt sensitivity step when the hand reaches a hard edge.
    const next=limit*Math.tanh(Math.atanh(previous/limit)+delta*(1-headShare)/limit);
    const bounded=Math.max(-limit*.999,Math.min(limit*.999,next));
    state[key]=bounded;state[look]-=delta*speed;
  }
  state.lookPitch=Math.max(-1.35,Math.min(1.35,state.lookPitch));
}

export function followAim(state,dt){
  // Preserve angular velocity across frames instead of instantly changing it
  // with every mouse batch. Bound acceleration and speed for delayed events.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(const [key,target,velocity] of [['yaw','lookYaw','yawVelocity'],['pitch','lookPitch','pitchVelocity']]){
    state[velocity]??=0;
    for(let i=0;i<steps;i++){
      const error=state[target]-state[key],acceleration=Math.max(-80,Math.min(80,900*error-60*state[velocity]));
      state[velocity]=Math.max(-8,Math.min(8,state[velocity]+acceleration*h));
      state[key]+=state[velocity]*h;
    }
  }
  // Follow LOCAL offsets, not a wrapped world angle. Even repeated full turns
  // cannot strand the barrel facing backwards or swap the side it lags toward.
  const gunBlend=1-Math.exp(-16*dt);
  state.handYaw+=(-state.freeX-state.handYaw)*gunBlend;
  state.handPitch+=(-state.freeY-state.handPitch)*gunBlend;
}

export function stepRecoil(s,dt){
  // Substeps keep the wrist spring stable on both slow and fast displays.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){s.velocity+=(-155*s.angle-16*s.velocity)*h;s.angle+=s.velocity*h;}
}

export function kickRecoil(s){s.velocity=Math.min(24,s.velocity+17);s.angle=Math.min(1,s.angle+.11);}
