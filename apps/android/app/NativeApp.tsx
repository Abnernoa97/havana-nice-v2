import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, SafeAreaView, FlatList,
  StatusBar, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import {
  chatReactionPayload,chatTypingPayload,chatReadReceiptPayload,
  HAVANA_V2_DEV_API_BASE_URL, fetchBackendHealth, getChatMediaAvailability, getChatSnapshot, getOlderChatMessages, searchChatMessages, getChatMenuState, getChatMessagePermissions, isWithinChatEditWindow, selectNextQueuedChatMessage, setOutgoingChatStatus, projectOutgoingChatStatus, CHAT_ACK_TIMEOUT_MS, newClientMessageId, uploadChatMediaBatch,
  reconcileChatMessages, reconcileReactions, reconcileUpdatedMessage, reconcileDeletedMessage, reconcileChatSnapshot, startNamedChatSession, restoreNamedChatSession, chatSessionExpired, chatReconnectDelay, reconcileChatReadReceipt, removeChatReactionsForMessage, withoutRemovedChatMessages, ChatHistoryRequestGate, oldestConfirmedChatSeq, mergeOlderChatReactions, CHAT_WS_HANDSHAKE_TIMEOUT_MS, captureChatOfflineSnapshot, restoreChatOfflineOutbox,
  type ChatMessage, type ChatServerEvent, type ChatSession, type ChatReaction, type ChatEmoji, type ChatReadReceipt,
  type MemberScreen,
} from '@havana/shared';
import { loadNativeLocalChat, saveNativeLocalChat } from '../storage/chatStorage';
import type {BubbleAnchor} from '../features/chat/SwipeableBubble';
import NativeChatTimeline from '../features/chat/NativeChatTimeline';
import NativeChatMessageMenu from '../features/chat/NativeChatMessageMenu';
import NativeChatReactionShower,{type ReactionShowerBurst} from '../features/chat/NativeChatReactionShower';
import NativeComposerIcon from '../features/chat/ChatComposerIcon';
import NativeMemberHome from './NativeMemberHome';
import {uploadNativeChatFile} from '../services/native-chat-r2-upload';
import {styles} from '../styles/chat-styles';
import {useNativeMediaSelection} from '../features/chat/useNativeMediaSelection';
import NativeChatMediaQueuePreview from '../features/chat/NativeChatMediaQueuePreview';
import {useNativeKeyboardVisibility} from '../hooks/useNativeKeyboardVisibility';

