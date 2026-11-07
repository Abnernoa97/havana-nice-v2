import {type ChatMessage,type ChatSession} from '@havana/shared';

export interface LocalChatState {
  session: ChatSession;
  outbox: ChatMessage[];
  draft?: string;
  // Preserve the target of an interrupted edit, not just the edited text.
  editing?: ChatMessage | null;
  beforeEdit?: { draft:string; replyTo:ChatMessage|null } | null;
}
// Existing IndexedDB name intentionally retained for already-installed PWAs.
// Renaming it without a tested data migration would strand sessions/drafts.
const DB = 'havana-nice-v2-lab';
const STORE = 'chat';
const KEY = 'offline-outbox-v1';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadLocalChat(): Promise<LocalChatState | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function saveLocalChat(value: LocalChatState | null): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value) tx.objectStore(STORE).put(value, KEY);
      else tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

