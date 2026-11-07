import { handleAdminSessionApi, verifyAdminSession } from './modules/admin/admin-auth.js';
import { adminSocketToken, adminTokenRequest, notifyAdminClients } from './modules/admin/admin-realtime.js';
import {handleAdminMemberManagement,recordMemberEvent,readMemberDevice} from './modules/admin/member-admin.js';
import {handleAdminChat} from './modules/admin/admin-chat.js';
import {deleteChatMessageRecord} from './modules/chat/message-removal.js';
import {claimFirstInstallation,auditDuplicateInstallation,handleSingleInstallationAdmin} from './modules/admin/single-installation.js';
import {handleCalendarApi} from './modules/calendar/calendar.js';
import {CalendarRoom,calendarSocketIdentity,calendarSocketAuthorized} from './modules/calendar/calendar-realtime.js';
export {CalendarRoom};
import {handleRepertoireApi} from './modules/repertoire/repertoire.js';
import {handleFamilyApi} from './modules/family/family.js';
import {notifyFamilyClients} from './modules/family/family-realtime.js';
import {handleChatMedia,readChatMedia,decorateChatMessages} from './modules/chat/chat-media.js';
import {sha256Hex} from './shared/crypto-helpers.js';
// Compile-time contracts only. These definitions do not change runtime behavior.
interface V2Env {
  DB: D1Database;
  CHAT_ROOMS: DurableObjectNamespace;
  CALENDAR_ROOMS: DurableObjectNamespace;
  // One private R2 bucket shared by Familia and Chat; media records remain separate.
  MEDIA_BUCKET?: R2Bucket;
  HAVANA_ENV?: string;
  V2_ADMIN_LOGIN_MODE?: string;
  V2_ADMIN_LOGIN_SECRET?: string;
}
interface MusicianRow { actor_id: string; display_name: string; username?: string }
interface ChatMessageRow {
  seq: number; client_message_id: string; sender_id: string; sender_name: string;
  body: string; created_at: string; reply_to_seq: number|null;
  edited_at: string|null; deleted_at: string|null;
}
interface ReactionRow {message_seq:number;actor_id:string;emoji:string}
interface ReceiptRow {actor_id:string;display_name:string;last_read_seq:number}
interface MemberPresence { actorId:string; name:string; enrollmentToken:string }
type ChatEvent = {type:string;[key:string]:unknown};

// HAVANA NICE V2 isolated Worker. Only D1-authorized musician names may enroll.
// Random durable device credentials are issued once and validated against D1 on every request.
const decoder = new TextDecoder();
const ROOM = 'main-chat-v2';
const MAX_TEXT = 2000;
const MAX_HISTORY = 100;
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

