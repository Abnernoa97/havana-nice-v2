// HAVANA NICE V2 · one member-session verification for Worker routes and ChatRoom.
// Never accept URL credentials or bypass the single-installation owner.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import type {V2Env,ChatMessageRow} from '../../shared/worker-types.js';

export async function verifySession(env: V2Env, token: unknown) {
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
export function websocketSessionToken(request: Request) {
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

export function mapMessage(row: ChatMessageRow) {
  return {seq:row.seq,clientMessageId:row.client_message_id,senderId:row.sender_id,senderName:row.sender_name,text:row.deleted_at?'':row.body,sentAt:row.created_at,replyToSeq:row.reply_to_seq??null,editedAt:row.edited_at??null,deletedAt:row.deleted_at??null};
}

