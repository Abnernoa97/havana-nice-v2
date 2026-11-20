// The only owner of native Chat session, WebSocket and offline message queue.
// View, navigation and scroll lifetime are separate modules; no new engine.
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppState,StatusBar,useWindowDimensions} from 'react-native';
import {
  chatReactionPayload,chatTypingPayload,chatReadReceiptPayload,
  fetchBackendHealth,getChatMediaAvailability,getChatSnapshot,getOlderChatMessages,getChatMenuState,
  getChatMessagePermissions,isWithinChatEditWindow,setOutgoingChatStatus,projectOutgoingChatStatus,
  clearChatAckTimer,pauseChatOutbox,confirmChatOutgoingMessage,flushChatOutbox,newClientMessageId,uploadChatMediaBatch,
  reconcileChatMessages,reconcileChatSnapshot,applyChatIncomingEvent,startNamedChatSession,
  restoreNamedChatSession,recoverChatAccess,chatSessionExpired,ChatConnectionTimers,ChatResumeGate,
  withoutRemovedChatMessages,ChatHistoryRequestGate,oldestConfirmedChatSeq,mergeOlderChatReactions,
  captureChatOfflineSnapshot,restoreChatOfflineOutbox,
  type ChatMessage,type ChatServerEvent,type ChatSession,type ChatReaction,type ChatEmoji,type ChatReadReceipt,
  type MemberScreen,
} from '@havana/shared';
import {loadNativeLocalChat,saveNativeLocalChat} from '../../storage/chatStorage';
import type {BubbleAnchor} from './SwipeableBubble';
import {uploadNativeChatFile} from '../../services/native-chat-r2-upload';
import {openNativeChatSocket} from '../../services/native-chat-socket';
import {useNativeMediaSelection} from './useNativeMediaSelection';
import {useNativeKeyboardVisibility} from '../../hooks/useNativeKeyboardVisibility';
import {useNativeMemberNavigation} from '../../hooks/useNativeMemberNavigation';
import {useNativeChatViewport} from './useNativeChatViewport';

