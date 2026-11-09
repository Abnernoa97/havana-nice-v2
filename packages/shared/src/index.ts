import {HAVANA_V2_DEV_API_BASE_URL} from './api-base';
export {HAVANA_V2_DEV_API_BASE_URL} from './api-base';

export interface BackendHealth {
  ok: boolean;
  app: string;
  environment: string;
  database: string;
  schemaVersion: string | null;
  realtime: string;
  media: string;
}

export async function fetchBackendHealth(
  apiBaseUrl = HAVANA_V2_DEV_API_BASE_URL,
): Promise<BackendHealth> {
  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json() as Promise<BackendHealth>;
}

/** CHAT 1 — shared contract across Android and iPhone PWA (V2 only). */
export interface ChatSession {
  token: string;
  actorId: string;
  displayName: string;
  expiresAt: string;
}

export interface ChatMessage {
  seq: number;
  clientMessageId: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
  media?: {assetId:string;kind:'photo'|'video';mimeType:string;sizeBytes:number;name:string}|null;
  pending?: boolean;
  failed?: boolean;
  deliveryStatus?: 'queued' | 'sending' | 'error' | 'sent';
  replyToSeq?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export type ChatServerEvent =
  | { type: 'chat.ready'; at: string; users?: ChatOnlineUser[] }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'chat.error'; error: string }
  | { type: 'chat.revoked'; error: string }
  | { type: 'chat.presence'; users: ChatOnlineUser[] }
  | { type: 'chat.typing'; actorId: string; senderName: string; active: boolean; expiresAt: number }
  | { type: 'chat.reaction'; messageSeq: number; actorId: string; emoji: ChatEmoji; active: boolean }
  | { type:'chat.updated'; message: ChatMessage }
  | { type:'chat.deleted'; seq:number }
  | { type:'chat.read'; actorId:string; displayName:string; seq:number };

export type ChatEmoji = '❤️' | '😂' | '👍';
export interface ChatOnlineUser { actorId: string; displayName: string }
export interface ChatReaction { messageSeq: number; actorId: string; emoji: ChatEmoji }
export interface ChatReadReceipt { actorId: string;displayName:string;seq:number }
export interface ChatSnapshot { messages: ChatMessage[]; reactions: ChatReaction[]; receipts:ChatReadReceipt[]; hasMore: boolean }

export function lastReadByOther(reads:ChatReadReceipt[],ownActor:string):number {
  return Math.max(0,...reads.filter(r=>r.actorId!==ownActor).map(r=>r.seq));
}
export async function getOlderChatMessages(session:ChatSession,beforeSeq:number,base=HAVANA_V2_DEV_API_BASE_URL):Promise<ChatSnapshot>{
  const result=await fetch(`${base}/api/chat/messages?beforeSeq=${encodeURIComponent(String(beforeSeq))}`,{
    headers:{Authorization:`Bearer ${session.token}`},
  });
  const data=await result.json() as ChatSnapshot & {error?:string};
  if(!result.ok)throw new Error(data.error||'No se pudo cargar más mensajes');
  return {...data,messages:data.messages||[],reactions:data.reactions||[],receipts:data.receipts||[]};
}
export async function searchChatMessages(session:ChatSession,query:string,base=HAVANA_V2_DEV_API_BASE_URL):Promise<ChatMessage[]>{
  const result=await fetch(`${base}/api/chat/messages?search=${encodeURIComponent(query)}`,{
    headers:{Authorization:`Bearer ${session.token}`},
  });
  const data=await result.json() as ChatSnapshot & {error?:string};
  if(!result.ok)throw new Error(data.error||'No se pudo buscar');
  return data.messages||[];
}

export async function getChatSnapshot(session: ChatSession, apiBaseUrl = HAVANA_V2_DEV_API_BASE_URL): Promise<ChatSnapshot> {
  const response = await fetch(`${apiBaseUrl}/api/chat/messages`, { headers: { Authorization: `Bearer ${session.token}` } });
  const data = await response.json() as ChatSnapshot & {error?: string};
  if (!response.ok) throw new Error(data.error || 'Cannot load chat snapshot');
  return { messages: data.messages || [], reactions: data.reactions || [], receipts:data.receipts||[], hasMore: !!data.hasMore };
}

