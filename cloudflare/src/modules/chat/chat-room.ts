// HAVANA NICE V2 · one existing Durable Object for private team Chat,
// Admin notifications and Familia invalidations. Moved verbatim from index.ts;
// the binding name, session policy, protocol and storage remain unchanged.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {adminSocketToken,adminTokenRequest} from '../admin/admin-realtime.js';
import {recordMemberEvent,readMemberDevice} from '../admin/member-admin.js';
import {deleteChatMessageRecord} from './message-removal.js';
import {decorateChatMessages} from './chat-media.js';
import {verifySession,websocketSessionToken,mapMessage} from './chat-session.js';
import {respond} from '../../shared/worker-http.js';
import type {V2Env,ChatMessageRow,MemberPresence,ChatEvent} from '../../shared/worker-types.js';

const MAX_TEXT=2000;
const CHAT_EDIT_WINDOW_MS=15*60*1000;

export class ChatRoom {
  declare state: DurableObjectState;
  declare env: V2Env;
  declare sockets: Set<WebSocket>;
  declare members: Map<WebSocket, MemberPresence>;
  declare typingSent: Map<WebSocket, number>;
  declare adminSockets: Map<WebSocket, string>;
  declare familySockets: Map<WebSocket, {token:string;admin:boolean;actorId:string|null}>;
  constructor(state: DurableObjectState, env: V2Env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set<WebSocket>();
    this.members = new Map<WebSocket, MemberPresence>();
    this.typingSent = new Map<WebSocket,number>();
    this.adminSockets = new Map<WebSocket,string>(); // independent of musician chat sockets
    this.familySockets = new Map(); // Familia invalidation only; no Chat messages or presence
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true, durableObject: 'ChatRoom', environment: this.env.HAVANA_ENV || 'development' });
    if (new URL(request.url).pathname === '/member-removed' && request.method === 'POST') {
      let data: {actorId?:unknown}|null=null;
      try{data=await request.json() as {actorId?:unknown};}catch{}
      if(typeof data?.actorId!=='string'||!/^member:[a-z0-9_-]{1,40}$/i.test(data.actorId))
        return respond({error:'Invalid member'},400);
      for(const [socket,member] of this.members.entries()){
        if(member.actorId!==data.actorId)continue;
        this.send(socket,{type:'chat.revoked',error:'Tu acceso fue eliminado por el Administrador'});
        try{socket.close(4003,'Member removed');}catch{}
        this.sockets.delete(socket);this.members.delete(socket);this.typingSent.delete(socket);
      }
      for(const [socket,subscriber] of this.familySockets){
        if(subscriber.actorId!==data.actorId)continue;
        this.send(socket,{type:'family.revoked'});
        try{socket.close(4003,'Member removed');}catch{}
        this.familySockets.delete(socket);
      }
      this.broadcast({type:'chat.presence',users:this.onlineUsers()});
      await this.invalidateAdmins('members');
      await this.invalidateFamilyClients();
      return respond({ok:true},200);
    }
    if (new URL(request.url).pathname === '/installation-released' && request.method === 'POST') {
      let data: {actorId?:unknown}|null=null;try{data=await request.json() as {actorId?:unknown};}catch{}
      if(typeof data?.actorId!=='string'||!/^member:[a-z0-9_-]{1,40}$/i.test(data.actorId))
        return respond({error:'Invalid member'},400);
      for(const [socket,member] of this.members.entries()){
        if(member.actorId!==data.actorId)continue;
        this.send(socket,{type:'chat.revoked',error:'El Administrador liberó este dispositivo'});
        try{socket.close(4003,'Installation released');}catch{}
        this.sockets.delete(socket);this.members.delete(socket);this.typingSent.delete(socket);
      }
      for(const [socket,subscriber] of this.familySockets){
        if(subscriber.actorId!==data.actorId)continue;
        this.send(socket,{type:'family.revoked'});
        try{socket.close(4003,'Installation released');}catch{}
        this.familySockets.delete(socket);
      }
      this.broadcast({type:'chat.presence',users:this.onlineUsers()});
      return respond({ok:true});
    }
    if (new URL(request.url).pathname === '/chat-media-message-ready' && request.method === 'POST') {
      let payload:{seq?:unknown}|null=null;
      try{payload=await request.json() as {seq?:unknown};}catch{}
      if(!Number.isSafeInteger(payload?.seq)||Number(payload?.seq)<=0)
        return respond({error:'Invalid media message'},400);
      const row=await this.env.DB.prepare(
        'SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at '+
        'FROM chat_messages WHERE seq=? AND deleted_at IS NULL'
      ).bind(payload?.seq).first<ChatMessageRow>();
      if(!row)return respond({error:'Message not found'},404);
      const [message]=await decorateChatMessages(this.env,[mapMessage(row)]);
      if(!message?.media)return respond({error:'Media not confirmed'},409);
      this.broadcast({type:'chat.message',message});
      return respond({ok:true});
    }
    if (new URL(request.url).pathname === '/admin-chat-message-deleted' && request.method === 'POST') {
      let data: {seq?:unknown}|null=null;try{data=await request.json() as {seq?:unknown};}catch{}
      if(typeof data?.seq!=='number'||!Number.isSafeInteger(data.seq)||data.seq<=0)return respond({error:'Invalid message'},400);
      const row=await this.env.DB.prepare('SELECT seq FROM chat_messages WHERE seq=?').bind(data.seq).first();
      if(row)return respond({error:'Message still exists'},409);
      this.broadcast({type:'chat.deleted',seq:data.seq});
      return respond({ok:true});
    }
    if (new URL(request.url).pathname === '/admin-invalidate' && request.method === 'POST') {
      let event: {topic?:unknown}|null=null;
      try{event=await request.json() as {topic?:unknown};}catch{}
      if(typeof event?.topic!=='string'||!['requests','members'].includes(event.topic))return respond({error:'Invalid topic'},400);
      await this.invalidateAdmins(event.topic);
      return respond({ok:true},200);
    }
    if(new URL(request.url).pathname==='/family-invalidate'&&request.method==='POST'){
      // Only Worker-to-DO traffic reaches this private endpoint.
      await this.invalidateFamilyClients();
      return respond({ok:true},200);
    }
    if(new URL(request.url).pathname==='/ws/family'){
      if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
        return respond({error:'WebSocket required'},426);
      const adminToken=adminSocketToken(request);
      const admin=!!adminToken&&await verifyAdminSession(adminTokenRequest(adminToken),this.env);
      const memberToken=websocketSessionToken(request);
      const member=!admin&&await verifySession(this.env,memberToken);
      const offered=(request.headers.get('sec-websocket-protocol')||'').split(',').map(x=>x.trim());
      if(!admin&&!member)return respond({error:'Unauthorized'},401);
      if(!admin&&!offered.includes('havana-v2-family'))return respond({error:'Invalid protocol'},400);
      const pair=new WebSocketPair();
      const client=pair[0],server=pair[1];server.accept();
      this.familySockets.set(server,{
        token:admin?adminToken:memberToken,admin:!!admin,
        actorId:member?member.actorId:null,
      });
      this.send(server,{type:'family.ready'});
      const cleanup=()=>this.familySockets.delete(server);
      server.addEventListener('close',cleanup);
      server.addEventListener('error',cleanup);
      return new Response(null,{status:101,webSocket:client,
        headers:{'Sec-WebSocket-Protocol':admin?'havana-v2-admin':'havana-v2-family'}});
    }
    if (new URL(request.url).pathname === '/ws/admin') {
      if ((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
        return respond({error:'WebSocket required'},426);
      const token=adminSocketToken(request);
      if(!token||!await verifyAdminSession(adminTokenRequest(token),this.env))
        return respond({error:'Unauthorized'},401);
      const pair=new WebSocketPair();
      const client=pair[0],server=pair[1];server.accept();
      this.adminSockets.set(server,token);
      this.send(server,{type:'admin.ready'});
      this.send(server,{type:'admin.chat.presence',users:this.onlineUsers()});
      const cleanup=()=>this.adminSockets.delete(server);
      server.addEventListener('close',cleanup);
      server.addEventListener('error',cleanup);
      // Admin sockets never enter musician presence, messages or membership maps.
      return new Response(null,{status:101,webSocket:client,
        headers:{'Sec-WebSocket-Protocol':'havana-v2-admin'}});
    }
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return respond({ error: 'WebSocket required' }, 426);
    // Authenticated in both Worker and DO, without rebuilding the upgrade Request:
    // cloning the original WebSocket handshake can break protocol upgrade.
    // PWA: session token in offered subprotocol; Android native: Authorization header.
    // Both modes are checked again inside this Durable Object.
    const session = await verifySession(this.env, websocketSessionToken(request));
    if (!session) return respond({ error: 'Unauthorized' }, 401);
    const actorId = session.actorId;
    const name = session.displayName;
    const enrollmentToken = websocketSessionToken(request);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.sockets.add(server);
    this.members.set(server, {actorId, name, enrollmentToken});
    const deviceDetails=readMemberDevice(request);
    await recordMemberEvent(this.env,actorId,'connect',request,deviceDetails).catch(()=>{});
    server.send(JSON.stringify({ type: 'chat.ready', at: new Date().toISOString(), users: this.onlineUsers() }));
    this.broadcast({ type: 'chat.presence', users: this.onlineUsers() });
    void this.invalidateAdmins('members').catch(()=>{}); // report roster/session activity, not musician data
    server.addEventListener('message', event => {
      this.state.waitUntil((async () => {
        // Revoking a name immediately denies all subsequent chat actions,
        // including on sockets that were opened before the revocation.
        const stillAuthorized = await verifySession(this.env, enrollmentToken);
        if (!stillAuthorized) {
          this.send(server, {type:'chat.revoked',error:'Acceso revocado por administrador'});
          server.close(4003, 'Access revoked');
          return;
        }
        await this.onMessage(server, actorId, name, event.data);
      })().catch(() => {
        this.send(server, { type: 'chat.error', error: 'Delivery failed' });
      }));
    });
    let socketClosed=false;
    const cleanup = () => {
      if(socketClosed)return;
      socketClosed=true;
      this.state.waitUntil(recordMemberEvent(this.env,actorId,'disconnect',request,deviceDetails).catch(()=>{}));
      this.sockets.delete(server);
      this.members.delete(server);
      this.typingSent.delete(server);
      this.broadcast({ type: 'chat.presence', users: this.onlineUsers() });
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);
    // Client offered havana-v2; explicitly select it in 101 response.
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': 'havana-v2' },
    });
  }
  send(socket: WebSocket, data: object) {
    try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); } catch {}
  }
  broadcast(data: ChatEvent) {
    for (const socket of this.sockets) this.send(socket, data);
    this.broadcastToAdmins(data);
  }
  broadcastToAdmins(data: ChatEvent){
    const types={
      'chat.message':'admin.chat.message','chat.updated':'admin.chat.updated','chat.deleted':'admin.chat.deleted',
      'chat.reaction':'admin.chat.reaction','chat.presence':'admin.chat.presence',
      'chat.typing':'admin.chat.typing','chat.read':'admin.chat.read'
    };
    const type=(types as Record<string,string>)[data.type];
    if(!type)return;
    // Only the separately authenticated administrator can receive Chat content.
    // Re-check for revoked/expired sessions on each event.
    this.state.waitUntil((async()=>{
      for(const [socket,token] of this.adminSockets){
        if(!await verifyAdminSession(adminTokenRequest(token),this.env)){
          try{socket.close(4003,'Admin session ended');}catch{}
          this.adminSockets.delete(socket);
          continue;
        }
        this.send(socket,{...data,type});
      }
    })().catch(()=>{}));
  }
  async invalidateAdmins(topic: string){
    for(const [socket,token] of this.adminSockets){
      if(!await verifyAdminSession(adminTokenRequest(token),this.env)){
        try{socket.close(4003,'Admin session ended');}catch{}
        this.adminSockets.delete(socket);
        continue;
      }
      this.send(socket,{type:'admin.invalidate',topic});
    }
  }
  async invalidateFamilyClients(){
    // Re-check membership and admin sessions for every signal. Revoked devices
    // never receive more invalidations or private album material.
    for(const [socket,subscriber] of this.familySockets){
      const authorized=subscriber.admin
        ?await verifyAdminSession(adminTokenRequest(subscriber.token),this.env)
        :await verifySession(this.env,subscriber.token);
      if(!authorized){
        try{socket.close(4003,'Access revoked');}catch{}
        this.familySockets.delete(socket);
        continue;
      }
      this.send(socket,{type:'family.invalidate'});
    }
  }
  onlineUsers() {
    const users = new Map<string,string>();
    for (const member of this.members.values()) users.set(member.actorId, member.name);
    return [...users.entries()].map(([actorId, displayName]) => ({actorId, displayName}));
  }
  async onMessage(socket:WebSocket,senderId:string,senderName:string,raw:unknown) {
    if (typeof raw !== 'string' || raw.length > 10000) return this.send(socket, { type: 'chat.error', error: 'Invalid message' });
    let input: Record<string,any>;
    try { input = JSON.parse(raw); } catch { return this.send(socket, { type: 'chat.error', error: 'Invalid JSON' }); }
    if (input.type === 'chat.typing') {
      const now = Date.now();
      if (typeof input.active !== 'boolean' || now - (this.typingSent.get(socket) || 0) < 750) return;
      this.typingSent.set(socket, now);
      const signal = {type: 'chat.typing', actorId: senderId, senderName, active: input.active, expiresAt: now + 4000};
      for (const other of this.sockets) if (other !== socket) this.send(other, signal);
      this.broadcastToAdmins(signal);
      return;
    }

    if (input.type === 'chat.read') {
      if (!Number.isSafeInteger(input.seq) || input.seq < 1) return;
      // Never claim a receipt ahead of the persisted server history.
      const cap = await this.env.DB.prepare('SELECT MAX(seq) AS newest FROM chat_messages').first<{newest:number|null}>();
      const upto = Math.min(input.seq, Number(cap?.newest || 0));
      if (!upto) return;
      await this.env.DB.prepare(
        'INSERT INTO chat_read_receipts(actor_id,display_name,last_read_seq,updated_at) VALUES(?,?,?,?) ' +
        'ON CONFLICT(actor_id) DO UPDATE SET last_read_seq=MAX(chat_read_receipts.last_read_seq,excluded.last_read_seq), updated_at=excluded.updated_at'
      ).bind(senderId,senderName,upto,new Date().toISOString()).run();
      this.broadcast({type:'chat.read',actorId:senderId,displayName:senderName,seq:upto});
      return;
    }
    if (input.type === 'chat.edit' || input.type === 'chat.delete') {
      if (!Number.isSafeInteger(input.seq) || input.seq <= 0) {
        this.send(socket,{type:'chat.error',error:'Identificador inválido'});return;
      }
      const own = await this.env.DB.prepare(
        'SELECT seq,sender_id,created_at,deleted_at FROM chat_messages WHERE seq=?'
      ).bind(input.seq).first<{seq:number;sender_id:string;created_at:string;deleted_at:string|null}>();
      if (!own || own.sender_id !== senderId || own.deleted_at ||
          Date.now() - Date.parse(own.created_at) > (input.type === 'chat.delete' ? 48 * 60 * 60 * 1000 : CHAT_EDIT_WINDOW_MS) ||
          !Number.isFinite(Date.parse(own.created_at))) {
        this.send(socket,{type:'chat.error',error:'No puedes modificar este mensaje'});return;
      }
      const now = new Date().toISOString();
      if (input.type === 'chat.edit') {
        if (typeof input.text !== 'string' || !input.text.trim() || input.text.trim().length > MAX_TEXT) {
          this.send(socket,{type:'chat.error',error:'Texto inválido'});return;
        }
        await this.env.DB.prepare(
          'UPDATE chat_messages SET body=?,edited_at=? WHERE seq=? AND sender_id=? AND deleted_at IS NULL'
        ).bind(input.text.trim(),now,input.seq,senderId).run();
      } else {
        if(await deleteChatMessageRecord(this.env,input.seq))
          this.broadcast({type:'chat.deleted',seq:input.seq});
        return;
      }
      const current = await this.env.DB.prepare(
        'SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq=?'
      ).bind(input.seq).first<ChatMessageRow>();
      if (current) this.broadcast({type:'chat.updated',message:mapMessage(current)});
      return;
    }
    if (input.type === 'chat.react') {
      if (!Number.isSafeInteger(input.messageSeq) || input.messageSeq < 1 || !['❤️','😂','👍'].includes(input.emoji)) {
        this.send(socket, {type:'chat.error',error:'Invalid reaction'}); return;
      }
      const exists = await this.env.DB.prepare('SELECT seq FROM chat_messages WHERE seq = ? AND deleted_at IS NULL').bind(input.messageSeq).first();
      if (!exists) { this.send(socket,{type:'chat.error',error:'Message not found'}); return; }
      const current = await this.env.DB.prepare('SELECT actor_id FROM chat_reactions WHERE message_seq=? AND actor_id=? AND emoji=?')
        .bind(input.messageSeq,senderId,input.emoji).first();
      if (current) {
        await this.env.DB.prepare('DELETE FROM chat_reactions WHERE message_seq=? AND actor_id=? AND emoji=?')
          .bind(input.messageSeq,senderId,input.emoji).run();
      } else {
        await this.env.DB.prepare('INSERT OR IGNORE INTO chat_reactions(message_seq,actor_id,emoji,created_at) VALUES (?,?,?,?)')
          .bind(input.messageSeq,senderId,input.emoji,new Date().toISOString()).run();
      }
      this.broadcast({type:'chat.reaction',messageSeq:input.messageSeq,actorId:senderId,emoji:input.emoji,active:!current});
      return;
    }
    if (input.type !== 'chat.send' || typeof input.clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(input.clientMessageId) || typeof input.text !== 'string') {
      return this.send(socket, { type: 'chat.error', error: 'Invalid message format' });
    }
    const text = input.text.trim();
    if (!text || text.length > MAX_TEXT) return this.send(socket, { type: 'chat.error', error: 'Text length must be 1–2000' });
    const reply = input.replyToSeq === null || input.replyToSeq === undefined ? null : input.replyToSeq;
    if (reply !== null) {
      if (!Number.isSafeInteger(reply) || reply < 1) { this.send(socket,{type:'chat.error',error:'Invalid reply'}); return; }
      const original = await this.env.DB.prepare('SELECT seq FROM chat_messages WHERE seq=? AND deleted_at IS NULL').bind(reply).first();
      if (!original) { this.send(socket,{type:'chat.error',error:'Original message not found'}); return; }
    }
    const result = await this.env.DB.prepare(
      'INSERT OR IGNORE INTO chat_messages (client_message_id, sender_id, sender_name, body, created_at, reply_to_seq) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(input.clientMessageId, senderId, senderName, text, new Date().toISOString(), reply).run();
    const row = await this.env.DB.prepare(
      'SELECT seq, client_message_id, sender_id, sender_name, body, created_at, reply_to_seq, edited_at, deleted_at FROM chat_messages WHERE sender_id = ? AND client_message_id = ?'
    ).bind(senderId, input.clientMessageId).first<ChatMessageRow>();
    if (!row) throw new Error('Persistence failure');
    const event = { type: 'chat.message', message: mapMessage(row) };
    if (result.meta?.changes > 0) this.broadcast(event);
    else this.send(socket, event);
  }
}
