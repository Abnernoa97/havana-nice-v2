import {useCallback,useEffect,useRef,useState,type ChangeEvent} from 'react';
import {getAudioTracks,privateAudioUrl,uploadAudioTrack,uploadAudioCover,removeAudioTrack,
 type AudioTrack,AudioApiError} from '@havana/shared';
import {detectAudioTags,compactCover} from './audio-tags';
import './admin-audio.css';

export default function AdminAudio({token,onExpired}:{token:string;onExpired:()=>void}){
 const [items,setItems]=useState<AudioTrack[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [cover,setCover]=useState<Blob|null>(null);
 const [title,setTitle]=useState('');
 const [artist,setArtist]=useState('HAVANA NICE');
 const [album,setAlbum]=useState('HAVANA NICE');
 const [busy,setBusy]=useState(false);
 const [serverReady,setServerReady]=useState<boolean|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [preview,setPreview]=useState('');
 const [coverPreview,setCoverPreview]=useState('');
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  try{
   const tracks=await getAudioTracks(token,true);
   setItems(tracks);setServerReady(true);setError('');
  }catch(e){
   setServerReady(false);
   if(e instanceof AudioApiError&&e.status===401)onExpired();
   else if(e instanceof AudioApiError&&e.status===404)
    setError('El reproductor está instalado, pero la API de Audio aún no está publicada en Cloudflare. La subida se habilitará al actualizar el Worker.');
   else setError(e instanceof Error?e.message:'La conexión con Audio no está disponible.');
  }
 },[token,onExpired]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  if(!file){setPreview('');return;}
  const url=URL.createObjectURL(file);setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[file]);
 useEffect(()=>{
  if(!cover){setCoverPreview('');return;}
  const url=URL.createObjectURL(cover);setCoverPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[cover]);
 const choose=async(event:ChangeEvent<HTMLInputElement>)=>{
  const next=event.target.files?.[0]||null;event.target.value='';
  if(!next)return;
  setError('');setNotice('');setFile(next);setCover(null);
  setTitle(next.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '));
  setArtist('HAVANA NICE');setAlbum('HAVANA NICE');
  try{
   const tags=await detectAudioTags(next);
   setTitle(tags.title);setArtist(tags.artist);setAlbum(tags.album);
   if(tags.cover)setCover(await compactCover(tags.cover));
   else setNotice('Este audio no trae una portada ID3 compatible. Puedes elegir una foto abajo.');
  }catch{setNotice('El audio está seleccionado. Puedes agregar la portada manualmente.');}
 };
 const chooseCover=async(event:ChangeEvent<HTMLInputElement>)=>{
  const next=event.target.files?.[0];event.target.value='';if(!next)return;
  try{setCover(await compactCover(next));setError('');}
  catch(e){setError(e instanceof Error?e.message:'Portada inválida.');}
 };
 const save=async()=>{
  if(!file||!title.trim()||busy)return;
  if(serverReady!==true){setNotice('');setError('El servidor de Audio todavía no está disponible. Pulsa Actualizar para comprobarlo.');return;}
  setBusy(true);setNotice('Subiendo audio privado…');setError('');
  try{
   const id=await uploadAudioTrack(token,file,{
    title:title.trim(),artist:artist.trim()||'HAVANA NICE',album:album.trim()||'HAVANA NICE'
   });
   let coverSaved=true;
   if(cover){
    try{await uploadAudioCover(token,id,cover);}
    catch{coverSaved=false;}
   }
   setFile(null);setCover(null);setTitle('');setArtist('HAVANA NICE');setAlbum('HAVANA NICE');
   await refresh();
   setNotice(coverSaved?'Audio y portada disponibles para el equipo.':
    'Audio guardado. La portada no pudo subirse; puedes cambiarla en la lista.');
  }catch(e){setNotice('');setError(e instanceof Error?e.message:'No se pudo subir el audio.');}
  finally{setBusy(false);}
 };
 const remove=async(item:AudioTrack)=>{
  if(busy||!window.confirm('¿Eliminar definitivamente '+item.title+' de Audio HAVANA NICE?'))return;
  setBusy(true);setError('');
  try{await removeAudioTrack(token,item.id);await refresh();setNotice('Audio retirado del catálogo.');}
  catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar el audio.');}
  finally{setBusy(false);}
 };
 return <section className="hn-admin-audio">
  <div className="hn-admin-audio-top"><h2>Biblioteca de audio</h2></div>
  {serverReady===false&&<p className="hn-audio-server-warning" role="status">
   La biblioteca necesita la actualización del servidor. Puedes preparar el audio y su portada, pero Guardar y publicar estará deshabilitado hasta que la conexión funcione.
  </p>}
  {error&&<p role="alert" className="hn-audio-upload-error">{error}</p>}
  {notice&&<p role="status" className="hn-audio-upload-notice">{notice}</p>}
  <div className="hn-audio-upload">
   <label className="hn-audio-file-picker">+ Añadir audio
    <input type="file" accept=".mp3,.m4a,.aac,.wav,audio/mpeg,audio/mp4,audio/aac,audio/wav"
     onChange={event=>void choose(event)} disabled={busy}/>
   </label>
   {file&&<div className="hn-audio-upload-editor">
    <div className="hn-audio-upload-preview">
     {coverPreview?<img src={coverPreview} alt="Portada encontrada"/>:
      <div aria-label="Portada pendiente">♫</div>}
     <div><strong>{file.name}</strong><small>{(file.size/1e6).toFixed(1)} MB</small></div>
    </div>
    <audio controls preload="metadata" src={preview} aria-label="Escuchar audio antes de subir"/>
    <label>Nombre<input type="text" maxLength={120} value={title}
     onChange={event=>setTitle(event.target.value)}/></label>
    <label>Artista<input type="text" maxLength={100} value={artist}
     onChange={event=>setArtist(event.target.value)}/></label>
    <label>Álbum<input type="text" maxLength={100} value={album}
     onChange={event=>setAlbum(event.target.value)}/></label>
    <label className="hn-audio-cover-picker">Cambiar / agregar portada
     <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void chooseCover(event)} disabled={busy}/>
    </label>
    <div className="hn-admin-audio-actions">
     <button type="button" disabled={busy||!title.trim()||serverReady!==true} onClick={()=>void save()}>
      {busy?'Guardando…':'Guardar y publicar'}</button>
     <button type="button" disabled={busy} onClick={()=>{setFile(null);setCover(null);}}>Cancelar</button>
    </div>
   </div>}
  </div>
  <div className="hn-audio-admin-list">
   {items.length===0?<p className="a-detail">Todavía no hay archivos de audio publicados.</p>:
    items.map(item=><article key={item.id} className="hn-audio-admin-row">
     {privateAudioUrl(item.coverUrl)?<img src={privateAudioUrl(item.coverUrl)!} alt="" loading="lazy"/>:
      <span>♫</span>}
     <div><strong>{item.title}</strong><small>{item.artist} · {(item.sizeBytes/1e6).toFixed(1)} MB</small></div>
     <label className="hn-audio-inline-cover">Portada
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
       onChange={event=>{
        const selected=event.target.files?.[0];event.target.value='';
        if(!selected)return;
        setBusy(true);setError('');
        void compactCover(selected).then(blob=>uploadAudioCover(token,item.id,blob))
         .then(()=>refresh()).then(()=>setNotice('Portada actualizada.'))
         .catch(e=>setError(e instanceof Error?e.message:'No se pudo cambiar la portada.'))
         .finally(()=>setBusy(false));
       }}/>
     </label>
     <button type="button" onClick={()=>void remove(item)} disabled={busy}>Borrar</button>
    </article>)}
  </div>
 </section>;
}
