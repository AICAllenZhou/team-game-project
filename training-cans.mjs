// The same three targets are present in solo play and every shared lobby.
export function createTrainingCans() {
 return [0,1,2].map(index=>({id:`dummy-${index}`,x:(index-1)*5,y:0,
  z:-9-Math.abs(index-1)*3,hp:100,deadUntil:0,deaths:0}));
}

export function respawnTrainingCans(cans,now) {
 for(const can of cans)if(can.hp<=0&&now>=can.deadUntil){can.hp=100;can.deadUntil=0;}
}
