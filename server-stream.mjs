// Slow SSE readers keep their session. Coalesce the latest state and all
// destroyed cells while Node drains its socket; decorative events may drop.
const streamQueues=new WeakMap();
function streamQueue(res){
 let q=streamQueues.get(res);if(q)return q;
 q={events:new Map(),walls:new Map()};streamQueues.set(res,q);
 res.on('drain',()=>flushStream(res,q));return q;
}
function writeEvent(res,event,data){return res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}
function flushStream(res,q){
 if(res.destroyed||res.writableEnded)return;
 for(const event of ['wallReset','wallState'])if(q.events.has(event)){const data=q.events.get(event);q.events.delete(event);if(!writeEvent(res,event,data))return;}
 for(const [wallId,removed] of q.walls){q.walls.delete(wallId);if(!writeEvent(res,'wallDamage',{wallId,removed:[...removed]}))return;}
 for(const [event,data] of q.events){q.events.delete(event);if(!writeEvent(res,event,data))return;}
}
export function sendServerEvent(res,event,data){
 if(res.destroyed||res.writableEnded)return;
 const q=streamQueue(res);
 if(!res.writableNeedDrain&&!q.events.size&&!q.walls.size){writeEvent(res,event,data);return;}
 if(event==='wallDamage'){let cells=q.walls.get(data.wallId);if(!cells)q.walls.set(data.wallId,cells=new Set());for(const cell of data.removed)cells.add(cell);}
 else if(event==='wallReset'||event==='wallState'){q.walls.clear();q.events.delete('wallReset');q.events.delete('wallState');q.events.set(event,data);}
 else if(event==='state'||event==='resetCookie')q.events.set(event,data);
 if(!res.writableNeedDrain)flushStream(res,q);
}
