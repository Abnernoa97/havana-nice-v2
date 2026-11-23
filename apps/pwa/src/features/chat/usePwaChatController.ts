import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {
  chatReactionPayload,chatTypingPayload,chatReadReceiptPayload,
  fetchBackendHealth,getChatSnapshot,getOlderChatMessages,getChatMessagePermissions,checkChatEditDecision,chatEditPayload,chatDeletePayload,CHAT_EDIT_ACK_TIMEOUT_MS,
  setOutgoingChatStatus,projectOutgoingChatStatus,clearChatAckTimer,pauseChatOutbox,
  confirmChatOutgoingMessage,flushChatOutbox,newClientMessageId,createQueuedChatMessage,
  openChatSocket,reconcileChatMessages,startNamedChatSession,restoreNamedChatSession,
  recoverChatAccess,chatSessionExpired,ChatConnectionTimers,ChatResumeGate,
  withoutRemovedChatMessages,ChatHistoryRequestGate,requestOlderChatPage,requestChatSnapshot,
  mergeOlderChatReactions,captureChatOfflineSnapshot,restoreChatOfflineOutbox,
  reconcileChatSnapshot,applyChatIncomingEvent,
  type BackendHealth,type ChatMessage,type ChatServerEvent,type ChatSession,
  type ChatReaction,type ChatEmoji,type ChatReadReceipt,
} from '@havana/shared';
import {loadLocalChat,saveLocalChat} from '../../services/local';
import type {MessageAnchor} from './SwipeMessage';
import {useChatScrollAnchor} from './useChatScrollAnchor';
import {usePwaMediaSelection} from './usePwaMediaSelection';
import {usePwaChatMediaUpload} from './usePwaChatMediaUpload';
import {usePwaMemberNavigation} from '../../app/usePwaMemberNavigation';

