import { useEffect, useRef, useState } from 'react';
import {
  fetchBackendHealth, getChatMediaAvailability, getChatSnapshot, getOlderChatMessages, searchChatMessages, lastReadByOther, messageDeliveryLabel, newClientMessageId,
  openChatSocket, reconcileChatMessages, startNamedChatSession, restoreNamedChatSession,
  type BackendHealth, type ChatMessage, type ChatServerEvent, type ChatSession,
  validateChatMediaSelection, CHAT_MEDIA_MAX_PER_SEND, HAVANA_V2_DEV_API_BASE_URL, type ChatMediaSelection, type ChatMediaKind, type ChatMediaSource,
  reconcileReactions, reconcileUpdatedMessage, reconcileDeletedMessage, reconcileChatSnapshot, type ChatReaction, type ChatEmoji, type ChatReadReceipt, type MemberScreen,
} from '@havana/shared';
import { loadLocalChat, saveLocalChat } from '../services/local';
import SwipeMessage, {type MessageAnchor} from '../features/chat/SwipeMessage';
import ComposerIcon from '../features/chat/ChatComposerIcon';
import ChatMediaView from '../features/chat/ChatMediaView';
import {uploadChatFile} from '../services/chat-media-upload';
import VisualApp from './VisualApp';

type PwaQueuedMedia={id:string;file:File;selection:ChatMediaSelection};