export function useNativeChatController(){
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  const [apiState, setApiState] = useState('conectando…');
  const [name, setName] = useState('');
  const [session, setSession] = useState<ChatSession | null>(null);
  // Access remains the same ChatSession; only the destination changes to HOME.
  const [activeScreen,setActiveScreen]=useState<MemberScreen>('home');
  const [restoringAccess,setRestoringAccess] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerPanel,setComposerPanel]=useState<'attachments'|'emojis'|null>(null);
  const mediaUploadBusy=useRef(false);
  const {selectedMedia,mediaError,setMediaError,mediaPicking,
    confirmUploadedMedia,removeSelectedMedia,clearSelectedMedia,chooseNativeMedia}=
    useNativeMediaSelection({
      actorId:session?.actorId??null,
      uploadBusy:mediaUploadBusy,onCloseMenu:()=>setComposerPanel(null),
      onRecovered:()=>setActiveScreen('chat'),
    });
  const [mediaReady,setMediaReady]=useState(false);
  const [mediaUploading,setMediaUploading]=useState(false);
  const [mediaProgress,setMediaProgress]=useState(0);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('desconectado');
  const [joining, setJoining] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [onlineActorIds,setOnlineActorIds]=useState<ReadonlySet<string>>(()=>new Set());
  const [typing, setTyping] = useState('');
  const [receipts,setReceipts] = useState<ChatReadReceipt[]>([]);
  const [hasMore,setHasMore] = useState(false);
  const [loadingOlder,setLoadingOlder] = useState(false);
  const keyboardOpen=useNativeKeyboardVisibility(activeScreen==='chat');
  const [editing,setEditing] = useState<ChatMessage | null>(null);
  const [menuMessage,setMenuMessage] = useState<ChatMessage | null>(null);
  const [reactionBurst,setReactionBurst]=useState<ReactionShowerBurst|null>(null);
  const reactionBurstId=useRef(0);
  const [draftFieldHeight,setDraftFieldHeight]=useState(42);
  useEffect(()=>{if(!draft)setDraftFieldHeight(42);},[draft]);
  const [menuAnchor,setMenuAnchor] = useState<BubbleAnchor | null>(null);
  const {navigateTo,iosBackPan}=useNativeMemberNavigation({
    session,activeScreen,setActiveScreen,composerPanel,setComposerPanel,menuMessage,setMenuMessage,
  });
  const {scroll,autoScroll,initialHistoryPending,initialHistoryLoaded,
    initialBottomTimer,userHasScrolled,scheduleInitialBottom,beginFreshChatViewport,trackUserScroll}=
    useNativeChatViewport(activeScreen,session?.token);

  const socket = useRef<WebSocket | null>(null);
  const removedSeq = useRef<Set<number>>(new Set());
  const historyRequests=useRef(new ChatHistoryRequestGate());
  useEffect(()=>{
    if(!session){setMediaReady(false);return;}
    let active=true;
    void getChatMediaAvailability(session).then(enabled=>{
      if(active)setMediaReady(enabled);
    }).catch(()=>{if(active)setMediaReady(false);});
    return()=>{active=false;};
  },[session?.token]);
  const activeSession = useRef<ChatSession | null>(null);
  const appLifecycle = useRef(AppState.currentState);
  const connectionTimers=useRef(new ChatConnectionTimers());
  const resumeGate=useRef(new ChatResumeGate());
  const startupGate=useRef(new ChatResumeGate());
  const retryAttempts = useRef(0);
  const disposed = useRef(false);
  const connectLatest = useRef<(next: ChatSession) => void>(() => {});
  const syncLatest = useRef<() => void>(() => {});
  const outbox = useRef<Map<string, ChatMessage>>(new Map());
  const acknowledgementTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingLast = useRef(0);
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

  // Android 16: keep the legacy navigation padding only when the IME is hidden.
  // The keyboard avoidance wrapper is responsible for lifting the composer.



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
    pauseChatOutbox(outbox.current,acknowledgementTimers.current,markOutgoing);
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    setMessages([]);
    setSession(null);
    setName('');
    setConnection('desconectado');
    setError('Acceso revocado. Consulta al administrador.');
    void saveNativeLocalChat(null);
  }

  function persistLocal() {
    if (!restoredStorage.current) return;
    const value = captureChatOfflineSnapshot(
      activeSession.current,outbox.current.values(),latestDraft.current,
      editingSnapshot.current,beforeEdit.current,
    );
    storageQueue.current = storageQueue.current.catch(() => {}).then(() => saveNativeLocalChat(value)).catch(() => {});
  }

  function sendReadReceipt(seq:number) {
    const payload=chatReadReceiptPayload(seq);
    if(payload && appLifecycle.current==='active' && socket.current?.readyState===WebSocket.OPEN) {
      socket.current.send(payload);
    }
  }
  async function loadOlder() {
    if(!session || loadingOlder || !hasMore)return;
    const oldest=oldestConfirmedChatSeq(messages);
    if(oldest===null)return;
    const request=historyRequests.current.beginOlder();
    if(request===null)return;
    setLoadingOlder(true);
    autoScroll.current=false;
    try{
      const data=await getOlderChatMessages(session,oldest);
      if(!historyRequests.current.isOlderCurrent(request)||activeSession.current?.token!==session.token)return;
      setHasMore(data.hasMore);
      setMessages(before=>reconcileChatMessages(before,withoutRemovedChatMessages(data.messages,removedSeq.current)));
      setReactions(before=>mergeOlderChatReactions(before,data.reactions,removedSeq.current));
    }catch(e){
      if(historyRequests.current.isOlderCurrent(request)&&activeSession.current?.token===session.token)
        setError(e instanceof Error?e.message:'No se pudo cargar el historial');
    }finally{
      if(historyRequests.current.finishOlder(request))setLoadingOlder(false);
    }
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
    persistLocal();
  }
  function abandonPendingEdit(reason:string){
    if(!editPending.current)return;
    editPending.current=null;
    resetEditTimeout();
    setSavingEdit(false);
    setError(reason);
    // Editing text stays in the composer for an explicit retry or cancel.
  }
  function replyToMessage(message:ChatMessage) {
    if(message.seq<1 || message.deletedAt)return;
    setMenuMessage(null);
    setEditing(null);
    setReplyTo(message);
  }
  function showMessageMenu(message:ChatMessage,anchor:BubbleAnchor) {
    if(message.seq<=0 || message.deletedAt)return;
    setMenuAnchor(anchor);
    setMenuMessage(message);
  }
  function manageOwn(message:ChatMessage,deleting=false){
    if(!session||message.senderId!==session.actorId||message.seq<1||
      message.deletedAt||connection!=='en vivo')return;
    const permission=getChatMessagePermissions(message,session?.actorId,connection);
    if(!(deleting?permission.canDelete:permission.canEdit)){
      setError(deleting?'El plazo para eliminar terminó':'El plazo de edición de 15 minutos terminó');return;
    }
    if(!deleting){
      if(!beforeEdit.current)beforeEdit.current={draft,replyTo};
      editingSnapshot.current=message;
      latestDraft.current=message.text;
      setReplyTo(null);setEditing(message);setDraft(message.text);setError('');
      persistLocal();
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
    clearChatAckTimer(acknowledgementTimers.current,id);
  }
  function confirmMessage(message: ChatMessage) {
    if(confirmChatOutgoingMessage(message,activeSession.current?.actorId,
      outbox.current,acknowledgementTimers.current))persistLocal();
  }
  function markOutgoing(id: string, state: 'queued' | 'sending' | 'error') {
    const original=setOutgoingChatStatus(outbox.current,id,state);
    if(!original)return;
    persistLocal();
    setMessages(before=>projectOutgoingChatStatus(before,original,state));
  }
  function pauseOutgoing() {
    pauseChatOutbox(outbox.current,acknowledgementTimers.current,markOutgoing);
  }
  // Same IDs, server ACK and manual retry policy as PWA.
  function flushOutbox() {
    flushChatOutbox(socket.current,outbox.current,acknowledgementTimers.current,markOutgoing,activeSession.current?.actorId);
  }
  function retryOutgoing(id: string) {
    if (!outbox.current.has(id)) return;
    clearAck(id);
    markOutgoing(id, 'queued');
    flushOutbox();
  }


  function syncMessages(next: ChatSession) {
    const request=historyRequests.current.beginSnapshot();
    void getChatSnapshot(next)
      .then(({ messages:history, reactions:historyReactions, receipts:readHistory,hasMore:more }) => {
        if (!disposed.current && activeSession.current?.token === next.token&&
            historyRequests.current.isSnapshotCurrent(request)) {
          if(initialHistoryPending.current)initialHistoryLoaded.current=true;
          withoutRemovedChatMessages(history,removedSeq.current).forEach(confirmMessage);
          setReactions(historyReactions.filter(reaction=>!removedSeq.current.has(reaction.messageSeq)));
          setReceipts(readHistory);
          setHasMore(more);
          setMessages(before => reconcileChatSnapshot(before,withoutRemovedChatMessages(history,removedSeq.current)));
          if(initialHistoryPending.current)requestAnimationFrame(scheduleInitialBottom);
          sendReadReceipt(Math.max(0,...history.map(m=>m.seq)));
          flushOutbox();
        }
      })
      .catch(reason => {
        if (!disposed.current && activeSession.current?.token === next.token&&
            historyRequests.current.isSnapshotCurrent(request)) {
          setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el historial');
          // A temporary history failure must not block queued outgoing messages.
          flushOutbox();
        }
      });
  }

  // React Native's Android WebSocket supports Authorization at handshake time.
  // Do not put secrets in the URL or Sec-WebSocket-Protocol.
  function connect(next: ChatSession) {
    if (disposed.current) return;
    resumeGate.current.invalidate();
    activeSession.current = next;
    persistLocal();
    if (chatSessionExpired(next)) {
      connectionTimers.current.clearHandshake();
      connectionTimers.current.clearRetry();
      for (const timer of acknowledgementTimers.current.values()) clearTimeout(timer);
      acknowledgementTimers.current.clear();
      socket.current?.close();
      socket.current = null;
      activeSession.current = null;
      persistLocal();
      setSession(null);
      setConnection('desconectado');
      setError('Tu acceso no está disponible. Escribe tu nombre para solicitar la entrada.');
      return;
    }
    connectionTimers.current.clearAll();
    const previous = socket.current;
    if (previous) pauseOutgoing();
    socket.current = null; // previous close events cannot race with a new connection
    previous?.close();
    setConnection('conectando…');
    setError('');

    function retry() {
      if (disposed.current || appLifecycle.current !== 'active' || socket.current !== ws ||
        !activeSession.current || connectionTimers.current.retryPending) return;
      pauseOutgoing();
      retryAttempts.current += 1;
      setConnection('reconectando…');
      connectionTimers.current.scheduleRetry(retryAttempts.current,()=>{
        const sessionToRetry = activeSession.current;
        if (sessionToRetry && appLifecycle.current === 'active') {
          connectLatest.current(sessionToRetry);
        }
      });
    }

    let ws: WebSocket;
    try {
      ws = openNativeChatSocket(next);
    } catch {
      setConnection('sin conexión');
      // Constructor errors are exceptional; avoid an indefinite retry loop.
      setError('No se pudo iniciar la conexión. Comprueba la red y pulsa Reconectar.');
      return;
    }
    socket.current = ws;
    // A stalled native handshake must not leave Chat stuck in "conectando".
    connectionTimers.current.watchHandshake(
      ()=>!disposed.current&&socket.current===ws&&ws.readyState!==WebSocket.OPEN,
      ()=>{try{ws.close();}catch{}retry();}
    );
    ws.onopen = () => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
      retryAttempts.current = 0;
      connectionTimers.current.clearRetry();
      setConnection('en vivo');
      setError('');
      syncMessages(next); // also recovers messages missed in background
    };
    ws.onmessage = event => {
      if (disposed.current || socket.current !== ws) return;
      try {
        const item = JSON.parse(String(event.data)) as ChatServerEvent;
        applyChatIncomingEvent(item,{
          actorId:next.actorId,
          removedSeq:removedSeq.current,
          setOnlineActorIds,
          setTyping:(label,active)=>{
            setTyping(label);
            if(typingTimer.current)clearTimeout(typingTimer.current);
            if(active)typingTimer.current=setTimeout(()=>setTyping(''),4300);
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
          onConfirmed:confirmMessage,
          onMessageReceived:seq=>{sendReadReceipt(seq);flushOutbox();},
          onRevoked:revokeCurrentAccess,
          onError:reason=>{abandonPendingEdit(reason);setError(reason);},
        });
      } catch {
        setError('Evento no válido');
      }
    };
    ws.onerror = () => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      retry();
    };
    ws.onclose = event => {
      if (disposed.current || socket.current !== ws) return;
      connectionTimers.current.clearHandshake();
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      pauseOutgoing();
      if (appLifecycle.current === 'active') {
        retry();
      } else {
        setConnection('pausado');
      }
    };
  }

  // Stable listeners are mounted once. Reconnect on Android foreground,
  // with a short exponential backoff after unexpected network drops.
  connectLatest.current = connect;
  syncLatest.current = () => {
    if (activeSession.current) syncMessages(activeSession.current);
  };

  useEffect(() => {
    disposed.current = false;
    void loadNativeLocalChat().then(async saved => {
      if (disposed.current) return;
      if (activeSession.current) {restoredStorage.current=true;persistLocal();return;}
      if (!saved?.session || chatSessionExpired(saved.session)) return;
      const restoration=startupGate.current.begin();
      const access=await recoverChatAccess(saved.session,restoreNamedChatSession);
      if(disposed.current||!startupGate.current.isRequestCurrent(restoration)||
         activeSession.current)return;
      if (access.state==='revoked') {
        await saveNativeLocalChat(null);
        setName('');
        setError('Acceso no autorizado. Consulta al administrador.');
        return;
      }
      const approved=access.session;
      activeSession.current = approved;
      beginFreshChatViewport();
      outbox.current = restoreChatOfflineOutbox(saved.outbox);
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
      if(appLifecycle.current==='active')connectLatest.current(approved);
    }).catch(() => {}).finally(() => {restoredStorage.current=true;setRestoringAccess(false);});
    void fetchBackendHealth()
      .then(value => { if (!disposed.current) setApiState(value.ok ? 'conectada' : 'error'); })
      .catch(() => { if (!disposed.current) setApiState('error'); });

    const subscription = AppState.addEventListener('change', state => {
      appLifecycle.current = state;
      if(state!=='active')resumeGate.current.invalidate();
      const currentSession = activeSession.current;
      if (state === 'active' && currentSession) {
        beginFreshChatViewport();
        const request=resumeGate.current.begin();
        const validResponse=()=>resumeGate.current.isCurrent(
          request,currentSession.token,activeSession.current?.token,
          !disposed.current&&appLifecycle.current==='active'
        );
        void restoreNamedChatSession(currentSession).then(valid => {
          if(!validResponse())return;
          if (!valid) {revokeCurrentAccess();return;}
          const ws = socket.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) connectLatest.current(valid);
          else syncLatest.current();
        }).catch(() => {
          // Without a network connection, preserve the existing local session.
          if(validResponse())connectLatest.current(currentSession);
        });
      } else if (state === 'background') {
        connectionTimers.current.clearHandshake();
        persistLocal();
        connectionTimers.current.clearRetry();
        pauseOutgoing();
        const old = socket.current;
        socket.current = null;
        old?.close();
        if (currentSession) setConnection('pausado');
      }
    });

    return () => {
      disposed.current = true;
      resumeGate.current.invalidate();
      startupGate.current.invalidate();
      subscription.remove();
      connectionTimers.current.clearAll();
      socket.current?.close();
      socket.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (initialBottomTimer.current) clearTimeout(initialBottomTimer.current);
      resetEditTimeout();
    };
  }, []);

  useEffect(() => {
    latestDraft.current = draft;
    if(!restoredStorage.current || !activeSession.current)return;
    if(draftTimer.current)clearTimeout(draftTimer.current);
    draftTimer.current=setTimeout(()=>{draftTimer.current=null;persistLocal();},350);
    return ()=>{if(draftTimer.current)clearTimeout(draftTimer.current);};
  },[draft]);


  function acceptApprovedSession(next: ChatSession) {
    historyRequests.current.reset();setLoadingOlder(false);
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    beginFreshChatViewport();
    setMessages([]);
    setReceipts([]);
    setHasMore(false);
    // A new login must never deliver the previous actor's offline messages.
    outbox.current.clear();
    pauseChatOutbox(outbox.current,acknowledgementTimers.current,markOutgoing);
    setSession(next);
    activeSession.current=next;
    persistLocal();
    retryAttempts.current=0;
    connect(next);
  }
  async function join() {
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

  async function sendSelectedMedia(){
    if(!session||!selectedMedia.length||mediaUploadBusy.current)return;
    if(!mediaReady){setMediaError('El almacenamiento R2 no está disponible.');return;}
    mediaUploadBusy.current=true;setMediaUploading(true);setMediaProgress(0);setMediaError('');
    try{
      await uploadChatMediaBatch([...selectedMedia],{
        sizeOf:item=>item.sizeBytes,
        upload:(item,onSent)=>uploadNativeChatFile(session,item,onSent),
        progress:setMediaProgress,
        confirmed:item=>{
          // Only confirmed originals leave the queue; errors remain retryable.
          confirmUploadedMedia(item.id);
          syncMessages(session);
        },
      });
    }catch(e){
      setMediaError(e instanceof Error?e.message:'Se interrumpió la carga. Reintenta solo lo pendiente.');
    }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
  }
  function send() {
    const text = draft.trim();
    if(editing){
      if(editPending.current)return;
      if(!text){setError('El mensaje editado no puede quedar vacío.');return;}
      if(text===editing.text){finishEditing();return;}
      if(!isWithinChatEditWindow(editing.sentAt)){
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
      setError('La cola de mensajes está llena. Reintenta cuando vuelva Internet.');
      return;
    }
    const clientMessageId = newClientMessageId();
    const item: ChatMessage = {
      seq: 0, clientMessageId, senderId: session.actorId, senderName: session.displayName,
      text, sentAt: new Date().toISOString(), pending: true, deliveryStatus: 'queued', replyToSeq: replyTo?.seq || null,
    };
    outbox.current.set(clientMessageId, item);
    persistLocal();
    setReplyTo(null);
    setMessages(before => reconcileChatMessages(before, [item]));
    setDraft('');
    autoScroll.current = true;
    flushOutbox();
  }

  // Stable props let the virtualized list ignore typing/composer re-renders.
  // Real message, receipt and presence changes still update it immediately.
  const timelineActions=useRef({
    loadOlder,replyToMessage,showMessageMenu,retryOutgoing,trackUserScroll,
  });
  useLayoutEffect(()=>{
    timelineActions.current={
      loadOlder,replyToMessage,showMessageMenu,retryOutgoing,trackUserScroll,
    };
  });
  const onTimelineLoadOlder=useCallback(()=>{void timelineActions.current.loadOlder();},[]);
  const onTimelineReply=useCallback((message:ChatMessage)=>{
    timelineActions.current.replyToMessage(message);
  },[]);
  const onTimelineLongPress=useCallback((message:ChatMessage,anchor:BubbleAnchor)=>{
    timelineActions.current.showMessageMenu(message,anchor);
  },[]);
  const onTimelineRetry=useCallback((id:string)=>{
    timelineActions.current.retryOutgoing(id);
  },[]);
  const onTimelineContentChange=useCallback(()=>{
    if(initialHistoryPending.current)scheduleInitialBottom();
    else if(autoScroll.current)scroll.current?.scrollToEnd({animated:false});
  },[]);
  const onTimelineScrollBeginDrag=useCallback(()=>{
    userHasScrolled.current=true;
    initialHistoryPending.current=false;
    if(initialBottomTimer.current)clearTimeout(initialBottomTimer.current);
    initialBottomTimer.current=null;
  },[]);
  const onTimelineScroll=useCallback((event:Parameters<typeof trackUserScroll>[0])=>{
    if(userHasScrolled.current)timelineActions.current.trackUserScroll(event);
  },[]);
  const onTimelineScrollEndDrag=useCallback((event:Parameters<typeof trackUserScroll>[0])=>{
    timelineActions.current.trackUserScroll(event);
  },[]);

  // One message-action policy across native Android and the iPhone PWA.
  // Keep Android-specific StatusBar and keyboard viewport insets unchanged.
  const {width:menuWidth,top:menuTop,left:menuLeft}=getChatMenuState(
    menuMessage,session?.actorId,connection,menuAnchor,{
      width:viewportWidth,height:viewportHeight,offsetTop:0,
      topPadding:(StatusBar.currentHeight??0)+8,bottomPadding:14,
      maxWidth:220,menuHeight:64,
    });

  return {iosBackPan,keyboardOpen,session,activeScreen,restoringAccess,name,setName,join,joining,error,messages,onlineActorIds,connection,reactions,receipts,hasMore,loadingOlder,scroll,onTimelineContentChange,onTimelineScrollBeginDrag,onTimelineScroll,onTimelineScrollEndDrag,onTimelineLoadOlder,onTimelineReply,onTimelineLongPress,onTimelineRetry,menuMessage,menuLeft,menuTop,menuWidth,setMenuMessage,setReactionBurst,reactionBurstId,react,retryAttempts,connect,editing,savingEdit,finishEditing,replyTo,setReplyTo,typing,selectedMedia,mediaUploading,mediaProgress,mediaReady,removeSelectedMedia,mediaError,draft,draftFieldHeight,setDraftFieldHeight,typeText,mediaPicking,chooseNativeMedia,sendSelectedMedia,send,composerPanel,setComposerPanel,navigateTo,reactionBurst};
}