export async function startNamedChatSession(
  displayName: string,
  apiBaseUrl = HAVANA_V2_DEV_API_BASE_URL,
): Promise<ChatSession> {
  const response = await fetch(`${apiBaseUrl}/api/chat/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  const data = await response.json() as ChatSession & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Could not join the lab chat');
  return data;
}

export async function restoreNamedChatSession(
  saved: ChatSession,
  apiBaseUrl = HAVANA_V2_DEV_API_BASE_URL,
): Promise<ChatSession | null> {
  const response = await fetch(`${apiBaseUrl}/api/chat/session`, {
    headers: { Authorization: `Bearer ${saved.token}` },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Session validation failed: ${response.status}`);
  return response.json() as Promise<ChatSession>;
}

export function openChatSocket(session: ChatSession): WebSocket {
  const base = HAVANA_V2_DEV_API_BASE_URL.replace(/^http/, 'ws');
  return new WebSocket(`${base}/ws`, ['havana-v2', `session.${session.token}`]);
}

export function messageDeliveryLabel(message: ChatMessage): string {
  if (!message.pending) return 'enviado';
  if (message.deliveryStatus === 'error' || message.failed) return 'error · reintentar';
  if (message.deliveryStatus === 'sending') return 'enviando…';
  return 'en cola';
}

export function newClientMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

/** One authenticated availability check shared by native Android and the PWA.
 * Never cache a status tied to a private member session.
 * R2 availability is determined by the Worker, not by the client UI.
 */
export async function getChatMediaAvailability(session:ChatSession,base=HAVANA_V2_DEV_API_BASE_URL):Promise<boolean>{
 const response=await fetch(base+'/api/chat/media/status',{
  cache:'no-store',headers:{Authorization:'Bearer '+session.token}
 });
 if(!response.ok)return false;
 const status=await response.json() as {enabled?:unknown};
 return status.enabled===true;
}

// M01/M02: one selection policy shared by the PWA and native Chat.
// Photos and videos share one original-file contract; runtime Worker gates enforce rollout.
// One send may contain at most five ORIGINAL files in any photo/video mix.
export const CHAT_MEDIA_MAX_PER_SEND=5 as const;
export type ChatMediaKind='photo'|'video';
export type ChatMediaSource='gallery'|'camera';
export type ChatMediaSelection={kind:ChatMediaKind;source:ChatMediaSource;
 name:string;mimeType:string;sizeBytes:number;uri:string};
export const CHAT_MEDIA_LIMITS={
 photo:{maxBytes:100*1024*1024,mimes:['image/jpeg','image/png','image/webp','image/heic','image/heif']},
 video:{maxBytes:9_500_000_000,mimes:['video/mp4','video/quicktime']}
} as const;
export function validateChatMediaSelection(
 item:Pick<ChatMediaSelection,'kind'|'name'|'mimeType'|'sizeBytes'>
):string|null{
 const rule=CHAT_MEDIA_LIMITS[item.kind];
 if(!rule)return 'Solo se admiten fotografías y videos.';
 if(typeof item.name!=='string'||!item.name.trim()||item.name.length>180||
    /[\\/\x00-\x1f\x7f]/.test(item.name))return 'Nombre de archivo no válido.';
 if(typeof item.mimeType!=='string'||!(rule.mimes as readonly string[]).includes(item.mimeType.toLowerCase()))
  return 'Formato de archivo no admitido.';
 if(!Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<=0||item.sizeBytes>rule.maxBytes)
  return 'El archivo está vacío o supera el límite permitido.';
 return null;
}

export {CalendarHttpError,getCalendarEvents,calendarDate,safeCalendarMapUrl,calendarEventCompleted,calendarMemoryUrl,getCalendarMemories,addCalendarMemory,addCalendarMemoryWebp,deleteCalendarMemory,moveCalendarMemory} from './calendar';
export type {CalendarEvent,CalendarEventInput,CalendarEventList,CalendarEventStatus,CalendarMemoryPhoto,CalendarMemoryList} from './calendar';

export {MEMBER_MODULES} from './memberModules';
export {getMusicianDirectory} from './musicians';
export type {MusicianDirectoryEntry} from './musicians';
export type {MemberModule,MemberScreen} from './memberModules';

