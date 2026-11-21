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
 return <section className="hn-audio" aria-label="Audio HAVANA NICE" hidden={!active}>
  <div className="hn-audio-heading">
   <div><span>EL AUDIO DEL EQUIPO</span><h2>HAVANA NICE</h2></div>
   <button type="button" onClick={()=>void refresh()} aria-label="Actualizar biblioteca">Actualizar</button>
  </div>
  {!!error&&<p className="hn-audio-error" role="alert">{error}</p>}
  {loading?<p className="hn-audio-empty">Abriendo biblioteca…</p>:!current?
   <div className="hn-audio-empty"><strong>Tu música aparecerá aquí.</strong>
    <p>Administración añadirá los audios y sus portadas. Cada canción tendrá su propio reproductor.</p>
   </div>:<>
   <div className="hn-audio-player">
    <div className="hn-audio-art" style={cover?{backgroundImage:`linear-gradient(#081d1980,#081d19b0),url("${cover}")`}:undefined}>
     {cover?<img src={cover} alt={`Portada de ${current.title}`} decoding="async"/>:
      <span className="hn-audio-monogram">HN</span>}
    </div>
    <div className="hn-audio-details">
     <span className="hn-audio-label">AHORA SUENA</span>
     <h3>{current.title}</h3><p>{current.artist}</p>
    </div>
    <div className="hn-audio-seek">
     <input aria-label="Posición de reproducción" type="range" min={0} max={Math.max(1,duration)}
      step={1} value={Math.min(elapsed,Math.max(1,duration))}
      onChange={event=>{if(ref.current)ref.current.currentTime=Number(event.target.value);}}/>
     <div><time>{clock(elapsed)}</time><time>{clock(duration)}</time></div>
    </div>
    <div className="hn-audio-controls">
     <button type="button" onClick={()=>step(-1)} aria-label="Audio anterior">‹‹</button>
     <button type="button" onClick={()=>void toggle()} className="hn-audio-main"
      aria-label={playing?'Pausar':'Reproducir'}>{playing?'Ⅱ':'▶'}</button>
     <button type="button" onClick={()=>step(1)} aria-label="Audio siguiente">››</button>
    </div>
   </div>
   <div className="hn-audio-track-list" aria-label="Canciones disponibles">
    {tracks.map((track,i)=><button key={track.id} type="button"
     className={i===selected?'hn-audio-track selected':'hn-audio-track'}
     onClick={()=>{if(i!==selected){playOnChange.current=true;setSelected(i);}
      else void toggle();}}>
     {art(track.coverUrl)?<img alt="" src={art(track.coverUrl)!} loading="lazy"/>:
      <span className="hn-audio-track-fallback">♫</span>}
     <span><strong>{track.title}</strong><small>{track.artist}</small></span>
     <span aria-hidden="true">{i===selected&&playing?'Ⅱ':'▶'}</span>
    </button>)}
   </div>
  </>}
  <audio ref={ref} preload="metadata"
   onPlaying={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
   onTimeUpdate={event=>setElapsed(event.currentTarget.currentTime)}
   onDurationChange={event=>setDuration(event.currentTarget.duration||0)}
   onEnded={()=>step(1)}
   onError={()=>{if(current)setError('No se pudo reproducir el archivo; actualiza la biblioteca.');}}/>
 </section>;
}
