// HAVANA NICE V2: one platform-neutral Chat session/reconnect policy.
// A single owner per client still controls its socket, lifecycle and timers.
import type {ChatSession} from './index';

export const CHAT_RECONNECT_MAX_DELAY_MS=20_000;
// Abort only handshakes that never open. Existing retry owns every reconnection.
export const CHAT_WS_HANDSHAKE_TIMEOUT_MS=9000;
export function chatSessionExpired(session:Pick<ChatSession,'expiresAt'>,now=Date.now()):boolean{
 return Date.parse(session.expiresAt)<=now;
}

// attempt starts at 1, and grows only after a failed connection.
// Keep the existing 1,2,4,8,16,20-second retry sequence exactly.
export function chatReconnectDelay(attempt:number):number{
 return Math.min(CHAT_RECONNECT_MAX_DELAY_MS,1000*2**Math.min(5,attempt-1));
}