function respond(data: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': origin || 'https://havana-nice-v2-dev.pages.dev',
    'vary': 'Origin',
  } });
}
function trustedOrigin(origin: string | null) {
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && (url.hostname === 'havana-nice-v2.pages.dev' || url.hostname.endsWith('.havana-nice-v2.pages.dev') || url.hostname === 'havana-nice-v2-dev.pages.dev' || url.hostname.endsWith('.havana-nice-v2-dev.pages.dev'))) return origin;
    // React Native/OkHttp uses the WSS endpoint's own HTTPS origin by default.
    if (url.protocol === 'https:' && url.hostname === 'havana-nice-v2-dev.soloaplicaciones97.workers.dev') return origin;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return origin;
  } catch {}
  return '';
}
function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).split('+').join('-').split('/').join('_').replace(/=+$/, '');
}
// A musician enters their own name once. A server-side allowlist, not a
// password, controls whether that name has access. Store only token hashes.
const MEMBER_SESSION_EXPIRY = Date.UTC(2100, 0, 1);
function normalizeMusicianName(value: unknown) {
  if (typeof value !== 'string') return '';
  const name = value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return /^[a-z][a-z0-9 _-]{0,27}$/.test(name) ? name : '';
}
async function createSession(env: V2Env, member: MusicianRow, request: Request) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash=await sha256Hex(token);
  // Every Admin-authorized musician name belongs to one installation.
  const claimed=await claimFirstInstallation(env,member,tokenHash,MEMBER_SESSION_EXPIRY);
  if(!claimed){
    await auditDuplicateInstallation(env,member.actor_id,request);
    return null;
  }
  await recordMemberEvent(env,member.actor_id,'login',request).catch(()=>{});
  return { token, actorId: member.actor_id, displayName: member.display_name, expiresAt: new Date(MEMBER_SESSION_EXPIRY).toISOString() };
}
async function verifySession(env: V2Env, token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT s.actor_id, m.display_name, s.expires_at ' +
      'FROM chat_sessions s JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 WHERE s.token_hash=? ' +
      'AND EXISTS (SELECT 1 FROM chat_single_device_owners owner '+
      'WHERE owner.actor_id=m.actor_id AND owner.token_hash=s.token_hash)'
    ).bind(await sha256Hex(token)).first<{actor_id:string;display_name:string;expires_at:number}>();
    if (!row || !Number.isFinite(row.expires_at) || row.expires_at <= Date.now()) return null;
    return { actorId: row.actor_id, displayName: row.display_name, exp: row.expires_at };
  } catch { return null; }
}
// Never accept the session from an URL query string (would leak into access logs).
function websocketSessionToken(request: Request) {
  const protocols = request.headers.get('sec-websocket-protocol') || '';
  const offered = protocols.split(',').map(s => s.trim());
  const browserToken = offered.find(s => s.startsWith('session.'));
  if (browserToken) return browserToken.slice(8);
  // Native React Native WebSocket can supply Authorization at handshake time.
  // Browsers cannot set this header with the WebSocket API.
  const auth = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{40,100})$/i.exec(auth);
  return match?.[1] || '';
}

function mapMessage(row: ChatMessageRow) {
  return {seq:row.seq,clientMessageId:row.client_message_id,senderId:row.sender_id,senderName:row.sender_name,text:row.deleted_at?'':row.body,sentAt:row.created_at,replyToSeq:row.reply_to_seq??null,editedAt:row.edited_at??null,deletedAt:row.deleted_at??null};
}

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
        actorId:admin?null:member.actorId,
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

