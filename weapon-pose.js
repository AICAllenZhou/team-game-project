// The weapon's frame sits at a fixed reach from the eye. Recoil rotates it
// around that anchor; aim, walking and reload never push it toward the camera.
export const WEAPON_REACH = .78;
export function placeWeapon(rig, {yaw = 0, pitch = 0, bob = 0, lean = 0, recoil = 0, reload = false}) {
  const horizontal = Math.max(-.85, Math.min(.85, yaw));
  const vertical = Math.max(-.65, Math.min(.65, pitch));
  rig.position.set(.29 - horizontal * .45, -.23 + vertical * .4 + bob * .4 - (reload ? .12 : 0), -.67);
  rig.position.setLength(WEAPON_REACH);
  rig.rotation.set(vertical + recoil * 1.5, horizontal, reload ? -.4 : lean * .16, 'YXZ');
}

// Only new mouse travel beyond the deadzone turns the head. Contracting the
// deadzone after releasing RMB must not produce a synthetic camera jump.
export function freeAimInput(state, dx, dy, focus) {
  const limits=[.28+.28*focus,.2+.18*focus],speed=1.35*(1-.7*focus);
  for(const [key,look,delta,limit] of [['freeX','lookYaw',dx*.0018,limits[0]],['freeY','lookPitch',dy*.0018,limits[1]]]){
    const previous=state[key],next=previous+delta;
    const bounded=Math.max(-limit,Math.min(limit,next));
    const previousOverflow=previous-Math.max(-limit,Math.min(limit,previous));
    const excess=next-bounded-previousOverflow;
    state[key]=bounded;state[look]-=excess*speed;
  }
  state.lookPitch=Math.max(-1.35,Math.min(1.35,state.lookPitch));
}

export function stepRecoil(s,dt){
  // Substeps keep the wrist spring stable on both slow and fast displays.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){s.velocity+=(-155*s.angle-16*s.velocity)*h;s.angle+=s.velocity*h;}
}
