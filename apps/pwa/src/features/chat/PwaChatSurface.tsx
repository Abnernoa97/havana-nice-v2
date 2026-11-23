import {lazy,Suspense,useLayoutEffect,useEffect} from 'react';
import {getChatMenuState,logMemberActivity} from '@havana/shared';
import type {PwaChatUI} from './usePwaChatController';
import ChatTimeline from './ChatTimeline';
import PwaChatMessageMenu from './PwaChatMessageMenu';
import PwaChatMediaQueuePreview from './PwaChatMediaQueuePreview';
import PwaChatVoiceRecorder from './PwaChatVoiceRecorder';
import PwaMemberAccessPanel from './PwaMemberAccessPanel';
import ComposerIcon from './ChatComposerIcon';
import {useMemberCalendarSignals} from '../calendar/useMemberCalendarSignals';

// Presentation only. Neither authentication nor WebSocket/storage live here.
const VisualApp=lazy(()=>import('../../app/VisualApp'));
const PwaReaderRoute=lazy(()=>import('../../app/PwaReaderRoute'));

export default function PwaChatSurface({ui}:{ui:PwaChatUI}){
  const {
    session,activeScreen,readerRoute,closeReader,navigateTo,closeChat,edgeSwipeStart,
  restoringAccess,name,joining,error,setName,join,messages,latestMessageRequest,
  onlineActorIds,connection,reactions,receipts,hasMore,loadingOlder,
  pauseFollow,resumeLatest,onTimelineLoadOlder,onTimelineReply,onTimelineLongPress,onTimelineRetry,bottom,
  menuMessage,menuAnchor,setMenuMessage,react,reconnect,editing,savingEdit,finishEditing,
  replyTo,setReplyTo,typing,composerPanel,setComposerPanel,openGalleryMedia,insertEmoji,
  photosPicker,videoPicker,cameraPicker,chooseMedia,selectedMedia,mediaUploading,
  photoPreparing,mediaProgress,mediaReady,removeSelectedMedia,mediaError,sendSelectedMedia,sendVoice,
  send,draft,draftInput,typeText,openCamera
  }=ui;
  const calendarSignals=useMemberCalendarSignals(session?.token);
  useEffect(()=>{
   if(session?.token)void logMemberActivity(session.token,'module.open',activeScreen,'iphone');
  },[session?.token,activeScreen]);
  useLayoutEffect(()=>{
    const field=draftInput.current;
    if(!field)return;
    field.style.height='0px';
    field.style.height=Math.min(132,Math.max(46,field.scrollHeight))+'px';
  },[draft]);
  // Shared policy keeps edit/delete windows identical on iPhone and Android.
  // Browser visual viewport offsets still protect the keyboard and notch.
  const {width:menuWidth,top:menuTop,left:menuLeft}=getChatMenuState(
    menuMessage,session?.actorId,connection,menuAnchor,{
      width:window.innerWidth,
      height:window.visualViewport?.height??window.innerHeight,
      offsetTop:window.visualViewport?.offsetTop??0,
      topPadding:10,bottomPadding:10,maxWidth:220,menuHeight:64,
    });
  return (
    <>
      {session&&calendarSignals.notice&&<button type="button"
       className="hn-calendar-live-alert" role="status"
       onClick={calendarSignals.dismiss}>HAVANANICE-CALENDARIO📆</button>}
      {session&&activeScreen!=='chat'&&<Suspense fallback={<div className="visual-shell" role="status">Abriendo espacio del equipo…</div>}>
        {readerRoute?<PwaReaderRoute token={session.token} route={readerRoute} onClose={closeReader}/>:
         <VisualApp displayName={session.displayName} actorId={session.actorId}
          active={activeScreen} token={session.token} calendarRevision={calendarSignals.revision} onNavigate={navigateTo}/>}
      </Suspense>}
      {(!session||activeScreen==='chat')&&<div className="member-chat-visible">
    <main className="chat-app" onTouchStart={event=>{
        const t=event.touches[0];
        const isIphone=/iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone=window.matchMedia('(display-mode: standalone)').matches||
          (navigator as Navigator&{standalone?:boolean}).standalone===true;
        const onBubble=(event.target as Element).closest?.('.bubble');
        edgeSwipeStart.current=activeScreen==='chat'&&isIphone&&standalone&&
          t&&t.clientX<26&&!onBubble?{x:t.clientX,y:t.clientY}:null;
      }} onTouchEnd={event=>{
        const start=edgeSwipeStart.current,t=event.changedTouches[0];
        edgeSwipeStart.current=null;
        if(start&&t&&t.clientX-start.x>72&&Math.abs(t.clientY-start.y)<65)closeChat();
      }} onTouchCancel={()=>{edgeSwipeStart.current=null;}}>
      

      {restoringAccess || !session ? (
        <PwaMemberAccessPanel
          mode={restoringAccess?'restoring':readerRoute?'reader-denied':'join'}
          name={name} joining={joining} error={error}
          onNameChange={setName} onJoin={()=>{void join();}} onCloseReader={closeReader}/>
      ) : (
        <>
          <ChatTimeline messages={messages} latestMessageRequest={latestMessageRequest}
            actorId={session.actorId} token={session.token}
             onlineActorIds={onlineActorIds} connected={connection==='en vivo'}
            reactions={reactions} receipts={receipts}
            hasMore={hasMore} loadingOlder={loadingOlder}
            onBrowseOlder={pauseFollow} onReturnLatest={resumeLatest}
            onLoadOlder={onTimelineLoadOlder} onReply={onTimelineReply}
            onMessageLongPress={onTimelineLongPress} onRetry={onTimelineRetry}
            bottomRef={bottom}/>
          <PwaChatMessageMenu message={menuMessage} actorId={session.actorId}
            connection={connection} reactions={reactions}
            left={menuLeft} top={menuTop} width={menuWidth}
            onClose={()=>setMenuMessage(null)}
            onReact={(m,emoji)=>{react(m.seq,emoji);setMenuMessage(null);}}
          />
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
            onChange={e=>{
              chooseMedia('camera','photo',Array.from(e.currentTarget.files||[]));
              e.currentTarget.value='';
            }}/>
          {selectedMedia.length>0&&<PwaChatMediaQueuePreview
            selectedMedia={selectedMedia} mediaUploading={mediaUploading}
            photoPreparing={photoPreparing} mediaProgress={mediaProgress} mediaReady={mediaReady}
            onRemove={removeSelectedMedia}
          />}
          {mediaError&&<p className="chat-media-error" role="alert">{mediaError}</p>}
          <form className="chat-composer" onSubmit={event=>{event.preventDefault();if(selectedMedia.length&&!editing)void sendSelectedMedia();else send();}}>
            <div className="chat-input-pill">
              <button type="button" className="chat-icon-button chat-emoji-button"
                aria-label="Insertar emoji" aria-expanded={composerPanel==='emojis'}
                onClick={()=>setComposerPanel(p=>p==='emojis'?null:'emojis')}>
                <ComposerIcon name="emoji" size={25}/>
              </button>
              <textarea aria-label="Escribir mensaje" ref={draftInput}
                rows={1} disabled={savingEdit} value={draft} maxLength={2000}
                onChange={event=>{typeText(event.target.value);setComposerPanel(null);}}
                placeholder={connection==='en vivo'?'Mensaje':'Sin conexión: se enviará después…'}/>
              <button type="button" className="chat-icon-button" aria-label="Adjuntar fotografía o video"
                aria-expanded={composerPanel==='attachments'}
                disabled={mediaUploading}
                onClick={()=>setComposerPanel(p=>p==='attachments'?null:'attachments')}>
                <ComposerIcon name="clip" size={25}/>
              </button>
              <button type="button" className="chat-icon-button" aria-label="Abrir cámara"
                disabled={mediaUploading} onClick={openCamera}>
                <ComposerIcon name="camera" size={25}/>
              </button>
            </div>
            {draft.trim()||editing||selectedMedia.length>0
              ?<button type="submit" className="chat-action-circle" aria-label={editing?'Guardar mensaje':selectedMedia.length?'Enviar archivos originales':'Enviar mensaje'}
                  disabled={savingEdit||mediaUploading||(!selectedMedia.length&&!draft.trim())}>
                  <ComposerIcon name="send" size={24}/>
                </button>
              :<PwaChatVoiceRecorder disabled={!mediaReady||mediaUploading}
                  onSend={sendVoice}/>} 
          </form>
        </>
      )}
    </main>
      </div>}
    </>
  );
}
