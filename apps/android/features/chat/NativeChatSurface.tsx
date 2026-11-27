// Presentation only: all callbacks are supplied by the one native Chat controller.
import React from 'react';
import {
 ActivityIndicator,Alert,Keyboard,KeyboardAvoidingView,Platform,Pressable,SafeAreaView,StatusBar,Text,TextInput,View,
} from 'react-native';
import NativeChatTimeline from './NativeChatTimeline';
import NativeChatMessageMenu from './NativeChatMessageMenu';
import NativeChatReactionShower from './NativeChatReactionShower';
import NativeComposerIcon from './ChatComposerIcon';
import NativeChatMediaQueuePreview from './NativeChatMediaQueuePreview';
import NativeChatVoiceRecorder from './NativeChatVoiceRecorder';
import NativeMemberHome from '../../app/NativeMemberHome';
import {useNativePush} from '../notices/useNativePush';
import NativeAudio from '../audio/NativeAudio';
import {useNativeCalendarSignals} from '../calendar/useNativeCalendarSignals';
import NativeCalendarToast from '../calendar/NativeCalendarToast';
import {styles} from '../../styles/chat-styles';
import type {useNativeChatController} from './useNativeChatController';
import type {ChatEmoji,ChatMessage} from '@havana/shared';

export default function NativeChatSurface({ui}:{ui:ReturnType<typeof useNativeChatController>}){
  const {iosBackPan,keyboardOpen,session,activeScreen,restoringAccess,name,setName,join,joining,error,messages,onlineActorIds,connection,reactions,receipts,hasMore,loadingOlder,scroll,onTimelineContentChange,onTimelineScrollBeginDrag,onTimelineScroll,onTimelineScrollEndDrag,onTimelineLoadOlder,onTimelineReply,onTimelineLongPress,onTimelineRetry,onReadVisible,menuMessage,menuLeft,menuTop,menuWidth,setMenuMessage,setReactionBurst,reactionBurstId,react,retryAttempts,connect,editing,savingEdit,finishEditing,replyTo,setReplyTo,typing,selectedMedia,mediaUploading,mediaProgress,mediaReady,removeSelectedMedia,mediaError,sendVoice,voiceDraft,voiceSending,voiceError,discardVoice,cancelMediaUpload,cancelVoice,draft,draftFieldHeight,setDraftFieldHeight,typeText,mediaPicking,mediaPreparation,chooseNativeMedia,cancelNativePicking,sendSelectedMedia,send,composerPanel,setComposerPanel,navigateTo,reactionBurst}=ui;
  const pendingMedia=React.useMemo(()=>{
   if(!mediaUploading)return [];
   const committed=new Set(messages.filter(m=>m.senderId===session?.actorId&&!m.pending&&m.seq>0).map(m=>m.clientMessageId));
   return selectedMedia.filter(item=>!committed.has(item.id));
  },[mediaUploading,selectedMedia,messages,session?.actorId]);
  const calendarSignals=useNativeCalendarSignals(session?.token);
  const push=useNativePush(session?.token??null,navigateTo);
  const reactWithEffect=(message:ChatMessage,emoji:ChatEmoji,origin:{x:number;y:number})=>{
    setReactionBurst({id:++reactionBurstId.current,emoji,...origin});
    react(message.seq,emoji);
    setMenuMessage(null);
  };
  return (
    <SafeAreaView {...(Platform.OS==='ios'?iosBackPan.panHandlers:{})}
      style={[styles.screen,restoringAccess&&styles.screenLaunch,keyboardOpen&&styles.screenKeyboard]}>
      <StatusBar barStyle={restoringAccess?'light-content':'dark-content'}/>
      {/* Android 16 edge-to-edge can draw the composer behind the IME even with
            adjustResize. Height mode keeps the native chat input and Enviar
            visible above the keyboard without changing the PWA or storage. */}
      {(!session||activeScreen==='chat'||restoringAccess)&&<KeyboardAvoidingView style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        

        {restoringAccess ? <View style={styles.brandedLaunch}>
          <Text style={styles.brandedLaunchTitle}>HAVANA NICE</Text>
          <Text style={styles.brandedLaunchSub}>ESPACIO DEL EQUIPO</Text>
          <ActivityIndicator size="large" color="#DBC59A" style={styles.brandedLaunchSpinner}/>
          <Text style={styles.brandedLaunchHint}>Abriendo tu espacio…</Text>
         </View> : !session ? (
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
              messages={messages} session={session}
               onlineActorIds={onlineActorIds} connected={connection==='en vivo'}
              reactions={reactions} receipts={receipts} onReadVisible={onReadVisible}
              hasMore={hasMore} loadingOlder={loadingOlder} scrollRef={scroll}
              onContentSizeChange={onTimelineContentChange}
              onLayout={onTimelineContentChange}
              onScrollBeginDrag={onTimelineScrollBeginDrag}
              onScroll={onTimelineScroll}
              onScrollEndDrag={onTimelineScrollEndDrag}
              onLoadOlder={onTimelineLoadOlder} onReply={onTimelineReply}
              onMessageLongPress={onTimelineLongPress}
              onQuickReact={reactWithEffect} onRetry={onTimelineRetry}
              pendingMedia={pendingMedia} pendingUploading={mediaUploading} pendingProgress={mediaProgress} onCancelPending={cancelMediaUpload}
            />
            <NativeChatMessageMenu message={menuMessage} actorId={session.actorId}
              connection={connection} reactions={reactions}
              left={menuLeft} top={menuTop} width={menuWidth}
              onClose={()=>setMenuMessage(null)}
              onReact={reactWithEffect}
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
             {mediaPicking&&<View style={styles.replyPreview}>
               <Text style={styles.replyPreviewText}>{mediaPreparation||'Preparando selección de Android…'}</Text>
               <Pressable accessibilityRole="button" onPress={cancelNativePicking}><Text style={styles.replyCancel}>Cancelar</Text></Pressable>
             </View>}
             {selectedMedia.length>0&&!mediaUploading&&<NativeChatMediaQueuePreview
               selectedMedia={selectedMedia} mediaUploading={mediaUploading}
               mediaProgress={mediaProgress} mediaReady={mediaReady}
               onRemove={item=>removeSelectedMedia(item.id)}
             />}
              {!!mediaError&&<Text style={styles.mediaError}>{mediaError}</Text>}
              {voiceDraft&&<View style={styles.voiceStatus}>
                <Text style={styles.replyPreviewText}>{voiceSending?'Enviando nota de voz…':voiceError||'Nota de voz pendiente'}</Text>
                {voiceSending?<Pressable accessibilityRole="button" onPress={cancelVoice}><Text style={styles.replyCancel}>Cancelar</Text></Pressable>:<View style={styles.voiceStatusActions}>
                 <Pressable accessibilityRole="button" onPress={()=>void sendVoice(voiceDraft.uri,voiceDraft.id)}><Text style={styles.replyCancel}>Reintentar</Text></Pressable>
                 <Pressable accessibilityRole="button" onPress={discardVoice}><Text style={styles.replyCancel}>Descartar</Text></Pressable>
                </View>}
              </View>}
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
                   placeholder={connection==='en vivo'?'Mensaje':'Sin conexión…'}
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
               {draft.trim()||editing||(!mediaUploading&&selectedMedia.length>0)
                 ?<Pressable accessibilityRole="button" accessibilityLabel={editing?'Guardar mensaje':!mediaUploading&&selectedMedia.length?'Enviar archivos':'Enviar mensaje'}
                    onPress={()=>selectedMedia.length&&!editing&&!mediaUploading?void sendSelectedMedia():send()} disabled={savingEdit||(!editing&&!mediaUploading&&selectedMedia.length>0&&voiceSending)||((mediaUploading||!selectedMedia.length)&&!draft.trim())||(!editing&&mediaPicking&&selectedMedia.length>0)} style={styles.sendCircle}>
                    <NativeComposerIcon name="send" color="#fff"/>
                  </Pressable>
                 :<NativeChatVoiceRecorder disabled={mediaUploading||!!voiceDraft||voiceSending}
                    onSend={sendVoice}/>}
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
      </KeyboardAvoidingView>}
      {session&&activeScreen!=='chat'&&<NativeMemberHome token={session.token} actorId={session.actorId} displayName={session.displayName}
        active={activeScreen} calendarRevision={calendarSignals.revision} lists={calendarSignals.lists} onNavigate={navigateTo} push={push}/>}
      {session&&<NativeCalendarToast visible={calendarSignals.notice}
       onDismiss={calendarSignals.dismiss}/>}
      {/* Keep one system MediaSession mounted even when the user returns to Chat. */}
      {session&&<NativeAudio token={session.token} key={session.token} visible={activeScreen==='audio'}
        onClose={()=>navigateTo('repertoire')}/>}
      {session&&activeScreen==='chat'&&<NativeChatReactionShower burst={reactionBurst}/>}
    </SafeAreaView>
  );
}