// The only member session, WebSocket, message/outbox and offline snapshot owner.
// It exposes state and callbacks to the presentation without rendering it.
export function usePwaChatController(){
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [name, setName] = useState('');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [restoringAccess,setRestoringAccess] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const draftInput=useRef<HTMLTextAreaElement|null>(null);

  const [composerPanel,setComposerPanel]=useState<'attachments'|'emojis'|null>(null);
  // Must be initialized before the picker hook receives it. On iOS Safari,
  // referring to a later const crashes App render and produces a blank screen.
  const mediaUploadBusy=useRef(false);
  const {selectedMedia,mediaError,setMediaError,mediaQueue,
    photosPicker,videoPicker,cameraPicker,
    removeSelectedMedia,confirmUploadedMedia,clearSelectedMedia,
    openGalleryMedia,openCamera,chooseMedia,waitForMediaPreparation,photoPreparing}=
    usePwaMediaSelection({
      actorId:session?.actorId??null,uploadBusy:mediaUploadBusy,
      onCloseMenu:()=>setComposerPanel(null),
    });
  const [connection, setConnection] = useState('desconectado');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [latestMessageRequest,setLatestMessageRequest]=useState(0);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [onlineActorIds,setOnlineActorIds]=useState<ReadonlySet<string>>(()=>new Set());
  const [typing, setTyping] = useState('');
  const [receipts, setReceipts] = useState<ChatReadReceipt[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menuMessage,setMenuMessage] = useState<ChatMessage | null>(null);
  const [menuAnchor,setMenuAnchor] = useState<MessageAnchor|null>(null);
  const {activeScreen,setActiveScreen,readerRoute,closeReader,navigateTo,closeChat,edgeSwipeStart}=
    usePwaMemberNavigation({onChatExit:()=>{setComposerPanel(null);setMenuMessage(null);}});
  const socket = useRef<WebSocket | null>(null);
  const removedSeq = useRef<Set<number>>(new Set());
  const historyRequests=useRef(new ChatHistoryRequestGate());
  const activeSession = useRef<ChatSession | null>(null);
  const outbox = useRef<Map<string, ChatMessage>>(new Map());
  const ackTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const connectionTimers=useRef(new ChatConnectionTimers());
  const resumeGate=useRef(new ChatResumeGate());
  const startupGate=useRef(new ChatResumeGate());
  const retryCount = useRef(0);
  const disposed = useRef(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const scrollOlderOnce=useRef(false);
  const typingLast = useRef(0);
  const insertEmoji=(emoji:string)=>{
    if(editing&&savingEdit)return;
    if(draft.length+emoji.length<=2000)typeText(draft+emoji);
    setComposerPanel(null);
  };
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
  const {mediaReady,mediaUploading,mediaProgress,sendSelectedMedia,sendVoice}=usePwaChatMediaUpload({
    session,activeSession,mediaQueue,mediaUploadBusy,setMediaError,
    waitForMediaPreparation,confirmUploadedMedia,refreshLatest,
  });

  function revokeCurrentAccess() {
    resumeGate.current.invalidate();
    startupGate.current.invalidate();
    clearSelectedMedia();
    connectionTimers.current.clearHandshake();
    historyRequests.current.reset();
    setLoadingOlder(false);
    setActiveScreen('home');
    const previous = socket.current;
    socket.current = null;
    previous?.close();
    connectionTimers.current.clearRetry();
    activeSession.current = null;
    outbox.current.clear();
    pauseChatOutbox(outbox.current,ackTimers.current,markOutgoing);
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
    const value = captureChatOfflineSnapshot(
      activeSession.current,outbox.current.values(),latestDraft.current,
      editingSnapshot.current,beforeEdit.current,
    );
    storageQueue.current = storageQueue.current.catch(() => {}).then(() => saveLocalChat(value)).catch(() => {});
  }
  function sendReadReceipt(seq: number) {
    const payload=chatReadReceiptPayload(seq);
    if(payload && document.visibilityState === 'visible' && socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(payload);
    }
  }
  async function loadOlder() {
    if(!session || !hasMore || loadingOlder || !messages.length)return;
    await requestOlderChatPage({
      session,messages,gate:historyRequests.current,fetchPage:getOlderChatMessages,
      isCurrent:()=>activeSession.current?.token===session.token,
      onStart:()=>{setLoadingOlder(true);scrollOlderOnce.current=true;},
      onPage:data=>{
        setMessages(prev=>reconcileChatMessages(prev,withoutRemovedChatMessages(data.messages,removedSeq.current)));
        setHasMore(data.hasMore);
        setReactions(prev=>mergeOlderChatReactions(prev,data.reactions,removedSeq.current));
      },
      onError:e=>setError(e instanceof Error?e.message:'No se pudo cargar más mensajes'),
      onFinish:()=>setLoadingOlder(false),
    });
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
    const permission=getChatMessagePermissions(message,session?.actorId,connection);
    if (!(deleting ? permission.canDelete : permission.canEdit)) {
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
    try{ws.send(chatDeletePayload(message.seq));}
    catch{setError('No se pudo borrar. Reintenta cuando vuelva Internet.');}
  }
  function clearAck(id: string) {
    clearChatAckTimer(ackTimers.current,id);
  }
  function markOutgoing(id: string, state: 'queued' | 'sending' | 'error') {
    const original=setOutgoingChatStatus(outbox.current,id,state);
    if(!original)return;
    persist();
    setMessages(before=>projectOutgoingChatStatus(before,original,state));
  }
  function confirm(message: ChatMessage) {
    if(confirmChatOutgoingMessage(message,activeSession.current?.actorId,
      outbox.current,ackTimers.current))persist();
  }
  function pausePending() {
    pauseChatOutbox(outbox.current,ackTimers.current,markOutgoing);
  }
  function flushOutbox() {
    flushChatOutbox(socket.current,outbox.current,ackTimers.current,markOutgoing,activeSession.current?.actorId);
  }
  function refresh(next: ChatSession) {
    void requestChatSnapshot({
      session:next,gate:historyRequests.current,fetchSnapshot:getChatSnapshot,
      isCurrent:()=>!disposed.current&&activeSession.current?.token===next.token,
      onPage:({messages:history,reactions:reactionHistory,receipts:readHistory,hasMore:more})=>{
        history.forEach(confirm);
        setReactions(reactionHistory.filter(reaction=>!removedSeq.current.has(reaction.messageSeq)));
        setReceipts(readHistory);
        setHasMore(more);
        setMessages(before=>reconcileChatSnapshot(before,withoutRemovedChatMessages(history,removedSeq.current)));
        sendReadReceipt(Math.max(0,...history.map(m=>m.seq)));
        flushOutbox();
      },
      onError:e=>{setError(e instanceof Error?e.message:'Error al sincronizar');flushOutbox();},
    });
  }
  function reconnect(next: ChatSession) {
    if (disposed.current) return;
    resumeGate.current.invalidate();
    if (chatSessionExpired(next)) {
      connectionTimers.current.clearHandshake();
      connectionTimers.current.clearRetry();
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
    connectionTimers.current.clearAll();
    const old = socket.current;
    if (old) pausePending();
    socket.current = null;
    old?.close();
    setConnection('conectando…');
    let ws:WebSocket;
    try{ws=openChatSocket(next);}
    catch{
      setConnection('sin conexión');
      setError('No se pudo iniciar la conexión. Comprueba Internet y pulsa Reconectar.');
      return;
    }
    persist();
    socket.current = ws;
    function retry() {
      if (disposed.current || socket.current !== ws || connectionTimers.current.retryPending ||
          document.visibilityState !== 'visible' || !navigator.onLine) return;
      pausePending();
      retryCount.current++;
      setConnection('reconectando…');
      connectionTimers.current.scheduleRetry(retryCount.current,()=>{
        if (activeSession.current && document.visibilityState === 'visible') {
          connectLatest.current(activeSession.current);
        }
      });
    }
    // Mobile Safari may keep the TLS/WS handshake CONNECTING after network changes.
    // Reuse this same owner's retry timer; never create a second WebSocket.
    connectionTimers.current.watchHandshake(
      ()=>!disposed.current&&socket.current===ws&&ws.readyState!==WebSocket.OPEN,
      ()=>{try{ws.close();}catch{}retry();}
    );
    ws.onopen = () => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
      retryCount.current = 0;
      connectionTimers.current.clearRetry();
      setConnection('en vivo');
      setError('');
      refresh(next);
    };
    ws.onmessage = event => {
      if (disposed.current || socket.current !== ws) return;
      try {
        const value = JSON.parse(String(event.data)) as ChatServerEvent;
        applyChatIncomingEvent(value,{
          actorId:next.actorId,
          removedSeq:removedSeq.current,
          setOnlineActorIds,
          setTyping:(label,active)=>{
            setTyping(label);
            if(typingTimer.current)clearTimeout(typingTimer.current);
            if(active)typingTimer.current=setTimeout(()=>setTyping(''),4200);
          },
          setMessages,setReactions,setReceipts,
          onUpdated:message=>{
            if(editPending.current?.seq===message.seq){
              if(!message.deletedAt&&message.text===editPending.current.text)finishEditing();
              else {
                abandonPendingEdit('La edición no coincidió con el servidor. Revisa el mensaje antes de reintentar.');
                return true;
              }
            }
            return false;
          },
          onUpdatedRemoved:seq=>setMenuMessage(current=>current?.seq===seq?null:current),
          onUpdatedSuccess:()=>setError(''),
          onDeleted:seq=>{
            setReplyTo(current=>current?.seq===seq?null:current);
            setMenuMessage(current=>current?.seq===seq?null:current);
            setEditing(current=>current?.seq===seq?null:current);
          },
          onConfirmed:confirm,
          onMessageReceived:seq=>{sendReadReceipt(seq);flushOutbox();},
          onRevoked:revokeCurrentAccess,
          onError:reason=>{abandonPendingEdit(reason);setError(reason);},
        });
      } catch {
        setError('Evento inválido');
      }
    };
    ws.onclose = () => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      pausePending();
      setConnection('desconectado');
      retry();
    };
    ws.onerror = () => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
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
      if (!saved || !saved.session || chatSessionExpired(saved.session)) return;
      const restoration=startupGate.current.begin();
      const access=await recoverChatAccess(saved.session,restoreNamedChatSession);
      if(disposed.current||!startupGate.current.isRequestCurrent(restoration)||
         activeSession.current)return;
      if(access.state==='revoked'){
        await saveLocalChat(null);
        setName('');
        setError('Acceso no autorizado. Consulta al administrador.');
        return;
      }
      const approved=access.session;
      activeSession.current = approved;
      outbox.current = restoreChatOfflineOutbox(saved.outbox || []);
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
      if(document.visibilityState==='visible'&&navigator.onLine)
        connectLatest.current(approved);
    }).catch(() => {}).finally(() => {restoredStorage.current=true;setRestoringAccess(false);});
    void fetchBackendHealth().then(data => {
      if (!disposed.current) setHealth(data);
    }).catch(() => { if (!disposed.current) setError('No se pudo conectar a la API'); });
    const resume = () => {
      if(document.visibilityState==='hidden'){
        resumeGate.current.invalidate();persist();return;
      }
      const next = activeSession.current;
      if (!next || document.visibilityState !== 'visible') return;
      const request=resumeGate.current.begin();
      const validResponse=()=>resumeGate.current.isCurrent(
        request,next.token,activeSession.current?.token,
        !disposed.current&&document.visibilityState==='visible'&&navigator.onLine
      );
      void restoreNamedChatSession(next).then(valid => {
        if(!validResponse())return;
        if(!valid){revokeCurrentAccess();return;}
        if(!socket.current || socket.current.readyState !== WebSocket.OPEN)
          connectLatest.current(valid);
        else refreshLatest.current();
      }).catch(() => {
        if(validResponse())connectLatest.current(next);
      });
    };
    const offline = () => {
      resumeGate.current.invalidate();
      connectionTimers.current.clearHandshake();
      pausePending();
      setConnection('sin conexión');
      connectionTimers.current.clearRetry();
      const old = socket.current;
      socket.current = null;
      old?.close();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      disposed.current = true;
      resumeGate.current.invalidate();
      startupGate.current.invalidate();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      connectionTimers.current.clearAll();
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


  // The scroll lifecycle is isolated from the single Chat socket and outbox.
  const {pauseFollow,resumeLatest}=useChatScrollAnchor({
    active:activeScreen==='chat'&&!!session,
    sessionToken:session?.token,
    messageCount:messages.length,
    bottomRef:bottom,
    skipOlderRef:scrollOlderOnce,
  });

  function acceptApprovedSession(next:ChatSession){
    historyRequests.current.reset();setLoadingOlder(false);
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    setMessages([]);
    setReceipts([]);
    setHasMore(false);
    outbox.current.clear();
    pauseChatOutbox(outbox.current,ackTimers.current,markOutgoing);
    setSession(next);
    activeSession.current=next;
    persist();
    retryCount.current=0;
    reconnect(next);
  }
  // The only login: Administrator-created name, one server-linked session.
  async function join(){
    if(!name.trim()||joining)return;
    resumeGate.current.invalidate();
    startupGate.current.invalidate();
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
      const decision=checkChatEditDecision(editing,text,!!editPending.current);
      if(decision==='pending')return;
      if(decision==='empty'){setError('El mensaje editado no puede quedar vacío.');return;}
      if(decision==='unchanged'){finishEditing();return;}
      if(decision==='expired'){
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
        ws.send(chatEditPayload(editing.seq,text));
        resetEditTimeout();
        editTimeout.current=setTimeout(()=>{
          abandonPendingEdit('No se confirmó la edición. Comprueba el mensaje y reintenta.');
        },CHAT_EDIT_ACK_TIMEOUT_MS);
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
    const message=createQueuedChatMessage(
      session,text,replyTo?.seq||null,clientMessageId,new Date().toISOString(),
    );
    outbox.current.set(clientMessageId, message);
    persist();
    setReplyTo(null);
    setMessages(before => reconcileChatMessages(before, [message]));
    setLatestMessageRequest(n=>n+1);
    setDraft('');
    flushOutbox();
  }
  function react(seq: number, emoji: ChatEmoji) {
    const payload=chatReactionPayload(seq,emoji);
    if(payload&&socket.current?.readyState===WebSocket.OPEN)socket.current.send(payload);
  }
  function typeText(value: string) {
    latestDraft.current=value;
    setDraft(value);
    const now=Date.now();
    if(socket.current?.readyState===WebSocket.OPEN){
      const payload=chatTypingPayload(value,now,typingLast.current);
      if(payload){typingLast.current=now;socket.current.send(payload);}
    }
  }
  function retryMessage(id: string) {
    if (!outbox.current.has(id)) return;
    clearAck(id);
    markOutgoing(id, 'queued');
    flushOutbox();
  }

  // Stable timeline actions: drafts, typing and composer gestures may update
  // the controller without rebuilding every photo/video/message bubble.
  // The latest handlers are committed before the next user interaction.
  const timelineActions=useRef({loadOlder,replyToMessage,showMessageMenu,retryMessage});
  useLayoutEffect(()=>{
    timelineActions.current={loadOlder,replyToMessage,showMessageMenu,retryMessage};
  });
  const onTimelineLoadOlder=useCallback(()=>{void timelineActions.current.loadOlder();},[]);
  const onTimelineReply=useCallback((message:ChatMessage)=>{
    timelineActions.current.replyToMessage(message);
  },[]);
  const onTimelineLongPress=useCallback((message:ChatMessage,anchor:MessageAnchor)=>{
    timelineActions.current.showMessageMenu(message,anchor);
  },[]);
  const onTimelineRetry=useCallback((id:string)=>{
    timelineActions.current.retryMessage(id);
  },[]);


  return {
    session,activeScreen,readerRoute,closeReader,navigateTo,closeChat,edgeSwipeStart,
  restoringAccess,name,joining,error,setName,join,messages,latestMessageRequest,
  onlineActorIds,connection,reactions,receipts,hasMore,loadingOlder,
  pauseFollow,resumeLatest,onTimelineLoadOlder,onTimelineReply,onTimelineLongPress,onTimelineRetry,bottom,
  menuMessage,menuAnchor,setMenuMessage,react,reconnect,editing,savingEdit,finishEditing,
  replyTo,setReplyTo,typing,composerPanel,setComposerPanel,openGalleryMedia,insertEmoji,
  photosPicker,videoPicker,cameraPicker,chooseMedia,selectedMedia,mediaUploading,
  photoPreparing,mediaProgress,mediaReady,removeSelectedMedia,mediaError,sendSelectedMedia,sendVoice,
  send,draft,draftInput,typeText,openCamera
  };
}

export type PwaChatUI=ReturnType<typeof usePwaChatController>;