export default function App() {
  const {width: viewportWidth, height: viewportHeight} = useWindowDimensions();
  const [apiState, setApiState] = useState('conectando…');
  const [name, setName] = useState('');
  const [session, setSession] = useState<ChatSession | null>(null);
  // Access remains the same ChatSession; only the destination changes to HOME.
  const [activeScreen,setActiveScreen]=useState<MemberScreen>('home');
  const previousScreen=useRef<MemberScreen>('home');
  const activeScreenRef=useRef({screen:activeScreen,authorized:!!session});
  activeScreenRef.current={screen:activeScreen,authorized:!!session};
  const navigateTo=(target:MemberScreen)=>{
    if(target==='chat'&&activeScreen!=='chat')previousScreen.current=activeScreen;
    setActiveScreen(target);
  };
  // iOS native: capture only the extreme left edge, never message-reply swipes.
  const iosBackPan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponderCapture:(_,gesture)=>
      Platform.OS==='ios'&&activeScreenRef.current.authorized&&
      activeScreenRef.current.screen==='chat'&&gesture.x0<28&&
      gesture.dx>24&&Math.abs(gesture.dy)<40,
    onPanResponderRelease:(_,gesture)=>{
      if(gesture.dx>72&&Math.abs(gesture.dy)<65){
        Keyboard.dismiss();setMenuMessage(null);setActiveScreen(previousScreen.current);
      }
    },
  })).current;
  const [restoringAccess,setRestoringAccess] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composerPanel,setComposerPanel]=useState<'attachments'|'emojis'|null>(null);
  const mediaUploadBusy=useRef(false);
  const {selectedMedia,setSelectedMedia,mediaError,setMediaError,mediaPicking,chooseNativeMedia}=
    useNativeMediaSelection({uploadBusy:mediaUploadBusy,onCloseMenu:()=>setComposerPanel(null)});
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
  const [searchText,setSearchText] = useState('');
  const [searchOpen,setSearchOpen] = useState(false);
  const keyboardOpen=useNativeKeyboardVisibility();
  const [results,setResults] = useState<ChatMessage[] | null>(null);
  const [searching,setSearching] = useState(false);
  const [editing,setEditing] = useState<ChatMessage | null>(null);
  const [menuMessage,setMenuMessage] = useState<ChatMessage | null>(null);
  const [reactionBurst,setReactionBurst]=useState<ReactionShowerBurst|null>(null);
  const reactionBurstId=useRef(0);
  const [draftFieldHeight,setDraftFieldHeight]=useState(42);
  useEffect(()=>{if(!draft)setDraftFieldHeight(42);},[draft]);
  const [menuAnchor,setMenuAnchor] = useState<BubbleAnchor | null>(null);
  // Android system Back: unwind Chat or another member module before exiting.
  useEffect(()=>{
    if(Platform.OS!=='android')return;
    const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(menuMessage){setMenuMessage(null);return true;}
      if(composerPanel){setComposerPanel(null);return true;}
      if(session&&activeScreen==='chat'){
        Keyboard.dismiss();setActiveScreen(previousScreen.current);return true;
      }
      if(session&&activeScreen!=='home'){setActiveScreen('home');return true;}
      return false;
    });
    return()=>listener.remove();
  },[session,activeScreen,menuMessage,composerPanel]);
  const socket = useRef<WebSocket | null>(null);
  const removedSeq = useRef<Set<number>>(new Set());
  const historyRequests=useRef(new ChatHistoryRequestGate());
  const scroll = useRef<FlatList<ChatMessage> | null>(null);
  useEffect(()=>{
    if(!session){setMediaReady(false);return;}
    let active=true;
    void getChatMediaAvailability(session).then(enabled=>{
      if(active)setMediaReady(enabled);
    }).catch(()=>{if(active)setMediaReady(false);});
    return()=>{active=false;};
  },[session?.token]);
  const autoScroll = useRef(true);
  // Initial load and reopening land at the most recent message, without a long animated scroll.
  const initialHistoryPending = useRef(true);
  const initialHistoryLoaded = useRef(false);
  const initialBottomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialBottomAttempts = useRef(0);
  const userHasScrolled = useRef(false);
  const activeSession = useRef<ChatSession | null>(null);
  const appLifecycle = useRef(AppState.currentState);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionWatchdog=useRef<ReturnType<typeof setTimeout>|null>(null);
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


  function scheduleInitialBottom() {
    if (!initialHistoryPending.current || !initialHistoryLoaded.current || userHasScrolled.current) return;
    // FlatList initially measures a virtualized subset of the history.
    // Keep landing on the real last bubble as later cells are measured.
    scroll.current?.scrollToEnd({animated:false});
    if (initialBottomTimer.current) clearTimeout(initialBottomTimer.current);
    initialBottomTimer.current = setTimeout(() => {
      initialBottomTimer.current = null;
      if (!initialHistoryPending.current || userHasScrolled.current) return;
      initialBottomAttempts.current+=1;
      scroll.current?.scrollToEnd({animated:false});
      if(initialBottomAttempts.current<10)scheduleInitialBottom();
      else initialHistoryPending.current=false;
    }, 120);
  }
  function beginFreshChatViewport() {
    if (initialBottomTimer.current) clearTimeout(initialBottomTimer.current);
    initialBottomTimer.current=null;
    initialHistoryPending.current=true;
    initialHistoryLoaded.current=false;
    initialBottomAttempts.current=0;
    userHasScrolled.current=false;
    autoScroll.current=true;
  }
  // Native Chat is kept mounted behind HOME. Re-entering must not restore
  // the old FlatList offset from the previous visit.
  useEffect(()=>{
    if(activeScreen!=='chat'||!session)return;
    userHasScrolled.current=false;
    autoScroll.current=true;
    initialHistoryPending.current=true;
    initialHistoryLoaded.current=true;
    initialBottomAttempts.current=0;
    scheduleInitialBottom();
    return()=>{
      if(initialBottomTimer.current)clearTimeout(initialBottomTimer.current);
      initialBottomTimer.current=null;
    };
  },[activeScreen,session?.token]);

  function trackUserScroll(event:{nativeEvent:{contentOffset:{y:number};contentSize:{height:number};layoutMeasurement:{height:number}}}) {
    const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
    const gap=contentSize.height-contentOffset.y-layoutMeasurement.height;
    autoScroll.current=gap<90;
  }

  function toggleSearch() {
    historyRequests.current.cancelSearch();setSearching(false);
    setSearchOpen(open=>!open);
    setSearchText('');
    setResults(null);
  }

  function revokeCurrentAccess() {
    clearConnectionWatchdog();
    historyRequests.current.reset();
    setLoadingOlder(false);setSearching(false);setResults(null);
    setActiveScreen('home');
    const previous = socket.current;
    socket.current = null;
    previous?.close();
    clearRetryTimer();
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
  async function searchHistory(){
    const query=searchText.trim();
    if(!session||query.length<2){
      historyRequests.current.cancelSearch();setResults(null);setSearching(false);return;
    }
    const request=historyRequests.current.beginSearch();
    setSearching(true);
    try{
      const found=await searchChatMessages(session,query);
      if(historyRequests.current.isSearchCurrent(request)&&activeSession.current?.token===session.token)
        setResults(withoutRemovedChatMessages(found,removedSeq.current));
    }catch(e){
      if(historyRequests.current.isSearchCurrent(request)&&activeSession.current?.token===session.token)
        setError(e instanceof Error?e.message:'No se pudo buscar');
    }finally{
      if(historyRequests.current.isSearchCurrent(request))setSearching(false);
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
    const timer = acknowledgementTimers.current.get(id);
    if (timer) clearTimeout(timer);
    acknowledgementTimers.current.delete(id);
  }

  function confirmMessage(message: ChatMessage) {
    if (!message.pending && message.senderId === activeSession.current?.actorId) {
      outbox.current.delete(message.clientMessageId);
      clearAck(message.clientMessageId);
      persistLocal();
    }
  }

  function markOutgoing(id: string, state: 'queued' | 'sending' | 'error') {
    const original=setOutgoingChatStatus(outbox.current,id,state);
    if(!original)return;
    persistLocal();
    setMessages(before=>projectOutgoingChatStatus(before,original,state));
  }

  function pauseOutgoing() {
    for (const timer of acknowledgementTimers.current.values()) clearTimeout(timer);
    acknowledgementTimers.current.clear();
    for (const id of outbox.current.keys()) markOutgoing(id, 'queued');
  }

  // Each retry retains the original clientMessageId. D1 UNIQUE(sender_id, id)
  // prevents duplicates if the server stored a message before connection loss.
  function flushOutbox() {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // One canonical ordering and ACK backpressure policy across both clients.
    const item=selectNextQueuedChatMessage(outbox.current.values());
    if(!item)return;
    {
      try {
        ws.send(JSON.stringify({ type: 'chat.send', clientMessageId: item.clientMessageId, text: item.text, replyToSeq: item.replyToSeq || null }));
        markOutgoing(item.clientMessageId, 'sending');
        clearAck(item.clientMessageId);
        const id = item.clientMessageId;
        acknowledgementTimers.current.set(id, setTimeout(() => {
          acknowledgementTimers.current.delete(id);
          markOutgoing(id, 'error');
        }, CHAT_ACK_TIMEOUT_MS));
      } catch {
        markOutgoing(item.clientMessageId, 'error');
      }
    }
  }

  function retryOutgoing(id: string) {
    if (!outbox.current.has(id)) return;
    clearAck(id);
    markOutgoing(id, 'queued');
    flushOutbox();
  }


  function clearRetryTimer() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }
  function clearConnectionWatchdog(){
    if(connectionWatchdog.current!==null)clearTimeout(connectionWatchdog.current);
    connectionWatchdog.current=null;
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
    activeSession.current = next;
    persistLocal();
    if (chatSessionExpired(next)) {
      clearConnectionWatchdog();
      clearRetryTimer();
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
    clearRetryTimer();clearConnectionWatchdog();
    const previous = socket.current;
    if (previous) pauseOutgoing();
    socket.current = null; // previous close events cannot race with a new connection
    previous?.close();
    setConnection('conectando…');
    setError('');

    type NativeWebSocketConstructor = new (
      url: string,
      protocols: string[],
      options: { headers: Record<string, string> },
    ) => WebSocket;
    const NativeWebSocket = WebSocket as unknown as NativeWebSocketConstructor;

    function retry() {
      if (disposed.current || appLifecycle.current !== 'active' || socket.current !== ws ||
        !activeSession.current || retryTimer.current) return;
      pauseOutgoing();
      retryAttempts.current += 1;
      const delay = chatReconnectDelay(retryAttempts.current);
      setConnection('reconectando…');
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        const sessionToRetry = activeSession.current;
        if (sessionToRetry && appLifecycle.current === 'active') {
          connectLatest.current(sessionToRetry);
        }
      }, delay);
    }

    let ws: WebSocket;
    try {
      ws = new NativeWebSocket(
        `${HAVANA_V2_DEV_API_BASE_URL.replace(/^http/, 'ws')}/ws`,
        ['havana-v2'],
        { headers: { Authorization: `Bearer ${next.token}` } },
      );
    } catch {
      setConnection('sin conexión');
      // Constructor errors are exceptional; avoid an indefinite retry loop.
      setError('No se pudo iniciar la conexión. Comprueba la red y pulsa Reconectar.');
      return;
    }
    socket.current = ws;
    // A stalled native handshake must not leave Chat stuck in "conectando".
    connectionWatchdog.current=setTimeout(()=>{
      if(disposed.current||socket.current!==ws||ws.readyState===WebSocket.OPEN)return;
      connectionWatchdog.current=null;
      try{ws.close();}catch{}
      retry();
    },CHAT_WS_HANDSHAKE_TIMEOUT_MS);
    ws.onopen = () => {
      if (disposed.current || socket.current !== ws) return;
      clearConnectionWatchdog();
      retryAttempts.current = 0;
      clearRetryTimer();
      setConnection('en vivo');
      setError('');
      syncMessages(next); // also recovers messages missed in background
    };
    ws.onmessage = event => {
      if (disposed.current || socket.current !== ws) return;
      try {
        const item = JSON.parse(String(event.data)) as ChatServerEvent;
        if (item.type === 'chat.ready') {
          setOnlineActorIds(new Set((item.users??[]).map(user=>user.actorId)));
        } else if (item.type === 'chat.presence') {
          setOnlineActorIds(new Set(item.users.map(user=>user.actorId)));
        } else if (item.type === 'chat.typing') {
          if (item.actorId !== next.actorId) {
            setTyping(item.active ? item.senderName + ' está escribiendo…' : '');
            if (typingTimer.current) clearTimeout(typingTimer.current);
            if (item.active) typingTimer.current = setTimeout(() => setTyping(''), 4300);
          }
        } else if (item.type === 'chat.updated') {
          if(item.message.deletedAt)removedSeq.current.add(item.message.seq);
          setMessages(before=>item.message.deletedAt?
            reconcileDeletedMessage(before,item.message.seq):reconcileUpdatedMessage(before,item.message));
          // Only finish the editor after receiving the server's confirmed update.
          if(editPending.current?.seq===item.message.seq){
            if(!item.message.deletedAt && item.message.text===editPending.current.text)
              finishEditing();
            else abandonPendingEdit('La edición no coincidió con el servidor. Revisa el mensaje antes de reintentar.');
          }
          if(item.message.deletedAt){
            setReactions(before=>removeChatReactionsForMessage(before,item.message.seq));
            setMenuMessage(current=>current?.seq===item.message.seq?null:current);
          }
          setError('');
        } else if (item.type === 'chat.deleted') {
          removedSeq.current.add(item.seq);
          setMessages(before=>reconcileDeletedMessage(before,item.seq));
          setResults(before=>before?.filter(m=>m.seq!==item.seq)??null);
          setReactions(before=>removeChatReactionsForMessage(before,item.seq));
          setReplyTo(current=>current?.seq===item.seq?null:current);
          setMenuMessage(current=>current?.seq===item.seq?null:current);
          setEditing(current=>current?.seq===item.seq?null:current);
        } else if (item.type === 'chat.read') {
          setReceipts(before=>reconcileChatReadReceipt(before,item));
        } else if (item.type === 'chat.reaction') {
          if(!removedSeq.current.has(item.messageSeq))setReactions(before => reconcileReactions(before, item));
        } else if (item.type === 'chat.message') {
          confirmMessage(item.message);
          setMessages(before => removedSeq.current.has(item.message.seq)?before:reconcileChatMessages(before, [item.message]));
          sendReadReceipt(item.message.seq);
          flushOutbox();
        } else if (item.type === 'chat.revoked') {
          revokeCurrentAccess();
        } else if (item.type === 'chat.error') {
          abandonPendingEdit(item.error);
          setError(item.error);
        }
      } catch {
        setError('Evento no válido');
      }
    };
    ws.onerror = () => {
      if (disposed.current || socket.current !== ws) return;
      clearConnectionWatchdog();
      abandonPendingEdit('Conexión interrumpida. El texto editado sigue disponible.');
      retry();
    };
    ws.onclose = event => {
      if (disposed.current || socket.current !== ws) return;
      clearConnectionWatchdog();
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
      let approved:ChatSession | null = saved.session;
      try {approved = await restoreNamedChatSession(saved.session);}
      catch {approved = saved.session;} // Offline: retain local identity and retry once online
      if (disposed.current) return;
      if (!approved) {
        await saveNativeLocalChat(null);
        setName('');
        setError('Acceso no autorizado. Consulta al administrador.');
        return;
      }
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
      connectLatest.current(approved);
    }).catch(() => {}).finally(() => {restoredStorage.current=true;setRestoringAccess(false);});
    void fetchBackendHealth()
      .then(value => { if (!disposed.current) setApiState(value.ok ? 'conectada' : 'error'); })
      .catch(() => { if (!disposed.current) setApiState('error'); });

    const subscription = AppState.addEventListener('change', state => {
      appLifecycle.current = state;
      const currentSession = activeSession.current;
      if (state === 'active' && currentSession) {
        beginFreshChatViewport();
        void restoreNamedChatSession(currentSession).then(valid => {
          if (disposed.current || activeSession.current?.token !== currentSession.token) return;
          if (!valid) {revokeCurrentAccess();return;}
          const ws = socket.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) connectLatest.current(valid);
          else syncLatest.current();
        }).catch(() => {
          // Without a network connection, preserve the existing local session.
          if (activeSession.current?.token === currentSession.token)
            connectLatest.current(currentSession);
        });
      } else if (state === 'background') {
        clearConnectionWatchdog();
        persistLocal();
        clearRetryTimer();
        pauseOutgoing();
        const old = socket.current;
        socket.current = null;
        old?.close();
        if (currentSession) setConnection('pausado');
      }
    });

    return () => {
      disposed.current = true;
      subscription.remove();
      clearRetryTimer();clearConnectionWatchdog();
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
    historyRequests.current.reset();setLoadingOlder(false);setSearching(false);
    editingSnapshot.current=null;
    beforeEdit.current=null;
    setEditing(null);
    beginFreshChatViewport();
    setMessages([]);
    setReceipts([]);
    setResults(null);
    setHasMore(false);
    setSession(next);
    activeSession.current=next;
    persistLocal();
    retryAttempts.current=0;
    connect(next);
  }
  async function join() {
    if(!name.trim()||joining)return;
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
          setSelectedMedia(before=>before.filter(x=>x.id!==item.id));
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

  // One message-action policy across native Android and the iPhone PWA.
  // Keep Android-specific StatusBar and keyboard viewport insets unchanged.
  const {width:menuWidth,top:menuTop,left:menuLeft}=getChatMenuState(
    menuMessage,session?.actorId,connection,menuAnchor,{
      width:viewportWidth,height:viewportHeight,offsetTop:0,
      topPadding:(StatusBar.currentHeight??0)+8,bottomPadding:14,
      maxWidth:220,menuHeight:64,
    });

  return (
    <SafeAreaView {...(Platform.OS==='ios'?iosBackPan.panHandlers:{})}
      style={[styles.screen,keyboardOpen && styles.screenKeyboard]}>
      <StatusBar barStyle="dark-content" />
      {/* Android 16 edge-to-edge can draw the composer behind the IME even with
            adjustResize. Height mode keeps the native chat input and Enviar
            visible above the keyboard without changing the PWA or storage. */}
      <KeyboardAvoidingView style={[styles.flex,session && activeScreen!=='chat' && styles.inactiveChat]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        

        {restoringAccess ? <View style={styles.login}><Text style={styles.description}>Abriendo HAVANA NICE…</Text></View> : !session ? (
          <View style={styles.login}>
            <Text style={styles.overline}>ACCESO HAVANA NICE</Text>
            <Text style={styles.loginTitle}>Bienvenido.</Text>
            <Text style={styles.description}>Escribe tu nombre autorizado la primera vez. En este teléfono se recordará tu acceso.</Text>
            <Text style={styles.label}>Tu nombre</Text>
            <TextInput
              accessibilityLabel="Tu nombre" style={styles.input} value={name}
              onChangeText={setName} maxLength={28} autoCapitalize="none" autoCorrect={false} placeholder="Tu nombre"
            />
            <Pressable onPress={() => void join()} disabled={joining || !name.trim()} style={styles.joinButton}>
              <Text style={styles.joinText}>{joining ? 'Conectando…' : 'Entrar a HAVANA NICE'}</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.footer}>Si no estás autorizado, consulta al administrador.</Text>
          </View>
        ) : (
          <>
            <NativeChatTimeline
              messages={messages} results={results} session={session}
               onlineActorIds={onlineActorIds} connected={connection==='en vivo'}
              reactions={reactions} receipts={receipts}
              hasMore={hasMore} loadingOlder={loadingOlder} scrollRef={scroll}
              onContentSizeChange={()=>{
                if(initialHistoryPending.current)scheduleInitialBottom();
                else if(autoScroll.current)scroll.current?.scrollToEnd({animated:false});
              }}
              onLayout={()=>{
                if(initialHistoryPending.current)scheduleInitialBottom();
                else if(autoScroll.current)scroll.current?.scrollToEnd({animated:false});
              }}
              onScrollBeginDrag={()=>{
                userHasScrolled.current=true;
                initialHistoryPending.current=false;
                if(initialBottomTimer.current)clearTimeout(initialBottomTimer.current);
                initialBottomTimer.current=null;
              }}
              onScroll={event=>{if(userHasScrolled.current)trackUserScroll(event);}}
              onScrollEndDrag={trackUserScroll}
              onLoadOlder={()=>void loadOlder()} onReply={replyToMessage}
              onMessageLongPress={showMessageMenu} onRetry={retryOutgoing}
            />
            <NativeChatMessageMenu message={menuMessage} actorId={session.actorId}
              connection={connection} reactions={reactions}
              left={menuLeft} top={menuTop} width={menuWidth}
              onClose={()=>setMenuMessage(null)}
              onReact={(m,emoji,origin)=>{
                setReactionBurst({id:++reactionBurstId.current,emoji,...origin});
                react(m.seq,emoji);setMenuMessage(null);
              }}
            />
            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
            {connection !== 'en vivo' ? (
              <Pressable onPress={() => { retryAttempts.current = 0; connect(session); }} style={styles.reconnect}>
                <Text style={styles.reconnectText}>Reintentar conexión</Text>
              </Pressable>
            ) : null}
            {editing ? <View style={styles.replyPreview}>
              <Text style={styles.replyPreviewText}>Editando mensaje</Text>
              <Pressable disabled={savingEdit} onPress={finishEditing}>
                <Text style={styles.replyCancel}>Cancelar</Text>
              </Pressable>
            </View>:null}
            {replyTo && !editing ? (
              <View style={styles.replyPreview}>
                <Text style={styles.replyPreviewText}>Respondiendo: {replyTo.text.slice(0,65)}</Text>
                <Pressable onPress={() => setReplyTo(null)}><Text style={styles.replyCancel}>Cancelar</Text></Pressable>
              </View>
            ) : null}
            {typing ? <View style={styles.typingIndicator} accessibilityLiveRegion="polite">
               <Text style={styles.typingIndicatorText}>{typing}</Text>
             </View> : null}
             {selectedMedia.length>0&&<NativeChatMediaQueuePreview
               selectedMedia={selectedMedia} mediaUploading={mediaUploading}
               mediaProgress={mediaProgress} mediaReady={mediaReady}
               onRemove={item=>{
                 const remaining=selectedMedia.filter(x=>x.id!==item.id);
                 setSelectedMedia(remaining);setMediaError('');
               }}
             />}
              {!!mediaError&&<Text style={styles.mediaError}>{mediaError}</Text>}
             <View style={styles.composer}>
               <View style={styles.inputPill}>
                 <Pressable accessibilityRole="button" accessibilityLabel="Insertar emoji"
                   accessibilityState={{expanded:composerPanel==='emojis'}}
                   style={styles.composerIcon} onPress={()=>{Keyboard.dismiss();setComposerPanel(v=>v==='emojis'?null:'emojis');}}>
                   <NativeComposerIcon name="emoji"/>
                 </Pressable>
                 <TextInput accessibilityLabel="Escribir mensaje" style={[styles.draft,{height:draftFieldHeight}]} value={draft}
                   onChangeText={value=>{typeText(value);setComposerPanel(null);}}
                   editable={!savingEdit} maxLength={2000} multiline
                   onContentSizeChange={event=>{
                     const measured=Math.ceil(event.nativeEvent.contentSize.height);
                     setDraftFieldHeight(old=>{
                       const next=Math.max(42,Math.min(132,measured));
                       return next===old?old:next;
                     });
                   }}
                   scrollEnabled={draftFieldHeight>=132} textAlignVertical="top"
                   placeholder={connection==='en vivo'?'Mensaje':'Sin conexión: se enviará después…'}
                   placeholderTextColor="#85898a"/>
                 <Pressable accessibilityRole="button" accessibilityLabel="Adjuntar fotografía o video"
                   accessibilityState={{expanded:composerPanel==='attachments'}} style={styles.composerIcon}
                   onPress={()=>{Keyboard.dismiss();setComposerPanel(v=>v==='attachments'?null:'attachments');}}>
                   <NativeComposerIcon name="clip"/>
                 </Pressable>
                 <Pressable accessibilityRole="button" accessibilityLabel="Abrir cámara"
                   disabled={mediaPicking} style={styles.composerIcon}
                   onPress={()=>void chooseNativeMedia('camera')}>
                   <NativeComposerIcon name="camera"/>
                 </Pressable>
               </View>
               {draft.trim()||editing||selectedMedia.length>0
                 ?<Pressable accessibilityRole="button" accessibilityLabel={editing?'Guardar mensaje':selectedMedia.length?'Enviar archivos originales':'Enviar mensaje'}
                    onPress={()=>selectedMedia.length&&!editing?void sendSelectedMedia():send()} disabled={savingEdit||mediaUploading||(!selectedMedia.length&&!draft.trim())} style={styles.sendCircle}>
                    <NativeComposerIcon name="send" color="#fff"/>
                  </Pressable>
                 :<Pressable accessibilityRole="button" accessibilityLabel="Grabar audio (próximamente)"
                    style={styles.sendCircle}
                    onPress={()=>Alert.alert('Mensajes de voz','Los audios estarán disponibles después de las fotografías y los videos.')}>
                    <NativeComposerIcon name="mic" color="#fff"/>
                  </Pressable>}
             </View>
          </>
        )}
        {session&&composerPanel&&<Pressable style={styles.composerPanelDismiss}
          onPress={()=>setComposerPanel(null)} accessibilityLabel="Cerrar menú"/>}
        {session&&composerPanel==='attachments'&&<View style={styles.attachmentsPopover}
          accessibilityLabel="Adjuntar al chat">
          <Pressable style={styles.attachmentItem} accessibilityRole="button"
            accessibilityLabel="Fotos" onPress={()=>void chooseNativeMedia('gallery','photo')}>
            <View style={[styles.attachmentSymbol,styles.gallerySymbol]}>
              <NativeComposerIcon name="photo" color="#776c98"/>
            </View>
            <Text style={styles.attachmentTitle}>Fotos</Text>
          </Pressable>
          <Pressable style={styles.attachmentItem} accessibilityRole="button"
            accessibilityLabel="Video" onPress={()=>void chooseNativeMedia('gallery','video')}>
            <View style={[styles.attachmentSymbol,styles.videoSymbol]}>
              <NativeComposerIcon name="video" color="#5f8b9b"/>
            </View>
            <Text style={styles.attachmentTitle}>Video</Text>
          </Pressable>
        </View>}
        {session&&composerPanel==='emojis'&&<View style={styles.emojisPopover}
          accessibilityLabel="Elegir emoji">
          {['😀','😂','❤️','👍','🥰','🎉','👏','😍'].map(emoji=>
            <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={'Insertar '+emoji}
              style={styles.emojiOption} onPress={()=>{
                if(!savingEdit&&draft.length+emoji.length<=2000)typeText(draft+emoji);
                setComposerPanel(null);
              }}><Text style={styles.emojiOptionText}>{emoji}</Text></Pressable>)}
        </View>}
      </KeyboardAvoidingView>
      {session&&activeScreen!=='chat'&&<NativeMemberHome token={session.token} displayName={session.displayName}
        active={activeScreen} onNavigate={navigateTo}/>}
      {session&&activeScreen==='chat'&&<NativeChatReactionShower burst={reactionBurst}/>}
    </SafeAreaView>
  );
}
