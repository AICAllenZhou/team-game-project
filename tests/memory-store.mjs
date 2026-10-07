export class MemoryStore {
  constructor(clock) {this.clock=clock;this.values=new Map();this.presence=new Map();}
  async get(key) {const v=this.values.get(key);if(!v||v.expires<=this.clock()){this.values.delete(key);return null;}return structuredClone(v.value);}
  async playerForToken(token) {const id=await this.get('token:'+token);return id?this.get('player:'+id):null;}
  async set(key,value,ttl) {this.values.set(key,{value:structuredClone(value),expires:this.clock()+ttl});}
  async delete(key) {this.values.delete(key);}
  async count(key,ttl) {const n=(await this.get(key)||0)+1;if(n===1)await this.set(key,n,ttl);else this.values.get(key).value=n;return n;}
  async listPlayers(now) {const players=[];for(const [id,expires] of this.presence){const p=await this.get('player:'+id);if(expires>now&&p)players.push(p);else this.presence.delete(id);}return players;}
  async save(p,now,ttl) {await this.set('player:'+p.id,p,ttl);await this.set('token:'+p.token,p.id,ttl);await this.set('code:'+p.joinCode,p.id,ttl);this.presence.set(p.id,now+ttl);}
  async register(p,now,ttl,max) {if((await this.listPlayers(now)).length>=max)return 'FULL';if(await this.get('code:'+p.joinCode))return 'COLLISION';await this.save(p,now,ttl);return 'OK';}
  async change(id,kind,data,now,ttl,capacity) {
    const p=await this.get('player:'+id);if(!p)return {status:'MISSING'};
    if(kind==='heartbeat') {if(p.hostId!==p.id&&!await this.get('player:'+p.hostId))return {status:'HOST_OFFLINE'};Object.assign(p,data);}
    if(kind==='powers')p.powers=data;
    if(kind==='loadout')p.loadout=data;
    if(kind==='map')p.mapConfig=data;
    if(kind==='cookieReset')p.cookieReset=data.id;
    if(kind==='cookieResetAck'&&p.cookieReset===data.id)p.cookieResetAck=data.id;
    if(kind==='join'||kind==='host') {
      let hostId=p.id;
      if(kind==='join') {const target=await this.get('player:'+data.targetId);if(!target)return {status:'TARGET_MISSING'};hostId=target.hostId;const host=await this.get('player:'+hostId);if(!host||host.id!==host.hostId||!host.isLobby)return {status:'HOST_OFFLINE'};}
      if(hostId!==p.hostId) {
        const peers=(await this.listPlayers(now)).filter(other=>other.id!==id);
        if(peers.some(other=>other.hostId===id))return {status:'HOST_BUSY'};
        if(peers.filter(other=>other.hostId===hostId).length>=capacity)return {status:'ROOM_FULL'};
        await this.delete('mailbox:'+id);
      }
      p.hostId=hostId;if(kind==='host')p.isLobby=true;p.lobbyCode=kind==='host'?p.joinCode:(await this.get('player:'+hostId)).joinCode;
    }
    p.lastSeen=now;await this.save(p,now,ttl);return {status:'OK',player:p};
  }
  async remove(id) {const p=await this.get('player:'+id);if(p)for(const key of ['player:'+id,'token:'+p.token,'code:'+p.joinCode,'mailbox:'+id])await this.delete(key);this.presence.delete(id);}
  async push(id,value,ttl) {const values=await this.get('mailbox:'+id)||[];if(values.length>=256)return 0;values.push(value);await this.set('mailbox:'+id,values,ttl);return 1;}
  async drain(id) {const values=await this.get('mailbox:'+id)||[];await this.delete('mailbox:'+id);return values;}
}
