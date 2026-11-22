// HAVANA NICE V2 · one typed Cloudflare environment and Chat D1 row contract.
// Types only: every existing binding and D1 column remains unchanged.
export interface V2Env{
 DB:D1Database;
 CHAT_ROOMS:DurableObjectNamespace;
 CALENDAR_ROOMS:DurableObjectNamespace;
 MEDIA_BUCKET?:R2Bucket;
 HAVANA_ENV?:string;
 V2_ADMIN_LOGIN_MODE?:string;
 V2_ADMIN_LOGIN_SECRET?:string;
 // Push Center secrets are provisioned only in Cloudflare, never in source.
 PUSH_VAPID_PUBLIC_KEY?:string;
 PUSH_VAPID_PRIVATE_KEY?:string;
 FCM_SERVICE_ACCOUNT_JSON?:string;
}
export interface MusicianRow{actor_id:string;display_name:string;username?:string}
export interface ChatMessageRow{
 seq:number;client_message_id:string;sender_id:string;sender_name:string;
 body:string;created_at:string;reply_to_seq:number|null;
 edited_at:string|null;deleted_at:string|null;
}
export interface ReactionRow{message_seq:number;actor_id:string;emoji:string}
export interface ReceiptRow{actor_id:string;display_name:string;last_read_seq:number}
export interface MemberPresence{actorId:string;name:string;enrollmentToken:string}
export type ChatEvent={type:string;[key:string]:unknown};
