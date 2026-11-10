import { handleAdminSessionApi, verifyAdminSession } from './modules/admin/admin-auth.js';
import { adminSocketToken, adminTokenRequest, notifyAdminClients } from './modules/admin/admin-realtime.js';
import {handleAdminChat} from './modules/admin/admin-chat.js';
import {claimFirstInstallation,auditDuplicateInstallation,handleSingleInstallationAdmin} from './modules/admin/single-installation.js';
import {handleCalendarApi} from './modules/calendar/calendar.js';
import {handleCalendarMemories} from './modules/calendar/calendar-memories.js';
import {CalendarRoom,calendarSocketIdentity,calendarSocketAuthorized,notifyRepertoireClients} from './modules/calendar/calendar-realtime.js';
export {CalendarRoom};
import {handleRepertoireApi} from './modules/repertoire/repertoire.js';
import {handleFamilyApi} from './modules/family/family.js';
import {handleBookApi} from './modules/book/book.js';
import {notifyFamilyClients} from './modules/family/family-realtime.js';
import {handleChatMedia,readChatMedia,decorateChatMessages} from './modules/chat/chat-media.js';
import {sha256Hex} from './shared/crypto-helpers.js';
import {handleAdminMemberManagement,recordMemberEvent} from './modules/admin/member-admin.js';
import {verifySession,websocketSessionToken,mapMessage} from './modules/chat/chat-session.js';
import {respond} from './shared/worker-http.js';
import type {V2Env,MusicianRow,ChatMessageRow,ReactionRow,ReceiptRow} from './shared/worker-types.js';
export {ChatRoom} from './modules/chat/chat-room.js';
// HAVANA NICE V2 isolated Worker. Only D1-authorized musician names may enroll.
// Random durable device credentials are issued once and validated against D1 on every request.
const ROOM = 'main-chat-v2';
const MAX_HISTORY = 100;

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

export default {
  async fetch(request: Request, env: V2Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const origin = trustedOrigin(request.headers.get('origin'));
    // One CORS policy for all Chat/Admin endpoints, including moderator DELETE.
    // Reject untrusted origins *before* answering a browser preflight.
    if (request.headers.has('origin') && !origin) return respond({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: { 'access-control-allow-origin': origin || 'https://havana-nice-v2-dev.pages.dev',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Range, X-Havana-V2-Offset, X-Havana-V2-Upload-ID, X-Book-Width, X-Book-Height',
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
    // A single Worker/calendar namespace; completed-event memories have their
    // own private media capabilities, not a second calendar or BOOK engine.
    if(url.pathname.startsWith('/api/calendar/photo/')||
       /^\/api\/calendar\/(?:admin\/)?events\/[0-9a-f-]{36}\/photos(?:\/|$)/.test(url.pathname))
      return handleCalendarMemories(request,env,url,origin,verifySession);
    if(url.pathname.startsWith('/api/calendar/'))
      return handleCalendarApi(request,env,url,origin,respond,verifySession);
    // Repertoire is separately routed with the existing session and D1 grants.
    if(url.pathname.startsWith('/api/repertoire/')){
      const response=await handleRepertoireApi(request,env,url,origin,respond,verifySession);
      // Successful authenticated Admin writes invalidate all subscribers via existing DO.
      if(request.method!=='GET'&&url.pathname.startsWith('/api/repertoire/admin/')&&response.ok)
        ctx.waitUntil(notifyRepertoireClients(env));
      return response;
    }
    // BOOK: independent editorial pages; shares the canonical Worker, D1, R2 and ChatRoom signal.
    if(url.pathname.startsWith('/api/book/'))
      return handleBookApi(request,env,url,origin,verifySession,ctx);
    // Familia HAVANA NICE: private team albums and original R2 media.
    if(url.pathname.startsWith('/api/family/'))
      return handleFamilyApi(request,env,url,origin,respond,verifySession,ctx);
    // One R2 API for Chat originals; real access requires existing member/Admin auth.
    if(url.pathname.startsWith('/api/chat/media/')){
      const match=/^\/api\/chat\/media\/([0-9a-f-]{36})\/(file|poster)$/.exec(url.pathname);
      if(match&&request.method==='GET')return readChatMedia(request,env,match[1],url,origin,match[2]==='poster');
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
