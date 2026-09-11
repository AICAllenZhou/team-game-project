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

// A small, continuous head contribution prevents a frozen feeling when turning
// back across the wide hand range. RMB gives most input to the hand. Only NEW
// overflow turns the head; changing modes cannot manufacture mouse travel.
export function freeAimInput(state, dx, dy, focus) {
  const limits=[.28+.28*focus,.2+.18*focus],speed=1.35*(1-.7*focus),headShare=.18-.12*focus;
  for(const [key,look,delta,limit] of [['freeX','lookYaw',dx*.0018,limits[0]],['freeY','lookPitch',dy*.0018,limits[1]]]){
    const previous=Math.max(-limit,Math.min(limit,state[key])),next=previous+delta*(1-headShare);
    const bounded=Math.max(-limit,Math.min(limit,next));
    const excess=next-bounded;
    state[key]=bounded;state[look]-=(delta*headShare+excess)*speed;
  }
  state.lookPitch=Math.max(-1.35,Math.min(1.35,state.lookPitch));
}

export function followAim(state,dt){
  const blend=1-Math.exp(-24*dt);
  state.yaw+=(state.lookYaw-state.yaw)*blend;state.pitch+=(state.lookPitch-state.pitch)*blend;
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