export default {
  async fetch(request: Request, env: V2Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const origin = trustedOrigin(request.headers.get('origin'));
    // One CORS policy for all Chat/Admin endpoints, including moderator DELETE.
    // Reject untrusted origins *before* answering a browser preflight.
    if (request.headers.has('origin') && !origin) return respond({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: { 'access-control-allow-origin': origin || 'https://havana-nice-v2-dev.pages.dev',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Range, X-Havana-V2-Offset, X-Havana-V2-Upload-ID',
        'access-control-max-age': '3600', 'vary': 'Origin' },
    });
    if (url.pathname === '/health') {
      let row: {value:string}|null = null, database = 'error';
      try { row = await env.DB.prepare('SELECT value FROM system_meta WHERE key = ?').bind('schema_version').first<{value:string}>(); database = 'ok'; } catch {}
      return respond({ ok: database === 'ok', app: 'havana-nice-v2', environment: env.HAVANA_ENV || 'development', database, schemaVersion: row?.value ?? null, realtime: 'configured', media: 'private-r2-chat-and-family', chat: 'authorized-members-persistent-device-sessions-realtime' }, database === 'ok' ? 200 : 503, origin);
    }
    if(url.pathname==='/ws/family'){
      // One existing ChatRoom Durable Object, separate notification-only stream.
      if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
        return respond({error:'Upgrade required'},426,origin);
      const adminToken=adminSocketToken(request);
      const admin=!!adminToken&&await verifyAdminSession(adminTokenRequest(adminToken),env);
      const protocols=(request.headers.get('sec-websocket-protocol')||'').split(',').map(x=>x.trim());
      const memberToken=websocketSessionToken(request);
      const member=!admin&&protocols.includes('havana-v2-family')&&await verifySession(env,memberToken);
      if(!admin&&!member)return respond({error:'No autorizado'},401,origin);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(request);
    }
    if(url.pathname==='/ws/calendar'){
      // Isolated realtime calendar, using existing member/Admin credentials.
      // Tokens are offered as WebSocket subprotocols, never in URL query params.
      if(!request.headers.get('origin')||!origin)return respond({error:'Origin not allowed'},403,origin);
      if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
        return respond({error:'Upgrade required'},426,origin);
      const identity=calendarSocketIdentity(request);
      if(!await calendarSocketAuthorized(env,identity))
        return respond({error:'No autorizado'},401,origin);
      return env.CALENDAR_ROOMS.get(env.CALENDAR_ROOMS.idFromName('calendar-v2')).fetch(request);
    }
    // Calendar is a separate V2 module on the same Worker/D1 and identity authority.
    // D1 migration 0018 must be applied before publishing this route.
    if(url.pathname.startsWith('/api/calendar/'))
      return handleCalendarApi(request,env,url,origin,respond,verifySession);
    // Repertoire is separately routed with the existing session and D1 grants.
    if(url.pathname.startsWith('/api/repertoire/'))
      return handleRepertoireApi(request,env,url,origin,respond,verifySession);
    // Familia HAVANA NICE: a separate authorized album directory, no media yet.
    if(url.pathname.startsWith('/api/family/'))
      return handleFamilyApi(request,env,url,origin,respond,verifySession,ctx);
    // One R2 API for Chat originals; real access requires existing member/Admin auth.
    if(url.pathname.startsWith('/api/chat/media/')){
      const match=/^\/api\/chat\/media\/([0-9a-f-]{36})\/file$/.exec(url.pathname);
      if(match&&request.method==='GET')return readChatMedia(request,env,match[1],url,origin);
      const member=await verifySession(env,(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));
      const admin=!member&&await verifyAdminSession(request,env);
      if(!member&&!admin)return respond({error:'No autorizado'},401,origin);
      const identity=member?{actorId:member.actorId,displayName:member.displayName}:null;
      // Only musicians can upload/send; Admin can view every committed original.
      if(!identity&&url.pathname.endsWith('/grant')&&request.method==='GET')
        return handleChatMedia(request,env,url,origin,null);
      if(!identity&&url.pathname==='/api/chat/media/status'&&request.method==='GET')
        return handleChatMedia(request,env,url,origin,null);
      if(!identity)return respond({error:'Solo los músicos pueden enviar archivos'},403,origin);
      return handleChatMedia(request,env,url,origin,identity);
    }
    if (url.pathname === '/realtime/health') return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName('foundation-health')).fetch('https://internal/health');
    if (url.pathname === '/api/chat/admin/member-history' || url.pathname === '/api/chat/admin/member-delete-preview' || url.pathname === '/api/chat/admin/remove-member' || url.pathname === '/api/chat/admin/member-media-cleanup') {
      return handleAdminMemberManagement(request,env,url,origin,respond,ROOM);
    }
    if (url.pathname.startsWith('/api/chat/admin/duplicate-logins') ||
        url.pathname === '/api/chat/admin/release-installation') {
      return handleSingleInstallationAdmin(request,env,url,origin,respond);
    }
    if (url.pathname === '/api/chat/admin/messages' || url.pathname.startsWith('/api/chat/admin/messages/')) {
      return handleAdminChat(request,env,url,origin,respond);
    }
    if (url.pathname === '/api/chat/admin/members') {
      if (request.method !== 'GET' && request.method !== 'POST') return respond({error:'Método no permitido'},405,origin);
      if (!await verifyAdminSession(request,env)) return respond({error:'No autorizado'},401,origin);
      if (request.method === 'POST') {
        let payload: {displayName?:unknown};
        try { payload=await request.json() as {displayName?:unknown}; } catch {return respond({error:'Solicitud inválida'},400,origin);}
        const displayName=typeof payload?.displayName==='string'?
          payload.displayName.normalize('NFC').trim().replace(/\s+/g,' '):'';
        const username=normalizeMusicianName(displayName);
        if (!username || displayName.length>28) return respond({
          error:'Escribe un nombre válido de hasta 28 caracteres. Se permiten espacios y acentos.'
        },400,origin);
        const actorId='member:'+crypto.randomUUID();
        const created=await env.DB.prepare(
          'INSERT OR IGNORE INTO chat_members(username,actor_id,display_name,active) VALUES(?,?,?,1)'
        ).bind(username,actorId,displayName).run();
        if(Number(created.meta?.changes)!==1)return respond({error:'Este nombre ya existe en el Administrador.'},409,origin);
        await notifyAdminClients(env,'members');
      ctx.waitUntil(notifyFamilyClients(env));
        return respond({member:{actor_id:actorId,username,display_name:displayName,active:1,session_count:0,installation_bound:0}},201,origin);
      }
      // No bearer tokens, device secrets or private message history are returned.
      const members = await env.DB.prepare(
        'SELECT m.actor_id,m.display_name,m.username,m.active,'+
        'MAX(CASE WHEN owner.actor_id IS NOT NULL THEN 1 ELSE 0 END) AS installation_bound,'+
        'COUNT(s.token_hash) AS session_count '+
        'FROM chat_members m LEFT JOIN chat_sessions s ON s.actor_id=m.actor_id AND s.expires_at>? '+
        'LEFT JOIN chat_single_device_owners owner ON owner.actor_id=m.actor_id '+
        'GROUP BY m.actor_id,m.display_name,m.username,m.active ORDER BY m.display_name'
      ).bind(Date.now()).all();
      return respond({members:members.results||[]},200,origin);
    }
    if (url.pathname.startsWith('/api/chat/admin/auth/')) {
      return handleAdminSessionApi(request,env,url,origin,respond);
    }
    if (url.pathname === '/api/chat/session' && request.method === 'POST') {
      let payload: {displayName?:unknown};
      try { payload = await request.json() as {displayName?:unknown}; } catch { return respond({ error: 'Solicitud inválida' }, 400, origin); }
      const username = normalizeMusicianName(payload?.displayName);
      if (!username) return respond({ error: 'Escribe tu nombre para entrar' }, 400, origin);
      const member = await env.DB.prepare(
        'SELECT username,actor_id,display_name FROM chat_members WHERE username=? AND active=1'
      ).bind(username).first<MusicianRow>();
      if (!member) return respond({ error: 'Tu nombre todavía no está autorizado. Solicita acceso al administrador.' }, 403, origin);
      const session=await createSession(env,member,request);
      if(!session)return respond({code:'name_already_bound',
        error:'Este nombre ya está vinculado a otro dispositivo. Se notificó al Administrador.'
      },409,origin);
      return respond(session,200,origin);
    }
    if (url.pathname === '/api/chat/session' && request.method === 'GET') {
      const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const valid = await verifySession(env, token);
      if (!valid) return respond({ error: 'Acceso revocado o no autorizado' }, 401, origin);
      return respond({ token, actorId: valid.actorId, displayName: valid.displayName, expiresAt: new Date(valid.exp).toISOString() }, 200, origin);
    }
    if (url.pathname === '/api/chat/messages' && request.method === 'GET') {
      const session = await verifySession(env, (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
      if (!session) return respond({ error: 'Acceso revocado o sesión no autorizada' }, 401, origin);
      const before = url.searchParams.get('beforeSeq');
      const earlier = before === null ? null : Number(before);
      if (earlier !== null && (!Number.isSafeInteger(earlier) || earlier < 1)) return respond({error:'Invalid beforeSeq'},400,origin);
      const search = url.searchParams.get('search');
      if (search !== null && (search.trim().length < 2 || search.length > 80)) return respond({error:'Search must contain 2–80 characters'},400,origin);
      if (search !== null) {
        const needle = '%'+search.trim().replace(/[\\%_]/g,x=>'\\'+x)+'%';
        const result = await env.DB.prepare(
          "SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE deleted_at IS NULL AND body LIKE ? ESCAPE '\\' ORDER BY seq DESC LIMIT 60"
        ).bind(needle).all<ChatMessageRow>();
        return respond({messages:await decorateChatMessages(env,(result.results||[]).map(mapMessage).reverse()),hasMore:false,reactions:[]},200,origin);
      }
      const after = url.searchParams.get('afterSeq');
      const seq = after === null ? null : Number(after);
      if (seq !== null && (!Number.isSafeInteger(seq) || seq < 0)) return respond({ error: 'Invalid cursor' }, 400, origin);
      if (seq !== null && earlier !== null) return respond({error:'Incompatible cursors'},400,origin);
      const query = earlier !== null
        ? env.DB.prepare('SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq < ? AND deleted_at IS NULL ORDER BY seq DESC LIMIT ?').bind(earlier,MAX_HISTORY)
        : seq === null
        ? env.DB.prepare('SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE deleted_at IS NULL ORDER BY seq DESC LIMIT ?').bind(MAX_HISTORY)
        : env.DB.prepare('SELECT seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at FROM chat_messages WHERE seq > ? AND deleted_at IS NULL ORDER BY seq ASC LIMIT ?').bind(seq,MAX_HISTORY);
      const rows = (await query.all<ChatMessageRow>()).results || [];
      if (seq === null || earlier !== null) rows.reverse();
      const messageSeqs = rows.map(row => row.seq);
      let reactions: ReactionRow[] = [];
      if (messageSeqs.length) {
        const placeholders = messageSeqs.map(() => '?').join(',');
        const query = await env.DB.prepare('SELECT message_seq, actor_id, emoji FROM chat_reactions WHERE message_seq IN ('+placeholders+')')
          .bind(...messageSeqs).all<ReactionRow>();
        reactions = query.results || [];
      }
      const receipts = await env.DB.prepare('SELECT actor_id,display_name,last_read_seq FROM chat_read_receipts WHERE updated_at > ? LIMIT 100')
        .bind(new Date(Date.now()-7*86400000).toISOString()).all<ReceiptRow>();
      return respond({ messages: await decorateChatMessages(env,rows.map(mapMessage)), reactions: reactions.map(r => ({messageSeq:r.message_seq,actorId:r.actor_id,emoji:r.emoji})),
        receipts: (receipts.results||[]).map(r => ({actorId:r.actor_id,displayName:r.display_name,seq:r.last_read_seq})),
        hasMore: rows.length === MAX_HISTORY }, 200, origin);
    }
    if (url.pathname === '/ws/admin') {
      // Admin websocket is available only from the known Administrator PWA origin.
      // Authorization is checked in both Worker and Durable Object, every event
      // is a topic hint, and no credentials are passed in query parameters.
      const rawOrigin=request.headers.get('origin');
      if(!rawOrigin||!origin)return respond({error:'Origin not allowed'},403,origin);
      if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
        return respond({error:'Upgrade required'},426,origin);
      const token=adminSocketToken(request);
      if(!token||!await verifyAdminSession(adminTokenRequest(token),env))
        return respond({error:'No autorizado'},401,origin);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(request);
    }
    if (url.pathname === '/ws') {
      const session = await verifySession(env, websocketSessionToken(request));
      if (!session) return respond({ error: 'Unauthorized' }, 401, origin);
      if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return respond({ error: 'Upgrade required' }, 426, origin);
      // Forward original Upgrade and offered subprotocols unchanged.
      // The Durable Object verifies the session independently.
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(request);
    }
    return respond({ error: 'Not found' }, 404, origin);
  },
};
