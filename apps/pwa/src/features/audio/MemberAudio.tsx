import {useCallback,useEffect,useRef,useState} from 'react';
import {getAudioTracks,clearAudioTracksCache,privateAudioUrl,type AudioTrack} from '@havana/shared';
import {prepareAudioCover,type PreparedAudioCover} from './audio-cover-cache';
import './audio-player.css';

const clock=(time:number)=>!Number.isFinite(time)?'0:00':
 `${Math.floor(Math.max(0,time)/60)}:${String(Math.floor(Math.max(0,time)%60)).padStart(2,'0')}`;
const art=(value:string|null)=>privateAudioUrl(value);
export default function MemberAudio({token,active=true}:{token:string;active?:boolean}){
 const [tracks,setTracks]=useState<AudioTrack[]>([]);
 const [selected,setSelected]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [buffering,setBuffering]=useState(false);
 const [elapsed,setElapsed]=useState(0);
 const [duration,setDuration]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [preparedCovers,setPreparedCovers]=useState<Record<string,PreparedAudioCover>>({});
 const recoveryTried=useRef(new Set<string>());
 const pendingSeek=useRef<{id:string;time:number}|null>(null);
 const lastCatalogFetch=useRef(0);
 const ref=useRef<HTMLAudioElement>(null);
 const playOnChange=useRef(false);
 const requestedPlay=useRef(false);
 const current=tracks[selected]||null;
 const refresh=useCallback(async(force=false)=>{
  try{const value=await getAudioTracks(token,false,force);lastCatalogFetch.current=Date.now();
   setTracks(value);setSelected(n=>Math.max(0,Math.min(n,value.length-1)));
   recoveryTried.current.clear();setError('');}
  catch(e){setError(e instanceof Error?e.message:'La biblioteca de Audio no está disponible.');}
  finally{setLoading(false);}
 },[token]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>()=>clearAudioTracksCache(token),[token]);
 // Keep temporary media grants fresh when returning to the app after a long
 // lock-screen session. Do not interrupt an actively playing track.
 useEffect(()=>{
  const check=()=>{
   if(document.visibilityState!=='visible'||!ref.current?.paused||
    Date.now()-lastCatalogFetch.current<=40*60*1000)return;
   if(current&&ref.current.currentTime>0)
    pendingSeek.current={id:current.id,time:ref.current.currentTime};
   void refresh(true);
  };
  document.addEventListener('visibilitychange',check);
  return()=>document.removeEventListener('visibilitychange',check);
 },[refresh,current?.id]);
 // Decode private covers once for the vinyl and track list. Lock-screen
 // artwork uses a same-origin HTTPS capability and never this Blob.
 useEffect(()=>{
  const controller=new AbortController(),created:string[]=[];
  let live=true;
  setPreparedCovers({});
  const wanted=tracks.filter(t=>!!art(t.coverUrl)).slice(0,4);
  let cursor=0;
  const prepare=async()=>{
   while(live&&cursor<wanted.length){
    const track=wanted[cursor++];
    const url=art(track?.coverUrl||null);
    if(!track||!url)continue;
    try{
     const ready=await prepareAudioCover(url,controller.signal);
     if(!live){
      URL.revokeObjectURL(ready.display);
      continue;
     }
     created.push(ready.display);
     setPreparedCovers(old=>({...old,[track.id]:ready}));
    }catch{/* Keep the live R2 URL as a visual fallback. */}
   }
  };
  // One small artwork task: avoid competing with the audio range request.
  void prepare();
  return()=>{
   live=false;controller.abort();created.forEach(url=>URL.revokeObjectURL(url));
  };
 },[tracks]);

 useEffect(()=>{
  const audio=ref.current;if(!audio||!current)return;
  const url=art(current.audioUrl)||'';
  // A tap can set src and invoke play() synchronously. Do not tear that
  // playback down in the React effect that follows the state update.
  if(audio.src===url)return;
  audio.pause();setPlaying(false);setBuffering(false);
  setElapsed(0);setDuration(0);
  requestedPlay.current=playOnChange.current;
  audio.src=url;
  if(playOnChange.current){playOnChange.current=false;
   setBuffering(true);
   void audio.play().catch(()=>{
    setBuffering(false);requestedPlay.current=false;
    // iOS may require a fresh user gesture after a token refresh.
    // Do not report that normal browser policy as a media failure.
   });
  }else{
   // Do not force a full media download merely by opening HOME.
   audio.preload='metadata';
  }
 },[current?.id,current?.audioUrl]);
 const recoverMedia=async(failedId=current?.id)=>{
  const old=tracks.find(track=>track.id===failedId);
  if(!old||recoveryTried.current.has(old.id)){
   setError('Este audio no pudo reproducirse. Pulsa Actualizar para reintentar.');return;
  }
  const failedUrl=ref.current?.src;

  recoveryTried.current.add(old.id);
  const wasPlaying=requestedPlay.current||!!ref.current&&!ref.current.paused;
  pendingSeek.current={id:old.id,time:ref.current?.currentTime||0};
  setError('');
  try{
   const latest=await getAudioTracks(token,false,true);
   const position=latest.findIndex(track=>track.id===old.id);
   if(position<0)throw new Error('El archivo ya no está disponible.');
   // Ignore a late refresh from a track the listener has already skipped.
   if(ref.current?.src!==failedUrl)return;
   playOnChange.current=wasPlaying;
   lastCatalogFetch.current=Date.now();
   setTracks(latest);setSelected(position);
  }catch(e){
   pendingSeek.current=null;playOnChange.current=false;
   setError(e instanceof Error?e.message:'No fue posible renovar el acceso al audio.');
  }
 };
 const playTrack=(position:number)=>{
  const audio=ref.current,track=tracks[position];
  if(!audio||!track)return;
  const url=art(track.audioUrl);
  if(!url)return;
  setError('');
  requestedPlay.current=true;
  setBuffering(true);
  // Assign and start the selected media within THIS user gesture, before
  // React runs effects. Safari cannot autoplay a different src after render.
  if(audio.src!==url){
   audio.pause();setPlaying(false);setElapsed(0);setDuration(0);
   audio.preload='auto';audio.src=url;
  }
  playOnChange.current=false;
  setSelected(position);
  void audio.play().catch(error=>{
   if(audio.src!==url)return; // an older song was superseded while loading
   requestedPlay.current=false;setBuffering(false);
   if(error instanceof Error&&
    (error.name==='NotAllowedError'||error.name==='AbortError'))return;
   void recoverMedia(track.id);
  });
 };
 const toggle=()=>{
  const audio=ref.current;if(!audio||!current)return;
  if(audio.paused)playTrack(selected);
  else{requestedPlay.current=false;audio.pause();setBuffering(false);}
 };
 const step=(direction:number)=>{
  if(!tracks.length)return;
  const next=(selected+direction+tracks.length)%tracks.length;
  if(next===selected){if(ref.current){ref.current.currentTime=0;playTrack(next);}return;}
  if(playing||buffering)playTrack(next);
  else setSelected(next);
 };
 // iOS Now Playing fetches artwork from an independent system process.
 // An opaque Blob or cross-origin workers.dev URL may not load there.
 // The private grant is proxied on our OWN HTTPS origin; it still expires
 // and the backend rejects invalid grants. Do not store the grant or log it.
 useEffect(()=>{
  if(!current||!('mediaSession' in navigator)||typeof MediaMetadata==='undefined')return;
  const remoteCover=art(current.coverUrl);
  let artworkUrl='';
  if(remoteCover){
   const token=new URL(remoteCover).pathname.match(/^\/api\/audio\/media\/([a-f0-9]{32})$/)?.[1];
   if(token)artworkUrl=new URL('/api/audio/artwork/'+token,window.location.origin).href;
  }
  navigator.mediaSession.metadata=new MediaMetadata({
   title:current.title,artist:current.artist,album:current.album,
   artwork:artworkUrl?[{src:artworkUrl}]:[]
  });
 },[current?.id,current?.coverUrl,current?.title,current?.artist,current?.album]);
 // Controls may change with the selected index, but must never reinitialize
 // lock-screen artwork just because playback or a preloaded cover changed.
 useEffect(()=>{
  if(!('mediaSession' in navigator))return;
  const session=navigator.mediaSession;
  const actions:MediaSessionAction[]=['play','pause','previoustrack','nexttrack','seekto'];
  try{
   session.setActionHandler('play',()=>{void ref.current?.play();});
   session.setActionHandler('pause',()=>ref.current?.pause());
   session.setActionHandler('previoustrack',()=>step(-1));
   session.setActionHandler('nexttrack',()=>step(1));
   session.setActionHandler('seekto',event=>{
    if(ref.current&&Number.isFinite(event.seekTime))ref.current.currentTime=event.seekTime||0;
   });
  }catch{/* Older Safari versions offer only some Media Session actions. */}
  return()=>{for(const action of actions){
   try{session.setActionHandler(action,null);}catch{}
  }};
 },[selected,tracks.length]);
 useEffect(()=>{
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.playbackState=playing?'playing':'paused';
 },[playing]);
 const cover=current?(preparedCovers[current.id]?.display||art(current.coverUrl)):null;
 const progress=duration>0?Math.max(0,Math.min(100,elapsed/duration*100)):0;
 const isBuffering=buffering&&!playing;
 return <section className="hn-audio hn-audio-editorial" aria-label="Audio HAVANA NICE" hidden={!active}>
  <div className="hn-audio-parchment">
   <div className="hn-audio-paper-tear" aria-hidden="true"/>
   <div className="hn-audio-paper-title">
    <span>SESIÓN PRIVADA</span>
    <h2>Private Listening Lounge</h2>
    <div className="hn-audio-divider" aria-hidden="true">♬</div>
    <p>Audios y canciones del equipo</p>
   </div>
   <button className="hn-audio-refresh" type="button" onClick={()=>void refresh(true)}
    aria-label="Actualizar la biblioteca de audio" disabled={loading}>Actualizar</button>
   {!!error&&!current&&<p className="hn-audio-error" role="alert">{error}</p>}
   {loading&&!current?<div className="hn-audio-empty" role="status">Abriendo Audio HAVANA NICE…</div>:!current?
    <div className="hn-audio-empty"><strong>Próximamente, tus canciones aquí.</strong>
     <p>Los audios y sus portadas aparecerán automáticamente cuando Administración los publique.</p>
    </div>:<>
    <div className="hn-audio-player">
     <div className="hn-audio-flowers" aria-hidden="true"/>
     <div className="hn-audio-record-wrap">
      <div className={playing?'hn-audio-vinyl is-playing':'hn-audio-vinyl'}
       role="img" aria-label={`Vinilo con la portada de ${current.title}`}>
       {cover?<img src={cover} alt="" decoding="async" loading="eager"/>:
        <span className="hn-audio-monogram">HN</span>}
       <span className="hn-audio-vinyl-grooves" aria-hidden="true"/>
       <span className="hn-audio-vinyl-spindle" aria-hidden="true"/>
      </div>
     </div>
     <div className="hn-audio-details">
      <span className="hn-audio-label">AHORA SUENA</span>
      <h3>{current.title}</h3><p>{current.artist}</p>
     </div>
     <div className="hn-audio-seek">
      <div className="hn-audio-timeline">
       <time>{clock(elapsed)}</time>
       <input aria-label="Posición de reproducción" type="range" min={0} max={Math.max(1,duration)}
        step={1} value={Math.min(elapsed,Math.max(1,duration))}
        style={{background:`linear-gradient(to right,#215139 ${progress}%,#dedbd4 ${progress}%)`}}
        onChange={event=>{if(ref.current)ref.current.currentTime=Number(event.target.value);}}/>
       <time>{clock(duration)}</time>
      </div>
     </div>
     <div className="hn-audio-controls">
      <button type="button" onClick={()=>step(-1)} aria-label="Audio anterior">‹‹</button>
      <button type="button" onClick={()=>void toggle()} className="hn-audio-main"
       aria-label={isBuffering?'Cargando canción':playing?'Pausar':'Reproducir'}
       aria-busy={isBuffering}>{isBuffering?'◌':playing?'Ⅱ':'▶'}</button>
      <button type="button" onClick={()=>step(1)} aria-label="Audio siguiente">››</button>
     </div>
    </div>
    <div className="hn-audio-list-title"><span>Recientes</span></div>
    <div className="hn-audio-track-list" aria-label="Canciones disponibles">
     {tracks.map((track,i)=><button key={track.id} type="button"
      className={i===selected?'hn-audio-track selected':'hn-audio-track'}
      onClick={()=>{if(i!==selected)playTrack(i);else toggle();}}>
      {art(track.coverUrl)?<img alt="" src={preparedCovers[track.id]?.display||art(track.coverUrl)!} loading="lazy" decoding="async"/>:
       <span className="hn-audio-track-fallback">♫</span>}
      <span><strong>{track.title}</strong><small>{track.artist}</small></span>
      <span aria-hidden="true">{i===selected&&isBuffering?'◌':i===selected&&playing?'Ⅱ':'▶'}</span>
     </button>)}
    </div>
   </>}
   <div className="hn-audio-paper-corner" aria-hidden="true"/>
  </div>
  <audio ref={ref} preload="metadata"
   onPlay={()=>{requestedPlay.current=true;setBuffering(true);}}
   onPlaying={()=>{requestedPlay.current=true;setPlaying(true);setBuffering(false);}}
   onWaiting={()=>{setPlaying(false);setBuffering(true);}}
   onStalled={()=>{setPlaying(false);setBuffering(true);}}
   onPause={()=>{requestedPlay.current=false;setPlaying(false);setBuffering(false);}}
   onTimeUpdate={event=>setElapsed(event.currentTarget.currentTime)}
   onDurationChange={event=>setDuration(event.currentTarget.duration||0)}
   onLoadedMetadata={event=>{
    const seek=pendingSeek.current;
    if(current&&seek?.id===current.id){
     if(Number.isFinite(seek.time))event.currentTarget.currentTime=
      Math.min(Math.max(0,seek.time),Math.max(0,event.currentTarget.duration-1||0));
     pendingSeek.current=null;
    }
   }}
   onEnded={()=>step(1)}
   onError={()=>{setBuffering(false);setPlaying(false);void recoverMedia();}}/>
 </section>;
}