export {getRepertoireSongs,getEventRepertoire,getAssignedEventRepertoire,safeRepertoireLink} from './repertoire';
export type {RepertoireSong,RepertoireSongInput,RepertoireEventItem} from './repertoire';

export {getFamilyDirectory,getFamilyAlbumMedia,uploadFamilyAlbumFile,uploadFamilyVideoPoster,updateFamilyAlbumFile,familyAlbumCount,FamilyApiError} from './family';
export type {FamilyAlbum,FamilyDirectory,FamilyMediaItem} from './family';

// Realtime Familia invalidation only; media remains private via existing REST grants.
export {openFamilyRealtime,FAMILY_WS_HANDSHAKE_TIMEOUT_MS} from './family-realtime';
export type {FamilyRealtimeEvent} from './family-realtime';

// One chat context-menu permissions and geometry policy for PWA and Android.
export {getChatMenuState,getChatMessagePermissions,isWithinChatEditWindow,isWithinChatDeleteWindow,CHAT_EDIT_WINDOW_MS,CHAT_DELETE_WINDOW_MS} from './chat-menu';
export type {ChatMenuAnchor,ChatMenuMessage,ChatMenuViewport} from './chat-menu';

// Shared progress and partial-failure semantics for original-quality PWA/native Chat uploads.
export {uploadChatMediaBatch} from './chat-media-batch';
export type {ChatMediaBatchOptions} from './chat-media-batch';

// One bounded emoji-particle motion policy for iPad/iPhone PWA and Android native.
export {makeChatReactionParticles,CHAT_REACTION_BURST_WAVES,CHAT_REACTION_BURST_WAVE_GAP_MS,CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES} from './chat-reaction-burst';
export type {ChatReactionParticle} from './chat-reaction-burst';

// One pure cross-platform reaction and typing event policy; shells own their sockets.
export {chatReactionPayload,chatTypingPayload,chatReadReceiptPayload,CHAT_TYPING_THROTTLE_MS} from './chat-presence';

// Shared ordered offline outbox and ACK policy for both Chat clients.
export {selectNextQueuedChatMessage,setOutgoingChatStatus,projectOutgoingChatStatus,CHAT_ACK_TIMEOUT_MS} from './chat-outbox';
export type {ChatOutboxState} from './chat-outbox';
export {clearChatAckTimer,pauseChatOutbox,confirmChatOutgoingMessage,flushChatOutbox} from './chat-outbox-delivery';

// One shared decision for online validation, offline restoration and revocation.
export {recoverChatAccess} from './chat-session-recovery';
export type {ChatAccessRecovery} from './chat-session-recovery';

// Preserve one offline-capable Chat session expiry and reconnect backoff policy.
export {chatSessionExpired,chatReconnectDelay,CHAT_RECONNECT_MAX_DELAY_MS,CHAT_WS_HANDSHAKE_TIMEOUT_MS} from './chat-connection';
export {ChatConnectionTimers} from './chat-connection-timers';

// Both Chat WebSocket event handlers use these exact reconciliation projections.
export {reconcileChatReadReceipt,removeChatReactionsForMessage} from './chat-events';
export {reconcileUpdatedMessage,reconcileDeletedMessage,reconcileChatSnapshot,reconcileReactions,reconcileChatMessages} from './chat-events';
export {applyChatIncomingEvent} from './chat-incoming';
export type {ChatIncomingEffects} from './chat-incoming';
export {withoutRemovedChatMessages} from './chat-events';
export {ChatHistoryRequestGate,oldestConfirmedChatSeq,mergeOlderChatReactions} from './chat-history';

// One offline snapshot format: existing IndexedDB/SQLite keys remain unchanged.
export {captureChatOfflineSnapshot,restoreChatOfflineOutbox} from './chat-offline';
export type {ChatOfflineSnapshot} from './chat-offline';

// One linear-cost rendering index for replies, reactions and read receipts.
export {buildChatDisplayIndex} from './chat-display';
export type {ChatDisplayIndex,ChatReactionBadge} from './chat-display';

export {getBookPages,uploadBookPage,uploadBookOptimized,updateBookPage,removeBookPage,bookMediaUrl,BookApiError,BOOK_GRANT_RENEW_MS} from './book';
export type {BookPage,BookDirectory} from './book';
export {pwaReaderUrl,parsePwaReaderHash} from './book-route';
export type {PwaReaderTarget} from './book-route';