export default function App() {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [name, setName] = useState('');
  const [session, setSession] = useState<ChatSession | null>(null);
  // Existing approved ChatSession is the APP access; HOME adds no login or storage.
  const [activeScreen,setActiveScreen]=useState<MemberScreen>('home');
  const [restoringAccess,setRestoringAccess] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerPanel,setComposerPanel]=useState<'attachments'|'emojis'|null>(null);
  const [selectedMedia,setSelectedMedia]=useState<PwaQueuedMedia[]>([]);
  const [mediaError,setMediaError]=useState('');
  const mediaQueue=useRef<PwaQueuedMedia[]>([]);
  const [mediaReady,setMediaReady]=useState(false);
  const [mediaUploading,setMediaUploading]=useState(false);
  const mediaUploadBusy=useRef(false);
  const [mediaProgress,setMediaProgress]=useState(0);
  const photosPicker=useRef<HTMLInputElement|null>(null);
  const videoPicker=useRef<HTMLInputElement|null>(null);
  const cameraPicker=useRef<HTMLInputElement|null>(null);
  const [connection, setConnection] = useState('desconectado');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [typing, setTyping] = useState('');
  const [receipts, setReceipts] = useState<ChatReadReceipt[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen,setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menuMessage,setMenuMessage] = useState<ChatMessage | null>(null);
  const [menuAnchor,setMenuAnchor] = useState<MessageAnchor|null>(null);
  const socket = useRef<WebSocket | null>(null);
  const removedSeq = useRef<Set<number>>(new Set());
  const activeSession = useRef<ChatSession | null>(null);
  const outbox = useRef<Map<string, ChatMessage>>(new Map());
  const ackTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const disposed = useRef(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const scrollOlderOnce=useRef(false);
  const typingLast = useRef(0);
  const removeSelectedMedia=(id:string)=>{
    
    const removed=mediaQueue.current.find(x=>x.id===id);
    if(removed)URL.revokeObjectURL(removed.selection.uri);
    mediaQueue.current=mediaQueue.current.filter(x=>x.id!==id);
    
    setSelectedMedia([...mediaQueue.current]);setMediaError('');
  };
  const openGalleryMedia=(kind:ChatMediaKind)=>{
    setComposerPanel(null);setMediaError('');
    
    if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
      setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
    }
    (kind==='photo'?photosPicker:videoPicker).current?.click();
  };
  const openCamera=()=>{
    setComposerPanel(null);setMediaError('');
    
    if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
      setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
    }
    cameraPicker.current?.click();
  };
  const chooseMedia=(source:ChatMediaSource,kind:ChatMediaKind,files:File[])=>{
    if(!files.length)return;
    if(mediaQueue.current.length+files.length>CHAT_MEDIA_MAX_PER_SEND){
      setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
    }
    for(const file of files){
      const issue=validateChatMediaSelection({kind,name:file.name,
        mimeType:file.type.toLowerCase(),sizeBytes:file.size});
      if(issue){setMediaError(file.name+': '+issue);return;}
    }
    const additions=files.map(file=>{
      const uri=URL.createObjectURL(file);
      return {id:crypto.randomUUID(),file,
        selection:{kind,source,uri,name:file.name,
          mimeType:file.type.toLowerCase(),sizeBytes:file.size}} as PwaQueuedMedia;
    });
    mediaQueue.current=[...mediaQueue.current,...additions];
    setSelectedMedia([...mediaQueue.current]);setMediaError('');
  };
  useEffect(()=>{
    if(!session){setMediaReady(false);return;}
    let live=true;
    void getChatMediaAvailability(session).then(enabled=>{
      if(live)setMediaReady(enabled);
    }).catch(()=>{if(live)setMediaReady(false);});
    return()=>{live=false;};
  },[session?.token]);
  async function sendSelectedMedia(){
    if(!session||!mediaQueue.current.length||mediaUploadBusy.current)return;
    if(!mediaReady){setMediaError('R2 todavía no está disponible.');return;}
    mediaUploadBusy.current=true;setMediaUploading(true);setMediaError('');setMediaProgress(0);
    // Same successful Familia transport, sequential files with 3 parallel parts per video.
    // Never clear a failed file: tapping Enviar resumes its own R2 upload ID.
    try{
      const total=mediaQueue.current.reduce((sum,item)=>sum+item.file.size,0);
      let completed=0;
      for(const item of [...mediaQueue.current]){
        await uploadChatFile(session,item.file,item.selection.kind,(sent)=>{
          setMediaProgress(Math.round(100*Math.min(total,completed+sent)/total));
        });
        completed+=item.file.size;
        URL.revokeObjectURL(item.selection.uri);
        mediaQueue.current=mediaQueue.current.filter(x=>x.id!==item.id);
        setSelectedMedia([...mediaQueue.current]);
      }
      setMediaProgress(100);
      // The server broadcasts only confirmed media messages in the existing ChatRoom.
      if(activeSession.current)refreshLatest.current();
    }catch(e){
      setMediaError(e instanceof Error?e.message:'La subida se interrumpió. Reintenta los archivos restantes.');
    }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
  }
  const insertEmoji=(emoji:string)=>{
    if(editing&&savingEdit)return;
    if(draft.length+emoji.length<=2000)typeText(draft+emoji);
    setComposerPanel(null);
  };
  useEffect(()=>()=>{for(const item of mediaQueue.current)URL.revokeObjectURL(item.selection.uri);},[]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const latestDraft = useRef('');
  const restoredStorage = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // C02: preserve the previous composer draft and wait for the server update.
  const beforeEdit = useRef<{draft:string;replyTo:ChatMessage|null}|null>(null);
  const editingSnapshot = useRef<ChatMessage|null>(null);
  const editPending = useRef<{seq:number;text:string}|null>(null);
  const editTimeout = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [savingEdit,setSavingEdit] = useState(false);
  const connectLatest = useRef<(next: ChatSession) => void>(() => {});
  const refreshLatest = useRef<() => void>(() => {});

  function revokeCurrentAccess() {
    setActiveScreen('home');
    const previous = socket.current;
    socket.current = null;
    previous?.close();
    clearRetry();
    activeSession.current = null;
    outbox.current.clear();
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    setMessages([]);
    setSession(null);
    setName('');
    setConnection('desconectado');
    setError('Acceso revocado. Consulta al administrador.');
    void saveLocalChat(null);
  }

  function persist() {
    if (!restoredStorage.current) return;
    const value = activeSession.current ? {
      session: activeSession.current,
      outbox: [...outbox.current.values()].map(m => ({...m, deliveryStatus:'queued' as const, pending:true})),
      draft: latestDraft.current,
      editing: editingSnapshot.current,
      beforeEdit: beforeEdit.current,
    } : null;
    storageQueue.current = storageQueue.current.catch(() => {}).then(() => saveLocalChat(value)).catch(() => {});
  }
  function sendReadReceipt(seq: number) {
    if (seq > 0 && document.visibilityState === 'visible' && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({type:'chat.read',seq}));
    }
  }
  async function loadOlder() {
    if (!session || !hasMore || loadingOlder || !messages.length) return;
    const oldest = Math.min(...messages.filter(m=>m.seq>0).map(m=>m.seq));
    if (!Number.isFinite(oldest)) return;
    setLoadingOlder(true);
    scrollOlderOnce.current=true;
    try {
      const data=await getOlderChatMessages(session,oldest);
      setMessages(prev=>reconcileChatMessages(prev,data.messages.filter(m=>!removedSeq.current.has(m.seq))));
      setHasMore(data.hasMore);
      setReactions(prev=>[...data.reactions.filter(x=>!prev.some(y=>y.messageSeq===x.messageSeq&&y.actorId===x.actorId&&y.emoji===x.emoji)),...prev]);
    } catch(e) { setError(e instanceof Error?e.message:'No se pudo cargar más mensajes'); }
    finally { setLoadingOlder(false); }
  }
  async function runSearch() {
    if(!session || searchQuery.trim().length < 2) {setSearchResults(null);return;}
    setSearching(true);
    try {setSearchResults(await searchChatMessages(session,searchQuery.trim()));}
    catch(e){setError(e instanceof Error?e.message:'Error de búsqueda');}
    finally {setSearching(false);}
  }

  function resetEditTimeout(){
    if(editTimeout.current){clearTimeout(editTimeout.current);editTimeout.current=null;}
  }
  function finishEditing(){
    resetEditTimeout();
    editPending.current=null;
    setSavingEdit(false);
    setEditing(null);
    const previous=beforeEdit.current;
    beforeEdit.current=null;
    editingSnapshot.current=null;
    latestDraft.current=previous?.draft??'';
    setDraft(latestDraft.current);
    setReplyTo(previous?.replyTo??null);
    setError('');
    persist();
  }
  function abandonPendingEdit(reason:string){
    if(!editPending.current)return;
    editPending.current=null;
    resetEditTimeout();
    setSavingEdit(false);
    setError(reason);
    // Editing text stays in the composer for an explicit retry or cancel.
  }
  function replyToMessage(message:ChatMessage){
    if(message.seq<1||message.deletedAt)return;
    setMenuMessage(null);setEditing(null);setReplyTo(message);
  }
  function showMessageMenu(message:ChatMessage,anchor:MessageAnchor){
    // No reactions or privileged actions before the server has accepted a message.
    if(message.seq<=0 || message.deletedAt)return;
    setMenuAnchor(anchor);
    setMenuMessage(message);
  }
  function updateOwn(message: ChatMessage, deleting = false) {
    if(message.senderId!==session?.actorId || message.seq<1 || message.deletedAt || connection!=='en vivo') return;
    if (Date.now()-Date.parse(message.sentAt)>(deleting?48*60*60*1000:15*60*1000)) {
      setError(deleting?'El plazo para eliminar terminó':'Solo puedes editar durante 15 minutos');return;
    }
    if(!deleting){
      if(!beforeEdit.current)beforeEdit.current={draft,replyTo};
      editingSnapshot.current=message;
      latestDraft.current=message.text;
      setReplyTo(null);setEditing(message);setDraft(message.text);setError('');
      persist();
      return;
    }
    setError('');
    const ws=socket.current;
    if(ws?.readyState!==WebSocket.OPEN){
      setError('No se pudo borrar: sin conexión. Reintenta cuando vuelva Internet.');
      return;
    }
    try{ws.send(JSON.stringify({type:'chat.delete',seq:message.seq}));}
    catch{setError('No se pudo borrar. Reintenta cuando vuelva Internet.');}
  }
  function clearAck(id: string) {
    const t = ackTimers.current.get(id);
    if (t) clearTimeout(t);
    ackTimers.current.delete(id);
  }
  function markOutgoing(id: string, state: 'queued' | 'sending' | 'error') {
    const original = outbox.current.get(id);
    if (!original) return;
    outbox.current.set(id, { ...original, deliveryStatus: state, failed: state === 'error' });
    persist();
    setMessages(before => before.map(m =>
      m.clientMessageId === id && m.senderId === original.senderId && m.pending
        ? { ...m, deliveryStatus: state, failed: state === 'error' } : m
    ));
  }
  function confirm(message: ChatMessage) {
    if (!message.pending && message.senderId === activeSession.current?.actorId) {
      outbox.current.delete(message.clientMessageId);
      clearAck(message.clientMessageId);
      persist();
    }
  }
  function pausePending() {
    for (const timer of ackTimers.current.values()) clearTimeout(timer);
    ackTimers.current.clear();
    for (const id of outbox.current.keys()) markOutgoing(id, 'queued');
  }
  function clearRetry() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }
  function flushOutbox() {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const batch = [...outbox.current.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    // Send one at a time to preserve creation order even with slow D1 ACKs.
    if (batch.some(item => item.deliveryStatus === 'sending')) return;
    const item = batch[0];
    if (!item || item.deliveryStatus !== 'queued') return;
    {
      try {
        ws.send(JSON.stringify({ type: 'chat.send', clientMessageId: item.clientMessageId, text: item.text, replyToSeq: item.replyToSeq || null }));
        markOutgoing(item.clientMessageId, 'sending');
        clearAck(item.clientMessageId);
        ackTimers.current.set(item.clientMessageId, setTimeout(() => {
          ackTimers.current.delete(item.clientMessageId);
          markOutgoing(item.clientMessageId, 'error');
        }, 12000));
      } catch {
        markOutgoing(item.clientMessageId, 'error');
      }
    }
  }
  function refresh(next: ChatSession) {
    void getChatSnapshot(next).then(({messages:history,reactions:reactionHistory,receipts:readHistory,hasMore:more}) => {
      if (disposed.current || activeSession.current?.actorId !== next.actorId) return;
      history.forEach(confirm);
      setReactions(reactionHistory);
      setReceipts(readHistory);
      setHasMore(more);
      setMessages(before => reconcileChatSnapshot(before,history.filter(m=>!removedSeq.current.has(m.seq))));
      sendReadReceipt(Math.max(0,...history.map(m=>m.seq)));
      flushOutbox();
    }).catch(e => {
      if (!disposed.current) setError(e instanceof Error ? e.message : 'Error al sincronizar');
      flushOutbox();
    });
  }
  function reconnect(next: ChatSession) {
    if (disposed.current) return;
    if (Date.parse(next.expiresAt) <= Date.now()) {
      clearRetry();
      const old = socket.current;
      socket.current = null;
      old?.close();
      activeSession.current = null;
      setSession(null);
      setConnection('desconectado');
      setError('Tu acceso no está disponible. Escribe tu nombre para volver a solicitar entrada.');
      return;
    }
    activeSession.current = next;
    clearRetry();
    const old = socket.current;
    if (old) pausePending();
    socket.current = null;
    old?.close();
    setConnection('conectando…');
    const ws = openChatSocket(next);
    persist();
    socket.current = ws;
    function retry() {
      if (disposed.current || socket.current !== ws || retryTimer.current ||
          document.visibilityState !== 'visible' || !navigator.onLine) return;
      pausePending();
      retryCount.current++;
      const delay = Math.min(20000, 1000 * 2 ** Math.min(5, retryCount.current - 1));
      setConnection('reconectando…');
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        if (activeSession.current && document.visibilityState === 'visible') {
          connectLatest.current(activeSession.current);
        }
      }, delay);
    }
    ws.onopen = () => {
      if (disposed.current || socket.current !== ws) return;
      retryCount.current = 0;
      clearRetry();
      setConnection('en vivo');
      setError('');
      refresh(next);
    };
    ws.onmessage = event => {
      if (disposed.current || socket.current !== ws) return;
      try {
        const value = JSON.parse(String(event.data)) as ChatServerEvent;
        if (value.type === 'chat.ready') {
          setOnlineUsers(value.users?.length || 1);
        } else if (value.type === 'chat.presence') {
          setOnlineUsers(value.users.length);
        } else if (value.type === 'chat.typing') {
          if (value.actorId !== next.actorId) {
            setTyping(value.active ? `${value.senderName} está escribiendo…` : '');
            if (typingTimer.current) clearTimeout(typingTimer.current);
            if (value.active) typingTimer.current = setTimeout(() => setTyping(''), 4200);
          }
        } else if (value.type === 'chat.updated') {
          setMessages(before=>reconcileUpdatedMessage(before,value.message));
          // Only finish the editor after receiving the server's confirmed update.
          if(editPending.current?.seq===value.message.seq){
            if(!value.message.deletedAt && value.message.text===editPending.current.text)
              finishEditing();
            else abandonPendingEdit('La edición no coincidió con el servidor. Revisa el mensaje antes de reintentar.');
          }
          if(value.message.deletedAt){
            setReactions(before=>before.filter(r=>r.messageSeq!==value.message.seq));
            setMenuMessage(current=>current?.seq===value.message.seq?null:current);
          }
          setError('');
        } else if (value.type === 'chat.deleted') {
          removedSeq.current.add(value.seq);
          setMessages(before=>reconcileDeletedMessage(before,value.seq));
          setSearchResults(before=>before?.filter(m=>m.seq!==value.seq)??null);
          setReactions(before=>before.filter(r=>r.messageSeq!==value.seq));
          setReplyTo(current=>current?.seq===value.seq?null:current);
          setMenuMessage(current=>current?.seq===value.seq?null:current);
          setEditing(current=>current?.seq===value.seq?null:current);
        } else if (value.type === 'chat.read') {
          setReceipts(before=>[
            ...before.filter(r=>r.actorId!==value.actorId),
            {actorId:value.actorId,displayName:value.displayName,seq:Math.max(
              value.seq,before.find(r=>r.actorId===value.actorId)?.seq||0)},
          ]);
        } else if (value.type === 'chat.reaction') {
          setReactions(before => reconcileReactions(before, value));
        } else if (value.type === 'chat.message') {
          confirm(value.message);
          setMessages(before => removedSeq.current.has(value.message.seq)?before:reconcileChatMessages(before, [value.message]));
          sendReadReceipt(value.message.seq);
          flushOutbox();
        } else if (value.type === 'chat.revoked') {
          revokeCurrentAccess();
        } else if (value.type === 'chat.error') {
          abandonPendingEdit(value.error);
          setError(value.error);
        }
      } catch {
        setError('Evento inválido');
      }
    };
    ws.onclose = () => {
      if (disposed.current || socket.current !== ws) return;
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      pausePending();
      setConnection('desconectado');
      retry();
    };
    ws.onerror = () => {
      if (disposed.current || socket.current !== ws) return;
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      setConnection('sin conexión');
      retry();
    };
  }
  connectLatest.current = reconnect;
  refreshLatest.current = () => { if (activeSession.current) refresh(activeSession.current); };

  useEffect(() => {
    disposed.current = false;
    void loadLocalChat().then(async (saved) => {
      if(disposed.current)return;
      if(activeSession.current){restoredStorage.current=true;persist();return;}
      if (!saved || !saved.session || Date.parse(saved.session.expiresAt) <= Date.now()) return;
      let approved:ChatSession | null = saved.session;
      try {approved = await restoreNamedChatSession(saved.session);}
      catch {approved = saved.session;} // Offline: keep local chat pending reconnection
      if(disposed.current)return;
      if(!approved){
        await saveLocalChat(null);
        setName('');
        setError('Acceso no autorizado. Consulta al administrador.');
        return;
      }
      activeSession.current = approved;
      outbox.current = new Map((saved.outbox || []).map(m => [m.clientMessageId,{...m,pending:true,deliveryStatus:'queued' as const}]));
      setMessages([...outbox.current.values()]);
      setSession(approved);
      latestDraft.current = saved.draft || '';
      setDraft(latestDraft.current);
      // An interrupted edit must not be converted silently into a new message.
      if(saved.editing && saved.editing.seq>0 && saved.editing.senderId===approved.actorId && !saved.editing.deletedAt){
        editingSnapshot.current=saved.editing;
        beforeEdit.current=saved.beforeEdit??{draft:'',replyTo:null};
        setEditing(saved.editing);
        setError('Edición recuperada. Puedes continuar o cancelar.');
      } else {
        editingSnapshot.current=null;
        beforeEdit.current=null;
      }
      setName(approved.displayName);
      connectLatest.current(approved);
    }).catch(() => {}).finally(() => {restoredStorage.current=true;setRestoringAccess(false);});
    void fetchBackendHealth().then(data => {
      if (!disposed.current) setHealth(data);
    }).catch(() => { if (!disposed.current) setError('No se pudo conectar a la API'); });
    const resume = () => {
      if(document.visibilityState==='hidden'){persist();return;}
      const next = activeSession.current;
      if (!next || document.visibilityState !== 'visible') return;
      void restoreNamedChatSession(next).then(valid => {
        if(disposed.current || activeSession.current?.token !== next.token)return;
        if(!valid){revokeCurrentAccess();return;}
        if(!socket.current || socket.current.readyState !== WebSocket.OPEN)
          connectLatest.current(valid);
        else refreshLatest.current();
      }).catch(() => {
        if(activeSession.current?.token===next.token && navigator.onLine)
          connectLatest.current(next);
      });
    };
    const offline = () => {
      pausePending();
      setConnection('sin conexión');
      clearRetry();
      const old = socket.current;
      socket.current = null;
      old?.close();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      disposed.current = true;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      clearRetry();
      for (const timer of ackTimers.current.values()) clearTimeout(timer);
      ackTimers.current.clear();
      socket.current?.close();
      socket.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      resetEditTimeout();
    };
  }, []);

  useEffect(() => {
    latestDraft.current = draft;
    if(!restoredStorage.current || !activeSession.current)return;
    if(draftTimer.current)clearTimeout(draftTimer.current);
    draftTimer.current=setTimeout(()=>{draftTimer.current=null;persist();},350);
    return ()=>{if(draftTimer.current)clearTimeout(draftTimer.current);};
  },[draft]);


  useEffect(() => {
    if(scrollOlderOnce.current){scrollOlderOnce.current=false;return;}
    bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length]);

  function acceptApprovedSession(next:ChatSession){
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    setMessages([]);
    setReceipts([]);
    setSearchResults(null);
    setHasMore(false);
    outbox.current.clear();
    setSession(next);
    activeSession.current=next;
    persist();
    retryCount.current=0;
    reconnect(next);
  }
  // The only login: Administrator-created name, one server-linked session.
  async function join(){
    if(!name.trim()||joining)return;
    setJoining(true);setError('');
    try{
      const next=await startNamedChatSession(name.trim());
      acceptApprovedSession(next);
    }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo entrar');}
    finally{setJoining(false);}
  }

  function send() {
    const text = draft.trim();
    if(editing){
      if(editPending.current)return;
      if(!text){setError('El mensaje editado no puede quedar vacío.');return;}
      if(text===editing.text){finishEditing();return;}
      if(Date.now()-Date.parse(editing.sentAt)>15*60*1000){
        setError('El plazo de edición de 15 minutos terminó. El texto sigue aquí para copiarlo.');
        return;
      }
      const ws=socket.current;
      if(connection!=='en vivo'||ws?.readyState!==WebSocket.OPEN){
        setError('Sin conexión. No se perdió el texto editado; reintenta cuando vuelva Internet.');
        return;
      }
      editPending.current={seq:editing.seq,text};
      setSavingEdit(true);
      try{
        ws.send(JSON.stringify({type:'chat.edit',seq:editing.seq,text}));
        resetEditTimeout();
        editTimeout.current=setTimeout(()=>{
          abandonPendingEdit('No se confirmó la edición. Comprueba el mensaje y reintenta.');
        },10000);
        setError('');
      }catch{
        abandonPendingEdit('Error de conexión. El texto editado sigue disponible.');
      }
      return;
    }
    if (!session || !text) return;
    if (outbox.current.size >= 100) {
      setError('La cola está llena. Reintenta cuando tengas conexión.');
      return;
    }
    const clientMessageId = newClientMessageId();
    const message: ChatMessage = {
      seq: 0, clientMessageId, senderId: session.actorId, senderName: session.displayName,
      text, sentAt: new Date().toISOString(), pending: true, deliveryStatus: 'queued', replyToSeq: replyTo?.seq || null,
    };
    outbox.current.set(clientMessageId, message);
    persist();
    setReplyTo(null);
    setMessages(before => reconcileChatMessages(before, [message]));
    setDraft('');
    flushOutbox();
  }
  function react(seq: number, emoji: ChatEmoji) {
    if (seq > 0 && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({type:'chat.react',messageSeq:seq,emoji}));
    }
  }
  function typeText(value: string) {
    latestDraft.current=value;
    setDraft(value);
    const now = Date.now();
    if (now - typingLast.current > 1700 && socket.current?.readyState === WebSocket.OPEN) {
      typingLast.current = now;
      socket.current.send(JSON.stringify({type:'chat.typing',active:!!value.trim()}));
    }
  }
  function retryMessage(id: string) {
    if (!outbox.current.has(id)) return;
    clearAck(id);
    markOutgoing(id, 'queued');
    flushOutbox();
  }

  // The context menu follows the held bubble. Keep it inside the visual
  // viewport so keyboard, notch and small-screen scrolling do not hide actions.
  const menuWidth=Math.min(290,Math.max(180,window.innerWidth-24));
  const menuOwn=!!menuMessage && menuMessage.senderId===session?.actorId && !menuMessage.pending;
  const menuAge=menuMessage?Date.now()-Date.parse(menuMessage.sentAt):Infinity;
  const canEdit=menuOwn && connection==='en vivo' && menuAge<15*60*1000;
  const canDelete=menuOwn && connection==='en vivo' && menuAge<48*60*60*1000;
  const visibleTop=window.visualViewport?.offsetTop??0;
  const visibleHeight=window.visualViewport?.height??window.innerHeight;
  const menuHeight=122;
  const preferredTop=menuAnchor && menuAnchor.y>visibleTop+menuHeight+16
    ? menuAnchor.y-menuHeight-8
    : (menuAnchor?.y??(visibleTop+(visibleHeight-menuHeight)/2))+(menuAnchor?.height??0)+8;
  const menuTop=Math.max(visibleTop+10,
    Math.min(preferredTop,visibleTop+visibleHeight-menuHeight-10));
  const preferredLeft=menuAnchor
    ? (menuOwn ? menuAnchor.x+menuAnchor.width-menuWidth : menuAnchor.x)
    : (window.innerWidth-menuWidth)/2;
  const menuLeft=Math.max(12,Math.min(preferredLeft,window.innerWidth-menuWidth-12));

  return (
    <>
      {session&&activeScreen!=='chat'&&<VisualApp displayName={session.displayName}
        active={activeScreen} token={session.token} onNavigate={setActiveScreen}/>}
      <div className={session&&activeScreen!=='chat'?'member-chat-hidden':'member-chat-visible'}>
    <main className="chat-app">
      <header className="chat-header">
        <div>
          <span className="brand">HAVANA NICE</span>
          <h1>Chat <span>V2</span></h1>
        </div>
        <div className="header-actions">
          <div className="header-status">
            <span className={connection === 'en vivo' ? 'online-dot' : 'offline-dot'} />
            {session ? `${connection}${connection === 'en vivo' ? ` · ${onlineUsers} en línea` : ''}` : health?.ok ? 'API conectada' : 'Laboratorio'}
          </div>
          {session&&<button type="button" className="search-toggle" aria-label="Volver a Inicio"
            onClick={()=>setActiveScreen('home')}>‹ Inicio</button>}
          {session&&<button className="search-toggle" type="button" aria-label="Buscar mensajes"
            aria-expanded={searchOpen} onClick={()=>{
              setSearchOpen(open=>!open);setSearchResults(null);setSearchQuery('');
            }}>{searchOpen?'Cerrar':'Buscar'}</button>}
        </div>
      </header>

      {restoringAccess ? <section className="join-panel"><p>Abriendo HAVANA NICE…</p></section> : !session ? (
        <section className="join-panel">
          <span className="overline">ACCESO HAVANA NICE</span>
          <h2>Bienvenido.</h2>
          <p>Introduce el nombre que el Administrador creó y autorizó para ti. Entrarás a Inicio.</p>
          <form onSubmit={event => { event.preventDefault(); void join(); }}>
            <label htmlFor="chat-name">Tu nombre</label>
            <input id="chat-name" maxLength={28} autoComplete="nickname" autoCapitalize="none" value={name} onChange={event => setName(event.target.value)} placeholder="Tu nombre" />
            <button type="submit" disabled={joining || !name.trim()}>{joining ? 'Comprobando acceso…' : 'Continuar'}</button>
          </form>
          {error && <p className="chat-error" role="alert">{error}</p>}
          <small>Si tu nombre no está registrado por el Administrador, no podrás entrar.</small>
        </section>
      ) : (
        <>
          {searchOpen&&<div className="chat-search">
            <input aria-label="Buscar en el chat" placeholder="Buscar mensajes…" value={searchQuery}
              onChange={e=>{setSearchQuery(e.target.value);if(!e.target.value.trim())setSearchResults(null);}}
              onKeyDown={e=>{if(e.key==='Enter')void runSearch();}}/>
            <button type="button" disabled={searching||searchQuery.trim().length<2} onClick={()=>void runSearch()}>{searching?'…':'Buscar'}</button>
            {searchResults&&<button type="button" onClick={()=>{setSearchResults(null);setSearchQuery('');}}>Cerrar</button>}
          </div>}
          <section className="chat-messages" aria-label="Mensajes">
            {searchResults===null&&hasMore&&<button type="button" className="load-older" disabled={loadingOlder}
              onClick={()=>void loadOlder()}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</button>}
            {searchResults!==null&&<p className="search-count">{searchResults.length} resultado(s) en historial</p>}
            {messages.length === 0 && <p className="empty-chat">¡Hola! Escribe el primer mensaje.</p>}
            {(searchResults??messages).filter(message=>!message.deletedAt).map(message => {
              const mine = message.senderId === session.actorId;
              return <SwipeMessage className={mine?'bubble mine':'bubble theirs'}
                key={message.senderId+':'+message.clientMessageId}
                onSwipeRight={()=>replyToMessage(message)}
                onLongPress={anchor=>showMessageMenu(message,anchor)}>
                {!mine&&<span className="sender">{message.senderName}</span>}
                {message.replyToSeq&&<div className="reply-original">
                  ↪ {messages.find(m=>m.seq===message.replyToSeq)?.text.slice(0,70)||'Mensaje anterior'}
                </div>}
                {!message.media&&<div>{message.text}</div>}
                 {message.media&&<ChatMediaView media={message.media} token={session.token}/>}
                {message.seq>0&&!message.deletedAt&&reactions.some(r=>r.messageSeq===message.seq)&&
                  <div className="reaction-counts">
                    {(['❤️','😂','👍'] as ChatEmoji[])
                      .filter(emoji=>reactions.some(r=>r.messageSeq===message.seq&&r.emoji===emoji))
                      .map(emoji=><span key={emoji}>{emoji}{reactions.filter(r=>r.messageSeq===message.seq&&r.emoji===emoji).length}</span>)}
                  </div>}
                <span className="message-meta">
                  {new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {message.editedAt&&!message.deletedAt?' · editado':''}
                  {mine?' · '+messageDeliveryLabel(message):''}
                  {mine&&!message.pending&&lastReadByOther(receipts,session.actorId)>=message.seq?' · leído':''}
                </span>
                {mine&&message.pending&&message.deliveryStatus==='error'&&
                  <button type="button" className="retry-message"
                    onClick={()=>retryMessage(message.clientMessageId)}>Reintentar envío</button>}
              </SwipeMessage>;
            })}
            <div ref={bottom} />
          </section>
          {menuMessage&&<div className="message-menu-overlay"
              onClick={()=>setMenuMessage(null)} onKeyDown={event=>{
                if(event.key==='Escape')setMenuMessage(null);
              }}>
            <div className="whatsapp-context" role="dialog" aria-modal="true" tabIndex={-1}
              aria-label="Acciones del mensaje" style={{
                left:menuLeft,top:menuTop,width:menuWidth,
              }} onClick={event=>event.stopPropagation()}>
              <div className="whatsapp-reactions">
                {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
                  <button type="button" key={emoji} aria-label={emoji}
                    aria-pressed={reactions.some(r=>r.messageSeq===menuMessage.seq&&
                      r.actorId===session.actorId&&r.emoji===emoji)}
                    disabled={connection!=='en vivo'}
                    onClick={()=>{react(menuMessage.seq,emoji);setMenuMessage(null);}}>
                    {emoji}
                  </button>)}
              </div>
              <div className="whatsapp-actions">
                <button type="button" onClick={()=>replyToMessage(menuMessage)}>Responder</button>
                {canEdit&&<button type="button" onClick={()=>{
                  const m=menuMessage;setMenuMessage(null);updateOwn(m);
                }}>Editar</button>}
                {canDelete&&<button type="button" className="whatsapp-delete" onClick={()=>{
                  const m=menuMessage;setMenuMessage(null);
                  if(window.confirm('¿Borrar este mensaje para todos?'))updateOwn(m,true);
                }}>Borrar</button>}
              </div>
            </div>
          </div>}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {connection !== 'en vivo' && <button className="reconnect" onClick={() => reconnect(session)}>Reintentar conexión</button>}
          {editing && <div className="reply-preview">Editando mensaje <button type="button" onClick={finishEditing} disabled={savingEdit}>Cancelar</button></div>}
          {replyTo && !editing && <div className="reply-preview">Respondiendo a: {replyTo.text.slice(0,65)} <button type="button" onClick={() => setReplyTo(null)}>Cancelar</button></div>}
          {typing && <div className="chat-typing-indicator" role="status" aria-live="polite">{typing}</div>}
          {composerPanel&&<div className="chat-panel-dismiss" aria-hidden="true"
            onClick={()=>setComposerPanel(null)}/>}
          {composerPanel==='attachments'&&<div className="chat-attachments-popover"
            role="group" aria-label="Adjuntar al chat">
            <button type="button" aria-label="Fotos" onClick={()=>openGalleryMedia('photo')}>
              <span className="chat-attachments-symbol"><ComposerIcon name="photo" size={23}/></span>
              <span>Fotos</span>
            </button>
            <button type="button" aria-label="Video" onClick={()=>openGalleryMedia('video')}>
              <span className="chat-attachments-symbol"><ComposerIcon name="video" size={23}/></span>
              <span>Video</span>
            </button>
          </div>}
          {composerPanel==='emojis'&&<div className="chat-emojis-popover"
            role="group" aria-label="Elegir emoji">
            {['😀','😂','❤️','👍','🥰','🎉','👏','😍'].map(emoji=>
              <button type="button" key={emoji} onClick={()=>insertEmoji(emoji)}
                aria-label={'Insertar '+emoji}>{emoji}</button>)}
          </div>}
          <input className="chat-media-hidden-input" type="file" ref={photosPicker}
            tabIndex={-1} aria-hidden="true" accept="image/*"
            multiple onChange={e=>{chooseMedia('gallery','photo',Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/>
          <input className="chat-media-hidden-input" type="file" ref={videoPicker}
            tabIndex={-1} aria-hidden="true" accept="video/*"
            multiple onChange={e=>{chooseMedia('gallery','video',Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/>
          <input className="chat-media-hidden-input" type="file" ref={cameraPicker}
            tabIndex={-1} aria-hidden="true" accept="image/*" capture="environment"
            onChange={e=>{chooseMedia('camera','photo',Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/>
          {selectedMedia.length>0&&<div aria-label="Archivos para enviar">
            <small>{selectedMedia.length} de {CHAT_MEDIA_MAX_PER_SEND} archivos · Puedes mezclar Fotos y Video</small>
            {selectedMedia.map(item=><div key={item.id} className="chat-media-preview">
              {item.selection.kind==='photo'
                ?<img src={item.selection.uri} alt={'Vista previa de '+item.selection.name}/>
                :<video src={item.selection.uri} controls preload="metadata" playsInline aria-label={'Vista previa de '+item.selection.name}/>}
              <div className="chat-media-preview-info">
                <strong>{item.selection.name}</strong>
                <small>{item.selection.kind==='photo'?'Fotografía':'Video'} · {(item.selection.sizeBytes/1048576).toFixed(1)} MB</small>
              </div>
              <button type="button" aria-label={'Quitar '+item.selection.name} onClick={()=>removeSelectedMedia(item.id)}>✕</button>
            </div>)}
            <small>{mediaUploading?'Subiendo originales a R2 · '+mediaProgress+' %':
              mediaReady?'Originales listos para enviar':'Almacenamiento de archivos aún no configurado.'}</small>
            {mediaUploading&&<progress aria-label="Progreso de subida" max={100} value={mediaProgress} style={{width:'100%'}}/>}
          </div>}
          {mediaError&&<p className="chat-media-error" role="alert">{mediaError}</p>}
          <form className="chat-composer" onSubmit={event=>{event.preventDefault();if(selectedMedia.length&&!editing)void sendSelectedMedia();else send();}}>
            <div className="chat-input-pill">
              <button type="button" className="chat-icon-button chat-emoji-button"
                aria-label="Insertar emoji" aria-expanded={composerPanel==='emojis'}
                onClick={()=>setComposerPanel(p=>p==='emojis'?null:'emojis')}>
                <ComposerIcon name="emoji" size={25}/>
              </button>
              <input aria-label="Escribir mensaje" disabled={savingEdit} value={draft} maxLength={2000}
                onChange={event=>{typeText(event.target.value);setComposerPanel(null);}}
                placeholder={connection==='en vivo'?'Mensaje':'Sin conexión: se enviará después…'}/>
              <button type="button" className="chat-icon-button" aria-label="Adjuntar fotografía o video"
                aria-expanded={composerPanel==='attachments'}
                onClick={()=>setComposerPanel(p=>p==='attachments'?null:'attachments')}>
                <ComposerIcon name="clip" size={25}/>
              </button>
              <button type="button" className="chat-icon-button" aria-label="Abrir cámara"
                onClick={openCamera}>
                <ComposerIcon name="camera" size={25}/>
              </button>
            </div>
            {draft.trim()||editing||selectedMedia.length>0
              ?<button type="submit" className="chat-action-circle" aria-label={editing?'Guardar mensaje':selectedMedia.length?'Enviar archivos originales':'Enviar mensaje'}
                  disabled={savingEdit||mediaUploading||(!selectedMedia.length&&!draft.trim())}>
                  <ComposerIcon name="send" size={24}/>
                </button>
              :<button type="button" className="chat-action-circle" aria-label="Grabar audio (próximamente)"
                  onClick={()=>window.alert('Los mensajes de voz se habilitarán después de fotos y videos.')}>
                  <ComposerIcon name="mic" size={25}/>
                </button>}
          </form>
        </>
      )}
    </main>
      </div>
    </>
  );
}
