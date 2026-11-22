import {useCallback,useEffect,useRef,useState} from 'react';
import {getAudioTracks,privateAudioUrl,type AudioTrack} from '@havana/shared';
import './audio-player.css';

const clock=(time:number)=>!Number.isFinite(time)?'0:00':
 `${Math.floor(Math.max(0,time)/60)}:${String(Math.floor(Math.max(0,time)%60)).padStart(2,'0')}`;
const art=(value:string|null)=>privateAudioUrl(value);
export default function MemberAudio({token,active=true}:{token:string;active?:boolean}){
 const [tracks,setTracks]=useState<AudioTrack[]>([]);
 const [selected,setSelected]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [elapsed,setElapsed]=useState(0);
 const [duration,setDuration]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const ref=useRef<HTMLAudioElement>(null);
 const playOnChange=useRef(false);
 const current=tracks[selected]||null;
 const refresh=useCallback(async()=>{
  try{const value=await getAudioTracks(token);setTracks(value);
   setSelected(n=>Math.max(0,Math.min(n,value.length-1)));setError('');}
  catch(e){setError(e instanceof Error?e.message:'La biblioteca de Audio no está disponible.');}
  finally{setLoading(false);}
 },[token]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  const audio=ref.current;if(!audio)return;
  audio.pause();setPlaying(false);setElapsed(0);setDuration(0);
  if(!current)return;
  audio.src=art(current.audioUrl)||'';audio.load();
  if(playOnChange.current){playOnChange.current=false;
   void audio.play().catch(()=>setError('Toca reproducir para escuchar el audio.'));}
 },[current?.id,current?.audioUrl]);
 const toggle=async()=>{
  const audio=ref.current;if(!audio||!current)return;
  if(audio.paused)await audio.play().catch(()=>setError('No se pudo reproducir este audio.'));
  else audio.pause();
 };
 const step=(direction:number)=>{
  if(!tracks.length)return;
  const next=(selected+direction+tracks.length)%tracks.length;
  if(next===selected){if(ref.current){ref.current.currentTime=0;void ref.current.play();}return;}
  playOnChange.current=playing;
  setSelected(next);
 };
 // Reuse the album cover in Android/iOS media controls through Media Session.
 useEffect(()=>{
  if(!current||!('mediaSession' in navigator))return;
  const session=navigator.mediaSession;
  session.metadata=new MediaMetadata({
   title:current.title,artist:current.artist,album:current.album,
   artwork:art(current.coverUrl)?[{src:art(current.coverUrl)!,sizes:'512x512'}]:[]
  });
  session.setActionHandler('play',()=>{void ref.current?.play();});
  session.setActionHandler('pause',()=>ref.current?.pause());
  session.setActionHandler('previoustrack',()=>step(-1));
  session.setActionHandler('nexttrack',()=>step(1));
  session.setActionHandler('seekto',event=>{
   if(ref.current&&Number.isFinite(event.seekTime))ref.current.currentTime=event.seekTime||0;
  });
  return()=>{
   for(const action of ['play','pause','previoustrack','nexttrack','seekto'] as MediaSessionAction[]){
    try{session.setActionHandler(action,null);}catch{}
   }
  };
 },[current?.id,selected,tracks.length,playing]);
 useEffect(()=>{
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.playbackState=playing?'playing':'paused';
 },[playing]);
 const cover=art(current?.coverUrl||null);
 const progress=duration>0?Math.max(0,Math.min(100,elapsed/duration*100)):0;
 return <section className="hn-audio hn-audio-editorial" aria-label="Audio HAVANA NICE" hidden={!active}>
  <div className="hn-audio-parchment">
   <div className="hn-audio-paper-tear" aria-hidden="true"/>
   <div className="hn-audio-fold" aria-hidden="true"/>
   <div className="hn-audio-paper-title">
    <span>SESIÓN PRIVADA</span>
    <h2>Private Listening Lounge</h2>
    <div className="hn-audio-divider" aria-hidden="true">♬</div>
    <p>Audios y canciones del equipo</p>
   </div>
   <button className="hn-audio-refresh" type="button" onClick={()=>void refresh()}
    aria-label="Actualizar la biblioteca de audio" disabled={loading}>Actualizar</button>
   {!!error&&<p className="hn-audio-error" role="alert">{error}</p>}
   {loading&&!current?<div className="hn-audio-empty" role="status">Abriendo Audio HAVANA NICE…</div>:!current?
    <div className="hn-audio-empty"><strong>Próximamente, tus canciones aquí.</strong>
     <p>Los audios y sus portadas aparecerán automáticamente cuando Administración los publique.</p>
    </div>:<>
    <div className="hn-audio-player">
     <div className="hn-audio-flowers" aria-hidden="true">
      <span className="hn-audio-silk hn-audio-silk-left"/><span className="hn-audio-silk hn-audio-silk-right"/>
      <span className="hn-audio-flower hn-audio-flower-left">{Array.from({length:5},(_,i)=><i key={i}/>)}</span>
      <span className="hn-audio-flower hn-audio-flower-right">{Array.from({length:5},(_,i)=><i key={i}/>)}</span>
     </div>
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
       aria-label={playing?'Pausar':'Reproducir'}>{playing?'Ⅱ':'▶'}</button>
      <button type="button" onClick={()=>step(1)} aria-label="Audio siguiente">››</button>
     </div>
    </div>
    <div className="hn-audio-list-title"><span>Recientes</span></div>
    <div className="hn-audio-track-list" aria-label="Canciones disponibles">
     {tracks.map((track,i)=><button key={track.id} type="button"
      className={i===selected?'hn-audio-track selected':'hn-audio-track'}
      onClick={()=>{if(i!==selected){playOnChange.current=true;setSelected(i);}
       else void toggle();}}>
      {art(track.coverUrl)?<img alt="" src={art(track.coverUrl)!} loading="lazy" decoding="async"/>:
       <span className="hn-audio-track-fallback">♫</span>}
      <span><strong>{track.title}</strong><small>{track.artist}</small></span>
      <span aria-hidden="true">{i===selected&&playing?'Ⅱ':'▶'}</span>
     </button>)}
    </div>
   </>}
   <div className="hn-audio-paper-corner" aria-hidden="true"/>
  </div>
  <audio ref={ref} preload="metadata"
   onPlay={()=>setPlaying(true)} onPlaying={()=>setPlaying(true)}
   onPause={()=>setPlaying(false)}
   onTimeUpdate={event=>setElapsed(event.currentTarget.currentTime)}
   onDurationChange={event=>setDuration(event.currentTarget.duration||0)}
   onEnded={()=>step(1)}
   onError={()=>{if(current)setError('No se pudo reproducir este archivo; toca Actualizar.');}}/>
 </section>;
}
