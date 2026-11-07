import Storage from 'expo-sqlite/kv-store';
import {type ChatMessage,type ChatSession} from '@havana/shared';

// Private app sandbox in the isolated V2 Android package.
// Persist the currently authorized named Chat session and offline state.
// The server (D1) verifies the token on restoration; local storage alone never grants access.
export interface NativeLocalChat {
  session: ChatSession;
  outbox: ChatMessage[];
  draft?: string;
  // Preserve the target of an interrupted edit, not just the edited text.
  editing?: ChatMessage | null;
  beforeEdit?: { draft:string; replyTo:ChatMessage|null } | null;
}
// Persistent storage identifier shared with installed Android 0.0.10. Do not
// rename for cleanup: it would orphan the existing session, drafts and outbox.
const KEY = 'havana-v2-chat-local-v1';

export async function loadNativeLocalChat(): Promise<NativeLocalChat | null> {
  const raw = await Storage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as NativeLocalChat;
    if (!data?.session?.token || !Array.isArray(data.outbox)) return null;
    return data;
  } catch { return null; }
}
export async function saveNativeLocalChat(value: NativeLocalChat | null): Promise<void> {
  if (!value) await Storage.removeItem(KEY);
  else await Storage.setItem(KEY, JSON.stringify(value));
}

